// What the person sees: live lists, what's due today, a project's resources, what a target holds, and the page on
// screen (`onScreen`).
import { kindOf, noteTitle } from "../model.ts";
import type { Domain, Note, Project, Task, Topic, WorkspaceData } from "../model.ts";
import { viewLabels } from "../session.ts";
import type { Session } from "../session.ts";
import { defaultPages } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { domainKey, here, parseTab } from "../place.ts";
import { paceOf } from "../pace.ts";
import type { Target } from "./change.ts";
import { layoutOf } from "./clean.ts";

/**
 * The records a target holds: a domain everything rooted in it, a project or topic what's homed there, a note itself.
 * Memories (D49) go with the domain or project they're about, or the person (D71).
 */
export function contents(data: WorkspaceData, { kind, id }: Target) {
  return {
    projects: data.projects.filter((project) => (kind === "domain" ? project.area === id : kind === "project" && project.id === id)),
    notes: data.notes.filter((note) => (kind === "domain" ? note.domain === id : kind === "project" ? note.projectId === id
      : kind === "topic" ? note.topicId === id : note.id === id)),
    tasks: kind === "note" || kind === "topic" ? [] : data.tasks.filter((task) => (kind === "domain" ? task.domain === id : task.projectId === id)),
    memories: data.memories.filter((memory) => kind === "domain" ? memory.domain === id : kind === "project" ? memory.projectId === id
      : kind === "topic" && memory.topicId === id),
  };
}

/** What the person sees: the live lists, the selected Domain's, what's due by today, and the last changed note (never a link, file or image). */
export type Visible = {
  domains: Domain[]; projects: Project[]; notes: Note[]; tasks: Task[]; topics: Topic[];
  domainProjects: Project[]; domainNotes: Note[]; domainTasks: Task[]; dueTasks: Task[]; lastNote: Note | undefined;
};

/**
 * What the person sees: archived domains and projects hide everything inside them without archiving each item.
 * `domain` selects the scoped lists; `today` (YYYY-MM-DD) decides which open tasks are due.
 */
export function visible(data: Pick<WorkspaceData, "domains" | "projects" | "notes" | "tasks" | "topics">, domain: string, today: string): Visible {
  const domains = data.domains.filter((item) => !item.archived);
  const domainNames = new Set(domains.map((item) => item.name));
  const projects = data.projects.filter((project) => !project.archived && domainNames.has(project.area));
  const projectIds = new Set(projects.map((project) => project.id));
  const isLive = (item: Note | Task) => domainNames.has(item.domain) && (!item.projectId || projectIds.has(item.projectId));
  const topics = data.topics.filter((topic) => !topic.archived);
  const topicIds = new Set(topics.map((topic) => topic.id));
  const notes = data.notes.filter((note) => !note.archived && (note.topicId ? topicIds.has(note.topicId) : isLive(note)));
  const tasks = data.tasks.filter(isLive);
  return inDomain({
    domains, projects, notes, tasks, topics, domainProjects: [], domainNotes: [], domainTasks: [],
    dueTasks: tasks.filter((task) => !task.done && task.due && task.due <= today),
    lastNote: notes.reduce<Note | undefined>((latest, note) => kindOf(note) === "note" && (!latest || note.updatedAt > latest.updatedAt) ? note : latest, undefined),
  }, domain);
}

/** `live` with its scoped lists for `domain`; every other list stays the same array, so a domain switch keeps them. */
export function inDomain(live: Visible, domain: string): Visible {
  return { ...live,
    domainProjects: live.projects.filter((project) => project.area === domain),
    domainNotes: live.notes.filter((note) => note.domain === domain),
    domainTasks: live.tasks.filter((task) => task.domain === domain),
  };
}

/** Open tasks past their day, counted per domain, from `Visible.dueTasks`: each domain chip's clay dot. */
export function lateByDomain(dueTasks: Task[], today: string) {
  const late: Record<string, number> = {};
  for (const task of dueTasks) if (task.due < today) late[task.domain] = (late[task.domain] ?? 0) + 1;
  return late;
}

/**
 * Today's tasks in play: due by `today`, ticked or not, minus those ticked on an earlier day. It resets daily, so an
 * ongoing domain can still fill up. Tasks carry no completion time; a late task counts as done today when last edited today.
 */
export function todayInPlay(tasks: Task[], today: string) {
  return tasks.filter((task) => task.due && task.due <= today && (!task.done || task.due === today
    || (task.updatedAt && new Date(task.updatedAt).toLocaleDateString("en-CA") === today)));
}

