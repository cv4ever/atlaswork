// Who answers where, what each agent can see, and what agents do on their own. Pure functions over workspace data.
import { isAnswering } from "./jobs.ts";
import type { Job } from "./jobs.ts";
import { agentTools, atlasId, byId, canUse, failingRoutines, perList, routineKinds } from "./model.ts";
import type { Agent, ChatMessage, Project, Team, Thread, WorkspaceData } from "./model.ts";
import { plainOf } from "./markdown.ts";

/** What an agent is up to, for the roster: replying now, waiting on you, stuck, or nothing. */
export type Presence =
  | { kind: "working" }
  | { kind: "approval"; count: number }
  | { kind: "question"; text: string }
  | { kind: "stuck"; reason: string }
  | { kind: "idle" };
/** Waiting on you: something to approve, a question to answer, or a block to clear. */
export const needsYou = (presence: Presence) => presence.kind === "approval" || presence.kind === "question" || presence.kind === "stuck";
/** Every proposal waiting on you, in thread order, then message order (`perList`). */
export const pendingProposals = perList((threads: readonly Thread[]) => threads.flatMap((thread) => thread.messages
  .filter((message) => message.proposal?.status === "pending").map((message): { thread: string; message: ChatMessage } => ({ thread: thread.id, message }))));
/** Every question for another agent waiting on you (D50), in thread order, then message order (`perList`). */
export const pendingAsks = perList((threads: readonly Thread[]) => threads.flatMap((thread) => thread.messages
  .filter((message) => message.ask?.status === "pending").map((message): { thread: string; message: ChatMessage } => ({ thread: thread.id, message }))));
/** When `from` last sent `to` a question (D50), ISO; undefined if never. */
export function lastAsked(data: WorkspaceData, from: string, to: string): string | undefined {
  let last: string | undefined;
  for (const thread of data.threads) for (const message of thread.messages)
    if ((message.agentId ?? atlasId) === from && message.ask?.to === to && message.ask.status === "sent" && message.at && (!last || message.at > last)) last = message.at;
  return last;
}
/**
 * Working wins (it's live: a reply here, or a job the agent function holds for it on any device, D76); then what waits
 * on you: proposals and questions to approve, a question, a missing tool or a failed reply.
 */
export function presenceOf(data: WorkspaceData, agent: Agent,
  activity: { thinking: Record<string, Agent | undefined>; errors: Record<string, string | undefined>; jobs?: Job[] }): Presence {
  if (Object.values(activity.thinking).some((thinker) => thinker?.id === agent.id)
    || activity.jobs?.some((job) => job.agentId === agent.id && isAnswering(job))) return { kind: "working" };
  const own = (message: ChatMessage) => (message.agentId ?? atlasId) === agent.id;
  // A question for another agent (D50) waits on you like a proposal.
  const count = pendingProposals(data.threads).filter(({ message }) => own(message)).length
    + pendingAsks(data.threads).filter(({ message }) => own(message)).length;
  if (count) return { kind: "approval", count };
  const latest = byId(data.threads).get(`agent:${agent.id}`)?.messages.at(-1);
  if (latest?.role === "agent" && latest.text.trim().endsWith("?")) return { kind: "question", text: plainOf(latest.text.trim()) };
  if (activity.errors[`agent:${agent.id}`]) return { kind: "stuck", reason: "Couldn't reply" };
  // shortcut: checks only the agent's own routines, not domain/project routines it runs; extend if those block silently.
  const tool = (agent.routines ?? []).filter((routine) => !routine.paused)
    .flatMap((routine) => routineKinds[routine.kind].needs).find((need) => !canUse(agent, need));
  if (tool) return { kind: "stuck", reason: `Needs ${agentTools[tool].label}` };
  // Two failed runs in a row of one of its routines (agents-design D69).
  const failing = failingRoutines(data.runs);
  return (agent.routines ?? []).some((routine) => !routine.paused && failing.has(routine.id)) ? { kind: "stuck", reason: "A routine keeps failing" } : { kind: "idle" };
}

