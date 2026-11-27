import test from "node:test";
import assert from "node:assert/strict";
import { limits, parseSnapshot } from "../supabase/functions/agent/logic.ts";
import { admitProposal } from "./agentWorkspace.ts";
import { draftsOf, historyOf, snapshotOf } from "./agentRequest.ts";
import { createAgentEngine } from "./atlas.ts";
import { createLiveEngine } from "./live.ts";
import { createBackend } from "./cloud.ts";
import { displayOf, proposalOf, specsOf } from "./commands.ts";
import { seedWorkspace } from "./demo.ts";
import { applyProposal, bringInLead, editDomain, normalize, sendBackLead, undoProposal } from "./workspace.ts";
import { land } from "./proposals.ts";
import { atlasId } from "./model.ts";
import { shownBlocks } from "./blocks.ts";
import type { ChatMessage } from "./model.ts";

function workspace() {
  const data = normalize(null).data;
  const agent = { ...data.agents[0], id: "ledger", name: "Ledger" };
  data.agents.push(agent);
  data.domains.push({ ...data.domains[0], name: "Private", agentId: undefined });
  const [mine, other] = data.domains;
  mine.agentId = agent.id;
  data.projects = [{ id: "tax", title: "Taxes", area: mine.name, description: "", color: "" },
    { id: "secret", title: "Secret", area: other.name, description: "", color: "" }];
  data.tasks = [{ id: "rent", domain: mine.name, projectId: "", title: "Pay rent", done: false, due: "" },
    { id: "theirs", domain: other.name, projectId: "", title: "Pay rent", done: false, due: "" }];
  return { data, agent, mine: mine.name, other: other.name };
}

test("live proposals reach only the agent's places and tasks, and apply and undo like simulated ones", () => {
  const { data, agent, mine, other } = workspace();
  const request = { agent, data };
  assert.deepEqual(snapshotOf({ ...request, request: "Hi" }, "2026-11-05").places, [mine, `${mine} / Taxes`]);
  assert.equal(proposalOf(request, { command: "propose_tasks", args: { place: other, tasks: ["Snoop"] } }), undefined, "outside its scope");
  assert.equal(proposalOf({ agent: { ...agent, tools: { "add-tasks": false } }, data }, { command: "propose_tasks", args: { place: mine, tasks: ["A"] } }), undefined);
  assert.equal(proposalOf(request, { command: "toString", args: {} }), undefined, "only the registry's own commands");
  const added = proposalOf(request, { command: "propose_tasks", args: { place: `${mine} / Taxes`,
    tasks: [{ title: "File return", due: "2026-12-01" }, { title: " " }, { title: "B", due: "soon" }, "C", "D"] } })!;
  assert.deepEqual(added.items.map((task) => [task.title, task.due, task.domain, task.projectId, task.agentId]),
    [["File return", "2026-12-01", mine, "tax", "ledger"], ["B", "", mine, "tax", "ledger"], ["C", "", mine, "tax", "ledger"], ["D", "", mine, "tax", "ledger"]]);
  assert.equal(proposalOf(request, { command: "propose_tasks", args: { place: mine, tasks: Array.from({ length: 10 }, (_, i) => `T${i}`) } })!.items.length, 8, "at most 8 in one go");
  const applied = applyProposal(data, added).data;
  assert.equal(applied.tasks.length, 6);
  assert.equal(undoProposal(applied, added).data.tasks.length, 2);
  const moved = { ...data, projects: data.projects.map((project) => project.id === "tax" ? { ...project, area: data.domains[1].name } : project) };
  assert.throws(() => applyProposal(moved, added), /moved to another domain/);

  const done = proposalOf(request, { command: "complete_tasks", args: { titles: ["pay rent", "Unknown"] } })!;
  assert.deepEqual(done.changes, [{ kind: "complete", taskId: "rent", title: "Pay rent" }], "the other domain's Pay rent stays out of reach");
  const ticked = applyProposal(data, done).data;
  assert.equal(ticked.tasks.find((task) => task.id === "rent")!.done, true);
  assert.equal(undoProposal(ticked, done).data.tasks.find((task) => task.id === "rent")!.done, false);

  const moved2 = proposalOf(request, { command: "reschedule_tasks", args: { tasks: [{ title: "pay rent", due: "2026-11-09" }, { title: "Pay rent", due: "2026-11-12" },
    { title: "Unknown", due: "2026-11-09" }, { title: "Pay rent", due: "soon" }] } })!;
  assert.deepEqual(moved2.changes, [{ kind: "reschedule", taskId: "rent", title: "Pay rent", from: "", to: "2026-11-09" }],
    "one move per task, the first day given; unknown titles and non-dates are dropped");
  const rescheduled = applyProposal(data, moved2).data;
  assert.equal(rescheduled.tasks.find((task) => task.id === "rent")!.due, "2026-11-09");
  assert.equal(undoProposal(rescheduled, moved2).data.tasks.find((task) => task.id === "rent")!.due, "");
  assert.equal(proposalOf(request, { command: "reschedule_tasks", args: { tasks: [{ title: "Pay rent", due: "" }] } }), undefined, "no move, no proposal");
});

test("an agent proposes a project in its own domain with its first tasks and notes, and Undo takes it all back only while untouched (D61)", () => {
  const { data, agent, mine, other } = workspace();
  const request = { agent, data };
  assert.deepEqual(specsOf(request).find((spec) => spec.name === "propose_project")!.args.domain.oneOf, [mine], "only its own domains");
  assert.equal(proposalOf(request, { command: "propose_project", args: { title: "Snoop", domain: other, goal: "x", tasks: ["A"] } }), undefined);
  const args = { title: "Inês's Portuguese assignment", domain: mine, goal: "Hand in the essay by Friday.",
    tasks: [{ title: "Read the brief", due: "2026-11-18" }, "Draft the outline"], notes: [{ title: "Teacher's rubric", body: "Spelling counts." }] };
  const proposal = proposalOf(request, { command: "propose_project", args })!;
  const [project] = proposal.projects!;
  assert.deepEqual([project.title, project.area, project.description, proposal.projectId], [args.title, mine, args.goal, ""], "a project not yet made is no place yet");
  assert.ok([...proposal.items, ...proposal.notes!].every((record) => record.projectId === project.id && record.domain === mine));
  admitProposal(data, proposal, agent.id);
  assert.throws(() => admitProposal({ ...data, domains: data.domains.map((domain) => ({ ...domain, agentId: undefined })) }, proposal, agent.id), /changed/,
    "refused once the agent no longer looks after the domain");
  const applied = applyProposal(data, proposal);
  assert.ok(applied.data.projects.find((item) => item.id === project.id)?.createdAt, "made, with its welcome");
  assert.deepEqual([applied.changes.projects?.length, applied.changes.tasks?.length, applied.changes.notes?.length], [1, 2, 1]);
  assert.equal(applyProposal(applied.data, proposal).changes.projects, undefined, "applying twice makes nothing twice");
  const undone = undoProposal(applied.data, proposal);
  assert.ok(!undone.data.projects.some((item) => item.id === project.id) && undone.changes.deletedProjectIds?.includes(project.id));
  assert.equal(undone.data.tasks.length, data.tasks.length);
  const added = { ...applied.data, tasks: [...applied.data.tasks, { id: "mine", domain: mine, projectId: project.id, title: "Mine", done: false, due: "" }] };
  assert.throws(() => undoProposal(added, proposal), /Something new/, "a task you added keeps the project");
  const again = proposalOf({ agent, data: applied.data }, { command: "propose_project", args: { ...args, title: args.title.toUpperCase(), tasks: ["Print it"] } })!;
  assert.deepEqual([again.projects, again.items[0].projectId], [undefined, project.id], "asked twice, the tasks join the project already there");
});

