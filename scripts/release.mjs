// `pnpm run release`: ships the pushed HEAD to production from a clean worktree, so nothing uncommitted in this
// checkout (or another session's edits) can ride along; `--ref=<commit>` ships that pushed commit instead, so an
// approval for some commits doesn't carry the ones pushed after them. First it prints the release plan
// (`release-plan.mjs`: the migrations, and the app and landing commits production doesn't serve yet) and ships only
// once you answer y, or with `--yes` after the plan has been reviewed. It refuses a commit that would take back one
// production already serves, and one no screenshot regression passed on (`visual-stamp.mjs`; `--without-visual-check`
// ships anyway and says so). Then, in order: the full check, the desktop app's build when the plan publishes a new
// version (agents-design D85: signed with the update key from Bitwarden, built before anything ships so a failed build
// changes nothing), the database tests on a throwaway local stack when the plan has migrations (CI's database
// workflow may not have run: Actions minutes run out), database migrations, the agent and waitlist Edge Functions,
// the app (app.atlaswork.app) and the landing page (atlaswork.app), each site only when its plan changed, and last
// the desktop app's update (`publish-desktop.mjs`), so computers never run ahead of the server. Stops at the first
// failure.
// Secrets: the Cloudflare Pages token from Bitwarden through `bws` unless CLOUDFLARE_API_TOKEN is set; Supabase uses
// this machine's CLI login, addressed by project ref.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { describePlan, projectRef, releasePlan } from "./release-plan.mjs";
import { visualPassFor } from "./visual-stamp.mjs";

const pagesTokenId = "20b519e7-3b74-4fdc-9e98-b4f9010e28c3"; // WORKBENCH_CLOUDFLARE_PAGES_TOKEN
// A whole commit's diff (`changes`) can pass the default 1 MB of output.
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
// `commit` holds `older` when it descends from it, or when every commit `older` has beyond it reappears in `commit` with
// the same subject and the same changed lines: a deploy from a branch that was then rebased onto main (2026-11-22,
// 0be34f4 live and 009780b on main). Context lines are left out, since a rebase changes them and `git cherry`'s patch
// ids with them.
const changes = (sha) => git("show", "--format=%s", sha).split("\n").filter((line, index) => index === 0
  || (/^[+-]/.test(line) && !/^(\+\+\+|---) /.test(line))).join("\n");
const contains = (commit, older) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", older, commit], { stdio: "ignore" });
    return true;
  } catch {
    let base;
    // The public history restarted from one commit on 2026-11-27, with the private history's last tree in it. That
    // history is frozen, so a deploy from it (missing from this clone, or sharing no commit with `commit`) is older.
    try { base = execFileSync("git", ["merge-base", commit, older], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return true; }
    const mine = new Set(git("rev-list", `${base}..${commit}`).split("\n").filter(Boolean).map(changes));
    return git("rev-list", `${base}..${older}`).split("\n").filter(Boolean).every((sha) => mine.has(changes(sha)));
  }
};
const step = (title, command, args, cwd, env) => {
  console.log(`\n▶ ${title}`);
  execFileSync(command, args, { cwd, env, stdio: "inherit", shell: process.platform === "win32" });
};

if (git("status", "--porcelain")) throw new Error("Uncommitted changes. Commit and push first: a release ships a pushed commit only.");
git("fetch", "--quiet");
const ref = process.argv.find((arg) => arg.startsWith("--ref="))?.slice(6) ?? "HEAD";
const head = git("rev-parse", "--verify", `${ref}^{commit}`);
if (!git("branch", "-r", "--contains", head)) throw new Error(`${ref} (${head.slice(0, 7)}) isn't pushed. Push it first.`);
const looked = visualPassFor(head);
if (looked) console.log(`Screenshot regression passed on this look (${looked}).`);
else if (process.argv.includes("--without-visual-check")) console.log(`⚠ No screenshot regression passed on ${head.slice(0, 7)}'s look; shipping anyway (--without-visual-check).`);
else throw new Error(`No screenshot regression passed on ${head.slice(0, 7)}'s look. Serve a clean checkout of it and run checkVisual (DEVELOPMENT.md, "Screenshot regression"), or pass --without-visual-check.`);

const token = process.env.CLOUDFLARE_API_TOKEN
  ?? JSON.parse(execFileSync("bws", ["secret", "get", pagesTokenId, "--output", "json"], { encoding: "utf8" })).value;
