import assert from "node:assert/strict";
import { openCheckTab } from "./check-tab.mjs";

/**
 * Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tab.
 * Exercises briefs (agents-design D40) in a Portuguese browser: a starter project's welcome with the starter's tip and
 * an English date, one face per agent on screen, Got it holding through a reload, Today's cards, a brief hushed while
 * the chat panel shows its agent, and Not now holding through a reload until the speech icon brings it back.
 */
export async function checkBriefs(browser, origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin. This check resets its records.");
  const tab = await openCheckTab(browser, "briefs-check");
  const until = (predicate, arg, timeout = 15000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value)
      .catch((error) => { throw new Error(`Timed out waiting for ${source}: ${error.message}`); });
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 });
  /** Clicks the first visible button whose text is (or, with `ends`, ends with) `text`. */
  const press = (text, ends = false) => tab.evaluate((text, ends) => {
    const button = [...document.querySelectorAll("button")].find((item) => item.offsetWidth && (ends ? item.textContent.trim().endsWith(text) : item.textContent.trim() === text));
    if (!button) throw new Error(`No button “${text}”`);
    button.click();
  }, text, ends);
  const click = (selector) => tab.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`No element for ${selector}`);
    el.click();
  }, selector);
  /**
   * What the page shows of briefs. `faces`: for each agent speaking in a brief (a bubble or a Today card), how often its
   * portrait shows where agents are presented, the header's chat button, the masthead and Today's cards and chat row.
   * Task attribution marks and the chat panel are outside it.
   */
  const screen = () => tab.evaluate(() => {
    const brief = document.querySelector(".project-brief");
    const file = (img) => img.src.split("/").pop();
    const speakers = [...document.querySelectorAll(".project-brief .guide-face img, .crew-step > img, .crew-news > img")].filter((img) => img.offsetWidth).map(file);
    const shown = [...document.querySelectorAll(".app-header img, .project-masthead img, .project-brief img, .today-crew img")]
      .filter((img) => img.offsetWidth && !img.closest(".crew-picker")).map(file);
    return {
      title: brief?.querySelector("strong")?.textContent ?? null,
      tips: [...document.querySelectorAll(".brief-tips li")].map((tip) => tip.textContent),
      note: document.querySelector(".brief-note")?.tagName ?? null,
      faces: Object.fromEntries(speakers.map((face) => [face, shown.filter((other) => other === face).length])),
      speaking: !!document.querySelector(".crew-speaking"),
      stage: document.querySelector(".masthead-stage")?.textContent ?? "",
      cards: [...document.querySelectorAll(".crew-step .crew-step-who strong, .crew-news strong")].map((name) => name.textContent),
    };
  });
  const repeated = (faces) => Object.entries(faces).filter(([, count]) => count !== 1).map(([face]) => face);
  try {
    // A Portuguese browser: every date the app writes must still be English (model.ts `locale`).
    await tab.emulate({ locale: "pt-PT" });
    url.search = new URLSearchParams({ fresh: "", today: new Date().toLocaleDateString("en-CA") }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector(".overview-page"), null, 60000);

    // Today: the crew's steps and news, each face once on screen.
    let seen = await screen();
    assert.ok(seen.cards.length > 0, "Today has agents with news");
    assert.deepEqual(repeated(seen.faces), [], "each face shows once on Today");

    // Health's "Annual check-ups done": Vital welcomes it with the starter's tip and an English due date.
    await press("Health", true);
    await until(() => document.querySelector(".collection-page h1")?.textContent.includes("Health"));
    // Health has four projects, so its ideas start folded to their heading (D62).
    await click(".project-ideas-toggle");
    await until(() => [...document.querySelectorAll(".project-idea")].some((button) => button.textContent.startsWith("Annual check-ups done")));
    await tab.evaluate(() => [...document.querySelectorAll(".project-idea")].find((button) => button.textContent.startsWith("Annual check-ups done")).click());
    await until(() => !!document.querySelector(".project-form"));
    await tab.evaluate(() => document.querySelector(".project-form button[type=submit]").click());
    await until(() => document.querySelectorAll(".brief-tips li").length === 3 && !document.querySelector(".brief-tips[hidden]"));
    seen = await screen();
    assert.equal(seen.title, "Hi, I'm Vital");
    assert.match(seen.tips[0], /, due (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.$/, "the first step's day, in English");
    assert.equal(seen.tips[1], "Book the dentist first. It usually has the longest wait.", "the starter's own tip");
    assert.equal(seen.speaking, true, "the band shows a speech mark while Vital speaks");
    assert.deepEqual(repeated(seen.faces), [], "Vital's face shows once");
    assert.match(seen.stage, /next due (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2}/, "the masthead's day, in English");

    // Got it ends the welcome, through a reload.
    await press("Got it");
    await until(() => !document.querySelector(".brief-tips"));
    await tab.reload();
    await until(() => !!document.querySelector(".project-masthead"), null, 60000);
    assert.equal((await screen()).tips.length, 0, "the welcome stays done");

    // Studio relaunch is behind: Spark's brief, hushed while the chat panel shows Spark.
    await press("Career", true);
    await until(() => document.querySelector(".collection-page h1")?.textContent.includes("Career"));
    await press("Studio relaunch");
    await until(() => document.querySelector(".project-brief strong")?.textContent === "We're behind");
    assert.deepEqual(repeated((await screen()).faces), [], "each face shows once on the project");
    await click(".atlas-button");
    await until(() => !document.querySelector(".project-brief") && document.querySelector(".brief-note")?.tagName === "SPAN");
    await click('.agent-panel button[aria-label="Close chat"]');
    await until(() => document.querySelector(".project-brief strong")?.textContent === "We're behind");

    // Not now holds through a reload; the speech icon brings the brief back.
    await click(".brief-dismiss");
    await until(() => document.querySelector(".brief-note")?.tagName === "BUTTON");
    await tab.reload();
    await until(() => !!document.querySelector(".project-masthead"), null, 60000);
    assert.equal((await screen()).title, null, "the dismissal holds");
    await click("button.brief-note");
    await until(() => document.querySelector(".project-brief strong")?.textContent === "We're behind");
    assert.deepEqual((await tab.errors()).entries, [], "no browser errors");
    return { passed: ["Today one face each", "welcome with starter tip", "English dates in pt-PT", "one face on the band", "Got it holds", "hushed beside chat", "Not now holds"] };
  } finally {
    await tab.close();
  }
}
