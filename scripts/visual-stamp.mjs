// Which commits passed the screenshot regression (DEVELOPMENT.md, "Screenshot regression"), so `pnpm run release` can refuse a
// commit whose look nobody checked: `check` has no browser, and from 18 to 20 November 2026 two days of UI work shipped
// with goldens nobody had redrawn. `checkVisual` records the tree of a clean checkout it passed on in a file of the
// repository's shared Git folder (every worktree sees it; it is never committed). A release passes when a recorded tree
// differs from what it ships in nothing the showcase draws from.
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const git = (...args) => execFileSync("git", args, { encoding: "utf8", cwd: root }).trim();
/** What the showcase's pixels can change with. Docs, the Edge Functions, the comparison and other checks can't. */
const drawnFrom = ["src", "dev/design", "public", "index.html", "vite.config.ts", "package.json", "pnpm-lock.yaml", "scripts/check-visual.mjs"];
const stampFile = () => {
  const common = git("rev-parse", "--git-common-dir");
  return join(isAbsolute(common) ? common : join(root, common), "atlaswork-visual-pass");
};

/** Records this checkout's HEAD as passed, when nothing in it is uncommitted (what was shot is then exactly HEAD). */
export function recordVisualPass() {
  if (git("status", "--porcelain", "--", ...drawnFrom)) return false;
  appendFileSync(stampFile(), `${git("rev-parse", "HEAD^{tree}")} ${new Date().toISOString()}\n`);
  return true;
}

/** The recorded pass that covers `commit`, or undefined: a tree equal to it in every path the showcase draws from. */
export function visualPassFor(commit) {
  const file = stampFile();
  if (!existsSync(file)) return undefined;
  const tree = git("rev-parse", `${commit}^{tree}`);
  const passes = readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => line.split(" ")).reverse();
  return passes.find(([passed]) => {
    try {
      execFileSync("git", ["diff", "--quiet", passed, tree, "--", ...drawnFrom], { cwd: root, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })?.[1];
}
