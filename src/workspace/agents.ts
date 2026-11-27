// Agents and teams: creation, current-record edits, where an agent works (`placeAgent`), archiving and restoring,
// and what every agent shares (D46).
import { limits } from "../../supabase/functions/agent/logic.ts";
import { atlasId } from "../model.ts";
import type { Agent, EveryAgent, Places, Team, WorkspaceData } from "../model.ts";
import { unchanged, upsert, swap } from "./change.ts";
import type { Change, Changes } from "./change.ts";

/**
 * Settings → Every agent (D46): merges `patch` into what every agent shares. A key set to undefined goes back to the
 * built-in default (Even, Balanced, each tool's own default); rules are kept as typed, within the function's limit.
 */
export function saveEveryAgent(data: WorkspaceData, patch: Partial<EveryAgent>): Change {
  const merged: EveryAgent = { rules: "", ...data.everyAgent, ...patch };
  const next = Object.fromEntries(Object.entries({ ...merged, rules: merged.rules.slice(0, limits.everyAgent) })
    .filter(([key, value]) => value !== undefined && !(key === "tools" && !Object.keys(value as object).length))) as EveryAgent;
  if (JSON.stringify(next) === JSON.stringify(data.everyAgent ?? { rules: "" })) return unchanged(data);
  return { data: { ...data, everyAgent: next }, changes: { everyAgent: next } };
}

export type TeamDraft = Omit<Team, "id">;

/** Internal Team write. The first member leads and names remain unique. */
function saveTeam(data: WorkspaceData, draft: Team): Change {
  const team = { ...draft, name: draft.name.trim(), purpose: draft.purpose.trim(), memberIds: [...new Set(draft.memberIds)] };
  if (!team.name) throw new Error("A team needs a name.");
  if (!team.memberIds.length) throw new Error("A team needs at least one agent.");
  if (data.teams.some((item) => item.id !== team.id && item.name.toLocaleLowerCase() === team.name.toLocaleLowerCase()))
    throw new Error(`There's already a team called ${team.name}.`);
  return { data: { ...data, teams: upsert(data.teams, team) }, changes: { teams: [team] } };
}

export function createTeam(data: WorkspaceData, draft: Team): Change {
  if (data.teams.some((team) => team.id === draft.id)) throw new Error("That team already exists.");
  validateMembers(data, draft.memberIds);
  return saveTeam(data, draft);
}

export function editTeam(data: WorkspaceData, id: string, patch: Partial<TeamDraft>): Change {
  const current = data.teams.find((team) => team.id === id);
  if (!current) throw new Error("That team no longer exists.");
  if (!Object.keys(patch).length) return unchanged(data);
  if (patch.memberIds) validateMembers(data, patch.memberIds);
  return saveTeam(data, { ...current, ...patch });
}

function validateMembers(data: WorkspaceData, ids: string[]) {
  if (ids.some((id) => !data.agents.some((agent) => agent.id === id && !agent.archived)))
    throw new Error("A chosen team member no longer exists or is archived.");
}

/** Removes a team: projects it worked on keep their agent, and its room goes too. */
export function deleteTeam(data: WorkspaceData, id: string): Change {
  const projects = data.projects.filter((project) => project.teamId === id).map((project) => ({ ...project, teamId: undefined }));
  const room = `team:${id}`;
  return {
    data: { ...data, teams: data.teams.filter((team) => team.id !== id), projects: swap(data.projects, projects),
      threads: data.threads.filter((thread) => thread.id !== room) },
    changes: { projects, deletedTeamIds: [id], deletedThreadIds: data.threads.some((thread) => thread.id === room) ? [room] : [] },
  };
}

export const placesOf = (data: WorkspaceData, id: string): Places => ({
  domains: data.domains.filter((domain) => domain.agentId === id).map((domain) => domain.name),
  projectIds: data.projects.filter((project) => project.agentId === id).map((project) => project.id),
  teamIds: data.teams.filter((team) => team.memberIds.includes(id)).map((team) => team.id),
});

export type AgentPatch = Partial<Omit<Agent, "id" | "archived" | "restore">>;

/** Only explicitly added or removed assignments change; other assignments keep their current owner. */
export type PlaceEdits = { add?: Partial<Places>; remove?: Partial<Places> };

/** Internal Agent write. Callers use explicit creation or current-record edits. */
function saveAgent(data: WorkspaceData, draft: Agent, places?: Places): Change {
  const agent = { ...draft, name: draft.name.trim(), role: draft.role.trim(), instructions: draft.instructions.trim() };
  if (!agent.name) throw new Error("An agent needs a name.");
  if (data.agents.some((item) => item.id !== agent.id && item.name.toLocaleLowerCase() === agent.name.toLocaleLowerCase()))
    throw new Error(`There's already an agent called ${agent.name}.`);
  const placed = places && agent.id !== atlasId ? placeAgent(data, agent.id, places) : unchanged(data);
  return { data: { ...placed.data, agents: upsert(data.agents, agent) }, changes: { ...placed.changes, agents: [agent] } };
}

export function createAgent(data: WorkspaceData, draft: Omit<Agent, "archived" | "restore">, places?: Places): Change {
  if (data.agents.some((agent) => agent.id === draft.id)) throw new Error("That agent already exists.");
  return saveAgent(data, draft, places);
}