test("Atlas plants a domain with the project he proposes, its own agent with it, and Undo takes all three back (D61, D51)", () => {
  const { data, agent } = workspace();
  const atlas = { ...data.agents.find((item) => item.id === atlasId)!, writeMode: "full" as const };
  data.agents = data.agents.map((item) => item.id === atlasId ? atlas : item);
  assert.equal(specsOf({ agent, data }).find((spec) => spec.name === "propose_project")!.args.new_domain, undefined, "Atlas's alone");
  const args = { title: "Factory logbook app", new_domain: [{ name: "Clients", emoji: "💼", purpose: "Paid work for clients." }], goal: "Paulo logs faults by voice.",
    tasks: ["Confirm the sections with Paulo"], notes: [{ title: "Paulo's example" }] };
  const proposal = proposalOf({ agent: atlas, data }, { command: "propose_project", args })!;
  const { domain, agent: keeper } = proposal.plant!;
  const [project] = proposal.projects!;
  assert.deepEqual([domain.name, domain.emoji, domain.intention, project.area, proposal.items[0].domain], ["Clients", "💼", "Paid work for clients.", "Clients", "Clients"]);
  assert.ok(keeper && domain.agentId === keeper.id && !data.agents.some((item) => item.name === keeper.name), "a keeper of its own, under a free name");
  assert.ok(!data.domains.some((item) => item.hue === domain.hue), "a colour no domain wears");
  assert.equal(proposalOf({ agent: atlas, data }, { command: "propose_project", args: { ...args, new_domain: [{ name: data.domains[0].name.toUpperCase() }] } })!.projects![0].area,
    data.domains[0].name, "a domain already here is that domain");
  const landed = land({ data, reply: { text: "Here it is.", proposal }, agentId: atlasId });
  assert.equal(landed.messages[0].proposal!.status, "pending", "waits for your OK even when Atlas is proactive, since someone joins");
  assert.throws(() => admitProposal(data, proposal, agent.id), /changed/, "only Atlas plants");
  const applied = applyProposal(data, proposal);
  assert.equal(applied.data.domains.find((item) => item.name === "Clients")?.agentId, keeper.id);
  assert.ok(applied.data.agents.some((item) => item.id === keeper.id) && applied.data.projects.some((item) => item.id === project.id && item.createdAt));
  assert.ok(applied.changes.agents?.some((item) => item.id === keeper.id) && applied.changes.domains?.some((item) => item.name === "Clients") && applied.changes.projects?.length === 1,
    "one changeset saves the agent, the domain and the project");
  const taken = { ...data, domains: [...data.domains, { ...domain, name: "clients", agentId: undefined }] };
  assert.throws(() => applyProposal(taken, proposal), /domain called Clients/, "a domain of that name planted since");
  const undone = undoProposal(applied.data, proposal);
  assert.deepEqual([undone.data.domains.length, undone.data.agents.length, undone.data.projects.length, undone.data.tasks.length],
    [data.domains.length, data.agents.length, data.projects.length, data.tasks.length], "everything back as it was");
  const held = { ...applied.data, tasks: [...applied.data.tasks, { id: "loose", domain: "Clients", projectId: "", title: "Invoice", done: false, due: "" }] };
  assert.throws(() => undoProposal(held, proposal), /Something is already in Clients/, "something you put in the domain keeps it");
});

test("a proposed project names who leads it: a crew member, or a suggested agent who joins with it and leaves on Undo (D61)", () => {
  const { data, agent } = workspace();
  const atlas = { ...data.agents.find((item) => item.id === atlasId)!, writeMode: "full" as const };
  data.agents = data.agents.map((item) => item.id === atlasId ? atlas : item);
  const spec = specsOf({ agent: atlas, data }).find((item) => item.name === "propose_project")!;
  assert.ok(spec.args.lead.oneOf!.includes("Ledger") && spec.args.lead.oneOf!.includes("Forge") && spec.description.includes("Forge (Builder"));
  const args = { title: "Factory logbook app", new_domain: [{ name: "Work", emoji: "💼" }], goal: "Paulo logs faults by voice.", lead: "forge", tasks: ["Confirm the sections"] };
  const proposal = proposalOf({ agent: atlas, data }, { command: "propose_project", args })!;
  const [project] = proposal.projects!;
  assert.ok(proposal.lead?.name === "Forge" && project.agentId === proposal.lead.id && proposal.plant!.domain.agentId !== proposal.lead.id,
    "Forge leads the app, the domain keeps its own keeper");
  const here = proposalOf({ agent: atlas, data }, { command: "propose_project", args: { ...args, new_domain: undefined, domain: data.domains[0].name } })!;
  assert.equal(land({ data, reply: { text: "Here.", proposal: here }, agentId: atlasId }).messages[0].proposal!.status, "pending",
    "waits for your OK even when Atlas is proactive, since someone joins");
  const applied = applyProposal(data, proposal);
  const forge = applied.data.agents.find((item) => item.name === "Forge")!;
  assert.equal(applied.data.projects.find((item) => item.id === project.id)!.agentId, forge.id);
  assert.ok(applied.changes.agents?.some((item) => item.id === forge.id), "saved with the project");
  assert.throws(() => applyProposal({ ...data, agents: [...data.agents, { ...forge, id: "other" }] }, proposal), /called Forge/, "a Forge joined since");
  const undone = undoProposal(applied.data, proposal);
  assert.ok(!undone.data.agents.some((item) => item.name === "Forge") && undone.changes.deletedAgentIds?.includes(forge.id), "the newcomer leaves with it");
  const busy = { ...applied.data, projects: applied.data.projects.map((item) => item.id === "tax" ? { ...item, agentId: forge.id } : item) };
  assert.ok(undoProposal(busy, proposal).data.agents.some((item) => item.id === forge.id), "one who took other work stays");

  const crew = proposalOf({ agent: atlas, data }, { command: "propose_project", args: { ...args, new_domain: undefined, domain: data.domains[0].name, lead: "Ledger" } })!;
  assert.deepEqual([crew.projects![0].agentId, crew.lead], [agent.id, undefined], "a crew member leads by name, nobody joins");

  const brought = bringInLead(data, "tax", { ...forge, id: "f2" });
  assert.equal(brought.data.projects.find((item) => item.id === "tax")!.agentId, "f2");
  const sent = sendBackLead(brought.data, "tax", "f2", undefined);
  assert.deepEqual([sent.data.projects.find((item) => item.id === "tax")!.agentId, sent.data.agents.length], [undefined, data.agents.length], "the crew menu's Undo");
});

