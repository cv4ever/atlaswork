import test from "node:test";
import assert from "node:assert/strict";
import { learnedOf, snapshotOf } from "./agentRequest.ts";
import { askOf, handoffOf, proposalOf } from "./commands.ts";
import type { Agent } from "./model.ts";
import { act, answerAsk, decideLearned, land, reviewCap, unrememberIn } from "./proposals.ts";
import { normalize } from "./workspace.ts";
import { parseSnapshot, systemPrompt } from "../supabase/functions/agent/logic.ts";

function fixture(writeMode: Agent["writeMode"], open = 2) {
  const data = normalize(null).data;
  const agent: Agent = { ...data.agents[0], id: "keeper", name: "Keeper", writeMode,
    tools: { "see-tasks": true, "add-tasks": true }, access: { calendar: { level: "add", away: false } } };
  data.agents.push(agent);
  data.domains[0] = { ...data.domains[0], agentId: agent.id };
  data.tasks = Array.from({ length: open }, (_, index) => ({ id: `t${index}`, title: `Task ${index}`, domain: data.domains[0].name, projectId: "", done: false, due: "2026-11-12" }));
  return { data, agent };
}
const review = (data: ReturnType<typeof fixture>["data"], agent: Agent) =>
  proposalOf({ data, agent }, { command: "review_changes", args: { complete: data.tasks.map((task) => task.title) } })!;
const newTasks = (data: ReturnType<typeof fixture>["data"], agent: Agent) =>
  proposalOf({ data, agent }, { command: "propose_tasks", args: { place: data.domains[0].name, tasks: ["Call the plumber", "Buy paint"] } })!;

test("write mode decides whether a Proposal waits or applies with Undo, and the message says which", () => {
  const asks = fixture("propose");
  const waiting = land({ data: asks.data, reply: { text: "Two steps.", proposal: newTasks(asks.data, asks.agent) }, agentId: asks.agent.id });
  assert.equal(waiting.messages.length, 1);
  assert.equal(waiting.messages[0].proposal!.status, "pending");
  assert.equal(waiting.messages[0].text, "Two steps. Nothing changes until you approve.");
  assert.deepEqual(waiting.change.changes, {});

  const does = fixture("full");
  const applied = land({ data: does.data, reply: { text: "Two steps.", proposal: newTasks(does.data, does.agent) }, agentId: does.agent.id });
  assert.equal(applied.messages[0].proposal!.status, "applied");
  assert.equal(applied.messages[0].text, "Two steps. I added 2 tasks. Undo if it isn't right.");
  assert.deepEqual(applied.change.changes.tasks!.map((task) => task.title), ["Call the plumber", "Buy paint"]);
});

test(`a proactive run applies at most ${reviewCap} review changes itself and leaves the rest pending; an answer in chat has no cap`, () => {
  const { data, agent } = fixture("full", reviewCap + 2);
  const proposal = review(data, agent);
  const run = land({ data, reply: { text: "", proposal }, agentId: agent.id, proactive: true });
  assert.deepEqual(run.messages.map((message) => [message.proposal!.status, message.proposal!.changes!.length]), [["applied", reviewCap], ["pending", 2]]);
  assert.notEqual(run.messages[1].proposal!.id, proposal.id, "the rest is its own Proposal");
  assert.equal(run.messages[0].text, `I made ${reviewCap} changes. Undo if it isn't right.`);
  assert.equal(run.messages[1].text, `And 2 more changes, past the ${reviewCap} I make on my own in one go. Your call.`);
  assert.equal(run.change.changes.tasks!.filter((task) => task.done).length, reviewCap);

  const asked = land({ data, reply: { text: "Done:", proposal }, agentId: agent.id });
  assert.equal(asked.messages.length, 1);
  assert.equal(asked.change.changes.tasks!.length, reviewCap + 2);
});

test("a full-write Proposal whose source drifted stays pending instead of applying part of it", () => {
  const { data, agent } = fixture("full");
  const proposal = newTasks(data, agent);
  const taken = { ...data, tasks: [...data.tasks, { ...proposal.items[0], title: "Someone else's task" }] };
  const landed = land({ data: taken, reply: { text: "Here.", proposal }, agentId: agent.id });
  assert.equal(landed.messages[0].proposal!.status, "pending");
  assert.equal(landed.change.data, taken);
});

