import test from "node:test";
import assert from "node:assert/strict";
import { parseSnapshot } from "../supabase/functions/agent/logic.ts";
import { draftsOf, snapshotOf } from "./agentRequest.ts";
import { proposalOf, specsOf } from "./commands.ts";
import { amendedProposal, domainRequest, filledDomain, filledProject, projectRequest, reviewable, reviewForm, unfilledDomain, unfilledProject } from "./formFill.ts";
import { atlasId } from "./model.ts";
import { addSteps } from "./starterProjects.ts";
import { applyProposal, normalize, saveDraft } from "./workspace.ts";
import type { DomainForm, ProjectForm } from "./ui.ts";

const today = "2026-11-18";
const since = "2026-11-18T09:00:00.000Z";

function workspace() {
  const data = normalize(null).data;
  const agent = { ...data.agents[0], id: "vital", name: "Vital", archived: false };
  data.agents.push(agent);
  data.domains.push({ ...data.domains[0], name: "Health", emoji: "🌿", agentId: agent.id });
  const form: ProjectForm = { project: { id: "p1", title: "", area: "Health", description: "", color: "pine", agentId: agent.id }, finish: { date: "2026-12-18", today } };
  return { data, agent, form };
}

test("a dialog's request offers its fill command alone, remembers nothing, and fits the function (D63)", () => {
  const { data, agent, form } = workspace();
  const request = { agent, data, request: projectRequest(form, "2026-12-18", data, "Run a 10k in March"), form: { kind: "project" as const, editing: false } };
  assert.deepEqual(specsOf(request).map((spec) => spec.name), ["fill_project"]);
  assert.ok(!specsOf({ agent, data }).some((spec) => spec.name.startsWith("fill_")), "chat never gets a fill command");
  const snapshot = snapshotOf(request, today);
  assert.equal(snapshot.memory?.listening, false);
  assert.doesNotThrow(() => parseSnapshot(JSON.parse(JSON.stringify(snapshot))));
  assert.match(request.request, /In my words: “Run a 10k in March”[\s\S]*Done by: 2026-12-18[\s\S]*Leads it: Vital/);
  assert.deepEqual(draftsOf(request, [{ command: "propose_tasks", args: { place: "Health", tasks: ["A"] } }]), {}, "a form request makes no proposal");
  assert.deepEqual(draftsOf({ ...request, form: { kind: "domain", editing: false } }, [{ command: "fill_project", args: { title: "X" } }]), {}, "only the asking dialog's fill");
});

test("a project fill lands in the form, lights up what it changed, and Undo takes back only that (D63)", () => {
  const { data, agent, form } = workspace();
  const request = { agent, data, request: "", form: { kind: "project" as const, editing: false } };
  const { fill } = draftsOf(request, [{ command: "fill_project", args: { title: "First 10K", goal: "Run 10 km without stopping.", domain: "health",
    finish: "none", color: "clay", lead: "nobody", steps: [{ title: "Run 2 km", due: "2026-11-20" }, { title: "Buy shoes" }, { title: " " }],
    routines: ["report", "report", "dance"], assumed: [{ what: "no race date", field: "finish" }, { what: "beginner pace", field: "pace" }, { what: " " }] } }]);
  assert.ok(fill?.kind === "project");
  assert.deepEqual(fill, { kind: "project", title: "First 10K", description: "Run 10 km without stopping.", area: "Health", finish: "", color: "clay", agentId: null,
    steps: [{ title: "Run 2 km", due: "2026-11-20" }, { title: "Buy shoes", due: "" }], routines: ["report"],
    assumed: [{ what: "no race date", field: "finish" }, { what: "beginner pace" }] }, "an assumption about an unknown field keeps its words");
  const next = filledProject(form, fill, today, since, 1);
  assert.deepEqual([next.project.title, next.project.color, next.project.agentId, next.finish, next.steps?.length], ["First 10K", "clay", undefined, { date: "", today }, 2]);
  assert.deepEqual(next.filled, { at: 1, fields: ["title", "goal", "finish", "lead", "colour", "steps", "routines"] }, "the domain stayed Health, so it isn't lit");
  assert.equal(filledProject(next, { kind: "project", steps: [], routines: ["report"], assumed: [] }, today, since).project.routines?.length, 1, "a kind it runs isn't added twice");
  assert.equal(draftsOf(request, [{ command: "fill_project", args: { assumed: [{ what: "nothing" }] } }]).fill, undefined, "a fill that changes nothing isn't one");

  const edited = { ...next, project: { ...next.project, title: "My 10K" } };
  const undone = unfilledProject(edited, form, next);
  assert.deepEqual([undone.project.title, undone.project.color, undone.project.agentId, undone.finish, undone.steps, undone.filled],
    ["My 10K", "pine", agent.id, form.finish, undefined, undefined], "your own edit since the fill stays");
});

