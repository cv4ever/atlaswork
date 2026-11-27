import test from "node:test";
import assert from "node:assert/strict";
import { displayOf, specsOf } from "./commands.ts";
import { calendarReads, suggestedAccess } from "./connectionAccess.ts";
import { seedWorkspace } from "./demo.ts";
import { atlasId } from "./model.ts";
import type { Agent, ChatMessage, ToolUse, WorkspaceData } from "./model.ts";
import { normalize } from "./workspace.ts";

const reply = (agentId: string, at: string, used: ToolUse[]): ChatMessage => ({ id: `${agentId}-${at}`, role: "agent", agentId, text: "…", at, used });

test("each agent's last calendar read is its latest reply that read it; a failed read or another source doesn't count (D83)", () => {
  const data = normalize(null).data;
  const threads: WorkspaceData["threads"] = [
    { id: "agent:vital", attachedNoteId: null, read: 0, messages: [reply("vital", "2026-11-20T09:00:00Z", [{ tool: "free_time", about: "2026-11-20" }]),
      reply("vital", "2026-11-22T09:00:00Z", [{ tool: "read_calendar", about: "2026-11-22", failed: "unanswered" }])] },
    { id: "room", attachedNoteId: null, read: 0, messages: [reply("vital", "2026-11-21T09:00:00Z", [{ tool: "read_calendar", about: "2026-11-21" }]),
      reply("kin", "2026-11-23T09:00:00Z", [{ tool: "read_notes", about: "dentist" }])] },
  ];
  const reads = calendarReads({ ...data, threads });
  assert.deepEqual([...reads], [["vital", "2026-11-21T09:00:00Z"]]);
});

test("a first setup suggests events for whoever looks after home, free time for other domain agents, and nothing once anyone has access (D83)", () => {
  const data = normalize(seedWorkspace()).data;
  const suggestions = suggestedAccess(data);
  const of = (id: string) => suggestions.find((item) => item.agentId === id);
  assert.ok(!of(atlasId), "Atlas keeps his own");
  const kin = data.agents.find((agent) => agent.id === "kin")!;
  assert.equal(of(kin.id)?.level, "events", "Kin looks after Family");
  assert.equal(of("vital")?.level, "free", "Vital looks after Health");
  assert.ok(suggestions.every((item) => data.domains.some((domain) => domain.agentId === item.agentId)), "only agents that look after a domain");
  const granted = { ...data, agents: data.agents.map((agent): Agent => agent.id === "vital" ? { ...agent, access: { calendar: { level: "free", away: false } } } : agent) };
  assert.deepEqual(suggestedAccess(granted), [], "once you chose for anyone, it stays out of the way");
});

test("an agent without enough calendar access may ask for it, only in a chat you're in, and only for a rung above its own (D83)", () => {
  const data = normalize(seedWorkspace()).data;
  const vital = data.agents.find((agent) => agent.id === "vital")!;
  const offers = { calendar: true as const };
  const asks = (agent: Agent, more: object = {}) => specsOf({ agent, data, offers, ...more }).find((spec) => spec.name === "ask_calendar_access");
  assert.deepEqual(asks(vital)?.args.level.oneOf, ["free", "events", "add"]);
  const free = { ...vital, access: { calendar: { level: "free" as const, away: false } } };
  assert.deepEqual(asks(free)?.args.level.oneOf, ["events", "add"]);
  assert.equal(asks({ ...vital, access: { calendar: { level: "add", away: false } } }), undefined, "nothing left to ask for");
  assert.equal(specsOf({ agent: vital, data }).find((spec) => spec.name === "ask_calendar_access"), undefined, "not in builds without the calendar");
  assert.equal(asks(vital, { routine: { kind: "report" } }), undefined, "nobody is there to tap in a routine");
  const shown = (agent: Agent, level: string) => displayOf({ agent, data, offers }, { command: "ask_calendar_access", args: { level } });
  assert.deepEqual(shown(free, "events"), { calendar: "events" });
  assert.equal(shown(free, "free"), undefined, "a rung it already has asks nothing");
});