const plan = await releasePlan(head, token);
console.log(describePlan(plan));
// Shipping a commit older than, or beside, what a site serves would take that site's newer commits back out.
for (const [site, { deployed }] of [["app", plan.app], ["landing page", plan.landing]]) {
  if (deployed && !contains(head, deployed))
    throw new Error(`Production's ${site} serves ${deployed.slice(0, 7)}, which ${head.slice(0, 7)} doesn't contain: releasing it would take commits back out.`);
}
if (!process.argv.includes("--yes")) {
  if (!process.stdin.isTTY) throw new Error("Review the plan above, then run `pnpm run release -- --yes` to ship it.");
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("\nShip this? [y/N] ");
  prompt.close();
  if (answer.trim().toLowerCase() !== "y") throw new Error("Not released.");
}
// Production builds read .env.production; drop inherited VITE_* so nothing from the shell reaches the bundle, and
// TAURI_* so a test's updater endpoint (TAURI_CONFIG) or signing key never reaches the desktop app it publishes (D85).
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VITE_") && !key.startsWith("TAURI_")));
const dir = join(mkdtempSync(join(tmpdir(), "atlaswork-release-")), "tree");
git("worktree", "add", "--quiet", "--detach", dir, head);
let dbStarted = false;
try {
  step("Install", "pnpm", ["install", "--frozen-lockfile", "--silent"], dir, env);
  step("Check", "pnpm", ["run", "--silent", "check"], dir, env);
  // The desktop app's Rust build lives outside the throwaway tree, so a release compiles only what changed.
  const desktop = plan.desktop.next && { version: plan.desktop.next, target: join(process.env.LOCALAPPDATA ?? tmpdir(), "atlaswork-desktop-target") };
  if (desktop) {
    const config = join(dir, "..", "desktop-version.json");
    writeFileSync(config, JSON.stringify({ version: desktop.version }));
    step(`Desktop app ${desktop.version}: helper`, "node", ["scripts/build-helper.mjs"], dir, env);
    step(`Desktop app ${desktop.version}: build`, "node", ["scripts/build-desktop.mjs", "--config", config], dir, { ...env, CARGO_TARGET_DIR: desktop.target });
  }
  if (plan.migrations.length) {
    // Its own project id, so it never reuses (or resets) a dev stack's database; a dev stack on the same ports
    // makes the start fail, and the release stops before touching production.
    const config = join(dir, "supabase", "config.toml");
    const original = readFileSync(config, "utf8");
    writeFileSync(config, original.replace(/^project_id = ".*"$/m, 'project_id = "workbench-release"'));
    dbStarted = true;
    step("Database tests: local stack with every migration", "pnpm", ["exec", "supabase", "db", "start", "--agent", "no", "--output-format", "text"], dir, env);
    step("Database tests", "pnpm", ["exec", "supabase", "test", "db", "--agent", "no", "--output-format", "text"], dir, env);
    // Stopped, and the project id put back, before anything ships: the Pages deploy refuses a tree with uncommitted
    // changes, which stopped the 2026-11-23 release after its migrations and functions but before the app.
    step("Database tests: stop the local stack", "pnpm", ["exec", "supabase", "stop", "--no-backup"], dir, env);
    dbStarted = false;
    writeFileSync(config, original);
  }
  step("Database migrations", "pnpm", ["exec", "supabase", "db", "push", `--remote=${projectRef}`, "--yes"], dir, env);
  for (const name of ["agent", "waitlist", "routines", "connectors"]) {
    step(`${name} function`, "pnpm", ["exec", "supabase", "functions", "deploy", name, "--project-ref", projectRef, "--yes"], dir, env);
  }
  const pages = { ...env, CLOUDFLARE_API_TOKEN: token };
  if (plan.app.commits.length) step("App (app.atlaswork.app)", "pnpm", ["run", "deploy:app"], dir, pages);
  if (plan.landing.commits.length) step("Landing page (atlaswork.app)", "pnpm", ["run", "deploy:landing"], dir, pages);
  if (desktop) {
    const installer = join(desktop.target, "release", "bundle", "nsis", `Atlaswork_${desktop.version}_x64-setup.exe`);
    step(`Desktop app ${desktop.version}: publish`, "node", ["scripts/publish-desktop.mjs", "--remote", "--installer", installer, "--version", desktop.version, "--commit", head], dir, env);
  }
  console.log(`\n✔ Released ${head.slice(0, 7)}: https://app.atlaswork.app and https://atlaswork.app${desktop ? `, and the desktop app ${desktop.version}` : ""}`);
} finally {
  if (dbStarted) {
    try { execFileSync("pnpm", ["exec", "supabase", "stop", "--no-backup"], { cwd: dir, env, stdio: "inherit", shell: process.platform === "win32" }); }
    catch { console.log("⚠ Couldn't stop the release's local database: run `pnpm exec supabase stop --project-id workbench-release --no-backup`."); }
  }
  git("worktree", "remove", "--force", dir);
}
