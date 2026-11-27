import assert from "node:assert/strict";
import { atlasId } from "../../../src/model.ts";
import type { WorkspaceData } from "../../../src/model.ts";
import { accountRecordsOf, allRecordsOf } from "../../../src/records.ts";
import type { MessageRecord } from "../../../src/records.ts";
import { normalize, saveThread } from "../../../src/workspace.ts";
import { failAway, landAway, stoppedNote } from "./away.ts";

const threadId = `agent:${atlasId}`;
/** A workspace where you asked Atlas something and closed the tab before it answered. */
function asked(awaiting = [atlasId]): WorkspaceData {
  const data = normalize(null).data;
  return { ...data,
    notes: [{ id: "plan", domain: data.domains[0].name, projectId: "", title: "Plan", body: "- Measure the wall", updatedAt: "2026-11-10T00:00:00.000Z" }],
    threads: [...data.threads.filter((thread) => thread.id !== threadId), { id: threadId, read: 1, attachedNoteId: null,
      messages: [{ id: "you", role: "user", text: "What's next on my plan?", awaiting, at: "2026-11-21T10:00:00.000Z" }] }] };
}
const land = { thread: threadId, message: "you", agent: atlasId, zone: "Europe/Lisbon" };
const proposal = { command: "propose_tasks", args: { place: "Everyday", tasks: [{ title: "Measure the wall" }] } };

Deno.test("a reply whose page left lands under your message, with its proposal settled and its usage", () => {
  const data = asked();
  const landed = landAway(data, land, { text: "From your plan:", draft: proposal, usage: { input: 900, output: 40 } });
  assert.ok(!("skipped" in landed));
  const thread = landed.changes.threads!.find((item) => item.id === threadId)!;
  const [mine, reply] = thread.messages;
  assert.deepEqual(mine.awaiting, [], "you no longer wait for Atlas");
  assert.equal(reply.replyTo, "you");
  assert.equal(reply.agentId, atlasId);
  assert.equal(reply.proposal?.items[0].title, "Measure the wall");
  assert.deepEqual(reply.usage, { input: 900, output: 40 });
  assert.equal(thread.read, 1, "it arrives unread");
  assert.equal(landed.agent, "Atlas");
});

Deno.test("nothing lands once nothing waits: the page got it, or a Retry answered", () => {
  assert.deepEqual(landAway(asked([]), land, { text: "Late." }), { skipped: "nothing waits for it" });
  assert.deepEqual(landAway(asked(), { ...land, message: "deleted" }, { text: "Late." }), { skipped: "nothing waits for it" });
});

Deno.test("work handed off (D73) says it stopped at its limit, and a failure waits on your message for Retry", () => {
  const handedOff = { ...land, background: true as const };
  const landed = landAway(asked(), handedOff, { text: "I read three notes.", limited: true });
  assert.ok(!("skipped" in landed));
  assert.equal(landed.text, `I read three notes.\n\n${stoppedNote}`);
  const plain = landAway(asked(), land, { text: "Done.", limited: true });
  assert.ok(!("skipped" in plain) && plain.text === "Done.", "a reply whose page left says nothing about limits");
  const failed = failAway(asked(), handedOff, "Atlas couldn't answer: the model is busy.");
  assert.ok(!("skipped" in failed));
  const [mine] = failed.changes.threads!.find((item) => item.id === threadId)!.messages;
  assert.deepEqual([mine.awaiting, mine.failure], [[atlasId], "Atlas couldn't answer: the model is busy."], "still waiting, with why");
  assert.deepEqual(failAway(asked([]), handedOff, "Late."), { skipped: "nothing waits for it" });
});

Deno.test("a reply landing in a chat you wrote in meanwhile keeps your new message (D76)", () => {
  const before = asked();
  const rows = new Map(allRecordsOf(before, true));
  // The page sends another message while the function works; the function landed from the workspace it loaded.
  const thread = before.threads.find((item) => item.id === threadId)!;
  const sent = saveThread(before, { ...thread, messages: [...thread.messages, { id: "more", role: "user", text: "And Friday?", at: "2026-11-21T10:00:05.000Z" }] });
  for (const [key, value] of accountRecordsOf(sent.changes, before).puts) rows.set(key, value);
  const landed = landAway(before, land, { text: "Measure the wall first." });
  assert.ok(!("skipped" in landed));
  for (const [key, value] of accountRecordsOf(landed.changes, before).puts) rows.set(key, value);
  const kept = [...rows].filter(([key]) => key.startsWith(`message:${threadId}:`)).map(([, value]) => (value as MessageRecord).message);
  assert.deepEqual(kept.map((message) => message.text).sort(), ["And Friday?", "Measure the wall first.", "What's next on my plan?"], "both stay");
  assert.deepEqual(kept.find((message) => message.id === "you")?.awaiting, [], "your first message is answered");
});

Deno.test("a computer's reply lands where things are as offers on its first message, naming that computer, and says how many (D80)", () => {
  const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" };
  const learned = [{ what: "Bank letters", folder: "Documents/Bank", place: "" }];
  const landed = landAway(asked(), land, { text: "They're in Documents\\Bank.", learned }, { ranOn: office });
  assert.ok(!("skipped" in landed));
  const reply = landed.changes.threads!.find((item) => item.id === threadId)!.messages.at(-1)!;
  assert.deepEqual(reply.learned?.map(({ memory, state }) => [memory.text, memory.computer, memory.agentId, state]),
    [["Bank letters: Documents\\Bank on Office PC", office, atlasId, "offered"]]);
  assert.equal(landed.learned, 1, "the function counts each one it offered");
  assert.equal(landed.changes.memories, undefined, "nothing is remembered before you keep it");
  const browser = landAway(asked(), land, { text: "They're in Documents\\Bank.", learned });
  assert.ok(!("skipped" in browser) && browser.learned === undefined, "a reply that ran on no computer offers none");
});

Deno.test("a place a search found on another of the account's computers is offered as on that computer (D84)", () => {
  const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" }, laptop = { id: "6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b", name: "Laptop" };
  const learned = [{ what: "Bank letters", folder: "Laptop: Papers/Banco", place: "" }, { what: "Receipts", folder: "Office PC: Documents/Receipts", place: "" }];
  const landed = landAway(asked(), land, { text: "They're on the Laptop.", learned }, { ranOn: office, computers: [office, laptop] });
  assert.ok(!("skipped" in landed));
  const reply = landed.changes.threads!.find((item) => item.id === threadId)!.messages.at(-1)!;
  assert.deepEqual(reply.learned?.map(({ memory }) => [memory.text, memory.computer]),
    [["Bank letters: Papers\\Banco on Laptop", laptop], ["Receipts: Documents\\Receipts on Office PC", office]]);
});
