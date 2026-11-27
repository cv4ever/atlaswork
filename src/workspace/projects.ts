// Project edits: content, assignment and routines; a move carries the project's Resources and Tasks, and the
// finish line lives on its page (`withFinish`).
import { defaultPages, shownBlocks } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import type { Project, WorkspaceData } from "../model.ts";
import { upsert, swap, unchanged } from "./change.ts";
import type { Change } from "./change.ts";
import { cleanBlocks } from "./clean.ts";

/** Project content, assignment and routines. Archive state has its own transition. */
export type ProjectDraft = Omit<Project, "id" | "archived">;

/** One Project write owns Domain validation and carries its Resources and Tasks when it moves. */
function saveProject(data: WorkspaceData, draft: Project): Change & { moved: boolean } {
  const project = { ...draft, title: draft.title.trim(), description: draft.description.trim(), ...draft.widgets && { widgets: cleanBlocks(draft.widgets) } };
  if (!project.title) throw new Error("A project needs a title.");
  if (!data.domains.some((domain) => domain.name === project.area)) throw new Error("That domain no longer exists.");
  const before = data.projects.find((item) => item.id === project.id);
  const moved = !!before && before.area !== project.area;
  const notes = moved ? data.notes.filter((note) => note.projectId === project.id).map((note) => ({ ...note, domain: project.area })) : [];
  const tasks = moved ? data.tasks.filter((task) => task.projectId === project.id).map((task) => ({ ...task, domain: project.area })) : [];
  return {
    data: { ...data, projects: upsert(data.projects, project), notes: swap(data.notes, notes), tasks: swap(data.tasks, tasks) },
    changes: { projects: [project], notes, tasks },
    moved,
  };
}

/** Creation is explicit, so an edit cannot recreate a deleted Project. It stamps `createdAt`, which opens its welcome. */
export function createProject(data: WorkspaceData, draft: ProjectDraft & { id: string }): Change & { moved: boolean } {
  if (data.projects.some((project) => project.id === draft.id)) throw new Error("That project already exists.");
  return saveProject(data, { ...draft, createdAt: new Date().toISOString() });
}

/** Only changed fields meet the current Project; unrelated assignments, routines and archive state survive. */
export function editProject(data: WorkspaceData, id: string, patch: Partial<ProjectDraft>): Change & { moved: boolean } {
  const current = data.projects.find((project) => project.id === id);
  if (!current) throw new Error("That project no longer exists.");
  if (!Object.keys(patch).length) return { ...unchanged(data), moved: false };
  return saveProject(data, { ...current, ...patch });
}

/**
 * A project's page with its finish line on `date`: the first countdown moves (its start stays, or becomes today), or a
 * "Done by" countdown joins the top; "" clears the date and adds nothing.
 */
export function withFinish(widgets: Block[] | undefined, date: string, today: string): Block[] | undefined {
  const blocks = widgets ?? defaultPages.project;
  const finish = shownBlocks(blocks).find((block) => block.type === "countdown");
  if (finish) return blocks.map((block) => block === finish ? { ...block, date: date || undefined, since: block.since ?? (date ? today : undefined) } : block);
  return date ? [{ id: crypto.randomUUID(), type: "countdown", title: "Done by", width: "narrow", date, since: today }, ...blocks] : widgets;
}