test("filled steps land in the project: their own day, else the next days up to the finish line (D63)", () => {
  const { data, form } = workspace();
  const saved = saveDraft(data, { kind: "project", ...form, project: { ...form.project, title: "First 10K" }, finish: { date: "2026-11-25", today } });
  const added = addSteps(saved, "p1", [{ title: "Run 2 km", due: "2026-11-20" }, { title: "Buy shoes", due: "" }, { title: "Rest", due: "" }], today);
  assert.deepEqual(added.data.tasks.filter((task) => task.projectId === "p1").map((task) => [task.title, task.due]),
    [["Run 2 km", "2026-11-20"], ["Buy shoes", "2026-11-24"], ["Rest", "2026-11-25"]]);
  assert.equal(added.changes.tasks?.length, 3);
});

test("a domain fill names it and picks who looks after it: a new agent worded for it, a crew member, or nobody new when editing (D63)", () => {
  const { data, agent } = workspace();
  const draft: DomainForm = { domain: { name: "", emoji: "🌱", hue: "", intention: "" }, keeper: { since } };
  const request = { agent: data.agents.find((item) => item.id === atlasId)!, data, request: domainRequest(draft, data, "my piano practice"), form: { kind: "domain" as const, editing: false } };
  assert.ok(specsOf(request)[0].args.looked_after_by.oneOf!.includes("new"));
  const rules = "Coach daily piano practice: suggest one short focused exercise at a time, ask what felt hard, and never shame a skipped day.";
  const { fill } = draftsOf(request, [{ command: "fill_domain", args: { name: "Music", emoji: "🎹", purpose: "Playing most days.", colour: "Sky", looked_after_by: "new",
    agent_role: "Piano practice coach", agent_rules: rules, routines: ["check-in"], assumed: [{ what: "a coach of its own", field: "keeper" }] } }]);
  assert.ok(fill?.kind === "domain");
  const hired = filledDomain(draft, fill, since, 2);
  assert.deepEqual([hired.domain.name, hired.domain.emoji, hired.domain.intention, hired.keeper, hired.domain.routines?.map((routine) => routine.kind)],
    ["Music", "🎹", "Playing most days.", { since, fresh: true, role: "Piano practice coach", instructions: rules }, ["check-in"]]);
  assert.deepEqual(hired.filled, { at: 2, fields: ["name", "emoji", "purpose", "colour", "keeper", "routines"] });
  const planted = saveDraft(data, { kind: "domain", ...hired });
  const keeper = planted.data.agents.find((item) => item.id === planted.data.domains.find((domain) => domain.name === "Music")!.agentId)!;
  assert.deepEqual([keeper.role, keeper.instructions], ["Piano practice coach", rules], "the new agent is the one the fill worded");
  assert.deepEqual(unfilledDomain({ ...hired, domain: { ...hired.domain, name: "Piano" } }, draft, hired), { ...draft, domain: { ...draft.domain, name: "Piano" } },
    "Undo keeps the name you typed since and takes back the rest");

  const crew = filledDomain(draft, { kind: "domain", steward: agent.id, routines: [], assumed: [] }, since);
  assert.deepEqual([crew.keeper, crew.domain.agentId], [undefined, agent.id]);
  const health = data.domains.find((domain) => domain.name === "Health")!;
  const editing = { ...request, form: { kind: "domain" as const, editing: true } };
  assert.ok(!specsOf(editing)[0].args.looked_after_by.oneOf!.includes("new") && !specsOf(editing)[0].args.agent_role);
  assert.equal(draftsOf(editing, [{ command: "fill_domain", args: { looked_after_by: "new" } }]).fill, undefined);
  assert.deepEqual(filledDomain({ original: health, domain: health }, { kind: "domain", steward: "new", routines: [], intention: "Sleep well.", assumed: [] }, since).domain,
    { ...health, intention: "Sleep well." }, "an existing domain hires nobody");
});

