// The helper's search index (agents-design D78): the names of the files in this computer's search list and the text
// of its documents, in `index.sqlite` in the helper's working folder, the only folder it may write in. SQLite's
// full-text search over them ignores case and accents ("habitacao" finds "habitação"). A refresh drops the folders
// no longer listed, reads files that are new or changed since the last (by size and change time) and forgets the gone
// ones; with nothing listed, which is how search goes off, the index file goes, so no document text stays behind, and
// whatever leaves the index meanwhile is overwritten on disk (`secure_delete`). Beside it, `status.json` says how much it
// holds, for Settings → Account → Computers. Nothing here leaves the computer.
import { DatabaseSync } from "node:sqlite";
import { strFromU8, unzipSync } from "npm:fflate@0.8.2";
import { documentBytes, skipped, textTypes, typeOf } from "../../src/fileTools.ts";
import type { FileLike, PdfText } from "../../src/fileTools.ts";
import { fileOnDisk } from "./disk.ts";

/** A folder on this computer's search list: the name a match's path starts with, and where it is. */
export type SearchFolder = { name: string; path: string };
/** How much the index holds: files found, how many with their text, whether a refresh is reading, and when one ended. */
export type IndexStatus = { files: number; texts: number; reading: boolean; at?: string; full?: true };
/** One file a search found: its folder's name, its path as the model reads it (starting with that name), when it changed, and a line. */
export type Found = { folder: string; path: string; changed: string; line: string };
/** What a search found: the files, best first; whether they hold all its words or only some; and how far the index got. */
export type Search = { found: Found[]; all: boolean; files: number; reading: boolean };
type Pdf = (file: FileLike) => Promise<PdfText>;

/** The largest text file read for its text; larger ones, and documents past `documentBytes`, are found by their names. */
const textBytes = 1_000_000;
/** How many files one search returns at most. */
const mostFound = 20;
/** How much of one file's text is kept, how many files the index holds at most, and how deep a walk goes. */
const keptChars = 100_000, mostFiles = 200_000, deepest = 20;

/** Whether `inner` is `outer` or inside it, as Windows compares paths, without case. */
export function within(inner: string, outer: string) {
  const [a, b] = [inner, outer].map((path) => path.replace(/[\\/]+$/, "").toLowerCase());
  return a === b || a.startsWith(`${b}\\`);
}

/** Windows', programs' and apps' own folders, where settings and sign-ins live: a walk never enters them. */
export function systemFolders(env: (name: string) => string | undefined = (name) => Deno.env.get(name)): string[] {
  const profile = env("USERPROFILE");
  return [env("windir"), env("ProgramFiles"), env("ProgramFiles(x86)"), env("ProgramData"), profile && `${profile}\\AppData`]
    .filter((path): path is string => !!path);
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
const plain = (xml: string) => xml.replace(/<[^>]+>/g, "").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, name: string) =>
  name[0] === "#" ? String.fromCodePoint(parseInt(name.slice(name[1] === "x" || name[1] === "X" ? 2 : 1), name[1] === "x" || name[1] === "X" ? 16 : 10)) : entities[name] ?? whole);

