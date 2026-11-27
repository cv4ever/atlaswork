// A thread's sittings (agents-design D28): where each conversation starts, its title, what an agent request asked
// (D50), and which of your messages Retry asks again.
import { background as handedOff } from "../supabase/functions/agent/caps.ts";
import { isOpen } from "./jobs.ts";
import type { Job } from "./jobs.ts";
import { routineKinds } from "./model.ts";
import type { Thread, ChatMessage } from "./model.ts";

/** One session of a thread (D28): its messages from one local day, or from a New session you started. */
export type Sitting = {
  key: string; threadId: string;
  /** Message range in the thread, `end` exclusive; a new message today extends the latest session. */
  start: number; end: number;
  /** First and last message times; undefined for messages from before timestamps. */
  started?: string; at?: string;
  /** What it was about: your first message, else the routine that posted, else the first message, shortened. */
  title: string;
  /** Where you were when you opened it: the first place your messages came from. */
  place?: string;
  /** Lowercased message text, for search. */
  text: string;
  /** A session that asked for an agent (D57): where its draft stands, as the Logbook says it. */
  request?: AgentRequest;
};

/** Where an agent request stands: no draft yet, the reply failed, a draft waits for review, or what you did with it. */
export type AgentRequest = { status: "asked" | "unanswered" | "pending" | "saved" | "rejected" | "replaced"; name?: string };

/** How New agent's Ask Atlas words your goal in his chat (D57); the Logbook recognises agent requests by it. */
export const agentRequestPrefix = "I'd like an agent for this: ";

/** A message cut at a word to title a session. */
const titled = (text: string) => text.length <= 60 ? text : `${text.slice(0, 60).replace(/\s+\S*$/, "")}…`;
const localDay = (at?: string) => {
  // Date getters, not Intl, since long histories run this per message.
  const date = at ? new Date(at) : undefined;
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "earlier";
};
export function sittingsOf(thread: Thread): Sitting[] {
  const out: Sitting[] = [];
  const starts = new Set(thread.sessionStarts);
  let day = "", titledByYou = false;
  thread.messages.forEach((message, index) => {
    const next = localDay(message.at);
    if (!out.length || next !== day || starts.has(index)) {
      out.push({ key: `${thread.id}@${index}`, threadId: thread.id, start: index, end: index, started: message.at, title: "", text: "" });
      titledByYou = false;
    }
    day = next;
    const sitting = out.at(-1)!;
    sitting.end = index + 1;
    // Earliest to latest: imported or seeded messages aren't always in time order.
    if (message.at && (!sitting.started || message.at < sitting.started)) sitting.started = message.at;
    if (message.at && (!sitting.at || message.at > sitting.at)) sitting.at = message.at;
    if (message.role === "user" && !titledByYou) {
      const asked = message.text.startsWith(agentRequestPrefix);
      sitting.title = titled(asked ? message.text.slice(agentRequestPrefix.length) : message.text);
      sitting.place = message.from;
      if (asked) sitting.request = { status: message.awaiting?.length ? "unanswered" : "asked" };
      titledByYou = true;
    } else if (!sitting.title) sitting.title = message.routine ? routineKinds[message.routine.kind].label : titled(message.text);
    const draft = message.proposal;
    if (draft?.agent) sitting.request = { name: draft.agent.name ?? draft.agent.from,
      status: draft.status === "pending" ? "pending" : draft.status === "applied" ? "saved" : draft.replaced ? "replaced" : "rejected" };
    sitting.text += `${message.text.toLocaleLowerCase()}\n`;
  });
  return out;
}

/** Where the session an agent is in now begins: a New session you started, today's session, or none yet (the next message). */
export function sessionStartOf(thread: Thread, sittings: Sitting[], now: number) {
  const last = sittings.at(-1);
  if (thread.sessionStarts?.includes(thread.messages.length) || !last) return thread.messages.length;
  return localDay(last.at) === localDay(new Date(now).toISOString()) ? last.start : thread.messages.length;
}

/** Your latest message, when agents it asked never answered and it's in the session they're in now: Retry asks them again (D28). */
export function retryable(thread: Thread, start: number): ChatMessage | undefined {
  const index = thread.messages.findLastIndex((message) => message.role === "user");
  const message = thread.messages[index];
  return message?.awaiting?.length && index >= start ? message : undefined;
}

/** How long the agent function may still be answering after a page that asked went away (D72): its 150 s wall clock. */
export const finishingMs = 150_000;
/**
 * Your messages the agent function is still answering, with no failure back, so they show as on their way, not as
 * unanswered; since each message saves on its own (D76), you may have written more meanwhile. Oldest first.
 * With the account's `jobs` (D76), a message is on its way while its job is open, and for two minutes after it ended,
 * while the page reloads what it landed. Without them, by time: a reply for `finishingMs` after you asked (D72), a
 * hand-off for its whole budget across runs plus a minute, counted from when it was last handed off (D73).
 */
export function finishing(thread: Thread, now: number, jobs?: Job[]): ChatMessage[] {
  // Newest first, so a Retry's job stands for its message.
  const jobOf = new Map(jobs?.toReversed().map((job) => [job.messageId, job]));
  return thread.messages.filter((message) => {
    if (message.role !== "user" || !message.awaiting?.length || message.failure) return false;
    const job = jobOf.get(message.id);
    if (job) return isOpen(job) || now - Date.parse(job.endedAt ?? job.createdAt) < 120_000;
    const since = message.background ?? message.at;
    const window = message.background ? handedOff.ms + 60_000 : finishingMs;
    return !!since && now - Date.parse(since) < window;
  });
}