test("a whole project moves to another domain with everything in it, into a domain Atlas plants for it, and Undo moves it back (D61)", () => {
  const { data, agent, mine, other } = workspace();
  data.tasks.push({ id: "file", domain: mine, projectId: "tax", title: "File the return", done: false, due: "" });
  data.notes = [{ id: "receipts", domain: mine, projectId: "tax", title: "Receipts", body: "", linkedProjectIds: [], updatedAt: "" }, ...data.notes];
  assert.equal(proposalOf({ agent, data }, { command: "move_tasks", args: { projects: [{ project: `${mine} / Taxes`, domain: other }] } }), undefined,
    "only between domains the agent looks after");
  const atlas = data.agents.find((item) => item.id === atlasId)!;
  const proposal = proposalOf({ agent: atlas, data }, { command: "move_tasks", args: { projects: [{ project: `${mine} / Taxes` }], new_domain: [{ name: "Work", emoji: "💼" }] } })!;
  assert.deepEqual([proposal.plant?.domain.name, proposal.changes], ["Work", [{ kind: "rehome", projectId: "tax", title: "Taxes", from: mine, to: "Work" }]]);
  admitProposal(data, proposal, atlasId);
  const applied = applyProposal(data, proposal);
  assert.deepEqual([applied.data.projects.find((item) => item.id === "tax")?.area, applied.data.tasks.find((item) => item.id === "file")?.domain,
    applied.data.notes.find((item) => item.id === "receipts")?.domain], ["Work", "Work", "Work"], "its tasks and notes go along");
  assert.equal(applied.data.tasks.find((item) => item.id === "rent")?.domain, mine, "the domain's own tasks stay");
  assert.equal(applyProposal(applied.data, proposal).data.domains.length, applied.data.domains.length, "applying twice plants once");
  const undone = undoProposal(applied.data, proposal);
  assert.deepEqual([undone.data.projects.find((item) => item.id === "tax")?.area, undone.data.tasks.find((item) => item.id === "file")?.domain,
    undone.data.domains.length, undone.data.agents.length], [mine, mine, data.domains.length, data.agents.length], "back where it was, the domain and its keeper gone");
  const alone = proposalOf({ agent: atlas, data }, { command: "move_tasks", args: { new_domain: [{ name: "Garden" }] } })!;
  assert.deepEqual([alone.plant?.domain.name, alone.changes], ["Garden", []], "a domain on its own when that's all you asked");
  assert.ok(applyProposal(data, alone).data.domains.some((item) => item.name === "Garden"));
});

test("tasks move to another place or into a project made with them, and sorting a capture fills new projects (D61)", () => {
  const { data, agent, mine } = workspace();
  const request = { agent, data };
  const moved = proposalOf(request, { command: "move_tasks", args: { tasks: [{ title: "pay rent", place: `${mine} / Taxes` }] } })!;
  assert.deepEqual(moved.changes, [{ kind: "move", taskId: "rent", title: "Pay rent", from: { domain: mine, projectId: "" }, to: { domain: mine, projectId: "tax" } }]);
  const there = applyProposal(data, moved).data;
  assert.equal(there.tasks.find((task) => task.id === "rent")!.projectId, "tax");
  assert.equal(undoProposal(there, moved).data.tasks.find((task) => task.id === "rent")!.projectId, "");
  assert.equal(proposalOf(request, { command: "move_tasks", args: { tasks: [{ title: "Pay rent", place: mine }] } }), undefined, "already there, no proposal");
  const grouped = proposalOf(request, { command: "move_tasks", args: { new_project: [{ title: "Home admin", domain: mine }],
    tasks: [{ title: "Pay rent", place: mine, project: "home admin" }] } })!;
  const [home] = grouped.projects!;
  const regrouped = applyProposal(data, grouped).data;
  assert.equal(regrouped.tasks.find((task) => task.id === "rent")!.projectId, home.id);
  const back = undoProposal(regrouped, grouped).data;
  assert.deepEqual([back.tasks.find((task) => task.id === "rent")!.projectId, back.projects.some((item) => item.id === home.id)], ["", false]);

  const capture = { id: "dump", domain: mine, projectId: "", title: "Dump", body: "sidebar bug; braindump in capture; pay tax", linkedProjectIds: [], updatedAt: "2026-11-17T09:00:00.000Z" };
  const sorting = { agent, data: { ...data, notes: [capture] }, attached: capture };
  assert.ok(!specsOf(sorting).find((spec) => spec.name === "sort_capture")!.args.domains, "only Atlas suggests domains");
  const sorted = proposalOf(sorting, { command: "sort_capture", args: {
    projects: [{ title: "Atlaswork", domain: mine, goal: "Ship the app." }, { title: "Unused", domain: mine }],
    tasks: [{ title: "Fix sidebar", place: mine, project: "Atlaswork" }, { title: "Capture braindump", place: mine, project: "atlaswork" }, { title: "Pay tax", place: `${mine} / Taxes` }],
    domains: [{ name: "Learning" }] } })!;
  assert.deepEqual(sorted.projects!.map((project) => project.title), ["Atlaswork"], "a named project nothing went into isn't made");
  assert.deepEqual(sorted.items.map((task) => task.projectId), [sorted.projects![0].id, sorted.projects![0].id, "tax"]);
  assert.equal(sorted.domains, undefined);
});