test("a new domain's fill hires the suggested agent whose work fits, whatever the domain is called, and its snapshot fits the function (D63)", () => {
  const { data } = workspace();
  const draft: DomainForm = { domain: { name: "", emoji: "🌱", hue: "", intention: "" }, keeper: { since } };
  const words = "i need to help my daughter ines do a school assignment. i usually also help my other children with such assignments";
  const request = { agent: data.agents.find((item) => item.id === atlasId)!, data, request: domainRequest(draft, data, words), form: { kind: "domain" as const, editing: false } };
  assert.match(request.request, /Looked after by: nobody chosen yet/);
  const [spec] = specsOf(request);
  const choices = spec.args.looked_after_by.oneOf!;
  assert.ok(choices.includes("Tutor") && choices.filter((name) => name === "Vital").length === 1, "free suggestions are offered, a crew member's name once");
  assert.match(spec.description, /Tutor \(Homework helper: homework, explained at their level\)/);
  assert.doesNotThrow(() => parseSnapshot(JSON.parse(JSON.stringify(snapshotOf(request, today)))));
  const { fill } = draftsOf(request, [{ command: "fill_domain", args: { name: "Schoolwork", emoji: "🎒", looked_after_by: "tutor", agent_role: "Ignored", routines: [], assumed: [] } }]);
  assert.ok(fill?.kind === "domain");
  const hired = filledDomain(draft, fill, since);
  assert.deepEqual(hired.keeper, { since, fresh: true, start: "Tutor" });
  const planted = saveDraft(data, { kind: "domain", ...hired });
  const keeper = planted.data.agents.find((item) => item.id === planted.data.domains.find((domain) => domain.name === "Schoolwork")!.agentId)!;
  assert.deepEqual([keeper.name, keeper.role, keeper.portrait], ["Tutor", "Homework helper", "ellis"], "the suggestion is hired with its own role, not the fill's words");
});

test("a new project's fill can bring in a suggested agent to lead it, who joins the crew only at Save (D63)", () => {
  const { data, form } = workspace();
  const request = { agent: data.agents.find((item) => item.id === "vital")!, data, request: projectRequest(form, "2026-12-18", data, "Ship my habit app"), form: { kind: "project" as const, editing: false } };
  const [spec] = specsOf(request);
  assert.ok(spec.args.lead.oneOf!.includes("Forge") && spec.description.includes("Forge (Builder"), "suggestions without a domain can lead projects");
  const { fill } = draftsOf(request, [{ command: "fill_project", args: { title: "Habit app", lead: "forge", assumed: [] } }]);
  assert.ok(fill?.kind === "project" && fill.hire);
  const next = filledProject(form, fill, today, since, 3);
  assert.equal(next.project.agentId, fill.hire.id);
  assert.ok(next.filled!.fields.includes("lead"));
  assert.ok(!data.agents.some((agent) => agent.name === "Forge"), "nobody joins before Save");
  const saved = saveDraft(data, { kind: "project", ...next });
  const forge = saved.data.agents.find((agent) => agent.name === "Forge")!;
  assert.deepEqual([forge.role, saved.data.projects.find((project) => project.id === "p1")!.agentId], ["Builder", forge.id]);
  assert.equal(unfilledProject(next, form, next).hire, undefined, "Undo drops the newcomer");
  const review = filledProject({ ...form, review: { thread: "t", proposal: "x" } }, fill, today, since);
  assert.deepEqual([review.hire, review.project.agentId], [undefined, form.project.agentId], "a chat proposal under review keeps its crew");
});

test("a chat's project proposal opens in the dialog, and Start applies it as edited, with Undo on the card (D63)", () => {
  const { data, agent } = workspace();
  data.agents = data.agents.map((item) => item.id === agent.id ? { ...item, tools: { ...item.tools, "add-tasks": true } } : item);
  const proposal = proposalOf({ agent, data }, { command: "propose_project", args: { title: "First 10K", domain: "Health", goal: "Run 10 km.", finish: "2026-12-20",
    tasks: [{ title: "Buy shoes", due: "2026-11-19" }, "Run 2 km"], notes: [{ title: "Knee", body: "Go easy on hills." }] } })!;
  assert.ok(reviewable(proposal));
  const opened = reviewForm(proposal, "agent:vital");
  assert.deepEqual([opened.project.title, opened.steps, opened.review], ["First 10K", [{ title: "Buy shoes", due: "2026-11-19" }, { title: "Run 2 km", due: "" }], { thread: "agent:vital", proposal: proposal.id }]);
  const edited = { ...opened, project: { ...opened.project, title: "Spring 10K" }, steps: [opened.steps[1], { title: "Sign up", due: "" }], finish: { date: "2026-12-01", today } };
  const amended = amendedProposal(proposal, edited, today);
  assert.equal(amended.items.find((task) => task.title === "Run 2 km")!.id, proposal.items[1].id, "a kept step keeps its identity");
  assert.deepEqual(amended.items.map((task) => [task.title, task.due, task.projectId]), [["Run 2 km", "2026-11-20", opened.project.id], ["Sign up", "2026-11-24", opened.project.id]]);
  assert.equal(amended.projects![0].widgets!.find((block) => block.type === "countdown")!.date, "2026-12-01");
  const applied = applyProposal(data, amended).data;
  assert.equal(applied.projects.find((item) => item.id === opened.project.id)!.title, "Spring 10K");
  assert.deepEqual(applied.notes.filter((note) => note.projectId === opened.project.id).map((note) => note.title), ["Knee"]);
});