export const agentById = (data: WorkspaceData, id: string | undefined) => data.agents.find((agent) => agent.id === id);
const live = (agent: Agent | undefined): agent is Agent => !!agent && !agent.archived;

/** The domain's own agent, if it has a live one. */
export function stewardOf(data: WorkspaceData, domain: string) {
  const agent = agentById(data, data.domains.find((item) => item.name === domain)?.agentId);
  return live(agent) ? agent : undefined;
}

export const teamById = (data: WorkspaceData, id: string | undefined) => data.teams.find((team) => team.id === id);
/** A team's live members, lead first. */
export const teamMembers = (data: WorkspaceData, team: Team) => team.memberIds.map((id) => agentById(data, id)).filter(live);

/**
 * A project's crew in reply order: its assigned agent, then its team (lead first), then its domain's agent,
 * who joins every crew in the domain.
 */
export function crewOf(data: WorkspaceData, project: Project) {
  const team = teamById(data, project.teamId);
  const ids = [...new Set([project.agentId ?? "", ...(team?.memberIds ?? []), stewardOf(data, project.area)?.id ?? ""])];
  return ids.map((id) => agentById(data, id)).filter(live);
}

/** Where chat opens in a place: the project's room (2+ crew), its one crew member, the domain's agent, or Atlas. */
export function nearestThread(data: WorkspaceData, domain: string, projectId = "") {
  const project = byId(data.projects).get(projectId);
  const crew = project ? crewOf(data, project) : [];
  if (crew.length > 1) return `room:${project!.id}`;
  return `agent:${crew[0]?.id ?? stewardOf(data, domain)?.id ?? atlasId}`;
}

/** Everyone who speaks in a thread. An archived agent still speaks in its own (read-only) thread. */
export function membersOf(data: WorkspaceData, threadId: string): Agent[] {
  const [kind, id] = [threadId.slice(0, threadId.indexOf(":")), threadId.slice(threadId.indexOf(":") + 1)];
  if (kind === "room") {
    const project = byId(data.projects).get(id);
    return project ? crewOf(data, project) : [];
  }
  if (kind === "team") {
    const team = teamById(data, id);
    return team ? teamMembers(data, team) : [];
  }
  if (kind === "chat") {
    const thread = byId(data.threads).get(threadId);
    return (thread?.memberIds ?? []).map((member) => agentById(data, member)).filter(live);
  }
  const agent = agentById(data, id);
  return agent ? [agent] : [];
}
/** Rooms answer by @mention; one-agent threads always go to that agent. */
export const isRoom = (threadId: string) => !threadId.startsWith("agent:");

/** What an agent can see: everything (Atlas), or the domains it looks after and the projects it crews. */
export type Scope = { all: boolean; domains: Set<string>; projects: Set<string> };
/** Derived from assignments only. */
export function scopeOf(data: WorkspaceData, agentId: string): Scope {
  const all = agentId === atlasId;
  const domains = new Set(data.domains.filter((domain) => domain.agentId === agentId).map((domain) => domain.name));
  const teams = new Set(data.teams.filter((team) => team.memberIds.includes(agentId)).map((team) => team.id));
  const projects = new Set(data.projects.filter((project) =>
    project.agentId === agentId || teams.has(project.teamId ?? "") || domains.has(project.area)).map((project) => project.id));
  return { all, domains, projects };
}
export const sees = (scope: Scope, item: { domain: string; projectId: string }) =>
  scope.all || scope.domains.has(item.domain) || scope.projects.has(item.projectId);

/** Agent messages after the ones you've seen. */
export const unread = (thread: Thread | undefined) =>
  thread ? thread.messages.slice(thread.read).filter((message) => message.role === "agent").length : 0;

