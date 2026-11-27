import assert from "node:assert/strict";
import { openCheckTab } from "./check-tab.mjs";

/** Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tab. */
export async function checkSkin(browser, origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin. This check resets its records.");
  const tab = await openCheckTab(browser, "skin-check", { width: 1440, height: 1000 });
  const settings = 'role/button[name="Settings" exact]';
  const theme = (id) => `.theme-card[data-theme-id="${id}"]`;
  const mode = (label) => `[role="group"][aria-label="Mode"] button:nth-child(${["Auto", "Light", "Dark"].indexOf(label) + 1})`;
  const close = 'dialog button[aria-label="Close dialog"]';
  // Settings loads on first open (a lazy chunk), so its themes arrive after the click; wait for them before using them.
  const openSettings = async () => {
    await tab.click(settings);
    await tab.waitForSelector(theme("garden"), { timeout: 15000 });
  };
  const paint = () => ({ theme: document.documentElement.dataset.theme, palette: document.documentElement.dataset.palette,
    canvas: document.documentElement.dataset.canvas, sidebar: document.documentElement.dataset.sidebar, rail: document.documentElement.dataset.rail,
    colour: document.querySelector('meta[name="theme-color"]').content, cached: JSON.parse(localStorage.getItem("look")) });
  const scrollTop = () => tab.evaluate(() => document.querySelector("#workspace-content").scrollTop);
  try {
    await tab.emulate({ colorScheme: "light" });
    await tab.addInitScript(`
      if (!sessionStorage.getItem('skin-check-started')) {
        localStorage.setItem('look', JSON.stringify({palette:'midnight',theme:'dark',canvas:'stars',sidebar:'ink',density:'comfortable'}));
        sessionStorage.setItem('skin-check-started', 'yes');
      }
      window.__skinStartup = [];
      new MutationObserver(() => {
        const root = document.documentElement;
        if (root?.dataset.theme && window.__skinStartup.length < 3)
          window.__skinStartup.push({theme:root.dataset.theme,palette:root.dataset.palette,canvas:root.dataset.canvas,loaded:!!document.querySelector('#workspace-content')});
      }).observe(document, {subtree:true,attributes:true,attributeFilter:['data-theme','data-palette','data-canvas']});
    `);
    url.search = new URLSearchParams({ fresh: "", today: new Date().toLocaleDateString("en-CA") }).toString();
    await tab.goto(url.href);
    await tab.run(async ({ page }) => { await page.waitForSelector("#workspace-content", { timeout: 60000 }); }, { timeout: 90 });
    assert.deepEqual(await tab.evaluate(() => window.__skinStartup[0]), { theme: "dark", palette: "midnight", canvas: "stars", loaded: false },
      "cached paint precedes Workspace load");

    await openSettings();
    await tab.click(theme("garden"));
    await tab.click(close);
    // Closing ends the hover preview on the next frame (skin.ts), and a scroll before it counts as the preview's own
    // restoration, which is never saved. On a first load in the pinned headless Chrome that frame came late, so this
    // scroll went unsaved and the wait below timed out (2026-11-23): let two frames pass first.
    await tab.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await tab.evaluate(() => { const main = document.querySelector("#workspace-content"); main.scrollTop = main.scrollHeight; });
    const top = await scrollTop();
    assert.ok(top > 0, "the demo page must scroll for the restoration check");
    await tab.run(async ({ page }, expected) => {
      await page.waitForFunction(async (top) => {
        const { sessionStore } = await import("/src/storage.ts");
        return (await sessionStore.load())?.scroll?.today === top;
      }, { timeout: 10000 }, expected);
    }, { args: [top], timeout: 30 });

    await openSettings();
    const saved = (await tab.evaluate(paint)).cached;
    assert.equal(saved.palette, "garden", "a click saves the theme");
    await tab.hover(theme("midnight"));
    let current = await tab.evaluate(paint);
    assert.deepEqual([current.theme, current.palette, current.canvas, current.rail], ["light", "midnight", "stars", "ink"], "a theme previews its palette and surfaces, never the mode");
    assert.equal(current.colour, await tab.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--canvas").trim()), "the browser bar takes the theme's canvas");
    assert.notEqual(current.colour, "#f7f5ef", "Midnight's light canvas is its own");
    assert.deepEqual(current.cached, saved, "pointer preview never enters the startup cache");
    await tab.click(close);
    current = await tab.evaluate(paint);
    assert.deepEqual([current.theme, current.palette, current.canvas, current.sidebar, current.colour], ["light", "garden", "contours", "paper", "#f7f5ef"]);

    await openSettings();
    await tab.focus(theme("tide"));
    assert.equal((await tab.evaluate(paint)).palette, "tide", "focus starts a preview");
    // Check absence over real browser frames, including the 180ms scroll-save debounce.
    await tab.run(async ({ page }, expected) => {
      await page.evaluate(async (top) => {
        const { sessionStore } = await import("/src/storage.ts");
        const until = performance.now() + 350;
        do {
          if ((await sessionStore.load())?.scroll?.today !== top) throw new Error("A preview overwrote saved scroll.");
          await new Promise(requestAnimationFrame);
        } while (performance.now() < until);
      }, expected);
    }, { args: [top], timeout: 30 });
    await tab.focus(close);
    await tab.run(async ({ page }, expected) => {
      await page.waitForFunction((top) => document.querySelector("#workspace-content").scrollTop === top, {}, expected);
    }, { args: [top], timeout: 30 });
    assert.equal((await tab.evaluate(paint)).palette, "garden", "blur restores the saved theme");

    await tab.click("#panel-tab-canvas");
    await tab.focus('[role="group"][aria-label="Sidebar"] button:nth-child(2)');
    assert.equal((await tab.evaluate(paint)).sidebar, "sage");
    await tab.hover('.pattern-tile[data-pattern="doodles"]');
    current = await tab.evaluate(paint);
    assert.equal(current.canvas, "doodles");
    assert.deepEqual(current.cached, saved, "individual previews do not persist");
    await tab.click("#panel-tab-appearance");
    await tab.click(mode("Dark"));
    await tab.click(theme("midnight"));
    await tab.click(close);
    await tab.reload();
    await tab.run(async ({ page }) => { await page.waitForSelector("#workspace-content", { timeout: 60000 }); }, { timeout: 90 });
    current = await tab.evaluate(paint);
    assert.deepEqual([current.theme, current.palette, current.canvas, current.cached.theme, current.cached.palette, current.cached.canvas],
      ["dark", "midnight", "stars", "dark", "midnight", "stars"], "a click saves the theme and the mode across reload");

    await openSettings();
    await tab.click(mode("Auto"));
    await tab.click(close);
    for (const scheme of ["light", "dark"]) {
      await tab.emulate({ colorScheme: scheme });
      await tab.run(async ({ page }, expected) => {
        await page.waitForFunction((scheme) => document.documentElement.dataset.theme === scheme, {}, expected);
      }, { args: [scheme], timeout: 30 });
      assert.equal((await tab.evaluate(paint)).cached.theme, "system");
    }
    await openSettings();
    await tab.hover(theme("meadow"));
    await tab.emulate({ colorScheme: "light" });
    current = await tab.evaluate(paint);
    assert.deepEqual([current.theme, current.palette], ["light", "meadow"], "a previewed theme follows the device's mode");
    await tab.click(close);
    assert.equal((await tab.evaluate(paint)).palette, "midnight", "closing ends the preview");
    assert.deepEqual((await tab.errors()).entries, [], "no browser errors");
    return { passed: ["cached startup", "pointer and focus previews", "cancel", "preview scroll exclusion and restoration", "save and reload", "mode follows the device under a preview"] };
  } finally {
    await tab.close();
  }
}
