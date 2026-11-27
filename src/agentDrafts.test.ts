import test from "node:test";
import assert from "node:assert/strict";
import { reviewDraft, replaceDrafts, settleDraft } from "./agentDrafts.ts";
import { snapshotOf } from "./agentRequest.ts";
import { proposalOf, specsOf } from "./commands.ts";
import { atlasId } from "./model.ts";
import type { Agent, Thread, WorkspaceData } from "./model.ts";
import { land } from "./proposals.ts";
import { normalize, saveDraft } from "./workspace.ts";
import { parseSnapshot, runTool } from "../supabase/functions/agent/logic.ts";

const rules = "Explain homework at the child's school year: short steps, one worked example, then a similar question to try. Give hints, never finished answers to graded work.";

function fixture() {
  const data = normalize(null).data;
  const atlas = data.agents.find((agent) => agent.id === atlasId)!;
  const kin: Agent = { id: "kin", name: "Kin", portrait: "kin", role: "Family organiser", instructions: "Birthdays and plans.", writeMode: "propose" };
  data.agents.push(kin);
  data.domains.push({ name: "Family", emoji: "🏡", hue: "#c2705a", intention: "", agentId: kin.id });
  return { data, atlas, kin };
}
const draftOf = (data: WorkspaceData, atlas: Agent, args: Record<string, unknown>) =>
  proposalOf({ data, agent: atlas }, { command: "propose_agent", args: { rules, ...args } });

test("only Atlas drafts agents, rules outside 135 to 230 characters go back to the model, and a draft carries a request to try it on", () => {
  const { data, atlas, kin } = fixture();
  assert.ok(specsOf({ data, agent: atlas }).some((spec) => spec.name === "propose_agent"));
  assert.ok(!specsOf({ data, agent: kin }).some((spec) => spec.name === "propose_agent"));
  const snapshot = parseSnapshot(JSON.stringify(snapshotOf({ data, agent: atlas, request: "An agent for homework" }, "2026-11-17")))!;
  assert.ok(snapshot, "the function accepts Atlas's request with propose_agent in it");
  const call = (args: Record<string, unknown>) => ({ id: "c", type: "function" as const, function: { name: "propose_agent", arguments: JSON.stringify(args) } });
  assert.match(runTool(snapshot, call({ start: "new", rules: "Help with homework." }), {}), /rules must be 135 to 230 characters and was 19\. Add to it, then call propose_agent again/);
  assert.match(runTool(snapshot, call({ start: "new", rules: rules + rules }), {}), /Shorten it/);
  assert.match(runTool(snapshot, call({ start: "Tutor", rules }), {}), /Give test as text/);
  assert.match(runTool(snapshot, call({ start: "Tutor", rules, test: "Just give me the answers to sheet 4." }), {}), /Proposed propose_agent/);
});

test("a draft lands waiting for review even from a proactive Atlas, and a newer draft replaces it", () => {
  const { data, atlas } = fixture();
  atlas.writeMode = "full";
  const first = land({ data, reply: { text: "Here's Tutor.", proposal: draftOf(data, atlas, { start: "Tutor" }) }, agentId: atlasId });
  assert.equal(first.messages[0].proposal!.status, "pending");
  assert.equal(first.messages[0].text, "Here's Tutor. Nothing changes until you review and save it.");
  assert.deepEqual(first.change.changes, {});
  const thread: Thread = { id: `agent:${atlasId}`, read: 0, attachedNoteId: null,
    messages: [{ id: "m1", role: "agent", text: "", proposal: first.messages[0].proposal }, { id: "m2", role: "agent", text: "", proposal: { ...first.messages[0].proposal!, id: "newer" } }] };
  const replaced = replaceDrafts(thread, "newer");
  assert.deepEqual(replaced.messages.map((message) => [message.proposal!.status, message.proposal!.replaced]), [["rejected", true], ["pending", undefined]]);
});

