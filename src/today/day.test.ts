import test from "node:test";
import assert from "node:assert/strict";
import type { Brief } from "../brief.ts";
import type { Agent, Project, Task, Thread, WorkspaceData } from "../model.ts";
import { placeTasks, moveTasksToDay } from "../workspace/tasks.ts";
import { atlasLineOf, busySpans, crewStepsOf, freeSlots, planOf, placeSteps, proposalStepsOf, takeSlot, todayDayOf } from "./day.ts";
import type { TodayBrief } from "./derive.ts";

const day = "2026-11-22";
const task = (id: string, due: string, extra: Partial<Task> = {}): Task => ({ id, title: id, due, done: false, domain: "Health", projectId: "", ...extra });
const agent = (id: string) => ({ id, name: id[0].toUpperCase() + id.slice(1) }) as Agent;
const hues = new Map([["Health", "#6c9a68"]]);
const said = (place: string, kind: Brief["kind"], who = agent("vital")): TodayBrief =>
  ({ place, label: place, open: place, brief: { kind, key: kind, agent: who, title: "", line: "", action: { kind: "open", label: "Open", projectId: place } } as Brief });

test("today's tasks sit at their time, in their part, or in the tray; a late task's old time doesn't hold", () => {
  const shown = todayDayOf([
    task("run", day, { at: "08:00" }), task("shop", day, { at: "16:00" }), task("call", day, { at: "evening" }),
    task("blood", "2026-11-20", { at: "09:00" }), task("vitamins", day), task("laundry", day, { done: true }), task("intro", day, { at: "12:30" }),
  ], day);
  assert.deepEqual(shown.parts.morning.map((item) => item.id), ["run"]);
  assert.deepEqual(shown.parts.afternoon.map((item) => item.id), ["intro", "shop"]);
  assert.deepEqual(shown.parts.evening.map((item) => item.id), ["call"]);
  assert.deepEqual(shown.anytime.map((item) => item.id), ["blood", "vitamins"]);
  assert.deepEqual(shown.doneAnytime.map((item) => item.id), ["laundry"]);
});

test("free half hours skip what timed tasks hold for their length and what busy calendar events hold, and stop at 22:00", () => {
  const spans = busySpans([task("shop", day, { at: "16:00", length: 60 }), task("done", day, { at: "18:00", done: true }), task("late", "2026-11-21", { at: "17:30" })], day,
    [{ title: "Dentist", from: 18 * 60 + 30, to: 19 * 60 + 15, allDay: false, busy: true }, { title: "Holiday", from: 0, to: 1440, allDay: true, busy: false },
      { title: "Maybe", from: 20 * 60, to: 21 * 60, allDay: false, busy: false }]);
  assert.deepEqual(freeSlots(spans, 15 * 60 + 10), [15 * 60 + 30, 17 * 60, 17 * 60 + 30, 18 * 60, 19 * 60 + 30, 20 * 60, 20 * 60 + 30, 21 * 60, 21 * 60 + 30, 22 * 60]);
  assert.deepEqual(freeSlots([], 22 * 60 + 5), []);
});

test("a step takes the first stretch its length fits and keeps the half hour after it clear", () => {
  const left = [900, 960, 990, 1020, 1050, 1080];
  assert.equal(takeSlot(left, 60), 960, "15:00 alone is too short for an hour");
  assert.deepEqual(left, [900, 1050, 1080], "the hour and the half hour after it are taken");
  assert.equal(takeSlot(left, 120), undefined);
});

