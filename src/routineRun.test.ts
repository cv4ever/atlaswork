import assert from "node:assert/strict";
import test from "node:test";
import { draftsOf } from "./agentRequest.ts";
import type { AgentReply, AgentRequest } from "./agentRequest.ts";
import { atlasId } from "./model.ts";
import type { Routine, WorkspaceData } from "./model.ts";
import { runRoutine } from "./routineRun.ts";
import type { RunInput } from "./routineRun.ts";
import { normalize } from "./workspace.ts";

const checkIn: Routine = { id: "morning", kind: "check-in", time: "08:00", repeat: { every: "week", days: [0, 1, 2, 3, 4, 5, 6], weeks: 1 }, since: "2026-11-01T00:00:00.000Z" };
const improve: Routine = { ...checkIn, id: "better", kind: "improve" };
function workspace(routine = checkIn): WorkspaceData {
  const data = normalize(null).data;
  return { ...data, agents: data.agents.map((agent) => agent.id === atlasId ? { ...agent, routines: [routine] } : agent),
    notes: [{ id: "plan", domain: data.domains[0].name, projectId: "", title: "Plan", body: "- Measure the wall", updatedAt: "2026-11-10T00:00:00.000Z" }] };
}
/** What the model says to each request in turn: words, and a draft the runner binds as an engine would. */
type Said = { text: string; draft?: unknown; usage?: AgentReply["usage"] };
function run(answers: (Said | Error)[], { data = workspace(), routine = checkIn, ...input }: Partial<RunInput> & { data?: WorkspaceData; routine?: Routine } = {}) {
  const asked: string[] = [];
  const atlas = data.agents.find((agent) => agent.id === atlasId)!;
  const verdict = runRoutine({ admitted: { routine, owner: { kind: "agent", id: atlasId }, runner: atlas, due: new Date("2026-11-16T08:00:00") },
    workspace: () => data, since: -Infinity, now: new Date("2026-11-16T09:00:00"), today: "2026-11-16",
    ask: async (request: AgentRequest) => {
      asked.push(request.request);
      const said = answers.shift()!;
      if (said instanceof Error) throw said;
      return { text: said.text, ...draftsOf(request, [said.draft]), ...said.usage && { usage: said.usage } };
    }, ...input });
  return { verdict, asked };
}
const proposeTheWall: Said = { text: "From your plan:", draft: { command: "propose_tasks", args: { place: "Everyday", tasks: [{ title: "Measure the wall" }] } },
  usage: { input: 900, output: 40 } };
const prose: Said = { text: "I suggest:\n\n- Measure the wall", usage: { input: 800, output: 30 } };

test("a check-in with nothing new since it last ran ends before asking; Run now asks anyway (D67)", async () => {
  const since = Date.parse("2026-11-15T08:00:00");
  const scheduled = run([proposeTheWall], { since });
  assert.deepEqual([(await scheduled.verdict).outcome, scheduled.asked], ["no-news", []]);
  const manual = run([proposeTheWall], { since, manual: true });
  assert.deepEqual([(await manual.verdict).outcome, manual.asked.length], ["posted", 1]);
});

test("a check-in posts its proposal as a proactive reply, stamped with what it was asked and what it spent", async () => {
  const { verdict, asked } = run([proposeTheWall]);
  const done = await verdict;
  assert.ok(done.outcome === "posted");
  assert.deepEqual(done.request, asked[0]);
  assert.deepEqual(done.landed.messages[0].proposal?.items.map((item) => item.title), ["Measure the wall"]);
  assert.deepEqual([done.usage, done.spent], [{ input: 900, output: 40 }, { replies: 1, tokens: 940 }]);
});

test("prose is asked once more and both calls count; prose twice fails, and a quiet line in other words posts nothing (D69)", async () => {
  const fixed = run([prose, proposeTheWall]);
  const posted = await fixed.verdict;
  assert.ok(posted.outcome === "posted");
  assert.deepEqual([posted.request, posted.spent], [fixed.asked[0], { replies: 2, tokens: 1770 }], "the stamp keeps the first request");
  assert.match(fixed.asked[1], /Make them one propose_tasks call now, or answer exactly NOTHING NEW\.$/);
  assert.deepEqual(await run([prose, prose]).verdict,
    { outcome: "failed", reason: "It answered in words instead of a proposal, twice.", spent: { replies: 2, tokens: 1660 } });
  const calm = run([{ text: "**No new tasks to add**." }]);
  assert.deepEqual([(await calm.verdict).outcome, calm.asked.length], ["quiet", 1]);
});

test("a quiet answer that shows a widget still posts it, under no words (D64)", async () => {
  const base = workspace();
  const data = { ...base, domains: base.domains.map((domain) => ({ ...domain, widgets: [{ id: "stretch", type: "habit" as const, title: "Stretch" }] })) };
  const verdict = await run([{ text: "NOTHING NEW", draft: { command: "show_widgets", args: { widgets: [{ title: "Stretch" }] } } }], { data }).verdict;
  assert.ok(verdict.outcome === "posted");
  const [message] = verdict.landed.messages;
  assert.deepEqual([message.text, message.display], ["", { blocks: [{ place: `area:${data.domains[0].name}`, id: "stretch" }] }]);
});

test("a runner archived while the model answered posts nothing", async () => {
  const before = workspace();
  const after = { ...before, agents: before.agents.map((agent) => agent.id === atlasId ? { ...agent, archived: true } : agent) };
  let answered = false;
  const verdict = await run([proposeTheWall], { data: before, workspace: () => answered ? after : before,
    ask: async (request) => { answered = true; return { text: proposeTheWall.text, ...draftsOf(request, [proposeTheWall.draft]) }; } }).verdict;
  assert.deepEqual(verdict, { outcome: "quiet", spent: { replies: 1, tokens: 0 } });
});

test("a refused reply fails with its reason and keeps what was asked (D69)", async () => {
  assert.deepEqual(await run([new Error("Live agents need Pro.")]).verdict, { outcome: "failed", reason: "Live agents need Pro.", spent: { replies: 1, tokens: 0 } });
});

test("a weekly improvement's numbered suggestions become answers to tap (D68)", async () => {
  const verdict = await run([{ text: "Three ideas:\n\n1. Start a reading list\n2. Move the dentist task\n3. Archive Garden" }], { data: workspace(improve), routine: improve }).verdict;
  assert.ok(verdict.outcome === "posted");
  assert.deepEqual(verdict.landed.messages[0].display, { choices: ["Do 1", "Do 2", "Do 3", "Not now"] });
});
