import test from "node:test";
import assert from "node:assert/strict";
import type { Task } from "./model.ts";
import type { Block } from "./blocks.ts";
import { paceOf, stageOf } from "./pace.ts";

const steps = (done: number, total: number, dues: (string | undefined)[] = []): Task[] =>
  Array.from({ length: total }, (_, i) => ({ id: `t${i}`, title: `Step ${i}`, domain: "Fitness", projectId: "race", done: i < done, due: dues[i] ?? "" }));
const finish: Block = { id: "race-day", type: "countdown", since: "2026-01-01", date: "2026-01-31" };

test("behind only when the clock is clearly ahead of the work, after the first 15% of the wait", () => {
  const at = (today: string, done: number, total = 10) => paceOf({ widgets: [finish] }, steps(done, total), today).behind;
  assert.equal(at("2026-01-04", 0), false, "10% of the wait gone: too early to judge");
  assert.equal(at("2026-01-06", 0), false, "16.7% gone, 0% done: 16.7 points is under 20");
  assert.equal(at("2026-01-07", 0), false, "20% gone, 0% done: 20 points exactly is not over");
  assert.equal(at("2026-01-08", 0), true, "23% gone, 0% done");
  assert.equal(at("2026-01-10", 0), true, "30% gone, 0% done");
  assert.equal(at("2026-01-10", 1), false, "30% gone, 10% done: exactly 20 points is not over");
  assert.equal(at("2026-01-10", 0, 0), false, "nothing planned");
  assert.equal(at("2026-01-31", 0), false, "the date has come");
  assert.equal(at("2025-12-20", 0), false, "before the start");
});

test("the finish line is the first shown dated countdown with a start; put-away and undated ones are skipped", () => {
  const putAway: Block = { ...finish, id: "old", removed: "2026-01-02" };
  const undated: Block = { id: "someday", type: "countdown" };
  const noStart: Block = { id: "trip", type: "countdown", date: "2026-02-10" };
  const second: Block = { ...finish, id: "second", date: "2026-03-01" };
  const pace = paceOf({ widgets: [putAway, undated, noStart, finish, second] }, steps(2, 4), "2026-01-16");
  assert.equal(pace.finish?.id, "race-day");
  assert.equal(pace.timeShare, 0.5);
  const none = paceOf({ widgets: [undated, noStart] }, steps(2, 4), "2026-01-16");
  assert.equal(none.finish, undefined);
  assert.deepEqual([none.timeShare, none.behind], [0, false]);
});

test("counts, stage and the next due step", () => {
  const pace = paceOf({}, steps(1, 3, ["2026-01-02", "2026-01-20", "2026-01-10"]), "2026-01-16");
  assert.deepEqual([pace.done, pace.total, pace.nextDue], [1, 3, "2026-01-10"], "the earliest open due, even when it has passed");
  assert.equal(paceOf({}, steps(3, 3), "2026-01-16").nextDue, undefined);
  assert.deepEqual([stageOf(0, 4).label, stageOf(1, 4).label, stageOf(2, 4).label, stageOf(4, 4).label, stageOf(0, 0).label],
    ["Just planted", "Sprouting", "Growing", "In bloom", "Just planted"]);
});