test("a reply whose agent lost what it drafted with lands nothing", () => {
  const { data, agent } = fixture("full");
  const proposal = newTasks(data, agent);
  const revoked = { ...data, agents: data.agents.map((item) => item.id === agent.id ? { ...item, tools: { ...item.tools, "add-tasks": false } } : item) };
  assert.throws(() => land({ data: revoked, reply: { text: "Here.", proposal }, agentId: agent.id }), /permissions/);
  const handoff = handoffOf({ data, agent }, { command: "add_to_calendar", args: { titles: ["Task 0"] } })!;
  assert.ok(handoff, "the calendar command binds its tasks");
  assert.throws(() => land({ data: { ...data, tasks: data.tasks.slice(1) }, reply: { text: "", handoff }, agentId: agent.id }), /places changed/);
});

test("a Handoff without words still posts its links", () => {
  const { data, agent } = fixture("propose");
  const handoff = handoffOf({ data, agent }, { command: "add_to_calendar", args: { titles: ["Task 0"] } })!;
  const landed = land({ data, reply: { text: "", handoff }, agentId: agent.id });
  assert.deepEqual(landed.messages, [{ text: "Done.", links: handoff.links }]);
});

test("scam warnings land on the reply's first message, from what the loop found and from the words, however it ran (D79)", () => {
  const { data, agent } = fixture("full");
  const read = land({ data, reply: { text: "That call sounds like a scam.", warnings: ["remote-access"] }, agentId: agent.id });
  assert.deepEqual(read.messages[0].warnings, ["remote-access"]);
  const wrote = land({ data, reply: { text: "Send me the verification code you received.", warnings: ["remote-access"] }, agentId: agent.id });
  assert.deepEqual(wrote.messages[0].warnings, ["remote-access", "secret"], "its own words are checked here, whoever ran the loop");
  const quiet = land({ data, reply: { text: "Two steps.", proposal: newTasks(data, agent) }, agentId: agent.id });
  assert.ok(quiet.messages.every((message) => !("warnings" in message)));
});

const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" };
/** An agent allowed to tidy (D79), and a tidy of `count` bank statements as the function binds it, naming the computer it ran on. */
function tidier(writeMode: Agent["writeMode"]) {
  const { data, agent } = fixture(writeMode);
  agent.tools = { ...agent.tools, "tidy-files": true };
  const tidy = (count: number) => proposalOf({ data, agent, ranOn: office }, { command: "tidy_files",
    args: { moves: Array.from({ length: count }, (_, index) => ({ file: `Documents/scan${index}.pdf`, folder: "Bank", why: "A bank statement" })) } })!;
  return { data, agent, tidy };
}

test("a tidy names the computer its reply ran on, and drops a move Windows wouldn't take or that changes nothing (D79)", () => {
  const { data, agent } = tidier("propose");
  const moves = [
    { file: "Documents/Banco/carta.docx", folder: "Bank", name: "Carta crédito 2026.DOCX", why: "A letter from the bank" },
    { file: "Documents/scan.pdf", folder: "Bank:2026", why: "A folder Windows refuses" },
    { file: "Desktop/recibo.pdf", name: "recibo", why: "Its own name again" },
    { file: "Desktop/seguro.pdf", folder: "Insurance", why: "A home policy" },
    { file: "documents/banco/CARTA.docx", folder: "Letters", why: "The same file twice" },
  ];
  assert.deepEqual(proposalOf({ data, agent, ranOn: office }, { command: "tidy_files", args: { moves } })?.files, { computer: office, moves: [
    { file: "Documents/Banco/carta.docx", folder: "Bank", name: "Carta crédito 2026", why: "A letter from the bank" },
    { file: "Desktop/seguro.pdf", folder: "Insurance", why: "A home policy" },
  ] }, "the extension stays the file's own");
  assert.equal(proposalOf({ data, agent }, { command: "tidy_files", args: { moves } }), undefined, "without the computer it ran on, nothing to tidy");
  assert.equal(proposalOf({ data, agent: { ...agent, tools: {} }, ranOn: office }, { command: "tidy_files", args: { moves } }), undefined,
    "nor for an agent without Tidy files");
});

