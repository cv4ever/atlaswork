import test from "node:test";
import assert from "node:assert/strict";
import { createBackend, createServerStore, withLocalUpload } from "./cloud.ts";
import type { FileShelf, Rpc } from "./cloud.ts";
import { createProject, deleteForever, markBrief, normalize, saveEveryAgent, saveThread } from "./workspace.ts";
import type { ChatMessage, Note, WorkspaceData } from "./model.ts";
import type { WorkspaceStore } from "./workspace.ts";
import { postedThread } from "./proposals.ts";
import type { MessageRecord } from "./records.ts";
import { mergeRoutineRuns } from "./routines.ts";

/**
 * The Postgres workspace functions over a Map, including durable Routine claims. A load puts each thread's message
 * records back in it, in the order they were written, as `load_workspace` does (migration *_messages_apart.sql).
 */
function server() {
  const rows = new Map<string, unknown>();
  let down = false;
  const rpc: Rpc = async (name, body) => {
    if (down) throw new Error("Couldn't reach your account.");
    if (name === "load_workspace") {
      const messages = [...rows].filter(([key]) => key.startsWith("message:")).map(([, value]) => value as MessageRecord)
        .sort((a, b) => a.n - b.n || (a.message.at ?? "").localeCompare(b.message.at ?? ""));
      return Object.fromEntries([...rows].filter(([key]) => !key.startsWith("message:")).map(([key, value]) => [key, key.startsWith("thread:")
        ? { ...value as object, messages: messages.filter((record) => `thread:${record.thread}` === key).map((record) => record.message) } : value]));
    }
    if (name === "claim_routine") {
      const { p_id: id, p_due: due } = body as { p_id: string; p_due: string };
      const stored = rows.get("routineRuns") as WorkspaceData["routineRuns"] ?? {};
      const claimed = !(Date.parse(stored[id] ?? "") >= Date.parse(due));
      const receipts = claimed ? mergeRoutineRuns(stored, { [id]: due }) : stored;
      if (claimed) rows.set("routineRuns", receipts);
      return { claimed, receipts };
    }
    const { p_puts, p_deletes, p_replace } = body as { p_puts: Record<string, unknown>; p_deletes: string[]; p_replace?: boolean };
    if (p_replace) rows.clear();
    // Through JSON, as over HTTP: a File that slipped through would arrive as {}.
    for (const [key, value] of Object.entries(JSON.parse(JSON.stringify(p_puts)))) rows.set(key,
      key === "routineRuns" ? mergeRoutineRuns(rows.get(key) as WorkspaceData["routineRuns"] ?? {}, value as WorkspaceData["routineRuns"]) : value);
    for (const key of p_deletes) rows.delete(key);
    return null;
  };
  return { rows, rpc, setDown: (value: boolean) => { down = value; } };
}
function shelf(): FileShelf & { files: Map<string, File> } {
  const files = new Map<string, File>();
  return { files, get: async (id) => files.get(id), set: async (id, file) => { files.set(id, file); }, del: async (id) => { files.delete(id); } };
}
const note = (id: string, file?: File): Note =>
  ({ id, domain: "Everyday", projectId: "", title: id, body: "", updatedAt: "2026-11-06T10:00:00.000Z", ...(file ? { file } : {}) }) as Note;

test("notes go up without their file, which stays on this device and comes back on load", async () => {
  const remote = server();
  const files = shelf();
  const store = createServerStore(remote.rpc, files);
  const photo = new File(["pixels"], "photo.png", { type: "image/png" });
  await store.save({ notes: [note("a", photo), note("b")] });
  assert.equal("file" in (remote.rows.get("note:a") as object), false, "the server never gets file bodies");
  const loaded = await store.load();
  assert.equal(loaded?.notes.find((item) => item.id === "a")?.file, photo);
  const elsewhere = await createServerStore(remote.rpc, shelf()).load();
  assert.equal(elsewhere?.notes.find((item) => item.id === "a")?.file, undefined, "another device sees the note without its file");

  remote.setDown(true);
  await assert.rejects(store.save({ deletedNoteIds: ["a"] }));
  assert.ok(files.files.has("a"), "a failed delete keeps the file for the retry");
  remote.setDown(false);
  await store.save({ deletedNoteIds: ["a"] });
  assert.deepEqual([remote.rows.has("note:a"), files.files.has("a")], [false, false]);
});

