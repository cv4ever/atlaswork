import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";
import { checkAdmin } from "./check-admin.mjs";
import { checkBriefs } from "./check-briefs.mjs";
import { checkCapture } from "./check-capture.mjs";
import { checkChats } from "./check-chats.mjs";
import { checkContrast } from "./check-contrast.mjs";
import { checkDesign } from "./check-design.mjs";
import { checkFirstRun } from "./check-first-run.mjs";
import { checkModel } from "./check-model.mjs";
import { checkPages } from "./check-pages.mjs";
import { checkSkin } from "./check-skin.mjs";
import { compareSpeed } from "./check-speed.mjs";
import { checkVisual } from "./check-visual.mjs";

/** Whether this checkout is `origin/main` itself, with nothing of its own to time against it. */
const isMain = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }) === execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" });
/** How long one check may run before it counts as failed; the slowest, speed, builds two production copies. */
const checkMs = 20 * 60_000;

const checks = (account, visual = {}) => ({ skin: checkSkin, chats: checkChats, capture: checkCapture, model: (tabs, at) => checkModel(tabs, at, account),
  pages: checkPages, briefs: checkBriefs, firstRun: checkFirstRun, admin: checkAdmin, design: checkDesign, contrast: checkContrast, visual: (tabs, at) => checkVisual(tabs, at, visual),
  // Timed against origin/main on this machine rather than against fixed budgets, which only an idle reference machine
  // meets (on 2026-11-21 main itself missed them 2 to 13 times over here); checkSpeed keeps the budgets.
  speed: async (tabs) => isMain() ? { skipped: "this checkout is origin/main" } : compareSpeed(tabs) });

/**
 * Every browser regression in one call, for the release step (DEVELOPMENT.md, "Verification"), against a disposable loopback
 * Vite origin: from OMP Eval with its browser object, or from any terminal with `pnpm run check:browser` (below). Each
 * check owns its tab and resets that origin itself; the speed check builds and serves production copies of this
 * checkout and origin/main, since the dev server is several times slower. Runs them all even after a failure and throws
 * once at the end naming the failed ones, so one broken screen can't hide another. `account` (a `dev/test-account.mjs`
 * session file) adds the signed-in AI model check; `only` runs just the named checks; `visual` passes `update` or
 * `adopt` to the visual check.
 */
export async function checkBrowser(browser, origin, account, only, visual) {
  const results = {};
  const failed = [];
  for (const [name, check] of Object.entries(checks(account, visual))) {
    if (only && !only.includes(name)) continue;
    const started = Date.now();
    // One check that never ends fails at its limit rather than holding up the rest (a whole run once hung past 40
    // minutes, 2026-11-23, while each check alone took at most 5).
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${name} didn't finish in ${checkMs / 60_000} minutes`)), checkMs); });
    try { results[name] = await Promise.race([check(browser, origin), limit]); }
    catch (error) { results[name] = { failed: error.message }; failed.push(name); }
    finally { clearTimeout(timer); }
    console.log(`${name}: ${results[name]?.failed ? "failed" : "passed"} in ${Math.round((Date.now() - started) / 1000)} s`);
  }
  if (failed.length) throw new Error(`Browser checks failed: ${failed.join(", ")}\n${JSON.stringify(results, null, 2)}`);
  return results;
}

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer().once("error", reject).listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

/** A Vite dev server of this checkout on a free loopback port, ready once it answers. */
async function startVite() {
  const port = await freePort();
  const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { stdio: ["ignore", "ignore", "inherit"] });
  const origin = `http://127.0.0.1:${port}/`;
  for (let tries = 0; ; tries++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* not up yet */ }
    if (tries > 120 || vite.exitCode !== null) { vite.kill(); throw new Error("The Vite dev server didn't start."); }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { origin, stop: () => vite.kill() };
}

/**
 * `pnpm run check:browser [-- --only chats,pages] [--visual [--update] [--adopt]] [--account <file>]`: starts this
 * checkout's dev server on a free port and the pinned headless Chrome (scripts/browser.mjs), runs the checks and stops
 * both. The visual check compares screenshots drawn with one machine and browser (dev/design/golden/machine.json), so
 * it runs only with `--visual` or when `--only` names it; `--update` redraws goldens after an intended change, and
 * `--adopt` makes this machine and browser the ones that draw the committed goldens.
 */
async function main(argv) {
  const flag = (name) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const only = flag("--only")?.split(",") ?? Object.keys(checks()).filter((name) => name !== "visual" || argv.includes("--visual"));
  const visual = { update: argv.includes("--update"), adopt: argv.includes("--adopt") };
  const { origin, stop } = await startVite();
  const browser = await launchBrowser().catch((error) => { stop(); throw error; });
  try {
    // A cold dev server compiles on first load: warm it once, so the first check's timings don't include it.
    const warm = await browser.open({ name: "warm", url: `${origin}?fresh` });
    await warm.waitForSelector(".workbench", { timeout: 120000 });
    await browser.close({ name: "warm" });
    const results = await checkBrowser(browser, origin, flag("--account"), only, visual);
    for (const name of Object.keys(results)) console.log(`passed ${name}`);
  } finally {
    await browser.end();
    stop();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(() => process.exit(0), (error) => {
    console.error(error.message);
    process.exit(1);
  });
}