/** The members a message names with @Name, in the order named; nobody named means the crew's first. */
export function addressees(text: string, members: Agent[]) {
  const at = (agent: Agent) =>
    new RegExp(`@${agent.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").exec(text)?.index ?? -1;
  const named = members.filter((agent) => at(agent) >= 0).sort((a, b) => at(a) - at(b));
  return named.length ? named : members.slice(0, 1);
}

/** Who a note belongs to: its project's first crew member, the domain's agent, or Atlas. */
export function nearestOwner(data: WorkspaceData, item: { domain: string; projectId: string }) {
  const project = data.projects.find((entry) => entry.id === item.projectId);
  return (project && crewOf(data, project)[0]) || stewardOf(data, item.domain) || agentById(data, atlasId)!;
}

/** Where an agent works, in words: the domains it looks after, then other live projects it's on; Atlas does everything. */
export function scopeLabelOf(data: WorkspaceData, agentId: string) {
  const scope = scopeOf(data, agentId);
  if (scope.all) return "everything";
  const live = new Set(data.domains.filter((domain) => !domain.archived).map((domain) => domain.name));
  const extra = data.projects.filter((project) =>
    !project.archived && live.has(project.area) && scope.projects.has(project.id) && !scope.domains.has(project.area));
  return [...scope.domains, ...extra.map((project) => project.title)].join(", ");
}
/** "A, B and C", or "A, B and 3 more" past four names. */
const few = (names: string[]) => names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`
  : names.join(", ").replace(/, ([^,]*)$/, " and $1");

/** How an agent introduces itself the first time you open its thread. Atlas names what's set up and asks for the week's plate (D35). */
export function welcomeOf(agent: Agent, scopeLabel: string, data?: WorkspaceData, name = "") {
  if (agent.id !== atlasId)
    return `Hi, I'm ${agent.name}, ${agent.role.toLocaleLowerCase()}. ${scopeLabel ? `I look after ${scopeLabel}.` : "I'm not assigned anywhere yet, so attach a note and I'll work from that."} Ask me for next steps any time.`;
  const domains = data?.domains.filter((domain) => !domain.archived).map((domain) => domain.name) ?? [];
  const crew = data?.agents.filter((item) => item.id !== atlasId && !item.archived).map((item) => item.name) ?? [];
  const setup = domains.length > 1 || crew.length ? ` You've set up ${few(domains)}${crew.length ? `, with ${few(crew)} on the crew` : ""}.` : "";
  return `${name.trim() ? `Hi ${name.trim()}, I'm Atlas.` : "Welcome to Atlaswork. I'm Atlas."}${setup} Tell me what's on your plate this week, a few lines is plenty, and I'll sort it into tasks for you to approve. Anything else can wait.`;
}

/** The window the meter measures against: models differ, and 128k tokens is the common size. */
export const contextLimit = 128_000;
/**
 * One agent's measured use in a thread (D28), from the token counts its provider reported: `last` is the most its
 * latest reply this session read in one call (how full its window got), the rest are what its replies read and wrote
 * this session and in all. `unmeasured` counts its replies without counts (older ones, or an engine that sends none).
 */
export type ContextUse = {
  last: number; limit: number; sessionIn: number; sessionOut: number; totalIn: number; totalOut: number; replies: number; unmeasured: number;
};
export function contextOf(agent: Agent, thread: Thread, sessionStart: number): ContextUse {
  const use: ContextUse = { last: 0, limit: contextLimit, sessionIn: 0, sessionOut: 0, totalIn: 0, totalOut: 0, replies: 0, unmeasured: 0 };
  thread.messages.forEach((message, index) => {
    if (message.role !== "agent" || (message.agentId ?? atlasId) !== agent.id) return;
    use.replies++;
    if (!message.usage) { use.unmeasured++; return; }
    use.totalIn += message.usage.input;
    use.totalOut += message.usage.output;
    if (index < sessionStart) return;
    use.sessionIn += message.usage.input;
    use.sessionOut += message.usage.output;
    use.last = message.usage.peak || message.usage.input;
  });
  return use;
}
