import test from "node:test";
import assert from "node:assert/strict";
import { addressees, contextOf, crewOf, membersOf, nearestThread, presenceOf, scopeOf, sees } from "./agents.ts";
import { seedWorkspace } from "./demo.ts";
import type { ChatMessage } from "./model.ts";
import { applyProposal, createAgent, createTeam, deleteAgent, deleteTeam, editAgent, editDomain, editProject, editTeam, normalize, placesOf, saveThread, setAgentArchived, undoProposal } from "./workspace.ts";
import { inVoice, tonePreview } from "./atlas.ts";
import { handoffOf, proposalOf, specsOf } from "./commands.ts";
import { icsOf } from "./commands/links.ts";
import { newRoutine, routineRequest } from "./routines.ts";

// Demo seed: Everyday has no agent (Atlas answers); its "home-office" project is Hearth's, with the Home front team
// (Hearth, Ledger). Health is Vital's, with "demo-strength" assigned to Vital alone. Family is Kin's;
// "demo-family-visit" has Kin plus the Wellbeing crew (Vital, Kin, Muse).
const data = normalize(seedWorkspace()).data;
const project = (id: string) => data.projects.find((item) => item.id === id)!;
const ids = (agents: { id: string }[]) => agents.map((agent) => agent.id);

test("a crew is the assigned agent, then the team lead-first, then the domain's agent, without repeats", () => {
  assert.deepEqual(ids(crewOf(data, project("home-office"))), ["hearth", "ledger"]);
  assert.deepEqual(ids(crewOf(data, project("demo-family-visit"))), ["kin", "vital", "muse"]);
  assert.deepEqual(ids(crewOf(data, project("demo-strength"))), ["vital"]);
});

test("chat opens to the nearest owner, and follows archiving and team removal", () => {
  assert.equal(nearestThread(data, "Everyday", "home-office"), "room:home-office");
  assert.equal(nearestThread(data, "Health", "demo-strength"), "agent:vital");
  assert.equal(nearestThread(data, "Everyday"), "agent:atlas");
  assert.equal(nearestThread(data, "Health"), "agent:vital");
  // Archiving Ledger leaves Hearth alone on the team: Hearth's own thread.
  assert.equal(nearestThread(setAgentArchived(data, "ledger", true).data, "Everyday", "home-office"), "agent:hearth");
  // Without its team the project keeps its assigned agent, who now answers alone.
  assert.equal(nearestThread(deleteTeam(data, "home-front").data, "Everyday", "home-office"), "agent:hearth");
  assert.throws(() => setAgentArchived(data, "atlas", true), /Atlas stays/);
});

test("team rooms and rooms you start list their members; @mentions pick who answers", () => {
  assert.deepEqual(ids(membersOf(data, "team:launch-squad")), ["spark", "compass", "quill", "forge"]);
  const started = saveThread(data, { id: "chat:x", title: "Weekend", memberIds: ["muse", "kin", "gone"], messages: [], read: 0, attachedNoteId: null }).data;
  assert.deepEqual(ids(membersOf(started, "chat:x")), ["muse", "kin"]);
  const crew = crewOf(data, project("home-office"));
  assert.deepEqual(ids(addressees("@Ledger then @hearth, thoughts?", crew)), ["ledger", "hearth"]);
  assert.deepEqual(ids(addressees("what next?", crew)), ["hearth"]);
  assert.deepEqual(ids(addressees("@Ledgers is not a name", crew)), ["hearth"]);
});

test("scope comes from assignments: domains, assigned projects, and team projects; Atlas sees everything", () => {
  const officeNote = data.notes.find((note) => note.projectId === "home-office")!;
  const visitNote = data.notes.find((note) => note.projectId === "demo-family-visit")!;
  assert.ok(sees(scopeOf(data, "hearth"), officeNote));
  assert.ok(!sees(scopeOf(data, "vital"), officeNote));
  assert.ok(sees(scopeOf(data, "muse"), visitNote));
  assert.ok(sees(scopeOf(data, "atlas"), officeNote));
});

