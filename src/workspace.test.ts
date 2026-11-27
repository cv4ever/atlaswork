import test from "node:test";
import assert from "node:assert/strict";
import { defaultDomain } from "./model.ts";
import { initialSession } from "./session.ts";
import { defaultPages } from "./blocks.ts";
import type { Note, Proposal, WorkspaceData } from "./model.ts";
import type { Session } from "./session.ts";
import type { Block } from "./blocks.ts";
import { domainKey, tabKey } from "./place.ts";
import { seedWorkspace, withDemoSeed } from "./demo.ts";
import { newRoutine, routineRequest } from "./routines.ts";
import {
  applyProposal, archiveProject, arrangePage, createDomain, createProject, createResource, createResources, createTask, deleteForever, deleteResources, editAgent, editDomain, editProject, editResource, editTask, editTeam, homeArchived, moveResource, normalize, onScreen, placesOf, purgeBlock, resetPage, resourcesIn, saveDraft, setArchived, setResourceLinked, todayRhythm, undoProposal, visible,
} from "./workspace.ts";
import type { WorkspaceStore } from "./workspace.ts";

test("a page is cleaned as it's saved: emptied numbers, bad dates, stale views and unknown widgets never land", () => {
  const blocks = [
    { id: "fund", type: "goal", target: Number.NaN, current: 3200, view: "gone", width: "huge" },
    { id: "race", type: "countdown", date: "next spring", since: "2026-09-07" },
    { id: "sleep", type: "tracker", better: "sideways", entries: [{ date: "2026-11-01", value: 7 }, { date: "oops", value: 8 }, { date: "2026-11-02", value: Number.NaN }] },
    { id: "sleep", type: "tracker" },
    { id: "lights", type: "habit", days: ["2026-11-02", "2026-11-01", "2026-11-02", "soon"] },
    { id: "chart", type: "sparkle" },
  ] as unknown as Block[];
  const saved = editDomain(seedWorkspace(), "Health", { widgets: blocks }).data.domains.find((domain) => domain.name === "Health")!.widgets;
  assert.deepEqual(saved, [
    { id: "fund", type: "goal", current: 3200 },
    { id: "race", type: "countdown", since: "2026-09-07" },
    { id: "sleep", type: "tracker", entries: [{ date: "2026-11-01", value: 7 }] },
    { id: "lights", type: "habit", days: ["2026-11-01", "2026-11-02"] },
  ]);
});

test("a page only loses a data widget when it's purged: leaving it out or resetting puts it away with what it logged", () => {
  const sleep = { id: "sleep", type: "tracker" as const, entries: [{ date: "2026-11-01", value: 7 }] };
  const tasks = { id: "tasks", type: "tasks" as const };
  const home = `area:${defaultDomain.name}`;
  const page = (data: WorkspaceData) => data.domains.find((domain) => domain.name === defaultDomain.name)!.widgets;
  const empty = normalize(null).data;
  const start = arrangePage(empty, home, [sleep, tasks], "2026-11-02").data;
  assert.deepEqual(page(start), [sleep, tasks]);

  const left = arrangePage(start, home, [], "2026-11-03").data;
  assert.deepEqual(page(left), [{ ...sleep, removed: "2026-11-03" }], "the tracker is put away; the tasks block just goes");
  const restored = arrangePage(left, home, [{ ...sleep, removed: "2026-11-03" }], "2026-11-04").data;
  assert.deepEqual(page(restored), [sleep], "passing a put-away block brings it back");

  const reset = resetPage(restored, home, "2026-11-05").data;
  assert.deepEqual(page(reset)!.at(-1), { ...sleep, removed: "2026-11-05" }, "the default comes back with the tracker put away");
  assert.equal(page(resetPage(start, home, "2026-11-05").data)!.length, 4, "the default's three blocks, then the tracker");
  assert.equal(page(resetPage(empty, home, "2026-11-05").data), undefined, "nothing to keep: the default itself");

  assert.deepEqual(page(purgeBlock(start, home, "sleep").data), [sleep, tasks], "a block on show is never purged");
  assert.deepEqual(page(purgeBlock(reset, home, "sleep").data)!.some((block) => block.id === "sleep"), false);
  assert.throws(() => arrangePage(start, "missing-project", [], "2026-11-05"), /page no longer exists/);
});

/** A proposal drawn from a note, as agents made them before live models; older chats still hold some. */
function fromNote(note: Note, titles: string[]): Proposal {
  const id = crypto.randomUUID();
  return { id, projectId: note.projectId, noteId: note.id, sourceTitle: note.title, sourceBody: note.body, status: "pending",
    items: titles.map((title) => ({ id: crypto.randomUUID(), domain: note.domain, projectId: note.projectId, title, done: false, due: "", createdBy: id, agentId: "atlas" })) };
}

