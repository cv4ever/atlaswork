import test from "node:test";
import assert from "node:assert/strict";
import { admitHandoff, admitProposal, agentWorkspace } from "./agentWorkspace.ts";
import { handoffOf, proposalOf } from "./commands.ts";
import { computerFolders, memoriesOf, snapshotOf } from "./agentRequest.ts";
import { normalize } from "./workspace.ts";
import { calendarAccess } from "./model.ts";
import type { Agent, CalendarAccess, WorkspaceData } from "./model.ts";

function fixture() {
  const data = normalize(null).data;
  const agent = { ...data.agents[0], id: "keeper", name: "Keeper", tools: { "arrange-pages": true }, access: { calendar: { level: "add" as const, away: false } } };
  data.agents.push(agent);
  data.domains[0] = { ...data.domains[0], agentId: agent.id };
  data.domains.push({ name: "Private", emoji: "", hue: "", intention: "" });
  data.projects = [
    { id: "mine", title: "My project", area: "Everyday", description: "", color: "", widgets: [{ id: "deadline", type: "countdown", title: "My deadline", date: "2026-12-01" }] },
    { id: "other", title: "Other project", area: "Private", description: "", color: "", widgets: [{ id: "secret", type: "countdown", title: "Private deadline", date: "2026-12-02" }] },
  ];
  data.notes = [
    { id: "mine", title: "My note", body: "My words", domain: "Everyday", projectId: "mine", updatedAt: "2026-11-11" },
    { id: "other", title: "Private note", body: "Attached words", domain: "Private", projectId: "other", updatedAt: "2026-11-11" },
    { id: "neighbor", title: "Neighbor note", body: "Not attached", domain: "Private", projectId: "other", updatedAt: "2026-11-11" },
  ];
  data.tasks = [
    { id: "mine", title: "My task", domain: "Everyday", projectId: "mine", done: false, due: "2026-11-12" },
    { id: "other", title: "Private task", domain: "Private", projectId: "other", done: false, due: "2026-11-12" },
  ];
  return { data, agent };
}

test("archived Homes disappear from text, Pages and command choices together, even for Atlas", () => {
  for (const archived of ["domain", "project"] as const) {
    const { data } = fixture();
    if (archived === "domain") data.domains[0] = { ...data.domains[0], archived: true };
    else data.projects[0] = { ...data.projects[0], archived: true };
    const agent = data.agents[0];
    const request = { data, agent, attached: data.notes[0], request: "Review" };
    const body = snapshotOf(request, "2026-11-11");
    assert.deepEqual(body.notes.map(note => note.title), ["Neighbor note", "Private note"]);
    assert.deepEqual(body.tasks.map(task => task.title), ["Private task"]);
    assert.equal(body.attachedNote, undefined);
    assert.ok(!body.pages!.some(page => page.includes("My deadline")));
    assert.ok(!body.places.some(place => place.includes("My project")));
    const complete = body.commands.find(command => command.name === "complete_tasks")!;
    assert.deepEqual(complete.args.titles.oneOf, ["Private task"]);
    assert.equal(proposalOf(request, { command: "complete_tasks", args: { titles: ["My task"] } }), undefined);
  }
});

test("a live attachment extends its change Home without exposing its neighbors, tasks or Page", () => {
  const { data, agent } = fixture();
  const restricted = { ...agent, tools: { ...agent.tools, "read-notes": false } };
  data.agents = data.agents.map(item => item.id === agent.id ? restricted : item);
  const attached = data.notes[1];
  const request = { data, agent: restricted, attached, request: "Make a task from this" };
  const body = snapshotOf(request, "2026-11-11");
  assert.deepEqual(body.notes, []);
  assert.equal(body.attachedNote?.body, "Attached words");
  assert.deepEqual(body.tasks.map(task => task.title), ["My task"]);
  assert.ok(!body.pages!.some(page => page.includes("Private deadline")));
  assert.ok(body.places.includes("Private / Other project"));
  const proposal = proposalOf(request, { command: "propose_tasks", args: { place: "Private / Other project", tasks: ["Follow up"] } })!;
  admitProposal(data, proposal, agent.id, attached.id);
  assert.throws(() => admitProposal(data, proposal, agent.id, null), /attachment or places changed/);
  for (const archived of ["resource", "project", "domain"] as const) {
    const next = { ...data,
      notes: data.notes.map(note => archived === "resource" && note.id === attached.id ? { ...note, archived: true } : note),
      projects: data.projects.map(project => archived === "project" && project.id === "other" ? { ...project, archived: true } : project),
      domains: data.domains.map(domain => archived === "domain" && domain.name === "Private" ? { ...domain, archived: true } : domain),
    };
    assert.equal(agentWorkspace({ ...request, data: next }).attached, undefined);
    assert.throws(() => admitProposal(next, proposal, agent.id, attached.id), /attachment or places changed/);
  }
});