test("presence: working beats waiting on you; approvals, then a question, then a failed reply or missing tool", () => {
  const quiet = { thinking: {}, errors: {} };
  const vital = { ...data.agents.find((agent) => agent.id === "vital")!, routines: [] };
  const say = (text: string, extra: object = {}) => ({ id: text, role: "agent", agentId: "vital", text, ...extra }) as ChatMessage;
  const world = (...messages: ChatMessage[]) =>
    ({ ...data, agents: data.agents.map((agent) => agent.id === "vital" ? vital : agent),
      threads: [{ id: "agent:vital", messages, read: 0, attachedNoteId: null }] });
  assert.equal(presenceOf(world(say("All set.")), vital, quiet).kind, "idle");
  assert.deepEqual(presenceOf(world(say("Is Friday still on? ")), vital, quiet), { kind: "question", text: "Is Friday still on?" });
  // A question you already answered no longer waits on you.
  assert.equal(presenceOf(world(say("Friday?"), { id: "u", role: "user", text: "Yes" }), vital, quiet).kind, "idle");
  const pending = say("Proposed", { proposal: { status: "pending" } });
  assert.deepEqual(presenceOf(world(pending, pending, say("Friday?")), vital, quiet), { kind: "approval", count: 2 });
  assert.equal(presenceOf(world(pending), vital, { thinking: { "room:x": vital }, errors: {} }).kind, "working");
  assert.deepEqual(presenceOf(world(), vital, { thinking: {}, errors: { "agent:vital": "offline" } }), { kind: "stuck", reason: "Couldn't reply" });
  const blind = { ...vital, tools: { "see-tasks": false }, routines: [newRoutine("report", "")] };
  assert.deepEqual(presenceOf(world(), blind, quiet), { kind: "stuck", reason: "Needs See tasks" });
  assert.equal(presenceOf(world(), { ...blind, routines: [{ ...newRoutine("report", ""), paused: true }] }, quiet).kind, "idle");
});

test("an agent's context comes from measured replies: a new session starts its counts, and only its replies count", () => {
  const vital = data.agents.find((agent) => agent.id === "vital")!;
  const thread = { id: "agent:vital", read: 0, attachedNoteId: null, messages: [
    { id: "1", role: "user", text: "Hi" }, { id: "2", role: "agent", agentId: "vital", text: "Hello", usage: { input: 3000, output: 100, peak: 2000 } },
    { id: "3", role: "user", text: "And?" }, { id: "4", role: "agent", agentId: "kin", text: "Me too", usage: { input: 9000, output: 900 } },
    { id: "5", role: "agent", agentId: "vital", text: "Older, unmeasured" },
  ] as ChatMessage[] };
  const whole = contextOf(vital, thread, 0);
  assert.deepEqual([whole.last, whole.sessionIn, whole.sessionOut, whole.replies, whole.unmeasured], [2000, 3000, 100, 2, 1],
    "the window is the largest single call, not the sum over calls");
  const fresh = contextOf(vital, thread, 2);
  assert.deepEqual([fresh.last, fresh.sessionIn, fresh.totalIn], [0, 0, 3000], "an earlier session's reply counts in the total only");
});

test("the demo seed's conversations read in time order, so sessions and History span forward", () => {
  for (const thread of data.threads) {
    const times = thread.messages.map((message) => message.at).filter(Boolean);
    assert.deepEqual(times, [...times].sort(), `${thread.id} has messages out of time order`);
  }
});