test("note proposals reflect current content, apply once, and undo without losing edits", () => {
  const data = seedWorkspace();
  const original = data.notes.find((note) => note.id === "room-plan")!;
  const note = { ...original, body: "Next steps\n- Measure the new wall.\n- Compare warm lights.\n- Route the cables." };
  const current = editResource(data, note.id, { body: note.body }).data;
  const proposal = fromNote(note, ["Measure the new wall", "Compare warm lights", "Route the cables"]);
  const applied = applyProposal(current, proposal);
  // Added tasks are stamped with when; otherwise they're exactly the proposal's.
  assert.deepEqual(applied.changes.tasks?.map(({ updatedAt: _stamp, ...task }) => task), proposal.items);
  assert.deepEqual(applyProposal(applied.data, proposal), { data: applied.data, changes: {} });
  const undone = undoProposal(applied.data, proposal);
  assert.deepEqual(undone.data, current);
  assert.deepEqual(undone.changes.deletedTaskIds, proposal.items.map((task) => task.id));
  const edited = editTask(applied.data, proposal.items[0].id, { title: "Keep this edited task" }).data;
  assert.throws(() => undoProposal(edited, proposal), /edited/);
  assert.throws(() => applyProposal(data, proposal), /source note changed/);
});

test("renaming a domain carries its records and persists exactly them", () => {
  const data = seedWorkspace();
  const { data: next, changes } = editDomain(data, "Everyday", { name: "  Daily " });
  assert.equal(next.domains[0].name, "Daily");
  const home = (item: { area: string } | { domain: string }) => ("area" in item ? item.area : item.domain);
  assert.ok([...data.projects, ...data.notes, ...data.tasks].filter((item) => home(item) === "Everyday")
    .every((item) => home([...next.projects, ...next.notes, ...next.tasks].find((other) => other.id === item.id)!) === "Daily"));
  assert.deepEqual(changes.projects?.map((item) => item.id), data.projects.filter((item) => item.area === "Everyday").map((item) => item.id));
  assert.equal(changes.notes?.length, data.notes.filter((item) => item.domain === "Everyday").length);
  assert.equal(changes.tasks?.length, data.tasks.filter((item) => item.domain === "Everyday").length);
  assert.equal(changes.domains, next.domains);
  // Names are keys: no blanks, no case-insensitive collisions, but a domain may keep or recase its own name.
  assert.throws(() => editDomain(data, "Everyday", { name: " health " }), /already a domain/);
  assert.throws(() => createDomain(data, { ...data.domains[1], name: "HEALTH" }), /already a domain/);
  assert.throws(() => createDomain(data, { ...data.domains[1], name: "  " }), /needs a name/);
  assert.equal(editDomain(data, "Health", { name: "health" }).data.domains[1].name, "health");
});

test("Domain edits preserve current archive, owner and routines, carry a rename into what its routines ask, and refuse missing names", () => {
  const captured = createResource(seedWorkspace(), { title: "Next step", body: "- Test the renamed Domain preview" }, "demo-strength");
  const routine = newRoutine("check-in", "");
  let data = editDomain(captured.data, "Health", { agentId: "atlas", routines: [routine] }).data;
  data = setArchived(data, { kind: "domain", id: "Health" }, true).data;
  const renamed = editDomain(data, "Health", { name: "Wellbeing", intention: "Fresh intention" });
  const domain = renamed.data.domains.find((item) => item.name === "Wellbeing")!;
  assert.deepEqual([domain.archived, domain.agentId, domain.routines, domain.intention], [true, "atlas", [routine], "Fresh intention"]);
  assert.equal(renamed.data.projects.find((project) => project.id === "demo-strength")!.area, "Wellbeing");
  assert.equal(renamed.data.notes.find((note) => note.id === captured.resource.id)!.domain, "Wellbeing");
  data = setArchived(renamed.data, { kind: "domain", id: "Wellbeing" }, false).data;
  const owner = { kind: "domain" as const, id: "Wellbeing" };
  assert.match(routineRequest(data, { routine, owner }) ?? "", /notes in Wellbeing/);
  assert.throws(() => editDomain(data, "Health", { intention: "Late edit" }), /domain no longer exists/);
  const removed = deleteForever(data, { kind: "domain", id: owner.id }).data;
  assert.throws(() => editDomain(removed, owner.id, { name: "Returned" }), /domain no longer exists/);
  assert.throws(() => editDomain(removed, owner.id, {}), /domain no longer exists/);
  const created = createDomain(removed, { name: "Garden", emoji: "", hue: "", intention: "" }).data;
  assert.equal(created.domains.find((item) => item.name === "Garden")!.intention, "");
});

