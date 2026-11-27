// Every repo file the Supabase functions load (each function's index.ts and all it imports, src/ modules included), one
// path per line, from `deno info`. The pre-commit hook runs the functions' Deno tests when a staged file is among them.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const files = new Set();
for (const name of readdirSync("supabase/functions", { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
  const info = JSON.parse(execFileSync("deno", ["info", "--json", `supabase/functions/${name}/index.ts`], { encoding: "utf8", maxBuffer: 64 << 20 }));
  for (const module of info.modules ?? []) if (module.specifier?.startsWith("file:")) files.add(relative(process.cwd(), fileURLToPath(module.specifier)).replaceAll("\\", "/"));
}
console.log([...files].sort().join("\n"));
