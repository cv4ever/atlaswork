// Source file names that one checkout can't tell apart: two files whose paths differ only in case or extension
// (`widgets.ts` beside `Widgets.tsx`). On Windows and macOS they share a name, so an import of one resolves to the other
// and the type-check fails far from the cause (2026-11-21). Usage: node scripts/check-files.mjs (`pnpm run lint` runs it).
import { execFileSync } from "node:child_process";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src", "dev", "supabase", "scripts"], { encoding: "utf8" })
  .split("\n").filter((file) => /\.(ts|tsx|mjs|js)$/.test(file));
const byName = new Map();
for (const file of files) {
  const name = file.replace(/\.(ts|tsx|mjs|js)$/, "").toLowerCase();
  byName.set(name, [...byName.get(name) ?? [], file]);
}
const clashes = [...byName.values()].filter((group) => group.length > 1);
if (clashes.length) {
  console.error(`Source files that differ only in case or extension; rename one of each:\n  ${clashes.map((group) => group.join("  ")).join("\n  ")}`);
  process.exit(1);
}