test("moving a project takes its notes and tasks; deleting a domain removes everything in it", () => {
  const data = seedWorkspace();
  const moved = editProject(data, data.projects[0].id, { area: "Health" });
  assert.equal(moved.moved, true);
  assert.ok([...moved.data.notes, ...moved.data.tasks].filter((item) => item.projectId === "home-office").every((item) => item.domain === "Health"));
  const { data: gone, changes } = deleteForever(moved.data, { kind: "domain", id: "Health" });
  assert.ok(![...gone.projects.map((project) => project.area), ...gone.notes.map((note) => note.domain), ...gone.tasks.map((task) => task.domain)].includes("Health"));
  assert.ok(!gone.domains.some((domain) => domain.name === "Health"));
  const inHealth = (item: { domain: string }) => item.domain === "Health";
  assert.deepEqual(changes.deletedProjectIds, moved.data.projects.filter((project) => project.area === "Health").map((project) => project.id));
  assert.ok(changes.deletedProjectIds?.includes("home-office"));
  assert.equal(changes.deletedTaskIds?.length, moved.data.tasks.filter(inHealth).length);
});

test("Project edits preserve concurrent archive, assignments and routines, and never recreate deleted Projects", () => {
  const seed = seedWorkspace();
  const project = seed.projects[0];
  const archived = setArchived(seed, { kind: "project", id: project.id }, true).data;
  const assigned = editProject(archived, project.id, { agentId: "atlas", teamId: undefined, routines: [] }).data;
  const edited = editProject(assigned, project.id, { title: "  Current title  " });
  assert.deepEqual(edited.data.projects.find((item) => item.id === project.id),
    { ...assigned.projects.find((item) => item.id === project.id), title: "Current title" });
  assert.equal(edited.data.projects.find((item) => item.id === project.id)!.archived, true);
  const moved = editProject(edited.data, project.id, { area: "Health" }).data;
  assert.ok([...moved.notes, ...moved.tasks].filter((item) => item.projectId === project.id).every((item) => item.domain === "Health"));
  const gone = deleteForever(moved, { kind: "project", id: project.id }).data;
  assert.throws(() => editProject(gone, project.id, { title: "Late title" }), /project no longer exists/);
  assert.throws(() => editProject(gone, project.id, {}), /project no longer exists/);
  assert.throws(() => editProject(seed, project.id, { area: "Missing" }), /domain no longer exists/);
  assert.throws(() => editProject(seed, project.id, { title: " " }), /needs a title/);
  const draft = { id: "new-project", title: "  Fresh  ", description: "  Reason  ", color: "pine", area: "Health" };
  const created = createProject(seed, draft).data;
  const { createdAt, ...made } = created.projects.find((item) => item.id === draft.id)!;
  assert.deepEqual(made, { ...draft, title: "Fresh", description: "Reason" });
  assert.ok(Date.parse(createdAt!) > 0, "creation stamps when, which opens the project's welcome");
  assert.throws(() => createProject(created, draft), /already exists/);
  assert.throws(() => createProject(seed, { ...draft, area: "Missing" }), /domain no longer exists/);
});

test("normalize adopts session domains, adds the default and missing areas, and gives items owners", () => {
  const stored: WorkspaceData = {
    domains: [],
    projects: [{ id: "p", title: "P", area: "Garden", description: "", color: "pine" }],
    notes: [{ id: "n", domain: "", projectId: "p", title: "N", body: "", updatedAt: "" },
      { id: "r", domain: "Garden", projectId: "", title: "R", body: "", updatedAt: "", resource: true } as WorkspaceData["notes"][number]],
    tasks: [{ id: "t", domain: "", projectId: "missing", title: "T", done: false, due: "" }],
    topics: [],
    agents: [],
    teams: [],
    threads: [],
    routineRuns: {},
    briefs: {},
    memories: [],
    runs: [],
  };
  const health = { name: "Health", emoji: "🌿", hue: "#6c9a68", intention: "" };
  const { data, changes } = normalize(stored, [health]);
  assert.deepEqual(data.domains.map((domain) => domain.name), [defaultDomain.name, "Health", "Garden"]);
  assert.equal(data.notes[0].domain, "Garden");
  assert.ok(!("resource" in data.notes[1]), "the old resource flag goes");
  assert.deepEqual([data.tasks[0].domain, data.tasks[0].projectId], [defaultDomain.name, ""]);
  assert.deepEqual(Object.keys(changes).sort(), ["agents", "domains", "notes", "tasks"]);
  assert.equal(data.agents[0].id, "atlas");
  assert.deepEqual(normalize(data).changes, {});
  assert.deepEqual(normalize(null).data.domains, [defaultDomain]);
});

