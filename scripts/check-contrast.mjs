import { openCheckTab } from "./check-tab.mjs";

/** The demo seed is dated from today, so the showcase is drawn on one fixed day (as checkVisual does). */
const day = "2026-11-13";

/**
 * Text contrast on every widget the design showcase draws (DEVELOPMENT.md, "Design showcase"), in every domain of the demo in
 * Garden and in the default domain of every other theme, in both modes: each element holding text must reach WCAG AA
 * against the colours actually painted behind it, 4.5:1, or 3:1 for large text (24px, or 18.66px at weight 700).
 * Disabled controls are exempt, as WCAG has them. Catches what the token pairs in `dev/design/Tokens.tsx` cannot: a
 * colour mixed per card (`--hue-ink`) or per project, on its band. Run from OMP Eval with its browser object and a
 * loopback Vite origin, or through `checkBrowser`. Throws naming each failing text with its ratio, mode, theme and domain.
 */
export async function checkContrast(browser, origin) {
  const tab = await openCheckTab(browser, "contrast-check");
  await tab.addInitScript(`localStorage.removeItem("look");`);
  const results = {};
  const failed = [];
  try {
    for (const theme of ["light", "dark"]) {
      await tab.emulate({ colorScheme: theme, reducedMotion: "reduce" });
      const found = await tab.run(async ({ page }, url) => {
        await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForSelector(".ds-kind .widget", { timeout: 120_000 });
        const domains = await page.$$eval('select[aria-label="Domain"] option', (options) => options.map((option) => option.value));
        const palettes = await page.$$eval('select[aria-label="Theme"] option', (options) => options.map((option) => option.value));
        // A domain's hue replaces the accent, so the other themes differ only outside one: their default domain is enough.
        const places = palettes.flatMap((palette) => (palette === "garden" ? domains : domains.slice(0, 1)).map((domain) => [palette, domain]));
        const out = {};
        for (const [palette, domain] of places) {
          await page.select('select[aria-label="Theme"]', palette);
          await page.select('select[aria-label="Domain"]', domain);
          await new Promise((resolve) => setTimeout(resolve, 600));
          out[`${palette} ${domain}`] = await page.evaluate(() => {
            const context = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
            /** Paints the colours in order over white and reads the pixel back: alpha and colour-mix() come out composited. */
            const paint = (colours) => {
              context.globalCompositeOperation = "copy"; context.fillStyle = "#fff"; context.fillRect(0, 0, 1, 1);
              context.globalCompositeOperation = "source-over";
              for (const colour of colours) { context.fillStyle = colour; context.fillRect(0, 0, 1, 1); }
              return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
            };
            const luminance = (rgb) => rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
              .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
            /** The backgrounds painted under an element's middle, outermost first, up to the first opaque one. An
             * ancestor whose box doesn't reach there (a 2px marker with its label hung beside it) paints nothing under it. */
            const under = (element) => {
              const box = element.getBoundingClientRect();
              const [x, y] = [box.left + box.width / 2, box.top + box.height / 2];
              const stack = [];
              for (let node = element; node; node = node.parentElement) {
                const colour = getComputedStyle(node).backgroundColor;
                const area = node.getBoundingClientRect();
                if (x < area.left || x > area.right || y < area.top || y > area.bottom) continue;
                if (!/^rgba?\(.*,\s*0\)$/.test(colour) && colour !== "transparent") { stack.unshift(colour); if (!/rgba|\/\s*0?\.\d/.test(colour)) break; }
              }
              return stack;
            };
            const exempt = (element) => element.closest(":disabled, [aria-disabled='true'], [hidden], svg")
              || [...function* () { for (let node = element; node; node = node.parentElement) yield node; }()].some((node) => Number(getComputedStyle(node).opacity) < 1);
            const bad = [];
            for (const element of document.querySelectorAll(".ds-kind .widget *")) {
              const text = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent.trim()).join(" ").trim();
              if (!text || !element.getClientRects().length || getComputedStyle(element).visibility === "hidden" || exempt(element)) continue;
              const style = getComputedStyle(element);
              const backdrop = under(element);
              const ratio = (() => { const [a, b] = [luminance(paint([...backdrop, style.color])), luminance(paint(backdrop))]; return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); })();
              const size = parseFloat(style.fontSize);
              const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
              if (ratio < (large ? 3 : 4.5)) bad.push(`"${text.slice(0, 30)}" ${ratio.toFixed(2)} in ${element.closest("[id^=widget-]")?.id ?? "?"}`);
            }
            return [...new Set(bad)];
          });
        }
        return out;
      }, { args: [`${new URL(origin).origin}/dev/design/?today=${day}`], timeout: 280 });
      for (const [domain, bad] of Object.entries(found)) {
        results[`${theme} ${domain}`] = bad.length ? bad : "ok";
        failed.push(...bad.map((line) => `${theme} ${domain}: ${line}`));
      }
    }
  } finally {
    await tab.close();
  }
  if (failed.length) throw new Error(`Text below WCAG AA in the showcase's widgets:\n${failed.join("\n")}`);
  return results;
}