test("a tidy of files a search found on another computer is for that one computer, its paths without the name (D84)", () => {
  const { data, agent } = tidier("propose");
  const laptop = { id: "6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b", name: "Laptop" };
  const moves = [
    { file: "Laptop: Papers/carta.docx", folder: "Bank", why: "A bank letter" },
    { file: "Office PC: Documents/scan.pdf", folder: "Bank", why: "On another computer" },
    { file: "Documents/other.pdf", folder: "Bank", why: "On the computer it ran on" },
    { file: "Laptop: Papers/recibo.pdf", folder: "Health", why: "A receipt" },
  ];
  assert.deepEqual(proposalOf({ data, agent, ranOn: office, computers: [office, laptop] }, { command: "tidy_files", args: { moves } })?.files, { computer: laptop, moves: [
    { file: "Papers/carta.docx", folder: "Bank", why: "A bank letter" },
    { file: "Papers/recibo.pdf", folder: "Health", why: "A receipt" },
  ] }, "files never move between computers: the first move's computer holds the tidy");
});

test("a tidy lands by write mode: a proactive agent approves up to 10 files on its own, the rest wait; nothing is undone before it moves (D79)", () => {
  const asks = tidier("propose");
  const waiting = land({ data: asks.data, reply: { text: "Here's a tidy.", proposal: asks.tidy(3) }, agentId: asks.agent.id });
  assert.equal(waiting.messages[0].proposal?.status, "pending");
  assert.equal(waiting.messages[0].text, "Here's a tidy. Nothing moves until you approve.");
  const does = tidier("full");
  const done = land({ data: does.data, reply: { text: "Tidied.", proposal: does.tidy(3) }, agentId: does.agent.id });
  assert.equal(done.messages[0].proposal?.status, "applied");
  assert.equal(done.messages[0].text, "Tidied. I'll tidy 3 files on Office PC.");
  assert.deepEqual(done.change.changes, {}, "approving moves no records: the files move on the computer");
  const many = land({ data: does.data, reply: { text: "Lots.", proposal: does.tidy(13) }, agentId: does.agent.id });
  assert.deepEqual(many.messages.map((message) => [message.proposal?.status, message.proposal?.files?.moves.length]), [["applied", 10], ["pending", 3]]);
  assert.equal(many.messages[1].text, "And 3 more files, past the 10 I move on my own in one go. Your call.");
  assert.equal(many.messages[0].proposal?.files?.moves[9].file, "Documents/scan9.pdf", "the first 10 go, in order");
  const later = many.messages[1].proposal!;
  assert.equal(act(does.data, { agentId: does.agent.id, proposal: later }, null, "apply").proposal.status, "applied", "Apply approves the rest");
  assert.throws(() => act(does.data, { agentId: does.agent.id, proposal: many.messages[0].proposal! }, null, "undo"), /haven't moved/);
});

test("Apply admits again against current records; Undo reverses; Reject changes nothing", () => {
  const { data, agent } = fixture("propose");
  const proposal = newTasks(data, agent);
  const message = { agentId: agent.id, proposal };
  const revoked = { ...data, agents: data.agents.map((item) => item.id === agent.id ? { ...item, tools: { ...item.tools, "add-tasks": false } } : item) };
  assert.throws(() => act(revoked, message, null, "apply"), /permissions/);
  const applied = act(data, message, null, "apply");
  assert.equal(applied.proposal.status, "applied");
  assert.equal(applied.change.data.tasks.length, data.tasks.length + 2);
  const undone = act(applied.change.data, { ...message, proposal: applied.proposal }, null, "undo");
  assert.equal(undone.proposal.status, "undone");
  assert.deepEqual(undone.change.data.tasks, data.tasks);
  const rejected = act(data, message, null, "reject");
  assert.equal(rejected.proposal.status, "rejected");
  assert.deepEqual(rejected.change.changes, {});
});

test("memories land whatever the write mode, only where the agent may remember, and Undo puts back what they replaced", () => {
  const { data, agent } = fixture("propose");
  const you = { domain: "", projectId: "", text: "Keeps Sundays free.", quote: "I never plan Sundays" };
  const first = land({ data, reply: { text: "Noted.", memories: [you, { ...you, domain: "Health", text: "Knee hurts after runs." }] }, agentId: agent.id });
  assert.deepEqual(first.change.data.memories.map((memory) => [memory.text, memory.agentId]), [["Keeps Sundays free.", agent.id]], "a place it doesn't look after is dropped");
  assert.equal(first.messages[0].remembered?.length, 1);
  const saved = first.change.data.memories[0];

  const corrected = land({ data: first.change.data, reply: { text: "Updated.", memories: [{ ...you, text: "Keeps Saturdays free.", replaces: saved.id }] }, agentId: agent.id });
  assert.deepEqual(corrected.change.data.memories.map((memory) => [memory.id, memory.text]), [[saved.id, "Keeps Saturdays free."]], "a correction keeps one version");
  const undone = unrememberIn(corrected.change.data, corrected.messages[0].remembered!, saved.id);
  assert.deepEqual(undone.change.data.memories.map((memory) => memory.text), ["Keeps Sundays free."]);
  assert.equal(undone.remembered[0].undone, true);
  assert.throws(() => unrememberIn(undone.change.data, undone.remembered, saved.id), /no longer in this message/);

  const edited = { ...first.change.data, memories: [{ ...saved, text: "Keeps weekends free." }] };
  assert.throws(() => unrememberIn(edited, first.messages[0].remembered!, saved.id), /changed since/, "Undo never overwrites a newer version");
});

test("where things are on a computer binds like a memory, in words code writes, and corrects only one learned on that computer (D80)", () => {
  const { data, agent } = fixture("propose");
  const office = { id: "c1", name: "Office PC" };
  data.memories = [
    { id: "own", domain: "", projectId: "", text: "Banks with Banco Lusitano.", quote: "I bank with Banco Lusitano", agentId: agent.id, at: "2026-11-01T10:00:00.000Z" },
    { id: "there", domain: "", projectId: "", text: "Bank letters: Documents\\Bank on Office PC", quote: "", agentId: agent.id, at: "2026-11-02T10:00:00.000Z", computer: office },
  ];
  // The agent reads them newest first: m1 is the one learned on Office PC, m2 your own words.
  const request = { agent, data, request: "Where are the bank letters now?", ranOn: office };
  const offered = [{ what: "  Bank   letters ", folder: "Documents/Banco/", place: "", replaces: "m1" }, { what: "Receipts", folder: "Documents", place: "", replaces: "m2" },
    { what: "Scans", folder: "Documents", place: "Nowhere" }, { what: "x".repeat(81), folder: "Documents", place: "" }, { what: "Notes", folder: "", place: "" }];
  assert.deepEqual(learnedOf(request, offered), [
    { domain: "", projectId: "", text: "Bank letters: Documents\\Banco on Office PC", quote: "", computer: office, replaces: "there" },
    { domain: "", projectId: "", text: "Receipts: Documents on Office PC", quote: "", computer: office },
  ], "a place it can't remember in, a long label or no folder is dropped, and your own words are never replaced");
  assert.deepEqual(learnedOf({ ...request, ranOn: undefined }, offered), [], "nothing without the computer the job ran on");
});

test("where things are waits for Keep or Not this whatever the write mode, and once kept is a memory naming its computer, with Undo (D80)", () => {
  const { data, agent } = fixture("full");
  const office = { id: "c1", name: "Office PC" };
  const where = { domain: "", projectId: "", text: "Bank letters: Documents\\Bank on Office PC", quote: "", computer: office };
  const landed = land({ data, reply: { text: "They're in Documents\\Bank.", learned: [where, { ...where, domain: "Health", text: "Scans: Documents on Office PC" }] }, agentId: agent.id });
  assert.deepEqual(landed.change.data.memories, [], "nobody reads it before you keep it, even from a full-write agent");
  assert.deepEqual(landed.messages[0].learned?.map(({ memory, state }) => [memory.text, memory.computer, state]), [[where.text, office, "offered"]],
    "a place it doesn't look after is dropped");
  const offered = landed.messages[0].learned!;
  const id = offered[0].memory.id;
  const declined = decideLearned(landed.change.data, offered, id, "decline");
  assert.deepEqual([declined.learned[0].state, declined.change.data.memories], ["declined", []]);
  assert.throws(() => decideLearned(declined.change.data, declined.learned, id, "keep"), /no longer waiting/, "once answered, it's answered");
  const lost = { ...landed.change.data, agents: landed.change.data.agents.map((item) => item.id === agent.id ? { ...item, tools: { ...item.tools, remember: false } } : item) };
  assert.throws(() => decideLearned(lost, offered, id, "keep"), /can't remember there/, "Keep admits again: with Remember off nothing is kept");

  const kept = decideLearned(landed.change.data, offered, id, "keep");
  assert.deepEqual(kept.change.data.memories.map((memory) => [memory.id, memory.text, memory.computer]), [[id, where.text, office]]);
  assert.equal(kept.learned[0].state, "kept");
  const undone = decideLearned(kept.change.data, kept.learned, id, "undo");
  assert.deepEqual([undone.learned[0].state, undone.change.data.memories], ["undone", []]);

  const moved = land({ data: kept.change.data, reply: { text: "They moved.", learned: [{ ...where, text: "Bank letters: Documents\\Banco on Office PC", replaces: id }] }, agentId: agent.id });
  const correction = decideLearned(moved.change.data, moved.messages[0].learned!, id, "keep");
  assert.deepEqual(correction.change.data.memories.map((memory) => memory.text), ["Bank letters: Documents\\Banco on Office PC"], "a kept correction replaces the one it names");
  assert.deepEqual(decideLearned(correction.change.data, correction.learned, id, "undo").change.data.memories.map((memory) => memory.text), [where.text],
    "and Undo puts that one back");
});

test("with Remember off an agent isn't offered remember and nothing it drafted lands, though it still reads what's remembered", () => {
  const { data, agent } = fixture("propose");
  const you = { domain: "", projectId: "", text: "Keeps Sundays free.", quote: "I never plan Sundays" };
  const kept = land({ data, reply: { text: "Noted.", memories: [you] }, agentId: agent.id }).change.data;
  const off = { ...kept, agents: kept.agents.map((item) => item.id === agent.id ? { ...item, tools: { ...item.tools, remember: false } } : item) };
  const quiet = off.agents.find((item) => item.id === agent.id)!;
  const memory = snapshotOf({ agent: quiet, data: off, request: "Hi" }, "2026-11-14").memory;
  assert.deepEqual([memory?.listening, memory?.items.map((item) => item.text)], [false, ["Keeps Sundays free."]]);
  const later = land({ data: off, reply: { text: "Noted.", memories: [{ ...you, text: "Prefers tea." }] }, agentId: agent.id });
  assert.deepEqual([later.change.data.memories.length, later.messages[0].remembered], [1, undefined], "switched off after the reply was drafted");
});

test("a question for another agent waits for your OK; Always lets that pair talk in chat, never from a routine; a gone agent refuses", () => {
  const { data, agent } = fixture("full");
  const muse: Agent = { ...data.agents[0], id: "muse", name: "Muse", role: "Health coach" };
  data.agents.push(muse);
  const question = () => askOf({ data, agent }, { command: "ask_agent", args: { to: "muse", question: "When is the dentist?" } })!;
  const waiting = land({ data, reply: { text: "I'll ask Muse.", ask: question() }, agentId: agent.id });
  assert.deepEqual([waiting.messages[0].ask!.to, waiting.messages[0].ask!.status, waiting.messages[0].text],
    ["muse", "pending", "I'll ask Muse. Nothing is sent until you approve."], "full write mode doesn't send a question by itself");

  const always = answerAsk(data, { agentId: agent.id, ask: waiting.messages[0].ask! }, "always");
  assert.equal(always.ask.status, "sent");
  assert.deepEqual(always.change.data.agents.find((item) => item.id === agent.id)!.mayAsk, ["muse"]);
  assert.throws(() => answerAsk(always.change.data, { agentId: agent.id, ask: always.ask }, "send"), /already answered/);
  const trusted = always.change.data;
  const chat = land({ data: trusted, reply: { text: "", ask: question() }, agentId: agent.id });
  assert.deepEqual([chat.messages[0].ask!.status, chat.messages[0].text], ["sent", "I'd like to ask Muse."]);
  assert.equal(land({ data: trusted, reply: { text: "", ask: question() }, agentId: agent.id, proactive: true }).messages[0].ask!.status, "pending",
    "a routine's question always waits for you");

  const gone = { ...trusted, agents: trusted.agents.map((item) => item.id === "muse" ? { ...item, archived: true } : item) };
  assert.throws(() => answerAsk(gone, { agentId: agent.id, ask: question() }, "send"), /isn't working here/);
  assert.equal(answerAsk(gone, { agentId: agent.id, ask: question() }, "decline").ask.status, "declined");
  const revoked = { ...data, agents: data.agents.map((item) => item.id === agent.id ? { ...item, tools: { ...item.tools, "ask-agents": false } } : item) };
  assert.throws(() => land({ data: revoked, reply: { text: "", ask: question() }, agentId: agent.id }), /permissions/);
});

test("agents read who else works here, and an agent answering a question asks nobody, remembers nothing and gets no roster", () => {
  const { data, agent } = fixture("propose");
  const muse: Agent = { ...data.agents[0], id: "muse", name: "Muse", role: "Health coach" };
  data.agents.push(muse);
  const asking = parseSnapshot(JSON.stringify(snapshotOf({ agent, data, request: "When is the dentist?" }, "2026-11-14")))!;
  assert.ok(asking.crew!.includes("Muse (Health coach): no places yet"), "the roster survives the function's boundary");
  assert.ok(systemPrompt(asking).includes("The other agents here, each seeing only their own places, as you see only yours: "));
  assert.ok(asking.commands.some((command) => command.name === "ask_agent"));

  const asked = { agent: muse, data, request: "Keeper asks you this for the person: When is the dentist?", asked: { by: "Keeper" } };
  const answering = snapshotOf(asked, "2026-11-14");
  assert.deepEqual([answering.crew, answering.memory!.listening, answering.commands.some((command) => command.name === "ask_agent")], [undefined, false, false]);
  assert.equal(askOf(asked, { command: "ask_agent", args: { to: "Keeper", question: "And you?" } }), undefined, "a question travels one hop");
});

test("the roster names a domain's live projects, up to three, so a question finds its owner", () => {
  const { data, agent } = fixture("propose");
  const health = "Health";
  data.agents.push({ ...data.agents[0], id: "vital", name: "Vital", role: "Health coach" });
  data.domains.push({ name: health, emoji: "", hue: "sage", intention: "", agentId: "vital" });
  const project = (id: string, archived = false) => ({ id, title: `Project ${id}`, area: health, description: "", color: "sage", ...archived && { archived } });
  data.projects = [project("a"), project("b", true), project("c"), project("d"), project("e")];
  assert.ok(snapshotOf({ agent, data, request: "Hi" }, "2026-11-14").crew!.includes(`Vital (Health coach): ${health} (Project a, Project c, Project d, …)`),
    "archived projects stay out, and past three the rest is an ellipsis");
});

test("you can reword a question before it goes, never to nothing, and what the asker does next travels with it", () => {
  const { data, agent } = fixture("propose");
  data.agents.push({ ...data.agents[0], id: "muse", name: "Muse" });
  const ask = askOf({ data, agent }, { command: "ask_agent", args: { to: "Muse", question: "Dentist?", then: "check it against the budget" } })!;
  assert.equal(ask.then, "check it against the budget");
  assert.equal(answerAsk(data, { agentId: agent.id, ask }, "send", "  When is the dentist cleaning? ").ask.question, "When is the dentist cleaning?");
  assert.throws(() => answerAsk(data, { agentId: agent.id, ask }, "send", "   "), /Write the question/);
  assert.equal(answerAsk(data, { agentId: agent.id, ask }, "send").ask.question, "Dentist?", "no edit sends it as drafted");
});
