import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { strToU8, zipSync } from "npm:fflate@0.8.2";
import { openIndex, systemFolders, within } from "./search.ts";
import type { FileLike, PdfText } from "../../src/fileTools.ts";

/** A PDF reader that answers from the file's name and counts what it opened. */
function pdfReader() {
  const opened: string[] = [];
  const read = (file: FileLike): Promise<PdfText> => {
    opened.push(file.name);
    return Promise.resolve({ text: file.name === "policy.pdf" ? "Home insurance renews on 1 March." : "", pages: 1, read: 1 });
  };
  return { opened, read };
}

async function fixture() {
  const root = await Deno.makeTempDir();
  const taxes = `${root}\\Taxes`;
  for (const dir of ["", "\\Insurance", "\\.hidden", "\\node_modules", "\\Skip"]) await Deno.mkdir(`${taxes}${dir}`, { recursive: true });
  await Deno.writeTextFile(`${taxes}\\notes.md`, "Receipts are in the cerulean box.");
  await Deno.writeFile(`${taxes}\\carta.docx`, zipSync({
    "word/document.xml": strToU8("<w:document><w:body><w:p><w:r><w:t>Crédito habitação:</w:t></w:r><w:r><w:tab/><w:t>a prestação sobe &amp; muito</w:t></w:r></w:p></w:body></w:document>"),
  }));
  await Deno.writeFile(`${taxes}\\contas.xlsx`, zipSync({
    "xl/workbook.xml": strToU8('<workbook><sheets><sheet name="Contas 2025" sheetId="1"/></sheets></workbook>'),
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Seguro da casa</t></si><si><t xml:space=\"preserve\">Água </t></si></sst>"),
  }));
  await Deno.writeTextFile(`${taxes}\\Insurance\\policy.pdf`, "%PDF");
  await Deno.writeTextFile(`${taxes}\\big.txt`, `budget ${"x".repeat(1_100_000)}`);
  await Deno.writeTextFile(`${taxes}\\.hidden\\secret.md`, "hidden words");
  await Deno.writeTextFile(`${taxes}\\node_modules\\dep.md`, "dependency words");
  await Deno.writeTextFile(`${taxes}\\Skip\\settings.md`, "app settings words");
  const dir = await Deno.makeTempDir();
  return { root, taxes, dir, list: [{ name: "Taxes", path: taxes }], skip: [`${taxes}\\Skip`] };
}

/** The files whose name or text matches `query`, as paths within their folder. */
function find(dir: string, query: string) {
  const db = new DatabaseSync(`${dir}/index.sqlite`);
  try {
    return (db.prepare("select rel from files join words on words.rowid = files.id where words match ? order by rel").all(query) as { rel: string }[])
      .map((row) => row.rel);
  } finally { db.close(); }
}

