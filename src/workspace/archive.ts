// Archive (hides without rewriting) and delete for good, for a domain, project, topic or resource.
import type { WorkspaceData } from "../model.ts";
import { domainKey, homeKey } from "../place.ts";
import { mergeChanges, swap, unchanged } from "./change.ts";
import type { Target, Change, Changes } from "./change.ts";
import { contents } from "./queries.ts";
import { resourceById, atHome } from "./resources.ts";

/** Archiving a domain, project, or topic hides its contents without rewriting them. */
export function setArchived(data: WorkspaceData, { kind, id }: Target, archived: boolean): Change {
  if (kind === "domain") {
    const domains = data.domains.map((domain) => (domain.name === id ? { ...domain, archived } : domain));
    return { data: { ...data, domains }, changes: { domains } };
  }
  if (kind === "project") {
    const projects = data.projects.filter((project) => project.id === id).map((project) => ({ ...project, archived }));
    return { data: { ...data, projects: swap(data.projects, projects) }, changes: { projects } };
  }
  if (kind === "topic") {
    const topics = data.topics.map((topic) => (topic.id === id ? { ...topic, archived } : topic));
    return { data: { ...data, topics }, changes: { topics: topics.filter((topic) => topic.id === id) } };
  }
  const notes = data.notes.filter((note) => note.id === id).map((note) => ({ ...note, archived }));
  return { data: { ...data, notes: swap(data.notes, notes) }, changes: { notes } };
}

export function deleteForever(data: WorkspaceData, target: Target): Change {
  const { projects, notes, tasks, memories } = contents(data, target);
  const gone = new Set([...projects, ...notes, ...tasks, ...memories].map((item) => item.id));
  const rooms = new Set(projects.map((project) => `room:${project.id}`));
  // Resources homed elsewhere stop being linked into projects that are gone.
  const unlinked = data.notes.filter((note) => !gone.has(note.id) && note.linkedProjectIds?.some((id) => gone.has(id)))
    .map((note) => ({ ...note, linkedProjectIds: note.linkedProjectIds!.filter((id) => !gone.has(id)) }));
  const changes: Changes = {
    deletedProjectIds: projects.map((item) => item.id),
    deletedNoteIds: notes.map((item) => item.id),
    deletedTaskIds: tasks.map((item) => item.id),
    deletedThreadIds: data.threads.filter((thread) => rooms.has(thread.id)).map((thread) => thread.id),
    ...memories.length > 0 && { deletedMemoryIds: memories.map((item) => item.id) },
  };
  // A deleted project's or domain's brief mark (D40) goes with it.
  const places = new Set([...projects.map((project) => project.id), ...target.kind === "domain" ? [domainKey(target.id)] : []]);
  const marks = Object.keys(data.briefs).filter((place) => places.has(place));
  if (marks.length) changes.deletedBriefs = marks;
  if (unlinked.length) changes.notes = unlinked;
  const domains = target.kind === "domain" ? data.domains.filter((domain) => domain.name !== target.id) : data.domains;
  if (domains !== data.domains) changes.domains = domains;
  const topics = target.kind === "topic" ? data.topics.filter((topic) => topic.id !== target.id) : data.topics;
  if (topics !== data.topics) changes.deletedTopicIds = [target.id];
  return {
    data: {
      ...data,
      domains,
      topics,
      projects: data.projects.filter((item) => !gone.has(item.id)),
      notes: swap(data.notes.filter((item) => !gone.has(item.id)), unlinked),
      tasks: data.tasks.filter((item) => !gone.has(item.id)),
      memories: data.memories.filter((item) => !gone.has(item.id)),
      threads: data.threads.filter((thread) => !rooms.has(thread.id)),
      briefs: marks.length ? Object.fromEntries(Object.entries(data.briefs).filter(([place]) => !places.has(place))) : data.briefs,
    },
    changes,
  };
}

/**
 * Archives a project, first moving the resources you keep (`keep`: resource id to topic id) into topics.
 * Kept resources stay linked to the project, so restoring it brings them back into view there.
 */
export function archiveProject(data: WorkspaceData, id: string, keep: Record<string, string>): Change {
  if (!data.projects.some((project) => project.id === id)) throw new Error("That project no longer exists.");
  const notes = Object.entries(keep).map(([resourceId, topicId]) => {
    const note = resourceById(data, resourceId);
    if (note.projectId !== id) throw new Error("Only resources homed in this project can be kept.");
    return atHome(data, { ...note, linkedProjectIds: [...(note.linkedProjectIds ?? []), id] }, homeKey({ domain: "", topicId }));
  });
  const archived = setArchived(data, { kind: "project", id }, true);
  return { data: { ...archived.data, notes: swap(archived.data.notes, notes) }, changes: { ...archived.changes, notes } };
}

/** Deletes several resources for good in one changeset (Undo after a many-file Capture): all go, or none do. */
export function deleteResources(data: WorkspaceData, ids: string[]): Change {
  let next = unchanged(data);
  for (const id of ids) {
    const gone = deleteForever(next.data, { kind: "note", id });
    next = { data: gone.data, changes: mergeChanges(next.changes, gone.changes) };
  }
  return next;
}
