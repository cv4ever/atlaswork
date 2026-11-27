import assert from "node:assert/strict";
import { dropServiceWorker, openCheckTab } from "./check-tab.mjs";

/**
 * Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tabs.
 * Exercises Settings → AI model signed out (launch plan D16): the status card, the provider row (with the dev ChatGPT
 * bridge's choice on a dev server), a stored provider asking for a sign-in, the ChatGPT setup opening, and a chat
 * with no model connected saying how to connect one instead of answering. Then, on the dev echo engine's two made-up
 * models, an agent's own model (agents-design D44): Profile → Model lists them, Test answers, Save keeps it, the
 * chat's About panel names it, and the reply comes from it. With `account`, the session file `dev/test-account.mjs
 * create` wrote, it also runs `checkSignedIn`; without one it says it skipped that.
 */
export async function checkModel(browser, origin, account) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin. This check resets its records.");
  const tab = await openCheckTab(browser, "model-check");
  // No dev engine may answer for real here: no ChatGPT plan, no echo.
  await tab.addInitScript(`localStorage.removeItem("workbench.dev.chatgpt"); localStorage.removeItem("workbench.dev.echo");`);
  const until = (predicate, arg, timeout = 15000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value)
      .catch((error) => { throw new Error(`Timed out waiting for ${source}: ${error.message}`); });
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 });
  const clickText = (selector, text) => tab.evaluate((selector, text) => {
    const el = [...document.querySelectorAll(selector)].find((item) => item.textContent.trim().startsWith(text));
    if (!el) throw new Error(`No ${selector} reading ${text}`);
    el.click();
  }, selector, text);
  const text = (selector) => tab.evaluate((selector) => document.querySelector(selector)?.textContent ?? "", selector);
  let choices, offline;
  try {
    url.search = new URLSearchParams({ fresh: "", today: new Date().toLocaleDateString("en-CA") }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector('button[aria-label="Profile"]'), null, 60000);
    await tab.evaluate(() => document.querySelector('button[aria-label="Profile"]').click());
    await until(() => [...document.querySelectorAll("button")].some((button) => button.textContent.startsWith("AI model")));
    await clickText("button", "AI model");
    await until(() => !!document.querySelector(".own-model"));

    // Signed out with nothing chosen: the card says so, and every provider is in one row.
    assert.match(await text(".own-model .account-card"), /No model yet/);
    choices = await tab.evaluate(() => [...document.querySelectorAll(".own-model-choices [role=radio]")].map((radio) => radio.textContent.trim()));
    for (const name of ["Atlaswork", "OpenRouter", "OpenAI API", "Anthropic API", "ChatGPT plan"]) assert.ok(choices.includes(name), `${name} is offered: ${choices}`);
    await clickText(".own-model-choices [role=radio]", "OpenAI API");
    await until(() => /Sign in first: your key is stored with your account/.test(document.querySelector(".own-model").textContent));
    await clickText(".own-model-choices [role=radio]", "ChatGPT plan");
    await until(() => /Continue with ChatGPT|Signed in to ChatGPT/.test(document.querySelector(".own-model").textContent));
    assert.equal(await tab.evaluate(() => document.querySelector(".own-model .field-error")?.textContent ?? ""), "", "the bridge answers");

    // A chat with no model connected says so up front and how to connect one, and Send waits rather than failing each
    // message (the header badge that said "Not connected" left the chat panel with the rail of faces, D13).
    await tab.press("Escape");
    await until(() => !document.querySelector(".own-model"));
    await tab.evaluate(() => document.querySelector('button[aria-label="Open chat with Atlas"]').click());
    await until(() => !!document.querySelector('textarea[aria-label="Message Atlas"]'));
    await until(() => /No AI model is connected/.test(document.querySelector('.inline-error[role="status"]')?.textContent ?? ""));
    await tab.evaluate(() => {
      const box = document.querySelector('textarea[aria-label="Message Atlas"]');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, "Hello?");
      box.dispatchEvent(new Event("input", { bubbles: true }));
      box.focus();
    });
    assert.ok(await tab.evaluate(() => document.querySelector('button[aria-label="Send message"]').disabled), "Send waits for a model");
    assert.ok(await tab.evaluate(() => [...document.querySelectorAll(".inline-error button")].some((button) => button.textContent === "Connect a model")), "it says how to connect one");
    offline = await text('.inline-error[role="status"]');
  } finally {
    await tab.close();
  }
  return { choices, offline, agentModel: await checkAgentModel(browser, url),
    signedIn: account ? await checkSignedIn(browser, origin, account) : "skipped: no test account" };
}