test("the demo seed fills a never-saved store once", async () => {
  let saved: WorkspaceData | null = null;
  const memory: WorkspaceStore = {
    load: async () => saved,
    save: async (changes) => {
      const base = saved ?? { domains: [], projects: [], notes: [], tasks: [], topics: [], agents: [], teams: [], threads: [] };
      saved = { ...base, ...changes } as WorkspaceData;
    },
    replace: async (data) => { saved = data; },
    claimRoutine: async (id, due) => {
      const data = saved ?? normalize(null).data;
      const claimed = !(Date.parse(data.routineRuns[id] ?? "") >= Date.parse(due));
      if (claimed) saved = { ...data, routineRuns: { ...data.routineRuns, [id]: due } };
      return { claimed, receipts: saved?.routineRuns ?? data.routineRuns };
    },
  };
  const store = withDemoSeed(memory);
  const first = await store.load();
  assert.equal(first?.projects[0].id, "home-office");
  await store.save({ domains: [defaultDomain], projects: [], notes: [], tasks: [] });
  assert.deepEqual((await store.load())?.projects, []);
});

test("the demo seed loads a store saved before domains existed", async () => {
  const legacy: WorkspaceData = { domains: [], projects: [], notes: [], tasks: [], topics: [], agents: [], teams: [], threads: [], routineRuns: {}, briefs: {}, memories: [], runs: [] };
  const store = withDemoSeed({ load: async () => legacy, save: async () => {}, replace: async () => {},
    claimRoutine: async (id, due) => {
      const claimed = !(Date.parse(legacy.routineRuns[id] ?? "") >= Date.parse(due));
      if (claimed) legacy.routineRuns[id] = due;
      return { claimed, receipts: legacy.routineRuns };
    } });
  assert.ok((await store.load())?.agents.some((agent) => agent.id === "hearth"));
});

test("archived domains and projects hide what they hold; Today sees due open tasks and the latest note", () => {
  // Only the test's own tasks, so the demo's relative due dates can't leak in.
  const full = seedWorkspace();
  const seed = { ...full, tasks: [full.tasks[0]] };
  const loose = createTask(seed, { title: "Stretch", due: "2026-10-19" }, "area:Health");
  const tasks = editTask(loose.data, seed.tasks[0].id, { due: "2026-10-20" }).data;
  const data = { ...tasks, notes: tasks.notes.map((note) => note.id === seed.notes[1].id ? { ...note, updatedAt: "2099-01-01T00:00:00.000Z" } : note) };
  const view = visible(data, "Health", "2026-10-19");
  const looseId = loose.changes.tasks![0].id;
  assert.deepEqual(view.dueTasks.map((task) => task.id), [looseId]);
  assert.deepEqual(view.domainTasks.map((task) => task.id), [looseId]);
  assert.equal(view.lastNote?.id, seed.notes[1].id);
  const hiddenProject = visible(setArchived(data, { kind: "project", id: "home-office" }, true).data, "Everyday", "2026-10-21");
  assert.ok(!hiddenProject.projects.some((project) => project.id === "home-office"));
  assert.ok(!hiddenProject.notes.some((note) => note.projectId === "home-office"));
  assert.deepEqual(hiddenProject.tasks.map((task) => task.id), [looseId]);
  const hiddenDomain = visible(setArchived(data, { kind: "domain", id: "Health" }, true).data, "Everyday", "2026-10-19");
  assert.deepEqual(hiddenDomain.dueTasks, []);
  assert.ok(!hiddenDomain.domains.some((domain) => domain.name === "Health"));
});