/** A Word document's paragraphs, or a workbook's sheet names and words, from the XML inside the file. */
export function officeText(bytes: Uint8Array, type: "docx" | "xlsx"): string {
  const wanted = type === "docx" ? (name: string) => name === "word/document.xml"
    : (name: string) => name === "xl/sharedStrings.xml" || name === "xl/workbook.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(name);
  // Unpacked sizes are bounded, so a file that inflates to gigabytes is found by name only.
  const parts = unzipSync(bytes, { filter: (file) => wanted(file.name) && file.originalSize <= 50_000_000 });
  const xml = (name: string) => parts[name] ? strFromU8(parts[name]) : "";
  if (type === "docx") return plain(xml("word/document.xml").replace(/<w:tab\/>/g, " ").replace(/<\/w:p>/g, "\n")).trim();
  const sheets = [...xml("xl/workbook.xml").matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((match) => plain(match[1]));
  const cells = Object.keys(parts).filter((name) => name !== "xl/workbook.xml").sort()
    .flatMap((name) => [...xml(name).matchAll(/<t(?: [^>]*)?>([^<]*)<\/t>/g)].map((match) => plain(match[1])));
  return [...sheets, ...cells].filter(Boolean).join("\n");
}

/** The text the index keeps of a file, cut to `keptChars`; empty for one found by its name only. */
async function textOf(path: string, name: string, size: number, pdf: Pdf): Promise<string> {
  const type = typeOf(name);
  try {
    let text = "";
    if (textTypes.has(type) && size <= textBytes) {
      const bytes = await Deno.readFile(path);
      // A NUL byte early on means it isn't text after all.
      if (!bytes.subarray(0, 8_000).includes(0)) text = new TextDecoder().decode(bytes);
    } else if (type === "pdf" && size <= documentBytes) text = (await pdf(await fileOnDisk(path, name))).text;
    else if ((type === "docx" || type === "xlsx") && size <= documentBytes) text = officeText(await Deno.readFile(path), type);
    return text.trim().slice(0, keptChars);
  } catch {
    // Locked, damaged or gone meanwhile: found by its name until it can be read.
    return "";
  }
}

/** Every file under `root` as its path and its path within the folder, skipping hidden entries, links and `skip`. */
async function* filesIn(root: string, skip: string[], rel = "", depth = 0): AsyncGenerator<{ path: string; rel: string }> {
  const folder = rel ? `${root}\\${rel.replaceAll("/", "\\")}` : root;
  for await (const entry of Deno.readDir(folder)) {
    if (entry.name.startsWith(".") || skipped.has(entry.name) || entry.isSymlink) continue;
    const path = `${folder.replace(/[\\/]+$/, "")}\\${entry.name}`, inner = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isFile) yield { path, rel: inner };
    else if (entry.isDirectory && depth < deepest && !skip.some((system) => within(path, system))) {
      // A folder it may not open is left out; the rest is still read.
      try { yield* filesIn(root, skip, inner, depth + 1); } catch { /* left out */ }
    }
  }
}

