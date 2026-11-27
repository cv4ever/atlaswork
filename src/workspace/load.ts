// Loaded (or absent) data brought up to the current shape: domains exist, the default comes first, items have owners.
import { atlasAgent, atlasId, defaultDomain, domainHues } from "../model.ts";
import type { Agent, ChatMessage, Domain, EveryAgent, Note, Project, Task, Thread, WorkspaceData } from "../model.ts";
import type { Block } from "../blocks.ts";
import { defaultRoutines, newRoutine, withCurrentRoutines } from "../routines.ts";
import { withCurrentRules } from "../suggestedAgents.ts";
import { swap } from "./change.ts";
import type { Change, Changes } from "./change.ts";

/** Brings loaded (or absent) data up to the current shape: domains exist, the default comes first, items have owners. */
export function normalize(loaded: WorkspaceData | null, legacyDomains: Domain[] = []): Change {
  const data: WorkspaceData = loaded
    ?? { domains: [], projects: [], notes: [], tasks: [], topics: [], agents: [], teams: [], threads: [], routineRuns: {}, briefs: {}, memories: [], runs: [] };
  // Domains used to live in the UI session; an older store has none of its own.
  let domains = data.domains.length ? data.domains : legacyDomains;
  // Projects created before domains existed still name an area; give each one a domain.
  const hues = Object.values(domainHues);
  for (const area of new Set(data.projects.map((project) => project.area)))
    if (!domains.some((domain) => domain.name === area))
      domains = [...domains, { name: area, emoji: "🌱", hue: hues[domains.length % hues.length], intention: "" }];
  if (!domains.some((domain) => domain.hue === "")) domains = [defaultDomain, ...domains];
  // Pages briefly listed widget names (2026-11-06); each name becomes a block of that kind.
  const named = (list?: unknown[]) => !!list?.some((item) => typeof item === "string");
  const blocks = <T extends Block[] | null | undefined>(list: T): T =>
    (list && list.map((item) => typeof item === "string" ? { id: item, type: item } : item)) as T;
  if (domains.some((domain) => named(domain.widgets))) domains = domains.map((domain) => ({ ...domain, widgets: blocks(domain.widgets) }));
  const paged = data.projects.filter((project) => named(project.widgets)).map((project) => ({ ...project, widgets: blocks(project.widgets) }));
  // Notes and tasks saved before ownership existed inherit their project's domain, or the default. Topic resources have none.
  const projectArea = new Map(data.projects.map((project) => [project.id, project.area]));
  const owned = <T extends Note | Task>(item: T): T => item.domain || ("topicId" in item && item.topicId) ? item : {
    ...item, domain: projectArea.get(item.projectId) ?? domains[0].name,
    projectId: projectArea.has(item.projectId) ? item.projectId : "" };
  // Resources used to be notes flagged `resource`; every note is a resource now.
  const notes = data.notes.filter((note) => (!note.domain && !note.topicId) || "resource" in note)
    .map(({ resource: _flag, ...note }: Note & { resource?: boolean }) => owned(note));
  const tasks = data.tasks.filter((task) => !task.domain).map(owned);
  // The dev-only omp chat (removed 2026-11-10, agents-design D30) kept links on agents and native sessions on threads.
  // The Calendar tool switch (D74) became Google Calendar access (D83, 2026-11-23): on keeps what it allowed, events
  // with Add, also while you're away; off was the default and leaves nothing.
  type OldFields = Agent & { ompAgent?: string; ompThinking?: string; tools?: Agent["tools"] & { calendar?: boolean } };
  const unlinked = (data.agents as OldFields[]).filter((agent) => "ompAgent" in agent || "ompThinking" in agent || (agent.tools && "calendar" in agent.tools))
    .map(({ ompAgent: _link, ompThinking: _thinking, ...agent }): Agent => {
      if (!agent.tools || !("calendar" in agent.tools)) return agent;
      const { calendar, ...tools } = agent.tools;
      return { ...agent, tools, ...calendar && !agent.access?.calendar && { access: { ...agent.access, calendar: { level: "add", away: true } } } };
    });
  type Sessioned = Thread & { ompSessions?: unknown; engineSessions?: unknown };
  const unsessioned = (data.threads as Sessioned[]).filter((thread) => "ompSessions" in thread || "engineSessions" in thread)
    .map(({ ompSessions: _omp, engineSessions: _engine, ...thread }): Thread => thread);
  // Atlas always exists and comes first.
  const missingAtlas = !data.agents.some((agent) => agent.id === atlasId);
  // Agents still holding an earlier default's role or house rules get today's (D41).
  const unruled = swap(data.agents, unlinked);
  const current = unruled.map(withCurrentRules);
  const ruled = current.filter((agent, index) => agent !== unruled[index]);
  const agents = missingAtlas ? [atlasAgent, ...current] : current;
  // Projects briefly kept an ordered `crew`; its first member becomes the assigned agent.
  const crewed = swap(data.projects, paged).filter((project): project is Project & { crew: string[] } => "crew" in project)
    .map(({ crew, ...project }) => ({ ...project, agentId: project.agentId ?? crew[0] }));
  const projects = swap(swap(data.projects, paged), crewed);
  const reprojected = [...new Map([...paged, ...crewed].map((project) => [project.id, projects.find((item) => item.id === project.id)!])).values()];
  // Agents used to keep check-in and report weekdays; those become morning and evening routines. An agent with neither
  // (a newly added Atlas, the demo cast) gets today's defaults (agents-design D68), the crew taking weekdays in turn;
  // all but the check-in wait for their first day, so a new workspace spends no replies reviewing nothing on first open.
  type Legacy = Agent & { checkInDays?: number[]; reportDays?: number[] };
  const since = new Date().toISOString();
  const turns = new Map(agents.filter((agent) => agent.id !== atlasId && !agent.archived).map((agent, index) => [agent.id, index]));
  const scheduled = agents.filter((agent) => !agent.routines).map(({ checkInDays, reportDays, ...agent }: Legacy): Agent => ({
    ...agent, routines: !checkInDays && !reportDays
      ? defaultRoutines(agent.id, turns.get(agent.id) ?? 0, "").map((routine) => routine.kind === "check-in" ? routine : { ...routine, since }) : [
      ...checkInDays?.length ? [{ ...newRoutine("check-in", ""), repeat: { every: "week" as const, days: checkInDays, weeks: 1 } }] : [],
      ...reportDays?.length ? [{ ...newRoutine("report", ""), repeat: { every: "week" as const, days: reportDays, weeks: 1 } }] : [],
    ] }));
  // Agents still on the check-in every agent used to get move to today's defaults (D68); routines you changed stay.
  const routined = swap(agents, scheduled);
  const rescheduled = routined.map((agent) => withCurrentRoutines(agent, turns.get(agent.id) ?? 0, since)).filter((agent, index) => agent !== routined[index]);
  // Messages flagged `checkIn` (and `report`) came from routines before routines had ids.
  type OldMessage = ChatMessage & { checkIn?: boolean; report?: boolean };
  const rethreaded = swap(data.threads, unsessioned);
  const oldPage = (message: ChatMessage) => message.proposal?.changes?.some((change) => change.kind === "page" && (named(change.to) || named(change.from ?? [])));
  const threads = rethreaded.filter((thread) => thread.messages.some((message: OldMessage) => "checkIn" in message || oldPage(message))).map((thread) => ({
    ...thread, messages: thread.messages.map(({ checkIn, report, ...message }: OldMessage) => ({
      ...checkIn ? { ...message, routine: { id: "", kind: report ? "report" as const : "check-in" as const, due: message.at ?? "" } } : message,
      ...oldPage(message) && { proposal: { ...message.proposal!, changes: message.proposal!.changes!.map((change) => change.kind === "page"
        ? { ...change, to: blocks(change.to), from: blocks(change.from) } : change) } } })) }));
  const migratedAgents = swap(swap(agents, scheduled), rescheduled).filter((agent) => scheduled.includes(agent) || rescheduled.includes(agent)
    || ruled.includes(agent) || unlinked.some((item) => item.id === agent.id));
  const migratedThreads = swap(rethreaded, threads).filter((thread) => threads.includes(thread) || unsessioned.some((item) => item.id === thread.id));
  const changes: Changes = {};
  if (domains !== data.domains) changes.domains = domains;
  if (notes.length) changes.notes = notes;
  if (tasks.length) changes.tasks = tasks;
  if (migratedAgents.length) changes.agents = migratedAgents;
  // New agents started with the Calendar switch from Settings → Every agent (D46); connections start off now (D83).
  const everyTools = data.everyAgent?.tools as (EveryAgent["tools"] & { calendar?: boolean }) | undefined;
  const everyAgent = everyTools && "calendar" in everyTools
    ? { ...data.everyAgent!, tools: Object.fromEntries(Object.entries(everyTools).filter(([id]) => id !== "calendar")) } : data.everyAgent;
  if (everyAgent !== data.everyAgent) changes.everyAgent = everyAgent;
  if (reprojected.length) changes.projects = reprojected;
  if (migratedThreads.length) changes.threads = migratedThreads;
  return {
    data: { ...data, ...everyAgent !== data.everyAgent && { everyAgent }, teams: data.teams ?? [], topics: data.topics ?? [],
      routineRuns: data.routineRuns ?? {}, briefs: data.briefs ?? {},
      memories: data.memories ?? [], runs: data.runs ?? [], domains, agents: swap(swap(agents, scheduled), rescheduled),
      projects, notes: swap(data.notes, notes), tasks: swap(data.tasks, tasks), threads: swap(rethreaded, threads) },
    changes,
  };
}