test("a bound task never retargets a same-title replacement, and one forbidden target rejects the whole proposal", () => {
  const { data, agent } = fixture();
  data.tasks.push({ ...data.tasks[0], id: "second", title: "Second task" });
  const proposal = proposalOf({ data, agent }, { command: "complete_tasks", args: { titles: ["My task", "Second task"] } })!;
  const replaced = { ...data, tasks: data.tasks.map(task => task.id === "mine" ? { ...task, id: "replacement" } : task) };
  assert.throws(() => admitProposal(replaced, proposal, agent.id), /places changed/);
  assert.deepEqual(replaced.tasks.map(task => task.done), [false, false, false]);
  const moved = { ...data, tasks: data.tasks.map(task => task.id === "second" ? { ...task, domain: "Private", projectId: "other" } : task) };
  assert.throws(() => admitProposal(moved, proposal, agent.id), /places changed/);
  const revoked = { ...data, agents: data.agents.map(item => item.id === agent.id ? { ...item, tools: { "add-tasks": false } } : item) };
  assert.throws(() => admitProposal(revoked, proposal, agent.id), /permissions/);
  const legacy = { ...proposal, origin: undefined };
  assert.throws(() => admitProposal(data, legacy, agent.id), /fresh proposal/);
});

test("review admission keeps the originating command's permissions rather than inferring them from a task edit", () => {
  const { data, agent } = fixture();
  const readOnly = { ...agent, tools: { "see-tasks": true, "add-tasks": false } };
  data.agents = data.agents.map(item => item.id === agent.id ? readOnly : item);
  const proposal = proposalOf({ data, agent: readOnly }, { command: "review_changes", args: { complete: ["My task"] } })!;
  admitProposal(data, proposal, agent.id);
  const revoked = { ...data, agents: data.agents.map(item => item.id === agent.id ? { ...readOnly, tools: { "see-tasks": false } } : item) };
  assert.throws(() => admitProposal(revoked, proposal, agent.id), /permissions/);
});

test("calendar handoffs retain task identities and current permissions", () => {
  const { data, agent } = fixture();
  const handoff = handoffOf({ data, agent }, { command: "add_to_calendar", args: { titles: ["My task"] } })!;
  assert.ok(decodeURIComponent(handoff.links[0].href).includes("SUMMARY:My task"));
  admitHandoff(data, handoff, agent.id);
  assert.throws(() => admitHandoff({ ...data, tasks: data.tasks.filter(task => task.id !== "mine") }, handoff, agent.id), /places changed/);
  const revoked = { ...data, agents: data.agents.map(item => item.id === agent.id ? { ...item, access: { calendar: { level: "events" as const, away: false } } } : item) };
  assert.throws(() => admitHandoff(revoked, handoff, agent.id), /permissions/);
});

