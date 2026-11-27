// What a command reads from its request (D33): the asking agent's Workspace selection, its places, crew and open
// tasks, and the projects a draft names, bound to identities in that selection.
import { limits } from "../../supabase/functions/agent/logic.ts";
import { agentWorkspace } from "../agentWorkspace.ts";
import type { AgentWorkspace } from "../agentWorkspace.ts";
import type { AgentRequest } from "../agentRequest.ts";
import { domainHues } from "../model.ts";
import { quietestColour } from "../look.ts";
import { keepsData, shownBlocks } from "../blocks.ts";
import type { Project, Proposal } from "../model.ts";
import { suggestedAgents } from "../suggestedAgents.ts";
import type { AgentSuggestion } from "../suggestedAgents.ts";
import { homeKey } from "../place.ts";
import { keeperFor, pageOf } from "../workspace.ts";
import { records } from "./define.ts";

export type Source = Pick<AgentRequest, "agent" | "data" | "attached" | "routine" | "asked" | "form" | "offers" | "land" | "ranOn" | "computers">;
export type Request = Source & { workspace: AgentWorkspace };
export const prepare = (source: Source, workspace = agentWorkspace(source)): Request => ({ ...source, workspace });
export const openTasks = (request: Request) => request.workspace.tasks;

/** Open titles as the function checks them: the newest it accepts, minus any too long to name. */
export const openTitles = (request: Request) => openTasks(request).map((task) => task.title)
  .filter((title) => title.length <= limits.title).slice(-limits.items);

const dayMs = 864e5;
type Home = { domain: string; projectId: string; topicId?: string };
export const lower = (text: string) => text.trim().toLocaleLowerCase();

/** The agent's domains among its places, where it may start a project (D61). */
export const domainsOf = (request: Request) => [...request.workspace.places].filter(([, home]) => !home.projectId && !home.topicId).map(([name]) => name);

/**
 * The projects a draft names (D61), by lowercased title: a new one in one of the agent's domains, or the live project
 * of that title already there, so asking twice never makes a second one. A new one takes the colour its domain uses least.
 */
export function namedProjects(request: Request, value: unknown, max: number) {
  const found = new Map<string, { home: Home; project?: Project }>();
  const made: Project[] = [];
  for (const { title, domain, goal } of records(value, "title").slice(0, max)) {
    const name = title?.trim().slice(0, 80) ?? "";
    const area = typeof domain === "string" ? request.workspace.places.get(domain) : undefined;
    if (!name || !area || area.projectId || area.topicId || found.has(lower(name))) continue;
    const existing = [...request.workspace.places].find(([place, home]) => home.projectId && home.domain === area.domain && lower(place) === lower(`${area.domain} / ${name}`));
    if (existing) { found.set(lower(name), { home: existing[1] }); continue; }
    const color = quietestColour(request.data.projects, area.domain, made);
    const project: Project = { id: crypto.randomUUID(), title: name, area: area.domain, description: goal?.trim() ?? "", color };
    made.push(project);
    found.set(lower(name), { home: { domain: area.domain, projectId: project.id }, project });
  }
  return found;
}

/** Where a drafted item goes: the project it names from the draft's projects, else its place. */
export const homeIn = (request: Request, projects: ReturnType<typeof namedProjects>, place: unknown, project: unknown): Home | undefined =>
  (typeof project === "string" ? projects.get(lower(project))?.home : undefined) ?? (typeof place === "string" ? request.workspace.places.get(place) : undefined);

/** The new projects some item landed in; a named project nothing went into isn't made. */
export const madeFor = (projects: ReturnType<typeof namedProjects>, used: { projectId: string }[]) =>
  [...projects.values()].flatMap(({ project }) => project && used.some((item) => item.projectId === project.id) ? [project] : []);

/**
 * The domain Atlas plants with a project (D61) and its keeper as the domain dialog would preselect them (D51): the
 * suggested agent for that name, else a keeper of its own. The colour is one no domain wears yet. Undefined for a name
 * already here, which then counts as that domain.
 */
export function plantFor(request: Request, value: unknown): Proposal["plant"] {
  const [wanted] = records(value, "name");
  const name = wanted?.name?.trim().slice(0, 40);
  if (!name || request.data.domains.some((domain) => lower(domain.name) === lower(name))) return undefined;
  const intention = wanted.purpose?.trim() ?? "";
  const used = new Set(request.data.domains.map((domain) => domain.hue));
  const hue = Object.values(domainHues).find((value) => !used.has(value)) ?? domainHues.Sage;
  const { agent, isNew } = keeperFor(request.data, { name, intention }, { since: new Date().toISOString() });
  return { domain: { name, emoji: wanted.emoji?.trim() || "🌱", hue, intention, agentId: agent.id }, ...isNew && { agent },
    keeper: { name: agent.name, portrait: agent.portrait } };
}

/**
 * The agent's places by domain, each project with what it is for (D61), for the lookups before planning a project or
 * moving tasks; a domain it only reaches through projects says so. Never more than a lookup holds.
 */
