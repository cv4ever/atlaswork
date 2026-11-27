// Markdown keeps one sentence per line, so an edit touches one sentence and a diff shows which one changed. A line
// over `max` characters outside code fences is a paragraph written on one line. Usage: node scripts/check-doc-lines.mjs
// [file.md…] (default: every tracked Markdown file). The pre-commit hook passes the staged ones.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const max = 1000;
const files = process.argv.length > 2 ? process.argv.slice(2)
  : execFileSync("git", ["ls-files", "*.md"], { encoding: "utf8" }).split("\n").filter(Boolean);
const long = [];
for (const file of files.filter((name) => existsSync(name))) {
  let fenced = false;
  readFileSync(file, "utf8").split(/\r?\n/).forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    else if (!fenced && line.length > max) long.push(`${file}:${index + 1} (${line.length} characters)`);
  });
}
if (long.length) {
  console.error(`Markdown lines over ${max} characters; put one sentence per line:\n  ${long.join("\n  ")}`);
  process.exit(1);
}
