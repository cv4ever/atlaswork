// Resource and topic edits: creating in a valid home, words, moves and links, each against the current record.
import type { Note, Topic, WorkspaceData } from "../model.ts";
import { renamed } from "../people.ts";
import { parseHome } from "../place.ts";
import { upsert, unchanged, mergeChanges, swap } from "./change.ts";
import type { Change } from "./change.ts";

/**
 * Adds or edits a topic. Names are unique (ignoring case) so pickers never show two of the same. Renaming a person
 * (D71) rewrites their @mentions in notes and tasks, so the links follow the name.
 */
export function saveTopic(data: WorkspaceData, draft: Topic): Change {
  const topic = { ...draft, name: draft.name.trim(), description: draft.description.trim() };
  if (!topic.name) throw new Error("A topic needs a name.");
  const lower = topic.name.toLocaleLowerCase();
  if (data.topics.some((item) => item.id !== topic.id && item.name.toLocaleLowerCase() === lower))
    throw new Error(`There is already a topic called ${topic.name}.`);
  const before = data.topics.find((item) => item.id === topic.id);
  const from = before?.person && topic.person && before.name !== topic.name ? before.name : "";
  const notes = from ? data.notes.flatMap((note) => {
    const title = renamed(note.title, from, topic.name), body = renamed(note.body, from, topic.name);
    return title !== note.title || body !== note.body ? [{ ...note, title, body }] : [];
  }) : [];
  const tasks = from ? data.tasks.flatMap((task) => {
    const title = renamed(task.title, from, topic.name);
    return title !== task.title ? [{ ...task, title }] : [];
  }) : [];
  return { data: { ...data, topics: upsert(data.topics, topic), notes: swap(data.notes, notes), tasks: swap(data.tasks, tasks) },
    changes: { topics: [topic], ...notes.length > 0 && { notes }, ...tasks.length > 0 && { tasks } } };
}

/**
 * Adds the people picked from the phone's contacts (D71) as new persons in `domain`: a name already in the Library,
 * or picked twice, is skipped, so importing again adds only who's new. `added` names who came in.
 */
export function addPeople(data: WorkspaceData, picked: { name: string; photo?: string }[], domain: string, hues: string[]): Change & { added: string[] } {
  const taken = new Set(data.topics.map((topic) => topic.name.trim().toLocaleLowerCase()));
  const topics: Topic[] = picked.flatMap(({ name, photo }) => {
    const clean = name.trim().slice(0, 40);
    if (!clean || taken.has(clean.toLocaleLowerCase())) return [];
    taken.add(clean.toLocaleLowerCase());
    return [{ id: crypto.randomUUID(), name: clean, emoji: "📚", description: "", person: { relation: "", domain, hue: "", dates: [], ...photo && { photo } } }];
  }).map((topic, index) => ({ ...topic, person: { ...topic.person!, hue: hues[index % hues.length] } }));
  return topics.length ? { data: { ...data, topics: [...data.topics, ...topics] }, changes: { topics }, added: topics.map((topic) => topic.name) }
    : { ...unchanged(data), added: [] };
}

/** Internal whole-record write. Callers edit content, Home and Links separately against the current Resource. */
function saveNote(data: WorkspaceData, note: Note): Change {
  return { data: { ...data, notes: [note, ...data.notes.filter((item) => item.id !== note.id)] }, changes: { notes: [note] } };
}

/** Capture content only. Workspace supplies identity, home, Links and the edit time. */
export type ResourceDraft = Partial<Pick<Note, "title" | "body" | "kind" | "url" | "file" | "source" | "unsorted">>;

/** A capture handed to Atlas or kept as it is leaves the unsorted pile (agents-design D53); its words and time stay. */
export function markSorted(data: WorkspaceData, id: string): Change {
  const note = resourceById(data, id);
  if (!note.unsorted) return unchanged(data);
  const { unsorted: _sorted, ...rest } = note;
  return saveNote(data, rest);
}

export function resourceById(data: WorkspaceData, id: string): Note {
  const note = data.notes.find((item) => item.id === id);
  if (!note) throw new Error("That resource no longer exists.");
  return note;
}

/** Home keys: `area:Name`, a Project id, or `topic:id`. A Project brings its Domain. No fallback destination. */
export function homeAt(data: WorkspaceData, key: string) {
  const place = parseHome(key);
  if (place.kind === "topic") {
    if (!data.topics.some((topic) => topic.id === place.id)) throw new Error("That topic no longer exists.");
    return { domain: "", projectId: "", topicId: place.id };
  }
  const project = place.kind === "project" ? data.projects.find((item) => item.id === place.id) : undefined;
  if (place.kind === "project" && !project) throw new Error("That project no longer exists.");
  const domain = project?.area ?? (place.kind === "domain" ? place.name : "");
  if (!data.domains.some((item) => item.name === domain)) throw new Error("That domain no longer exists.");
  return { domain, projectId: project?.id ?? "", topicId: undefined };
}

export function atHome(data: WorkspaceData, note: Note, place: string): Note {
  const home = homeAt(data, place);
  return { ...note, ...home, linkedProjectIds: [...new Set(note.linkedProjectIds ?? [])].filter((id) => id !== home.projectId) };
}

/** Creates any Resource kind in a valid home, returning it for navigation or feedback. */
export function createResource(data: WorkspaceData, draft: ResourceDraft, place: string): Change & { resource: Note } {
  const resource = atHome(data, { title: "", body: "", ...draft, id: crypto.randomUUID(),
    domain: "", projectId: "", linkedProjectIds: [], updatedAt: new Date().toISOString() }, place);
  return { ...saveNote(data, resource), resource };
}

/** Several resources to one place in one changeset (Capture with many files): all land, or none do. */
export function createResources(data: WorkspaceData, drafts: ResourceDraft[], place: string): Change & { resources: Note[] } {
  let next: Change & { resources: Note[] } = { ...unchanged(data), resources: [] };
  for (const draft of drafts) {
    const made = createResource(next.data, draft, place);
    next = { data: made.data, changes: mergeChanges(next.changes, made.changes), resources: [...next.resources, made.resource] };
  }
  return next;
}

/** Edits only the supplied words on the current Resource, preserving its Home, Links, archive state and Blob. */
export function editResource(data: WorkspaceData, id: string, { title, body, source }: Partial<Pick<Note, "title" | "body" | "source">>): Change {
  const current = resourceById(data, id);
  if (title === undefined && body === undefined && source === undefined) return unchanged(data);
  return saveNote(data, { ...current, ...(title === undefined ? {} : { title }), ...(body === undefined ? {} : { body }),
    ...(source === undefined ? {} : { source }), updatedAt: new Date().toISOString() });
}

/** Changes only ownership on the current Resource, never content from a caller's stale record. */
export function moveResource(data: WorkspaceData, id: string, place: string): Change {
  return saveNote(data, atHome(data, resourceById(data, id), place));
}

/** Links target other Projects only. Repeating either transition leaves the same Links in the same order. */
export function setResourceLinked(data: WorkspaceData, id: string, projectId: string, linked: boolean): Change {
  const note = resourceById(data, id);
  if (!data.projects.some((project) => project.id === projectId)) throw new Error("That project no longer exists.");
  const links = [...new Set([...(note.linkedProjectIds ?? []), ...(linked ? [projectId] : [])])]
    .filter((other) => other !== note.projectId && (linked || other !== projectId));
  if (links.length === (note.linkedProjectIds ?? []).length && links.every((other, index) => other === note.linkedProjectIds![index]))
    return unchanged(data);
  return saveNote(data, { ...note, linkedProjectIds: links });
}