test("a project with a deadline counts down to it, the planning commands wait for their lookups, and a review files loose tasks (D61)", () => {
  const { data, agent, mine } = workspace();
  const request = { agent, data };
  const dated = proposalOf(request, { command: "propose_project", args: { title: "Essay", domain: mine, goal: "Two pages.", finish: "2026-11-27", tasks: ["Draft"] } })!;
  const [countdown] = dated.projects![0].widgets!;
  assert.deepEqual([countdown.type, countdown.date, !!countdown.since], ["countdown", "2026-11-27", true], "its page has a finish line with a start");
  assert.equal(proposalOf(request, { command: "propose_project", args: { title: "Essay", domain: mine, goal: "x", finish: "soon", tasks: ["A"] } })!.projects![0].widgets, undefined);
  const specs = specsOf(request);
  for (const [name, after] of [["propose_project", "plan_project"], ["move_tasks", "plan_moves"], ["review_changes", "list_tasks"]])
    assert.equal(specs.find((spec) => spec.name === name)!.after, after, `${name} is offered only after ${after}`);
  const withGoal = { ...data, projects: data.projects.map((project) => project.id === "tax" ? { ...project, description: "Filed by April." } : project) };
  assert.match(specsOf({ agent, data: withGoal }).find((spec) => spec.name === "propose_project")!.lookup!.result, /Taxes \(Filed by April\.\)/);
  assert.ok(snapshotOf({ agent, data: withGoal, request: "Hi" }, "2026-11-17").pages!.some((line) => line.startsWith(`${mine} / Taxes, for “Filed by April.”`)),
    "a project's goal reaches the prompt under its place's name, even when its page shows nothing");
  const review = specsOf(request).find((spec) => spec.name === "review_changes")!;
  assert.deepEqual([review.args.file.fields!.title.oneOf, review.args.file.fields!.project.oneOf], [["Pay rent"], [`${mine} / Taxes`]]);
  const filed = proposalOf(request, { command: "review_changes", args: { file: [{ title: "Pay rent", project: `${mine} / Taxes` }] } })!;
  assert.deepEqual(filed.changes, [{ kind: "move", taskId: "rent", title: "Pay rent", from: { domain: mine, projectId: "" }, to: { domain: mine, projectId: "tax" } }]);
});

test("an agent's own warmth and detail win over every agent's, which win over Even and Balanced; the shared rules ride along trimmed", () => {
  const { data, agent } = workspace();
  const sent = (everyAgent?: typeof data.everyAgent, own = {}) =>
    parseSnapshot(JSON.stringify(snapshotOf({ agent: { ...agent, ...own }, data: { ...data, everyAgent }, request: "Hi" }, "2026-11-07")))!;
  assert.deepEqual([sent().agent.warmth, sent().agent.detail, sent().everyAgent], ["Even", "Balanced", undefined]);
  const every = { rules: "  Prices in euros.  ", warmth: 0, detail: 3 };
  assert.deepEqual([sent(every).agent.warmth, sent(every).agent.detail, sent(every).everyAgent], ["Crisp", "Thorough", "Prices in euros."]);
  assert.deepEqual([sent(every, { warmth: 4 }).agent.warmth, sent(every, { warmth: 4 }).agent.detail], ["Warm", "Thorough"]);
  assert.equal(sent({ rules: "x".repeat(limits.everyAgent + 50) }).everyAgent?.length, limits.everyAgent, "never more than the function accepts");
});

test("an agent proposes a page only with Arrange pages on, and Undo refuses once the page changed", () => {
  const { data, agent, mine } = workspace();
  assert.ok(!specsOf({ agent, data }).some((spec) => spec.name === "arrange_page"), "Arrange pages starts off");
  const atlas = { ...data.agents[0], tools: { "arrange-pages": false } };
  assert.ok(specsOf({ agent: atlas, data }).some((spec) => spec.name === "arrange_page"), "Atlas can always arrange pages, whatever is stored");
  const bench = { ...agent, id: "bench", tools: { "arrange-pages": true } };
  assert.deepEqual(specsOf({ agent: bench, data: { ...data, agents: [...data.agents, bench] } }).map((spec) => spec.name),
    ["complete_tasks", "reschedule_tasks", "plan_day", "review_changes", "propose_my_setup", "ask_agent", "offer_choices"],
    "an agent without places is offered nothing that needs one, though it may still change how it works (D69), ask another agent or offer answers to tap");
  const arranger = { ...agent, tools: { "arrange-pages": true } };
  const request = { agent: arranger, data };
  assert.match(specsOf(request).find((spec) => spec.name === "arrange_page")!.lookup!.result, new RegExp(`${mine} \\(goal: The ordinary, good stuff\\.\\): projects \\(projects, pace, full\\); tasks`));
  assert.equal(proposalOf({ agent, data }, { command: "arrange_page", args: { place: mine, blocks: ["tasks"] } }), undefined);
  assert.equal(proposalOf(request, { command: "arrange_page", args: { place: mine, blocks: ["projects", "tasks", "resources"] } }), undefined, "no change, no proposal");
  const page = proposalOf(request, { command: "arrange_page", args: { place: mine, blocks: [{ block: "tasks", view: "when", width: "wide" },
    { block: "nonsense" }, { block: "tasks", view: "first" }, { block: "new:projects", view: "tiles", width: "narrow" }, { block: "new:tracker" },
    { block: "resources", view: "bogus" }] } })!;
  const [change] = page.changes!;
  assert.ok(change.kind === "page");
  assert.deepEqual(change.to.map(({ id: _id, ...block }) => block), [{ type: "tasks", view: "when", width: "wide" },
    { type: "projects", view: "tiles", width: "narrow" }, { type: "resources" }], "unknown ids, repeats, data widgets and bad views are dropped");
  assert.equal(change.from, null);
  const applied = applyProposal(data, page);
  assert.deepEqual(applied.data.domains[0].widgets, change.to);
  assert.ok(applied.changes.domains, "the domain list is saved");
  assert.equal(undoProposal(applied.data, page).data.domains[0].widgets, undefined, "undo goes back to following the default");
  const edited = editDomain(applied.data, mine, { widgets: [{ id: "resources", type: "resources" }] }).data;
  assert.throws(() => undoProposal(edited, page), /edited since/);
  assert.throws(() => applyProposal(editDomain(data, mine, { name: "Renamed" }).data, page), /changed after/);
  // A widget name stands for its first unused block, or a new one when the page has none; an older function sends tokens.
  const named = proposalOf(request, { command: "arrange_page", args: { place: `${mine} / Taxes`, blocks: ["tasks@when", "projects@tiles", "resources"] } })!;
  const placed = named.changes![0];
  assert.ok(placed.kind === "page");
  assert.deepEqual(placed.to.map((block) => [block.id.split("-")[0], block.view]), [["tasks", "when"], ["projects", "tiles"], ["resources", undefined]]);
  assert.notEqual(placed.to[1].id, "projects", "the project page had no projects block, so one is added");
});

