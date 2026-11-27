// How every chat reads, from the Workspace and the Session alone: each Thread's summary, where the chat list files it,
// the strip beside your work, the Chats page tabs, the roster and the current chat's welcome. Creates no records.
import * as crews from "../agents.ts";
import { plainOf } from "../markdown.ts";
import { atlasId } from "../model.ts";
import type { Project, Thread, WorkspaceData } from "../model.ts";
import type { Session } from "../session.ts";
import { sittingsOf } from "../sittings.ts";
import type { Sitting } from "../sittings.ts";
import { threadOf } from "./core.ts";
import type { Activity, Discovery, RosterRow, ThreadSummary } from "./types.ts";

/** Where chat is (`RoomCore.place`): the Session's domain and project, and the two as the key a Picked chat holds in. */
export type ChatPlace = { domain: string; projectId: string; context: string };

/** Sittings depend on messages alone, not the place or the live crew: one list per version of `data.threads`. */
const sittingsCache = new WeakMap<readonly Thread[], Sitting[]>();
function sittingsIn(threads: Thread[], entries: ReadonlyMap<string, ThreadSummary>) {
  let sittings = sittingsCache.get(threads);
  if (!sittings) {
    sittings = threads.filter((thread) => entries.has(thread.id)).flatMap(sittingsOf).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
    sittingsCache.set(threads, sittings);
  }
  return sittings;
}

/** Every chat that exists, by Thread id, and the ones the chat list shows (archived agents only with a history). */
function summaries(data: WorkspaceData, projects: Project[]) {
  const liveProjects = new Set(projects);
  // An agent's home: the domain it looks after, else the domain of the first live project it crews.
  const crewHome = new Map<string, string>();
  for (const project of projects) for (const member of crews.crewOf(data, project)) if (!crewHome.has(member.id)) crewHome.set(member.id, project.area);
  const entries = new Map<string, ThreadSummary>();
  const chats: ThreadSummary[] = [];
  const add = (id: string, kind: ThreadSummary["kind"], title: string, description: string, home?: string) => {
    const agents = crews.membersOf(data, id);
    const thread = threadOf(data, id);
    const names = agents.map((agent) => agent.name).join(" · ");
    const latest = thread.messages.at(-1);
    const entry = { id, kind, title, description, agents, domain: home, thread,
      unread: crews.unread(thread), latest, readOnly: !agents.some((agent) => !agent.archived),
      label: title || names || "Room", detail: kind === "agent" ? description : names,
      group: kind === "project" ? home! : kind === "team" ? "Teams" : kind === "room" ? "Rooms"
        : agents[0].archived ? "Archived" : id === `agent:${atlasId}` ? "Everywhere" : home ?? "Not assigned",
      last: latest && { text: plainOf(latest.text), at: latest.at,
        by: latest.role === "user" ? "You" : crews.agentById(data, latest.agentId ?? atlasId)?.name ?? "Agent" } };
    entries.set(id, entry);
    return entry;
  };
  for (const agent of data.agents) {
    const home = data.domains.find((item) => item.agentId === agent.id)?.name ?? crewHome.get(agent.id);
    const entry = add(`agent:${agent.id}`, "agent", agent.name, agent.role, home);
    if (!agent.archived || data.threads.includes(entry.thread)) chats.push(entry);
  }
  for (const thread of data.threads)
    if (thread.id.startsWith("chat:")) chats.push(add(thread.id, "room", thread.title ?? "", ""));
  for (const team of data.teams) {
    const entry = add(`team:${team.id}`, "team", team.name, team.purpose);
    if (entry.agents.length) chats.push(entry);
  }
  for (const project of data.projects) {
    const entry = add(`room:${project.id}`, "project", project.title, project.description, project.area);
    if (liveProjects.has(project) && entry.agents.length > 1) chats.push(entry);
  }
  const order = ["Everywhere", "Rooms", "Teams", ...data.domains.map((item) => item.name), "Not assigned", "Archived"];
  chats.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
  return { entries, chats };
}

/** What a chat says before anyone writes: the agent's welcome, or who's in the room and who answers first. */
function welcomeOf(data: WorkspaceData, selected: ThreadSummary, profileName: string) {
  const lead = selected.agents[0];
  if (selected.kind === "agent") return crews.welcomeOf(lead, crews.scopeLabelOf(data, lead.id), data, profileName);
  if (!selected.agents.length) return "Nobody here is active any more. Restore an agent from the Archive to keep talking.";
  const names = selected.agents.map((agent) => agent.name).join(", ").replace(/, ([^,]*)$/, " and $1");
  const where = selected.kind === "project" ? ` for ${selected.label}` : "";
  return `${names} ${selected.agents.length === 1 ? "is" : "are"} here${where}. ${lead.name} answers first; @name to ask someone else.`;
}

export function discover(data: WorkspaceData, session: Session, { domain, projectId, context }: ChatPlace, activity: Activity): Discovery {
  // The Chats page shows its pick wherever you are; beside your work it holds only in the place it was picked.
  const pickedId = session.chatPick && (session.view === "chats" || session.chatPick.context === context) ? session.chatPick.thread : undefined;
  const liveDomains = new Set(data.domains.filter((item) => !item.archived).map((item) => item.name));
  const projects = data.projects.filter((project) => !project.archived && liveDomains.has(project.area));
  const { entries, chats } = summaries(data, projects);
  const nearest = crews.nearestThread(data, domain, projectId);
  const picked = pickedId ? entries.get(pickedId) : undefined;
  const selected = picked && (picked.agents.length > 0 || data.threads.includes(picked.thread)) ? picked : entries.get(nearest)!;
  const project = projects.find((item) => item.id === projectId);
  const steward = crews.stewardOf(data, domain);
  const strip = [...new Set([`agent:${atlasId}`, nearest,
    ...(project ? crews.crewOf(data, project).map((agent) => `agent:${agent.id}`) : []),
    ...(steward ? [`agent:${steward.id}`] : []), selected.id])].map((id) => entries.get(id)!);
  const roster = data.agents.filter((agent) => !agent.archived).map((agent): RosterRow => {
    const entry = entries.get(`agent:${agent.id}`)!;
    const scope = crews.scopeOf(data, agent.id);
    return { thread: entry.id, agent, role: agent.role || "No role yet", last: entry.last, unread: entry.unread,
      emoji: data.domains.find((item) => !item.archived && item.agentId === agent.id)?.emoji,
      presence: crews.presenceOf(data, agent, activity),
      here: scope.all || scope.domains.has(session.domain) || projects.some((item) => item.area === session.domain && scope.projects.has(item.id)) };
  });
  const { open, pinned } = session.chatTabs;
  return { current: selected, strip, chats, tabs: [...new Set([...pinned, ...open, selected.id])].flatMap((id) => entries.get(id) ?? []),
    entries, sittings: sittingsIn(data.threads, entries), unreadTotal: [...entries.values()].reduce((sum, entry) => sum + entry.unread, 0),
    roster, welcome: welcomeOf(data, selected, session.profileName) };
}