test("an empty account takes this device's workspace once; an account with data keeps it", async () => {
  const mine: WorkspaceData = { ...normalize(null).data, notes: [note("local")] };
  let saved: WorkspaceData | null = mine;
  const device: WorkspaceStore = { load: async () => saved, save: async () => {}, replace: async (data) => { saved = data; },
    claimRoutine: async (id, due) => {
      const receipts = saved?.routineRuns ?? {};
      const claimed = !(Date.parse(receipts[id] ?? "") >= Date.parse(due));
      if (saved && claimed) saved = { ...saved, routineRuns: mergeRoutineRuns(receipts, { [id]: due }) };
      return { claimed, receipts: saved?.routineRuns ?? receipts };
    } };
  const remote = server();
  const first = await withLocalUpload(createServerStore(remote.rpc, shelf()), device).load();
  assert.deepEqual(first?.notes.map((item) => item.id), ["local"]);
  assert.ok(remote.rows.has("note:local"), "the device's workspace is now the account's");

  saved = { ...normalize(null).data, notes: [note("other")] };
  const again = await withLocalUpload(createServerStore(remote.rpc, shelf()), device).load();
  assert.deepEqual(again?.notes.map((item) => item.id), ["local"], "a second device never overwrites the account");
});

test("the backend says when you're signed out or offline, and passes on the size cap's and a taken computer name's own words", async (t) => {
  let reply: () => Promise<Response> = async () => Response.json([]);
  const fetched = t.mock.method(globalThis, "fetch", () => reply());
  let signedIn = false;
  const backend = createBackend({ url: "https://x.test", key: "pk" }, async () => {
    if (!signedIn) throw new Error("You're signed out.");
    return "jwt";
  });
  await assert.rejects(backend.agent("{}"), /signed out/);
  assert.equal(fetched.mock.callCount(), 0, "nothing is sent without a token");
  signedIn = true;
  reply = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(backend.read("entitlements"), /Couldn't reach your account/);
  reply = async () => Response.json({ code: "53400", message: "Your workspace is over 25 MB." }, { status: 400 });
  await assert.rejects(backend.rpc("save_workspace", {}), /over 25 MB/);
  reply = async () => Response.json({ code: "23505", message: "You already have a computer called Office PC. Give this one another name." }, { status: 409 });
  await assert.rejects(backend.rpc("register_computer", { p_name: "Office PC" }), /already have a computer called Office PC/);
  reply = async () => Response.json({ code: "42501" }, { status: 403 });
  await assert.rejects(backend.rpc("save_workspace", {}), /refused the change \(HTTP 403\)/);
});

test("Not now and Got it reach every device, one record per place, keyed so the server's pattern accepts any domain name", async () => {
  const remote = server();
  const phone = createServerStore(remote.rpc, shelf());
  const laptop = createServerStore(remote.rpc, shelf());
  const data = normalize(null).data;
  await phone.replace(data);
  const welcomed = markBrief(data, "p1", { welcomed: true });
  await phone.save(welcomed.changes);
  const dismissed = markBrief(welcomed.data, "area:Pet care", { dismissed: "late:t1" });
  await phone.save(dismissed.changes);
  // supabase/migrations/*_brief_records.sql: no whitespace after the prefix.
  assert.ok([...remote.rows.keys()].filter((key) => key.startsWith("brief:")).every((key) => /^brief:[^\s]{1,200}$/.test(key)));
  assert.deepEqual((await laptop.load())?.briefs, { p1: { welcomed: true }, "area:Pet care": { dismissed: "late:t1" } });
  const restored = markBrief(dismissed.data, "area:Pet care", { dismissed: undefined });
  assert.deepEqual(restored.data.briefs["area:Pet care"], {}, "Show brings the brief back");
  assert.deepEqual(markBrief(restored.data, "p1", { welcomed: true }).changes, {}, "marking again writes nothing");
});

test("what every agent shares reaches every device and survives a restore; clearing a value brings back the default", async () => {
  const remote = server();
  const phone = createServerStore(remote.rpc, shelf());
  const laptop = createServerStore(remote.rpc, shelf());
  const data = normalize(null).data;
  await phone.replace(data);
  const set = saveEveryAgent(data, { rules: "Prices in euros.", warmth: 0, tools: { web: true } });
  await phone.save(set.changes);
  assert.deepEqual((await laptop.load())?.everyAgent, { rules: "Prices in euros.", warmth: 0, tools: { web: true } });
  await laptop.replace(set.data);
  assert.deepEqual((await phone.load())?.everyAgent, set.data.everyAgent, "a whole-workspace restore keeps it");
  const cleared = saveEveryAgent(set.data, { warmth: undefined, tools: {} });
  assert.deepEqual(cleared.data.everyAgent, { rules: "Prices in euros." });
  assert.deepEqual(saveEveryAgent(cleared.data, { rules: "Prices in euros." }).changes, {}, "saving the same writes nothing");
});

test("deleting a project forever takes its brief mark with it, on every device", async () => {
  const remote = server();
  const store = createServerStore(remote.rpc, shelf());
  let data = createProject(normalize(null).data, { id: "p1", title: "P", area: "Everyday", description: "", color: "pine" }).data;
  await store.replace(data);
  for (const place of ["p1", "area:Everyday"]) {
    const marked = markBrief(data, place, { dismissed: "late:x" });
    data = marked.data;
    await store.save(marked.changes);
  }
  const gone = deleteForever(data, { kind: "project", id: "p1" });
  await store.save(gone.changes);
  assert.deepEqual(gone.data.briefs, { "area:Everyday": { dismissed: "late:x" } });
  assert.deepEqual((await createServerStore(remote.rpc, shelf()).load())?.briefs, gone.data.briefs);
});

test("a reply the server lands and a message you write meanwhile both stay, in the order they were written (D76)", async () => {
  for (const pageFirst of [false, true]) {
    const remote = server();
    const page = createServerStore(remote.rpc, shelf());
    const asked: ChatMessage = { id: "u1", role: "user", text: "Plan my week", awaiting: ["atlas"], at: "2026-11-22T10:00:00.000Z" };
    const start: WorkspaceData = { ...normalize(null).data, threads: [{ id: "agent:atlas", messages: [asked], read: 1, attachedNoteId: null }] };
    await page.replace(start);
    // The agent function loads the account and posts the reply under your message (supabase/functions/agent/away.ts).
    const worker = createServerStore(remote.rpc, shelf());
    const loaded = (await worker.load())!;
    const landed = saveThread(loaded, postedThread(loaded.threads[0], { role: "agent", agentId: "atlas", replyTo: "u1", at: "2026-11-22T10:00:20.000Z" },
      [{ text: "Here is a plan" }]));
    // The page, which hasn't seen the reply, sends another message and has read both of its own.
    const sent = saveThread(start, { ...start.threads[0], read: 2,
      messages: [asked, { id: "u2", role: "user", text: "And Friday?", at: "2026-11-22T10:00:30.000Z" }] });
    const writes = [() => worker.save(landed.changes, loaded), () => page.save(sent.changes, start)];
    for (const write of pageFirst ? writes.reverse() : writes) await write();
    const thread = (await createServerStore(remote.rpc, shelf()).load())!.threads[0];
    assert.deepEqual(thread.messages.map((message) => message.text), ["Plan my week", "Here is a plan", "And Friday?"]);
    assert.deepEqual(thread.messages[0].awaiting, [], "your first message stays answered");
    assert.equal(thread.read, 2, "the reply doesn't put back what the page had read");
  }
});