async function checkAgentModel(browser, url) {
  const tab = await openCheckTab(browser, "agent-model-check");
  await tab.addInitScript(`localStorage.removeItem("workbench.dev.chatgpt"); localStorage.setItem("workbench.dev.echo", "on");`);
  const until = (predicate, arg, timeout = 15000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value)
      .catch((error) => { throw new Error(`Timed out waiting for ${source}: ${error.message}`); });
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 });
  const clickText = (selector, text) => tab.evaluate((selector, text) => {
    const el = [...document.querySelectorAll(selector)].find((item) => item.textContent.trim().startsWith(text));
    if (!el) throw new Error(`No ${selector} reading ${text}`);
    el.click();
  }, selector, text);
  const type = (selector, value) => tab.evaluate((selector, value) => {
    const field = document.querySelector(selector);
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
  }, selector, value);
  const text = (selector) => tab.evaluate((selector) => document.querySelector(selector)?.textContent ?? "", selector);
  try {
    url.search = new URLSearchParams({ fresh: "", today: new Date().toLocaleDateString("en-CA"), view: "agents" }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector(".atlas-profile"), null, 60000);
    await clickText(".atlas-profile button", "Configure");
    await until(() => document.querySelectorAll("#agent-models option").length === 4);
    assert.match(await text(".agent-model summary"), /Echo default/);
    const options = await tab.evaluate(() => [...document.querySelectorAll("#agent-models option")].map((option) => option.value));
    await type(".agent-model > input", "echo-large");
    await until(() => /echo-large/.test(document.querySelector(".agent-model summary").textContent));
    await clickText('.agent-model [aria-label="Thinking"] button', "Thorough");
    await until(() => /echo-large · Thorough/.test(document.querySelector(".agent-model summary").textContent));
    await clickText(".agent-model-test button", "Test");
    await until(() => /It answered in/.test(document.querySelector(".agent-model-test [role=status]")?.textContent ?? ""));
    const tested = await text(".agent-model-test [role=status]");
    await clickText(".agent-dialog button", "Save");
    await until(() => !document.querySelector(".agent-dialog"));

    // The Chats page names the model and thinking in Atlas's About panel, and his reply comes from them.
    url.search = new URLSearchParams({ view: "chats" }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector('textarea[aria-label="Message Atlas"]'), null, 60000);
    await tab.evaluate(() => { const details = document.querySelector('button[aria-label="About Atlas"]'); if (details.getAttribute("aria-pressed") !== "true") details.click(); });
    await until(() => [...document.querySelectorAll(".conversation-fact")].some((row) => row.querySelector("dt")?.textContent === "Model"
      && row.querySelector("dd").textContent.startsWith("echo-large · Thorough")));
    await type('textarea[aria-label="Message Atlas"]', "Hello?");
    await tab.press("Enter");
    await until(() => document.body.innerText.includes("Echo on echo-large · high: Hello?"));

    // Settings → AI model prices that reply on echo-large's made-up $10 in, $20 out per million (906 in, 40 out).
    await tab.evaluate(() => document.querySelector('button[aria-label="Profile"]').click());
    await until(() => [...document.querySelectorAll("button")].some((button) => button.textContent.startsWith("AI model")));
    await clickText("button", "AI model");
    await until(() => [...document.querySelectorAll(".agent-spend tbody tr")].some((row) => row.querySelector("th").textContent === "Atlas"
      && /\$0\.0099/.test(row.lastElementChild.textContent)));
    const spend = await tab.evaluate(() => [...[...document.querySelectorAll(".agent-spend tbody tr")].find((row) => row.querySelector("th").textContent === "Atlas").children]
      .map((cell) => cell.textContent));
    return { options, tested, reply: "Echo on echo-large · high: Hello?", spend };
  } finally {
    await tab.close();
  }
}

/**
 * Signed in as a throwaway account (`account.hash` from `dev/test-account.mjs create`; the caller deletes the account
 * afterwards): Settings → AI model saves an OpenAI-compatible key through the engine, and the status card, the in-use
 * mark, Account's daily cap and the Chats page's Model row behind the dialog follow without a reload. Test on the
 * made-up key fails with the provider's reason, and Disconnect goes back to Atlaswork's model everywhere.
 */
