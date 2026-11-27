import test from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage, Repeat, Routine, RoutineResult } from "./model.ts";
import { failingRoutines } from "./model.ts";
import { presenceOf } from "./agents.ts";
import { seedWorkspace } from "./demo.ts";
import { proposalOf, specsOf } from "./commands.ts";
import { dueNow, improveChoices, isQuiet, lateRuns, nextDue, ownerOf, ownersOf, readinessOf, recordRun, resultsOf, routineRequest, threadFor, waitingIdeas } from "./routines.ts";
import { routineHasNews } from "./routineNews.ts";
import { createDomain, createProject, normalize, saveThread, setArchived, setRoutines } from "./workspace.ts";

const routine = (repeat: Repeat, since = ""): Routine => ({ id: "r", kind: "report", time: "08:00", repeat, since });
/** The day of the month it first comes due in month `m` (0-based) of `y`. */
const firstIn = (repeat: Repeat, y: number, m: number) => nextDue(routine(repeat), new Date(y, m, 1, 0, 0))[0].getDate();

test("monthly dates clamp to short months; nth and last weekdays land on the right day", () => {
  assert.equal(firstIn({ every: "month", day: 31 }, 2026, 1), 28);
  assert.equal(firstIn({ every: "month", day: -1 }, 2028, 1), 29);
  assert.equal(firstIn({ every: "month", week: 1, weekday: 1 }, 2026, 10), 2);
  assert.equal(firstIn({ every: "month", week: -1, weekday: 5 }, 2026, 9), 30);
});

test("every other week counts from the week it was set up", () => {
  const fortnightly = routine({ every: "week", days: [1], weeks: 2 }, "2026-10-19T07:00:00");
  assert.deepEqual(nextDue(fortnightly, new Date(2026, 9, 19, 9, 0), 2).map((due) => due.getDate()), [2, 16]);
});

test("a stretch of missed runs collapses into the latest one; set-up time and the last run gate it", () => {
  const daily = routine({ every: "week", days: [0, 1, 2, 3, 4, 5, 6], weeks: 1 });
  const now = new Date(2026, 9, 21, 12, 0);
  assert.equal(dueNow(daily, now, new Date(2026, 9, 14, 8, 0).toISOString())?.getDate(), 21);
  assert.equal(dueNow(daily, now, new Date(2026, 9, 21, 8, 0).toISOString()), null);
  assert.equal(dueNow({ ...daily, since: new Date(2026, 9, 21, 10, 0).toISOString() }, now), null);
  assert.equal(dueNow({ ...daily, paused: true }, now), null);
});

test("posted run receipts suppress scheduled readiness without preventing a later manual run", () => {
  const data = normalize(null).data;
  const now = new Date(2026, 9, 22, 12);
  const placed = { routine: routine({ every: "week", days: [4], weeks: 1 }), owner: { kind: "agent" as const, id: "atlas" } };
  data.threads = [{ id: "agent:atlas", attachedNoteId: null, read: 0, messages: [{
    id: "posted", role: "agent", text: "Already done", routine: { id: "r", kind: "report", due: new Date(2026, 9, 22, 8).toISOString() },
  }] }];
  const ready = readinessOf(data, placed, now);
  assert.equal(ready.due, null);
  assert.equal(ready.manualDue, now);
  data.routineRuns.r = now.toISOString();
  assert.equal(readinessOf(data, placed, now).manualDue, null);
  assert.equal(readinessOf(data, { ...placed, routine: { ...placed.routine, paused: true } }, new Date(2026, 9, 22, 13)).due, null);
  assert.equal(readinessOf(data, { ...placed, routine: { ...placed.routine, paused: true } }, new Date(2026, 9, 22, 13)).manualDue?.getHours(), 13);
});