Deno.test("the index keeps a search list's names and the text of its documents, and never enters hidden, dependency or system folders (D78)", async () => {
  const { root, dir, list, skip } = await fixture();
  const index = openIndex(dir);
  try {
    const pdf = pdfReader();
    const status = await index.refresh(list, pdf.read, skip);
    assert.deepEqual({ files: status.files, texts: status.texts, reading: status.reading }, { files: 5, texts: 4, reading: false },
      "five files found; the large text file by its name only");
    assert.deepEqual(find(dir, "habitacao"), ["carta.docx"], "a Word document's text, found without its accents");
    assert.deepEqual(find(dir, "seguro"), ["contas.xlsx"], "a workbook's words");
    assert.deepEqual(find(dir, "contas 2025"), ["contas.xlsx"], "and its sheets' names");
    assert.deepEqual(find(dir, "renews"), ["Insurance/policy.pdf"], "a PDF's text");
    assert.deepEqual(find(dir, "cerulean box"), ["notes.md"], "a text file's");
    assert.deepEqual(find(dir, "big"), ["big.txt"], "a large file by its name");
    assert.deepEqual(find(dir, "budget"), [], "but not its text");
    for (const word of ["hidden", "dependency", "settings"]) assert.deepEqual(find(dir, word), [], `nothing from a ${word} folder`);
    assert.deepEqual(JSON.parse(await Deno.readTextFile(`${dir}/status.json`)).files, 5, "and it says how much it holds");
  } finally {
    index.close();
    await Deno.remove(root, { recursive: true });
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("a refresh reads only new and changed files and forgets gone ones; a folder off the list goes, and with none the index file goes (D78)", async () => {
  const { root, taxes, dir, list, skip } = await fixture();
  const index = openIndex(dir);
  try {
    const pdf = pdfReader();
    await index.refresh(list, pdf.read, skip);
    await index.refresh(list, pdf.read, skip);
    assert.deepEqual(pdf.opened, ["policy.pdf"], "an unchanged PDF isn't opened again");
    await Deno.writeTextFile(`${taxes}\\notes.md`, "Receipts moved to the green folder in March.");
    await Deno.remove(`${taxes}\\big.txt`);
    const status = await index.refresh(list, pdf.read, skip);
    assert.deepEqual(find(dir, "green"), ["notes.md"], "a changed file is read again");
    assert.deepEqual(find(dir, "cerulean"), [], "without its old words");
    const disk = new TextDecoder("latin1").decode(await Deno.readFile(`${dir}/index.sqlite`));
    assert.ok(disk.includes("green") && !disk.includes("cerulean"), "which leave the file on disk too, not only the search");
    assert.deepEqual(find(dir, "big"), [], "and a gone file is forgotten");
    assert.equal(status.files, 4);

    const away = await index.refresh([...list, { name: "USB", path: `${root}\\Unplugged` }], pdf.read, skip);
    assert.equal(away.files, 4, "a listed folder that can't be read adds nothing and takes nothing away");
    await Deno.rename(taxes, `${root}\\Moved`);
    assert.equal((await index.refresh(list, pdf.read, skip)).files, 4, "nor does one that was moved, until it's taken off the list");

    const other = `${root}\\Family`;
    await Deno.mkdir(other);
    await Deno.writeTextFile(`${other}\\birthdays.md`, "Ana on 3 May.");
    const swapped = await index.refresh([{ name: "Family", path: other }], pdf.read, skip);
    assert.equal(swapped.files, 1, "a folder taken off the list leaves the index");
    assert.deepEqual(find(dir, "receipts"), []);

    const off = await index.refresh([], pdf.read, skip);
    assert.deepEqual(off, { files: 0, texts: 0, reading: false }, "with nothing to search it holds nothing");
    assert.equal(await Deno.stat(`${dir}/index.sqlite`).then(() => true, () => false), false, "and its file is gone");
  } finally {
    index.close();
    await Deno.remove(root, { recursive: true });
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("system folders are Windows', programs' and the profile's AppData, compared as Windows compares paths", () => {
  const env: Record<string, string> = { windir: "C:\\Windows", ProgramFiles: "C:\\Program Files", USERPROFILE: "C:\\Users\\Ana" };
  const system = systemFolders((name) => env[name]);
  assert.deepEqual(system, ["C:\\Windows", "C:\\Program Files", "C:\\Users\\Ana\\AppData"]);
  assert.ok(within("c:\\users\\ana\\appdata\\Local\\Google", system[2]), "inside, whatever the case");
  assert.ok(!within("C:\\Users\\Ana\\AppDataBackup", system[2]), "a name that only starts the same is outside");
});

Deno.test("a search finds names and words, best first, prefixes too, falls back to any word, and stays in the listed folders (D78)", async () => {
  const { root, taxes, dir, list, skip } = await fixture();
  await Deno.writeTextFile(`${taxes}\\seguro-carro.md`, "Notes for later.");
  const index = openIndex(dir);
  try {
    await index.refresh(list, pdfReader().read, skip);
    const paths = (query: string, folders = list) => index.find(query, folders).found.map((hit) => hit.path);
    assert.deepEqual(paths("habitacao prestacao"), ["Taxes/carta.docx"], "every word, without accents");
    assert.match(index.find("habitacao", list).found[0].line, /Crédito habitação/, "with a line around it");
    assert.deepEqual(paths("renew"), ["Taxes/Insurance/policy.pdf"], "a word finds longer ones it starts");
    assert.deepEqual(paths("seguro"), ["Taxes/seguro-carro.md", "Taxes/contas.xlsx"], "a name counts more than a document's words");
    assert.equal(index.find("big", list).found[0].line, "", "a match in the name alone has no line");
    const some = index.find("cerulean zebra", list);
    assert.deepEqual([some.all, some.found.map((hit) => hit.path)], [false, ["Taxes/notes.md"]], "no file with both words: those with either");
    assert.match(some.found[0].changed, /^\d{4}-\d{2}-\d{2}$/);
    assert.deepEqual(paths("cerulean", [{ name: "Taxes", path: `${root}\\Elsewhere` }]), [], "nothing from a folder off the list");
    assert.deepEqual(paths("\"); drop table files; -- NEAR OR *"), [], "a query is only words to the index");
    assert.deepEqual(paths("cerulean"), ["Taxes/notes.md"], "which still answers");
  } finally {
    index.close();
    await Deno.remove(root, { recursive: true });
    await Deno.remove(dir, { recursive: true });
  }
});