test("a review proposal ticks off and reschedules only open tasks the agent sees; undo refuses once a task changed", () => {
  const now = new Date();
  const today = now.toLocaleDateString("en-CA");
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toLocaleDateString("en-CA");
  const late = { id: "late", domain: "Health", projectId: "", title: "Late thing", done: false, due: yesterday };
  const world = { ...data, tasks: [...data.tasks, late] };
  const vital = world.agents.find((agent) => agent.id === "vital")!;
  const proposal = proposalOf({ agent: vital, data: world }, { command: "review_changes", args: {
    complete: ["Book blood work", "Not a task"], reschedule: [{ title: "Late thing", due: today }, { title: "Book blood work", due: today }] } })!;
  assert.deepEqual(proposal.changes!.map((change) => [change.kind, change.title]), [["complete", "Book blood work"], ["reschedule", "Late thing"]],
    "a task being ticked off isn't also moved, and unknown titles are dropped");
  const applied = applyProposal(world, proposal).data;
  assert.equal(applied.tasks.find((task) => task.title === "Book blood work")!.done, true);
  assert.equal(applied.tasks.find((task) => task.id === "late")!.due, today);
  const { updatedAt: _stamp, ...restored } = undoProposal(applied, proposal).data.tasks.find((task) => task.id === "late")!;
  assert.deepEqual(restored, late);
  const edited = { ...applied, tasks: applied.tasks.map((task) => task.id === "late" ? { ...task, due: "2099-01-01" } : task) };
  assert.throws(() => undoProposal(edited, proposal), /edited since/);
});

test("a review offers to archive a project only when neither its resources nor its tasks were touched lately", () => {
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * 864e5).toISOString();
  const world = { ...data, projects: [...data.projects, { id: "p", title: "Old idea", area: "Health", description: "", color: "pine" }],
    notes: [...data.notes, { id: "n", domain: "Health", projectId: "p", title: "Sketch", body: "", updatedAt: ago(100) }],
    tasks: [...data.tasks, { id: "t", domain: "Health", projectId: "p", title: "Done thing", done: true, due: "", updatedAt: ago(100) }] };
  const vital = world.agents.find((agent) => agent.id === "vital")!;
  const quiet = (input: typeof world, quietDays?: number) => specsOf({ agent: vital, data: input, routine: quietDays ? { kind: "review", quietDays } : undefined })
    .find((spec) => spec.name === "review_changes")!.args.archive.oneOf;
  assert.deepEqual(quiet(world), ["Old idea"]);
  assert.deepEqual(quiet(world, 120), [], "a routine's own threshold applies");
  assert.deepEqual(quiet({ ...world, tasks: world.tasks.map((task) => task.id === "t" ? { ...task, updatedAt: ago(1) } : task) }), []);
  const proposal = proposalOf({ agent: vital, data: world }, { command: "review_changes", args: { archive: ["Old idea"] } })!;
  assert.deepEqual(proposal.changes, [{ kind: "archive", projectId: "p", title: "Old idea", quietDays: 100 }]);
});

test("sorting a capture is offered only with one attached, spans places with tasks and notes, and undoes both until edited", () => {
  const atlas = data.agents.find((agent) => agent.id === "atlas")!;
  const capture = { id: "dump", domain: "Everyday", projectId: "", title: "Call the dentist friday", body: "Idea: a reading nook", updatedAt: "2026-11-16T08:00:00.000Z" };
  const world = { ...data, notes: [...data.notes, capture] };
  assert.ok(!specsOf({ agent: atlas, data: world }).some((spec) => spec.name === "sort_capture"), "nothing to sort without an attachment");
  const spec = specsOf({ agent: atlas, data: world, attached: capture }).find((item) => item.name === "sort_capture")!;
  assert.ok(["Everyday", "Health"].every((name) => spec.args.tasks.fields!.place.oneOf!.includes(name)), "Atlas sorts into every domain");
  const proposal = proposalOf({ agent: atlas, data: world, attached: capture }, { command: "sort_capture", args: {
    tasks: [{ title: "Call the dentist", place: "Health", due: "2026-11-20" }, { title: "Lost", place: "Nowhere" }],
    notes: [{ title: "Reading nook", place: "Everyday", body: "By the window" }],
    domains: [{ name: "Learning", emoji: "📚", purpose: "Courses" }, { name: "health" }] } })!;
  assert.deepEqual(proposal.domains, [{ name: "Learning", emoji: "📚", intention: "Courses" }], "a domain to plant is only suggested, never one already planted");
  assert.deepEqual(proposal.items.map((task) => [task.title, task.domain, task.due]), [["Call the dentist", "Health", "2026-11-20"]], "an unknown place is dropped");
  assert.deepEqual(proposal.notes!.map((note) => [note.title, note.domain, note.body]), [["Reading nook", "Everyday", "By the window"]]);
  const applied = applyProposal(world, proposal).data;
  assert.ok(applied.tasks.some((task) => task.id === proposal.items[0].id) && applied.notes.some((note) => note.id === proposal.notes![0].id));
  const undone = undoProposal(applied, proposal).data;
  assert.ok(!undone.tasks.some((task) => task.id === proposal.items[0].id) && !undone.notes.some((note) => note.id === proposal.notes![0].id));
  const edited = { ...applied, notes: applied.notes.map((note) => note.id === proposal.notes![0].id ? { ...note, body: "Mine now" } : note) };
  assert.throws(() => undoProposal(edited, proposal), /notes has been edited/);
});

