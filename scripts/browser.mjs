// The browser the checks drive, outside OMP: the part of OMP Eval's `browser` object the scripts/check-*.mjs files use
// (open and close by name; a tab's goto, evaluate, waitForSelector, click, press, emulate, errors, frame and run with
// its Puppeteer page), on puppeteer-core. It runs one pinned Chrome for Testing build (`chromeBuild`), downloaded once
// into the main checkout's node_modules/.cache/chrome, which every worktree shares (scripts/worktree.mjs), so
// screenshots and timings don't move when the installed Chrome updates itself (2026-11-21: Chrome 157 → 158 blocked
// the visual check). `BROWSER_PATH` names another binary; offline with no download yet, it falls back to the installed
// Chrome, Edge or Chromium and says so. One headless browser per launch; `end()` stops it.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Browser, computeExecutablePath, detectBrowserPlatform, install } from "@puppeteer/browsers";
import puppeteer from "puppeteer-core";

/** Raise it on purpose, then redraw the visual goldens with it (DEVELOPMENT.md, "Design showcase"). */
export const chromeBuild = "158.0.8127.36";
const here = fileURLToPath(new URL("..", import.meta.url));
/** The main checkout, whose Git folder every worktree shares; this checkout when Git can't say. */
const mainCheckout = (() => {
  try {
    return dirname(resolve(here, execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: here, encoding: "utf8" }).trim()));
  } catch {
    return here;
  }
})();
const cacheDir = join(mainCheckout, "node_modules/.cache/chrome");

/** Where Chrome, Edge or Chromium usually live, in the order tried. */
function installed() {
  const env = process.env;
  const windows = [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean).flatMap((root) => [
    join(root, "Google/Chrome/Application/chrome.exe"), join(root, "Microsoft/Edge/Application/msedge.exe"), join(root, "Chromium/Application/chrome.exe"),
  ]);
  const mac = ["Google Chrome", "Chromium", "Microsoft Edge"].map((app) => `/Applications/${app}.app/Contents/MacOS/${app}`);
  const linux = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"].map((name) => `/usr/bin/${name}`);
  return [...windows, ...mac, ...linux];
}

/** `BROWSER_PATH`, else the pinned build (downloading it the first time), else an installed browser. */
async function executable() {
  if (process.env.BROWSER_PATH) return process.env.BROWSER_PATH;
  const platform = detectBrowserPlatform();
  const pinned = computeExecutablePath({ browser: Browser.CHROME, buildId: chromeBuild, cacheDir, platform });
  if (existsSync(pinned)) return pinned;
  try {
    console.error(`Downloading Chrome for Testing ${chromeBuild} into ${cacheDir} (once for every worktree)…`);
    return (await install({ browser: Browser.CHROME, buildId: chromeBuild, cacheDir, platform })).executablePath;
  } catch (error) {
    const found = installed().find((path) => existsSync(path));
    if (!found) throw new Error(`Couldn't download Chrome for Testing ${chromeBuild} (${error.message}) and found no installed browser. Set BROWSER_PATH.`);
    console.error(`Couldn't download Chrome for Testing (${error.message}); using ${found}, so the visual check may refuse to compare.`);
    return found;
  }
}

const withTimeout = (work, seconds, what) => seconds ? Promise.race([work, new Promise((_, reject) =>
  setTimeout(() => reject(new Error(`${what} timed out after ${seconds}s`)), seconds * 1000).unref())]) : work;

/** One modifier chord ("Control+k") or key ("Escape"), pressed and released. */
async function press(keyboard, chord) {
  const keys = chord.split("+");
  const key = keys.pop();
  for (const modifier of keys) await keyboard.down(modifier);
  await keyboard.press(key);
  for (const modifier of keys.reverse()) await keyboard.up(modifier);
}

/** OMP's `role/button[name="Settings" exact]` and `text/…` selectors in Puppeteer's terms; CSS and `aria/…` pass as they are. */
function selector(value) {
  const role = /^role\/([\w-]+)(?:\[name="([^"]*)"(?: exact)?\])?$/.exec(value);
  if (role) return `::-p-aria(${role[2] === undefined ? "" : `[name="${role[2]}"]`}[role="${role[1]}"])`;
  return value.startsWith("text/") ? `::-p-text(${value.slice(5)})` : value;
}

