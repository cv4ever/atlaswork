// What the first run's picks are and how they move together (agents-design D34): the domains ticked, the ones you named
// yourself, the agents ticked, the crew you keep and the community agents you bring in. Picking a domain ticks its
// steward; unpicking it drops every agent suggested for it. An agent from a domain you didn't pick picks that domain,
// and unticking the last one there unpicks it again. Everyday is fixed, with Atlas looking after it. No React;
// picks.test.ts covers it, OnboardingDialog.tsx draws it.
import { defaultDomain, domainHues } from "../model.ts";
import { suggestedDomains } from "../onboarding.ts";
import type { DomainSuggestion, OnboardingStart } from "../onboarding.ts";
import { longWeekdays, turnDay } from "../routines.ts";
import { stewardForOwn, suggestedAgents } from "../suggestedAgents.ts";
import type { AgentSuggestion } from "../suggestedAgents.ts";

/** The picks so far; also what's kept in this tab while OpenRouter's sign-in leaves the page. */
export type Picks = { domains: string[]; own: DomainSuggestion[]; agents: string[]; keeping: string[]; shared: string[] };
/** The "Your own" tile while you name a domain and, optionally, say what it's for. */
export type Naming = { emoji: string; name: string; about: string };
/** A pick's next state, and the key whose burst plays when the pick was ticked on. */
export type Picked = { picks: Picks; burst?: string };

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

/** What the first run offers, given what the workspace already has and the domains you named. */
export function menuOf({ kept, crew }: OnboardingStart, own: DomainSuggestion[]) {
  const everyday = (domain: string) => same(domain, defaultDomain.name);
  const known = (domain: string) => kept.some((item) => same(item.name, domain));
  const inCrew = (agent: string) => crew.some((item) => same(item.name, agent));
  /** Domains you already have besides Everyday: ticked to start, archived when you finish if you untick them. */
  const yours = kept.filter((domain) => !everyday(domain.name));
  const isYours = (domain: string) => yours.some((item) => same(item.name, domain));
  const starters = suggestedDomains.filter((domain) => domain.starter && !known(domain.name)).map((domain) => domain.name);
  const allDomains = [...kept, ...suggestedDomains.filter((domain) => !known(domain.name)), ...own];
  const allAgents = [...suggestedAgents.filter((agent) => !inCrew(agent.name)), ...own.map(stewardForOwn)];
  /** The agent ticked for a domain the moment you pick it: the first one suggested for it. Atlas keeps Everyday. */
  const stewardOf = (domain: string) => allAgents.find((agent) => agent.domain && same(agent.domain, domain));
  const domainOf = (name?: string) => name ? allDomains.find((domain) => same(domain.name, name)) : undefined;
  return { everyday, yours, isYours, starters, allDomains, allAgents, stewardOf, domainOf };
}

/**
 * The picks a first run opens with: your domains and the starters ticked, with the starters' stewards and one for each
 * domain of yours that nobody but Atlas looks after, and the whole crew kept. A draft (back from OpenRouter) wins.
 */
export function firstPicks(start: OnboardingStart, draft: Picks | null): Picks {
  if (draft) return draft;
  const { yours, starters, stewardOf } = menuOf(start, []);
  const domains = [...yours.map((domain) => domain.name), ...starters];
  const agents = [...yours.filter((domain) => !start.stewarded.includes(domain.name)).map((domain) => domain.name), ...starters]
    .map((domain) => stewardOf(domain)?.name).filter((agent): agent is string => !!agent);
  return { domains, own: [], agents, keeping: start.crew.map((agent) => agent.id), shared: [] };
}

/** Ticks or unticks `id` in one of the plain lists: agents, the crew kept, community agents. */
export function toggle(picks: Picks, list: "agents" | "keeping" | "shared", id: string): Picked {
  const on = picks[list].includes(id);
  return { picks: { ...picks, [list]: on ? picks[list].filter((item) => item !== id) : [...picks[list], id] }, burst: on ? undefined : id };
}

/** Picks or unpicks a domain, ticking its steward or dropping every agent suggested for it. Everyday doesn't move. */
export function toggleDomain(start: OnboardingStart, picks: Picks, domain: string): Picked {
  const { everyday, allAgents, isYours, stewardOf } = menuOf(start, picks.own);
  if (everyday(domain)) return { picks };
  if (picks.domains.includes(domain)) return { picks: { ...picks,
    domains: picks.domains.filter((item) => item !== domain),
    agents: picks.agents.filter((picked) => allAgents.find((agent) => agent.name === picked)?.domain !== domain) } };
  const steward = stewardOf(domain);
  const tick = steward && !picks.agents.includes(steward.name) && !(isYours(domain) && start.stewarded.includes(domain));
  return { picks: { ...picks, domains: [...picks.domains, domain], agents: tick ? [...picks.agents, steward.name] : picks.agents }, burst: domain };
}