test("rearranging a page keeps what its blocks logged meanwhile, through apply and undo", () => {
  const { data, mine } = workspace();
  const sleep = { id: "sleep", type: "tracker" as const, title: "Sleep", entries: [{ date: "2026-11-01", value: 7 }] };
  const before = editDomain(data, mine, { widgets: [sleep, { id: "tasks", type: "tasks" }] }).data;
  const page = proposalOf({ agent: before.agents[0], data: before }, { command: "arrange_page", args: { place: mine, blocks: ["tasks@week", "sleep@bars#half"] } })!;
  const applied = applyProposal(before, page).data;
  const logged = editDomain(applied, mine, { widgets: applied.domains[0].widgets!.map((block) => block.id === "sleep"
    ? { ...block, entries: [...block.entries!, { date: "2026-11-02", value: 8 }] } : block) }).data;
  const undone = undoProposal(logged, page).data.domains[0].widgets!;
  assert.deepEqual(undone.map((block) => [block.id, block.view, block.width]), [["sleep", undefined, undefined], ["tasks", undefined, undefined]]);
  assert.equal(undone[0].entries!.length, 2, "the entry logged after Apply survives Undo");
});

test("an agent's arrangement never sees or drops a put-away widget, even when undone back to the default", () => {
  const { data, mine } = workspace();
  const sleep = { id: "sleep", type: "tracker" as const, removed: "2026-11-01", entries: [{ date: "2026-10-31", value: 7 }] };
  const before = editDomain(data, mine, { widgets: [{ id: "projects", type: "projects", view: "tiles" }, { id: "tasks", type: "tasks" }, { id: "resources", type: "resources" }, sleep] }).data;
  const spec = specsOf({ agent: before.agents[0], data: before }).find((item) => item.name === "arrange_page")!;
  assert.doesNotMatch(spec.description, /sleep/, "put-away widgets aren't offered to the agent");
  const page = proposalOf({ agent: before.agents[0], data: before }, { command: "arrange_page", args: { place: mine, blocks: ["tasks@when", "sleep"] } })!;
  const [change] = page.changes!;
  assert.ok(change.kind === "page");
  assert.deepEqual(change.to.map((block) => block.id), ["tasks"], "naming a put-away id doesn't bring it back");
  const applied = applyProposal(before, page).data;
  assert.deepEqual(applied.domains[0].widgets!.at(-1), sleep, "still put away after Apply");
  assert.deepEqual(undoProposal(applied, page).data.domains[0].widgets!.at(-1), sleep, "still put away after Undo");
});

test("an agent's arrangement puts away a data widget it leaves out, and Undo shows it again", () => {
  const { data, mine } = workspace();
  const sleep = { id: "sleep", type: "tracker" as const, title: "Sleep", entries: [{ date: "2026-11-01", value: 7 }] };
  const before = editDomain(data, mine, { widgets: [sleep, { id: "tasks", type: "tasks" }] }).data;
  const page = proposalOf({ agent: before.agents[0], data: before }, { command: "arrange_page", args: { place: mine, blocks: ["tasks@week"] } })!;
  const applied = applyProposal(before, page).data.domains[0].widgets!;
  assert.deepEqual(applied.map((block) => [block.id, !!block.removed]), [["tasks", false], ["sleep", true]]);
  assert.deepEqual(applied[1].entries, sleep.entries, "what it logged is kept");
  const undone = undoProposal(applyProposal(before, page).data, page).data.domains[0].widgets!;
  assert.deepEqual(undone.map((block) => [block.id, !!block.removed]), [["sleep", false], ["tasks", false]]);
});

test("an agent sets up data widgets from its settings, placed by title, with no numbers logged; Undo puts them away", () => {
  const { data, mine } = workspace();
  const request = { agent: data.agents[0], data };
  const spec = specsOf(request).find((item) => item.name === "arrange_page")!;
  assert.equal(spec.after, "list_pages", "the larger schema waits for list_pages");
  const page = proposalOf(request, { command: "arrange_page", args: { place: mine,
    blocks: [{ block: "new:Weight", width: "wide" }, { block: "tasks" }, { block: "Race day" }, { block: "new:tasks" }, { block: "new:goals" }, { block: "new:Race kit checklist" }],
    trackers: [{ title: "Weight", unit: "kg", target: "78 kg", better: "down" }, { title: "weight" }],
    goals: [{ title: "Savings", target: "5,000", unit: "€", by: "2099-03-01" }, { title: "Vague", target: "a lot" }],
    countdowns: [{ title: "Race day", date: "2099-04-12" }, { title: "Gone", date: "2000-01-01" }],
    habits: [{ title: "Stretch" }],
    milestones: [{ title: "Training" }],
    checklists: [{ title: "Race kit" }],
    items: [{ text: "First 5K", widget: "Training", date: "2099-01-10" }, { text: "Undated", widget: "training" }, { text: "Shoes", widget: "Race kit" }] } })!;
  const [change] = page.changes!;
  assert.ok(change.kind === "page");
  const today = new Date().toLocaleDateString("en-CA");
  assert.deepEqual(change.to.map(({ id: _id, ...block }) => block), [
    { type: "tracker", title: "Weight", width: "wide", unit: "kg", target: 78, better: "down" },
    { type: "tasks" },
    { type: "countdown", title: "Race day", width: "narrow", date: "2099-04-12", since: today },
    { type: "tasks" },
    { type: "goal", title: "Savings", width: "narrow", unit: "€", target: 5000, current: 0, date: "2099-03-01" },
    { type: "checklist", title: "Race kit", width: "half", items: [{ text: "Shoes", done: false }] },
    { type: "habit", title: "Stretch", width: "half" },
    { type: "milestones", title: "Training", width: "half", steps: [{ title: "First 5K", date: "2099-01-10", done: false }] },
  ], "placed by title, list name or a name holding the title, the rest after; repeats, goals without a number, past dates and undated steps make nothing; new:tasks stays a tasks block");
  const applied = applyProposal(data, page).data;
  assert.deepEqual(shownBlocks(applied.domains[0].widgets!).map((block) => block.type), change.to.map((block) => block.type));
  const undone = undoProposal(applied, page).data.domains[0].widgets!;
  assert.deepEqual(undone.filter((block) => block.removed).map((block) => block.title), ["Weight", "Race day", "Savings", "Race kit", "Stretch", "Training"],
    "Undo puts what it set up away, so anything logged meanwhile can come back");
});

