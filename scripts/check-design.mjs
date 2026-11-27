import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

// Pinned so a new detector rule can't fail a release by surprise; bump it on purpose.
const impeccable = "impeccable@4.9.2";

/** Screens by URL (src/tabs.ts `fromUrl`) on the demo seed. Phones skip Chats: its history drawer opens over the
 * conversation there, so every overlap rule fires on the covered page. */
const screens = { today: "", project: "tab=project:demo-cooking", library: "view=library", chats: "view=chats", agents: "view=agents", routines: "view=routines" };
const phoneless = new Set(["chats"]);

/**
 * A dev server builds each module on first request, and a cold one (a fresh worktree) takes longer than the detector's
 * 30-second navigation timeout. Fetch the page and every module it imports, as a browser would, before scanning.
 */
async function warm(origin) {
  const queue = ["/"];
  const seen = new Set(queue);
  while (queue.length) {
    const batch = queue.splice(0, 8);
    await Promise.all(batch.map(async (path) => {
      // Warming is best effort: a module that fails here fails the scan that needs it, with the detector's message.
      const text = await fetch(new URL(path, origin)).then((response) => response.text(), () => "");
      for (const [, next] of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*|<script[^>]*\bsrc=)["'](\/[^"'?#]+(?:\?[^"'#]*)?)["']/g)) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }));
  }
  return seen.size;
}

/**
 * impeccable's detector (DEVELOPMENT.md, "Design check") on each screen at desktop and phone widths, plus the landing page.
 * Throws on any finding that isn't advisory or ignored in .impeccable/config.json. Takes 3 to 6 minutes.
 * The browser argument is unused: the detector drives its own headless Chrome or Edge.
 */
export async function checkDesign(_browser, origin) {
  const scans = { landing: ["landing/index.html"] };
  for (const [screen, query] of Object.entries(screens)) {
    const url = `${new URL(origin).origin}/?fresh&today=${new Date().toLocaleDateString("en-CA")}${query && `&${query}`}`;
    scans[`${screen} desktop`] = ["--viewport", "1280x800", url];
    if (!phoneless.has(screen)) scans[`${screen} phone`] = ["--viewport", "390x844", url];
  }
  await warm(new URL(origin).origin);
  const results = {};
  const fresh = [];
  for (const [name, target] of Object.entries(scans)) {
    // shell: npx is a .cmd on Windows; quote each argument for it.
    const run = spawnSync("npx", ["-y", impeccable, "detect", "--json", "--no-advisory", ...target].map((a) => `"${a}"`), { cwd: root, encoding: "utf8", shell: true });
    if (run.status !== 0 && run.status !== 2) throw new Error(`impeccable detect ${name} failed (${run.status}): ${run.stderr}`);
    const findings = JSON.parse(run.stdout || "[]").map((f) => `${f.antipattern} ${f.selector ?? f.file}`);
    results[name] = findings;
    fresh.push(...findings.map((f) => `${name}: ${f}`));
  }
  if (fresh.length) throw new Error(`New design findings:\n${fresh.join("\n")}\nRun impeccable detect on the page for details.`);
  return results;
}