test("people (D71): whoever looks after a person's domain reads about them and can remember about them; others can't", () => {
  const { data, agent } = fixture();
  const person = (id: string, name: string, domain: string) => ({ id, name, emoji: "", description: "", person: { relation: "Sister", domain, hue: "", dates: [] } });
  data.topics = [person("sofia", "Sofia", "Everyday"), person("ana", "Ana", "Private"), { id: "plain", name: "Plain", emoji: "", description: "" }];
  data.notes.push({ id: "sizes", title: "Sofia's sizes", body: "M", domain: "", projectId: "", topicId: "sofia", updatedAt: "2026-11-11" },
    { id: "ana-note", title: "Ana's plans", body: "Secret", domain: "", projectId: "", topicId: "ana", updatedAt: "2026-11-11" },
    { id: "plain-note", title: "Plain note", body: "Library", domain: "", projectId: "", topicId: "plain", updatedAt: "2026-11-11" });
  const memory = (id: string, topicId: string) => ({ id, domain: "", projectId: "", topicId, text: `About ${topicId}`, quote: "", agentId: "keeper", at: "2026-11-11" });
  data.memories = [memory("m-sofia", "sofia"), memory("m-ana", "ana")];
  const request = { data, agent, request: "Sofia loves ceramics" };
  const body = snapshotOf(request, "2026-11-11");
  assert.deepEqual(body.people?.map((item) => item.name), ["@Sofia"]);
  assert.deepEqual(body.notes.filter((note) => note.place.startsWith("@")).map((note) => [note.title, note.place]), [["Sofia's sizes", "@Sofia"]]);
  assert.ok(!body.notes.some((note) => ["Ana's plans", "Plain note"].includes(note.title)), "another domain's person and a plain topic stay out");
  assert.deepEqual(body.memory?.items.map((item) => item.place), ["@Sofia"]);
  assert.deepEqual(memoriesOf(request, [{ text: "Loves ceramics.", place: "@Sofia", quote: "Sofia loves ceramics" }, { text: "x", place: "@Ana", quote: "Sofia" }])
    .map((draft) => draft.topicId), ["sofia"]);
  const atlas = snapshotOf({ ...request, agent: data.agents[0] }, "2026-11-11");
  assert.deepEqual(atlas.people?.map((item) => item.name), ["@Ana", "@Sofia"], "Atlas reads everyone");
});

test("past 40 memories an agent reads the ones its message matches, and a correction binds to the one it was shown (D80)", () => {
  const { data, agent } = fixture();
  const memory = (id: string, text: string, at: string) => ({ id, domain: "", projectId: "", text, quote: "", agentId: "keeper", at });
  data.memories = [memory("dentist", "The dentist is Dr. Lopes in Benfica", "2026-01-01T00:00:00.000Z"),
    ...Array.from({ length: 45 }, (_, index) => memory(`walk${index}`, `Walked route ${index}`, new Date(Date.UTC(2026, 10, 1) + index * 3_600_000).toISOString()))];
  const request = { data, agent, request: "Book my dentist, he moved to Lisbon centre" };
  const items = snapshotOf(request, "2026-11-25").memory?.items ?? [];
  assert.equal(items.length, 40);
  const shown = items.find((item) => item.text.startsWith("The dentist"));
  assert.ok(shown, "the old memory its message matches is read");
  assert.equal(shown.id, "m40", "newest first, so the oldest comes last");
  assert.deepEqual(memoriesOf(request, [{ text: "The dentist is Dr. Lopes in Lisbon centre", place: "", quote: "he moved to Lisbon centre", replaces: shown.id }])
    .map((draft) => draft.replaces), ["dentist"], "the correction replaces the memory it was shown as m40");
  assert.ok(!snapshotOf({ ...request, request: "Plan a walk" }, "2026-11-25").memory?.items.some((item) => item.text.startsWith("The dentist")),
    "another message reads the newest");
});

test("Google Calendar access (D83): each rung offers its tools, the calendars named, and only while you're here unless it may read while you're away", () => {
  const { data, agent } = fixture();
  const calendarOf = (access: CalendarAccess | undefined, more: { routine?: { kind: "report" }; background?: boolean } = {}) => {
    const body = snapshotOf({ data, agent: { ...agent, access: access && { calendar: access } }, request: "When am I free?", ...more.routine && { routine: more.routine },
      ...more.background && { land: { threadId: "t", messageId: "m", background: true as const } } }, "2026-11-23");
    return [body.tools.filter((tool) => tool === "read_calendar" || tool === "free_time"), body.calendars, !!body.zone,
      body.commands.some((command) => command.name === "add_to_calendar")];
  };
  assert.deepEqual(calendarOf(undefined), [[], undefined, false, false], "a new agent starts off");
  assert.deepEqual(calendarOf({ level: "free", away: false }), [["free_time"], undefined, true, false], "free time never reads titles");
  assert.deepEqual(calendarOf({ level: "events", away: false, calendars: ["work"] }), [["read_calendar", "free_time"], ["work"], true, false]);
  assert.deepEqual(calendarOf({ level: "add", away: false }), [["read_calendar", "free_time"], undefined, true, true], "only Events + Add hands over dates");
  assert.deepEqual(calendarOf({ level: "add", away: false }, { routine: { kind: "report" } })[0], [], "a routine runs while you're away");
  assert.deepEqual(calendarOf({ level: "add", away: false }, { background: true })[0], [], "so does work you hand off");
  assert.deepEqual(calendarOf({ level: "events", away: true }, { routine: { kind: "report" } })[0], ["read_calendar", "free_time"]);
  const atlas = snapshotOf({ data, agent: data.agents[0], request: "Plan my day", routine: { kind: "report" } }, "2026-11-23");
  assert.ok(atlas.tools.includes("read_calendar"), "Atlas starts with all of it, also while you're away");
  const off = snapshotOf({ data, agent: { ...data.agents[0], access: { calendar: { level: "off", away: true } } }, request: "Plan my day" }, "2026-11-23");
  assert.ok(!off.tools.includes("free_time"), "and can be turned off like anyone");
});

