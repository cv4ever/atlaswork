// Deploys a folder to a Cloudflare Pages project: `node scripts/deploy-pages.mjs <folder> <project>`. `landing` goes to
// `atlaswork` (atlaswork.app), the built app (`dist`) to `atlaswork-app` (app.atlaswork.app). Wrangler runs from a temp
// copy because inside this repo it detects the Vite app, offers to convert it to Workers and adds itself to package.json.
// Auth: CLOUDFLARE_API_TOKEN when set (Bitwarden WORKBENCH_CLOUDFLARE_PAGES_TOKEN, scoped to Pages and atlaswork.app DNS),
// else `npx wrangler login`. The account is pinned because a zone-scoped token can't list accounts.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cloudflareAccount, pendingMigrations } from "./release-plan.mjs";

const [folder, project] = process.argv.slice(2);
if (!folder || !project) throw new Error("Usage: node scripts/deploy-pages.mjs <folder> <project>");
// Production matches a pushed commit: a dirty tree or an unpushed HEAD would ship work nobody can trace back.
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain")) throw new Error("Uncommitted changes here. Commit and push, then deploy (or use `pnpm run release`).");
const head = git("rev-parse", "HEAD");
if (!git("branch", "-r", "--contains", head)) throw new Error(`HEAD ${head.slice(0, 7)} isn't pushed. Push it, then deploy.`);
// The app never runs ahead of its schema: a migration the hosted database lacks goes out first (`pnpm run release`).
if (project === "atlaswork-app") {
  const pending = pendingMigrations();
  if (pending.length) throw new Error(`The hosted database lacks ${pending.join(", ")}. Release (pnpm run release) or apply them first.`);
}
const dir = mkdtempSync(join(tmpdir(), `${project}-`));
try {
  cpSync(folder, join(dir, "site"), { recursive: true });
  execFileSync("npx", ["--yes", "wrangler@4", "pages", "deploy", "site", "--project-name", project, "--branch", "main", "--commit-hash", head, "--commit-dirty=false"], {
    cwd: dir, stdio: "inherit", shell: process.platform === "win32",
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID ?? cloudflareAccount },
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