/** Whether the name being typed can be added: Everyday is refused; a name already listed is that domain. */
export function namingOf(start: OnboardingStart, picks: Picks, naming: Naming | null) {
  const name = naming?.name.trim() ?? "";
  const lower = name.toLocaleLowerCase();
  const { everyday, allDomains } = menuOf(start, picks.own);
  return { name, refused: everyday(name), listed: allDomains.find((domain) => domain.name.toLocaleLowerCase() === lower) };
}

/** Adds the domain you named, picked, with its steward ticked; a name already on the list ticks that one instead. */
export function addOwn(start: OnboardingStart, picks: Picks, naming: Naming): Picked {
  const { name, refused, listed } = namingOf(start, picks, naming);
  if (!name || refused) return { picks };
  if (listed) return picks.domains.includes(listed.name) ? { picks } : toggleDomain(start, picks, listed.name);
  const hues = Object.values(domainHues);
  const domain = { name, emoji: naming.emoji, hue: hues[picks.own.length % hues.length], intention: naming.about.trim() };
  return { picks: { ...picks, own: [...picks.own, domain], domains: [...picks.domains, domain.name],
    agents: [...picks.agents, stewardForOwn(domain, picks.own.length).name] }, burst: domain.name };
}

/** Ticks an agent from another domain and picks that domain; unticking the last one there unpicks it again. */
export function toggleElsewhere(start: OnboardingStart, picks: Picks, agent: AgentSuggestion): Picked {
  const domain = agent.domain!;
  if (!picks.agents.includes(agent.name)) return { picks: { ...picks, agents: [...picks.agents, agent.name],
    domains: picks.domains.includes(domain) ? picks.domains : [...picks.domains, domain] }, burst: agent.name };
  const { allAgents } = menuOf(start, picks.own);
  const rest = picks.agents.filter((name) => name !== agent.name);
  const lastThere = !rest.some((name) => allAgents.find((item) => item.name === name)?.domain === domain);
  return { picks: { ...picks, agents: rest, domains: lastThere ? picks.domains.filter((item) => item !== domain) : picks.domains } };
}

/**
 * Crew's groups. `crewFrom`: the domains picked when Crew opened, so a tile ticked further down stays where it is.
 * `elsewhere` holds agents for the domains you didn't pick, in the domains' order: ticking one picks its domain too.
 */
export function crewGroups(start: OnboardingStart, picks: Picks, crewFrom: string[]) {
  const { everyday, allAgents, allDomains } = menuOf(start, picks.own);
  const forDomains = allAgents.filter((agent) => agent.domain && (everyday(agent.domain) || crewFrom.includes(agent.domain)));
  const elsewhere = allAgents.filter((agent) => agent.domain && !forDomains.includes(agent))
    .sort((a, b) => allDomains.findIndex((domain) => domain.name === a.domain) - allDomains.findIndex((domain) => domain.name === b.domain));
  const general = allAgents.filter((agent) => !agent.domain && !agent.work);
  const work = allAgents.filter((agent) => agent.work);
  return { forDomains, elsewhere, general, work };
}

/** What finishing archives: your domains and crew members you unticked. */
export function archiveOf(start: OnboardingStart, picks: Picks) {
  const { yours } = menuOf(start, picks.own);
  return { domains: yours.filter((domain) => !picks.domains.includes(domain.name)).map((domain) => domain.name),
    agentIds: start.crew.filter((agent) => !picks.keeping.includes(agent.id)).map((agent) => agent.id) };
}

/** The suggested agents ticked, in the list's order. */
export const pickedAgents = (start: OnboardingStart, picks: Picks) => menuOf(start, picks.own).allAgents.filter((agent) => picks.agents.includes(agent.name));

/** The weekday the agent named `key` suggests improvements on: the crew takes turns, Monday to Friday (D68). */
export function cadenceOf(start: OnboardingStart, picks: Picks, key: string) {
  const index = [...pickedAgents(start, picks).map((agent) => agent.name), ...picks.shared].indexOf(key);
  return index >= 0 ? `${longWeekdays[turnDay(index)]}s` : "one weekday";
}

/**
 * Where an agent works, said once: looking after a domain, helping in one, or across them. The first one ticked for a
 * domain, in the list's order, looks after it (`applyOnboarding`), unless a crew member already does.
 */
export function placeOf(start: OnboardingStart, picks: Picks, agent: AgentSuggestion) {
  const { allAgents, domainOf } = menuOf(start, picks.own);
  const domain = domainOf(agent.domain);
  if (!domain) return agent.work ? "Works where you put them" : "Sees every domain";
  const first = allAgents.find((item) => item.domain && same(item.domain, domain.name) && (item === agent || picks.agents.includes(item.name)));
  return first === agent && !start.stewarded.includes(domain.name) ? `Looks after ${domain.name}` : `Helps in ${domain.name}`;
}
