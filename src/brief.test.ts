import test from "node:test";
import assert from "node:assert/strict";
import { briefOf, cheerDays, domainBriefOf, quietDays } from "./brief.ts";
import { seedWorkspace } from "./demo.ts";
import type { ChatMessage, Project, Task, Thread, WorkspaceData } from "./model.ts";
import type { Block } from "./blocks.ts";
import { buildStarter, starterProjects } from "./starterProjects.ts";
import { normalize } from "./workspace.ts";

// Demo seed: "home-office" is Hearth's with the Home front team (a room); Everyday itself has no agent.
const seed = normalize(seedWorkspace()).data;
const today = "2026-01-20";
const finish: Block = { id: "finish", type: "countdown", since: "2026-01-01", date: "2026-01-31" };
const project: Project = { ...seed.projects.find((item) => item.id === "home-office")!, widgets: [], routines: [
  { id: "weekly", kind: "report", time: "08:00", repeat: { every: "week", days: [1], weeks: 1 }, since: "2026-01-01T00:00:00Z" }] };
const step = (id: string, patch: Partial<Task> = {}): Task =>
  ({ id, title: `Step ${id}`, domain: project.area, projectId: project.id, done: false, due: "", updatedAt: `${today}T09:00:00Z`, ...patch });
const say = (id: string, text: string, patch: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: "agent", agentId: "hearth", text, ...patch });
const room = (messages: ChatMessage[], read = 0): Thread => ({ id: `room:${project.id}`, messages, read, attachedNoteId: null });
const proposal = say("p1", "Three steps from your note.", { agentId: "ledger", proposal: {
  id: "p1", projectId: project.id, noteId: "", sourceTitle: "", sourceBody: "", items: [], status: "pending" } });

const brief = (patch: { project?: Partial<Project>; tasks?: Task[]; threads?: Thread[]; data?: Partial<WorkspaceData> } = {}) => {
  const tasks = patch.tasks ?? [step("a")];
  const data: WorkspaceData = { ...seed, threads: patch.threads ?? [], notes: [], tasks, ...patch.data };
  return briefOf(data, { ...project, ...patch.project }, tasks, today);
};

test("a project nobody manages has no brief, and neither does one with nothing to say", () => {
  assert.equal(brief({ project: { area: "Everyday", agentId: undefined, teamId: undefined } }), null);
  assert.equal(brief(), null);
});

test("the most pressing signal speaks: proposals, a question, behind, late steps, a report, no steps, a long quiet", () => {
  const behind = { widgets: [finish] };
  const late = [step("a", { due: "2026-01-18" }), step("b")];
  const report = say("r1", "Status report\n2 open, start with Step a.", { routine: { id: "weekly", kind: "report", due: `${today}T08:00:00Z` } });
  const all = { project: behind, tasks: late, threads: [room([report, say("q", "Shall I book the electrician?"), proposal])] };
  assert.equal(brief(all)?.title, "A change waits on you");
  const byAtlas = brief({ threads: [room([{ ...proposal, agentId: "atlas" }])] });
  assert.deepEqual([byAtlas?.agent.id, byAtlas?.line.split(" drafted")[0]], ["hearth", "Atlas"], "the lead names a drafter from outside the crew");
  assert.equal(brief(all)?.agent.id, "ledger", "a crew member speaks for its own draft");
  assert.equal(brief({ ...all, threads: [room([report, say("q", "Shall I book the electrician?")])] })?.title, "A question for you");
  assert.equal(brief({ ...all, threads: [room([report])] })?.title, "We're behind");
  assert.equal(brief({ tasks: late, threads: [room([report])] })?.title, "1 step slipped");
  assert.equal(brief({ threads: [room([report])] })?.title, "My status report is in");
  assert.equal(brief({ threads: [room([report], 1)] }), null, "a report you've read is old news");
  assert.equal(brief({ tasks: [] })?.title, "Where do we start?");
});

