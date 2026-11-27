import test from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage, Proposal } from "../model.ts";
import { transcriptWindow } from "./transcriptWindow.ts";

const message = (id: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, role: "agent", text: id, ...extra } as ChatMessage);
const pending = { status: "pending" } as Proposal;
const thread = (count: number, sessionStarts?: number[], extra: Record<number, Partial<ChatMessage>> = {}) =>
  ({ id: "t", sessionStarts, messages: Array.from({ length: count }, (_, index) => message(`m${index}`, extra[index])) });
const base = { needle: "", keptIds: [] };

test("New conversation folds what came before, keeping cards that wait on you", () => {
  const window = transcriptWindow({ ...base, thread: thread(6, [4], { 1: { proposal: pending } }) });
  assert.equal(window.hidden, 4);
  assert.deepEqual(window.newlyKept, ["m1"]);
  assert.deepEqual(window.shown, [1, 4, 5]);
});

test("finding or jumping back into the cleared part shows it all", () => {
  const cleared = thread(6, [4]);
  assert.deepEqual(transcriptWindow({ ...base, thread: cleared, needle: "m" }).shown, [0, 1, 2, 3, 4, 5]);
  assert.equal(transcriptWindow({ ...base, thread: cleared, jumpTo: { threadId: "t", index: 2 } }).hidden, 0);
});

test("reading an earlier conversation draws only it, until you find", () => {
  const cleared = thread(8, [4, 7], { 1: { proposal: pending } });
  const reading = { start: 4, end: 7 };
  assert.deepEqual(transcriptWindow({ ...base, thread: cleared, reading }).shown, [4, 5, 6]);
  // Finding searches the whole chat, so every match can show.
  assert.equal(transcriptWindow({ ...base, thread: cleared, reading, needle: "m" }).shown.length, 8);
});

test("a long thread draws its latest 150, and a jump renders back to its message", () => {
  const long = thread(400);
  assert.equal(transcriptWindow({ ...base, thread: long }).first, 250);
  assert.equal(transcriptWindow({ ...base, thread: long, jumpTo: { threadId: "t", index: 10 } }).first, 10);
  assert.equal(transcriptWindow({ ...base, thread: long, jumpTo: { threadId: "other", index: 10 } }).first, 250);
});
