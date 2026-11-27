// A folder on this computer as the file tools walk it (src/fileTools.ts `DirectoryHandle`), for the desktop app's
// helper (agents-design D77). A file opens lazily: its size and change time come from the file system, and only what a
// tool reads is read, so a large log in a linked folder costs nothing until a search or a read asks for its text.
import type { DirectoryHandle, FileLike } from "../../src/fileTools.ts";

const join = (folder: string, name: string) => `${folder.replace(/[\\/]+$/, "")}\\${name}`;

/** The first `end` bytes of the file at `path` (all of it without `end`), from `start`. */
async function bytesOf(path: string, start = 0, end?: number) {
  if (start === 0 && end === undefined) return await Deno.readFile(path);
  const file = await Deno.open(path, { read: true });
  try {
    await file.seek(start, Deno.SeekMode.Start);
    const wanted = Math.max(0, (end ?? Number.MAX_SAFE_INTEGER) - start);
    const chunks: Uint8Array[] = [];
    let got = 0;
    while (got < wanted) {
      const buffer = new Uint8Array(Math.min(65_536, wanted - got));
      const read = await file.read(buffer);
      if (read === null) break;
      chunks.push(buffer.subarray(0, read));
      got += read;
    }
    const out = new Uint8Array(got);
    let at = 0;
    for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
    return out;
  } finally {
    file.close();
  }
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** The file at `path` as the tools read it. */
export async function fileOnDisk(path: string, name: string): Promise<FileLike> {
  const info = await Deno.stat(path);
  if (!info.isFile) throw new Error("not a file");
  return {
    name, size: info.size, lastModified: info.mtime?.getTime() ?? 0,
    text: async () => decode(await bytesOf(path)),
    arrayBuffer: async () => (await bytesOf(path)).slice().buffer,
    slice: (start = 0, end) => ({ text: async () => decode(await bytesOf(path, start, end)) }),
  };
}

/** The folder at `path` as the tools walk it, named `name` (the name its paths start with). */
export function folderOnDisk(path: string, name: string): DirectoryHandle {
  return {
    kind: "directory", name,
    async *values() {
      for await (const entry of Deno.readDir(path)) {
        // Links can point outside the folder; the tools follow only real files and folders inside it.
        if (entry.isSymlink) continue;
        if (entry.isDirectory) yield folderOnDisk(join(path, entry.name), entry.name);
        else if (entry.isFile) yield { kind: "file", name: entry.name };
      }
    },
    getDirectoryHandle: async (child: string) => {
      if (child === "." || child === ".." || /[\\/]/.test(child)) throw new Error("not a folder");
      if (!(await Deno.lstat(join(path, child))).isDirectory) throw new Error("not a folder");
      return folderOnDisk(join(path, child), child);
    },
    getFileHandle: async (child: string) => {
      if (child === "." || child === ".." || /[\\/]/.test(child)) throw new Error("not a file");
      return { getFile: () => fileOnDisk(join(path, child), child) };
    },
  };
}
