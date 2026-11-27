// Briefs (agents-design D40): what the agent looking after a place says at the top of its page, worked out from the
// workspace alone, with no model call. A project made since D40 (`createdAt`) opens with a welcome: who looks after it,
// the first step, its starter's tip and the finish line, until you say Got it or take its action. After that a
// project's brief speaks only when something waits on you, changed or is worth celebrating: proposals, a question in
// its room, every step done, a milestone just reached, the clock ahead of the work, late steps, a routine's unread
// report, no steps yet, or a long quiet. A domain's brief comes from the domain's agent: its pending proposals,
// projects behind, loose steps late, a report, projects finished, or, while it holds nothing, what matters there.
// Otherwise there is no brief. A place with nobody looking after it has no voice, except Atlas's welcome pointing at the crew. brief.test.ts covers it.
import { crewOf, nearestThread, pendingProposals, stewardOf } from "./agents.ts";
import { atlasId, byId, defaultDomain, perList, routineKinds } from "./model.ts";
import { shownBlocks } from "./blocks.ts";
import { formatDate } from "./dates.ts";
import type { Agent, BriefMark, Domain, Note, Project, Task, WorkspaceData } from "./model.ts";
import type { Session } from "./session.ts";
import { paceOf } from "./pace.ts";
import { starterNamed } from "./starterProjects.ts";

export type BriefAction =
  /** Opens a thread, optionally with words ready to send. */
  | { kind: "chat"; label: string; thread: string; draft?: string }
  /** Moves these open steps to today. */
  | { kind: "today"; label: string; taskIds: string[] }
  /** Opens a project's page. */
  | { kind: "open"; label: string; projectId: string }
  /** Archives a finished project. */
  | { kind: "archive"; label: string; projectId: string }
  /** Hands an unsorted capture to Atlas to sort (agents-design D53). */
  | { kind: "sort"; label: string; noteId: string };

/** What a brief is about, most pressing first (Today lists them in this order). */
export const briefKinds = ["welcome", "approval", "question", "unsorted", "bloom", "milestone", "behind", "late", "report", "empty", "quiet"] as const;
export type BriefKind = (typeof briefKinds)[number];

export type Brief = {
  kind: BriefKind;
  /** Changes when what it says changes: a dismissed brief comes back only under a new key, and only a new key types in. */
  key: string;
  agent: Agent;
  title: string;
  line: string;
  action: BriefAction;
  /** The welcome's tips, shown under the line; it closes with Got it rather than Not now. */
  tips?: string[];
};

/** A brief's marks on this device (Session.briefs) and in the workspace (the place's BriefMark). */
export type BriefState = Session["briefs"][string] & BriefMark;

/** Whether a brief shows as a bubble: there is one, it isn't the one dismissed, and the open chat isn't with its agent. */
export const isSpeaking = (brief: Brief | null, state: BriefState, hushed = false) =>
  !!brief && !hushed && brief.key !== state.dismissed;

