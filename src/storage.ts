// IndexedDB adapters: the signed-out WorkspaceStore and the device-local SessionStore.
import { clear, createStore, entries, get, promisifyRequest, set } from "idb-keyval";
import type { WorkspaceData } from "./model.ts";
import type { Session } from "./session.ts";
import { allRecordsOf, recordsOf, workspaceOf } from "./records.ts";
import type { Changes, RoutineClaim, WorkspaceStore } from "./workspace.ts";
import { mergeRoutineRuns } from "./routines.ts";
import type { SessionStore } from "./workbench.ts";

const store = createStore("life-workspace-ui-experiment-v2", "workspace");
/** Runs operations one after another, in call order; a failure doesn't stop the next one. */
export function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(operation: () => Promise<T>): Promise<T> => {
    const job = tail.then(operation);
    tail = job.catch(() => undefined);
    return job;
  };
}
const enqueue = serial();

/** Workspace records in this browser's IndexedDB, one key per record. */
export const indexedDbStore: WorkspaceStore = {
  async load() {
    return workspaceOf(await entries<string, unknown>(store));
  },
  save(changes: Changes) {
    const { puts, deletes } = recordsOf(changes);
    // One transaction: upserts and deletes commit together or not at all.
    return enqueue(() => store("readwrite", (objects) => {
      for (const [key, value] of puts) {
        if (key !== "routineRuns") objects.put(value, key);
        else {
          const existing = objects.get(key);
          existing.onsuccess = () => objects.put(mergeRoutineRuns(existing.result ?? {}, value as WorkspaceData["routineRuns"]), key);
        }
      }
      for (const key of deletes) objects.delete(key);
      return promisifyRequest(objects.transaction);
    }).then(() => undefined));
  },
  claimRoutine(id, due) {
    let result: RoutineClaim;
    return enqueue(() => store("readwrite", (objects) => {
      const existing = objects.get("routineRuns");
      existing.onsuccess = () => {
        const stored: WorkspaceData["routineRuns"] = existing.result ?? {};
        const claimed = !(Date.parse(stored[id] ?? "") >= Date.parse(due));
        const receipts = claimed ? mergeRoutineRuns(stored, { [id]: due }) : stored;
        if (claimed) objects.put(receipts, "routineRuns");
        result = { claimed, receipts };
      };
      return promisifyRequest(objects.transaction);
    }).then(() => result));
  },
  /** One transaction: a failure leaves the current workspace exactly as it was. It also forgets the device Session. */
  replace(data: WorkspaceData) {
    const rows = allRecordsOf(data);
    return enqueue(() => store("readwrite", (objects) => {
      objects.clear();
      for (const [key, value] of rows) objects.put(value, key);
      return promisifyRequest(objects.transaction);
    }).then(() => undefined));
  },
};

/** UI preferences stay on this device, outside the workspace store. */
export const sessionStore: SessionStore = {
  load: () => get("session", store),
  save: (session) => enqueue(() => set("session", session, store)),
};
/**
 * Forgets every workspace record and the session on this device; the next load starts from the demo seed. Your name,
 * bio and picture stay: they describe you, not the workspace being reset.
 */
export function clearWorkspace(): Promise<void> {
  return enqueue(async () => {
    const session = await get<Partial<Session>>("session", store);
    await clear(store);
    const { profileName = "", profileBio = "", profilePhoto = "", profileHue = "", profilePortrait = "" } = session ?? {};
    if (profileName || profileBio || profilePhoto || profileHue || profilePortrait)
      await set("session", { profileName, profileBio, profilePhoto, profileHue, profilePortrait }, store);
  });
}
