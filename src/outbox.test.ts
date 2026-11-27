import test from "node:test";
import assert from "node:assert/strict";
import { offlineMessage } from "./cloud.ts";
import { normalize } from "./workspace.ts";
import type { Changes, WorkspaceStore } from "./workspace.ts";
import type { Note } from "./model.ts";
import { withOutbox } from "./outbox.ts";
import type { Outbox, OutboxEvent } from "./outbox.ts";

const note = (id: string, title = id): Note => ({ id, domain: "Everyday", projectId: "", title, body: "", updatedAt: "2026-11-16T10:00:00.000Z" });
/** An account that can go offline, refuse, and remember what it saved, in order. */
function account() {
  let offline = false;
  let refusal = "";
  const saved: Changes[] = [];
  const store: WorkspaceStore = {
    async load() { if (offline) throw new Error(offlineMessage); return { ...normalize(null).data, notes: saved.flatMap((changes) => changes.notes ?? []) }; },
    async save(changes) { if (offline) throw new Error(offlineMessage); if (refusal) throw new Error(refusal); saved.push(changes); },
    async replace() {},
    async claimRoutine() { return { claimed: true, receipts: {} }; },
  };
  return { store, saved, set: (state: { offline?: boolean; refusal?: string }) => { offline = state.offline ?? offline; refusal = state.refusal ?? refusal; } };
}
function memoryBox(): Outbox & { size(): number } {
  const rows = new Map<string, Changes>();
  return {
    all: async () => [...rows].sort(([a], [b]) => a.localeCompare(b)),
    add: async (key, changes) => { rows.set(key, changes); },
    remove: async (key) => { rows.delete(key); },
    size: () => rows.size,
  };
}

test("notes written offline wait on the device and go out first, in order, once the account answers", async () => {
  const server = account(), box = memoryBox();
  const store = withOutbox(server.store, box);
  const heard: OutboxEvent[] = [];
  store.subscribe((event) => heard.push(event));
  server.set({ offline: true });
  await store.save({ notes: [note("a")] });
  await store.save({ notes: [note("b")] });
  assert.equal(box.size(), 2, "both wait");
  assert.deepEqual(heard.map((event) => [event.waiting, event.queued]), [[1, true], [2, true]]);
  await assert.rejects(store.save({ tasks: [], notes: [note("c")] }), new RegExp(offlineMessage.slice(0, 20)), "anything beyond notes still fails");
  server.set({ offline: false });
  await store.save({ domains: [] });
  assert.deepEqual(server.saved.map((changes) => changes.notes?.[0]?.id ?? "domains"), ["a", "b", "domains"], "the outbox goes first, in order");
  assert.equal(box.size(), 0);
  assert.deepEqual(heard.at(-1), { waiting: 0, sent: 2, queued: false });
});

test("a refusal isn't a lost connection: it fails as before and nothing waits", async () => {
  const server = account(), box = memoryBox();
  server.set({ refusal: "Your account refused the change (HTTP 403)." });
  await assert.rejects(withOutbox(server.store, box).save({ notes: [note("a")] }), /HTTP 403/);
  assert.equal(box.size(), 0);
});

test("a reload while notes still wait shows them over what the account holds", async () => {
  const server = account(), box = memoryBox();
  const store = withOutbox(server.store, box);
  server.set({ offline: true });
  await store.save({ notes: [note("a", "Written on the train")] });
  // The account answers reads again, but writes still fail for another reason: the note must not vanish on reload.
  server.set({ offline: false, refusal: "Your account refused the change (HTTP 500)." });
  const loaded = await store.load();
  assert.deepEqual(loaded?.notes.map((item) => item.title), ["Written on the train"]);
  assert.equal(box.size(), 1, "it still waits to be sent");
});