export function placesText(request: Request) {
  const project = (id: string) => request.data.projects.find((item) => item.id === id)!;
  const homes = [...request.workspace.places.values()].filter((home) => !home.topicId);
  const own = new Set(domainsOf(request));
  return [...new Set(homes.map((home) => home.domain))].map((domain) => {
    const inIt = homes.filter((home) => home.projectId && home.domain === domain).map((home) => project(home.projectId))
      .map((item) => `${item.title}${item.description.trim() ? ` (${item.description.trim().slice(0, 120)})` : ""}`);
    return `${domain}${own.has(domain) ? "" : " (only these projects)"}: ${inIt.join("; ") || "no projects yet"}`;
  }).join("\n").slice(0, limits.text) || "No places yet.";
}

/**
 * Open tasks sitting straight in a domain that has projects among the agent's places, and those projects (D61): what
 * a review may file into a project. Titles past what the function names are left out, as `openTitles` does.
 */
export function looseTasks(request: Request) {
  const projects = [...request.workspace.places].filter(([, home]) => home.projectId);
  const withProjects = new Set(projects.map(([, home]) => home.domain));
  const loose = openTasks(request).filter((task) => !task.projectId && withProjects.has(task.domain) && task.title.length <= limits.title).slice(-limits.items);
  return { loose, projects: loose.length ? projects.filter(([, home]) => loose.some((task) => task.domain === home.domain)).map(([place]) => place) : [] };
}

export const liveDomains = (request: Request) => request.data.domains.filter((domain) => !domain.archived).map((domain) => domain.name);

/** Who may lead a project or look after a domain: the active crew, Atlas included. */
export const crewOf = (request: Request) => request.data.agents.filter((agent) => !agent.archived);
export const named = <T extends { name: string }>(list: T[], name: unknown) => typeof name === "string" ? list.find((item) => lower(item.name) === lower(name)) : undefined;

/**
 * Agents Atlaswork suggests (D41) whose names nobody in the workspace has yet, for a new record's fill to bring in by
 * what they do (D63): a domain's keeper from those suggested for a domain (Tutor for a child's homework), whatever the
 * domain ends up called; a project's lead from those with no domain of their own (Forge for an app), the eight the
 * masthead's crew menu brings in too (D38). Listing all of them cost every later call of a project's reply about 400
 * tokens (D61). Edits only change hands in the crew.
 */
export const hireableFor = (request: Request, as: "keeper" | "lead" = "keeper") => request.form?.editing ? []
  : suggestedAgents.filter((agent) => (as === "lead" ? !agent.domain : agent.domain) && !named(request.data.agents, agent.name));
export const hireLine = (agent: AgentSuggestion) => `${agent.name} (${agent.role}: ${agent.why.toLocaleLowerCase()})`;

/**
 * Who may lead a new project, with what each does (D61): without the crew's roles Atlas looked them up first, a whole
 * extra call (2026-11-20). Each caller adds its own last choice.
 */
export const leadsLine = (request: Request) => {
  const hireable = hireableFor(request, "lead");
  return ` Who can lead it, by name: your crew, ${crewOf(request).map((agent) => `${agent.name} (${agent.role})`).join(", ")}`
    + (hireable.length ? `; a suggested agent to bring in, ${hireable.map(hireLine).join("; ")}` : "") + ".";
};

/**
 * Live projects among the agent's places that went quiet: no resource or task touched in `quietDays` (60 unless a
 * review routine says otherwise) and nothing open from today on. Without any timestamps a project isn't judged.
 */
export function quietProjects(source: Source | Request, now = new Date()) {
  const { data, routine } = source;
  const selected = "workspace" in source ? source.workspace : agentWorkspace(source);
  const today = now.toLocaleDateString("en-CA");
  const quietDays = routine?.quietDays ?? 60;
  const homes = [...selected.places.values()].filter((home) => home.projectId);
  return homes.flatMap(({ projectId }) => {
    const project = data.projects.find((item) => item.id === projectId)!;
    if (data.tasks.some((task) => task.projectId === projectId && !task.done && task.due >= today)) return [];
    const newest = [...data.notes.filter((note) => note.projectId === projectId && !note.archived).map((note) => note.updatedAt),
      ...data.tasks.filter((task) => task.projectId === projectId && task.updatedAt).map((task) => task.updatedAt!)].filter(Boolean).sort().at(-1);
    const days = newest ? Math.floor((now.getTime() - new Date(newest).getTime()) / dayMs) : 0;
    return days >= quietDays ? [{ project, days }] : [];
  });
}

/**
 * The data widgets on show where the agent works, for show_widgets (D64): each with its place's name and Home key and
 * the title the page lines call it by (`block.title`, else its kind).
 */
export const widgetsHere = (request: Request) => [...request.workspace.places].flatMap(([name, home]) =>
  shownBlocks(pageOf(request.data, homeKey(home)) ?? []).filter(keepsData)
    .map((block) => ({ name, place: homeKey(home), block, title: block.title || block.type })));