/** The element helpers a tab and a frame share. */
const helpers = (target) => ({
  evaluate: (fn, ...args) => target.evaluate(fn, ...args),
  waitForSelector: (value, { timeout = 30000 } = {}) => target.waitForSelector(selector(value), { timeout }),
  click: (value) => target.click(selector(value)),
  focus: (value) => target.focus(selector(value)),
  hover: (value) => target.hover(selector(value)),
  text: (value = "body") => target.$eval(selector(value), (element) => element.innerText),
});

function wrap(page, browser, name) {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push({ text: message.text() }); });
  page.on("pageerror", (error) => errors.push({ message: error.message }));
  // As OMP's browser does: alerts and the leave-page prompt (the app's unload guard while a save is on its way) are
  // accepted, so navigating on never hangs behind a dialog; anything else is dismissed.
  page.on("dialog", (dialog) => void (["alert", "beforeunload"].includes(dialog.type()) ? dialog.accept() : dialog.dismiss()).catch(() => undefined));
  let media = {};
  let cdp;
  const tab = {
    name,
    ...helpers(page),
    // The DOM, not every subresource: a dev server's first visit compiles modules for longer than "load" can wait.
    goto: (url) => page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 }),
    reload: () => page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }),
    url: async () => page.url(),
    close: () => page.close(),
    press: (chord) => press(page.keyboard, chord),
    addInitScript: (source) => page.evaluateOnNewDocument(source),
    errors: async () => ({ entries: [...errors] }),
    async emulate({ colorScheme, reducedMotion, cpuThrottling, locale, viewport }) {
      if (colorScheme || reducedMotion) {
        media = { ...media, ...colorScheme && { "prefers-color-scheme": colorScheme }, ...reducedMotion && { "prefers-reduced-motion": reducedMotion } };
        await page.emulateMediaFeatures(Object.entries(media).map(([feature, value]) => ({ name: feature, value })));
      }
      if (cpuThrottling !== undefined) await page.emulateCPUThrottling(cpuThrottling);
      if (locale) await (cdp ??= await page.createCDPSession()).send("Emulation.setLocaleOverride", { locale });
      if (viewport) await page.setViewport(viewport);
    },
    async frame(selector) {
      const element = await page.waitForSelector(selector, { timeout: 30000 });
      const frame = await element.contentFrame();
      return { ...helpers(frame), press: (chord) => press(page.keyboard, chord) };
    },
    run: (fn, { args = [], timeout } = {}) => withTimeout(Promise.resolve(fn({ tab, page, browser }, ...args)), timeout, `${name}: run`),
  };
  return tab;
}

/**
 * Chrome on Windows draws text with the ClearType contrast and gamma of the display Windows treats as primary, so the
 * same page drew dark text differently by day, with a monitor whose text contrast is 1, than at night without it
 * (contrast 0), and the screenshot regression failed in every light-theme shot after dark (2026-11-22 and 2026-11-23).
 * Fixed values draw text alike whatever displays are on; they're the day's, which the committed goldens were drawn with.
 */
const textRendering = ["--text-contrast=1", "--text-gamma=2.2"];

/** Starts a headless browser with OMP's `browser` interface for the checks. */
export async function launchBrowser() {
  const executablePath = await executable();
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--no-default-browser-check", ...textRendering] });
  const tabs = new Map();
  return {
    async open({ name, url = "about:blank", viewport = { width: 1440, height: 900 } }) {
      const page = await browser.newPage();
      await page.setViewport(viewport);
      const tab = wrap(page, browser, name);
      tabs.set(name, tab);
      if (url !== "about:blank") await tab.goto(url);
      return tab;
    },
    async close({ name } = {}) {
      const tab = tabs.get(name);
      tabs.delete(name);
      await tab?.close().catch(() => undefined);
    },
    tab: (name) => tabs.get(name),
    end: () => browser.close(),
    version: () => browser.version(),
  };
}
