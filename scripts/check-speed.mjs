import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Interaction budgets, in milliseconds from input to the next paint (Event Timing's duration, the measure behind INP),
 * at 1440×900 with the CPU throttled 4×: roughly a mid-range laptop. Medians of five. `demo` is the demo seed (`?fresh`),
 * `large` the demo plus a year of records (`?fresh=large`, dev/large: 2,000 resources, 500 tasks, 60 more projects).
 * Calibrated on drdoom on 2026-11-13 at about 1.5 times the slower of two runs, since runs vary by a third: demo (theme
 * 64, dial 20, project 64, Today 312, domain 392, Health's resources 128, chat 168 and 144, search 200, a keystroke 56),
 * large (theme 64, dial 14, project 88, Today 440, domain 360, resources 328, chat 152 and 168, search 208, a keystroke
 * 64). A ratchet: when you make something faster, lower its budget. Run it on an idle machine: other dev servers and
 * browser checks running beside it doubled Today the same day (680 to 1030 ms). A slower machine reads higher, so
 * compare against a run of `main` on the same machine.
 */
export const budgets = {
  demo: { theme: 100, dial: 50, project: 100, today: 500, domain: 600, resources: 200, chatOpen: 250, chatClose: 250, search: 300, typing: 100 },
  large: { theme: 100, dial: 50, project: 150, today: 700, domain: 550, resources: 500, chatOpen: 250, chatClose: 250, search: 350, typing: 100 },
};

// The real path: reached through a junction (C:\dev → D:\dev here), Vite sees index.html outside its root and fails.
const root = realpathSync.native(join(dirname(fileURLToPath(import.meta.url)), ".."));
// Vite through node itself, as compareSpeed runs it: a `pnpm exec` under a shell failed where the pnpm shim on PATH was
// broken (2026-11-21).
const run = (args, options = {}) => spawn(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), ...args], { cwd: root, ...options });
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer().listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); }).on("error", reject);
});
/** Stops the preview and anything it started. */
const stop = (child) => {
  if (process.platform === "win32") { try { execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* already gone */ } }
  else child.kill();
};

/**
 * Run from OMP Eval with its browser object. Builds production in `--mode speed` (the production build plus dev/large,
 * the large seed) into a temporary folder and serves it on a port no build has used (the PWA's service worker would
 * otherwise serve an older build), never the dev server: React's dev mode is several times slower. Times each
 * interaction in `budgets` on each seed and throws naming every one over budget. Owns and closes its tabs and server.
 * Pass `origin` to time an already served speed build instead; `seeds` to time only some.
 */
export async function checkSpeed(browser, { origin, cpu = 4, reps = 5, seeds = Object.keys(budgets) } = {}) {
  let server, out, tab;
  try {
    if (!origin) {
      out = mkdtempSync(join(tmpdir(), "atlaswork-speed-"));
      await new Promise((resolve, reject) => run(["build", "--mode", "speed", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { stdio: "inherit" })
        .on("exit", (code) => code ? reject(new Error(`vite build exited ${code}`)) : resolve()));
      const port = await freePort();
      server = run(["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--outDir", out]);
      origin = `http://127.0.0.1:${port}/`;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("vite preview did not start")), 30000);
        server.stdout.on("data", (chunk) => { if (String(chunk).includes(String(port))) { clearTimeout(timer); resolve(); } });
      });
    }
    const results = {};
    for (const seed of seeds) {
      tab = await browser.open({ name: `speed-check-${seed}-${Date.now()}`, url: "about:blank", app: "chromium", viewport: { width: 1440, height: 900 } });
      results[seed] = await timeInteractions(tab, new URL(`?fresh${seed === "demo" ? "" : `=${seed}`}&today=2026-11-08`, origin).href, { cpu, reps, budget: budgets[seed] });
      await tab.close();
      tab = undefined;
    }
    const over = Object.entries(results).flatMap(([seed, timed]) => Object.entries(timed).filter(([, { ms, budget }]) => ms > budget)
      .map(([name, { ms, budget }]) => `${seed} ${name} ${ms} ms (budget ${budget})`));
    if (over.length) throw new Error(`Over budget at ${cpu}× CPU: ${over.join(", ")}\n${JSON.stringify(results)}`);
    return results;
  } finally {
    await tab?.close();
    if (server) stop(server);
    if (out) rmSync(out, { recursive: true, force: true });
  }
}