test("archiving remembers where an agent worked; restoring returns them to the places still free", () => {
  const archived = setAgentArchived(data, "vital", true).data;
  assert.deepEqual(placesOf(archived, "vital"), { domains: [], projectIds: [], teamIds: [] });
  // Meanwhile someone else takes Health.
  const takenHealth = editAgent(archived, "muse", {}, { add: { domains: ["Health"] } }).data;
  const back = setAgentArchived(takenHealth, "vital", false).data;
  assert.deepEqual(placesOf(back, "vital"), { domains: [], projectIds: ["demo-strength"], teamIds: ["wellbeing-crew"] });
  assert.equal(back.domains.find((domain) => domain.name === "Health")!.agentId, "muse");
  assert.equal(back.agents.find((agent) => agent.id === "vital")!.restore, undefined);
});

test("saving an agent with places takes them over in one changeset and never empties a team", () => {
  const juniper = { id: "juniper", name: "Juniper", portrait: "chef", role: "", instructions: "", writeMode: "full" as const };
  const { data: next, changes } = createAgent(data, juniper,
    { domains: ["Everyday", "Health"], projectIds: ["demo-strength"], teamIds: ["home-front"] });
  assert.deepEqual(placesOf(next, "juniper"), { domains: ["Everyday", "Health"], projectIds: ["demo-strength"], teamIds: ["home-front"] });
  // Vital loses Health and the project; Hearth still leads Home front, whose project Juniper now sees.
  assert.deepEqual(placesOf(next, "vital").domains, []);
  assert.deepEqual(next.teams.find((team) => team.id === "home-front")!.memberIds, ["hearth", "ledger", "juniper"]);
  assert.deepEqual(changes.projects?.map((item) => item.id), ["demo-strength"]);
  assert.ok(scopeOf(next, "juniper").projects.has("home-office"));
  // Taking them off leaves the places empty rather than handing them back.
  const back = editAgent(next, juniper.id, {}, { remove: placesOf(next, juniper.id) }).data;
  assert.deepEqual(placesOf(back, "juniper"), { domains: [], projectIds: [], teamIds: [] });
  assert.equal(back.domains.find((domain) => domain.name === "Health")!.agentId, undefined);
  const solo = { ...data, teams: [{ id: "solo", name: "Solo", purpose: "", memberIds: ["muse"] }] };
  assert.throws(() => editAgent(solo, "muse", {}, { remove: { teamIds: ["solo"] } }), /left with nobody/);
});