test("an agent offers answers to tap and shows live widgets and tasks from its own places, only to the person (D64)", () => {
  const { data: base, agent, mine, other } = workspace();
  const data = editDomain(editDomain(base, mine, { widgets: [{ id: "sleep", type: "tracker", title: "Sleep", unit: "h" }, { id: "tasks", type: "tasks" }] }).data,
    other, { widgets: [{ id: "hidden", type: "habit", title: "Hidden" }] }).data;
  const request = { agent: { ...agent, tools: { "see-tasks": true } }, data };
  const offered = specsOf(request).map((spec) => spec.name);
  assert.ok(offered.includes("offer_choices") && offered.includes("show_widgets"));
  assert.ok(!specsOf({ ...request, asked: { by: "Atlas" } }).some((spec) => spec.name === "offer_choices" || spec.name === "show_widgets"),
    "another agent's question gets neither: only the person taps or logs");
  assert.deepEqual(specsOf({ ...request, routine: { kind: "report" } }).filter((spec) => spec.shows).map((spec) => spec.name), ["show_widgets"],
    "a routine's report may show a widget, never offer answers nobody is there to tap");
  assert.deepEqual(displayOf(request, { command: "offer_choices", args: { options: [" Saturday ", "Sunday", "Saturday", ""] } }), { choices: ["Saturday", "Sunday"] });
  assert.equal(displayOf(request, { command: "offer_choices", args: { options: ["Only one"] } }), undefined, "one answer is no choice");
  assert.deepEqual(displayOf(request, { command: "show_widgets", args: { widgets: [{ title: "sleep" }, { title: "Hidden" }], tasks: ["Pay rent"] } }),
    { blocks: [{ place: `area:${mine}`, id: "sleep" }], taskIds: ["rent"] }, "its own widget and its own task of that title, never another place's");
  const landed = land({ data, reply: { text: "Which day?", display: { choices: ["Saturday", "Sunday"] } }, agentId: agent.id });
  assert.deepEqual(landed.messages, [{ text: "Which day?", display: { choices: ["Saturday", "Sunday"] } }]);
  // The function returns a reply's proposal and its show apart; both land on one message.
  const drafts = draftsOf({ ...request, request: "How's my sleep?" }, [{ command: "propose_tasks", args: { place: mine, tasks: ["Log sleep"] } }, { command: "show_widgets", args: { widgets: [{ title: "Sleep" }] } }]);
  assert.ok(drafts.proposal && drafts.display);
  const both = land({ data, reply: { text: "Here's your sleep.", ...drafts }, agentId: agent.id }).messages[0];
  assert.ok(both.proposal && both.display?.blocks?.[0].id === "sleep");
  // The next turn knows what the reply showed and what was tapped.
  const history: ChatMessage[] = [{ id: "a", role: "agent", agentId: agent.id, text: "Here's your sleep.", display: { blocks: [{ place: `area:${mine}`, id: "sleep" }], taskIds: ["rent"] } },
    { id: "b", role: "agent", agentId: agent.id, text: "Which day?", display: { choices: ["Saturday", "Sunday"], picked: "Sunday" } }];
  assert.deepEqual(historyOf({ agent, data, history }).map((turn) => turn.text), [
    `Here's your sleep.\n[In this reply you showed Sleep (tracker, ${mine}); showed tasks: Pay rent.]`,
    "Which day?\n[In this reply you offered answers: Saturday / Sunday; the person tapped “Sunday”.]"]);
});

test("history keeps the latest 12 messages within about 6,000 characters and names other agents", () => {
  const { data, agent } = workspace();
  const say = (text: string, from?: string): ChatMessage => ({ id: text, role: from ? "agent" : "user", agentId: from, text });
  const history = [say("old"), ...Array.from({ length: 12 }, (_, i) => say(`m${i}`)), say("mine", "ledger"), say("hers", "atlas")];
  const turns = historyOf({ agent, data, history });
  assert.equal(turns.length, 12);
  assert.deepEqual(turns.slice(-2), [{ role: "assistant", text: "mine" }, { role: "user", text: "Atlas said: hers" }]);
  const long = historyOf({ agent, data, history: [say("a".repeat(4000)), say("b".repeat(4000)), say("c")] });
  assert.deepEqual(long.map((turn) => turn.text[0]), ["b", "c"]);
  // Earlier turns keep their start, the latest go whole (D66): every round of every reply sends them again.
  const clipped = historyOf({ agent, data, history: [say("x".repeat(1000)), ...["p", "q", "r", "s"].map((letter) => say(letter.repeat(1000)))] });
  assert.deepEqual(clipped.map((turn) => turn.text.length), [limits.olderTurn + 1, 1000, 1000, 1000, 1000]);
});

test("the function accepts what the browser sends, even from a workspace past its limits", async (t) => {
  const data = seedWorkspace();
  const atlas = data.agents.find((agent) => agent.id === "atlas")!;
  const domain = data.domains[0].name;
  const note = { ...data.notes.find((item) => !item.archived && !item.topicId && (item.kind ?? "note") === "note")!, id: "long", body: "x".repeat(25_000) };
  const tasks = Array.from({ length: 320 }, (_, i) => ({ id: `t${i}`, title: i === 319 ? "y".repeat(1_500) : `Task ${i}`, domain, projectId: "", done: false, due: "" }));
  const big = { ...data, notes: [...data.notes, note], tasks: [...data.tasks, ...tasks] };
  const sent = (request: Parameters<typeof snapshotOf>[0]) => parseSnapshot(JSON.stringify(snapshotOf(request, "2026-11-07")));
  const everything = sent({ agent: atlas, data, request: "Hi" })!;
  assert.deepEqual(everything.commands.map((command) => command.name), specsOf({ agent: atlas, data }).map((spec) => spec.name), "every command passes the function's checks");
  const fitted = sent({ agent: atlas, data: big, attached: note, request: "Hi" })!;
  assert.ok(fitted, "a 25,000-character note, 320 open tasks and a long task title still make a valid request");
  assert.equal(fitted.tasks.length, limits.items);
  assert.equal(fitted.tasks.at(-1)!.title.length, limits.title, "the newest tasks are the ones kept");
  assert.equal(fitted.attachedNote!.body.length, limits.text);
  const fetched = t.mock.method(globalThis, "fetch", async () => Response.json({ text: "Hi" }));
  await assert.rejects(createAgentEngine(createLiveEngine(createBackend({ url: "https://x.test", key: "pk" }, async () => "jwt")))
    .reply({ agent: atlas, data, request: "z".repeat(limits.request + 1) }), /up to 4,000 characters/);
  assert.equal(fetched.mock.callCount(), 0, "an over-long message is refused before it's sent");
});