/** Profile, individual tools and explicit assignment edits meet the current Agent. Archive/restore has its own transition. */
export function editAgent(data: WorkspaceData, id: string, patch: AgentPatch, edits: PlaceEdits = {}): Change {
  const current = data.agents.find((agent) => agent.id === id);
  if (!current) throw new Error("That agent no longer exists.");
  const keys = ["domains", "projectIds", "teamIds"] as const;
  const moving = keys.some((key) => edits.add?.[key]?.length || edits.remove?.[key]?.length);
  if (!Object.keys(patch).length && !moving) return unchanged(data);
  if (moving && current.archived) throw new Error("Restore this agent before changing where they work.");
  let places: Places | undefined;
  if (moving) {
    places = placesOf(data, id);
    for (const key of keys)
      places[key] = [...new Set([...places[key].filter((value) => !edits.remove?.[key]?.includes(value)), ...edits.add?.[key] ?? []])];
  }
  const agent = { ...current, ...patch, ...(patch.tools ? { tools: { ...current.tools, ...patch.tools } } : {}) };
  return saveAgent(data, agent, places);
}

/**
 * Puts an agent exactly in `places`: a domain or project it takes over loses its previous agent, and it joins teams
 * last (the lead stays). A team can't be left empty.
 */
function placeAgent(data: WorkspaceData, id: string, places: Places): Change {
  if (places.domains.some((name) => !data.domains.some((domain) => domain.name === name))
    || places.projectIds.some((pid) => !data.projects.some((project) => project.id === pid))
    || places.teamIds.some((tid) => !data.teams.some((team) => team.id === tid)))
    throw new Error("A chosen place no longer exists.");
  const domains = data.domains.map((domain) => {
    const on = places.domains.includes(domain.name);
    return on === (domain.agentId === id) ? domain : { ...domain, agentId: on ? id : undefined };
  });
  const projects = data.projects.filter((project) => places.projectIds.includes(project.id) !== (project.agentId === id))
    .map((project) => ({ ...project, agentId: places.projectIds.includes(project.id) ? id : undefined }));
  const teams = data.teams.filter((team) => places.teamIds.includes(team.id) !== team.memberIds.includes(id))
    .map((team) => ({ ...team, memberIds: places.teamIds.includes(team.id)
      ? [...team.memberIds, id] : team.memberIds.filter((member) => member !== id) }));
  const emptied = teams.find((team) => !team.memberIds.length);
  if (emptied) throw new Error(`${emptied.name} would be left with nobody. Disband it instead.`);
  const changes: Changes = {};
  if (domains.some((domain, index) => domain !== data.domains[index])) changes.domains = domains;
  if (projects.length) changes.projects = projects;
  if (teams.length) changes.teams = teams;
  return { data: { ...data, domains, projects: swap(data.projects, projects), teams: swap(data.teams, teams) }, changes };
}

/** Takes an agent off every domain, project, and team; the nearest-owner chain covers the gap. */
function unassign(data: WorkspaceData, id: string) {
  const domains = data.domains.some((domain) => domain.agentId === id)
    ? data.domains.map((domain) => (domain.agentId === id ? { ...domain, agentId: undefined } : domain)) : data.domains;
  const projects = data.projects.filter((project) => project.agentId === id).map((project) => ({ ...project, agentId: undefined }));
  const teams = data.teams.filter((team) => team.memberIds.includes(id))
    .map((team) => ({ ...team, memberIds: team.memberIds.filter((member) => member !== id) }));
  const changes: Changes = { projects, teams };
  if (domains !== data.domains) changes.domains = domains;
  return { data: { ...data, domains, projects: swap(data.projects, projects), teams: swap(data.teams, teams) }, changes };
}

/**
 * Archiving an agent unassigns it, remembers where it worked, and keeps its thread read-only. Restoring puts it back
 * in the remembered places nobody else has taken since. Atlas can't be archived.
 */
export function setAgentArchived(data: WorkspaceData, id: string, archived: boolean): Change {
  if (id === atlasId) throw new Error("Atlas stays. You can configure him, but not archive him.");
  const { restore, ...current } = data.agents.find((item) => item.id === id)!;
  if (archived) {
    const agent = { ...current, archived, restore: placesOf(data, id) };
    const base = unassign(data, id);
    return { data: { ...base.data, agents: upsert(base.data.agents, agent) }, changes: { ...base.changes, agents: [agent] } };
  }
  const agent = { ...current, archived };
  const live = (agentId?: string) => data.agents.some((item) => item.id === agentId && !item.archived);
  const base = restore ? placeAgent(data, id, {
    domains: restore.domains.filter((name) => data.domains.some((domain) => domain.name === name && !live(domain.agentId))),
    projectIds: restore.projectIds.filter((pid) => data.projects.some((project) => project.id === pid && !live(project.agentId))),
    teamIds: restore.teamIds.filter((tid) => data.teams.some((team) => team.id === tid)),
  }) : unchanged(data);
  return { data: { ...base.data, agents: upsert(base.data.agents, agent) }, changes: { ...base.changes, agents: [agent] } };
}

/** Removes an agent and its thread for good; tasks it added stay. */
export function deleteAgent(data: WorkspaceData, id: string): Change {
  if (id === atlasId) throw new Error("Atlas can't be deleted.");
  const base = unassign(data, id);
  const thread = `agent:${id}`;
  return {
    data: { ...base.data, agents: data.agents.filter((agent) => agent.id !== id), threads: data.threads.filter((item) => item.id !== thread) },
    changes: { ...base.changes, deletedAgentIds: [id], deletedThreadIds: data.threads.some((item) => item.id === thread) ? [thread] : [] },
  };
}