test("a resource shows in its home and where it's linked; archiving keeps what you pick and deleting unlinks", () => {
  const seed = seedWorkspace();
  const portfolio = "demo-portfolio";
  const file = new File(["Keep these bytes"], "brief.txt", { type: "text/plain" });
  const created = createResource(seed, { kind: "file", title: "Brief", body: "Original annotation", file, url: "https://example.com/brief", source: "Source" }, "area:Health");
  const id = created.resource.id;
  assert.deepEqual([created.resource.domain, created.resource.projectId, created.resource.topicId], ["Health", "", undefined]);
  // A stale UI identity must operate on the latest content, not restore the capture's annotation.
  const edited = editResource(created.data, id, { title: "Latest brief", body: "Latest annotation" });
  const latest = edited.changes.notes![0];
  let data = edited.data;
  data = setResourceLinked(data, id, "home-office", true).data;
  data = setResourceLinked(data, id, portfolio, true).data;
  assert.equal(setResourceLinked(data, id, portfolio, true).data, data);
  data = moveResource(data, id, "home-office").data;
  assert.deepEqual(data.notes.find((note) => note.id === id), { ...latest, domain: "Everyday", projectId: "home-office", linkedProjectIds: [portfolio] });
  assert.equal(setResourceLinked(data, id, "home-office", true).data, data, "a home cannot become a Link");
  data = setResourceLinked(data, id, portfolio, false).data;
  assert.equal(setResourceLinked(data, id, portfolio, false).data, data);
  data = setResourceLinked(data, id, portfolio, true).data;
  const scrap = createResource(data, { title: "Scrap" }, "home-office");
  data = scrap.data;
  assert.ok(resourcesIn(data, portfolio).some((note) => note.id === id));
  // Archive the home, keeping Brief in a Topic. Scrap rests with the Project.
  const archived = archiveProject(data, "home-office", { [id]: "topic-pkm" });
  const brief = archived.data.notes.find((note) => note.id === id)!;
  assert.deepEqual(brief, { ...latest, domain: "", projectId: "", topicId: "topic-pkm", linkedProjectIds: [portfolio, "home-office"] });
  assert.equal(brief.file, file);
  assert.ok(visible(archived.data, "Everyday", "2026-10-20").notes.some((note) => note.id === id));
  assert.ok(!visible(archived.data, "Everyday", "2026-10-20").notes.some((note) => note.id === scrap.resource.id));
  // A Link stays visible when its home is archived.
  const homeGone = setArchived(data, { kind: "project", id: "home-office" }, true).data;
  assert.equal(homeArchived(homeGone, homeGone.notes.find((note) => note.id === id)!), true);
  assert.ok(resourcesIn(homeGone, portfolio).some((note) => note.id === id));
  // Deleting the archived Project removes only its Link from the keeper, and cascades its remaining home.
  const deleted = deleteForever(archived.data, { kind: "project", id: "home-office" });
  assert.deepEqual(deleted.data.notes.find((note) => note.id === id), { ...brief, linkedProjectIds: [portfolio] });
  assert.ok(!deleted.data.notes.some((note) => note.id === scrap.resource.id));
  assert.ok(deleted.changes.notes?.some((note) => note.id === id));
  assert.ok(deleted.changes.notes?.every((note) => !note.linkedProjectIds?.includes("home-office")));
});

test("Resource homes clear other ownership and preserve every kind's content", () => {
  let data = seedWorkspace();
  const file = new File(["unchanged"], "resource.bin");
  for (const kind of ["note", "link", "file", "image", "video", "quote"] as const) {
    const created = createResource(data, { kind, title: kind, body: "Annotation", file, url: "https://example.com", source: "Source" }, "topic:topic-pkm");
    const original = created.resource;
    assert.deepEqual([original.domain, original.projectId, original.topicId], ["", "", "topic-pkm"]);
    data = moveResource(created.data, original.id, "demo-portfolio").data;
    const project = data.projects.find((item) => item.id === "demo-portfolio")!;
    assert.deepEqual(data.notes.find((note) => note.id === original.id), { ...original, domain: project.area, projectId: project.id, topicId: undefined });
    data = moveResource(data, original.id, "area:Family").data;
    assert.deepEqual(data.notes.find((note) => note.id === original.id), { ...original, domain: "Family", projectId: "", topicId: undefined });
    data = moveResource(data, original.id, "topic:topic-training").data;
    assert.deepEqual(data.notes.find((note) => note.id === original.id), { ...original, topicId: "topic-training" });
    assert.equal(data.notes.find((note) => note.id === original.id)!.file, file);
  }
});

test("invalid Resource destinations and stale keep selections refuse the whole edit", () => {
  const created = createResource(seedWorkspace(), { title: "Keep" }, "home-office");
  const { data, resource } = created;
  const before = structuredClone(data);
  for (const place of ["missing-project", "area:Missing", "topic:missing-topic", ""]) {
    assert.throws(() => createResource(data, { title: "Invalid" }, place), /no longer exists/);
    assert.throws(() => moveResource(data, resource.id, place), /no longer exists/);
  }
  assert.throws(() => moveResource(data, "missing-resource", "area:Health"), /resource no longer exists/);
  assert.throws(() => setResourceLinked(data, "missing-resource", "home-office", true), /resource no longer exists/);
  for (const linked of [true, false])
    for (const projectId of ["missing-project", "area:Health", "topic:topic-pkm"])
      assert.throws(() => setResourceLinked(data, resource.id, projectId, linked), /project no longer exists/);
  assert.throws(() => archiveProject(data, "home-office", { [resource.id]: "topic-pkm", "room-plan": "missing-topic" }), /topic no longer exists/);
  assert.throws(() => archiveProject(data, "missing-project", {}), /project no longer exists/);
  assert.throws(() => archiveProject(data, "home-office", { "missing-resource": "topic-pkm" }), /resource no longer exists/);
  const moved = moveResource(data, resource.id, "area:Health").data;
  assert.throws(() => archiveProject(moved, "home-office", { [resource.id]: "topic-pkm" }), /homed in this project/);
  assert.deepEqual(structuredClone(data), before);
});

