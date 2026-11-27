// The first-run flow's content and its one workspace edit (agents-design D34): which domains and agents to suggest,
// and `applyOnboarding`, which creates what was picked in one changeset. OnboardingDialog.tsx draws it.
import { atlasId, defaultDomain, domainHues } from "./model.ts";
import type { Agent, Domain, Places, WorkspaceData } from "./model.ts";
import { createAgent, createDomain, setAgentArchived, setArchived, weeklyImprovement } from "./workspace.ts";
import { domainPageFor } from "./starterProjects.ts";
import type { Change, Changes, DomainDraft } from "./workspace.ts";
import type { AgentSuggestion } from "./suggestedAgents.ts";

export type DomainSuggestion = DomainDraft & { starter?: boolean };
/** Starters are ticked when the flow opens: Health alone, so a first workspace starts small (Carlos, 2026-11-14). */
export const suggestedDomains: DomainSuggestion[] = [
  { name: "Health", emoji: "🌿", hue: domainHues.Sage, intention: "Sleep, movement, what I eat.", starter: true },
  { name: "Family", emoji: "🏡", hue: domainHues.Clay, intention: "The people I come home to." },
  { name: "Finance", emoji: "🪙", hue: domainHues.Marigold, intention: "Money in, money out, money kept." },
  { name: "Career", emoji: "🧭", hue: domainHues.Lagoon, intention: "Work, growth, what's next." },
  { name: "Business", emoji: "🏢", hue: domainHues.Plum, intention: "Customers, offers, the numbers behind them." },
  { name: "Home", emoji: "🛠️", hue: domainHues.Moss, intention: "Repairs, chores, the place itself." },
  { name: "Learning", emoji: "📚", hue: domainHues.Sky, intention: "Courses, books, skills in progress." },
  { name: "Creative", emoji: "🎨", hue: domainHues.Iris, intention: "Making things for the joy of it." },
  { name: "Fitness", emoji: "🏃", hue: domainHues.Pine, intention: "Training, races, personal bests." },
  { name: "Mind", emoji: "🧘", hue: domainHues.Iris, intention: "Calm, focus, rest." },
  { name: "Friends", emoji: "💛", hue: domainHues.Rose, intention: "Plans, birthdays, staying in touch." },
  { name: "Travel", emoji: "✈️", hue: domainHues.Sky, intention: "Places to go, trips to plan." },
  { name: "Pets", emoji: "🐾", hue: domainHues.Marigold, intention: "Vet dates, walks, treats." },
];

export type OnboardingPicks = {
  /** Names of picked domains, suggested or your own. */
  domains: string[];
  /** Domains you named yourself; only the picked ones are created. */
  own: DomainSuggestion[];
  agents: AgentSuggestion[];
  /** Agents from the community, already turned into Agent drafts. */
  shared: Omit<Agent, "archived" | "restore">[];
  /** What you had and unticked when running setup again: archived, never deleted. Everyday and Atlas always stay. */
  archive?: { domains: string[]; agentIds: string[] };
};

/**
 * Applies the picks in one changeset. Domains and agents you unticked on a second run are archived first (agents
 * before domains, so a domain they leave can take a new steward); Archive restores them. Domains the workspace
 * already has are kept as they are, and an agent whose name is taken (by the crew, an earlier pick or a community
 * pick) is left out, so running twice is harmless. The first picked agent per domain looks after it when it exists
 * and nobody but Atlas looks after it yet; the rest start on the bench, so running the flow again never takes a
 * domain from its steward. Every agent gets a weekly improvement on the quietest weekday (agents-design D68); Atlas's
 * morning check-in reads every place's notes.
 */