/** A project is quiet after this many days without an edit to its steps or resources. */
export const quietDays = 14;
/** A new project's welcome yields to the usual brief after this many days, even without Got it. */
export const welcomeDays = 7;
/** A reached milestone is celebrated for this many days. */
export const cheerDays = 3;
const dayMs = 86_400_000;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00`) - Date.parse(`${from}T12:00:00`)) / dayMs);
const clip = (text: string, max = 140) => text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const dayOf = (day: string) => formatDate(new Date(`${day}T12:00:00`), { weekday: "short", day: "numeric", month: "short" });
const titles = (names: string[]) => names.map((name) => `“${clip(name, 40)}”`).join(", ").replace(/, ([^,]*)$/, " and $1");

/** Open steps whose day has passed, oldest first. */
const lateOf = (tasks: Task[], today: string) => tasks.filter((task) => !task.done && task.due && task.due < today).sort((a, b) => a.due.localeCompare(b.due));
const lateLine = (late: Task[], today: string) => {
  const days = daysBetween(late[0].due, today);
  return late.length === 1
    ? `“${clip(late[0].title, 60)}” was due ${days === 1 ? "yesterday" : `${days} days ago`}.`
    : `“${clip(late[0].title, 60)}” and ${plural(late.length - 1, "other", "others")} are past their day.`;
};
/** The newest unread message one of these routines posted in a thread. */
const unreadReport = (data: WorkspaceData, thread: string, routines: { id: string }[] | undefined) => {
  const own = new Set((routines ?? []).map((routine) => routine.id));
  const posted = byId(data.threads).get(thread);
  return posted?.messages.slice(posted.read).filter((message) => message.role === "agent" && message.routine && own.has(message.routine.id)).at(-1);
};
/** Each project's last edited live resource, as a day (`perList`). */
const notesTouched = perList((notes: readonly Note[]) => {
  const days = new Map<string, string>();
  for (const note of notes) {
    if (note.archived || !note.projectId || !note.updatedAt) continue;
    const day = note.updatedAt.slice(0, 10);
    if (day > (days.get(note.projectId) ?? "")) days.set(note.projectId, day);
  }
  return days;
});

/**
 * A project's brief. `tasks` are its live tasks; `today` is local YYYY-MM-DD. `welcomed`: the person said Got it to (or
 * acted on) this project's welcome on this device.
 */
export function briefOf(data: WorkspaceData, project: Project, tasks: Task[], today: string, welcomed = true): Brief | null {
  const crew = crewOf(data, project);
  const lead = crew[0];
  const thread = nearestThread(data, project.area, project.id);
  if (project.createdAt && !welcomed && daysBetween(project.createdAt.slice(0, 10), today) < welcomeDays)
    return welcomeOf(data, project, tasks, today, lead, thread);
  if (!lead) return null;
  const say = (kind: BriefKind, key: string, title: string, line: string, action: BriefAction, agent = lead): Brief =>
    ({ kind, key, agent, title, line, action });

  // 1. Proposals for this project, wherever they were posted.
  const pending = pendingProposals(data.threads).filter(({ message }) => message.proposal!.projectId === project.id);
  if (pending.length) {
    const first = pending[0];
    // A crew member speaks for its own drafts; the lead names anyone else who drafted (Atlas, an agent elsewhere).
    const by = crew.find((agent) => agent.id === (first.message.agentId ?? atlasId));
    const drafter = by ? "I" : data.agents.find((agent) => agent.id === (first.message.agentId ?? atlasId))?.name ?? "An agent";
    return say("approval", `approval:${pending.map((item) => item.message.id).join()}`,
      pending.length === 1 ? "A change waits on you" : `${pending.length} changes wait on you`,
      `${drafter} drafted ${pending.length === 1 ? "it" : "them"} for ${project.title}. Nothing changes until you say yes.`,
      { kind: "chat", label: "Review", thread: first.thread }, by ?? lead);
  }

  // 2. A question left in the project's own room (an agent's own thread spans all its places, so it doesn't count).
  const room = byId(data.threads).get(`room:${project.id}`);
  const last = room?.messages.at(-1);
  if (last?.role === "agent" && last.text.trim().endsWith("?")) {
    const asker = crew.find((agent) => agent.id === (last.agentId ?? atlasId)) ?? lead;
    return say("question", `question:${last.id}`, "A question for you", clip(last.text.trim()),
      { kind: "chat", label: "Answer", thread: room!.id }, asker);
  }

  // 3. Every step done: the plant is in bloom. Adding steps and finishing them again celebrates again.
  if (tasks.length && tasks.every((task) => task.done)) {
    return say("bloom", `bloom:${tasks.length}`, "In bloom 🌻",
      `All ${plural(tasks.length, "step", "steps")} of ${project.title} are done. Archive it to keep things tidy, or tell me the next goal.`,
      { kind: "archive", label: "Archive it", projectId: project.id });
  }

  // 4. A milestone reached in the last few days.
  const reached = shownBlocks(project.widgets ?? []).filter((block) => block.type === "milestones").flatMap((block) =>
    (block.steps ?? []).filter((step) => step.done && step.reached && daysBetween(step.reached, today) <= cheerDays)
      .map((step) => ({ block, step }))).sort((a, b) => b.step.reached!.localeCompare(a.step.reached!))[0];
  if (reached) {
    const steps = reached.block.steps ?? [];
    const ahead = steps.find((step) => !step.done);
    return say("milestone", `milestone:${reached.block.id}:${reached.step.title}:${reached.step.reached}`, `Reached “${clip(reached.step.title, 50)}”`,
      `${steps.filter((step) => step.done).length} of ${steps.length} milestones behind you. ${ahead ? `Next: “${clip(ahead.title, 50)}”, ${dayOf(ahead.date)}.` : "That was the last one."}`,
      { kind: "chat", label: "Plan the next stretch", thread,
        draft: `We reached “${reached.step.title}” on ${project.title}. Help me plan the next stretch${ahead ? ` to “${ahead.title}”` : ""}.` });
  }

  // 5. The clock clearly ahead of the work (the masthead's Behind).
  const pace = paceOf(project, tasks, today);
  if (pace.behind) {
    const gone = Math.round(pace.timeShare * 100);
    const done = Math.round(pace.done / pace.total * 100);
    return say("behind", "behind", "We're behind",
      `${gone}% of the time is gone and ${done}% of the steps are done. Shall we plan a catch-up?`,
      { kind: "chat", label: "Plan a catch-up", thread,
        draft: `We're behind on ${project.title}: ${pace.done} of ${pace.total} steps done with ${gone}% of the time gone. Help me plan a catch-up.` });
  }

  // 6. Open steps whose day has passed.
  const late = lateOf(tasks, today);
  if (late.length) {
    return say("late", `late:${late.map((task) => task.id).sort().join()}`, `${plural(late.length, "step", "steps")} slipped`,
      lateLine(late, today), { kind: "today", label: "Move to today", taskIds: late.map((task) => task.id) });
  }

  // 7. A routine of this project posted a report you haven't read.
  const report = unreadReport(data, thread, project.routines);
  if (report?.routine) {
    const by = crew.find((agent) => agent.id === (report.agentId ?? atlasId)) ?? lead;
    return say("report", `routine:${report.id}`, `My ${routineKinds[report.routine.kind].label.toLowerCase()} is in`,
      clip(report.text.trim().split("\n").find((line) => line.trim()) ?? ""), { kind: "chat", label: "Read it", thread }, by);
  }

  // 8. Nothing planned yet.
  if (!tasks.length) {
    return say("empty", "empty", "Where do we start?", "No steps yet. Tell me what done looks like and I'll suggest the first three.",
      { kind: "chat", label: "Suggest steps", thread, draft: `Suggest the first three steps for ${project.title}.` });
  }

  // 9. Open steps, but nothing touched for a while. Records without timestamps aren't judged (as the review, D23).
  const touched = [...tasks.map((task) => task.updatedAt?.slice(0, 10)), notesTouched(data.notes).get(project.id)]
    .filter((at): at is string => !!at).sort().at(-1);
  const quiet = touched ? daysBetween(touched, today) : 0;
  if (tasks.some((task) => !task.done) && quiet >= quietDays) {
    return say("quiet", `quiet:${touched}`, `Quiet for ${quiet} days`, "Nothing here has moved. Pick one step for this week?",
      { kind: "chat", label: "Pick a step", thread, draft: `${project.title} has been quiet for ${quiet} days. Help me pick one step for this week.` });
  }
  return null;
}

