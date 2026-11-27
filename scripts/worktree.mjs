// A session's own worktree, made and removed in one command (AGENTS.md, "Parallel sessions").
//   node scripts/worktree.mjs add <topic>     ../workbench-prototype-<topic> on a new branch <topic> from main, with
//                                             .env.local copied, packages installed and a free port for its Vite
//   node scripts/worktree.mjs remove <topic>  deletes that folder (pnpm's node_modules links defeat
//                                             `git worktree remove` on Windows), prunes it and deletes the branch,
//                                             refusing while it has uncommitted changes or the branch isn't merged
// Runs from any checkout of this repo; worktrees sit beside the main checkout.
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, join, resolve } from "node:path";

const [command, topic] = process.argv.slice(2);
if (!["add", "remove"].includes(command) || !/^[\w.-]+$/.test(topic ?? "")) {
  console.error("Usage: node scripts/worktree.mjs add|remove <topic>");
  process.exit(1);
}
const git = (args, cwd = process.cwd()) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const main = dirname(resolve(git(["rev-parse", "--git-common-dir"])));
const folder = join(dirname(main), `${basename(main)}-${topic}`);
const fail = (message) => { console.error(message); process.exit(1); };

if (command === "add") {
  if (existsSync(folder)) fail(`${folder} already exists.`);
  git(["worktree", "add", folder, "-b", topic, "main"], main);
  if (existsSync(join(main, ".env.local"))) copyFileSync(join(main, ".env.local"), join(folder, ".env.local"));
  const install = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["install", "--frozen-lockfile", "--prefer-offline"],
    { cwd: folder, stdio: "inherit", shell: process.platform === "win32" });
  if (install.status) fail("pnpm install failed; the worktree is there, run it again inside it.");
  const port = await new Promise((done) => { const server = createServer().listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => done(port)); }); });
  console.log(`\nReady: ${folder}\nVite: node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`);
} else {
  if (!existsSync(folder)) fail(`${folder} doesn't exist.`);
  if (git(["status", "--short"], folder)) fail(`${folder} has uncommitted changes; commit or discard them first.`);
  if (git(["branch", "--list", topic, "--no-merged", "main"], main)) fail(`Branch ${topic} isn't merged into main; merge it first.`);
  // rmdir deletes pnpm's junctions without following them into the package store.
  if (process.platform === "win32") spawnSync("cmd", ["/c", "rmdir", "/s", "/q", folder], { stdio: "inherit" });
  else rmSync(folder, { recursive: true, force: true });
  if (existsSync(folder)) fail(`Couldn't delete ${folder}: stop its Vite or anything else using it, then run this again.`);
  git(["worktree", "prune"], main);
  git(["branch", "-d", topic], main);
  console.log(`Removed ${folder} and branch ${topic}.`);
}