export function applyOnboarding(data: WorkspaceData, picks: OnboardingPicks, since: string): Change {
  let current = data;
  let domainsChanged = false;
  const touched = { agents: new Set<string>(), projects: new Set<string>(), teams: new Set<string>() };
  const take = (made: Change) => {
    current = made.data;
    domainsChanged ||= !!made.changes.domains;
    for (const key of ["agents", "projects", "teams"] as const) for (const item of made.changes[key] ?? []) touched[key].add(item.id);
  };
  for (const id of picks.archive?.agentIds ?? [])
    if (id !== atlasId && current.agents.some((agent) => agent.id === id && !agent.archived)) take(setAgentArchived(current, id, true));
  for (const name of picks.archive?.domains ?? [])
    if (name !== defaultDomain.name && current.domains.some((domain) => domain.name === name && !domain.archived)) take(setArchived(current, { kind: "domain", id: name }, true));
  const named = (name: string) => current.domains.find((domain) => domain.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const existing = (name: string) => { const domain = named(name); return domain && !domain.archived ? domain : undefined; };
  for (const suggestion of [...suggestedDomains, ...picks.own].filter((item) => picks.domains.includes(item.name) && !existing(item.name))) {
    // One you archived before comes back from the Archive with everything in it, rather than a second of the same name.
    const archived = named(suggestion.name);
    if (archived) { take(setArchived(current, { kind: "domain", id: archived.name }, false)); continue; }
    const { starter: _starter, ...draft } = suggestion;
    take(createDomain(current, { ...draft, widgets: domainPageFor(draft.name) }));
  }
  const nameTaken = (name: string) => current.agents.some((agent) => agent.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const drafts = [
    ...picks.agents.map(({ domain, why: _why, says: _says, work: _work, ...agent }) => ({ agent: { id: crypto.randomUUID(), ...agent }, domain })),
    ...picks.shared.map((agent) => ({ agent, domain: undefined })),
  ];
  const stewarded = new Set<string>();
  for (const { agent, domain } of drafts) {
    if (nameTaken(agent.name)) continue;
    const found = domain && !stewarded.has(domain) ? existing(domain) : undefined;
    const home = found && !stewardOf(current, found) ? found : undefined;
    if (home) stewarded.add(domain!);
    const places: Places = { domains: home ? [home.name] : [], projectIds: [], teamIds: [] };
    take(createAgent(current, { ...agent, routines: [weeklyImprovement(current, since)] }, places));
  }
  const changes: Changes = {};
  if (domainsChanged) changes.domains = current.domains;
  if (touched.agents.size) changes.agents = current.agents.filter((item) => touched.agents.has(item.id));
  if (touched.projects.size) changes.projects = current.projects.filter((item) => touched.projects.has(item.id));
  if (touched.teams.size) changes.teams = current.teams.filter((item) => touched.teams.has(item.id));
  return { data: current, changes };
}

/** A workspace nobody has used yet: Atlas alone, with nothing written down. */
export const untouched = (data: WorkspaceData) =>
  data.agents.every((agent) => agent.id === atlasId) && !data.projects.length && !data.notes.length && !data.tasks.length;

/** The agent looking after `domain`, unless that's Atlas, who leads everywhere, or an archived one. */
const stewardOf = (data: WorkspaceData, domain: Domain) =>
  domain.agentId && domain.agentId !== atlasId ? data.agents.find((agent) => agent.id === domain.agentId && !agent.archived) : undefined;

/** An agent already in the crew, as the flow shows it: `home` is the domain they look after, if any. */
export type CrewMember = Pick<Agent, "id" | "name" | "portrait" | "role" | "instructions" | "writeMode"> & { home?: string };
/**
 * What the flow starts from: the domains the workspace already has (Everyday first, fixed, with Atlas in charge; the
 * rest ticked, and archived if you untick them), the crew (ticked, the same way), and which domains have a steward,
 * so the flow ticks one only where nobody but Atlas looks after it yet.
 */
export type OnboardingStart = { kept: DomainSuggestion[]; crew: CrewMember[]; stewarded: string[] };
export function onboardingStart(data: WorkspaceData): OnboardingStart {
  const live = data.domains.filter((domain) => !domain.archived);
  const everyday = live.find((domain) => domain.name === defaultDomain.name) ?? defaultDomain;
  return {
    kept: [everyday, ...live.filter((domain) => domain !== everyday)].map(({ name, emoji, hue, intention }) => ({ name, emoji, hue, intention })),
    crew: data.agents.filter((agent) => agent.id !== atlasId && !agent.archived).map(({ id, name, portrait, role, instructions, writeMode }) =>
      ({ id, name, portrait, role, instructions, writeMode, home: live.find((domain) => domain.agentId === id)?.name })),
    stewarded: live.filter((domain) => stewardOf(data, domain)).map((domain) => domain.name),
  };
}