test("a suggested agent whose name is taken by then gets a free one, a missing domain is planted with it on Save, and Everyday stays Atlas's", () => {
  const { data, atlas } = fixture();
  const proposal = draftOf(data, atlas, { start: "Tutor", new_domain: [{ name: "School", emoji: "🎒", purpose: "Homework and tests" }], tools_on: ["web"], why: "To look things up." })!;
  // Someone named an agent Tutor after Atlas drafted.
  data.agents.push({ id: "other", name: "Tutor", portrait: "ellis", role: "", instructions: "", writeMode: "propose" });
  const draft = reviewDraft(data, proposal.agent!, { thread: `agent:${atlasId}`, proposal: proposal.id }, "2026-11-17T08:00:00.000Z");
  assert.notEqual(draft.agent.name, "Tutor");
  assert.notEqual(draft.agent.portrait, "ellis", "a face somebody wears isn't reused");
  assert.equal(draft.agent.instructions, rules);
  assert.equal(draft.agent.writeMode, "propose");
  assert.deepEqual(draft.atlas.flagged, ["web"]);
  assert.equal(draft.agent.routines?.[0].repeat.every, "week");
  assert.deepEqual(draft.places.domains, ["School"]);

  const thread: Thread = { id: `agent:${atlasId}`, read: 0, attachedNoteId: null, messages: [{ id: "m", role: "agent", text: "", proposal }] };
  data.threads.push(thread);
  const saved = settleDraft(saveDraft(data, { kind: "agent", ...draft }), draft.atlas);
  const school = saved.data.domains.find((domain) => domain.name === "School")!;
  assert.equal(school.agentId, draft.agent.id, "the new agent looks after the domain planted with it");
  assert.equal(saved.data.threads.find((item) => item.id === thread.id)!.messages[0].proposal!.status, "applied");
  assert.ok(saved.changes.domains && saved.changes.agents && saved.changes.threads, "domain, agent and proposal commit together");
  const everyday = reviewDraft(data, { domain: "Everyday", instructions: rules }, { thread: "t", proposal: "p" }, "2026-11-17T08:00:00.000Z");
  assert.deepEqual(everyday.places.domains, [], "Everyday stays Atlas's");
});

test("a crew agent's draft keeps who they are and where they work, and says what their rules were", () => {
  const { data, atlas, kin } = fixture();
  const proposal = draftOf(data, atlas, { start: "Kin", name: "Someone else" })!;
  assert.equal(proposal.agent!.agentId, kin.id);
  assert.equal(proposal.agent!.name, undefined);
  const draft = reviewDraft(data, proposal.agent!, { thread: "t", proposal: proposal.id }, "2026-11-17T08:00:00.000Z");
  assert.equal(draft.agent.name, "Kin");
  assert.deepEqual(draft.places.domains, ["Family"]);
  assert.equal(draft.atlas.was, "Birthdays and plans.");
  assert.equal(draft.original!.agent, kin);
  kin.archived = true;
  assert.throws(() => reviewDraft(data, proposal.agent!, { thread: "t", proposal: proposal.id }, ""), /isn't in the crew any more/);
});

test("an agent proposes changes to how it works itself; its routines keep their ids, and the review sets them only on Save (D69)", () => {
  const { data, atlas } = fixture();
  const improve = { id: "kin-improve", kind: "improve" as const, time: "08:00", repeat: { every: "week" as const, days: [1], weeks: 1 }, since: "2026-11-01T00:00:00.000Z" };
  data.agents = data.agents.map((agent) => agent.id === "kin" ? { ...agent, routines: [improve] } : agent);
  const kin = data.agents.find((agent) => agent.id === "kin")!;
  assert.ok(specsOf({ data, agent: kin }).some((spec) => spec.name === "propose_my_setup"));
  assert.ok(!specsOf({ data, agent: atlas }).some((spec) => spec.name === "propose_my_setup"), "Atlas changes agents through propose_agent");
  assert.ok(!specsOf({ data, agent: kin, routine: { kind: "improve" } }).some((spec) => spec.name === "propose_my_setup"), "never from a routine's run");
  const snapshot = parseSnapshot(JSON.stringify(snapshotOf({ data, agent: kin, request: "Do 2" }, "2026-11-19")))!;
  assert.ok(snapshot, "the function accepts the request with propose_my_setup in it");
  const proposal = proposalOf({ data, agent: kin }, { command: "propose_my_setup", args: {
    routines: [{ kind: "improve", days: "Friday", time: "18:00" }, { kind: "report", days: "weekdays" }], why: "Fridays you plan the weekend." } })!;
  const routines = proposal.agent!.routines!;
  assert.deepEqual(routines.map((routine) => [routine.id === improve.id, routine.kind, routine.repeat, routine.time]),
    [[true, "improve", { every: "week", days: [5], weeks: 1 }, "18:00"], [false, "report", { every: "week", days: [1, 2, 3, 4, 5], weeks: 1 }, "18:00"]]);
  assert.equal(proposalOf({ data, agent: kin }, { command: "propose_my_setup", args: { why: "Nothing." } }), undefined, "a draft that changes nothing isn't one");
  const draft = reviewDraft(data, proposal.agent!, { thread: "agent:kin", proposal: proposal.id }, "2026-11-19T00:00:00.000Z");
  assert.deepEqual([draft.original?.agent.routines, draft.agent.routines], [[improve], routines], "the dialog shows the change against what Kin has now");
});
