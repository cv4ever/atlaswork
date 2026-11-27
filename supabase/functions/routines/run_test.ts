import assert from "node:assert/strict";
import { atlasId } from "../../../src/model.ts";
import type { Routine, WorkspaceData } from "../../../src/model.ts";
import { normalize } from "../../../src/workspace.ts";
import type { Changes } from "../../../src/workspace.ts";
import { instantOf, offsetMinutes, runDue, wallOf } from "./run.ts";
import type { Answer, Io } from "./run.ts";

const checkIn: Routine = { id: "morning", kind: "check-in", time: "08:00", repeat: { every: "week", days: [0, 1, 2, 3, 4, 5, 6], weeks: 1 }, since: "2026-11-01T00:00:00.000Z" };
function workspace(): WorkspaceData {
  const data = normalize(null).data;
  return { ...data, agents: data.agents.map((agent) => agent.id === atlasId ? { ...agent, routines: [checkIn] } : agent),
    notes: [{ id: "plan", domain: data.domains[0].name, projectId: "", title: "Plan", body: "- Measure the wall", updatedAt: "2026-11-10T00:00:00.000Z" }] };
}
/** A stand-in account: claims like claim_routine (newer due wins), answers with `answer`, keeps what was saved. */
function account(answer: Answer, receipts: Record<string, string> = {}) {
  const saved: Changes[] = [];
  const asked: string[] = [];
  const io: Io = {
    async claim(id, due) {
      const claimed = !(Date.parse(receipts[id] ?? "") >= Date.parse(due));
      if (claimed) receipts = { ...receipts, [id]: due };
      return { claimed, receipts };
    },
    async answer(snapshot) { asked.push(snapshot.request); return answer; },
    async save(changes) { saved.push(changes); },
  };
  return { io, saved, asked };
}
const person = { name: "Carlos", about: "" };
const proposeTheWall: Answer = { text: "From your plan:", draft: { command: "propose_tasks", args: { place: "Everyday", tasks: [{ title: "Measure the wall" }] } } };

Deno.test("wall clocks: a zone's offset, there and back, across daylight saving", () => {
  const winter = Date.parse("2026-01-15T12:00:00Z"), summer = Date.parse("2026-07-15T12:00:00Z");
  assert.deepEqual([offsetMinutes("Europe/Lisbon", winter), offsetMinutes("Europe/Lisbon", summer)], [0, 60]);
  assert.deepEqual([offsetMinutes("America/New_York", winter), offsetMinutes("America/New_York", summer)], [-300, -240]);
  assert.deepEqual(new Date(wallOf("Asia/Kolkata", winter)).toISOString(), "2026-01-15T17:30:00.000Z");
  for (const zone of ["Europe/Lisbon", "America/New_York", "Asia/Kolkata", "Pacific/Auckland"])
    for (const at of [winter, summer]) assert.deepEqual(instantOf(zone, wallOf(zone, at)), at, `${zone} round trip`);
});

Deno.test("a due check-in runs once, on the account's clock, and posts its proposal in the runner's thread", async () => {
  // 13:30 UTC is 08:30 in New York: this morning's 08:00 check-in (13:00 UTC) is due.
  const { io, saved, asked } = account(proposeTheWall);
  const outcome = await runDue(workspace(), new Date("2026-11-16T13:30:00Z"), "America/New_York", person, io);
  assert.deepEqual(outcome.ran, 1);
  assert.deepEqual(outcome.failed, []);
  assert.deepEqual(asked.length, 1);
  const message = saved[0].threads![0].messages.at(-1)!;
  assert.deepEqual(saved[0].threads![0].id, `agent:${atlasId}`);
  assert.deepEqual(message.routine?.due, "2026-11-16T13:00:00.000Z");
  assert.deepEqual(message.proposal?.items.map((item) => item.title), ["Measure the wall"]);
  assert.deepEqual(outcome.posts, [{ agent: "Atlas", kind: "check-in", threadId: `agent:${atlasId}`, text: message.text }], "the post its push tells you about");
  // A second tick finds the receipt and runs nothing.
  const again = await runDue({ ...workspace(), routineRuns: { morning: "2026-11-16T13:00:00.000Z" } }, new Date("2026-11-16T13:45:00Z"), "America/New_York", person, io);
  assert.deepEqual(again, { ran: 0, posts: [], failed: [] });
});

Deno.test("before the morning's time on the account's clock, yesterday's run stands and nothing new is due", async () => {
  // 08:30 UTC is 03:30 in New York; yesterday's 08:00 already ran.
  const { io, asked } = account(proposeTheWall);
  const outcome = await runDue({ ...workspace(), routineRuns: { morning: "2026-11-15T13:00:00.000Z" } }, new Date("2026-11-16T08:30:00Z"), "America/New_York", person, io);
  assert.deepEqual(outcome.ran, 0);
  assert.deepEqual(asked, []);
});

Deno.test("a device that claimed the run first wins, and a quiet answer posts nothing but its result (D68)", async () => {
  const taken = account(proposeTheWall, { morning: "2026-11-16T08:00:00.000Z" });
  assert.deepEqual(await runDue(workspace(), new Date("2026-11-16T08:30:00Z"), "Europe/Lisbon", person, taken.io), { ran: 0, posts: [], failed: [] });
  assert.deepEqual(taken.saved, [], "a run another device claimed leaves no result here");
  const quiet = account({ text: "NOTHING NEW" });
  assert.deepEqual(await runDue(workspace(), new Date("2026-11-16T08:30:00Z"), "Europe/Lisbon", person, quiet.io), { ran: 1, posts: [], failed: [] });
  assert.deepEqual(quiet.saved.map((changes) => [Object.keys(changes), changes.runs?.map((run) => [run.routineId, run.due, run.outcome])]),
    [[["runs"], [["morning", "2026-11-16T08:00:00.000Z", "quiet"]]]]);
});

Deno.test("a refused reply is reported by the runner's name and saves only its failed result", async () => {
  const { io, saved } = account(proposeTheWall);
  io.answer = async () => { throw new Error("Live agents need Pro."); };
  const outcome = await runDue(workspace(), new Date("2026-11-16T08:30:00Z"), "Europe/Lisbon", person, io);
  assert.deepEqual(outcome, { ran: 1, posts: [], failed: ["Atlas: Live agents need Pro."] });
  assert.deepEqual(saved.map((changes) => [Object.keys(changes), changes.runs?.map((run) => [run.outcome, run.reason])]),
    [[["runs"], [["failed", "Live agents need Pro."]]]]);
});
