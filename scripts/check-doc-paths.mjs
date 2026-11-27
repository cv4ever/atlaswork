// Docs point at code that is still there, so a split or a rename can't leave them naming a file that's gone or a
// symbol that moved. Two checks over every tracked Markdown file:
// - a path in backticks (`src/…`, `scripts/…`, `dev/…`, `supabase/…`, `docs/…` with a file extension) exists;
// - "`name` in `file`" (`celebrate` in `PageGrid.tsx`, `.task-meta` in `src/pageGrid/TaskRows.tsx`) names a file that
//   exists, by path or by its file name alone, and that file still contains the name.
// Run it with `--list` to print what it checked. Runs in `lint`. Stale references found by hand on 2026-11-21 are why.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((file) => file && existsSync(file));
const docs = tracked.filter((file) => file.endsWith(".md"));
const byName = new Map();
for (const file of tracked) byName.set(basename(file), [...byName.get(basename(file)) ?? [], file]);
const text = new Map();
const read = (file) => text.get(file) ?? text.set(file, readFileSync(file, "utf8")).get(file);

const code = String.raw`[\w./-]+\.(?:ts|tsx|mjs|js|css|sql)`;
const path = new RegExp(String.raw`\`((?:src|scripts|dev|supabase|docs)/[\w./-]+\.(?:ts|tsx|mjs|js|css|sql|json|md))(?::\d+)?\``, "g");
// A name, then "in" and at most two words ("in the agent function's"), then a code file.
const symbolIn = new RegExp(String.raw`\`([.#]?[A-Za-z_$][\w$-]*)\` in (?:[\w']+ ){0,3}?\`(${code})\``, "g");

const problems = [];
let checked = 0;
for (const doc of docs) {
  read(doc).split(/\r?\n/).forEach((line, index) => {
    const at = `${doc}:${index + 1}`;
    for (const [, file] of line.matchAll(path)) {
      checked++;
      if (!existsSync(file)) problems.push(`${at} names ${file}, which doesn't exist`);
    }
    for (const [, name, file] of line.matchAll(symbolIn)) {
      checked++;
      const files = file.includes("/") ? [file, `src/${file}`].filter((item) => existsSync(item)) : byName.get(basename(file)) ?? [];
      if (!files.length) problems.push(`${at} names ${file}, which doesn't exist`);
      else if (!files.some((item) => read(item).includes(name.replace(/^[.#]/, "")))) problems.push(`${at} says \`${name}\` is in ${file}, which no longer has it`);
    }
  });
}
if (process.argv.includes("--list")) console.log(`${checked} references in ${docs.length} Markdown files`);
if (problems.length) {
  console.error(`Docs point at code that moved; name where it lives now:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
