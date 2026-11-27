import assert from "node:assert/strict";
import { openCheckTab } from "./check-tab.mjs";

/**
 * Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tab.
 * Every page opens with the same band (PageBand.tsx, docs/page-design.md): Domains, Projects, Library, Archive,
 * Routines and Agents each show one that spans the content, keeps to two rows, shows its whole title and keeps its
 * actions clear of it. Then a domain page and a project page (D32, D36, D38, D62): the domain title's pencil opens the
 * domain dialog; with two projects the domain's ideas fold to their heading, which opens them, More ideas included; the
 * project band's chat button is faces only and opens the project's thread; the page's grid leaves no half-empty rows,
 * a countdown's quick picks set a date and the band never scrolls sideways, in light and dark.
 */
export async function checkPages(browser, origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin. This check resets its records.");
  const tab = await openCheckTab(browser, "pages-check");
  const until = (predicate, arg, timeout = 15000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value)
      .catch((error) => { throw new Error(`Timed out waiting for ${source}: ${error.message}`); });
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 });
  const click = (selector) => tab.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`No element for ${selector}`);
    el.click();
  }, selector);
  /** The band on screen: its box against the content area's, and for a project its chat button and stage. */
  const masthead = (selector) => tab.evaluate((selector) => {
    const band = document.querySelector(selector);
    const main = document.querySelector(".workspace-content");
    const chat = band.querySelector(".crew-chat");
    return {
      scrollLeft: band.scrollLeft, height: Math.round(band.getBoundingClientRect().height),
      width: Math.round(band.getBoundingClientRect().width), mainWidth: Math.round(main.clientWidth),
      chatLabel: chat?.getAttribute("aria-label"), chatText: chat?.textContent.trim(),
      stage: band.querySelector(".stage-chip")?.textContent,
    };
  }, selector);
  /** Each grid row as the columns its blocks fill, from their boxes: a 12 means the row is full. */
  const rows = () => tab.evaluate(() => {
    const grid = document.querySelector(".page-grid");
    const left = grid.getBoundingClientRect().left, width = grid.getBoundingClientRect().width;
    const byTop = new Map();
    for (const block of grid.querySelectorAll(".page-block")) {
      const box = block.getBoundingClientRect();
      const top = Math.round(box.top);
      byTop.set(top, (byTop.get(top) ?? 0) + box.width);
    }
    return [...byTop.values()].map((filled) => Math.round(filled / width * 12));
  });
  try {
    url.search = new URLSearchParams({ fresh: "", today: new Date().toLocaleDateString("en-CA"), domain: "Everyday" }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector(".project-ideas"), null, 60000);

    // One header standard: every page's band spans the content, keeps to two rows, shows its whole title and keeps its
    // actions to the right of it. A page that goes back to a plain heading fails here.
    for (const view of ["domains", "projects", "library", "archive", "routines", "agents"]) {
      const pageUrl = new URL(url.href);
      pageUrl.searchParams.delete("fresh");
      pageUrl.searchParams.set("view", view);
      await tab.goto(pageUrl.href);
      await until(() => !!document.querySelector(".workspace-content .page-masthead h1")?.textContent, null, 20000);
      const shape = await tab.evaluate(() => {
        const band = document.querySelector(".workspace-content .page-masthead");
        const title = band.querySelector("h1"), actions = band.querySelector(".masthead-actions");
        return {
          title: title.textContent, height: Math.round(band.getBoundingClientRect().height),
          width: Math.round(band.getBoundingClientRect().width), mainWidth: Math.round(document.querySelector(".workspace-content").clientWidth),
          cut: title.scrollWidth > title.clientWidth + 1, titleRight: title.getBoundingClientRect().right,
          actionsLeft: actions.children.length ? actions.getBoundingClientRect().left : Infinity,
        };
      });
      assert.ok(Math.abs(shape.width - shape.mainWidth) <= 12, `${view}: the band ${shape.width} spans the content ${shape.mainWidth}`);
      assert.ok(shape.height <= 130, `${view}: the band keeps to two rows (${shape.height}px)`);
      assert.ok(!shape.cut, `${view}: the title "${shape.title}" shows whole`);
      assert.ok(shape.actionsLeft >= shape.titleRight, `${view}: the actions sit right of the title`);
    }
    await tab.goto(url.href);
    await until(() => !!document.querySelector(".project-ideas"), null, 60000);

    // The domain page wears the two-row band, and the pencil after its name opens the domain's dialog (D38).
    let band = await masthead(".domain-masthead");
    assert.ok(Math.abs(band.width - band.mainWidth) <= 12, `the domain band ${band.width} spans the content ${band.mainWidth}`);
    assert.ok(band.height <= 130, `the domain band keeps to two rows (${band.height}px)`);
    await click(".domain-masthead .title-edit");
    await until(() => !!document.querySelector("dialog[open]")?.textContent.includes("Tend Everyday"));
    await click("dialog[open] [aria-label='Close dialog']");
    await until(() => !document.querySelector("dialog[open]"));

    // Everyday has three projects, so its ideas start folded to their heading, which opens them (D62).
    assert.equal(await tab.evaluate(() => document.querySelector(".project-ideas-toggle")?.getAttribute("aria-expanded")), "false", "ideas fold once a domain has two projects");
    await click(".project-ideas-toggle");
    await until(() => !!document.querySelector(".project-idea-more"));

    // Build the Everyday starter "Host a celebration" (countdown, Next up, checklist, tasks, resources): its idea on
    // the domain page opens the project dialog filled in, and Start builds it (agents-design D62).
    await until(() => [...document.querySelectorAll(".project-idea")].some((button) => button.textContent.includes("Host a celebration")));
    await tab.evaluate(() => [...document.querySelectorAll(".project-idea")].find((button) => button.textContent.includes("Host a celebration")).click());
    await until(() => !!document.querySelector(".project-form"));
    await tab.evaluate(() => document.querySelector(".project-form button[type=submit]").click());
    await until(() => !!document.querySelector(".project-masthead"));

    // Two rows, faces only on the chat button with its words as the tooltip; the band spans the content area.
    band = await masthead(".project-masthead");
    assert.equal(band.chatText, "", "the chat button shows faces, no words");
    assert.match(band.chatLabel, /^(Chat with |Open the room)/);
    assert.equal(band.stage, "Just planted", "nothing done is just planted");
    assert.ok(Math.abs(band.width - band.mainWidth) <= 12, `band ${band.width} spans the content ${band.mainWidth}`);
    assert.ok(band.height <= 130, `the project band keeps to two rows (${band.height}px)`);
    // The grid leaves no half-empty rows.
    assert.deepEqual((await rows()).filter((row) => row !== 12), [], "every grid row is full");

    // Quick picks set the finish line; the stage line then says how many steps are done.
    await click(".date-pick");
    await until(() => !!document.querySelector(".countdown-figure"));
    assert.match(await tab.evaluate(() => document.querySelector(".countdown-figure").textContent), /days to go/);
    assert.equal((await masthead(".project-masthead")).scrollLeft, 0, "the band never scrolls sideways");

    // The chat button opens the project's thread in the panel.
    await tab.evaluate(() => [...document.querySelectorAll(".sidebar button")].find((button) => button.textContent.trim() === "Lisbon photo walks").click());
    await until(() => document.querySelector(".project-masthead h1")?.textContent === "Lisbon photo walks");
    await click(".project-masthead .crew-chat");
    await until(() => document.querySelector(".agent-header strong")?.textContent === "Muse");

    // The other theme keeps the same layout.
    const height = (await masthead(".project-masthead")).height;
    const before = await tab.evaluate(() => document.documentElement.dataset.theme);
    await click('button[aria-label^="Switch to"]');
    await until((was) => document.documentElement.dataset.theme !== was, before);
    assert.equal((await masthead(".project-masthead")).height, height, "the other theme keeps the band's height");
    assert.deepEqual((await tab.errors()).entries, [], "no browser errors");
    return { passed: ["one band on every page", "domain band and pencil", "ideas fold and open", "faces-only chat", "two-row bands", "full grid rows", "quick pick date", "chat opens thread", "other theme"] };
  } finally {
    await tab.close();
  }
}