test("a question only counts in the project's own room, and only as the last word", () => {
  const own: Thread = { id: "agent:hearth", messages: [say("q", "Anything else?")], read: 0, attachedNoteId: null };
  assert.equal(brief({ threads: [own] }), null);
  assert.equal(brief({ threads: [room([say("q", "Anything else?"), { id: "u", role: "user", text: "No" }])] }), null);
});

test("late steps get a new key when another slips, so a dismissed brief comes back", () => {
  const one = brief({ tasks: [step("a", { due: "2026-01-19" }), step("b", { due: today })] });
  const two = brief({ tasks: [step("a", { due: "2026-01-19" }), step("b", { due: "2026-01-19" })] });
  assert.equal(one?.line, "“Step a” was due yesterday.");
  assert.deepEqual(two?.action, { kind: "today", label: "Move to today", taskIds: ["a", "b"] });
  assert.notEqual(one?.key, two?.key);
  assert.equal(brief({ tasks: [step("a", { due: "2026-01-19", done: true }), step("b")] }), null, "a finished step isn't late");
});

test(`a project is quiet after ${quietDays} days without an edit; records without timestamps aren't judged`, () => {
  const since = (days: number) => [step("a", { updatedAt: new Date(Date.parse(`${today}T09:00:00Z`) - days * 86_400_000).toISOString() })];
  assert.equal(brief({ tasks: since(quietDays - 1) }), null);
  assert.equal(brief({ tasks: since(quietDays) })?.title, `Quiet for ${quietDays} days`);
  assert.equal(brief({ tasks: [step("a", { updatedAt: undefined })] }), null);
  assert.equal(brief({ tasks: since(30).map((task) => ({ ...task, done: true })) })?.kind, "bloom", "nothing left open is finished, not quiet");
});

test("a new project opens with a welcome until Got it, or for a week; older projects never get one", () => {
  const fresh = (patch: Partial<Project>, tasks: Task[], welcomed = false) => {
    const data: WorkspaceData = { ...seed, threads: [room([proposal])], notes: [], tasks };
    return briefOf(data, { ...project, createdAt: `${today}T08:00:00Z`, ...patch }, tasks, today, welcomed);
  };
  const welcome = fresh({}, [step("b", { due: "2026-01-23" }), step("a", { due: "2026-01-21" })]);
  assert.equal(welcome?.title, "Hi, I'm Hearth", "the welcome comes before anything else, even a pending proposal");
  assert.match(welcome?.tips?.[0] ?? "", /^Start with “Step a”, due /, "the soonest open step first");
  assert.equal(fresh({ widgets: [finish] }, [])?.tips?.[1], "11 days to the finish line. I'll say if the clock gets ahead of the work.");
  assert.equal(fresh({}, [], true)?.title, "A change waits on you", "after Got it the usual brief speaks");
  assert.equal(fresh({ createdAt: "2026-01-13T08:00:00Z" }, [])?.title, "A change waits on you", "a week on, the welcome yields");
  assert.equal(brief({ tasks: [] })?.title, "Where do we start?", "no createdAt, no welcome");
  const unmanaged = fresh({ area: "Everyday", agentId: undefined, teamId: undefined }, []);
  assert.deepEqual([unmanaged?.agent.id, unmanaged?.action.label], ["atlas", "Suggest steps"], "Atlas welcomes a project nobody looks after");
});

test(`finished work is celebrated: every step done, or a milestone reached in the last ${cheerDays} days`, () => {
  const done = brief({ tasks: [step("a", { done: true }), step("b", { done: true })] });
  assert.deepEqual([done?.kind, done?.action], ["bloom", { kind: "archive", label: "Archive it", projectId: project.id }]);
  const path = (reached: string): Block => ({ id: "path", type: "milestones", steps: [
    { title: "Plan", date: "2026-01-10", done: true, reached }, { title: "Build", date: "2026-01-25", done: false }] });
  const cheer = brief({ project: { widgets: [path("2026-01-17")] } });
  assert.equal(cheer?.title, "Reached “Plan”");
  assert.match(cheer?.line ?? "", /^1 of 2 milestones behind you\. Next: “Build”/);
  assert.equal(brief({ project: { widgets: [path("2026-01-16")] } }), null, "a milestone reached longer ago is old news");
});