/** A new project's first brief: the lead introduces itself (Atlas when nobody looks after it) and gives three tips. */
function welcomeOf(data: WorkspaceData, project: Project, tasks: Task[], today: string, lead: Agent | undefined, thread: string): Brief {
  const agent = lead ?? data.agents.find((item) => item.id === atlasId)!;
  const next = tasks.filter((task) => !task.done)
    .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))[0];
  const countdown = shownBlocks(project.widgets ?? []).find((block) => block.type === "countdown");
  const left = countdown?.date ? daysBetween(today, countdown.date) : 0;
  const starterTip = project.starter ? starterNamed(project.starter)?.tip : undefined;
  const tips = [
    next ? `Start with “${clip(next.title, 60)}”${next.due ? `, due ${dayOf(next.due)}` : ""}.`
      : "No steps yet. Tell me what done looks like and I'll draft the first three.",
    starterTip ?? "",
    countdown && !countdown.date ? "Give the countdown a date and I'll tell you if the clock gets ahead of the work."
      : left > 0 ? `${plural(left, "day", "days")} to ${countdown!.title || "the finish line"}. I'll say if the clock gets ahead of the work.`
        : "",
    !lead ? "Nobody looks after it yet. Unfold the header to give it an agent, who will speak up here."
      : starterTip ? "" : "Notes and links you keep here are what I read when you ask about it.",
  ].filter(Boolean).slice(0, 3);
  return {
    kind: "welcome", key: "welcome", agent, tips,
    title: `Hi, I'm ${agent.name}`,
    line: lead ? `I look after ${project.title} with you and will speak up here when something needs you. Here's where I'd begin.`
      : "Nobody looks after this project yet, so I'll start you off. Here's where I'd begin.",
    action: next
      ? { kind: "chat", label: "Plan the first week", thread, draft: `Help me plan the first week of ${project.title}.` }
      : { kind: "chat", label: "Suggest steps", thread, draft: `Suggest the first three steps for ${project.title}.` },
  };
}

