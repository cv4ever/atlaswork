// Domain edits, keyed by name: a rename carries every Project, Resource, Task, memory and person (D71) along, and a new
// domain's keeper (agents-design D51).
import { freeName } from "../look.ts";
import type { Agent, Domain, Routine, WorkspaceData } from "../model.ts";
import { newRoutine } from "../routines.ts";
import { spareFaces, stewardForOwn, suggestedAgents } from "../suggestedAgents.ts";
import type { AgentSuggestion } from "../suggestedAgents.ts";
import { swap, unchanged } from "./change.ts";
import type { Change } from "./change.ts";
import { cleanBlocks } from "./clean.ts";

export type DomainDraft = Omit<Domain, "archived">;

/** Internal Domain write; a rename carries every Project, Resource and Task along. */
function saveDomain(data: WorkspaceData, original: string | null, draft: Domain): Change {
  const domain = { ...draft, name: draft.name.trim(), intention: draft.intention.trim(), ...draft.widgets && { widgets: cleanBlocks(draft.widgets) } };
  if (!domain.name) throw new Error("A domain needs a name.");
  const lower = domain.name.toLocaleLowerCase();
  if (data.domains.some((item) => item.name !== original && item.name.toLocaleLowerCase() === lower))
    throw new Error(`There is already a domain called ${domain.name}.`);
  const domains = original === null ? [...data.domains, domain]
    : data.domains.map((item) => (item.name === original ? domain : item));
  if (original === null || original === domain.name)
    return { data: { ...data, domains }, changes: { domains } };
  const projects = data.projects.filter((project) => project.area === original).map((project) => ({ ...project, area: domain.name }));
  const notes = data.notes.filter((note) => note.domain === original).map((note) => ({ ...note, domain: domain.name }));
  const tasks = data.tasks.filter((task) => task.domain === original).map((task) => ({ ...task, domain: domain.name }));
  const memories = data.memories.filter((memory) => memory.domain === original).map((memory) => ({ ...memory, domain: domain.name }));
  const topics = data.topics.filter((topic) => topic.person?.domain === original)
    .map((topic) => ({ ...topic, person: { ...topic.person!, domain: domain.name } }));
  return {
    data: { ...data, domains, projects: swap(data.projects, projects), notes: swap(data.notes, notes), tasks: swap(data.tasks, tasks),
      memories: swap(data.memories, memories), topics: swap(data.topics, topics) },
    changes: { domains, projects, notes, tasks, memories, topics },
    renamedDomain: { from: original, to: domain.name },
  };
}

export function createDomain(data: WorkspaceData, draft: DomainDraft): Change {
  return saveDomain(data, null, draft);
}

/**
 * How a new domain's own agent starts: its weekly improvement counts from `since`. `fresh` asks for a new agent even
 * when the one suggested for the domain is already in the crew (the dialog's other choice, D51). `start` names the
 * suggested agent to hire (Tutor for a domain of homework), as Describe it picks one whose work fits what you said
 * whatever the domain is called (D63). `role` and `instructions` word a new agent for the domain, as Describe it fills them.
 */
export type KeeperOptions = { since: string; fresh?: boolean; start?: string; role?: string; instructions?: string };

/**
 * The agent a new domain gets unless you pick another (agents-design D51): the agent suggested for a domain of that name
 * (Health's Vital) when it's already in the crew, else the first suggestion for it whose name is free as a new agent
 * (Learning's Polyglot once Scholar works here), else a keeper of its own (`stewardForOwn`) with a free name and a face
 * no suggestion or crew member wears. With `start`, that suggestion is the one hired while its name is free. A new one
 * starts with the tools every agent gets (D46) and a weekly improvement (D68) on the quietest weekday.
 */
export function keeperFor(data: WorkspaceData, domain: Pick<Domain, "name" | "intention">, { since, fresh, start, role, instructions }: KeeperOptions): { agent: Agent; isNew: boolean } {
  const lower = (text: string) => text.trim().toLocaleLowerCase();
  const suggestions = [...start ? suggestedAgents.filter((agent) => lower(agent.name) === lower(start)) : [],
    ...suggestedAgents.filter((agent) => agent.domain && lower(agent.domain) === lower(domain.name))];
  const named = (name: string) => data.agents.find((agent) => lower(agent.name) === lower(name));
  const member = !fresh && suggestions[0] && named(suggestions[0].name);
  if (member && !member.archived) return { agent: member, isNew: false };
  const suggested = suggestions.find((agent) => !named(agent.name));
  const usedFaces = new Set(data.agents.map((agent) => agent.portrait));
  const own = stewardForOwn({ name: domain.name.trim(), intention: domain.intention }, 0);
  const picked = suggested
    ?? { ...own, name: freeName(data) || `${own.name} ${data.agents.length}`, portrait: spareFaces.find((face) => !usedFaces.has(face)) ?? own.portrait };
  return { isNew: true, agent: agentFrom(data, { ...picked, ...role && { role }, ...instructions && { instructions } }, [weeklyImprovement(data, since)]) };
}

/**
 * A suggested agent (D41) as a new member of the crew: its name, face, role, house rules and warmth, the tools every
 * agent gets (D46) and `routines`. A domain's keeper starts with a weekly improvement (`keeperFor`); a project's lead with none.
 */
export function agentFrom(data: WorkspaceData, suggestion: AgentSuggestion, routines: Routine[] = []): Agent {
  const { domain: _domain, why: _why, says: _says, work: _work, ...picked } = suggestion;
  return { id: crypto.randomUUID(), ...picked, ...data.everyAgent?.tools && { tools: data.everyAgent.tools }, ...routines.length > 0 && { routines } };
}

/** A weekly improvement (D68) on the weekday, Monday to Friday, with the fewest weekly improvements already, so the crew takes turns. */
export function weeklyImprovement(data: WorkspaceData, since: string): Routine {
  const on = (day: number) => data.agents.filter((agent) => !agent.archived && agent.routines?.some((routine) => routine.kind === "improve"
    && !routine.paused && routine.repeat.every === "week" && routine.repeat.days.includes(day))).length;
  const busy = [1, 2, 3, 4, 5].map(on);
  return { ...newRoutine("improve", since), repeat: { every: "week", days: [busy.indexOf(Math.min(...busy)) + 1], weeks: 1 } };
}

/** Domains are keyed by name. A removed or concurrently renamed Domain cannot be edited under its old name. */
export function editDomain(data: WorkspaceData, name: string, patch: Partial<DomainDraft>): Change {
  const current = data.domains.find((domain) => domain.name === name);
  if (!current) throw new Error("That domain no longer exists.");
  if (!Object.keys(patch).length) return unchanged(data);
  return saveDomain(data, name, { ...current, ...patch });
}
