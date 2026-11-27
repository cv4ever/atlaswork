// The Agent's Workspace: live records it may read, Homes it may propose changes in, and admission of already-bound
// targets. Scope remains assignment-only. An attachment extends change Homes, not the other records the agent reads;
// archiving always wins. Room checks admission against current records at reply completion and Apply, never resolving
// a title a second time. Model adapters have no store access. agentWorkspace.test.ts and workbench.test.ts cover it.
import { limits } from "../supabase/functions/agent/logic.ts";
import { scopeOf, sees } from "./agents.ts";
import { atlasId, byId, canUse, kindOf, noteTitle } from "./model.ts";
import { widgetKind } from "./blocks.ts";
import type { Agent, CommandOrigin, MessageLink, Note, Proposal, WorkspaceData } from "./model.ts";
import type { Block } from "./blocks.ts";
import { homeKey } from "./place.ts";
import { peopleOf } from "./people.ts";
import type { PersonTopic } from "./people.ts";
import { recall } from "./recall.ts";

type Home = { domain: string; projectId: string; topicId?: string };
/** `request`, the message being answered, picks the memories read once there are more than the request holds (D80). */
type Source = { data: WorkspaceData; agent: Agent; attached?: Note; request?: string };
export type Handoff = { links: MessageLink[]; origin: CommandOrigin };
export type AgentWorkspace = ReturnType<typeof agentWorkspace>;

/** A request's immutable selection. Read permissions and proposed-change Homes are deliberately distinct. */
export function agentWorkspace({ data, agent, attached: offered, request = "" }: Source) {
  const scope = scopeOf(data, agent.id);
  const domains = data.domains.filter((domain) => !domain.archived);
  const domainNames = new Set(domains.map((domain) => domain.name));
  const projects = data.projects.filter((project) => !project.archived && domainNames.has(project.area));
  const projectById = byId(projects);
  const topicIds = new Set(data.topics.filter((topic) => !topic.archived).map((topic) => topic.id));
  const live = (home: Home) => home.projectId ? projectById.get(home.projectId)?.area === home.domain
    : home.domain ? domainNames.has(home.domain) : !!home.topicId && topicIds.has(home.topicId);
  // People (D71): whoever looks after a person's domain reads about them, and Atlas; a plain topic stays Atlas's.
  const personById = new Map(peopleOf(data.topics).map((person) => [person.id, person]));
  const seesPerson = (id: string) => {
    const domain = personById.get(id)?.person.domain;
    return domain !== undefined && (scope.all || domainNames.has(domain) && scope.domains.has(domain));
  };
  const people = new Map<string, PersonTopic>([...personById.values()].filter((person) => seesPerson(person.id)).map((person) => [`@${person.name.trim()}`, person]));
  // Resolve the offered identity from this snapshot, never trust an old Resource's content or Home.
  const attached = offered && data.notes.find((note) => note.id === offered.id && !note.archived && live(note));
  const assigned = (home: Home) => live(home) && (home.topicId && personById.has(home.topicId) ? seesPerson(home.topicId) : sees(scope, home));
  const changeable = (home: Home) => assigned(home) || !!attached && live(home) && homeKey(home) === homeKey(attached);
  const nameOf = ({ domain, projectId, topicId }: Home) => {
    const person = topicId ? personById.get(topicId) : undefined;
    if (person) return `@${person.name.trim()}`;
    const project = projectById.get(projectId);
    return project ? `${project.area} / ${project.title}` : domain;
  };
  const places = new Map<string, Home>();
  for (const domain of domains) {
    const home = { domain: domain.name, projectId: "" };
    if (changeable(home)) places.set(domain.name, home);
    for (const project of projects) {
      if (project.area !== domain.name) continue;
      const home = { domain: project.area, projectId: project.id };
      if (changeable(home)) places.set(nameOf(home), home);
    }
  }
  const homeKeys = new Set([...places.values()].map(homeKey));
  const notes = canUse(agent, "read-notes") ? data.notes.filter((note) => note.id !== attached?.id
    && !note.archived && kindOf(note) === "note" && assigned(note)) : [];
  const tasks = canUse(agent, "see-tasks") ? data.tasks.filter((task) => !task.done && assigned(task)) : [];
  // Images it may look at (D58), by name: image notes kept on this device where it reads notes, and an attached one.
  const pictured = (note: Note) => kindOf(note) === "image" && !!note.file;
  const images = new Map<string, Note>([...canUse(agent, "read-notes") ? data.notes.filter((note) => !note.archived && pictured(note) && assigned(note)) : [],
    ...attached && pictured(attached) ? [attached] : []].slice(-limits.images).map((note) => [`${noteTitle(note)} (${nameOf(note)})`, note] as const));
  // What it remembers (D49): what's about you, about the places it's assigned and about the people it reads (D71), newest
  // first; past what a request holds, the ones whose words or place best match the message (D80, recall.ts).
  const memories = recall(data.memories.filter((memory) => memory.topicId ? seesPerson(memory.topicId) : !memory.domain || assigned(memory)),
    request, limits.memories, (memory) => `${memory.text} ${memory.topicId || memory.domain ? nameOf(memory) : ""}`);
  return {
    attached, notes, tasks, places, nameOf, memories, images, people,
    /** Where a memory belongs as the agent reads it: "" about you, "@Sofia" about a person, else its place. */
    memoryPlace: (memory: Home) => memory.topicId || memory.domain ? nameOf(memory) : "",
    /** Used for bound task identities too: completed tasks remain available to idempotent Apply and Undo checks. */
    hasTask: (id: string) => { const task = byId(data.tasks).get(id); return !!task && assigned(task); },
    hasHome: (home: Home) => live(home) && homeKeys.has(homeKey(home)),
    hasPage: (place: string) => homeKeys.has(place),
    /**
     * Where it may remember something (D49): nowhere with Remember off; else about you (`domain` ""), a place it's
     * assigned, never one it only reaches through an attachment, or a person it reads about (D71). Binding and landing
     * both ask, so switching it off mid-reply drops what that reply remembered.
     */
    mayRemember: (home: Home) => canUse(agent, "remember") && (home.topicId ? seesPerson(home.topicId) : !home.domain || assigned(home)),
    /**
     * Page text follows assignment scope, not the attached Resource's extended change Home. Each line starts with the
     * page's place as the tools take it ("Health / First 10K"), so the prompt lists it once (logic.ts `promptParts`).
     */
    pages: (today: string) => [
      ...domains.filter((domain) => scope.all || scope.domains.has(domain.name)).map((domain) => pageLine(domain.name, domain.widgets, today)),
      ...projects.filter((project) => sees(scope, { domain: project.area, projectId: project.id }))
        .map((project) => pageLine(nameOf({ domain: project.area, projectId: project.id }), project.widgets, today, project.description)),
    ].filter(Boolean),
  };
}