/** The index in `dir` (the helper's working folder), opened when a refresh first needs it. */
export function openIndex(dir = ".") {
  const file = `${dir}/index.sqlite`;
  let db: DatabaseSync | undefined;
  let at: string | undefined, reading = false;
  const open = () => {
    if (db) return db;
    db = new DatabaseSync(file);
    // Deleted rows are overwritten (`secure_delete`), and their words leave the full-text index at once ('secure-delete')
    // rather than when its segments next merge.
    db.exec(`pragma secure_delete = on;
      create table if not exists files (id integer primary key, path text not null unique, folder text not null, rel text not null,
        size integer not null, modified integer not null, has_text integer not null);
      create virtual table if not exists words using fts5(name, text, tokenize = 'unicode61 remove_diacritics 2');
      insert into words (words, rank) values ('secure-delete', 1);`);
    return db;
  };
  const counts = (): Pick<IndexStatus, "files" | "texts"> => {
    if (!db) return { files: 0, texts: 0 };
    const row = db.prepare("select count(*) as files, coalesce(sum(has_text), 0) as texts from files").get() as { files: number; texts: number };
    return { files: Number(row.files), texts: Number(row.texts) };
  };
  const status = async (next: IndexStatus) => { await Deno.writeTextFile(`${dir}/status.json`, JSON.stringify(next)).catch(() => undefined); return next; };
  const close = () => { db?.close(); db = undefined; };

  /** Brings the index in line with `folders`, reading PDFs with `pdf` and never entering `skip`; returns what it holds. */
  async function refresh(folders: SearchFolder[], pdf: Pdf, skip: string[] = systemFolders()): Promise<IndexStatus> {
    if (!folders.length) {
      close();
      for (const part of ["", "-journal"]) await Deno.remove(`${file}${part}`).catch(() => undefined);
      at = undefined;
      return await status({ files: 0, texts: 0, reading: false });
    }
    const db = open();
    const listed = folders.map((folder) => folder.path);
    const unword = db.prepare("delete from words where rowid = ?");
    const unfile = db.prepare("delete from files where id = ?");
    const dropped = db.prepare(`select id from files where folder not in (${listed.map(() => "?").join(", ")})`).all(...listed) as { id: number }[];
    if (dropped.length) {
      db.exec("begin");
      for (const { id } of dropped) { unword.run(id); unfile.run(id); }
      db.exec("commit");
    }
    const known = db.prepare("select id, size, modified from files where folder = ? and path = ?");
    const changed = db.prepare("update files set size = ?, modified = ?, has_text = ? where id = ?");
    const added = db.prepare("insert into files (folder, path, rel, size, modified, has_text) values (?, ?, ?, ?, ?, ?)");
    const word = db.prepare("insert into words (rowid, name, text) values (?, ?, ?)");
    let walked = 0, written = 0, full = false;
    reading = true;
    await status({ ...counts(), reading: true, ...at && { at } });
    for (const folder of folders) {
      const seen = new Set<string>();
      let whole = true;
      db.exec("begin");
      try {
        for await (const { path, rel } of filesIn(folder.path, skip)) {
          if (++walked > mostFiles) { full = true; whole = false; break; }
          const info = await Deno.stat(path).catch(() => null);
          if (!info?.isFile) continue;
          seen.add(path);
          const size = info.size, modified = info.mtime?.getTime() ?? 0;
          const row = known.get(folder.path, path) as { id: number; size: number; modified: number } | undefined;
          if (row && Number(row.size) === size && Number(row.modified) === modified) continue;
          const text = await textOf(path, rel.split("/").at(-1)!, size, pdf);
          let id: number;
          if (row) {
            id = Number(row.id);
            changed.run(size, modified, text ? 1 : 0, id);
            unword.run(id);
          } else id = Number(added.run(folder.path, path, rel, size, modified, text ? 1 : 0).lastInsertRowid);
          word.run(id, rel, text);
          // Every so often the work so far is kept and the helper's other work gets a turn.
          if (++written % 100 === 0) {
            db.exec("commit");
            await status({ ...counts(), reading: true, ...at && { at } });
            await new Promise((resolve) => setTimeout(resolve, 0));
            db.exec("begin");
          }
        }
      } catch {
        // The folder itself couldn't be read (moved, or a drive that isn't plugged in): what it held stays for now.
        whole = false;
      }
      if (whole) {
        const gone = (db.prepare("select id, path from files where folder = ?").all(folder.path) as { id: number; path: string }[])
          .filter((row) => !seen.has(row.path));
        for (const { id } of gone) { unword.run(id); unfile.run(id); }
      }
      db.exec("commit");
      if (full) break;
    }
    at = new Date().toISOString();
    reading = false;
    return await status({ ...counts(), reading: false, at, ...full && { full } });
  }

  /**
   * The files in `folders` whose names or documents hold the words of `query`, best first, names counting most: those
   * with every word, else those with any. Each word also finds longer ones it starts ("renew" finds "renewal").
   */
  function find(query: string, folders: SearchFolder[]): Search {
    const words = [...new Set(query.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [])].filter((word) => word.length > 1).slice(0, 8);
    const none = { found: [], all: true, ...counts(), reading };
    if (!words.length || !folders.length) return none;
    const db = open();
    const named = new Map(folders.map((folder) => [folder.path, folder.name]));
    const select = db.prepare(`select files.folder, files.rel, files.modified, snippet(words, -1, '', '', '…', 14) as line
      from words join files on files.id = words.rowid where words match ? and files.folder in (${folders.map(() => "?").join(", ")})
      order by bm25(words, 4.0, 1.0) limit ${mostFound}`);
    const terms = words.map((word) => `"${word}"*`);
    for (const all of [true, false]) {
      const rows = select.all(terms.join(all ? " " : " OR "), ...named.keys()) as { folder: string; rel: string; modified: number; line: string }[];
      if (!rows.length && all && terms.length > 1) continue;
      return {
        found: rows.map((row) => {
          const line = row.line.replace(/\s+/g, " ").trim().slice(0, 200);
          // A match in the name alone has no line of its own.
          return { folder: named.get(row.folder)!, path: `${named.get(row.folder)}/${row.rel}`, changed: new Date(Number(row.modified)).toISOString().slice(0, 10),
            line: row.rel.includes(line.replace(/…/g, "").trim()) ? "" : line };
        }), all, ...counts(), reading,
      };
    }
    return none;
  }

  return { refresh, find, close, file };
}