export async function checkSignedIn(browser, origin, account) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin.");
  if (!/@example\.test$/.test(account.email ?? "")) throw new Error("Sign in only as a dev/test-account.mjs throwaway account.");
  // Not openCheckTab: its sign-out would run again on every load. Only the dev engines are switched off.
  const tab = await browser.open({ name: `model-signed-in-${Date.now()}`, url: "about:blank", app: "chromium", viewport: { width: 1440, height: 900 } });
  await tab.addInitScript(dropServiceWorker);
  await tab.addInitScript(`localStorage.removeItem("workbench.dev.chatgpt"); localStorage.removeItem("workbench.dev.echo");`);
  const until = (predicate, arg, timeout = 20000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value)
      .catch((error) => { throw new Error(`Timed out waiting for ${source}: ${error.message}`); });
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 });
  const clickText = (selector, text) => tab.evaluate((selector, text) => {
    const el = [...document.querySelectorAll(selector)].find((item) => item.textContent.trim().startsWith(text));
    if (!el) throw new Error(`No ${selector} reading ${text}`);
    el.click();
  }, selector, text);
  const type = (selector, value) => tab.evaluate((selector, value) => {
    const field = document.querySelector(selector);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  }, selector, value);
  const text = (selector) => tab.evaluate((selector) => document.querySelector(selector)?.textContent ?? "", selector);
  // The row ends in its Change link, so its words are the start of the cell.
  const modelRow = () => tab.evaluate(() => [...document.querySelectorAll(".conversation-fact")].find((row) => row.querySelector("dt")?.textContent === "Model")?.querySelector("dd").textContent.replace(/Change$/, "") ?? "");
  const inUse = () => tab.evaluate(() => [...document.querySelectorAll(".own-model-choices [role=radio]")].filter((radio) => radio.querySelector("[aria-label='in use']")).map((radio) => radio.textContent.trim()));
  const openAiModel = async () => {
    await tab.evaluate(() => document.querySelector('button[aria-label="Profile"]').click());
    await until(() => [...document.querySelectorAll("button")].some((button) => button.textContent.startsWith("AI model")));
    await clickText("button", "AI model");
    await until(() => !!document.querySelector(".own-model") && !/Loading/.test(document.querySelector(".own-model .account-card strong").textContent));
  };
  const model = "gpt-4o-mini";
  const seen = {};
  try {
    url.search = new URLSearchParams({ view: "chats" }).toString();
    url.hash = account.hash;
    // The URL carries the session, so a failed load must not repeat it in the error.
    await tab.goto(url.href).catch((error) => { throw new Error(`Couldn't open the signed-in page: ${error.message.replace(/#[^"\s]*/g, "#…")}`); });
    // A new account opens on the first-run flow; skip it to reach the Chats page.
    await until(() => !!document.querySelector('textarea[aria-label="Message Atlas"]') || [...document.querySelectorAll("button")].some((button) => button.textContent === "Skip setup"), null, 60000);
    if (await tab.evaluate(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Skip setup"))) await clickText("button", "Skip setup");
    await until(() => !!document.querySelector('textarea[aria-label="Message Atlas"]'), null, 30000);
    await tab.evaluate(() => { const details = document.querySelector('button[aria-label="About Atlas"]'); if (details.getAttribute("aria-pressed") !== "true") details.click(); });
    await until(() => [...document.querySelectorAll(".conversation-fact")].some((row) => row.querySelector("dt")?.textContent === "Model" && row.querySelector("dd").textContent.startsWith("The default")));

    await openAiModel();
    assert.match(await text(".own-model .account-card strong"), /Atlaswork's hosted model/);
    assert.deepEqual(await inUse(), ["Atlaswork"]);
    await clickText(".own-model-choices [role=radio]", "OpenAI API");
    await until(() => !!document.querySelector(".own-model-form input[type=password]"));
    await type(".own-model-form input[list=own-model-options]", model);
    await type(".own-model-form input[type=password]", "sk-test-not-a-real-key-0000");
    await clickText(".own-model-form button", "Save and test");
    // The save resolves after the engine reloads, then Test runs on the made-up key and fails with a reason.
    await until(() => !/Working/.test(document.querySelector(".own-model").textContent) && !!document.querySelector(".own-model .field-error, .own-model .own-model-ok"), null, 60000);
    seen.saved = await text(".own-model .account-card strong");
    assert.match(seen.saved, new RegExp(`${model} through OpenAI-compatible API`));
    assert.deepEqual(await inUse(), ["OpenAI API"]);
    seen.test = await text(".own-model .field-error");
    assert.ok(seen.test, "the made-up key's Test says why it failed");

    // Account reads the same model state: the own-model daily cap, with no fetch of its own.
    await clickText("button", "Account");
    await until(() => /through your own model/.test(document.querySelector(".usage-meter")?.parentElement.textContent ?? ""));
    await tab.press("Escape");
    await until(() => !document.querySelector(".own-model") && !document.querySelector(".usage-meter"));
    seen.details = await modelRow();
    // A Thinking setting Atlas already has (this origin's echo check saves one) follows the default's name.
    assert.ok(seen.details.startsWith(`${model} (OpenAI-compatible API default)`), `the Model row behind the dialog followed the save: ${seen.details}`);

    await openAiModel();
    await clickText(".own-model-actions button", "Disconnect");
    await until(() => /Atlaswork's hosted model/.test(document.querySelector(".own-model .account-card strong").textContent), null, 30000);
    assert.deepEqual(await inUse(), ["Atlaswork"]);
    await tab.press("Escape");
    await until(() => [...document.querySelectorAll(".conversation-fact")].some((row) => row.querySelector("dt")?.textContent === "Model" && row.querySelector("dd").textContent.startsWith("The default")));
    return seen;
  } finally {
    await tab.close();
  }
}