test("Resource content edits preserve concurrent Home, Links, words, archive state and Blob, and refuse deletion", () => {
  const file = new File(["kept bytes"], "brief.txt", { type: "text/plain" });
  const created = createResource(seedWorkspace(), { kind: "file", title: "Brief", body: "Draft", file }, "home-office");
  const id = created.resource.id;
  let data = moveResource(created.data, id, "area:Health").data;
  data = setResourceLinked(data, id, "demo-portfolio", true).data;
  data = setArchived(data, { kind: "note", id }, true).data;
  data = editResource(data, id, { title: "Current title" }).data;
  data = editResource(data, id, { source: "Current source" }).data;
  const edited = editResource(data, id, { body: "Words from the older editor" });
  const note = edited.data.notes.find((item) => item.id === id)!;
  assert.deepEqual([note.title, note.body, note.source, note.domain, note.projectId, note.linkedProjectIds, note.archived],
    ["Current title", "Words from the older editor", "Current source", "Health", "", ["demo-portfolio"], true]);
  assert.equal(note.file, file);
  assert.equal(note.kind, "file");
  const gone = deleteForever(edited.data, { kind: "note", id }).data;
  assert.throws(() => editResource(gone, id, { body: "Late edit" }), /resource no longer exists/);
});

test("Task homes are validated, edits keep concurrent changes, and proposals never write a Task without a live Domain", () => {
  const seed = seedWorkspace();
  const project = seed.projects.find((item) => item.id === "home-office")!;
  const { data, changes } = createTask(seed, { title: "  Hang the lamp " }, "home-office");
  const task = changes.tasks![0];
  assert.deepEqual([task.title, task.domain, task.projectId, task.done, task.due], ["Hang the lamp", project.area, project.id, false, ""]);
  // An agent completes it while the dialog is open; the dialog sends only the title it changed.
  const completed = editTask(data, task.id, { done: true }).data;
  const renamed = editTask(completed, task.id, { title: "Hang the warm lamp" }).data.tasks.find((item) => item.id === task.id)!;
  assert.deepEqual([renamed.title, renamed.done], ["Hang the warm lamp", true]);
  const moved = editTask(completed, task.id, { home: "area:Health" }).data.tasks.find((item) => item.id === task.id)!;
  assert.deepEqual([moved.domain, moved.projectId], ["Health", ""]);
  assert.deepEqual(editTask(data, task.id, {}), { data, changes: {} });
  for (const home of ["missing-project", "area:Missing", ""]) {
    assert.throws(() => createTask(data, { title: "Invalid" }, home), /no longer exists/);
    assert.throws(() => editTask(data, task.id, { home }), /no longer exists/);
  }
  assert.throws(() => createTask(data, { title: "Invalid" }, "topic:topic-pkm"), /not a topic/);
  assert.throws(() => editTask(data, task.id, { title: " " }), /needs a title/);
  assert.throws(() => editTask(data, "missing-task", { done: true }), /task no longer exists/);

  const domainNote = createResource(data, { title: "Film", body: "- Buy film" }, "area:Health");
  const proposal = fromNote(domainNote.resource, ["Buy film"]);
  const health = domainNote.data.domains.find((item) => item.name === "Health")!;
  const afterRename = editDomain(domainNote.data, health.name, { name: "Wellbeing" }).data;
  assert.throws(() => applyProposal(afterRename, proposal), /source note changed/);
});

