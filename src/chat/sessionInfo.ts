// Where a chat's conversation stands (D28), for the header's topic tooltip and New conversation: whether the next
// message starts one, how many messages it holds since when, whether starting fresh is worth suggesting (a window
// filling up, or hours idle), and whether the chat is already clear. Pure; sessionInfo.test.ts covers it.
import type { Thread } from "../model.ts";
import { clock } from "./format.ts";

export type SessionInfo = { fresh: boolean; inSession: number; where: string; freshReason: string; clear: boolean };

/** `fullest`: the fullest member's context window as a percentage, when known. `now` is the minute clock. */
export function sessionInfo(thread: Thread, sessionStart: number, sessionsToday: number, now: number, fullest?: number): SessionInfo {
  const { messages } = thread;
  const fresh = sessionStart >= messages.length;
  const inSession = messages.length - sessionStart;
  const lastAt = messages.at(-1)?.at;
  const idle = lastAt ? Math.floor((now - new Date(lastAt).getTime()) / 36e5) : 0;
  const freshReason = fresh ? "" : (fullest ?? 0) >= 60 ? "filling up" : idle >= 3 ? `${idle} h idle` : "";
  const started = messages[sessionStart]?.at;
  const where = `Conversation ${sessionsToday} today${fresh ? ", starts with your next message"
    : `, ${inSession} ${inSession === 1 ? "message" : "messages"}${started ? ` since ${clock(started)}` : ""}`}`;
  // A new day starts a fresh conversation without clearing the chat, so New stays available until the chat is clear.
  const clear = !messages.length || !!thread.sessionStarts?.includes(messages.length);
  return { fresh, inSession, where, freshReason, clear };
}