const fresh = "This proposal no longer has enough permission or target information. Ask for a fresh proposal.";
const changed = "The agent's permissions, attachment or places changed. Ask for a fresh proposal; nothing was applied.";

function currentWorkspace(data: WorkspaceData, origin: CommandOrigin | undefined, agentId: string, attachedNoteId?: string | null) {
  if (!origin) throw new Error(fresh);
  const agent = byId(data.agents).get(agentId);
  if (origin.agentId !== agentId || !agent || agent.archived || !origin.needs.every((tool) => canUse(agent, tool)))
    throw new Error(changed);
  const attached = origin.attachedNoteId === attachedNoteId ? byId(data.notes).get(attachedNoteId ?? "") : undefined;
  return agentWorkspace({ data, agent, attached });
}

/**
 * Rechecks the original identities as a whole. It never resolves model titles against newer records. A project the
 * proposal makes (D61) needs a domain the agent may still change, or the one Atlas plants with it, and then counts as
 * a home of that proposal's records.
 */
export function admitProposal(data: WorkspaceData, proposal: Proposal, agentId: string, attachedNoteId?: string | null): void {
  const current = currentWorkspace(data, proposal.origin, agentId, attachedNoteId);
  if (proposal.plant && agentId !== atlasId) throw new Error(changed);
  const sown = proposal.plant && !data.domains.some((domain) => domain.name === proposal.plant!.domain.name) ? proposal.plant.domain.name : undefined;
  const owns = (domain: string) => domain === sown || current.hasHome({ domain, projectId: "" });
  const made = new Map((proposal.projects ?? []).filter((project) => !data.projects.some((item) => item.id === project.id))
    .map((project) => [project.id, project]));
  const reachable = (home: Home) => made.has(home.projectId) ? made.get(home.projectId)!.area === home.domain && owns(home.domain)
    : current.hasHome(home);
  if ([...made.values()].some((project) => !owns(project.area))
    || [...proposal.items, ...proposal.notes ?? []].some((record) => !reachable(record)) || proposal.changes?.some((change) =>
    change.kind === "page" ? !current.hasPage(change.place)
      : change.kind === "archive" ? !current.hasHome({ domain: data.projects.find((project) => project.id === change.projectId)?.area ?? "", projectId: change.projectId })
      : change.kind === "move" ? !current.hasTask(change.taskId) || !reachable(change.to)
      // A whole project moves only between domains the agent looks after (D61).
      : change.kind === "rehome" ? !owns(change.from) || !owns(change.to) || !current.hasHome({ domain: change.from, projectId: change.projectId })
      : !current.hasTask(change.taskId))) throw new Error(changed);
}

/** Link drafts are admitted before posting too; a calendar must still refer to the same reachable tasks. */
export function admitHandoff(data: WorkspaceData, handoff: Handoff, agentId: string, attachedNoteId?: string | null): void {
  const current = currentWorkspace(data, handoff.origin, agentId, attachedNoteId);
  if (handoff.origin.taskIds?.some((id) => !current.hasTask(id))) throw new Error(changed);
}

/**
 * One page's line: a project's goal first (agents-design D61: seen 2026-11-17, Atlas filed Atlaswork work into "Studio
 * relaunch" by its name alone), then what its blocks show. A page with neither says nothing.
 */
function pageLine(name: string, blocks: Block[] | undefined, today: string, goal = "") {
  const parts = (blocks ?? []).filter((block) => !block.removed).map((block) => blockLine(block, today)).filter(Boolean);
  const aim = goal.trim().replace(/\s+/g, " ");
  const head = aim ? `${name}, for “${aim.length > 120 ? `${aim.slice(0, 120)}…` : aim}”` : name;
  return parts.length ? `${head}: ${parts.join("; ")}` : aim ? head : "";
}
/** What a data Block shows, from its kind's `says`; record Blocks say nothing new, put-away Blocks never reach this. */
function blockLine(block: Block, today: string) {
  const says = widgetKind(block.type).says;
  return says ? `${block.title || block.type}: ${says(block, today)}` : "";
}
