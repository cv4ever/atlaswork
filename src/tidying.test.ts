import test from "node:test";
import assert from "node:assert/strict";
import { proposalOf } from "./commands.ts";
import type { Agent, ChatMessage, Thread } from "./model.ts";
import { land } from "./proposals.ts";
import { approvedTidies, askTidy, createTidyAsk, tidied } from "./tidying.ts";
import { normalize } from "./workspace.ts";

const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" };
const at = { thread: "agent:keeper", message: "a1" };

/** A chat where an agent allowed to tidy (D79) answered "m1" with a tidy of `count` files on Office PC, landed by its write mode. */
function chat(writeMode: Agent["writeMode"], count = 2) {
  const data = normalize(null).data;
  const agent: Agent = { ...data.agents[0], id: "keeper", name: "Keeper", writeMode, tools: { "read-files": true, "tidy-files": true } };
  data.agents.push(agent);
  const proposal = proposalOf({ data, agent, ranOn: office }, { command: "tidy_files",
    args: { moves: Array.from({ length: count }, (_, index) => ({ file: `Documents/scan${index}.pdf`, folder: "Bank", why: "A bank statement" })) } })!;
  const landed = land({ data, reply: { text: "Here's a tidy.", proposal }, agentId: agent.id });
  const asked: ChatMessage = { id: "m1", role: "user", text: "Tidy my bank letters", at: "2026-11-24T09:59:00.000Z" };
  const replies = landed.messages.map((said, index): ChatMessage => ({ ...said, id: `a${index + 1}`, role: "agent", agentId: agent.id, replyTo: "m1",
    at: "2026-11-24T10:00:00.000Z" }));
  const thread: Thread = { id: at.thread, messages: [asked, ...replies], read: 0, attachedNoteId: null };
  data.threads.push(thread);
  return { data, agent, proposal: replies[0].proposal! };
}
const now = new Date("2026-11-24T10:05:00.000Z");
const withThread = (data: ReturnType<typeof chat>["data"], thread: Thread) =>
  ({ ...data, threads: data.threads.map((item) => item.id === thread.id ? thread : item) });
const tidyOf = (thread: Thread) => thread.messages.find((message) => message.id === at.message)!.proposal!;

test("Apply approves a tidy from any device and asks its computer for the moves; a refused or moved one can't be asked again (D79)", () => {
  const { data, proposal } = chat("propose");
  const asked = askTidy(data, { ...at, proposal: proposal.id, action: "apply" }, now);
  assert.equal(tidyOf(asked.thread).status, "applied");
  assert.equal(tidyOf(asked.thread).files?.asked, now.toISOString(), "it says when, so a day-old wait offers Try again");
  assert.deepEqual(asked.job, { proposal: proposal.id, undo: false, moves: proposal.files!.moves });
  assert.deepEqual([asked.computer, asked.agentId], [office, "keeper"]);
  const lost = withThread({ ...data, agents: data.agents.map((agent) => agent.id === "keeper" ? { ...agent, tools: { "read-files": true } } : agent) }, data.threads.at(-1)!);
  assert.throws(() => askTidy(lost, { ...at, proposal: proposal.id, action: "apply" }), "an agent that lost Tidy files can't have it applied");
  const moved = withThread(data, tidied(withThread(data, asked.thread), at, asked.job, { results: [{ file: "Documents/scan0.pdf" }, { file: "Documents/scan1.pdf" }] })!);
  assert.throws(() => askTidy(moved, { ...at, proposal: proposal.id, action: "apply" }), /already moved them/);
  assert.throws(() => askTidy(data, { ...at, proposal: "other", action: "apply" }), /no longer in the conversation/);
});