test("page lines say what each block shows today, only for pages in the agent's scope", () => {
  const { data, agent, mine, other } = workspace();
  data.projects[0].widgets = [{ id: "d", type: "countdown", title: "Deadline", date: "2026-11-15", since: "2026-11-01" },
    { id: "c", type: "checklist", title: "Documents", items: [{ text: "Receipts", done: true }, { text: "Statements", done: false }] },
    { id: "m", type: "milestones", steps: [{ title: "Draft", date: "2026-11-10", done: false }] }, { id: "t", type: "tasks" },
    { id: "x", type: "goal", title: "Saved", unit: "€", current: 100, target: 600, removed: "2026-11-02" }];
  data.projects[1].widgets = [{ id: "s", type: "countdown", title: "Secret day", date: "2026-12-01" }];
  data.domains[0].widgets = [{ id: "h", type: "habit", title: "Filed", days: ["2026-11-03", "2026-11-06", "2026-10-01"] }];
  const body = snapshotOf({ agent, data, request: "Hi" }, "2026-11-07");
  assert.deepEqual(body.pages, [`${mine}: Filed: 2 of the last 7 days`,
    `${mine} / Taxes: Deadline: in 8 days (2026-11-15); Documents: 1 of 2 ticked, open: Statements; milestones: 0 of 1 reached, next "Draft" on 2026-11-10`]);
  assert.ok(!JSON.stringify(body).includes("Secret day") && !JSON.stringify(body).includes(other), "pages outside the scope stay out");
  const parsed = parseSnapshot(JSON.stringify(body))!;
  assert.deepEqual(parsed.pages, body.pages);
});

test("the live engine sends the account's token, streams progress, returns the proposal and surfaces refusals", async (t) => {
  const { data, agent, mine } = workspace();
  const headers: string[] = [];
  let next: Response;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    headers.push((init.headers as Record<string, string>).Authorization);
    return next;
  });
  let signedIn = true;
  const engine = createAgentEngine(createLiveEngine(createBackend({ url: "https://x.test", key: "pk" }, async () => {
    if (!signedIn) throw new Error("You're signed out. Sign in again from Settings → Account.");
    return "jwt";
  })));
  const steps: string[] = [];
  const turn = { agent, data, request: "Plan taxes", onProgress: (step: string) => steps.push(step) };
  next = new Response(`{"progress":"Reading notes"}\n{"text":"Here.","proposal":{"command":"propose_tasks","args":{"place":"${mine}","tasks":["File"]}}}\n`);
  const reply = await engine.reply(turn);
  assert.deepEqual([reply.text, reply.proposal?.items.map((task) => task.title), steps, headers], ["Here.", ["File"], ["Reading notes"], ["Bearer jwt"]]);
  next = Response.json({ error: "Live agents are part of Pro." }, { status: 403 });
  await assert.rejects(engine.reply(turn), /part of Pro/);
  signedIn = false;
  await assert.rejects(engine.reply(turn), /signed out/, "a signed-out account says so instead of a generic failure");
  signedIn = true;
  const emailer = { ...agent, tools: { email: true } };
  next = new Response(`{"text":"Drafted.","proposal":{"command":"draft_email","args":{"subject":"Rent","body":"Hi Bob"}},"usage":{"input":1200,"output":80,"peak":900}}\n`);
  const drafted = await engine.reply({ ...turn, agent: emailer, request: "Email Bob about rent" });
  assert.deepEqual([drafted.proposal, drafted.handoff?.links[0].label, drafted.usage], [undefined, "Open the draft", { input: 1200, output: 80, peak: 900 }],
    "a mail draft comes back as a link, with the tokens the reply used");
});

test("a chat reply the function holds as a job comes back as what it landed, or as on its way when the connection drops (D76)", async (t) => {
  const { data, agent } = workspace();
  let next: Response;
  t.mock.method(globalThis, "fetch", async () => next);
  const engine = createAgentEngine(createLiveEngine(createBackend({ url: "https://x.test", key: "pk" }, async () => "jwt")));
  const turn = { agent, data, request: "Plan taxes", land: { threadId: "agent:ledger", messageId: "m1" } };
  const landed = { puts: [["message:agent:ledger:a1", { thread: "agent:ledger", n: 1, message: { id: "a1", role: "agent", text: "Here." } }]], deletes: [] };
  next = new Response(`{"job":"j1"}\n{"progress":"Reading notes"}\n${JSON.stringify({ landed })}\n`);
  assert.deepEqual(await engine.reply(turn), { text: "", landed }, "what landed, for the page to take in, and nothing to post");
  next = new Response(`{"job":"j1"}\n${JSON.stringify({ error: "Ledger couldn't answer: busy.", landed })}\n`);
  assert.deepEqual(await engine.reply(turn), { text: "", landed, failed: "Ledger couldn't answer: busy." }, "a failure the function landed on your message");
  let started = false;
  const dropped = new ReadableStream({ pull(controller) {
    if (started) return controller.error(new TypeError("network error"));
    started = true;
    controller.enqueue(new TextEncoder().encode(`{"job":"j1"}\n{"progress":"Reading notes"}\n`));
  } });
  next = new Response(dropped);
  assert.deepEqual(await engine.reply(turn), { text: "", onItsWay: true }, "the job lands whatever became of the connection");
  next = new Response(new ReadableStream({ start(controller) { controller.error(new TypeError("network error")); } }));
  await assert.rejects(engine.reply(turn), /connection dropped/, "before the function took it, a drop is a failure here");
});

