import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import { openCheckTab } from "./check-tab.mjs";
import { recordVisualPass } from "./visual-stamp.mjs";

const tracked = fileURLToPath(new URL("../dev/design/golden/", import.meta.url));
/** Which computer and browser drew the committed goldens: font rendering differs between them, so a comparison elsewhere is noise. */
const machineFile = `${tracked}machine.json`;
/** The demo seed is dated from today, so the showcase is drawn on one fixed day. */
const day = "2026-11-13";
/** A pixel counts as changed when a channel moves by more than this (text edges shimmer by less between runs). */
const channel = 32;
/** A shot fails when more than this share of its pixels changed. */
const allowed = 0.003;

/**
 * Screenshot regression on the design showcase (DEVELOPMENT.md, "Design showcase"). Run from OMP Eval with its browser object
 * and a disposable loopback Vite origin; it owns and closes its tab. It shoots each token section, the parts (each in every state), the
 * states, every widget kind and every dialog at 1440px wide and one device pixel, in light and dark, and compares each with the
 * PNG in dev/design/golden/. Today, the project page and chat are left out: they follow the clock. Throws naming every
 * shot that changed size or by more than 0.3% of its pixels, and writes what it saw beside the golden as
 * `<name>.actual.png` (ignored by Git). After an intended change, look at those, then run it with `{ update: true }`
 * and commit the new goldens. Goldens come from one machine's fonts, recorded in dev/design/golden/machine.json. On
 * another computer or browser version, `update` writes this machine's own goldens to dev/design/golden/local/<host>/,
 * which Git ignores, and the check compares with those, so nothing tracked changes there; `adopt` makes this machine
 * the one that draws the committed goldens.
 */
export async function checkVisual(browser, origin, { update = false, adopt = false } = {}) {
  const tab = await openCheckTab(browser, "visual-check");
  await tab.addInitScript(`localStorage.removeItem("look");`);
  const results = {};
  const failed = [];
  let golden = tracked;
  try {
    const machine = { host: hostname(), browser: await tab.run(async ({ page }) => page.browser().version(), { timeout: 30 }) };
    const drawn = existsSync(machineFile) ? JSON.parse(readFileSync(machineFile, "utf8")) : undefined;
    const home = adopt || !drawn || (drawn.host === machine.host && drawn.browser === machine.browser);
    if (!home) golden = `${tracked}local/${machine.host}/`;
    if (update && home) writeFileSync(machineFile, `${JSON.stringify(machine, null, 2)}\n`);
    if (!update && !home && !existsSync(golden)) {
      throw new Error(`The committed goldens were drawn on ${drawn.host} with ${drawn.browser}; this is ${machine.host} with ${machine.browser}, where fonts render differently. Run checkVisual(browser, origin, { update: true }) on main here first: it keeps this machine's goldens in dev/design/golden/local/, out of Git. Then compare your branch.`);
    }
    for (const theme of ["light", "dark"]) {
      await tab.emulate({ colorScheme: theme, reducedMotion: "reduce" });
      const shots = await tab.run(async ({ page }, url) => {
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector(".ds-kind .widget", { timeout: 120_000 });
        await page.evaluate(() => document.fonts.ready);
        // The sticky bar and the strip of widget kinds would otherwise sit across whichever shot is scrolled under them.
        await page.addStyleTag({ content: ".ds-bar, .ds-kinds { position: static !important; } * { caret-color: transparent !important; }" });
        const sizes = await page.$$eval("[data-shot]", (elements) => elements.map((element) => [element.dataset.shot, element.getBoundingClientRect().height]));
        // The showcase scrolls inside its own frame, where a shot taller than the window comes out blank below the
        // fold: the window is as tall as the tallest shot while the sections are shot, and 900px again for the dialogs.
        const settled = () => new Promise((resolve) => setTimeout(resolve, 500));
        await page.setViewport({ width: 1440, height: Math.ceil(Math.max(...sizes.map(([, height]) => height))) + 200, deviceScaleFactor: 1 });
        await settled();
        const taken = {};
        for (const [name] of sizes) {
          const element = await page.$(`[data-shot="${name}"]`);
          taken[name] = await element.screenshot({ encoding: "base64" });
        }
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await settled();
        // Each dialog, opened by its showcase button, shot alone and closed again.
        for (const name of await page.$$eval("[data-dialog]:not([data-clock])", (buttons) => buttons.map((button) => button.dataset.dialog))) {
          await page.$eval(`[data-dialog="${name}"]`, (button) => button.click());
          const dialog = await page.waitForSelector("dialog[open]", { timeout: 15_000 });
          await new Promise((resolve) => setTimeout(resolve, 500));
          taken[`dialog-${name}`] = await dialog.screenshot({ encoding: "base64" });
          // A persistent dialog (onboarding, closedby="none") ignores Escape and closes only through its own Close button.
          await dialog.evaluate((element) => {
            if (element.getAttribute("closedby") === "none") element.querySelector('.dialog-head [aria-label="Close dialog"]').click();
            else element.dispatchEvent(new Event("cancel", { cancelable: true }));
          });
          await page.waitForFunction(() => !document.querySelector("dialog[open]"), { timeout: 15_000 });
        }
        return taken;
      }, { args: [`${new URL(origin).origin}/dev/design/?today=${day}`], timeout: 280 });
      mkdirSync(`${golden}${theme}`, { recursive: true });
      for (const [name, png] of Object.entries(shots)) {
        const file = `${golden}${theme}/${name}.png`;
        const key = `${theme}/${name}`;
        if (update) { writeFileSync(file, Buffer.from(png, "base64")); results[key] = "updated"; continue; }
        if (!existsSync(file)) { results[key] = "no golden"; failed.push(key); continue; }
        // Compared in the page, on two canvases: no image library needed.
        const difference = await tab.evaluate(async ([before, after, limit]) => {
          const pixels = async (base64) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = new OffscreenCanvas(image.width, image.height);
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0);
            return context.getImageData(0, 0, image.width, image.height);
          };
          const [a, b] = [await pixels(before), await pixels(after)];
          if (a.width !== b.width || a.height !== b.height) return `size ${a.width}x${a.height} became ${b.width}x${b.height}`;
          let changed = 0;
          for (let index = 0; index < a.data.length; index += 4) {
            if (Math.abs(a.data[index] - b.data[index]) > limit || Math.abs(a.data[index + 1] - b.data[index + 1]) > limit
              || Math.abs(a.data[index + 2] - b.data[index + 2]) > limit) changed++;
          }
          return changed / (a.width * a.height);
        }, [readFileSync(file).toString("base64"), png, channel]);
        results[key] = typeof difference === "number" ? `${(difference * 100).toFixed(2)}%` : difference;
        if (typeof difference !== "number" || difference > allowed) {
          failed.push(key);
          writeFileSync(file.replace(/\.png$/, ".actual.png"), Buffer.from(png, "base64"));
        }
      }
    }
  } finally {
    await tab.close();
  }
  if (failed.length) throw new Error(`The design showcase changed: ${failed.map((key) => `${key} (${results[key]})`).join(", ")}.\nCompare ${golden}<theme>/<name>.actual.png with its golden; if the change is intended, run checkVisual(browser, origin, { update: true }) and commit the goldens${golden === tracked ? "" : " on the machine that draws them"}.`);
  // A pass on a clean checkout lets `pnpm run release` ship its commit (visual-stamp.mjs). Serve this same checkout.
  if (!update) recordVisualPass();
  return results;
}