/** Today's rhythm: how many of the tasks in play (`todayInPlay`) are done. */
export function todayRhythm(tasks: Task[], today: string) {
  const inPlay = todayInPlay(tasks, today);
  return { done: inPlay.filter((task) => task.done).length, total: inPlay.length };
}

/** A project's resources: what's homed there, then what's linked in, even when that thing's own home is archived. */
export function resourcesIn(data: WorkspaceData, projectId: string) {
  return data.notes.filter((note) => !note.archived && (note.projectId === projectId || !!note.linkedProjectIds?.includes(projectId)));
}

/** Whether a resource's home (its topic, project, or domain) is archived. */
export function homeArchived(data: WorkspaceData, note: Note) {
  if (note.topicId) return !!data.topics.find((topic) => topic.id === note.topicId)?.archived;
  return !!data.projects.find((project) => project.id === note.projectId)?.archived
    || !!data.domains.find((domain) => domain.name === note.domain)?.archived;
}

/** The status bar's progress: a Project's tasks, or what's due today in a Domain or, on Today, everywhere. */
export type Progress = { id: string; label: string; done: number; total: number; project?: Project; domain?: Domain };

/**
 * The page on screen, read from the Session: Place `here` (where chat follows and Capture saves), the open Project or
 * Resource, the page Customize arranges (`page.place` is its Home key, "" for Today, whose widgets are a Session
 * choice), Today's blocks, the breadcrumb, progress, and the notes a pinned-note block there can show. Pass `live`
 * when the caller already has `visible` for this Session and day.
 */
export function onScreen(data: WorkspaceData, session: Session, today: string, live = visible(data, session.domain, today)) {
  const at = here(data, session);
  const { view } = session;
  const tab = view ? undefined : parseTab(session.active);
  const note = tab?.kind === "resource" ? data.notes.find((item) => item.id === tab.id) : undefined;
  const project = data.projects.find((item) => item.id === at.projectId);
  const projectPage = tab?.kind === "project" ? project : undefined;
  const domainPage = tab?.kind === "domain" ? live.domains.find((item) => item.name === tab.name) : undefined;
  const todayBlocks = session.widgets.map((type): Block => ({ id: type, type, ...session.todayViews?.[type] && { view: session.todayViews[type] } }));
  const record = projectPage ?? domainPage;
  const fallback = projectPage ? defaultPages.project : defaultPages.domain;
  const page = record
    ? { place: projectPage ? projectPage.id : domainKey(domainPage!.name), name: projectPage?.title ?? domainPage!.name,
      blocks: record.widgets ?? fallback, custom: !!record.widgets && layoutOf(record.widgets) !== layoutOf(fallback) }
    : { place: "", name: "Today", blocks: todayBlocks, custom: false };

  const titleOf = (id: string) => data.projects.find((item) => item.id === id)?.title;
  const crumbs = (at.topic ? ["Everywhere", "Library", at.topic.name]
    : view ? ["Everywhere", viewLabels[view]]
    : projectPage ? [projectPage.area, projectPage.title]
    : note ? [...(note.topicId ? ["Library", data.topics.find((item) => item.id === note.topicId)?.name] : [note.domain, titleOf(note.projectId)]),
      noteTitle(note)]
    : tab?.kind === "domain" ? ["Domains", tab.name, session.section === "overview" ? "" : session.section === "tasks" ? "Tasks" : "Resources"]
    : [session.domain, session.active === "projects" ? "Projects" : ""]).filter((crumb): crumb is string => !!crumb);

  const dueIn = view || project || note?.topicId ? undefined
    : live.domains.find((item) => item.name === (tab?.kind === "domain" ? tab.name : session.domain));
  const pace = project && paceOf(project, live.tasks.filter((task) => task.projectId === project.id), today);
  const progress: Progress | undefined = view === "today" ? { id: "today", label: "Due today", ...todayRhythm(live.tasks, today) }
    : pace ? { id: project!.id, label: `${project!.title} tasks`, project, done: pace.done, total: pace.total }
    : dueIn && { id: domainKey(dueIn.name), label: `Due today in ${dueIn.name}`, domain: dueIn,
      ...todayRhythm(live.tasks.filter((task) => task.domain === dueIn.name), today) };

  const pinnable = projectPage ? resourcesIn(data, projectPage.id) : domainPage ? live.notes.filter((item) => item.domain === domainPage.name) : [];
  return { ...at, note, project, projectPage, domainPage, page, todayBlocks, crumbs, progress, pinnable };
}

/** The page on screen, as `onScreen` reads it. */
export type Screen = ReturnType<typeof onScreen>;