test("owners list each owner with routines once, in agents, domains, projects order; setRoutines reaches whichever record keeps them", () => {
  let data = createDomain(normalize(null).data, { name: "Garden", emoji: "🌱", hue: "", intention: "" }).data;
  data = createProject(data, { id: "beds", title: "Raised beds", area: "Garden", description: "", color: "pine" }).data;
  const weekly = routine({ every: "week", days: [1], weeks: 1 });
  data = setRoutines(data, { kind: "project", id: "beds" }, [weekly, { ...weekly, id: "r2" }]).data;
  data = setRoutines(data, { kind: "domain", id: "Garden" }, [weekly]).data;
  // Atlas keeps his default routines, so he comes first.
  assert.deepEqual(ownersOf(data), [{ kind: "agent", id: "atlas" }, { kind: "domain", id: "Garden" }, { kind: "project", id: "beds" }]);
  const beds = ownerOf(data, { kind: "project", id: "beds" });
  assert.deepEqual([beds.routines.length, beds.label, beds.project?.id, beds.domain?.name, beds.runner.id], [2, "Raised beds", "beds", "Garden", "atlas"]);
  assert.equal(ownerOf(data, { kind: "agent", id: "atlas" }).domain, undefined);
  assert.deepEqual(ownersOf(setArchived(data, { kind: "domain", id: "Garden" }, true).data), [{ kind: "agent", id: "atlas" }], "an archived domain's routines and its projects' rest");
  assert.throws(() => setRoutines(data, { kind: "project", id: "gone" }, []));
});

test("a check-in names its own notes, and a review names open tasks its notes tick off when its runner may read them", () => {
  const data = seedWorkspace();
  const ask = (kind: Routine["kind"], owner: Parameters<typeof routineRequest>[1]["owner"], world = data) =>
    routineRequest(world, { routine: { ...routine({ every: "week", days: [1], weeks: 1 }), kind }, owner }) ?? "";
  const checkIn = ask("check-in", { kind: "project", id: "demo-checkup" });
  assert.match(checkIn, /“Check-up list”\), and only those/);
  assert.doesNotMatch(checkIn, /Things to mention/, "a note homed in the domain belongs to the domain's check-in");
  const health = { kind: "domain" as const, id: "Health" };
  assert.match(ask("review", health), /complete them rather than move them: “Book blood work” \(in “Check-up list”\)/);
  const blind = { ...data, agents: data.agents.map((agent) => agent.id === "vital" ? { ...agent, tools: { ...agent.tools, "read-notes": false } } : agent) };
  assert.doesNotMatch(ask("review", health, blind), /Book blood work/, "a runner without Read notes isn't told what notes say");
});

test("Atlas's check-in plans the day when open tasks wait without a time, and a new day wakes it with nothing new in notes (D75)", () => {
  const data = seedWorkspace();
  const today = new Date().toLocaleDateString("en-CA");
  const atlas = { routine: { ...routine({ every: "week", days: [0, 1, 2, 3, 4, 5, 6], weeks: 1 }), kind: "check-in" as const }, owner: { kind: "agent" as const, id: "atlas" } };
  const asked = routineRequest(data, atlas, today) ?? "";
  assert.match(asked, new RegExp(`plan today, ${today}, instead: call plan_day once`));
  assert.match(asked, /“Book blood work”/);
  assert.match(asked, /Times already held: 07:30 “Easy 3km run”/);
  assert.doesNotMatch(routineRequest(data, { ...atlas, owner: { kind: "project", id: "demo-checkup" } }, today) ?? "", /plan_day/, "only Atlas plans the day");
  const quiet = { ...data, notes: data.notes.map((note) => ({ ...note, updatedAt: "2026-01-01T00:00:00.000Z" })) };
  const yesterday = Date.now() - 2 * 86_400_000;
  assert.equal(routineHasNews(quiet, atlas, yesterday, new Date(), today), true, "a new day with tasks to place is news");
  assert.equal(routineHasNews(quiet, atlas, Date.now(), new Date(), today), false, "planned once today, it waits for tomorrow");
});

test("a check-in or review with nothing new since it last ran asks no model; a report always does (D67)", () => {
  const now = new Date(2026, 10, 18, 8, 0), today = "2026-11-18", old = "2026-01-01T00:00:00.000Z";
  // Everything last touched long ago, so only what each case changes is news.
  const seeded = seedWorkspace();
  const data = { ...seeded, notes: seeded.notes.map((note) => ({ ...note, updatedAt: old })), tasks: seeded.tasks.map((task) => ({ ...task, updatedAt: old, due: "" })) };
  const placed = (kind: Routine["kind"], owner: { kind: "domain" | "project"; id: string }) => ({ routine: { ...routine({ every: "week", days: [1], weeks: 1 }), kind }, owner });
  const since = now.getTime() - 86_400_000;
  const checkIn = placed("check-in", { kind: "project", id: "demo-checkup" });
  assert.equal(routineHasNews(data, checkIn, since, now, today), false);
  assert.equal(routineHasNews(data, checkIn, -Infinity, now, today), true, "a first run always asks");
  assert.equal(routineHasNews(data, placed("report", { kind: "domain", id: "Health" }), since, now, today), true);
  const edited = (projectId: string) => ({ ...data, notes: data.notes.map((note) => note.projectId === projectId ? { ...note, updatedAt: now.toISOString() } : note) });
  assert.equal(routineHasNews(edited("demo-checkup"), checkIn, since, now, today), true, "a note it reads changed");
  const elsewhere = data.notes.find((note) => note.projectId && note.projectId !== "demo-checkup")!.projectId;
  assert.equal(routineHasNews(edited(elsewhere), checkIn, since, now, today), false, "a note elsewhere is no news");
  const review = placed("review", { kind: "domain", id: "Health" });
  assert.equal(routineHasNews(data, review, since, now, today), false);
  const fellDue = { ...data, tasks: data.tasks.map((task, at) => at === data.tasks.findIndex((item) => item.domain === "Health" && !item.done) ? { ...task, due: "2026-11-17" } : task) };
  assert.equal(routineHasNews(fellDue, review, since, now, today), true, "a task fell due since");
});