test("a domain's agent names its projects behind or finished and its own late steps; no agent, no brief", () => {
  const health = seed.domains.find((domain) => domain.name === "Health")!;
  const strength: Project = { ...seed.projects.find((item) => item.id === "demo-strength")!, widgets: [finish] };
  const task = (id: string, patch: Partial<Task> = {}): Task => ({ id, title: `Step ${id}`, domain: "Health", projectId: strength.id, done: false, due: "", ...patch });
  const said = (tasks: Task[]) => domainBriefOf({ ...seed, threads: [], projects: [strength], tasks }, health, tasks, today);
  assert.deepEqual(said([task("a"), task("b")])?.action, { kind: "open", label: `Open “${strength.title}”`, projectId: strength.id });
  assert.equal(said([task("a", { done: true })])?.kind, "bloom");
  assert.equal(said([task("x", { projectId: "", due: "2026-01-19" })])?.title, "1 step slipped");
  assert.equal(domainBriefOf({ ...seed, threads: [] }, seed.domains.find((domain) => domain.name === "Everyday")!, [], today), null);
  // Atlas's proposal planting a domain belongs to no domain yet, so it waits in Everyday's brief (D61).
  const everyday = seed.domains.find((domain) => domain.name === "Everyday")!;
  const plant = { domain: { name: "Work", emoji: "💼", hue: "", intention: "" }, keeper: { name: "Juniper", portrait: "juniper" } };
  const waiting = { id: "agent:atlas", read: 0, attachedNoteId: null, messages: [{ id: "m", role: "agent" as const, agentId: "atlas", text: "",
    proposal: { id: "p", projectId: "", noteId: "", sourceTitle: "", sourceBody: "", items: [], changes: [], plant, status: "pending" as const } }] };
  assert.deepEqual(domainBriefOf({ ...seed, threads: [waiting] }, everyday, [], today)?.action, { kind: "chat", label: "Review", thread: "agent:atlas" });
  const empty = domainBriefOf({ ...seed, threads: [], projects: [], tasks: [] }, health, [], today);
  assert.deepEqual([empty?.kind, empty?.title, empty?.action.kind], ["empty", "What matters most in Health?", "chat"], "with nothing in it yet, the agent asks what matters");
  assert.equal(said([task("x", { projectId: "" })]), null, "one loose step is enough to stop asking");
});

test("captures from the phone wait to be sorted, oldest first; Atlas speaks for them where nobody looks after the domain", () => {
  const everyday = seed.domains.find((domain) => domain.name === "Everyday")!;
  const capture = (id: string, at: string) => ({ id, domain: "Everyday", projectId: "", title: `Capture ${id}`, body: "", updatedAt: at, unsorted: true });
  const data = { ...seed, threads: [], notes: [...seed.notes, capture("late", "2026-01-20T10:00:00Z"), capture("early", "2026-01-19T10:00:00Z")] };
  const brief = domainBriefOf(data, everyday, [], today)!;
  assert.deepEqual([brief.kind, brief.agent.id, brief.title, brief.action], ["unsorted", "atlas", "2 captures wait to be sorted",
    { kind: "sort", label: "Sort with Atlas", noteId: "early" }]);
  assert.match(brief.line, /^“Capture early”: I can turn it/);
  const sorted = { ...data, notes: data.notes.map((note) => ({ ...note, unsorted: undefined })) };
  assert.equal(domainBriefOf(sorted, everyday, [], today), null, "sorted captures leave the pile");
});

test("a starter project's welcome carries the starter's own tip", () => {
  const starter = starterProjects.Health[1];
  const built = buildStarter(seed, "Health", starter, "", today);
  const made = built.data.projects.find((item) => item.id === built.id)!;
  const welcome = briefOf(built.data, made, built.data.tasks.filter((task) => task.projectId === made.id), today, false);
  assert.equal(welcome?.tips?.[1], starter.tip);
});
