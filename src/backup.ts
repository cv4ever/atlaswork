import type { WorkspaceData } from "./model.ts";
import type { Session } from "./session.ts";

/** First backup after three days with content; then weekly, unless the person snoozed it. */
export function backupReminderDue(firstContentAt: string, lastBackup: string | null, snoozedUntil: string | null, now: number): boolean {
  return now >= Date.parse(firstContentAt) + 3 * 86_400_000
    && (!lastBackup || now >= Date.parse(lastBackup) + 7 * 86_400_000)
    && (!snoozedUntil || now >= Date.parse(snoozedUntil));
}

/**
 * A workspace backup is one JSON file. Version 2 carries every File/Blob (dropped files and images) as base64, so a
 * restore brings them back. Version 1 files (before 2026-11-04) lost them: `JSON.stringify` turned each into `{}`.
 */
export type Backup = { version: 2; exportedAt: string; data: WorkspaceData; session: Session };
type Encoded = { $blob: { type: string; name?: string; lastModified?: number; base64: string } };

async function base64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

async function encode(value: unknown): Promise<unknown> {
  if (value instanceof Blob) return { $blob: { type: value.type, base64: await base64(value),
    ...(value instanceof File ? { name: value.name, lastModified: value.lastModified } : {}) } } satisfies Encoded;
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === "object")
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await encode(item)])));
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const blob = (value as Partial<Encoded>).$blob;
    if (blob && typeof blob.base64 === "string") {
      const bytes = Uint8Array.from(atob(blob.base64), (char) => char.charCodeAt(0));
      return blob.name !== undefined ? new File([bytes], blob.name, { type: blob.type, lastModified: blob.lastModified })
        : new Blob([bytes], { type: blob.type });
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item)]));
  }
  return value;
}

export async function backupOf(data: WorkspaceData, session: Session): Promise<Blob> {
  const backup = { version: 2, exportedAt: new Date().toISOString(), data: await encode(data), session } as const;
  return new Blob([JSON.stringify(backup)], { type: "application/json" });
}

const lists = ["domains", "projects", "notes", "tasks", "topics", "agents", "teams", "threads", "memories", "runs"] as const;

export type RestoredBackup = { data: WorkspaceData; session?: Session; exportedAt?: string; missingFiles: number };

/**
 * Reads a backup file you chose. Refuses anything that isn't one; `missingFiles` counts version-1 file resources whose
 * contents were never saved (they come back as notes without a file).
 */
export function readBackup(text: string): RestoredBackup {
  let parsed: { version?: unknown; exportedAt?: unknown; data?: Record<string, unknown>; session?: unknown };
  try { parsed = JSON.parse(text); } catch { throw new Error("That file isn't a workspace backup (it isn't JSON)."); }
  if ((parsed.version !== 1 && parsed.version !== 2) || !parsed.data || typeof parsed.data !== "object"
    || !["domains", "projects", "notes", "tasks"].every((key) => Array.isArray(parsed.data![key])))
    throw new Error("That file isn't a workspace backup.");
  const data = decode(parsed.data) as WorkspaceData & Record<string, unknown>;
  for (const key of lists) if (!Array.isArray(data[key])) data[key] = [] as never;
  if (!data.routineRuns || typeof data.routineRuns !== "object") data.routineRuns = {};
  if (!data.briefs || typeof data.briefs !== "object") data.briefs = {};
  let missingFiles = 0;
  data.notes = data.notes.map((note) => {
    if (note.file === undefined || note.file instanceof Blob) return note;
    missingFiles++;
    const { file: _lost, ...rest } = note;
    return rest;
  });
  const session = parsed.session && typeof parsed.session === "object" ? parsed.session as Session : undefined;
  return { data, session, exportedAt: typeof parsed.exportedAt === "string" ? parsed.exportedAt : undefined, missingFiles };
}
