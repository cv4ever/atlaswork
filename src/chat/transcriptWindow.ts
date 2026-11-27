// Which of a thread's messages the chat draws (agents-design D28). The panel renders the latest 150; finding renders
// them all, and a jump renders back to its message. New conversation clears the chat: what came before folds away
// behind the "Previous" line, except cards still waiting on you, which stay (and stay after you act on them, so their
// Undo is at hand). Finding or a jump back into it shows it all again. Reading an earlier conversation (the header's
// switcher, the Previous line) draws only that one. A new day starts a fresh conversation for the agents but clears
// nothing. No React; transcriptWindow.test.ts covers it.
import type { ChatMessage, Thread } from "../model.ts";

export type WindowInput = {
  thread: Pick<Thread, "id" | "messages" | "sessionStarts">;
  /** The find bar's query, trimmed and lowercased; empty while not finding. */
  needle: string;
  jumpTo?: { threadId: string; index: number };
  /** The earlier conversation on screen, `end` exclusive; finding still searches them all. */
  reading?: { start: number; end: number };
  /** Ids of cleared messages already kept on screen because they waited on you. */
  keptIds: string[];
};

export type TranscriptWindow = {
  /** The first message rendered at all; earlier ones are behind "N earlier messages". */
  first: number;
  /** Where the cleared part ends: 0 when nothing is folded away. */
  hidden: number;
  /** Cleared messages that wait on you and aren't kept yet: the caller adds them to `keptIds`. */
  newlyKept: string[];
  /** Indexes of the messages drawn, in order. */
  shown: number[];
};

const waitsOnYou = (message: ChatMessage) => message.proposal?.status === "pending" || message.ask?.status === "pending";

export function transcriptWindow({ thread, needle, jumpTo, reading, keptIds }: WindowInput): TranscriptWindow {
  const { messages } = thread;
  if (reading && !needle) {
    const end = Math.min(reading.end, messages.length);
    const shown = Array.from({ length: Math.max(0, end - reading.start) }, (_, offset) => reading.start + offset);
    return { first: reading.start, hidden: 0, newlyKept: [], shown };
  }
  const jump = jumpTo?.threadId === thread.id ? jumpTo.index : undefined;
  const first = needle ? 0 : Math.max(0, Math.min(messages.length - 150, jump ?? Infinity));
  const cleared = Math.min(messages.length, Math.max(0, ...thread.sessionStarts ?? []));
  const hidden = needle || (jump !== undefined && jump < cleared) ? 0 : cleared;
  const start = Math.max(first, hidden);
  const newlyKept = messages.slice(first, start).filter((message) => waitsOnYou(message) && !keptIds.includes(message.id)).map((message) => message.id);
  const shown = [
    ...messages.slice(first, start).flatMap((message, offset) => keptIds.includes(message.id) || newlyKept.includes(message.id) ? [first + offset] : []),
    ...messages.slice(start).map((_, offset) => start + offset),
  ];
  return { first, hidden, newlyKept, shown };
}
