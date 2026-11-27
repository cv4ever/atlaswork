import assert from "node:assert/strict";
import { openCheckTab } from "./check-tab.mjs";

/**
 * Run from OMP Eval with its browser object and a disposable loopback Vite origin. Owns and closes its test tab.
 * Exercises the Chats page (D27–D29): roster → tabs, pin and close, the Logbook (D19) and its jump, find, New conversation,
 * starters only in an empty chat, attaching and detaching a note, the last changed note offered and attached, the header's conversation title,
 * the context meter, a Proposal from an asks-first agent (Apply, then Undo, through the engine's draft binding and the
 * Proposal module), a memory's pill and Undo (D49) with the message box emptied by Send, a reply's sources (D81: the
 * calendar's mark on the typing step, its chip with the days read, a revoked grant's Reconnect), a question for another agent
 * (D50: its card, Send and the answer in the same chat), a room's "To" Everyone, one member's model and Thinking in
 * that room from the model line (D82: its maker's tab, the reply on them, the "To" mark, Recent and the list's keys), and reload persistence.
 *
 * DOM gotchas these helpers already handle: the roster options popover holds an inert copy of a roster row (scope to
 * `.sidebar-roster`), and tab pin/close buttons sit at opacity 0 until hover (click through the DOM). Text goes in
 * with one value set, which is faster than typing key by key on the dev server.
 */
