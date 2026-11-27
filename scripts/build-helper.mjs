// Compiles the desktop app's helper (desktop/helper, agents-design D77) into the sidecar Tauri bundles beside the app:
// `pnpm run desktop:helper`, which `pnpm run desktop:build` runs first. The helper may read files, reach only the
// hosted project (and a local stack, for debug builds) and write only in the working folder the app starts it in, where
// it keeps the search index (agents-design D78); it can't start programs.
// Deno embeds whole npm packages, so this leaves out what the helper never loads: pdf.js's other builds, viewer,
// fonts and source maps (it reads text only, without fonts), and the native canvas pdf.js tries for drawing (it
// draws nothing; without it pdf.js warns once and reads text as before). That takes the program from 187 MB to 113.
// Usage: node scripts/build-helper.mjs [entry output], the defaults being the helper and its sidecar path.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const [entry = "desktop/helper/main.ts", output = "desktop/src-tauri/binaries/atlaswork-helper-x86_64-pc-windows-msvc.exe"] = process.argv.slice(2);
const hosts = ["mcihsugblojunfpuohim.supabase.co", "127.0.0.1:54321"];

const registry = join(JSON.parse(execFileSync("deno", ["info", "--json"], { encoding: "utf8" })).npmCache, "registry.npmjs.org");
const versions = (dir) => existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((item) => item.isDirectory()).map((item) => join(dir, item.name)) : [];
const canvas = existsSync(join(registry, "@napi-rs"))
  ? readdirSync(join(registry, "@napi-rs")).filter((name) => name.startsWith("canvas")).flatMap((name) => versions(join(registry, "@napi-rs", name))) : [];
const pdfjs = versions(join(registry, "pdfjs-dist")).flatMap((root) => [
  ...["build", "web", "image_decoders", "cmaps", "standard_fonts", "wasm", "iccs", "types", "legacy/web", "legacy/image_decoders"].map((dir) => join(root, dir)),
  ...versions(join(root, "legacy")).length ? readdirSync(join(root, "legacy", "build"))
    .filter((file) => !["pdf.mjs", "pdf.worker.mjs"].includes(file)).map((file) => join(root, "legacy", "build", file)) : [],
]);

execFileSync("deno", ["compile", "--config", "desktop/helper/deno.json", "--no-prompt", "--exclude-unused-npm",
  ...[...canvas, ...pdfjs].filter(existsSync).flatMap((path) => ["--exclude", path]),
  "--allow-read", "--allow-write=.", "--allow-env", `--allow-net=${hosts.join(",")}`, "--output", output, entry], { stdio: "inherit" });