test("a chat reply or hand-off whose agent reads files may search a computer (D78); an agent without Read files, or a request that lands nowhere, may not", () => {
  const { data, agent } = fixture();
  const land = { threadId: "t", messageId: "m" };
  const searches = (more: Partial<Parameters<typeof snapshotOf>[0]>, reads = true) =>
    snapshotOf({ data, agent: { ...agent, tools: { ...agent.tools, "read-files": reads } }, request: "Find the bank letter", ...more }, "2026-11-24").tools.includes("search_computer");
  assert.ok(searches({ land }), "a chat reply");
  assert.ok(searches({ land: { ...land, background: true } }), "work handed off");
  assert.ok(!searches({ land }, false), "never an agent without Read files");
  assert.ok(!searches({ routine: { kind: "report" } }), "nor a routine, which has nowhere to move");
  assert.ok(!searches({}), "nor anything else that doesn't land in a chat");
});

test("a reply's project folders go together from every computer they're on, named but not listed, one per name (D77, D84)", () => {
  const { data } = fixture();
  const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" }, laptop = { id: "6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b", name: "Laptop" };
  const folder = (id: string, name: string, computer: typeof office) => ({ id, name, computer, path: `C:\\${name}` });
  const linked = { ...data, projects: [
    { ...data.projects[0], id: "taxes", folder: folder("0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "Taxes", office) },
    { ...data.projects[0], id: "photos", folder: folder("1b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e", "Photos", laptop) },
    { ...data.projects[0], id: "copy", folder: folder("2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f", "taxes", laptop) },
  ] };
  const places = [{ projectId: "taxes", place: "Finance / Taxes" }, { projectId: "photos", place: "Family / Photos" }, { projectId: "copy", place: "Old / Copy" }];
  assert.deepEqual(computerFolders(linked, places), [
    { place: "Finance / Taxes", name: "Taxes", files: [], id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", computer: office },
    { place: "Family / Photos", name: "Photos", files: [], id: "1b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e", computer: laptop },
  ], "the paths start with a folder's name, so a second Taxes stays out; the computers are what they are, never the path");
});

test("the Calendar tool switch becomes Events + Add, also while you're away, once, and Every agent's new agents start without it (D83)", () => {
  const base = normalize(null).data;
  type Old = Agent & { tools: Agent["tools"] & { calendar?: boolean } };
  const old = (id: string, tools: Old["tools"]): Old => ({ ...base.agents[0], id, name: id, tools });
  const loaded = { ...base, agents: [base.agents[0], old("vital", { web: true, calendar: true }), old("kin", { calendar: false }), old("muse", { web: true })] as Agent[],
    everyAgent: { rules: "", tools: { calendar: true, web: true } } as WorkspaceData["everyAgent"] };
  const { data, changes } = normalize(loaded);
  const vital = data.agents.find((item) => item.id === "vital")!, kin = data.agents.find((item) => item.id === "kin")!;
  assert.deepEqual([vital.tools, vital.access], [{ web: true }, { calendar: { level: "add", away: true } }]);
  assert.deepEqual([kin.tools, calendarAccess(kin).level], [{}, "off"]);
  assert.deepEqual(changes.agents?.map((item) => item.id), ["vital", "kin"]);
  assert.deepEqual(data.everyAgent?.tools, { web: true });
  const again = normalize(data).changes;
  assert.equal(again.agents, undefined, "once moved, nothing changes on the next load");
  assert.equal(again.everyAgent, undefined);
});