export async function checkChats(browser, origin) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || ["5190", "5191"].includes(url.port))
    throw new Error("Use a disposable 127.0.0.1 Vite port, not the normal workspace origin. This check resets its records.");
  const tab = await openCheckTab(browser, "chats-check");
  // The dev echo engine answers at once without a model (dev/echo).
  await tab.addInitScript(`localStorage.setItem("workbench.dev.echo", "on");`);
  // A wait that times out names what it waited for, so a failure says which step broke.
  const until = (predicate, arg, timeout = 15000) => tab.run(async ({ page }, source, value, ms) => {
    await page.waitForFunction(new Function("arg", `return (${source})(arg)`), { timeout: ms }, value);
  }, { args: [predicate.toString(), arg, timeout], timeout: Math.ceil(timeout / 1000) + 15 })
    .catch((cause) => { throw new Error(`${cause instanceof Error ? cause.message : cause} waiting for ${predicate.toString().slice(0, 200)}${arg === null || arg === undefined ? "" : ` (${JSON.stringify(arg)})`}`); });
  const click = (selector) => tab.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`No element for ${selector}`);
    el.click();
  }, selector);
  const fill = (selector, value) => tab.evaluate((selector, value) => {
    const el = document.querySelector(selector);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.focus();
  }, selector, value);
  const rosterRow = (name) => tab.evaluate((name) => [...document.querySelectorAll(".sidebar-roster .roster-row")]
    .find((row) => row.querySelector("strong")?.textContent === name).click(), name);
  // Browser values can come from another realm; compare tab order, not that realm's Array prototype.
  const tabs = async () => [...await tab.evaluate(() => [...document.querySelectorAll(".chat-topbar [role=tab][data-chat-tab]")]
    .map((button) => `${button.getAttribute("aria-label").split(",")[0]}${button.getAttribute("aria-selected") === "true" ? "*" : ""}${button.getAttribute("aria-label").includes("pinned") ? "📌" : ""}`))];
  // The open chat's name is its selected tab's: the Chats page header leaves out the name the tab already shows (D29).
  const open = () => document.querySelector(".chat-topbar [role=tab][data-chat-tab][aria-selected=true]")?.getAttribute("aria-label")?.split(",")[0];
  const header = () => tab.evaluate(open);
  // Where the conversation stands: New conversation's tooltip ("Conversation 2 today, 2 messages since 10:04"), which
  // Tip also gives the button as its accessible description.
  const strip = () => tab.evaluate(() => document.querySelector('.chats-page .agent-header-actions [aria-label^="New conversation"]').getAttribute("aria-description"));
  const transcript = () => tab.evaluate(() => document.querySelector(".chats-page .agent-transcript").textContent);
  const agentMessages = () => tab.evaluate(() => document.querySelectorAll(".chats-page .chat-message.agent:not(.welcome-message):not(.typing)").length);
  try {
    url.search = new URLSearchParams({ fresh: "", today: new Date().toLocaleDateString("en-CA") }).toString();
    await tab.goto(url.href);
    await until(() => !!document.querySelector("#sidebar-tab-agents"), null, 60000);

    // Roster rows open chats as tabs on the Chats page.
    await click("#sidebar-tab-agents");
    await until(() => !!document.querySelector(".sidebar-roster .roster-row"));
    await rosterRow("Kin");
    await until((name) => document.querySelector(".chat-topbar [role=tab][data-chat-tab][aria-selected=true]")?.getAttribute("aria-label")?.split(",")[0] === name, "Kin");
    await rosterRow("Ledger");
    await until((name) => document.querySelector(".chat-topbar [role=tab][data-chat-tab][aria-selected=true]")?.getAttribute("aria-label")?.split(",")[0] === name, "Ledger");
    assert.equal(new URL(await tab.url()).searchParams.get("view"), "chats");
    assert.deepEqual(await tabs(), ["Kin", "Ledger*"]);

    // Pin leads the bar and loses its close button; closing another tab leaves the current one.
    await click('button[aria-label="Pin Ledger"]');
    await until(() => !!document.querySelector('button[aria-label="Unpin Ledger"]'));
    assert.deepEqual(await tabs(), ["Ledger*📌", "Kin"]);
    assert.equal(await tab.evaluate(() => !!document.querySelector('button[aria-label="Close Ledger"]')), false, "pinned tabs can't be closed");
    await click('button[aria-label="Close Kin"]');
    await until(() => !document.querySelector('button[aria-label="Close Kin"]'));
    assert.deepEqual(await tabs(), ["Ledger*📌"]);

    // The Logbook is its own tab: it lists conversations (title, chat, what came of it), never message text, and a row
    // lands on the matching message in its chat.
    await click(".chat-topbar .tab-logbook button");
    await until(() => !!document.querySelector(".logbook"));
    assert.equal(await tab.evaluate(() => document.querySelector(".chat-topbar [role=tab][data-chat-tab][aria-selected=true]")), null, "no chat tab is selected on the Logbook");
    await fill('input[aria-label="Search the logbook"]', "video");
    // The list shows every conversation before the search applies, so wait for the filtered first row, not just any row
    // (headless puppeteer read the unfiltered one, 2026-11-21).
    await until(() => /matching/.test(document.querySelector(".logbook-row")?.innerText ?? ""))
      .catch(() => { throw new Error("a search hit says how many messages matched"); });
    const card = await tab.evaluate(() => document.querySelector(".logbook-row").innerText);
    assert.doesNotMatch(card, /Cancel the video service/, "Logbook rows never reprint messages");
    await click(".logbook-row");
    await until(() => {
      const pane = document.querySelector(".chats-page .agent-transcript")?.getBoundingClientRect();
      return !!pane && [...document.querySelectorAll(".chats-page .chat-message")].some((row) => {
        const box = row.getBoundingClientRect();
        return row.textContent.toLowerCase().includes("video") && box.top >= pane.top - 4 && box.bottom <= pane.bottom + 4;
      });
    });

    // Find in the chat counts and steps through hits; Escape clears the marks.
    await click('.chats-page button[aria-label="Find in this chat"]');
    await until(() => !!document.querySelector("#chat-find"));
    await fill("#chat-find", "the");
    await until(() => /^1 of \d+$/.test(document.querySelector(".chat-find > span").textContent));
    await tab.press("Enter");
    await until(() => /^2 of \d+$/.test(document.querySelector(".chat-find > span").textContent));
    await tab.press("Escape");
    await until(() => !document.querySelector(".chat-find") && !document.querySelector(".agent-transcript mark"));

    // New conversation clears the chat to a fresh start, the one before named on a Previous line that reads it on its
    // own; its measured reply fills the context meter, which opens every member's window.
    // Opening the app runs due routines through the engine; a chat can't start a conversation while one is answering in it.
    await until(() => !document.querySelector(".chats-page .chat-message.typing"));
    const ask = async (message) => {
      const before = await agentMessages();
      await fill(".chats-page textarea", message);
      await tab.press("Enter");
      await until((count) => document.querySelectorAll(".chats-page .chat-message.agent:not(.welcome-message):not(.typing)").length > count, before);
    };
    await ask("Anything due?");
    await click('.chats-page .agent-header-actions [aria-label^="New conversation"]');
    // New shows only while there is a conversation to end, so a clear chat drops it rather than greying it out (D29).
    await until(() => !document.querySelector('.chats-page .agent-header-actions [aria-label^="New conversation"]')
      && /^Previous:/.test(document.querySelector(".chats-page .chat-previous")?.textContent ?? ""));
    // The Previous line names the folded conversation, so read the messages themselves.
    assert.doesNotMatch(await tab.evaluate(() => [...document.querySelectorAll(".chats-page .chat-message")].map((row) => row.textContent).join("\n")),
      /Anything due\?/, "New conversation clears the chat");
    // Starters suggest a first message only while the chat is empty and so is the box (D13).
    assert.ok(await tab.evaluate(() => !!document.querySelector(".chats-page .starter-chips")), "starters show in a cleared chat");
    await fill(".chats-page textarea", "Hi");
    await until(() => !document.querySelector(".chats-page .starter-chips"));
    await fill(".chats-page textarea", "");
    // A note reads as attached only once you attach it: the chip appears after picking one, and Detach takes it away (D29).
    assert.equal(await tab.evaluate(() => !!document.querySelector(".chats-page .context-chip.attached")), false, "nothing reads as attached before you attach");
    await click(".chats-page .note-offer-button");
    await until(() => !!document.querySelector(".note-offer[data-open]"));
    await tab.evaluate(() => [...document.querySelectorAll(".note-offer [role=menuitem]")].find((item) => /Find a note/.test(item.textContent)).click());
    await until(() => !!document.querySelector("dialog[open] .dialog-search"));
    const picked = await tab.evaluate(() => {
      const row = [...document.querySelectorAll("dialog[open] button")].find((button) => /Note in /.test(button.textContent));
      row.click();
      return row.textContent.split("Note in ")[0];
    });
    await until((title) => !!document.querySelector(".chats-page .context-chip.attached")?.textContent.includes(title), picked);
    await click('.chats-page [aria-label="Detach note"]');
    await until(() => !document.querySelector(".chats-page .context-chip.attached"));
    // The note you last changed is offered from the paperclip, which wears a dot, never as a chip; picking it makes it
    // the chip (D29).
    await click(".chats-page .note-offer-button");
    await until(() => !!document.querySelector(".note-offer[data-open]"));
    const offer = await tab.evaluate(() => document.querySelector(".note-offer [role=menuitem] strong").textContent);
    await tab.evaluate(() => document.querySelector(".note-offer [role=menuitem]").click());
    await until((title) => !!document.querySelector(".chats-page .context-chip.attached")?.textContent.includes(title)
      && !document.querySelector(".chats-page .note-offer-button"), offer);
    await click('.chats-page [aria-label="Detach note"]');
    await until(() => !!document.querySelector(".chats-page .note-offer-button"));
    await ask("Budget check?");
    assert.match(await strip(), /, 2 messages/, "the new conversation holds only this exchange");
    assert.equal(await tab.evaluate(() => !!document.querySelector(".chats-page .starter-chips")), false, "starters step aside once you've written");
    assert.match(await tab.evaluate(() => document.querySelector(".chats-page .agent-topic-line").textContent), /Budget check\?.*2 messages/,
      "the header names the conversation and counts its messages");
    // The title opens this chat's conversations, the current one marked Now.
    await click(".chats-page .agent-topic");
    await until(() => /Now · /.test(document.querySelector(".conversation-list[data-open]")?.textContent ?? ""));
    await tab.press("Escape");
    await until(() => !document.querySelector(".conversation-list[data-open]"));
    // The Previous line reads the folded conversation on its own; the reading bar takes the box's place until Back to now.
    await click(".chats-page .chat-previous button");
    await until(() => /Anything due\?/.test(document.querySelector(".chats-page .agent-transcript").textContent)
      && !/Budget check\?/.test(document.querySelector(".chats-page .agent-transcript").textContent)
      && !!document.querySelector(".chats-page .reading-bar") && !document.querySelector(".chats-page textarea"));
    await click(".chats-page .reading-bar .primary-button");
    await until(() => /Budget check\?/.test(document.querySelector(".chats-page .agent-transcript").textContent) && !!document.querySelector(".chats-page textarea"));
    await click(".context-meter");
    await until(() => document.querySelector("#context-meter")?.matches(":popover-open") && /Context windows/.test(document.querySelector("#context-meter").textContent));
    await tab.press("Escape");

    // An asks-first agent's draft waits as a Proposal; Apply adds the task and Undo takes it away again.
    await ask("propose: Check the water bill");
    await until(() => /Nothing changes until you approve/.test([...document.querySelectorAll(".chats-page .chat-message.agent")].at(-1)?.textContent ?? ""));
    await tab.evaluate(() => [...document.querySelectorAll(".chats-page .proposal-actions button")].at(-1).parentElement.querySelector(".primary-button").click());
    await until(() => /Added/.test([...document.querySelectorAll(".chats-page .proposal")].at(-1)?.textContent ?? ""));
    await tab.evaluate(() => [...document.querySelectorAll(".chats-page .proposal")].at(-1).querySelector(".proposal-result button").click());
    await until(() => /Undone\. The tasks were removed\./.test([...document.querySelectorAll(".chats-page .proposal")].at(-1)?.textContent ?? ""));

    // What a reply remembers shows as a pill under it, and Undo forgets it (D49). Send empties the box at once, even
    // when it comes before the draft's save delay, as `ask` does.
    await ask("remember: Pays rent on the 1st");
    assert.equal(await tab.evaluate(() => document.querySelector(".chats-page textarea").value), "", "Send empties the message box");
    await until(() => /Pays rent on the 1st/.test([...document.querySelectorAll(".chats-page .message-memories")].at(-1)?.textContent ?? ""));
    await tab.evaluate(() => [...document.querySelectorAll(".chats-page .message-memories button")].at(-1).click());
    await until(() => /Forgotten/.test([...document.querySelectorAll(".chats-page .message-memories")].at(-1)?.textContent ?? ""));

    // A reply that read Google Calendar (D81): the typing step carries its mark with the note it read ticked above it,
    // then a chip above the words names the days, and the note stays an icon; a revoked grant offers Reconnect, which
    // opens Settings → Connections.
    const before = await agentMessages();
    await fill(".chats-page textarea", "calendar: 2026-11-24 2026-11-30");
    await tab.press("Enter");
    await until(() => !!document.querySelector(".chats-page .typing .typing-step .brand-mark")
      && /Reading notes/.test(document.querySelector(".chats-page .typing .typing-done")?.textContent ?? ""), null, 5000);
    await until((count) => document.querySelectorAll(".chats-page .chat-message.agent:not(.welcome-message):not(.typing)").length > count, before);
    const sources = await tab.evaluate(() => [...[...document.querySelectorAll(".chats-page .message-sources")].at(-1).querySelectorAll("li")]
      .map((item) => item.querySelector(".source-chip")?.textContent ?? item.querySelector(".source-icon").getAttribute("aria-label")));
    assert.deepEqual([...sources], ["31Checked Google CalendarTue 24 – Mon 30 Nov", "Read your notes, looking for “dentist”"], "the calendar leads, the note is an icon");
    // Tapping the note's icon opens what it read under the line, for touch screens that get no tooltip.
    await tab.evaluate(() => [...document.querySelectorAll(".chats-page button.source-icon")].at(-1).click());
    await until(() => /looking for “dentist”/.test([...document.querySelectorAll(".chats-page .source-read")].at(-1)?.textContent ?? ""));
    await ask("calendar: disconnected");
    await until(() => /Google Calendar disconnected/.test([...document.querySelectorAll(".chats-page .message-sources")].at(-1)?.textContent ?? ""));
    await tab.evaluate(() => [...document.querySelectorAll(".chats-page .source-reconnect")].at(-1).click());
    // Settings loads lazily on first open; its Connections page heads the dialog (signed out it asks you to sign in first).
    await until(() => document.querySelector(".tabbed-dialog h3")?.textContent === "Connections", null, 30000);
    await tab.press("Escape");
    await until(() => !document.querySelector(".tabbed-dialog"));

    // A question for another agent waits as a card; you reword it with the pencil, Send runs that agent here with your
    // words, its answer names who asked, and the asker follows up because it said what it would do next (D50).
    await ask("ask: Vital: Dentist? | then: check it against the budget");
    await until(() => /A question for Vital.*Nothing is sent until you approve|Nothing is sent until you approve.*A question for Vital/s
      .test([...document.querySelectorAll(".chats-page .chat-message.agent")].at(-1)?.textContent ?? ""));
    assert.match(await tab.evaluate(() => [...document.querySelectorAll(".chats-page .proposal.ask")].at(-1).textContent), /Then Ledger follows up: check it against the budget/);
    await tab.evaluate(() => [...document.querySelectorAll(".chats-page .proposal.ask")].at(-1).querySelector(".ask-edit").click());
    await until(() => !!document.querySelector(".chats-page .ask-editor"));
    await fill(".chats-page .ask-editor", "When is the dentist cleaning?");
    await tab.evaluate(() => [...document.querySelectorAll(".chats-page .proposal.ask")].at(-1).querySelector(".primary-button").click());
    // Vital speaks in Ledger's chat, so the answer carries Vital's name and face; Ledger's follow-up doesn't repeat Ledger.
    await until(() => {
      const rows = [...document.querySelectorAll(".chats-page .chat-message.agent:not(.typing)")].slice(-2);
      return rows.length === 2 && /Vital/.test(rows[0].querySelector(".message-speaker")?.textContent ?? "")
        && /answering Ledger/.test(rows[0].querySelector(".message-label")?.textContent ?? "")
        && /When is the dentist cleaning\?/.test(rows[0].textContent) && /following up on Vital/.test(rows[1].querySelector(".message-label")?.textContent ?? "");
    });
    assert.match(await tab.evaluate(() => [...document.querySelectorAll(".chats-page .proposal.ask")].at(-1).textContent), /When is the dentist cleaning\?.*Sent/s,
      "the card keeps the words that went");

    // A room: "To" Everyone gets one reply from each member, in order. The picker is a filtered menu: the arrow key
    // reaches the one match while the search keeps focus, and Enter opens it.
    await click('.chat-topbar button[aria-label^="Open a chat"]');
    await until(() => !!document.querySelector(".chat-picker[data-open]"));
    await fill('input[aria-label="Find a chat"]', "studio relaunch");
    await until(() => document.querySelectorAll(".chat-picker [role=menuitem]:not([hidden])").length === 1);
    await tab.press("ArrowDown");
    await tab.press("Enter");
    await until((name) => document.querySelector(".chat-topbar [role=tab][data-chat-tab][aria-selected=true]")?.getAttribute("aria-label")?.split(",")[0] === name, "Studio relaunch");
    const members = await tab.evaluate(() => [...document.querySelectorAll('.mention-chips[aria-label="Send to"] button')]
      .map((chip) => chip.textContent.replace("first", "").trim()).filter((name) => name !== "Everyone"));
    await tab.evaluate(() => [...document.querySelectorAll('.mention-chips[aria-label="Send to"] button')].find((chip) => chip.textContent === "Everyone").click());
    await fill(".chats-page textarea", "Status?");
    await tab.press("Enter");
    await until((names) => {
      const rows = [...document.querySelectorAll(".chats-page .chat-message")];
      const sent = rows.findLastIndex((row) => row.classList.contains("user"));
      const replies = rows.slice(sent + 1).filter((row) => row.classList.contains("agent") && !row.classList.contains("typing"));
      return sent >= 0 && names.every((name) => replies.some((row) => row.textContent.includes(name)));
    }, members, 30000);

    // The model line (D82): the second member answers this room on GPT Echo at Fast, picked under OpenAI's tab; the
    // reply comes from them, the "To" chip wears OpenAI's mark, and the first member's line is unchanged.
    const [lead, other] = members;
    await tab.evaluate((name) => [...document.querySelectorAll('.mention-chips[aria-label="Send to"] button')].find((chip) => chip.textContent.trim() === name).click(), other);
    await until((name) => document.querySelector(".chats-page .model-line-who")?.textContent === `${name} on`, other);
    await click(".chats-page .model-line-model");
    await until(() => !!document.querySelector(".model-picker:popover-open .model-vendors"));
    await tab.evaluate(() => [...document.querySelectorAll(".model-picker:popover-open .model-vendors button")].find((button) => button.textContent === "OpenAI").click());
    await until(() => [...document.querySelectorAll(".model-picker:popover-open .model-row")].some((row) => row.textContent.includes("GPT Echo")));
    await tab.evaluate(() => [...document.querySelectorAll(".model-picker:popover-open .model-row")].find((row) => row.textContent.includes("GPT Echo")).click());
    await tab.evaluate(() => [...document.querySelectorAll(".model-picker:popover-open .thinking-track label")].find((label) => label.textContent === "Fast").click());
    const line = () => [...document.querySelectorAll(".chats-page .model-line > button")].map((button) => button.textContent).join(" · ");
    await until(`() => /GPT Echo.*Fast/.test((${line})())`);
    await tab.press("Escape");
    assert.ok(await tab.evaluate((name) => !![...document.querySelectorAll('.mention-chips[aria-label="Send to"] button')]
      .find((chip) => chip.textContent.trim() === name)?.querySelector('.mention-model [data-vendor="openai"]'), other), "the chip wears its model's mark");
    await fill(".chats-page textarea", "Which model?");
    await tab.press("Enter");
    await until(() => document.querySelector(".chats-page .agent-transcript").textContent.includes("Echo on echo/gpt-echo · low: "), null, 30000);
    await tab.evaluate(() => [...document.querySelectorAll('.mention-chips[aria-label="Send to"] button')].find((chip) => chip.textContent.includes("first")).click());
    await until((name) => document.querySelector(".chats-page .model-line-who")?.textContent === `${name} on`, lead);
    assert.ok(!/GPT Echo/.test(await tab.evaluate(line)), "the first member keeps their model");
    // Recent lists GPT Echo for the first member too, now a reply used it; Down from the search reaches the list.
    await click(".chats-page .model-line-model");
    await until(() => [...document.querySelectorAll(".model-picker:popover-open .model-group")].some((group) => group.textContent === "Recent")
      && [...document.querySelectorAll(".model-picker:popover-open .model-row")].some((row) => row.textContent.includes("GPT Echo")));
    await tab.focus(".model-picker:popover-open .model-search input");
    await tab.press("ArrowDown");
    assert.ok(await tab.evaluate(() => document.activeElement?.classList.contains("model-row")), "Down from the search enters the list");
    await tab.press("Escape");

    // Reload keeps the tabs and pin, and lands at the newest message.
    await tab.reload();
    await until(() => !!document.querySelector(".chats-page .agent-transcript"), null, 60000);
    await until(() => { const pane = document.querySelector(".chats-page .agent-transcript"); return Math.abs(pane.scrollTop + pane.clientHeight - pane.scrollHeight) < 4; });
    assert.deepEqual(await tabs(), ["Ledger📌", "Studio relaunch*"]);
    assert.equal(await header(), "Studio relaunch");
    assert.equal((await tab.errors()).entries.length, 0, "no browser errors");
    return { passed: ["roster to tabs", "pin and close", "Logbook conversations and jump", "find", "context meter", "New conversation",
      "starters only in an empty chat", "attach and detach a note", "note offer", "conversation title", "conversation switcher and reading",
      "Proposal Apply and Undo",
      "memory pill and Undo", "question for another agent", "room Everyone", "a member's model in the room", "reload"] };
  } finally {
    await tab.close();
  }
}