/** Opens `url` in `tab` and returns each interaction's median input-to-next-paint beside its budget. */
async function timeInteractions(tab, url, { cpu, reps, budget }) {
  await tab.goto(url);
  if (await tab.evaluate(() => !!document.querySelector('script[src*="@vite/client"]')))
    throw new Error("That origin is a dev server. Time a production build: React's dev mode is several times slower.");
  await tab.waitForSelector(".app-header .theme-toggle", { timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await tab.emulate({ cpuThrottling: cpu });
  /** Runs `act` once and returns the longest input's input-to-next-paint, after the page settles. */
  const time = async (act, settle = 900) => {
    await tab.evaluate(() => {
      window.__speed?.disconnect();
      window.__durations = [];
      window.__speed = new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (entry.interactionId) window.__durations.push(entry.duration); });
      window.__speed.observe({ type: "event", durationThreshold: 16 });
    });
    await act();
    await new Promise((resolve) => setTimeout(resolve, settle));
    return tab.evaluate(() => Math.max(16, ...window.__durations));
  };
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const samples = Object.fromEntries(Object.keys(budget).map((name) => [name, []]));
  const xpath = (cls, text) => `xpath///*[contains(@class,'${cls}') and contains(., '${text}')]`;
  for (let rep = 0; rep < reps; rep++) {
    // The dial: from pointer down to its first turned frame, read on the main thread.
    await tab.run(async ({ page }) => { await page.mouse.move(5, 5); });
    await tab.evaluate(() => {
      const dial = document.querySelector(".app-header .theme-dial");
      const start = getComputedStyle(dial).transform;
      window.__dial = { down: 0, turned: 0 };
      document.querySelector(".app-header .theme-toggle").addEventListener("pointerdown", () => { window.__dial.down = performance.now(); }, { once: true, capture: true });
      const tick = () => {
        if (window.__dial.down && getComputedStyle(dial).transform !== start) window.__dial.turned = performance.now();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    samples.theme.push(await time(() => tab.click(".app-header .theme-toggle"), 1200));
    samples.dial.push(await tab.evaluate(() => window.__dial.turned - window.__dial.down));
    samples.project.push(await time(() => tab.click(xpath("nav-item", "Home office corner"))));
    samples.today.push(await time(() => tab.click(".today-button")));
    samples.domain.push(await time(() => tab.click(xpath("domain-chip", "Health"))));
    // Health's whole shelf: hundreds of resources on the large seed.
    samples.resources.push(await time(() => tab.click("xpath///*[contains(@class,'domain-sections')]/button[contains(., 'Resources')]")));
    await tab.click(".domain-sections button:first-child");
    await new Promise((resolve) => setTimeout(resolve, 900));
    samples.domain.push(await time(() => tab.click(xpath("domain-chip", "Everyday"))));
    samples.chatOpen.push(await time(() => tab.click(".atlas-button"), 1200));
    samples.typing.push(await time(async () => {
      await tab.focus(".agent-panel textarea");
      for (const key of "hello") await tab.press(key);
    }));
    await tab.evaluate(() => { const box = document.querySelector(".agent-panel textarea"); box.select(); });
    await tab.press("Backspace");
    samples.chatClose.push(await time(() => tab.click('.agent-panel [aria-label="Close chat"]'), 1200));
    samples.search.push(await time(() => tab.press("Control+k")));
    await tab.press("Escape");
  }
  return Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, { ms: Math.round(median(values)), budget: budget[name], samples: values }]));
}

/**
 * The same ten interactions, timed on this checkout and on `base` (a git ref, `origin/main` by default) in turns, so a
 * busy or slower machine weighs on both alike: the budgets above only hold on an idle drdoom, and on 2026-11-17 one
 * build of `main` read Today at 776 ms and then 2,056 ms minutes apart. Builds both in `--mode speed` (the base from a
 * temporary worktree that borrows this checkout's node_modules, so a base with other dependencies needs its own
 * install), serves them on unused ports, and alternates base and this checkout for `rounds` rounds of one rep each.
 * Flags every interaction this checkout makes more than `tolerance` slower and at least 32 ms slower than the base, by
 * the medians, then times the seeds again and throws naming only those slow both times: on 2026-11-21 one pass flagged
 * opening a project at 1.7× and the next the theme dial at 1.88× with the project at 0.88×, noise either way. Returns
 * both medians and the ratio for each, from the first pass. Owns and closes its worktree, servers and tabs.
 */