test("Agent profile and individual tool edits preserve current assignments, archive state and restore places", () => {
  let current = editAgent(data, "vital", { tools: { web: true } }).data;
  current = editProject(current, "home-office", { agentId: "vital" }).data;
  current = editDomain(current, "Health", { agentId: "muse" }).data;
  const edited = editAgent(current, "vital", { name: "Vital renamed", tools: { email: true } }).data;
  assert.deepEqual(placesOf(edited, "vital"), placesOf(current, "vital"));
  assert.equal(edited.domains.find((domain) => domain.name === "Health")!.agentId, "muse");
  assert.deepEqual(edited.agents.find((agent) => agent.id === "vital")!.tools,
    { ...data.agents.find((agent) => agent.id === "vital")!.tools, web: true, email: true }, "earlier tool switches are kept");
  const moved = editAgent(edited, "vital", {}, { add: { domains: ["Career"] }, remove: { projectIds: ["demo-strength"] } }).data;
  assert.ok(placesOf(moved, "vital").projectIds.includes("home-office"), "an unrelated new assignment survives");
  assert.ok(!placesOf(moved, "vital").projectIds.includes("demo-strength"));
  assert.deepEqual(placesOf(moved, "vital").domains, ["Career"]);
  const archived = setAgentArchived(moved, "vital", true).data;
  const renamed = editAgent(archived, "vital", { role: "Updated profile" }).data;
  const agent = renamed.agents.find((item) => item.id === "vital")!;
  assert.equal(agent.archived, true);
  assert.deepEqual(agent.restore, archived.agents.find((item) => item.id === "vital")!.restore);
  assert.deepEqual(placesOf(renamed, "vital"), { domains: [], projectIds: [], teamIds: [] });
  assert.throws(() => editAgent(renamed, "vital", {}, { add: { domains: ["Health"] } }), /Restore this agent/);
  const gone = deleteAgent(renamed, "vital").data;
  assert.throws(() => editAgent(gone, "vital", { name: "Late edit" }), /agent no longer exists/);
  assert.throws(() => editAgent(gone, "vital", {}), /agent no longer exists/);
  assert.throws(() => createAgent(data, data.agents[0]), /already exists/);
  assert.throws(() => editAgent(data, "vital", {}, { add: { projectIds: ["missing"] } }), /place no longer exists/);
});

test("Team profile edits preserve changed membership and refuse deleted Teams or unavailable members", () => {
  const archived = setAgentArchived(data, "ledger", true).data;
  const edited = editTeam(archived, "home-front", { name: "Home together" }).data;
  assert.deepEqual(edited.teams.find((team) => team.id === "home-front")!.memberIds, ["hearth"]);
  const gone = deleteTeam(edited, "home-front").data;
  assert.throws(() => editTeam(gone, "home-front", { purpose: "Late edit" }), /team no longer exists/);
  assert.throws(() => editTeam(gone, "home-front", {}), /team no longer exists/);
  assert.throws(() => editTeam(archived, "home-front", { memberIds: ["hearth", "ledger"] }), /member no longer exists or is archived/);
  assert.throws(() => editTeam(data, "home-front", { memberIds: [] }), /at least one agent/);
  const draft = { id: "new-team", name: "  New team  ", purpose: "  Work together  ", memberIds: ["atlas", "atlas", "muse"] };
  const created = createTeam(data, draft).data;
  assert.deepEqual(created.teams.find((team) => team.id === draft.id), { ...draft, name: "New team", purpose: "Work together", memberIds: ["atlas", "muse"] });
  assert.throws(() => createTeam(created, draft), /already exists/);
  assert.throws(() => createTeam(data, { ...draft, memberIds: ["missing"] }), /member no longer exists/);
});

test("personality shapes how an agent speaks; the default sounds as agents always did", () => {
  const more = ["Second.", "Third.", "Fourth."];
  assert.equal(inVoice({}, "First.", more), "First. Second. Third.");
  assert.equal(inVoice({ warmth: 0, detail: 0 }, "First.", more), "First.");
  assert.equal(inVoice({ warmth: 4, detail: 3 }, "First.", more), "Hi there! First. Second. Third. Fourth. You've got this 🌱");
  assert.equal(inVoice({ warmth: 4 }, "From “Plan”:", [], false), "Hi there! From “Plan”:");
});

