import test from "node:test";
import assert from "node:assert/strict";
import type { ChatMessage, Thread } from "../model.ts";
import { sessionInfo } from "./sessionInfo.ts";

const at = (hour: number) => new Date(2026, 10, 21, hour).toISOString();
const said = (id: string, hour: number): ChatMessage => ({ id, role: "user", text: id, at: at(hour) });
const thread = (messages: ChatMessage[], sessionStarts?: number[]): Thread => ({ id: "agent:atlas", messages, read: 0, attachedNoteId: null, sessionStarts });

test("New conversation is suggested after three idle hours or with a window 60% full, never when the next message starts one", () => {
  const chat = thread([said("a", 9), said("b", 10)]);
  assert.equal(sessionInfo(chat, 0, 1, new Date(2026, 10, 21, 12).getTime()).freshReason, "");
  assert.equal(sessionInfo(chat, 0, 1, new Date(2026, 10, 21, 13).getTime()).freshReason, "3 h idle");
  assert.equal(sessionInfo(chat, 0, 1, new Date(2026, 10, 21, 10).getTime(), 60).freshReason, "filling up");
  assert.equal(sessionInfo(chat, 2, 2, new Date(2026, 10, 21, 13).getTime(), 90).freshReason, "");
});

test("the tooltip counts this conversation's messages, and a chat cleared by New is clear", () => {
  const info = sessionInfo(thread([said("a", 9), said("b", 10), said("c", 11)]), 1, 2, new Date(2026, 10, 21, 11).getTime());
  assert.match(info.where, /^Conversation 2 today, 2 messages since /);
  assert.equal(info.clear, false);
  assert.equal(sessionInfo(thread([said("a", 9)], [1]), 1, 1, Date.now()).clear, true);
  assert.equal(sessionInfo(thread([]), 0, 1, Date.now()).where, "Conversation 1 today, starts with your next message");
});
