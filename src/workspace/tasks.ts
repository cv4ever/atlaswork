// Task edits: created in a domain or project, edited field by field, moved to a day, taken back while untouched.
import type { Task, WorkspaceData } from "../model.ts";
import { parseHome } from "../place.ts";
import { homeAt } from "./resources.ts";
import { upsert, unchanged } from "./change.ts";
import type { Change } from "./change.ts";

/** Tasks live in a Domain or a Project, never a Topic. */
export function taskHome(data: WorkspaceData, key: string) {
  if (parseHome(key).kind === "topic") throw new Error("A task lives in a domain or a project, not a topic.");
  const { domain, projectId } = homeAt(data, key);
  return { domain, projectId };
}

const taskTitle = (title: string) => {
  if (!title.trim()) throw new Error("A task needs a title.");
  return title.trim();
};

/** Task content a caller may set. Workspace supplies identity, home and the edit time. */
export type TaskDraft = Pick<Task, "title"> & Partial<Pick<Task, "due" | "done" | "at" | "length">>;

/** Adds a Task in a valid home (`area:Name` or a Project id), stamping when; a review reads that to tell a busy project from a quiet one. */
export function createTask(data: WorkspaceData, draft: TaskDraft, home: string): Change {
  const task: Task = { due: "", done: false, ...draft, title: taskTitle(draft.title), id: crypto.randomUUID(),
    ...taskHome(data, home), updatedAt: new Date().toISOString() };
  return { data: { ...data, tasks: upsert(data.tasks, task) }, changes: { tasks: [task] } };
}

/** Takes back a Task just added, refusing once it changed so an edit made since is never lost. */
export function withdrawTask(data: WorkspaceData, added: Task): Change {
  const current = data.tasks.find((task) => task.id === added.id);
  if (!current) return unchanged(data);
  if (current.updatedAt !== added.updatedAt) throw new Error("It changed since you added it, so it stays. Delete it from its page if you meant to.");
  return { data: { ...data, tasks: data.tasks.filter((task) => task.id !== added.id) }, changes: { deletedTaskIds: [added.id] } };
}

/** Deletes a Task for good (the task dialog's Delete); its toast's Undo puts it back with `restoreTask`. */
export function deleteTask(data: WorkspaceData, id: string): Change {
  if (!data.tasks.some((task) => task.id === id)) return unchanged(data);
  return { data: { ...data, tasks: data.tasks.filter((task) => task.id !== id) }, changes: { deletedTaskIds: [id] } };
}

/** Puts a deleted Task back as it was, unless one with its id came back meanwhile. */
export function restoreTask(data: WorkspaceData, task: Task): Change {
  if (data.tasks.some((item) => item.id === task.id)) return unchanged(data);
  return { data: { ...data, tasks: upsert(data.tasks, task) }, changes: { tasks: [task] } };
}

/** Applies only the given fields to the current Task, so a stale dialog cannot undo someone else's change. */
export function editTask(data: WorkspaceData, id: string, { home, ...fields }: Partial<TaskDraft> & { home?: string }): Change {
  const current = data.tasks.find((task) => task.id === id);
  if (!current) throw new Error("That task no longer exists.");
  if (home === undefined && !Object.keys(fields).length) return unchanged(data);
  const task: Task = { ...current, ...fields, ...(fields.title === undefined ? {} : { title: taskTitle(fields.title) }),
    ...(home === undefined ? {} : taskHome(data, home)), updatedAt: new Date().toISOString() };
  return { data: { ...data, tasks: upsert(data.tasks, task) }, changes: { tasks: [task] } };
}

/** Moves open Tasks to `day` in one changeset (a project brief's "Move to today", D40); done or missing ones are left. A time they held on their old day stays behind. */
export function moveTasksToDay(data: WorkspaceData, ids: string[], day: string): Change {
  const updatedAt = new Date().toISOString();
  const tasks = data.tasks.filter((task) => ids.includes(task.id) && !task.done && task.due !== day)
    .map(({ at: _old, ...task }) => ({ ...task, due: day, updatedAt }));
  if (!tasks.length) return unchanged(data);
  return { data: { ...data, tasks: tasks.reduce((all, task) => upsert(all, task), data.tasks) }, changes: { tasks } };
}

/** Puts each open Task at a time or part of `day` in one changeset (Today's next steps, agents-design D75); `at` "" makes it anytime. */
export function placeTasks(data: WorkspaceData, places: { id: string; at: string }[], day: string): Change {
  const updatedAt = new Date().toISOString();
  const tasks = places.flatMap(({ id, at }) => {
    const current = data.tasks.find((task) => task.id === id && !task.done);
    if (!current || (current.due === day && (current.at ?? "") === at)) return [];
    const { at: _old, ...task } = current;
    return [{ ...task, due: day, ...(at ? { at } : {}), updatedAt }];
  });
  if (!tasks.length) return unchanged(data);
  return { data: { ...data, tasks: tasks.reduce((all, task) => upsert(all, task), data.tasks) }, changes: { tasks } };
}

export function sameTask(a: Task, b: Task) {
  return a.id === b.id && a.title === b.title && a.projectId === b.projectId && a.domain === b.domain &&
    a.done === b.done && a.due === b.due && a.at === b.at && a.length === b.length && a.createdBy === b.createdBy;
}
