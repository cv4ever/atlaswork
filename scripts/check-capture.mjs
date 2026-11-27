import assert from "node:assert/strict";
import { openCheckTab } from "./check-tab.mjs";

/**
 * Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tab.
 * Exercises Capture (agents-design D53): the "Capture to" place in the header with recent places first and All places,
 * Save as a task due tomorrow with its Undo, the choice remembered for the next capture, a quote saved with Enter, a
 * project named by the words, and on a phone a saved note that leaves you where you were with Open in its toast.
 */
export async function checkCapture(browser, origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin. This check resets its records.");
  const tab = await openCheckTab(browser, "capture-check");
  await tab.addInitScript(`for (const key of ["atlaswork.capture-draft", "atlaswork.capture-kind", "atlaswork.capture-places"]) localStorage.removeItem(key);`);
  const until = (predicate, arg, timeout = 15000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value);
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 });
  const click = (selector) => tab.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`No element for ${selector}`);
    el.click();
  }, selector);
  const fill = (value) => tab.evaluate((value) => {
    const el = document.querySelector(".capture-field");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }, value);
  // Save as's rows by their bold label ("Task", "Quote", "Project").
  const saveAs = async (label) => {
    if (!await tab.evaluate(() => !!document.querySelector("#capture-kinds"))) await click(".capture-kind");
    await until(() => !!document.querySelector("#capture-kinds"));
    await tab.evaluate((label) => [...document.querySelectorAll("#capture-kinds > button")]
      .find((button) => button.querySelector("strong")?.textContent === label).click(), label);
  };
  const text = (selector) => tab.evaluate((selector) => document.querySelector(selector)?.textContent ?? "", selector);
  const open = async (phone = false) => {
    if (phone) await click(".phone-capture");
    else await tab.press("c");
    await until(() => !!document.querySelector("dialog[open] .capture-form"));
  };
  const toast = () => until(() => !!document.querySelector(".toast")?.textContent).then(() => text(".toast"));
  const day = "2026-11-17";
  try {
    url.search = new URLSearchParams({ fresh: "", today: day }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector(".sidebar"), null, 60000);

    // The header names where it goes; the field's Save as starts on what the words look like.
    await open();
    assert.match(await text("dialog[open] .dialog-head"), /Capture\s*to\s*.*Everyday/);
    assert.match(await text(".capture-kind"), /Save as.*Note/);

    // Save as Task: due today by default, Tomorrow picked from the day tiles, added with Undo.
    await fill("Book the boiler service");
    await saveAs("Task");
    await until(() => document.querySelector("dialog[open] .day-tile[aria-checked=true]")?.textContent.startsWith("Today"));
    await click("dialog[open] .day-tile:nth-child(2)");
    await click(".capture-actions .primary-button");
    assert.match(await toast(), /Added “Book the boiler service” to .*Everyday for tomorrow/);
    await tab.evaluate(() => [...document.querySelectorAll(".toast button")].find((button) => button.textContent === "Undo").click());
    await until(() => document.querySelector(".toast")?.textContent.includes("Taken back"));

    // Task stays the choice next time; the place pill unfolds recent places, then All places, and a pick folds it.
    await open();
    assert.match(await text(".capture-kind"), /Task/);
    await click(".capture-to .capture-toggle");
    await until(() => !!document.querySelector("#capture-places [data-recent] .where-chip[aria-pressed=true]"));
    await tab.evaluate(() => [...document.querySelectorAll("#capture-places .where-chip")].find((chip) => chip.textContent.startsWith("All places")).click());
    await tab.evaluate(() => [...document.querySelectorAll("#capture-places .place-row:not([data-recent]) > .where-chip:first-child")]
      .find((chip) => chip.textContent.includes("Health")).click());
    await until(() => !document.querySelector("#capture-places") && document.querySelector("#capture-to-value").textContent.includes("Health"));

    // A quote, saved with Enter; choosing it clears the remembered Task for Quote.
    await fill("Slow is smooth, smooth is fast");
    await saveAs("Quote");
    await until(() => !!document.querySelector(".capture-source"));
    await tab.focus(".capture-field");
    await tab.press("Enter");
    assert.match(await toast(), /Saved “Slow is smooth, smooth is fast” to .*Health/);

    // Turn it into a project: its form opens named by the words.
    await open();
    await fill("Kitchen renovation");
    await saveAs("Project");
    await until(() => [...document.querySelectorAll("dialog[open] input")].some((input) => input.value === "Kitchen renovation"));
    await tab.press("Escape");

    // On a phone, a saved note leaves you where you were and the toast offers Open.
    await tab.emulate({ viewport: { width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true } });
    await tab.reload();
    await until(() => !!document.querySelector(".phone-nav"), null, 60000);
    const before = new URL(await tab.url()).searchParams.get("view");
    await open(true);
    await saveAs("Note");
    await fill("A bench under the olive tree");
    await click(".capture-actions .primary-button");
    assert.match(await toast(), /Open/);
    assert.equal(new URL(await tab.url()).searchParams.get("view"), before, "the page stays put");

    assert.equal((await tab.errors()).entries.length, 0, "no browser errors");
    return { passed: ["header place", "task due tomorrow and Undo", "remembered choice", "recent and all places", "quote with Enter", "project named by the words", "phone stays put"] };
  } finally {
    await tab.close();
  }
}
