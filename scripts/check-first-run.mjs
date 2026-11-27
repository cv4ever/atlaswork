import assert from "node:assert/strict";
import { openCheckTab } from "./check-tab.mjs";

/**
 * Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tab.
 * Walks the path a new person takes (agents-design D34, D35, D62): the first run on a new trial account with every
 * default, then "Start Health's first project". Today's guide must speak as Health's agent (Vital), offer at least two
 * ideas whose chips leave out the blocks every page has, and end with "Something else"; an idea and "Something else"
 * both open the project dialog in Health (the idea's name filled in), and Start lands on the new project. Health's
 * domain page shows the same agent's ideas with a New project card.
 */
export async function checkFirstRun(browser, origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin. This check resets its records.");
  const tab = await openCheckTab(browser, "first-run-check");
  const until = (predicate, arg, timeout = 15000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value)
      .catch((error) => { throw new Error(`Timed out waiting for ${source}: ${error.message}`); });
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 });
  /** Clicks the first button whose text starts with `text`, inside `scope`. */
  const press = (text, scope = "body") => tab.evaluate((text, scope) => {
    const button = [...document.querySelectorAll(`${scope} button`)].find((item) => item.textContent.trim().startsWith(text));
    if (!button) throw new Error(`No button "${text}" in ${scope}`);
    button.click();
  }, text, scope);
  const dialog = () => tab.evaluate(() => {
    const form = document.querySelector(".project-form");
    return form && { title: form.querySelector(".domain-name").value, domain: form.querySelector(".project-fact > span:not([aria-hidden])")?.textContent.trim() };
  });
  try {
    url.search = new URLSearchParams({ fresh: "new", as: "trial", today: new Date().toLocaleDateString("en-CA") }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector(".onboarding-dialog .hello-you"), null, 60000);

    // The first run with every default: Hello, Domains (Health), Crew (Vital), Ready.
    for (const step of ["Next: Your domains", "Next: Your crew", "Next: Ready"]) {
      await press(step, ".onboarding-actions");
      await until((step) => !document.querySelector(".onboarding-actions")?.textContent.includes(step), step);
    }
    await press("Start Health", ".onboarding-actions");
    await until(() => !!document.querySelector(".first-morning .starter-picks"), null, 30000);

    // Health's agent speaks, with its ideas and a card for a project of your own.
    const guide = await tab.evaluate(() => ({
      face: document.querySelector(".first-morning .guide-face img").alt,
      title: document.querySelector(".first-morning .guide-bubble strong").textContent,
      ideas: [...document.querySelectorAll(".first-morning .starter-pick:not(.starter-pick-new) strong")].map((item) => item.textContent),
      chips: [...document.querySelectorAll(".first-morning .starter-blocks em")].map((item) => item.textContent.trim()),
      own: !!document.querySelector(".first-morning .starter-pick-new"),
    }));
    assert.equal(guide.face, "Vital", "Health's agent shows its face, not Atlas");
    assert.match(guide.title, /I'm Vital/, "Health's agent speaks");
    assert.ok(guide.ideas.length >= 2, `at least two ideas (${guide.ideas.join(", ")})`);
    assert.ok(guide.own, "a card for a project of your own");
    for (const generic of ["Done by", "Next up", "Tasks", "Resources"]) assert.ok(!guide.chips.includes(generic), `no "${generic}" chip`);

    // "Something else" opens the dialog in Health with nothing named; Cancel leaves the guide.
    await tab.evaluate(() => document.querySelector(".first-morning .starter-pick-new").click());
    await until(() => !!document.querySelector(".project-form"));
    assert.deepEqual(await dialog(), { title: "", domain: "Health" }, "Something else opens the dialog in Health");
    await press("Cancel", ".project-form");
    await until(() => !document.querySelector(".project-form"));

    // An idea opens the same dialog filled in from it, and Start lands on the new project.
    await tab.evaluate(() => document.querySelector(".first-morning .starter-pick:not(.starter-pick-new)").click());
    await until(() => !!document.querySelector(".project-form"));
    assert.deepEqual(await dialog(), { title: guide.ideas[0], domain: "Health" }, "the idea fills in the dialog");
    await tab.evaluate(() => document.querySelector(".project-form button[type=submit]").click());
    await until((title) => document.querySelector(".project-masthead")?.textContent.includes(title), guide.ideas[0]);

    // Health's domain page: the same agent's ideas, without the one just built, and a New project card.
    url.search = new URLSearchParams({ domain: "Health", today: new Date().toLocaleDateString("en-CA") }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector(".project-ideas"), null, 60000);
    const page = await tab.evaluate(() => ({
      heading: document.querySelector(".project-ideas h2").textContent,
      ideas: [...document.querySelectorAll(".project-idea:not(.project-idea-new) strong")].map((item) => item.textContent),
      own: !!document.querySelector(".project-idea-new"),
    }));
    assert.equal(page.heading, "Ideas from Vital");
    assert.ok(page.ideas.length >= 2 && !page.ideas.includes(guide.ideas[0]), `the domain page's ideas leave out the built one (${page.ideas.join(", ")})`);
    assert.ok(page.own, "the domain page has a New project card");

    // Today's guide, back at its domain picker: the New domain tile plants Family (from the dialog's common domains),
    // which opens Family's page with its new agent's ideas, and the guide then speaks as that agent there.
    await tab.evaluate(() => document.querySelector(".today-button").click());
    await until(() => !!document.querySelector(".first-morning .area-own")?.offsetParent);
    await tab.evaluate(() => document.querySelector(".first-morning .area-own").click());
    await until(() => !!document.querySelector(".domain-form-suggestions"));
    await tab.evaluate(() => [...document.querySelectorAll(".domain-form-suggestions button")].find((button) => button.textContent.includes("Family")).click());
    await tab.evaluate(() => document.querySelector(".domain-submit").click());
    await until(() => document.querySelector(".collection-page h1")?.textContent.includes("Family") && !!document.querySelector(".project-ideas"));
    const keeper = await tab.evaluate(() => document.querySelector(".project-ideas h2").textContent.replace("Ideas from ", ""));
    assert.notEqual(keeper, "Atlas", "a planted domain's ideas come from its own agent");
    await tab.evaluate(() => document.querySelector(".today-button").click());
    await until((keeper) => !!document.querySelector(".first-morning .starter-picks")?.offsetParent
      && document.querySelector(".first-morning .guide-bubble strong")?.textContent.includes(`I'm ${keeper}`), keeper);
    assert.deepEqual((await tab.errors()).entries, [], "no browser errors");
    return { passed: ["first run with defaults", "Vital speaks on Today", "two ideas and Something else", "no generic chips", "Something else opens the dialog", "an idea fills the dialog and builds", "domain page ideas from Vital", "New domain plants one whose agent speaks"] };
  } finally {
    await tab.close();
  }
}
