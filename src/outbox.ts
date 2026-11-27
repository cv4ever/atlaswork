// Notes written without a connection wait on this device and save when it's back (launch plan D17 phase 3,
// agents-design D56). Wraps the account's store: a changeset of notes alone (a capture, something shared in, the note
// you then type into) that fails only because the account can't be reached goes into an outbox in IndexedDB instead of
// failing; anything else still fails as before. The outbox goes out first, in order, before every later save and load,
// and when the browser says it's online again; `subscribe` hears how many wait and how many just went.
import { createStore, del, entries, set } from "idb-keyval";
import { offlineMessage } from "./cloud.ts";
import type { Changes, WorkspaceStore } from "./workspace.ts";

/** Where waiting changesets live, oldest first. IndexedDB on a device; tests pass a Map. */
export type Outbox = {
  all(): Promise<[string, Changes][]>;
  add(key: string, changes: Changes): Promise<void>;
  remove(key: string): Promise<void>;
};
export type OutboxEvent = { waiting: number; sent: number; queued: boolean };
export type Outboxed = WorkspaceStore & {
  /** Sends what waits; resolves with how many changesets went. Throws (keeping the rest) while the account can't be reached. */
  flush(): Promise<number>;
  subscribe(listener: (event: OutboxEvent) => void): () => void;
};

const shelf = createStore("atlaswork-outbox", "changes");
export const deviceOutbox: Outbox = {
  all: () => entries<string, Changes>(shelf).then((rows) => rows.sort(([a], [b]) => a.localeCompare(b))),
  add: (key, changes) => set(key, changes, shelf),
  remove: (key) => del(key, shelf),
};

/** Only notes, and no deletes: what Capture, a share and typing into a new note write. */
export const notesOnly = (changes: Changes) => !!changes.notes?.length && Object.keys(changes).every((key) => key === "notes");

export function withOutbox(server: WorkspaceStore, box: Outbox): Outboxed {
  const listeners = new Set<(event: OutboxEvent) => void>();
  const tell = async (sent: number, queued: boolean) => {
    const waiting = (await box.all()).length;
    for (const listener of listeners) listener({ waiting, sent, queued });
  };
  let order = 0;
  let flushing: Promise<number> | undefined;
  function flush() {
    return flushing ??= (async () => {
      let sent = 0;
      try {
        for (const [key, changes] of await box.all()) {
          await server.save(changes);
          await box.remove(key);
          sent++;
        }
      } finally {
        flushing = undefined;
        if (sent) await tell(sent, false);
      }
      return sent;
    })();
  }
  return {
    flush,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    /** What the account holds, with notes still waiting here laid over it, so a reload never hides one. */
    async load() {
      await flush().catch(() => undefined);
      const data = await server.load();
      const waiting = (await box.all()).flatMap(([, changes]) => changes.notes ?? []);
      if (!data || !waiting.length) return data;
      const notes = new Map(data.notes.map((note) => [note.id, note]));
      for (const note of waiting) notes.set(note.id, note);
      return { ...data, notes: [...notes.values()] };
    },
    async save(changes, before) {
      try {
        await flush();
        await server.save(changes, before);
      } catch (cause) {
        if (!(cause instanceof Error && cause.message === offlineMessage) || !notesOnly(changes)) throw cause;
        // Keys sort in the order the notes were written, even within one millisecond.
        await box.add(`${new Date().toISOString()}#${String(order++).padStart(6, "0")}`, changes);
        await tell(0, true);
      }
    },
    async replace(data) {
      await flush();
      return server.replace(data);
    },
    async claimRoutine(id, due) {
      await flush().catch(() => undefined);
      return server.claimRoutine(id, due);
    },
  };
}
