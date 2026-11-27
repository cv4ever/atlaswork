// `pnpm run landing:shots`: retakes the landing page's app screenshots (README, "Landing page") from a production build
// of this checkout, the demo seed, light theme, status bar hidden, at 14:40 on the day it runs (so Today's day line, sun
// and the crew's next steps read the same whenever it's run): landing/today.webp and project.webp (1920×1200) and
// landing/phone-today.webp and phone-project.webp (780×1688). The dialog, chat and routines close-ups stay hand-cropped.
// Update the alt texts in landing/index.html when what the shots show changes.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
/** The project page the landing shows: First 10K in Health, with its countdown, tracker and goal. */
const project = "demo-10k";

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer().once("error", reject).listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

/** Shoots Today and the project page at one size, straight to WebP at the size the landing serves. */
async function shoot(tab, origin, { width, height, scale, mobile }, names) {
  await tab.run(async ({ page }, [origin, width, height, scale, mobile, project, names]) => {
    await page.setViewport({ width, height, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
    const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    // The page's clock reads 14:40 today: every `Date` it makes is shifted by the same amount, so the minute clock ticks on.
    await page.evaluateOnNewDocument(() => {
      const Real = Date;
      const target = new Real();
      target.setHours(14, 40, 0, 0);
      const shift = target.getTime() - Real.now();
      globalThis.Date = class extends Real {
        constructor(...args) { super(...(args.length ? args : [Real.now() + shift])); }
        static now() { return Real.now() + shift; }
      };
    });
    // `?fresh` resets the workspace to the demo seed and the look to its default; the look is then set through the
    // app's own buttons, which save it in the Session the next page keeps.
    await page.goto(`${origin}?fresh`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector(".today-page", { timeout: 120_000 });
    await page.evaluate(() => {
      for (const label of ["Switch to light mode", "Hide status bar"]) document.querySelector(`button[aria-label="${label}"]`)?.click();
    });
    await page.evaluate(() => document.fonts.ready);
    await settle(1500);
    await page.screenshot({ path: names.today, type: "webp", quality: 82 });
    await page.goto(`${origin}?tab=project:${project}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector(".project-masthead", { timeout: 120_000 });
    await settle(1500);
    await page.screenshot({ path: names.project, type: "webp", quality: 82 });
  }, { args: [[origin, width, height, scale, mobile, project, names]], timeout: 280 });
}

async function main() {
  execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  const port = await freePort();
  const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
  const origin = `http://127.0.0.1:${port}/`;
  for (let tries = 0; ; tries++) {
    try { if ((await fetch(origin)).ok) break; } catch { /* not up yet */ }
    if (tries > 60 || preview.exitCode !== null) { preview.kill(); throw new Error("vite preview didn't start."); }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const browser = await launchBrowser().catch((error) => { preview.kill(); throw error; });
  try {
    const tab = await browser.open({ name: "landing-shots" });
    // A fresh browser has no service worker or sign-in on this origin, so `?fresh` gives the signed-out demo.
    await shoot(tab, origin, { width: 1440, height: 900, scale: 1920 / 1440, mobile: false },
      { today: `${root}landing/today.webp`, project: `${root}landing/project.webp` });
    await shoot(tab, origin, { width: 390, height: 844, scale: 2, mobile: true },
      { today: `${root}landing/phone-today.webp`, project: `${root}landing/phone-project.webp` });
    console.log("Wrote landing/today.webp, project.webp, phone-today.webp and phone-project.webp.");
  } finally {
    await browser.end();
    preview.kill();
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error.message);
  process.exit(1);
});