test("what the computer did lands on the card, one result per move; Undo asks for the moved ones back, once (D79)", () => {
  const { data, proposal } = chat("propose");
  const apply = askTidy(data, { ...at, proposal: proposal.id, action: "apply" }, now);
  const applied = withThread(data, apply.thread);
  assert.throws(() => askTidy(applied, { ...at, proposal: proposal.id, action: "undo" }), /haven't moved/, "nothing to undo while it waits");
  const done = withThread(data, tidied(applied, at, apply.job, { results: [{ file: "Documents/scan1.pdf", failed: "a file of that name is already there" }] })!);
  assert.deepEqual(tidyOf(done.threads.at(-1)!).files?.done, [
    { file: "Documents/scan0.pdf", failed: "the computer didn't say" },
    { file: "Documents/scan1.pdf", failed: "a file of that name is already there" },
  ], "in move order; one the report leaves out stayed");
  assert.throws(() => askTidy(done, { ...at, proposal: proposal.id, action: "undo" }), /haven't moved/, "nor when none moved");

  const moved = withThread(data, tidied(applied, at, apply.job, { results: [{ file: "Documents/scan0.pdf" }, { file: "Documents/scan1.pdf" }] })!);
  const undo = askTidy(moved, { ...at, proposal: proposal.id, action: "undo" }, now);
  assert.deepEqual(undo.job, { proposal: proposal.id, undo: true });
  assert.equal(tidyOf(undo.thread).files?.undoing, true);
  const undoing = withThread(data, undo.thread);
  assert.throws(() => askTidy(undoing, { ...at, proposal: proposal.id, action: "undo" }), /already putting them back/);
  const back = tidied(undoing, at, undo.job, { results: [{ file: "Documents/scan0.pdf" }, { file: "Documents/scan1.pdf", failed: "it changed since it moved" }] })!;
  assert.equal(tidyOf(back).status, "undone", "undone once any file is back");
  assert.equal(tidyOf(back).files?.undoing, undefined);
  assert.deepEqual(tidyOf(back).files?.undone, [{ file: "Documents/scan0.pdf" }, { file: "Documents/scan1.pdf", failed: "it changed since it moved" }]);
  assert.throws(() => askTidy(withThread(data, back), { ...at, proposal: proposal.id, action: "undo" }), /haven't moved/, "and only once");
});

test("a computer that couldn't run the ask says why on the card, and Try again asks again (D79)", () => {
  const { data, proposal } = chat("propose");
  const apply = askTidy(data, { ...at, proposal: proposal.id, action: "apply" }, now);
  const failed = tidied(withThread(data, apply.thread), at, apply.job, { failed: "Tidying is off on this computer." })!;
  assert.equal(tidyOf(failed).files?.failed, "Tidying is off on this computer.");
  assert.equal(tidyOf(failed).files?.done, undefined);
  const again = askTidy(withThread(data, failed), { ...at, proposal: proposal.id, action: "apply" }, now);
  assert.equal(tidyOf(again.thread).files?.failed, undefined, "asking again clears why the last ask failed");
  assert.equal(tidied(data, { ...at, message: "gone" }, apply.job, { results: [] }), undefined, "a tidy no longer there lands nothing");
});

test("a proactive agent's tidy lands approved and needs a job, once: not an earlier message's, a moved one or a refused one (D79)", () => {
  const { data } = chat("full", 13);
  const thread = data.threads.at(-1)!;
  assert.deepEqual(approvedTidies(thread, "m1").map((message) => [message.id, message.proposal.files.moves.length]), [["a1", 10]],
    "the first 10, approved as they landed; the 3 more wait for you");
  assert.deepEqual(approvedTidies(thread, "m1", thread.messages), [], "a landing asks only for the tidies it posted");
  assert.deepEqual(approvedTidies(thread, "other"), []);
  const { data: proposeData } = chat("propose");
  assert.deepEqual(approvedTidies(proposeData.threads.at(-1)!, "m1"), [], "one that waits for you needs no job yet");
  const failed = { ...thread, messages: thread.messages.map((message) => message.proposal?.files
    ? { ...message, proposal: { ...message.proposal, files: { ...message.proposal.files, failed: "Office PC was removed." } } } : message) };
  assert.deepEqual(approvedTidies(failed, "m1"), [], "nor one its computer refused, which waits for Try again");
});

test("the page's Apply and Undo go to the agent function and take back the records it wrote, or its refusal (D79)", async () => {
  const bodies: string[] = [];
  const records = { puts: [["message:agent:keeper:a1", { thread: "agent:keeper", n: 1 }]], deletes: [] };
  const ask = createTidyAsk(async (body) => { bodies.push(body); return new Response(JSON.stringify({ records })); });
  assert.deepEqual(await ask({ ...at, proposal: "p1", action: "apply" }), records);
  assert.deepEqual(JSON.parse(bodies[0]), { tidy: { ...at, proposal: "p1", action: "apply" } });
  const refused = createTidyAsk(async () => new Response(JSON.stringify({ error: "Tidying is off on Office PC." }), { status: 409 }));
  await assert.rejects(refused({ ...at, proposal: "p1", action: "undo" }), /Tidying is off on Office PC/);
  const broken = createTidyAsk(async () => new Response("not json", { status: 502 }));
  await assert.rejects(broken({ ...at, proposal: "p1", action: "undo" }), /Couldn't reach your account/);
});