/**
 * A domain's brief, from its own agent; none without one, except captures waiting to be sorted, which Atlas speaks for
 * where nobody looks after the domain. `tasks` are the domain's live tasks, its projects' included.
 * Its projects speak for themselves on their pages, so the domain names them and opens them.
 */
export function domainBriefOf(data: WorkspaceData, domain: Domain, tasks: Task[], today: string): Brief | null {
  const agent = stewardOf(data, domain.name);
  // Captures from your phone (shared or spoken) not sorted yet, oldest first: one at a time, so each lands as its own proposal (D53).
  const unsorted = data.notes.filter((note) => note.unsorted && !note.archived && note.domain === domain.name)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  const sorting = (speaker: Agent): Brief => ({ kind: "unsorted", key: `unsorted:${unsorted.map((note) => note.id).join()}`, agent: speaker,
    title: unsorted.length === 1 ? "A capture waits to be sorted" : `${unsorted.length} captures wait to be sorted`,
    line: `“${clip(unsorted[0].title || unsorted[0].body, 60)}”: ${speaker.id === atlasId ? "I can" : "Atlas can"} turn it into tasks and notes where they belong.`,
    action: { kind: "sort", label: "Sort with Atlas", noteId: unsorted[0].id } });
  if (!agent) {
    const atlas = byId(data.agents).get(atlasId);
    if (!atlas) return null;
    // Atlas's proposals that plant a domain or move projects across domains (D61) belong to no domain brief of their
    // own, so they wait in Everyday's, his where nobody looks after it (D51).
    const waiting = domain.name === defaultDomain.name ? data.threads.find((item) => item.id === `agent:${atlasId}`)?.messages
      .filter(({ proposal }) => proposal?.status === "pending" && (proposal.plant || proposal.changes?.some((change) => change.kind === "rehome"))) ?? [] : [];
    if (waiting.length) return { kind: "approval", key: `approval:${waiting.map((message) => message.id).join()}`, agent: atlas,
      title: waiting.length === 1 ? "A change waits on you" : `${waiting.length} changes wait on you`,
      line: "I drafted them in our chat. Nothing changes until you say yes.", action: { kind: "chat", label: "Review", thread: `agent:${atlasId}` } };
    return unsorted.length ? sorting(atlas) : null;
  }
  const thread = `agent:${agent.id}`;
  const say = (kind: BriefKind, key: string, title: string, line: string, action: BriefAction): Brief => ({ kind, key, agent, title, line, action });
  const projects = data.projects.filter((project) => project.area === domain.name && !project.archived);
  const stepsOf = (project: Project) => tasks.filter((task) => task.projectId === project.id);

  // 1. Proposals waiting in the domain agent's own thread; ones for a project are that project's brief.
  const pending = data.threads.find((item) => item.id === thread)?.messages.filter((message) => message.proposal?.status === "pending" && !message.proposal.projectId) ?? [];
  if (pending.length) {
    return say("approval", `approval:${pending.map((message) => message.id).join()}`,
      pending.length === 1 ? "A change waits on you" : `${pending.length} changes wait on you`,
      "I drafted them in our chat. Nothing changes until you say yes.", { kind: "chat", label: "Review", thread });
  }
  // 1b. Captures waiting to be sorted (above).
  if (unsorted.length) return sorting(agent);
  // 2. Projects finished and still on the shelf.
  const bloomed = projects.filter((project) => { const steps = stepsOf(project); return steps.length > 0 && steps.every((task) => task.done); });
  if (bloomed.length) {
    return say("bloom", `bloom:${bloomed.map((project) => project.id).sort().join()}`, `${titles(bloomed.map((project) => project.title))} ${bloomed.length === 1 ? "is" : "are"} done 🌻`,
      `Every step finished. Archive ${bloomed.length === 1 ? "it" : "them"} to keep ${domain.name} tidy.`,
      { kind: "archive", label: bloomed.length === 1 ? "Archive it" : `Archive “${clip(bloomed[0].title, 30)}”`, projectId: bloomed[0].id });
  }
  // 3. Projects behind their clock.
  const behind = projects.filter((project) => paceOf(project, stepsOf(project), today).behind);
  if (behind.length) {
    return say("behind", `behind:${behind.map((project) => project.id).sort().join()}`,
      behind.length === 1 ? `“${clip(behind[0].title, 50)}” is behind` : `${behind.length} projects are behind`,
      behind.length === 1 ? "The clock is ahead of its steps. Its page has a catch-up plan ready."
        : `${titles(behind.map((project) => project.title))}: the clock is ahead of their steps. Each page has a catch-up plan ready.`,
      { kind: "open", label: `Open “${clip(behind[0].title, 30)}”`, projectId: behind[0].id });
  }
  // 4. Steps kept straight in the domain, past their day.
  const late = lateOf(tasks.filter((task) => !task.projectId), today);
  if (late.length) {
    return say("late", `late:${late.map((task) => task.id).sort().join()}`, `${plural(late.length, "step", "steps")} slipped`,
      lateLine(late, today), { kind: "today", label: "Move to today", taskIds: late.map((task) => task.id) });
  }
  // 5. A routine of this domain posted a report you haven't read.
  const report = unreadReport(data, nearestThread(data, domain.name), domain.routines);
  if (report?.routine) {
    return say("report", `routine:${report.id}`, `My ${routineKinds[report.routine.kind].label.toLowerCase()} is in`,
      clip(report.text.trim().split("\n").find((line) => line.trim()) ?? ""), { kind: "chat", label: "Read it", thread: nearestThread(data, domain.name) });
  }
  // 6. Nothing here yet: ask what matters, so the first proposals fit. Today leaves it to the domain's own page.
  if (!projects.length && !tasks.length) {
    return say("empty", `empty:${domain.name}`, `What matters most in ${domain.name}?`,
      "Tell me in a line or two and I'll propose the first steps. Nothing changes until you say yes.",
      { kind: "chat", label: "Tell me", thread, draft: `What matters most to me in ${domain.name} is ` });
  }
  return null;
}