test("each speaking agent offers one step: the oldest late task, or a project's next step when it's behind", () => {
  const relaunch = { id: "relaunch", title: "Studio relaunch", area: "Career", widgets: [
    { id: "finish", type: "countdown", date: "2026-12-01", since: "2026-11-01", width: "narrow" }] } as unknown as Project;
  const tasks = [
    task("old", "2026-11-19"), task("older", "2026-11-18"), task("fresh", day),
    task("done-step", "2026-11-10", { domain: "Career", projectId: "relaunch", done: true }),
    task("next-step", "2026-11-25", { domain: "Career", projectId: "relaunch" }), task("later-step", "2026-11-28", { domain: "Career", projectId: "relaunch" }),
  ];
  const steps = crewStepsOf([[said("area:Health", "late")], [said("relaunch", "behind", agent("spark"))]], tasks, [relaunch], hues, day);
  assert.deepEqual(steps.map((step) => [step.agent.id, step.task?.id]), [["vital", "older"], ["spark", "next-step"]]);
  assert.match(steps[0].why, /4 days late/);
  assert.match(steps[1].why, /1 of 3 steps done with 9 days left/);
  const placed = placeSteps(steps, [990, 1080, 1260], day, ["step:next-step"]);
  assert.deepEqual(placed.steps.map((step) => [step.task?.id, step.minute]), [["older", 990]]);
  assert.deepEqual(placed.free, [1080, 1260]);
});

test("a chat proposal with tasks for today is a step that keeps the time it names; others in it don't count", () => {
  const proposal = { id: "p1", status: "pending", items: [task("dentist", day, { at: "11:00" }), task("later", "2026-12-01")] };
  const threads = [{ id: "agent:vital", title: "Vital", messages: [{ id: "m", role: "agent", agentId: "vital", proposal }] }] as unknown as Thread[];
  const steps = proposalStepsOf(threads, [agent("vital")], [], hues, day);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].title, "dentist");
  assert.equal(placeSteps(steps, [990], day, []).steps[0].minute, 11 * 60);
});

test("a morning plan is one step per task, with the agent's reason and time, until that task is in place", () => {
  const changes = [
    { kind: "reschedule", taskId: "blood", title: "blood", from: "2026-11-20", to: day, at: "17:30", why: "Two days late; the clinic books online." },
    { kind: "reschedule", taskId: "ines", title: "ines", from: "2026-11-21", to: day, at: "19:30" },
    { kind: "reschedule", taskId: "old", title: "old", from: "2026-11-20", to: "2026-11-21", at: "09:00" },
  ];
  const threads = [{ id: "agent:atlas", title: "", messages: [{ id: "m", role: "agent", agentId: "atlas", proposal: { id: "plan", status: "pending", items: [], changes } }] }] as unknown as Thread[];
  const tasks = [task("blood", "2026-11-20"), task("ines", day, { at: "19:30" }), task("old", "2026-11-20")];
  const steps = placeSteps(proposalStepsOf(threads, [agent("atlas")], tasks, hues, day), [990], day, []).steps;
  assert.deepEqual(steps.map((step) => [step.task?.id, step.minute, step.why]), [["blood", 17 * 60 + 30, "Two days late; the clinic books online."]],
    "Inês is already at 19:30 and yesterday's plan is over");
});

test("Atlas's plan puts the tray's tasks where they fit, a half hour apart, leaving ones a crew step already holds", () => {
  const plan = planOf([task("a", day), task("b", "2026-11-21"), task("c", day)], [990, 1020, 1050, 1080], agent("atlas"), hues, day, [], new Set(["a"]));
  assert.deepEqual(plan.map((step) => [step.task?.id, step.minute]), [["b", 990], ["c", 1050]]);
  assert.match(plan[0].why, /^Yesterday/);
});

test("Atlas's line leads with your starred task, else the oldest late one", () => {
  const open = [task("late", "2026-11-20"), task("today", day)];
  assert.equal(atlasLineOf(open, open[1], [], day, 900).lead?.id, "today");
  const line = atlasLineOf(open, undefined, [], day, 900);
  assert.equal(line.lead?.id, "late");
  assert.match(line.after, /2 days late/);
});

test("placing a task puts it on today at its time; moving it to another day leaves the time behind", () => {
  const data = { tasks: [task("blood", "2026-11-20", { at: "09:00" })] } as WorkspaceData;
  const placed = placeTasks(data, [{ id: "blood", at: "16:30" }], day).data.tasks[0];
  assert.deepEqual([placed.due, placed.at], [day, "16:30"]);
  const anytime = placeTasks(data, [{ id: "blood", at: "" }], day).data.tasks[0];
  assert.equal(anytime.at, undefined);
  assert.equal(moveTasksToDay(data, ["blood"], "2026-11-23").data.tasks[0].at, undefined);
});
