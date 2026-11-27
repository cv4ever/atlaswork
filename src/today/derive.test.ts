import test from "node:test";
import assert from "node:assert/strict";
import type { Block } from "../blocks.ts";
import type { Task } from "../model.ts";
import { peopleHorizonOf, todayFocusOf, todayHorizonOf, todayRitualsOf } from "./derive.ts";
import type { PlacedBlock } from "./derive.ts";

const at = { place: "area:Health", open: "area:Health", label: "Health", hue: "#6c9a68" };
const placed = (block: Partial<Block> & Pick<Block, "id" | "type">): PlacedBlock => ({ ...at, block: block as Block });
const task = (id: string, due: string): Task => ({ id, title: id, due, done: false, domain: "Health", projectId: "" });

test("the horizon keeps countdowns still ahead and each milestones block's next open step, soonest first, five at most", () => {
  const blocks = [
    placed({ id: "past", type: "countdown", date: "2026-11-01" }),
    placed({ id: "race", type: "countdown", title: "Race", date: "2026-12-10", since: "2026-10-01" }),
    placed({ id: "road", type: "milestones", steps: [
      { title: "Done one", date: "2026-11-25", done: true }, { title: "Next", date: "2026-11-28", done: false }, { title: "Later", date: "2026-12-20", done: false },
    ] }),
    ...["a", "b", "c", "d"].map((id, index) => placed({ id, type: "countdown", date: `2027-01-0${index + 1}` })),
  ];
  const horizon = todayHorizonOf(blocks, "2026-11-21");
  assert.deepEqual(horizon.map((item) => item.title), ["Next", "Race", "Countdown", "Countdown", "Countdown"]);
  assert.equal(horizon[0].since, "2026-11-25");
});

test("people's dates join the horizon, opening their page, and one a page already counts down to shows once", () => {
  const person = (id: string, name: string, date: string) =>
    ({ id, name, emoji: "", description: "", person: { relation: "Mother", domain: "Family", hue: "", dates: [{ id: `${id}-b`, label: "Birthday", date }] } });
  const people = peopleHorizonOf([person("mae", "Mãe", "1958-01-18"), person("sofia", "Sofia", "1992-12-03")], "2026-11-21");
  const horizon = todayHorizonOf([placed({ id: "mae", type: "countdown", title: "Mãe's birthday", date: "2027-01-18" })], "2026-11-21", people);
  assert.deepEqual(horizon.map((item) => [item.title, item.date, item.person]), [["Sofia's birthday", "2026-12-03", "sofia"], ["Mãe's birthday", "2027-01-18", undefined]]);
  assert.equal(horizon[0].since, "2025-12-03");
});

test("rituals count today's ticks and keep each habit's streak", () => {
  const rituals = todayRitualsOf([
    placed({ id: "sleep", type: "habit", days: ["2026-11-19", "2026-11-20", "2026-11-21"] }),
    placed({ id: "walk", type: "habit", days: [] }),
    placed({ id: "note", type: "note" }),
  ], "2026-11-21");
  assert.equal(rituals.items.length, 2);
  assert.deepEqual([rituals.done, rituals.remaining], [1, 1]);
  assert.equal(rituals.items[0].streak, 3);
  assert.deepEqual([rituals.week[0], rituals.week[6]], ["2026-11-15", "2026-11-21"]);
});

test("the starred task counts only on the day it was starred", () => {
  const open = [task("late", "2026-11-19"), task("today", "2026-11-21")];
  assert.equal(todayFocusOf(open, { day: "2026-11-21", id: "late" }, "2026-11-21")?.id, "late");
  assert.equal(todayFocusOf(open, { day: "2026-11-20", id: "late" }, "2026-11-21"), undefined);
});