test("a chat reply whose connection failed is on its way when the function holds its job, and fails here otherwise (D76)", async () => {
  const { data, agent } = workspace();
  const reads: string[] = [];
  let jobs: Record<string, unknown>[] = [];
  const engine = createAgentEngine(createLiveEngine({
    agent: async () => { throw new Error("You seem to be offline."); },
    read: async (path) => { reads.push(path); return jobs; },
  }));
  const turn = { agent, data, request: "Plan taxes", land: { threadId: "agent:ledger", messageId: "m1" } };
  for (const [job, held] of [
    [{ state: "running", runs_on: "server" }, true], [{ state: "waiting", runs_on: "server" }, true], [{ state: "done", runs_on: "server" }, true],
    [{ state: "waiting", runs_on: "computer:c1" }, true], [{ state: "running", runs_on: "computer:c1" }, true],
    [{ state: "waiting", runs_on: "device:n1" }, false], [{ state: "failed", runs_on: "server" }, false], [undefined, false],
  ] as const) {
    jobs = job ? [job] : [];
    if (held) assert.deepEqual(await engine.reply(turn), { text: "", onItsWay: true }, `a ${job?.state} job lands by itself`);
    else await assert.rejects(engine.reply(turn), /couldn't answer/, `${job ? `a ${job.state} job on ${job.runs_on}` : "no job"}: it failed`);
  }
  assert.ok(reads.every((path) => path.includes("message_id=eq.m1") && path.includes("created_at=gte.")), "only this message's jobs since it asked");
  const asked = reads.length;
  await assert.rejects(engine.reply({ agent, data, request: "Plan taxes" }), /couldn't answer/);
  assert.equal(reads.length, asked, "a reply with nowhere to land (a routine, an asked agent) has no job to look for");
});

test("a chat reply asked in the desktop app's window carries that start's key, and work handed off from there doesn't (D78)", async () => {
  const { data, agent } = workspace();
  const bodies: string[] = [];
  const at = { computer: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", key: "ab".repeat(32) };
  const reply = (here: () => Promise<typeof at | undefined>) => createAgentEngine(createLiveEngine({
    agent: async (body) => { bodies.push(body); return new Response(`${JSON.stringify({ text: "Here." })}\n`); },
  }, undefined, here));
  const land = { threadId: "agent:ledger", messageId: "m1" };
  await reply(async () => at).reply({ agent, data, request: "Show me the letter", land });
  await reply(async () => at).reply({ agent, data, request: "Show me the letter", land: { ...land, background: true } });
  await reply(async () => undefined).reply({ agent, data, request: "Show me the letter", land });
  await reply(async () => at).reply({ agent, data, request: "Show me the letter" });
  const heres = bodies.map((body) => JSON.parse(body).land?.here);
  assert.deepEqual(heres, [at, undefined, undefined, undefined], "only a chat reply asked in a paired app's window, never a hand-off, a browser or a reply with nowhere to land");
});

test("a reply that pauses for files runs them on this device and resumes with their text, adding up both legs' tokens", async (t) => {
  const { data, agent, mine } = workspace();
  const bodies: string[] = [];
  const legs = [
    `{"progress":"Reading a file"}\n{"pending":[{"id":"r","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"Taxes/a.md\\"}"}}],`
      + `"turns":[{"role":"assistant","content":"","tool_calls":[{"id":"r","type":"function","function":{"name":"read_file","arguments":"{\\"path\\":\\"Taxes/a.md\\"}"}}]}],"resume":"token.sig","usage":{"input":1000,"output":20,"peak":1000}}\n`,
    `{"text":"It says hi.","usage":{"input":1500,"output":30,"peak":1500}}\n`];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return new Response(legs.shift());
  });
  const asked: { places: unknown; calls: string[] } = { places: undefined, calls: [] };
  const folders = { forReply: async (places: { projectId: string; place: string }[]) => {
    asked.places = places;
    return { folders: [{ place: places[0].place, name: "Taxes", files: ["Taxes/a.md"] }], run: async (call: { function: { arguments: string } }) => {
      asked.calls.push(call.function.arguments);
      return "Taxes/a.md:\nhi";
    } };
  } };
  const engine = createAgentEngine(createLiveEngine(createBackend({ url: "https://x.test", key: "pk" }, async () => "jwt")), folders);
  const reply = await engine.reply({ agent, data, request: "What does a.md say?" });
  assert.deepEqual(asked, { places: [{ projectId: "tax", place: `${mine} / Taxes` }], calls: ['{"path":"Taxes/a.md"}'] });
  const [first, second] = bodies.map((body) => parseSnapshot(body));
  assert.deepEqual(first?.folders, [{ place: `${mine} / Taxes`, name: "Taxes", files: ["Taxes/a.md"] }]);
  assert.deepEqual(second?.turns?.at(-1), { role: "tool", tool_call_id: "r", content: "Taxes/a.md:\nhi" }, "the resumed request passes the function's checks");
  assert.equal(second?.resume, "token.sig", "the paused leg's token goes back, so the leg isn't counted again");
  assert.deepEqual([reply.text, reply.usage], ["It says hi.", { input: 2500, output: 50, peak: 1500 }]);
  asked.calls = [];
  await engine.reply({ agent: { ...agent, tools: { "read-files": false } }, data, request: "Hi" }).catch(() => undefined);
  assert.equal(parseSnapshot(bodies[2])?.folders, undefined, "without Read files no folder is listed");
});

test("a folder on one of the account's computers goes named with a chat reply or a hand-off, in place of this device's links, never its path (D77)", async (t) => {
  const { data, agent, mine } = workspace();
  const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" };
  const folder = { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", computer: office, name: "Taxes", path: "C:\\Users\\Ana\\Documents\\Taxes" };
  const linked = { ...data, projects: data.projects.map((project) => project.id === "tax" ? { ...project, folder } : project) };
  const bodies: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    bodies.push(String(init.body));
    return new Response(`{"job":"j1"}\n`);
  });
  let asked = 0;
  const device = [{ place: `${mine} / Taxes`, name: "Mine", files: ["Mine/a.md"] }];
  const engine = createAgentEngine(createLiveEngine(createBackend({ url: "https://x.test", key: "pk" }, async () => "jwt")),
    { forReply: async () => { asked++; return { folders: device, run: async () => "" }; } });
  const land = { threadId: "agent:ledger", messageId: "m1" };
  await engine.reply({ agent, data: linked, request: "When does it renew?", land });
  await engine.reply({ agent, data: linked, request: "When does it renew?", land: { ...land, background: true } });
  await engine.reply({ agent, data: linked, request: "When does it renew?" }).catch(() => undefined);
  const [reply, handoff, elsewhere] = bodies.map((body) => parseSnapshot(body)?.folders);
  const named = [{ place: `${mine} / Taxes`, name: "Taxes", files: [], id: folder.id, computer: office }];
  assert.deepEqual(reply, named, "a chat reply names it, for its job to move there");
  assert.deepEqual(handoff, named, "and so does a hand-off");
  assert.deepEqual([elsewhere, asked], [device, 1], "a request with nowhere to land (a routine, a dialog) can't move, so this device's links go");
  assert.ok(bodies.every((body) => !body.includes("Documents")), "where it is on that computer stays there");
});
