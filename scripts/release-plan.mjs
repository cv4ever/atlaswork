// What a release of HEAD would change in production, read from production itself: the hosted database's migrations
// not applied yet (`supabase db push --dry-run`), for each Pages project the commit it serves now (Wrangler's
// deployment list) with the commits and files HEAD adds on top, and the desktop app's published version with the
// version a release would publish and the computers counted by version (`publish-desktop.mjs`, agents-design D85).
// `pnpm run release` prints it and asks before shipping; `deploy:app` refuses while the database lacks a migration, so
// the app never runs ahead of its schema. `pnpm run release:plan` prints it alone. Needs this machine's Supabase CLI
// login, CLOUDFLARE_API_TOKEN, and for the computers the project's secret key (`bws` or SUPABASE_SECRET_KEY).
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describeDesktop, desktopPlan } from "./publish-desktop.mjs";

export const projectRef = "mcihsugblojunfpuohim";
export const cloudflareAccount = "a1f804d4855fa8c081645b27965f8500";
const root = fileURLToPath(new URL("..", import.meta.url));
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: "utf8", cwd: root, shell: process.platform === "win32",
  stdio: ["ignore", "pipe", "pipe"], ...options });
// Git runs without a shell: on Windows one would split `--format=%h %s` at its space.
const git = (...args) => execFileSync("git", args, { encoding: "utf8", cwd: root }).trim();
/** The JSON value in a command's output: both CLIs print notices around it. */
const jsonIn = (text, open, close) => JSON.parse(text.slice(text.indexOf(open), text.lastIndexOf(close) + 1));

/** Migration files in supabase/migrations the hosted database hasn't applied. */
export function pendingMigrations() {
  return jsonIn(run("pnpm", ["exec", "supabase", "db", "push", `--remote=${projectRef}`, "--dry-run"]), "{", "}").migrations;
}

/** The commit a Pages project serves in production (`deploy-pages.mjs` tags each deployment with it). */
export function deployedCommit(project, token = process.env.CLOUDFLARE_API_TOKEN) {
  // Wrangler runs from a temp folder: inside this repo it detects the Vite app and offers to convert it.
  const dir = mkdtempSync(join(tmpdir(), "release-plan-"));
  try {
    const out = run("npx", ["--yes", "wrangler@4", "pages", "deployment", "list", "--project-name", project, "--environment", "production", "--json"],
      { cwd: dir, env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? cloudflareAccount } });
    return jsonIn(out, "[", "]")[0]?.Source ?? null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What shipping `head` adds over what production serves: per project, the commits and the files under its folder. */
export async function releasePlan(head = git("rev-parse", "HEAD"), token) {
  const since = (deployed, paths) => {
    if (!deployed) return { deployed, commits: ["(nothing deployed yet)"], files: [] };
    // A deploy from the private history before the public restart (2026-11-27) has no range to this one: the restart
    // commit and everything after it are new to production.
    let range = `${deployed}..${head}`;
    let from = deployed;
    // Git's empty tree: every file in `head` counts as changed.
    try { execFileSync("git", ["merge-base", deployed, head], { cwd: root, stdio: "ignore" }); } catch { range = head; from = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; }
    return { deployed, commits: git("log", "--format=%h %s", range, "--", ...paths).split("\n").filter(Boolean),
      files: git("diff", "--name-only", from, head, "--", ...paths).split("\n").filter(Boolean) };
  };
  return {
    head: head.slice(0, 7),
    migrations: pendingMigrations(),
    // The app is everything but the landing page; the landing page is its folder.
    app: since(deployedCommit("atlaswork-app", token), [".", ":!landing"]),
    landing: since(deployedCommit("atlaswork", token), ["landing"]),
    desktop: await desktopPlan(head),
  };
}

export function describePlan(plan) {
  const part = (title, { deployed, commits, files }) => commits.length
    ? `${title}: ${commits.length} commit${commits.length === 1 ? "" : "s"} over ${deployed?.slice(0, 7) ?? "nothing"}, ${files.length} file${files.length === 1 ? "" : "s"}\n${commits.map((line) => `  ${line}`).join("\n")}`
    : `${title}: unchanged (serves ${deployed?.slice(0, 7)})`;
  return [`Release of ${plan.head}`,
    plan.migrations.length ? `Database: ${plan.migrations.length} migration${plan.migrations.length === 1 ? "" : "s"} to apply\n${plan.migrations.map((name) => `  ${name}`).join("\n")}` : "Database: up to date",
    part("App (app.atlaswork.app)", plan.app), part("Landing page (atlaswork.app)", plan.landing), describeDesktop(plan.desktop)].join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(describePlan(await releasePlan(git("rev-parse", "--verify", `${process.argv.find((arg) => arg.startsWith("--ref="))?.slice(6) ?? "HEAD"}^{commit}`))));
