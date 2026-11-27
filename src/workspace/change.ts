// What every Workspace edit returns (`Change`: the next data and exactly the records to persist), the store the
// records go to, the list helpers the edits share, and `resave` for changesets a store failed to write.
import type { Agent, BriefMark, Domain, EveryAgent, Memory, Note, Project, RoutineResult, Task, Team, Thread, Topic, WorkspaceData } from "../model.ts";

/**
 * Records to upsert or delete through a `WorkspaceStore`. `domains` is the whole value; `routineRuns` merges each
 * receipt's latest due time so a stale save cannot erase a claim. `briefs` holds only the places it changes.
 * `everyAgent` is the whole value (D46).
 */
export type Changes = {
  domains?: Domain[];
  routineRuns?: Record<string, string>;
  briefs?: Record<string, BriefMark>;
  everyAgent?: EveryAgent;
  projects?: Project[];
  notes?: Note[];
  tasks?: Task[];
  agents?: Agent[];
  teams?: Team[];
  threads?: Thread[];
  topics?: Topic[];
  memories?: Memory[];
  runs?: RoutineResult[];
  deletedProjectIds?: string[];
  deletedNoteIds?: string[];
  deletedTaskIds?: string[];
  deletedAgentIds?: string[];
  deletedTeamIds?: string[];
  deletedThreadIds?: string[];
  deletedTopicIds?: string[];
  deletedMemoryIds?: string[];
  deletedRunIds?: string[];
  /** Places (project id or domain key) whose brief mark goes with them. */
  deletedBriefs?: string[];
};

/** Every workspace edit returns the next data and exactly the records it changed. A rename identifies the same Domain under its new name. */
export type Change = { data: WorkspaceData; changes: Changes; renamedDomain?: { from: string; to: string } };

/** The durable claim's outcome and every stored receipt, including runs another device already claimed. */
export type RoutineClaim = { claimed: boolean; receipts: WorkspaceData["routineRuns"] };

/**
 * Where workspace records live: this browser today, a server later. `load` resolves null when nothing was ever saved.
 * `save` applies one changeset all-or-nothing (a domain rename spans many records and must never land half-done)
 * and changesets apply in call order. `replace` swaps every record for `data` (a backup restore), also all-or-nothing.
 * A rejected save or replace leaves the store as it was. The device Session is not workspace data (`SessionStore`).
 */
export type WorkspaceStore = {
  load(): Promise<WorkspaceData | null>;
  /**
   * `before` is the workspace the changeset was made from: the account, which keeps each chat message on its own
   * (agents-design D76), writes only the messages that changed since it.
   */
  save(changes: Changes, before?: WorkspaceData): Promise<void>;
  replace(data: WorkspaceData): Promise<void>;
  /** Atomically claim only a newer due time. A rejected write claims nothing; only a confirmed winner may dispatch. */
  claimRoutine(id: string, due: string): Promise<RoutineClaim>;
};

/** Archive and delete act on a domain (by name), a project, a topic, or a single resource. */
export type Target = { kind: "domain" | "project" | "topic" | "note"; id: string };

export const unchanged = (data: WorkspaceData): Change => ({ data, changes: {} });
export function swap<T extends { id: string }>(items: T[], changed: T[]) {
  const byId = new Map(changed.map((item) => [item.id, item]));
  return items.map((item) => byId.get(item.id) ?? item);
}
export function upsert<T extends { id: string }>(items: T[], item: T) {
  return items.some((other) => other.id === item.id)
    ? items.map((other) => (other.id === item.id ? item : other))
    : [...items, item];
}

export const changed = <T extends object, K extends keyof T>(original: T, draft: T, keys: readonly K[]) =>
  Object.fromEntries(keys.filter((key) => draft[key] !== original[key]).map((key) => [key, draft[key]])) as Partial<Pick<T, K>>;

/** Two changesets of one edit as one; lists join, so records and deletions from both are saved. */
export function mergeChanges(a: Changes, b: Changes): Changes {
  const merged: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b))
    merged[key] = Array.isArray(value) && Array.isArray(merged[key]) ? [...merged[key] as unknown[], ...value] : value;
  return merged as Changes;
}

/** One changeset that rewrites every record the failed ones touched, using current data so stale versions never return. */
export function resave(data: WorkspaceData, failed: Changes[]): Changes {
  const changes: Changes = {};
  if (failed.some((item) => item.domains)) changes.domains = data.domains;
  if (failed.some((item) => item.routineRuns)) changes.routineRuns = data.routineRuns;
  if (failed.some((item) => item.everyAgent) && data.everyAgent) changes.everyAgent = data.everyAgent;
  const placed = [...new Set(failed.flatMap((item) => [...Object.keys(item.briefs ?? {}), ...item.deletedBriefs ?? []]))];
  if (placed.some((place) => data.briefs[place]))
    changes.briefs = Object.fromEntries(placed.filter((place) => data.briefs[place]).map((place) => [place, data.briefs[place]]));
  if (placed.some((place) => !data.briefs[place])) changes.deletedBriefs = placed.filter((place) => !data.briefs[place]);
  const kinds = [
    ["projects", "deletedProjectIds"],
    ["notes", "deletedNoteIds"],
    ["tasks", "deletedTaskIds"],
    ["agents", "deletedAgentIds"],
    ["teams", "deletedTeamIds"],
    ["threads", "deletedThreadIds"],
    ["topics", "deletedTopicIds"],
    ["memories", "deletedMemoryIds"],
    ["runs", "deletedRunIds"],
  ] as const;
  for (const [kind, deletedKey] of kinds) {
    const touched = new Set(failed.flatMap((item) => [...(item[kind] ?? []).map((record) => record.id), ...(item[deletedKey] ?? [])]));
    if (!touched.size) continue;
    const records: { id: string }[] = data[kind];
    const current = records.filter((record) => touched.has(record.id));
    const live = new Set(current.map((record) => record.id));
    (changes as Record<string, unknown>)[kind] = current;
    changes[deletedKey] = [...touched].filter((id) => !live.has(id));
  }
  return changes;
}