test("a dialog's draft changes only what it touched, so edits made while it was open survive", () => {
  const seed = seedWorkspace();
  const health = seed.domains.find((item) => item.name === "Health")!;
  const domain = saveDraft(editDomain(seed, "Health", { intention: "Sleep more" }).data,
    { kind: "domain", original: health, domain: { ...health, emoji: "💪" } }).data.domains.find((item) => item.name === "Health")!;
  assert.deepEqual([domain.emoji, domain.intention], ["💪", "Sleep more"]);
  assert.throws(() => saveDraft(editDomain(seed, "Health", { name: "Wellbeing" }).data,
    { kind: "domain", original: health, domain: { ...health, emoji: "💪" } }), /domain no longer exists/);

  const office = seed.projects.find((item) => item.id === "home-office")!;
  const project = saveDraft(editProject(seed, office.id, { agentId: "vital" }).data,
    { kind: "project", original: office, project: { ...office, title: "Studio", area: "Health" } });
  assert.equal(project.moved, true);
  assert.deepEqual(project.data.projects.find((item) => item.id === office.id), { ...office, agentId: "vital", title: "Studio", area: "Health" });
  assert.throws(() => saveDraft(deleteForever(seed, { kind: "project", id: office.id }).data,
    { kind: "project", original: office, project: { ...office, title: "Late" } }), /project no longer exists/);

  // A finish date picked in the dialog lands on the page as it is at Save, not as the dialog opened it.
  const page = [{ id: "notes", type: "resources" as const }, { id: "launch", type: "countdown" as const, date: "2026-11-26", since: "2026-11-01" }];
  const planned = editProject(seed, office.id, { widgets: page }).data;
  const opened = planned.projects.find((item) => item.id === office.id)!;
  const pageEdited = editProject(planned, office.id, { widgets: [...page, { id: "fund", type: "goal" as const, current: 10, target: 100 }] }).data;
  const dated = saveDraft(pageEdited, { kind: "project", original: opened, project: opened, finish: { date: "2026-12-17", today: "2026-11-17" } })
    .data.projects.find((item) => item.id === office.id)!.widgets!;
  assert.deepEqual(dated.map((block) => [block.id, block.date, block.since]),
    [["notes", undefined, undefined], ["launch", "2026-12-17", "2026-11-01"], ["fund", undefined, undefined]]);

  const crew = seed.teams.find((item) => item.id === "home-front")!;
  const team = saveDraft(editTeam(seed, crew.id, { purpose: "Run the house" }).data,
    { kind: "team", original: crew, team: { ...crew, name: "Homebase" } }).data.teams.find((item) => item.id === crew.id)!;
  assert.deepEqual([team.name, team.purpose], ["Homebase", "Run the house"]);

  const created = createTask(seed, { title: "Hang the lamp" }, "home-office");
  const lamp = created.changes.tasks![0];
  const form = { kind: "task" as const, original: lamp, title: lamp.title, due: lamp.due, at: "", length: 0, done: lamp.done, home: "home-office" };
  const done = editTask(created.data, lamp.id, { done: true }).data;
  const renamed = saveDraft(done, { ...form, title: "Hang the warm lamp" }).data.tasks.find((item) => item.id === lamp.id)!;
  assert.deepEqual([renamed.title, renamed.done, renamed.projectId], ["Hang the warm lamp", true, "home-office"]);
  const moved = saveDraft(done, { ...form, home: "area:Health" }).data.tasks.find((item) => item.id === lamp.id)!;
  assert.deepEqual([moved.title, moved.done, moved.domain, moved.projectId], ["Hang the lamp", true, "Health", ""]);

  // Someone gives Hearth a role, a tool switch and the cooking project while their dialog changes other switches and places.
  const hearth = seed.agents.find((item) => item.id === "hearth")!;
  const places = placesOf(seed, hearth.id);
  const meanwhile = editAgent(seed, hearth.id, { role: "Home lead", tools: { "see-tasks": false } }, { add: { projectIds: ["demo-cooking"] } }).data;
  const agent = saveDraft(meanwhile, { kind: "agent", original: { agent: hearth, places },
    agent: { ...hearth, tools: { "read-notes": false } },
    places: { ...places, domains: [...places.domains, "Everyday"], projectIds: places.projectIds.filter((id) => id !== office.id) } }).data;
  assert.deepEqual(agent.agents.find((item) => item.id === hearth.id)!.tools, { "see-tasks": false, "read-notes": false });
  assert.equal(agent.agents.find((item) => item.id === hearth.id)!.role, "Home lead");
  const after = placesOf(agent, hearth.id);
  assert.ok(after.domains.includes("Everyday") && after.projectIds.includes("demo-cooking") && !after.projectIds.includes(office.id));

  const fresh = { id: "fresh-team", name: "Fresh", purpose: "", memberIds: ["kin"] };
  assert.deepEqual(saveDraft(seed, { kind: "team", team: fresh }).data.teams.at(-1), fresh);
});