export async function compareSpeed(browser, { base = "origin/main", seeds = ["demo"], rounds = 5, cpu = 4, tolerance = 1.25 } = {}) {
  const servers = [];
  const folders = [];
  let worktree, tab;
  try {
    worktree = mkdtempSync(join(tmpdir(), "atlaswork-base-"));
    rmSync(worktree, { recursive: true, force: true });
    execFileSync("git", ["worktree", "add", "--detach", worktree, base], { cwd: root, stdio: "ignore" });
    // Windows needs a junction rather than a symlink to borrow a folder without elevated rights.
    if (process.platform === "win32") execFileSync("cmd", ["/c", "mklink", "/J", join(worktree, "node_modules"), join(root, "node_modules")], { stdio: "ignore" });
    else execFileSync("ln", ["-s", join(root, "node_modules"), join(worktree, "node_modules")]);
    const origins = {};
    // Vite itself, by node, never `pnpm exec`: in a worktree pnpm reinstalls first, which reached through the junction
    // and pruned this checkout's node_modules (2026-11-17).
    const vite = (args, options) => spawn("node", [join(root, "node_modules", "vite", "bin", "vite.js"), ...args], options);
    for (const [name, cwd] of [["base", worktree], ["branch", root]]) {
      const out = mkdtempSync(join(tmpdir(), `atlaswork-speed-${name}-`));
      folders.push(out);
      await new Promise((resolve, reject) => vite(["build", "--mode", "speed", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { cwd, stdio: "inherit" })
        .on("exit", (code) => code ? reject(new Error(`vite build of ${name} exited ${code}`)) : resolve()));
      const port = await freePort();
      const server = vite(["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--outDir", out], { cwd });
      servers.push(server);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`vite preview of ${name} did not start`)), 30000);
        server.stdout.on("data", (chunk) => { if (String(chunk).includes(String(port))) { clearTimeout(timer); resolve(); } });
      });
      origins[name] = `http://127.0.0.1:${port}/`;
    }
    const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    /** One pass: `rounds` alternating rounds per seed, medians and ratios per interaction. */
    const measure = async () => {
      const results = {};
      for (const seed of seeds) {
        const samples = { base: {}, branch: {} };
        for (let round = 0; round < rounds; round++) {
          // Each round swaps who goes first, so whatever drifts over a round (a warming CPU, a browser growing) falls on both.
          for (const name of round % 2 ? ["branch", "base"] : ["base", "branch"]) {
            tab = await browser.open({ name: `speed-compare-${name}-${Date.now()}`, url: "about:blank", app: "chromium", viewport: { width: 1440, height: 900 } });
            const url = new URL(`?fresh${seed === "demo" ? "" : `=${seed}`}&today=2026-11-08`, origins[name]).href;
            const timed = await timeInteractions(tab, url, { cpu, reps: 1, budget: budgets[seed] });
            for (const [interaction, { samples: values }] of Object.entries(timed)) (samples[name][interaction] ??= []).push(...values);
            await tab.close();
            tab = undefined;
          }
        }
        results[seed] = Object.fromEntries(Object.keys(samples.base).map((interaction) => {
          const was = median(samples.base[interaction]), now = median(samples.branch[interaction]);
          return [interaction, { base: Math.round(was), branch: Math.round(now), ratio: Math.round((now / was) * 100) / 100 }];
        }));
      }
      return results;
    };
    const slowIn = (results) => Object.entries(results).flatMap(([seed, timed]) => Object.entries(timed)
      .filter(([, { base: was, branch: now }]) => now > was * tolerance && now - was >= 32)
      .map(([interaction, { base: was, branch: now }]) => ({ key: `${seed} ${interaction}`, said: `${seed} ${interaction} ${was} → ${now} ms` })));
    const results = await measure();
    const flagged = slowIn(results);
    if (!flagged.length) return results;
    const again = await measure();
    const confirmed = slowIn(again).filter(({ key }) => flagged.some((first) => first.key === key));
    if (confirmed.length) throw new Error(`Slower than ${base} at ${cpu}× CPU, twice: ${confirmed.map(({ said }) => said).join(", ")}\n${JSON.stringify({ results, again })}`);
    return { ...results, noise: flagged.map(({ said }) => said) };
  } finally {
    await tab?.close();
    for (const server of servers) stop(server);
    for (const folder of folders) rmSync(folder, { recursive: true, force: true });
    if (worktree) {
      // Remove the junction first, so deleting the worktree never reaches into this checkout's node_modules.
      if (process.platform === "win32") { try { execFileSync("cmd", ["/c", "rmdir", join(worktree, "node_modules")], { stdio: "ignore" }); } catch { /* not made */ } }
      else rmSync(join(worktree, "node_modules"), { force: true });
      try { execFileSync("git", ["worktree", "remove", "--force", worktree], { cwd: root, stdio: "ignore" }); } catch { rmSync(worktree, { recursive: true, force: true }); }
    }
  }
}
