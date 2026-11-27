import test from "node:test";
import assert from "node:assert/strict";
import { accountRecordsOf, withRecords } from "./records.ts";
import { normalize, saveThread } from "./workspace.ts";
import { postedThread } from "./proposals.ts";
import type { ChatMessage, Note, WorkspaceData } from "./model.ts";

test("what the function landed joins the page where a reload would put it, keeps what the page wrote meanwhile, and saves nothing (D76)", () => {
  const asked: ChatMessage = { id: "u1", role: "user", text: "Plan my week", awaiting: ["atlas"], at: "2026-11-23T10:00:00.000Z" };
  const photo = new File(["pixels"], "photo.png", { type: "image/png" });
  const note: Note = { id: "n1", domain: "Everyday", projectId: "", title: "Photo", body: "", updatedAt: "2026-11-23T09:00:00.000Z", file: photo };
  const stored: WorkspaceData = { ...normalize(null).data, notes: [note], threads: [{ id: "agent:atlas", messages: [asked], read: 1, attachedNoteId: null }] };
  // The function lands its reply against the stored workspace (no files there), with a task its proposal applied.
  const server = { ...stored, notes: [{ ...note, file: undefined }] };
  const posted = saveThread(server, postedThread(server.threads[0], { role: "agent", agentId: "atlas", replyTo: "u1", at: "2026-11-23T10:00:20.000Z" }, [{ text: "Here's a plan." }]));
  const task = { id: "t1", domain: "Everyday", projectId: "", title: "Book the dentist", done: false, due: "" };
  const records = accountRecordsOf({ ...posted.changes, tasks: [task], notes: [{ ...note, title: "Photo of the receipt", file: undefined }] }, server);
  // Meanwhile the page sent another message and read it.
  const page = saveThread(stored, { ...stored.threads[0], read: 2, messages: [asked, { id: "u2", role: "user", text: "And Friday?", at: "2026-11-23T10:00:30.000Z" }] }).data;

  const now = withRecords(page, records);
  const thread = now.threads[0];
  assert.deepEqual(thread.messages.map((message) => message.text), ["Plan my week", "Here's a plan.", "And Friday?"]);
  assert.deepEqual(thread.messages[0].awaiting, [], "your message is answered");
  assert.equal(thread.read, 2, "what the page read stays");
  assert.deepEqual(now.tasks.map((item) => item.title), ["Book the dentist"]);
  assert.equal(now.notes[0].title, "Photo of the receipt");
  assert.equal(now.notes[0].file, photo, "the note keeps the file this device holds");
  assert.equal(withRecords(page, { puts: [], deletes: [] }), page, "nothing landed changes nothing");
});