test("the tone preview says a tool that's off in the agent's own words", () => {
  const vital = data.agents.find((agent) => agent.id === "vital")!;
  assert.match(tonePreview(vital, data), /open task/);
  assert.match(tonePreview({ ...vital, tools: { "see-tasks": false } }, data), /I can't see tasks right now\. Turn on “See tasks”/);
});

test("outside tools are offered only when on, and their drafts become links you open yourself", () => {
  const vital = data.agents.find((agent) => agent.id === "vital")!;
  const names = (agent: typeof vital) => specsOf({ agent, data }).map((spec) => spec.name);
  assert.ok(!names(vital).some((name) => ["draft_email", "add_to_calendar", "search_web"].includes(name)), "outside tools start off");
  const open = { ...vital, tools: { web: true, email: true }, access: { calendar: { level: "add" as const, away: false } } };
  assert.ok(["draft_email", "add_to_calendar", "search_web"].every((name) => names(open).includes(name)));
  const link = (command: string, args: Record<string, unknown>) => handoffOf({ agent: open, data }, { command, args })?.links[0];
  assert.equal(link("search_web", { query: "stretching routines" })!.href, "https://duckduckgo.com/?q=stretching%20routines");
  assert.ok(link("draft_email", { to: "rui@example.com", subject: "The Algarve photos", body: "Hi Rui" })!.href
    .startsWith("mailto:rui@example.com?subject=The%20Algarve%20photos&body=Hi%20Rui"));
  assert.ok(link("draft_email", { to: "not an address", subject: "S", body: "B" })!.href.startsWith("mailto:?subject="), "a bad address is left out");
  const dated = data.tasks.filter((task) => !task.done && task.due && sees(scopeOf(data, "vital"), task));
  const calendar = link("add_to_calendar", { titles: [...dated.map((task) => task.title), "Not a task"] })!;
  assert.equal(calendar.download, "tasks.ics");
  assert.equal(decodeURIComponent(calendar.href).match(/BEGIN:VEVENT/g)!.length, dated.length);
  assert.equal(handoffOf({ agent: vital, data }, { command: "search_web", args: { query: "x" } }), undefined, "a tool that's off yields nothing");
});

test("calendar files escape text and use all-day dates", () => {
  const ics = icsOf([{ id: "t1", domain: "", projectId: "", title: "Call Sofia; bring cake, candles", done: false, due: "2026-10-21" }],
    new Date("2026-10-20T09:30:00.123Z"));
  assert.ok(ics.includes("DTSTAMP:20261020T093000Z\r\nDTSTART;VALUE=DATE:20261021\r\nSUMMARY:Call Sofia\\; bring cake\\, candles\r\n"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
});

test("a check-in asks about the places it checks in on: their nearest owner's when it keeps one, else Atlas's; nowhere means no model call", () => {
  const routine = newRoutine("check-in", "");
  const ask = (from: typeof data, id: string) => routineRequest(from, { routine, owner: { kind: "agent", id } }) ?? "";
  // The Wellbeing crew (Vital, Kin, Muse) shares "demo-family-visit"; its nearest owner is the crew's first member.
  const visit = data.projects.find((project) => project.id === "demo-family-visit")!;
  const first = crewOf(data, visit)[0].id;
  const others = crewOf(data, visit).slice(1).map((agent) => agent.id);
  const place = new RegExp(`${visit.area} / ${visit.title}`);
  assert.match(ask(data, "atlas"), place, "nobody in the crew keeps a check-in, so Atlas's covers the visit (agents-design D68)");
  const checking = { ...data, agents: data.agents.map((agent) => agent.id === first ? { ...agent, routines: [routine] } : agent) };
  assert.match(ask(checking, first), place);
  assert.doesNotMatch(ask(checking, "atlas"), new RegExp(visit.title), `Atlas leaves the visit to ${first}`);
  for (const id of others) assert.doesNotMatch(ask(checking, id), new RegExp(visit.title), `${id} leaves the visit to ${first}`);
  const benched = { ...data, agents: [...data.agents, { ...data.agents[0], id: "bench", name: "Bench" }] };
  assert.equal(routineRequest(benched, { routine, owner: { kind: "agent", id: "bench" } }), null);
  assert.match(routineRequest(data, { routine: newRoutine("report", ""), owner: { kind: "agent", id: "bench" } }) ?? "", /everything you look after/);
});
