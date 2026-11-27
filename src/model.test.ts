import test from "node:test";
import assert from "node:assert/strict";
import { agentRequestPrefix, sessionStartOf, sittingsOf } from "./sittings.ts";
import { planLine, quietestColour } from "./look.ts";
import { habitStreak } from "./blocks.ts";
import { ageBucket, daypartAt } from "./dates.ts";
import type { Project } from "./model.ts";

test("a new project takes the colour its domain's live projects use least, counting ones made alongside it", () => {
  const project = (id: string, area: string, color: string, archived?: boolean): Project => ({ id, title: id, area, description: "", color, ...archived && { archived } });
  const projects = [project("a", "Health", "pine"), project("b", "Health", "sage"), project("c", "Health", "clay", true), project("d", "Family", "clay")];
  assert.equal(quietestColour(projects, "Health"), "clay", "archived ones and other domains don't count");
  assert.equal(quietestColour(projects, "Health", [project("e", "Health", "clay")]), "ochre");
  assert.equal(quietestColour([], "Health"), "pine", "a tie goes to the first colour");
});

test("a habit's streak survives one missed day and ends at two in a row, warning while today can still save it", () => {
  const days = (...list: string[]) => new Set(list);
  assert.deepEqual(habitStreak(days("2026-11-18", "2026-11-19", "2026-11-21"), "2026-11-21"), { streak: 3, atRisk: false }, "a gap of one is carried");
  assert.deepEqual(habitStreak(days("2026-11-18", "2026-11-19"), "2026-11-21"), { streak: 2, atRisk: true }, "yesterday missed, today still open");
  assert.deepEqual(habitStreak(days("2026-11-18", "2026-11-19"), "2026-11-22"), { streak: 0, atRisk: false }, "two missed in a row end it");
  assert.deepEqual(habitStreak(days("2026-11-15", "2026-11-18", "2026-11-20"), "2026-11-20"), { streak: 2, atRisk: false }, "a double gap further back stops the count there");
  assert.deepEqual(habitStreak(days(), "2026-11-20"), { streak: 0, atRisk: false });
});

test("the plan line counts trial days up, and an ended trial reads as ended", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  assert.equal(planLine("trial", "2026-11-16T11:00:00Z", now).label, "Pro trial, 9 days left");
  assert.equal(planLine("trial", "2026-11-07T13:00:00Z", now).label, "Pro trial, 1 day left");
  assert.equal(planLine("trial", "2026-11-07T11:00:00Z", now).label, "Trial ended");
  assert.equal(planLine("pro", null, now).label, "Pro");
  assert.equal(planLine("free", null, now).label, "Free");
});

test("daypart boundaries preserve time ranges", () => {
  assert.deepEqual([0, 4, 5, 10, 11, 16, 17, 20, 21, 23].map(daypartAt),
    ["night", "night", "morning", "morning", "day", "day", "evening", "evening", "night", "night"]);
});

test("a thread splits into sessions per local day and at a New session, titled by your first message there", () => {
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
  const thread = { id: "agent:atlas", read: 0, attachedNoteId: null, sessionStarts: [3], messages: [
    { id: "a", role: "agent" as const, text: "Old welcome" },
    { id: "b", role: "agent" as const, text: "Morning, Carlos", at: at(19, 8) },
    { id: "c", role: "user" as const, text: "Plan the trip", from: "Travel", at: at(19, 9) },
    { id: "d", role: "user" as const, text: "Also groceries", at: at(19, 23) },
    { id: "e", role: "user" as const, text: "Next day", at: at(20, 0) },
  ] };
  const sittings = sittingsOf(thread);
  assert.deepEqual(sittings.map(({ start, end, title }) => [start, end, title]),
    [[0, 1, "Old welcome"], [1, 3, "Plan the trip"], [3, 4, "Also groceries"], [4, 5, "Next day"]]);
  assert.deepEqual([sittings[1].started, sittings[1].at, sittings[1].place], [at(19, 8), at(19, 9), "Travel"]);

  // The current session is today's; yesterday's or a New session you just started means the next message starts one.
  assert.equal(sessionStartOf(thread, sittings, new Date(2026, 9, 20, 12).getTime()), 4);
  assert.equal(sessionStartOf(thread, sittings, new Date(2026, 9, 21, 12).getTime()), 5);
  assert.equal(sessionStartOf({ ...thread, sessionStarts: [3, 5] }, sittings, new Date(2026, 9, 20, 12).getTime()), 5);

  const now = new Date(2026, 9, 20, 12).getTime();
  assert.deepEqual([at(20, 0), at(19, 23), at(14, 9), at(13, 9), at(1, 9), undefined].map((value) => ageBucket(value, now)),
    ["Today", "Yesterday", "Previous 7 days", "Previous 7 days", "Previous 30 days", "Earlier"]);
  assert.equal(ageBucket(new Date(2026, 8, 18).toISOString(), now), "September 2026", "in English, whatever the machine's language");
});

test("a session that asked for an agent says where its draft stands, titled by the goal", () => {
  const at = new Date(2026, 9, 19, 9).toISOString();
  const draft = (status: "pending" | "applied" | "rejected", replaced?: true) => ({ id: status, title: "", items: [], status, ...replaced && { replaced },
    agent: { name: "Pipsmith" } }) as never;
  const thread = { id: "agent:atlas", read: 0, attachedNoteId: null, sessionStarts: [2, 4, 6], messages: [
    { id: "a", role: "user" as const, text: `${agentRequestPrefix}a forex trader`, awaiting: ["atlas"], failure: "The model is busy.", at },
    { id: "b", role: "user" as const, text: "Hello again", at },
    { id: "c", role: "user" as const, text: `${agentRequestPrefix}a forex trader`, at },
    { id: "d", role: "agent" as const, text: "Here's Pipsmith", proposal: draft("rejected", true), at },
    { id: "e", role: "user" as const, text: "Help my kids with homework", at },
    { id: "f", role: "agent" as const, text: "Here's Tutor", proposal: draft("applied"), at },
    { id: "g", role: "user" as const, text: "Plan my week", at },
  ] };
  assert.deepEqual(sittingsOf(thread).map(({ title, request }) => [title, request?.status, request?.name]), [
    ["a forex trader", "unanswered", undefined],
    ["a forex trader", "replaced", "Pipsmith"],
    ["Help my kids with homework", "saved", "Pipsmith"],
    ["Plan my week", undefined, undefined],
  ]);
});
