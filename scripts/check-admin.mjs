import assert from "node:assert/strict";
import { openCheckTab } from "./check-tab.mjs";

/**
 * Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tab.
 * Exercises the admin page (README, "Admin page") without writing anything: Agents draws Vital's prompt, a draft of
 * his house rules marks the line it changes and the roster's dot until Revert, the workspace switch rebuilds the
 * prompt, a ground rule's wording draft is marked and discarded, a profile line jumps to its field, the sample
 * person's rules for every agent reach the prompt, Atlas edits all but a hook and line, Try it and Cases open (nothing is
 * sent or run), Changes compares with the last release, Tools measures every permission, Limits describes every key,
 * Operations draws its figures or says how to get them, and the design showcase loads in its frame. Save, Send, Run
 * and Invite are never pressed: they write source, spend a model or email.
 */
export async function checkAdmin(browser, origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin.");
  const tab = await openCheckTab(browser, "admin-check");
  const at = (hash) => tab.goto(new URL(`/dev/admin/#${hash}`, origin).href);
  const text = (selector) => tab.evaluate((selector) => document.querySelector(selector)?.innerText ?? "", selector);
  const count = (selector) => tab.evaluate((selector) => document.querySelectorAll(selector).length, selector);
  const press = (label) => tab.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find((each) => each.textContent.trim() === label);
    if (!button) throw new Error(`No button "${label}"`);
    button.click();
  }, label);
  const typeRules = (value) => tab.evaluate((value) => {
    const area = [...document.querySelectorAll(".admin-field")].find((field) => field.textContent.startsWith("House rules")).querySelector("textarea");
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, value);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
  const result = {};
  try {
    await tab.evaluate(() => sessionStorage.clear()).catch(() => {});
    await at("agents/Vital");
    await tab.waitForSelector(".admin-lines li", { timeout: 60000 });
    await tab.evaluate(() => sessionStorage.clear());
    await tab.reload();
    await tab.waitForSelector(".admin-lines li", { timeout: 60000 });
    assert.match(await text(".admin-lines li"), /You are Vital, Health coach/, "Vital's prompt opens with who he is");
    assert.equal(await count(".admin-lines li[data-changed]"), 0, "no draft yet");

    // A draft marks its line and the roster, and Revert puts both back.
    await typeRules("Check the admin page's draft marking.");
    await tab.waitForSelector(".admin-lines li[data-changed]");
    assert.match(await text(".admin-lines li[data-changed]"), /Check the admin page's draft marking\./, "the changed line is the new house rules");
    assert.equal(await count(".admin-dirty"), 1, "the roster marks the unsaved agent");
    await press("Revert");
    // Other lines never changed, so wait for the draft's marks to go rather than for any unmarked line.
    await tab.run(({ page }) => page.waitForFunction(() => !document.querySelector(".admin-lines li[data-changed], .admin-dirty"), { timeout: 15000 }),
      { timeout: 30 }).catch(() => { throw new Error("Revert clears the draft"); });

    // The workspace switch rebuilds the prompt for a new person's workspace.
    const demo = await text(".admin-prompt-sum");
    await press("New person");
    await tab.waitForSelector(".admin-prompt-sum");
    assert.notEqual(await text(".admin-prompt-sum"), demo, "a new person's workspace gives another prompt");
    assert.match(await text(".admin-prompt-sum"), /a new person's workspace/);
    await press("Demo workspace");

    // A ground rule's wording is a draft for every agent until saved; Discard drops it. Nothing is saved here. The
    // format rule is found by its last words, which outlived its rewrites (D64's Markdown, the language sentence).
    const plain = () => tab.evaluate(() => [...document.querySelectorAll(".admin-lines li")].some((line) => line.innerText.includes("No headings.")));
    await tab.evaluate(() => [...document.querySelectorAll(".admin-lines li")].find((line) => line.innerText.includes("No headings."))
      .querySelector("button[title='Edit this wording']").click());
    await tab.waitForSelector(".admin-line-edit textarea");
    await tab.evaluate(() => {
      const area = document.querySelector(".admin-line-edit textarea");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, `${area.value} Check the admin page's wording draft.`);
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tab.waitForSelector(".admin-pending");
    assert.match(await text(".admin-lines li[data-editing] .admin-line-side"), /Unsaved/, "the edited ground rule is marked unsaved");
    await press("Discard");
    await tab.waitForSelector(".admin-lines li:not([data-changed])");
    assert.equal(await count(".admin-pending"), 0, "Discard drops the wording draft");
    await press("Done");
    assert.ok(await plain(), "the ground rule is back");

    // A profile line jumps to its field; the sample person adds the lines a person writes.
    await tab.evaluate(() => [...document.querySelectorAll(".admin-lines li")].find((line) => line.innerText.startsWith("The person's instructions"))
      .querySelector("button[title='Change in their profile']").click());
    assert.equal(await tab.evaluate(() => new Promise((done) => setTimeout(() => done(document.activeElement?.id), 400))), "field-instructions", "the house-rules line focuses the house rules");
    await tab.evaluate(() => [...document.querySelectorAll(".admin-prompt-head button")].find((button) => button.getAttribute("aria-expanded") !== null).click());
    await tab.waitForSelector(".admin-sample");
    await tab.evaluate(() => {
      const area = [...document.querySelectorAll(".admin-sample .admin-field")].find((field) => field.textContent.startsWith("Rules for every agent")).querySelector("textarea");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, "Answer in Portuguese.");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tab.waitForSelector(".admin-lines li[data-from='every']");
    assert.match(await text(".admin-lines li[data-from='every']"), /The person's rules for every agent: Answer in Portuguese\./);

    // The token budget counts the prompt and the tools; a template draft that drops a slot lowers it and says so; every
    // built-in tool's description has a pencil. Nothing is saved.
    // Since D65 the first call is counted, gated tools apart.
    assert.match(await text(".admin-prompt-sum"), /About [\d,]+ tokens on a reply’s first call: [\d,]+ of system prompt .* and [\d,]+ of tool descriptions/);
    await tab.evaluate(() => [...document.querySelectorAll(".admin-lines li")].find((line) => line.innerText.startsWith("Notes you can read"))
      .querySelector("button[title^='Edit the words']").click());
    await tab.waitForSelector("textarea[aria-label='Wording of noteItem']");
    await tab.evaluate(() => {
      const area = document.querySelector("textarea[aria-label='Wording of noteItem']");
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(area, "“{title}”");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tab.waitForSelector(".admin-delta[data-down]");
    assert.match(await text(".admin-line-edit"), /noteItem leaves out \{place\}/);
    await press("Discard");
    await press("Done");
    await tab.waitForSelector(".admin-prompt-sum:not(:has(.admin-delta))");
    assert.ok(await tab.evaluate(() => !!document.querySelector(".admin-tools li button[aria-label='Edit what read_notes says it does']")), "read_notes' description can be edited");

    // Try it and Cases open without sending or running anything; the template has no cases.
    await press("Try it");
    await tab.waitForSelector(".admin-try, .admin-prompt .admin-note");
    await press("Cases");
    await tab.waitForSelector(".admin-case-list li");
    result.vitalCases = await count(".admin-case-list li");
    assert.ok(result.vitalCases > 5, "Vital has his comparison cases");
    await at("agents/own");
    await tab.waitForSelector(".admin-prompt .admin-note");
    assert.match(await text(".admin-prompt .admin-note"), /No comparison case covers the steward template/);
    await press("System prompt");

    // Atlas edits his role, house rules, write mode and tone; he has no onboarding card, so no hook or line.
    await at("agents/Atlas");
    await tab.waitForSelector(".admin-lines li");
    assert.deepEqual(await tab.evaluate(() => [...document.querySelectorAll(".admin-editor .admin-field > span:first-child")].map((label) => label.firstChild.textContent)),
      ["Role", "House rules", "Write mode", "Personality"]);

    // Changes: compared with the newest release tag, or says there is none.
    await at("changes");
    await tab.evaluate(() => new Promise((done) => { const wait = () => /release-|No release tag/.test(document.querySelector(".admin-head p")?.textContent ?? "") ? done() : setTimeout(wait, 100); wait(); }));
    result.changes = (await text(".admin-head p")).match(/(\d+) changes? ship|nothing has changed|No release tag/)?.[0] ?? "";

    // Tools: every permission row and Google Calendar's (D83), whose Events + Add gives add_to_calendar.
    await at("tools");
    await tab.waitForSelector(".admin-table tbody tr");
    result.permissions = await count(".admin-table tbody tr");
    assert.equal(result.permissions, 11, "ten switches (Tidy files since D79) and Google Calendar");
    assert.match(await tab.evaluate(() => [...document.querySelectorAll(".admin-table tbody tr")].find((row) => row.textContent.startsWith("Google Calendar")).innerText), /add_to_calendar/);

    // Limits: nothing undescribed.
    await at("limits");
    await tab.waitForSelector(".admin-table tbody tr");
    assert.equal(await count(".admin-unsorted"), 0, "every cap and limit has words");

    // Operations: the figures, or how to get them, but no failure.
    await at("ops");
    await tab.waitForSelector(".admin-ops, .admin-empty, .admin-head + .admin-status[data-error]", { timeout: 60000 });
    assert.equal(await count(".admin-head + .admin-status[data-error]"), 0, await text(".admin-head + .admin-status[data-error]"));
    result.operations = await count(".admin-ops") ? "figures" : "no key";

    // The design showcase in its frame.
    await at("design");
    const frame = await tab.frame("iframe.admin-frame");
    await frame.waitForSelector(".ds-bar", { timeout: 60000 });

    const errors = (await tab.errors()).entries.map((entry) => entry.text ?? entry.message).filter((line) => !/cloudflareinsights/.test(line));
    assert.deepEqual(errors, [], "no page errors");
    return result;
  } finally {
    await tab.evaluate(() => sessionStorage.clear()).catch(() => {});
    await tab.close();
  }
}