test("today's rhythm counts what's due by today and forgets what was finished on an earlier day", () => {
  const task = (due: string, done: boolean, updatedAt?: string) => ({ id: due, domain: "Everyday", projectId: "", title: "", due, done, updatedAt });
  const noonToday = new Date(2026, 9, 28, 12).toISOString();
  const noonYesterday = new Date(2026, 9, 27, 12).toISOString();
  assert.deepEqual(todayRhythm([
    task("2026-10-28", true, noonYesterday), // due today: counts however long ago it was ticked
    task("2026-10-27", false), // overdue and open
    task("2026-10-26", true, noonToday), // overdue, finished today
    task("2026-10-25", true, noonYesterday), // finished on an earlier day
    task("2026-10-29", false), // not due yet
    task("", true, noonToday), // no due date
  ], "2026-10-28"), { done: 2, total: 3 });
});

test("the page on screen: what Customize arranges, the breadcrumb, progress, and the notes a pinned note can show", () => {
  const today = "2026-11-07";
  const data = normalize(null).data;
  data.domains.push({ ...data.domains[0], name: "Finance" });
  data.projects = [{ id: "tax", title: "Taxes", area: "Finance", description: "", color: "" }];
  data.topics = [{ id: "t1", name: "Recipes", emoji: "🍲", description: "" }];
  const note = (id: string, home: Partial<Note>): Note => ({ id, title: id, body: "", domain: "Finance", projectId: "", linkedProjectIds: [], updatedAt: "", ...home });
  data.notes = [note("receipts", { projectId: "tax" }), note("rates", { linkedProjectIds: ["tax"] }), note("old", { archived: true }),
    note("url", { title: "", kind: "link", projectId: "tax" })];
  const task = (id: string, done: boolean, projectId = "") => ({ id, title: id, domain: "Finance", projectId, done, due: today });
  data.tasks = [task("file", true, "tax"), task("pay", false, "tax"), task("budget", false)];
  const at = (patch: Partial<Session>) => onScreen(data, { ...initialSession, domain: "Finance", view: null, ...patch }, today);
  const ids = (notes: Note[]) => notes.map((item) => item.id);

  const project = at({ active: tabKey({ kind: "project", id: "tax" }) });
  assert.deepEqual(project.page, { place: "tax", name: "Taxes", blocks: defaultPages.project, custom: false });
  assert.deepEqual(project.crumbs, ["Finance", "Taxes"]);
  assert.deepEqual([project.progress?.id, project.progress?.done, project.progress?.total], ["tax", 1, 2], "a Project counts all its tasks");
  assert.deepEqual(ids(project.pinnable), ["receipts", "rates", "url"], "homed and linked in, nothing archived");

  const domain = at({ active: domainKey("Finance"), section: "tasks" });
  assert.equal(domain.page.place, domainKey("Finance"));
  assert.deepEqual(domain.crumbs, ["Domains", "Finance", "Tasks"]);
  assert.deepEqual([domain.progress?.label, domain.progress?.done, domain.progress?.total], ["Due today in Finance", 1, 3]);
  assert.deepEqual(ids(domain.pinnable), ["receipts", "rates", "url"]);

  const link = at({ active: tabKey({ kind: "resource", id: "url" }) });
  assert.deepEqual(link.crumbs, ["Finance", "Taxes", "Untitled link"]);
  assert.equal(link.progress?.id, "tax", "a Resource tab follows its home Project");
  assert.equal(link.page.place, "", "a Resource isn't a page");

  const day = at({ view: "today", widgets: ["tasks"] });
  assert.deepEqual(day.page, { place: "", name: "Today", blocks: [{ id: "tasks", type: "tasks" }], custom: false });
  assert.deepEqual([day.crumbs, day.progress?.total, day.pinnable], [["Everywhere", "Today"], 3, []]);

  assert.deepEqual(at({ view: "library", libraryTopic: "t1" }).crumbs, ["Everywhere", "Library", "Recipes"]);
});

test("several files land together and Undo takes them back in one changeset", () => {
  const seed = seedWorkspace();
  const file = (name: string) => new File(["x"], name);
  const saved = createResources(seed, [{ kind: "file", title: "a", file: file("a.txt") }, { kind: "image", title: "b", file: file("b.png") }], "home-office");
  const ids = saved.resources.map((note) => note.id);
  assert.deepEqual(saved.changes.notes?.map((note) => note.id), ids);
  assert.ok(ids.every((id) => saved.data.notes.find((note) => note.id === id)?.projectId === "home-office"));
  const undone = deleteResources(saved.data, ids);
  assert.deepEqual(undone.changes.deletedNoteIds, ids);
  assert.ok(ids.every((id) => !undone.data.notes.some((note) => note.id === id)));
});
