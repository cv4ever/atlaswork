import test from "node:test";
import assert from "node:assert/strict";
import type { Filters, Line } from "./listing.ts";
import { ordered, outcomeOf } from "./listing.ts";

const line = (key: string, runner: string, next: number, extra: Partial<Line> = {}) => ({
  key, runner: { id: runner, name: runner }, routine: { id: key, kind: "report" }, next: new Date(next), enabled: true, results: [], failed: false, missing: [], ...extra,
}) as unknown as Line;
const all: Filters = { status: "all", who: [], pinned: null, sort: "next" };

test("what came due runs first (its due time is past), then by next run; filters narrow by status and runner", () => {
  const lines = [line("b", "Vital", 3), line("a", "Kin", 2), line("c", "Kin", 5, { due: new Date(0) })];
  assert.deepEqual(ordered(lines, all, null).sorted.map((item) => item.key), ["c", "a", "b"]);
  assert.deepEqual(ordered(lines, { ...all, status: "attention" }, null).sorted.map((item) => item.key), ["c"]);
  assert.deepEqual(ordered(lines, { ...all, who: ["Vital"] }, null).sorted.map((item) => item.key), ["b"]);
});

test("a held order keeps rows in place while you change them, and says when a fresh sort would differ", () => {
  const lines = [line("a", "Kin", 1), line("b", "Kin", 2)];
  const held = ordered(lines, all, ["b", "a"]);
  assert.deepEqual(held.sorted.map((item) => item.key), ["b", "a"]);
  assert.equal(held.resorted, true);
  assert.equal(ordered(lines, all, ["a", "b"]).resorted, false);
  assert.deepEqual(ordered([...lines, line("c", "Kin", 0)], all, ["a", "b"]).sorted.map((item) => item.key), ["a", "b", "c"], "a new row joins at the end");
});

test("a run's outcome names failures first, then where the news went", () => {
  assert.equal(outcomeOf({ ran: 2, posted: 0, failed: ["The model refused."] }, "quiet"), "1 of 2 couldn't run. The model refused.");
  assert.equal(outcomeOf({ ran: 1, posted: 1, failed: [] }, "quiet"), "It's in their chat.");
  assert.equal(outcomeOf({ ran: 3, posted: 0, failed: [] }, "All quiet."), "All quiet.");
});