test("agents still on the check-in every agent used to get move to a weekly improvement; Atlas keeps his and gains the Monday review (D68)", () => {
  const base = normalize(null).data;
  const everyDay = { every: "week" as const, days: [0, 1, 2, 3, 4, 5, 6], weeks: 1 };
  const old: Routine = { id: "old", kind: "check-in", time: "08:00", repeat: everyDay, since: "2026-11-07T00:00:00.000Z" };
  const agent = (id: string, routines: Routine[]) => ({ ...base.agents[0], id, name: id, routines });
  const loaded = { ...base, agents: [{ ...base.agents[0], routines: [old] }, agent("vital", [{ ...old, id: "v" }]),
    agent("kin", [{ ...old, id: "k", time: "07:30" }]), agent("chef", [{ ...old, id: "c", repeat: { ...everyDay, days: [1] } }])] };
  const { data, changes } = normalize(loaded);
  const kinds = (id: string) => data.agents.find((item) => item.id === id)!.routines!.map((routine) => [routine.kind, routine.repeat]);
  assert.deepEqual(kinds("atlas"), [["check-in", everyDay], ["review", { every: "week", days: [1], weeks: 1 }]]);
  assert.equal(data.agents[0].routines![0].id, "old", "his check-in keeps its id, so its receipts still count");
  assert.deepEqual(kinds("vital"), [["improve", { every: "week", days: [1], weeks: 1 }]]);
  assert.deepEqual(kinds("chef"), [["improve", { every: "week", days: [3], weeks: 1 }]], "the crew takes weekdays in turn");
  assert.deepEqual(kinds("kin"), [["check-in", everyDay]], "a check-in moved to 07:30 is the person's choice and stays");
  assert.deepEqual(changes.agents?.map((item) => item.id), ["atlas", "vital", "chef"]);
  assert.equal(normalize(data).changes.agents, undefined, "once moved, nothing changes on the next load");
});

