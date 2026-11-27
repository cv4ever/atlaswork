// Points every import of some exports at the module they moved to: after you move `formatDate` from model.ts to
// dates.ts, `node scripts/move-exports.mjs src/model.ts src/dates.ts formatDate,addDays` rewrites each
// `import { formatDate, … } from "./model.ts"` (and `export { … } from`) in src/, dev/, supabase/ and scripts/ into one
// import from each module, keeping `import type`, aliases and the importer's extension style. It moves no code: move the
// declarations first (by hand, or with split-module.mjs). Run the type-check after; it names anything missed.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import ts from "typescript";

const [from, to, list] = process.argv.slice(2);
if (!from || !to || !list) {
  console.error("Usage: node scripts/move-exports.mjs <from module> <to module> <name,name,…>");
  process.exit(1);
}
const moved = new Set(list.split(","));
const bare = (path) => resolve(path).replace(/\.tsx?$/, "");
const fromPath = bare(from), toPath = resolve(to);
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.ts", "*.tsx", "*.mjs"], { encoding: "utf8" })
  .split("\n").filter((file) => file && existsSync(file) && resolve(file) !== toPath);

let touched = 0;
for (const file of files) {
  let text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const edits = [];
  for (const statement of source.statements) {
    const isImport = ts.isImportDeclaration(statement);
    if (!isImport && !(ts.isExportDeclaration(statement) && statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    if (!specifier.startsWith(".") || bare(resolve(dirname(file), specifier)) !== fromPath) continue;
    const named = isImport ? statement.importClause?.namedBindings : statement.exportClause;
    if (!named || !(ts.isNamedImports(named) || ts.isNamedExports(named))) continue;
    const going = named.elements.filter((element) => moved.has((element.propertyName ?? element.name).text));
    if (!going.length) continue;
    const staying = named.elements.filter((element) => !going.includes(element));
    const keyword = isImport ? "import" : "export";
    const typeOnly = isImport ? statement.importClause.isTypeOnly : statement.isTypeOnly;
    const quote = statement.moduleSpecifier.getText(source)[0];
    let target = relative(dirname(file), toPath.replace(/\.tsx?$/, "")).replaceAll("\\", "/") + (/\.tsx?$/.test(specifier) ? extname(toPath) : "");
    if (!target.startsWith(".")) target = `./${target}`;
    const list = (elements) => `{ ${elements.map((element) => element.getText(source)).join(", ")} }`;
    const lead = `${keyword} ${typeOnly ? "type " : ""}`;
    const defaultName = isImport ? statement.importClause.name?.text : undefined;
    const lines = [];
    if (staying.length || defaultName)
      lines.push(`${lead}${defaultName ? defaultName + (staying.length ? ", " : " ") : ""}${staying.length ? `${list(staying)} ` : ""}from ${statement.moduleSpecifier.getText(source)};`);
    lines.push(`${lead}${list(going)} from ${quote}${target}${quote};`);
    edits.push([statement.getStart(source), statement.end, lines.join("\n")]);
  }
  if (!edits.length) continue;
  for (const [start, end, replacement] of edits.sort((a, b) => b[0] - a[0])) text = text.slice(0, start) + replacement + text.slice(end);
  writeFileSync(file, text);
  touched++;
  console.log(`rewrote ${file}`);
}
console.log(`${touched} files rewritten`);
