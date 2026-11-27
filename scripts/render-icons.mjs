// Makes every icon file from public/icon.svg (DESIGN.md, Icons), so the mark is drawn once: the PWA's any-purpose PNGs
// (its rounded tile on transparent corners), the maskable PNG and the iPhone's apple-touch icon (full-bleed forest with
// the mark smaller, inside the safe zone the platform crops to), the dev install's clay PNGs (dev/app), the landing
// page's copies, and the Windows app's icons through `tauri icon`. Renders with the checks' pinned Chrome.
// Usage: node scripts/render-icons.mjs
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./browser.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(join(root, "public/icon.svg"), "utf8");
const mark = /<g id="mark">[\s\S]*?<\/g>/.exec(source)?.[0];
if (!mark) throw new Error('public/icon.svg has no <g id="mark">');
/** The mark on a full square of `fill`, scaled by `k` about the centre. */
const square = (fill, k) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${fill}"/>`
  + `<g transform="translate(256 256) scale(${k}) translate(-256 -256)">${mark}</g></svg>`;
const forest = "#416b57", clay = "#c2705a";
const work = mkdtempSync(join(tmpdir(), "atlaswork-icons-"));
const files = [
  ["public/icon-192.png", source, 192], ["public/icon-512.png", source, 512],
  ["public/icon-maskable-512.png", square(forest, 0.82), 512], ["public/apple-touch-icon.png", square(forest, 0.9), 180],
  ["dev/app/icon-192.png", square(clay, 0.82), 192], ["dev/app/icon-512.png", square(clay, 0.82), 512],
  [join(work, "tile-1024.png"), source, 1024],
];

const browser = await launchBrowser();
try {
  const tab = await browser.open({ name: "icons" });
  await tab.run(async ({ page }, list) => {
    for (const [, svg, size, path] of list) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block}</style>`
        + `<img width="${size}" height="${size}" src="data:image/svg+xml;base64,${btoa(svg)}">`);
      await page.waitForFunction(() => document.images[0].complete);
      await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    }
  }, { args: [files.map(([file, svg, size]) => [file, svg, size, file.includes(":") ? file : join(root, file)])] });
} finally {
  await browser.end();
}

// The Windows app: Tauri makes the .ico (16 to 256 px) and the PNGs its bundle lists (tauri.conf.json, bundle.icon).
const tauri = join(work, "tauri");
execFileSync("pnpm", ["exec", "tauri", "icon", join(work, "tile-1024.png"), "-o", tauri], { cwd: root, stdio: "ignore", shell: process.platform === "win32" });
for (const name of ["32x32.png", "128x128.png", "128x128@2x.png", "icon.ico", "icon.png"]) copyFileSync(join(tauri, name), join(root, "desktop/src-tauri/icons", name));
// The landing page is its own Pages project: its favicon and the logo search engines show.
writeFileSync(join(root, "landing/icon.svg"), source);
copyFileSync(join(root, "public/icon-512.png"), join(root, "landing/icon-512.png"));
rmSync(work, { recursive: true, force: true });
console.log(`Icons made from public/icon.svg: ${files.length - 1} PNGs, the Windows app's 5 and the landing page's 2.`);