test("a weekly improvement gives the week's evidence, its own routines and what it suggested last time, proposes nothing, and its numbered suggestions become answers to tap", () => {
  const data = normalize(seedWorkspace()).data;
  const vital = data.agents.find((agent) => agent.id === "vital")!;
  const improve = vital.routines!.find((routine) => routine.kind === "improve")!;
  const placed = { routine: improve, owner: { kind: "agent" as const, id: "vital" } };
  const first = routineRequest(data, placed, "2026-11-19") ?? "";
  assert.match(first, /In the last 7 days \d+ tasks? (was|were) done/);
  assert.match(first, /your routines: Weekly improvement, \w+days at 08:00/);
  assert.match(first, /Last time you suggested: “1\. \*\*Move Friday's session to 07:30\.\*\*.+The person took none of it/s, "the demo's improvement still waits for a pick");
  const said = (display: ChatMessage["display"]): ChatMessage => ({ id: "m1", role: "agent", agentId: "vital", text: "1. Move the walk to mornings.",
    routine: { id: improve.id, kind: "improve", due: "2026-11-12T08:00:00.000Z" }, display });
  const after = (message: ChatMessage) => routineRequest(saveThread(data, { id: threadFor(data, placed.owner), messages: [message], read: 0, attachedNoteId: null }).data, placed, "2026-11-19") ?? "";
  assert.match(after(said({ choices: ["Do 1", "Not now"], picked: "Not now" })), /Last time you suggested: “1\. Move the walk to mornings\.”\. The person answered “Not now”/);
  assert.match(after(said({ choices: ["Do 1", "Not now"] })), /took none of it, so suggest none of it again/);
  const asked = { data, agent: vital, routine: { kind: "improve" as const } };
  const names = specsOf(asked).map((spec) => spec.name);
  assert.deepEqual(names.filter((name) => name !== "show_widgets"), [], "it may show widgets, nothing else");
  const place = specsOf({ data, agent: vital }).find((spec) => spec.name === "propose_tasks")!.args.place.oneOf![0];
  const draft = { command: "propose_tasks", args: { place, tasks: [{ title: "Walk after lunch" }] } };
  assert.ok(proposalOf({ data, agent: vital }, draft), "the same draft makes a proposal in a chat");
  assert.equal(proposalOf(asked, draft), undefined, "but never from a weekly improvement");
  assert.deepEqual(improveChoices("Here's what I'd change:\n\n1. Move the walk.\n2) Drop the Friday report.\n**3.** Smaller steps.\n\nWhich one?"), ["Do 1", "Do 2", "Do 3", "Not now"]);
  assert.equal(improveChoices("NOTHING NEW"), undefined);
});

test("a quiet answer in other words is still quiet; a short line with something in it isn't (D69)", () => {
  for (const text of ["NOTHING NEW", "Nothing new.", "**No new tasks to add**.", "**Nothing new to propose.**", "No changes needed this week."]) assert.ok(isQuiet(text), text);
  for (const text of ["No rush, but book the vet this week.", "Nothing new in Health, but the rent is due on Friday; shall I add it?", "- Measure the wall"]) assert.ok(!isQuiet(text), text);
});

test("a weekly improvement waits on Today until you tap or write, and the next one judges what came of your pick (D69)", () => {
  const data = normalize(seedWorkspace()).data;
  const vital = data.agents.find((agent) => agent.id === "vital")!;
  const improve = vital.routines!.find((routine) => routine.kind === "improve")!;
  const owner = { kind: "agent" as const, id: "vital" };
  const thread = threadFor(data, owner);
  const suggestion: ChatMessage = { id: "m1", role: "agent", agentId: "vital", text: "1. **Move the walk to mornings.** You skipped it 3 evenings.\n2. Smaller check-up steps.\n\nWhich one?",
    routine: { id: improve.id, kind: "improve", due: "2026-11-12T08:00:00.000Z" }, display: { choices: ["Do 1", "Do 2", "Not now"] }, at: "2026-11-12T08:01:00.000Z" };
  const withThread = (...messages: ChatMessage[]) => saveThread(data, { id: thread, messages, read: 0, attachedNoteId: null }).data;
  assert.deepEqual(waitingIdeas(withThread(suggestion).threads, data.agents).map(({ thread: at, agent, count, first }) => [at, agent.id, count, first]),
    [[thread, "vital", 2, "Move the walk to mornings."]]);
  const picked = { ...suggestion, display: { ...suggestion.display, picked: "Do 1" } };
  assert.deepEqual(waitingIdeas(withThread(picked).threads, data.agents), [], "a tapped answer settles it");
  assert.deepEqual(waitingIdeas(withThread(suggestion, { id: "m2", role: "user", text: "Later" }).threads, data.agents), [], "so does writing back");
  const applied: ChatMessage = { id: "m3", role: "agent", agentId: "vital", text: "Here it is.",
    proposal: { id: "p", projectId: "", noteId: "", sourceTitle: "", sourceBody: "", items: [], status: "applied" } };
  const ask = (world: typeof data) => routineRequest(world, { routine: improve, owner }, "2026-11-19") ?? "";
  assert.match(ask(withThread(picked, applied)), /answered “Do 1”\. The change you proposed after it was applied, so start with one line on whether this week's evidence shows it helped/);
  assert.match(ask(withThread(picked, { ...applied, proposal: { ...applied.proposal!, status: "undone" } })), /The person undid the change you proposed after it/);
});

test("each routine keeps its last ten results, one per run, and loses them when it's removed (D68)", () => {
  let data = normalize(null).data;
  const due = (day: number) => `2026-11-${String(day).padStart(2, "0")}T08:00:00.000Z`;
  for (let day = 1; day <= 12; day++) data = recordRun(data, { routineId: "r", due: due(day), at: due(day), outcome: "quiet" }).data;
  assert.deepEqual(resultsOf(data, "r").map((result) => result.due), Array.from({ length: 10 }, (_, index) => due(12 - index)), "newest first, the oldest two gone");
  const again = recordRun(data, { routineId: "r", due: due(12), at: due(12), outcome: "posted" });
  assert.deepEqual([resultsOf(again.data, "r").length, resultsOf(again.data, "r")[0].outcome, again.changes.deletedRunIds], [10, "posted", undefined], "the same run recorded twice is one result");
  assert.deepEqual(recordRun(data, { routineId: "r", due: due(13), at: due(13), outcome: "failed", reason: "Offline" }).changes.deletedRunIds, [`r@${due(3)}`]);
  const checkIn = data.agents[0].routines![0];
  const ran = recordRun(data, { routineId: checkIn.id, due: due(1), at: due(1), outcome: "posted" }).data;
  const removed = setRoutines(ran, { kind: "agent", id: "atlas" }, data.agents[0].routines!.filter((item) => item.id !== checkIn.id));
  assert.deepEqual([resultsOf(removed.data, checkIn.id), removed.changes.deletedRunIds], [[], [`${checkIn.id}@${due(1)}`]]);
});

test("two failed runs in a row flag the routine and its agent; a run that waited past the hour counts as missed by the server (D69)", () => {
  const run = (id: string, day: number, outcome: RoutineResult["outcome"], late = 0): RoutineResult => ({ id: `${id}@${day}`, routineId: id, outcome,
    due: `2026-11-${10 + day}T08:00:00.000Z`, at: new Date(Date.parse(`2026-11-${10 + day}T08:00:00.000Z`) + late * 60_000).toISOString() });
  const runs = [run("a", 1, "failed"), run("a", 2, "failed"), run("b", 1, "failed"), run("b", 2, "posted"), run("c", 2, "failed")];
  assert.deepEqual([...failingRoutines(runs)], ["a"], "b recovered, c failed once");
  const base = normalize(null).data;
  const atlas = { ...base.agents[0], routines: [{ ...base.agents[0].routines![0], id: "a" }] };
  const idle = { thinking: {}, errors: {} };
  assert.deepEqual(presenceOf({ ...base, agents: [atlas], runs }, atlas, idle), { kind: "stuck", reason: "A routine keeps failing" });
  assert.deepEqual(presenceOf({ ...base, agents: [atlas], runs: runs.slice(2) }, atlas, idle), { kind: "idle" });
  const now = new Date("2026-11-13T12:00:00.000Z");
  assert.deepEqual(lateRuns([run("a", 2, "posted", 10), run("b", 2, "posted", 90)], now).map((item) => item.routineId), ["b"]);
});

test("a weekly improvement names people's dates coming up with nothing planned, and a date coming into reach is news (D71)", () => {
  const data = normalize(seedWorkspace()).data;
  const kin = data.agents.find((agent) => agent.id === "kin")!;
  const placed = { routine: kin.routines!.find((routine) => routine.kind === "improve")!, owner: { kind: "agent" as const, id: "kin" } };
  const sofia = { id: "sofia", name: "Sofia", emoji: "", description: "", person: { relation: "Sister", domain: "Family", hue: "", dates: [{ id: "b", label: "Birthday", date: "1992-12-03" }] } };
  const people = { ...data, topics: [sofia] };
  assert.match(routineRequest(people, placed, "2026-11-21") ?? "",
    /coming up with nothing planned: @Sofia's birthday on 2026-12-03, in 12 days \(open tasks naming them: “Call Sofia about Sunday dinner”\).+one suggestion is a task to prepare for it/s);
  const cake = { id: "cake", title: "Order @Sofia's birthday cake", domain: "Family", projectId: "", done: false, due: "2026-12-01" };
  assert.doesNotMatch(routineRequest({ ...people, tasks: [...people.tasks, cake] }, placed, "2026-11-21") ?? "", /nothing planned/, "a task naming her and the date plans it");
  assert.doesNotMatch(routineRequest({ ...people, topics: [{ ...sofia, person: { ...sofia.person, domain: "Health" } }] }, placed, "2026-11-21") ?? "", /nothing planned/,
    "only the people of the domains the agent looks after");
  const quiet = { ...people, notes: [], tasks: [] };
  const now = new Date("2026-11-21T09:00:00");
  assert.equal(routineHasNews(quiet, placed, Date.parse("2026-11-05T09:00:00"), now, "2026-11-21"), true, "her birthday came within three weeks since the last run");
  assert.equal(routineHasNews(quiet, placed, Date.parse("2026-11-15T09:00:00"), now, "2026-11-21"), false, "already in reach at the last run");
});
