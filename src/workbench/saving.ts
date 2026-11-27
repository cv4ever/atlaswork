// The Workbench's writes: whether one is in flight (its own subscription, off the snapshot), the failed record
// changesets kept for Retry, and Retry itself, which saves current records, never stale edits. A newer failure keeps
// the error and the unload guard up even when an older retry completes.
import type { Session } from "../session.ts";
import { resave } from "../workspace.ts";
import type { Changes, WorkspaceStore } from "../workspace.ts";
import type { WorkspaceData } from "../model.ts";
import type { SessionStore } from "../workbench.ts";

export type Saving = {
  /** Runs one write; a failure shows as the storage error instead of throwing. */
  write(operation: () => Promise<unknown>): Promise<void>;
  /**
   * Saves a record changeset made from `before`, keeping it for Retry when the store refuses. Retry rewrites what the
   * failed ones touched from current data, against the oldest failed one's `before` (agents-design D76).
   */
  persist(changes: Changes, before?: WorkspaceData): Promise<void>;
  retry(): Promise<void>;
  isSaving(): boolean;
  subscribe(listener: () => void): () => void;
};

export function createSaving(store: WorkspaceStore, sessions: SessionStore, current: {
  data(): WorkspaceData | null; session(): Session; setStorageError(message: string): void;
}): Saving {
  const listeners = new Set<() => void>();
  let saving = false;
  let pending = 0;
  let failureVersion = 0;
  const failed: { changes: Changes; before?: WorkspaceData }[] = [];
  let retrying: Promise<void> | undefined;
  const setSaving = (value: boolean) => {
    saving = value;
    for (const listener of listeners) listener();
  };
  function write(operation: () => Promise<unknown>): Promise<void> {
    pending++;
    if (!saving) setSaving(true);
    return Promise.resolve().then(operation).then(() => undefined).catch((cause) => {
      failureVersion++;
      current.setStorageError(cause instanceof Error ? cause.message : "Browser storage is unavailable.");
    }).finally(() => {
      if (!--pending) setSaving(false);
    });
  }
  return {
    write,
    persist(changes, before) {
      if (!Object.keys(changes).length) return Promise.resolve();
      return write(async () => {
        try {
          await store.save(changes, before);
        } catch (cause) {
          failed.push({ changes, before });
          throw cause;
        }
      });
    },
    retry() {
      if (retrying) return retrying;
      const batch = failed.splice(0);
      const version = failureVersion;
      retrying = write(async () => {
        if (batch.length) {
          try {
            await store.save(resave(current.data()!, batch.map((item) => item.changes)), batch[0].before);
          } catch (cause) {
            failed.unshift(...batch);
            throw cause;
          }
        }
        await sessions.save(current.session());
        if (failureVersion === version && !failed.length) current.setStorageError("");
      }).finally(() => { retrying = undefined; });
      return retrying;
    },
    isSaving: () => saving,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
