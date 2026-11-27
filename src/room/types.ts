// What the Room says about chats: how each one reads (`ThreadSummary`), the roster's rows, what agents are doing now
// (`Activity`), what discovery finds, and the interface every chat surface calls (`Conversations`).
import type * as crews from "../agents.ts";
import type { ChatModel } from "../chatModel.ts";
import type { Job } from "../jobs.ts";
import type { Agent, ChatMessage, Proposal, Thread } from "../model.ts";
import type { Sitting } from "../sittings.ts";

/** A Thread as the strip, the chat list and the Chats page show it: identity, membership, and how it reads. Colours stay with the UI. */
export type ThreadSummary = {
  id: string;
  kind: "agent" | "project" | "team" | "room";
  title: string;
  description: string;
  agents: Agent[];
  domain?: string;
  thread: Thread;
  unread: number;
  latest?: ChatMessage;
  readOnly: boolean;
  /** Its name: the title, else who's in it. */
  label: string;
  /** An agent's role, else who's in it. */
  detail: string;
  /** Where the chat list files it: Everywhere (Atlas), Rooms, Teams, a Domain, Not assigned, or Archived. */
  group: string;
  /** The latest message and who wrote it, for previews and newest-first order. */
  last?: { text: string; by: string; at?: string };
};
/** One agent's row in the sidebar roster, before the UI colours it by its Domain. */
export type RosterRow = {
  thread: string;
  agent: Agent;
  /** Shown when the thread has no messages yet. */
  role: string;
  last?: ThreadSummary["last"];
  unread: number;
  /** The emoji of the domain it looks after. */
  emoji?: string;
  presence: crews.Presence;
  /** Works in the selected domain (Atlas always does). */
  here: boolean;
};
/** What a replying agent is doing now, as a real agent reports it: the step's words and the tool taking it (D81). */
export type Step = { text: string; tool?: string };
/**
 * `progress` is every step the replying agent has taken in this reply, in order, the last the one it's on, when a real
 * agent reports them (D81); a step repeated back to back shows once. `jobs` are what the agent function is doing for
 * this account (agents-design D76), read from the jobs themselves, so every device sees work it didn't ask for.
 */
export type Activity = { thinking: Record<string, Agent | undefined>; errors: Record<string, string | undefined>;
  progress: Record<string, Step[] | undefined>; proposalErrors: Record<string, string | undefined>; jobs: Job[] };

/** `steps` with `step` after them, unless it repeats the last one (two notes searched in a row read as one step). */
export const withStep = (steps: Step[] | undefined, step: Step): Step[] =>
  steps?.at(-1)?.text === step.text && steps.at(-1)?.tool === step.tool ? steps : [...steps ?? [], step];
/** What `discover()` finds: the current Thread, picker choices, Chats page tabs and retained history. */
export type Discovery = {
  current: ThreadSummary;
  strip: ThreadSummary[];
  /** Every chat, filed by `group` in the chat list's order. */
  chats: ThreadSummary[];
  /** The Chats page tabs: pinned first, then in the order opened, plus the one on screen; deleted chats drop out. */
  tabs: ThreadSummary[];
  entries: ReadonlyMap<string, ThreadSummary>;
  sittings: Sitting[];
  unreadTotal: number;
  /** Every active agent, in roster order. */
  roster: RosterRow[];
  /** What the current Thread says before anyone writes: the agent's welcome, or who's in the room. */
  welcome: string;
};
/** What a round of routines did. `failed` holds each failed run's reason, in order. */
export type RoutineRun = { ran: number; posted: number; failed: string[]; offline?: boolean };
export type Conversations = {
  getSnapshot(): Activity;
  subscribe(listener: () => void): () => void;
  /** The account's jobs as the job watch last read them (D76). */
  followJobs(jobs: Job[]): void;
  /**
   * Discover the current Thread, picker choices, Chats page tabs and retained history from the current Workspace and
   * Session. The Session's place decides the Nearest owner unless a Picked chat holds there. No records are created.
   */
  discover(): Discovery;
  /** Keeps a Thread on screen beside your work while you stay in this Domain and Project (a Picked chat). */
  pickChat(threadId: string): void;
  /** Opens a Thread as a Chats page tab and puts it on screen there (D27). */
  openChat(threadId: string): void;
  /** Closes a Chats page tab; closing the one on screen opens its neighbour. False when no tab is left to show. */
  closeChat(threadId: string): boolean;
  togglePinChat(threadId: string): void;
  startRoom(title: string, memberIds: string[]): string;
  attach(threadId: string, noteId: string | null): void;
  markRead(threadId: string): void;
  /**
   * Starts a fresh session (D28): the next message opens it, and agents carry none of the earlier messages into it.
   * Nothing changes when the session is already fresh (the next message opens one anyway).
   */
  newSession(threadId: string): void;
  /** Posts your message for the chat's agents; `background` hands it off to the first of them (D73), who answers later. */
  send(threadId: string, text: string, from: string, background?: boolean): Promise<void>;
  /**
   * Asks the agents who never answered your latest message to answer it now (D28), while it's in the current
   * session; their replies follow it, and the message is not sent twice. Does nothing otherwise, or while someone replies.
   */
  retry(threadId: string, messageId: string): Promise<void>;
  /** `amended`: the same pending proposal as you edited it in its dialog (a project reviewed there, D63), applied in its place. */
  actOnProposal(threadId: string, proposalId: string, action: "apply" | "reject" | "undo", amended?: Proposal): void;
  /**
   * Your answer to an agent's question for another agent (agents-design D50): Send or Always, which then runs the asked
   * agent here, or Decline. `question` is your edit of it, sent instead. Throws the refusal at once, and then nothing
   * is sent; resolves once the asked agent answered, and the asker followed up if it said it would.
   */
  actOnAsk(threadId: string, askId: string, action: "send" | "always" | "decline", question?: string): Promise<void>;
  /** Takes back one memory a reply saved (agents-design D49); throws when it changed since. */
  unremember(threadId: string, messageId: string, memoryId: string): void;
  /**
   * Keep or Not this on where something is on a computer that a reply offered to remember (agents-design D80), or Undo
   * on one you kept; throws when it's no longer waiting, its agent may not remember there, or it changed since.
   */
  learn(threadId: string, messageId: string, memoryId: string, action: "keep" | "decline" | "undo"): void;
  /** Marks the answer you tapped under an agent's choices (D64); the caller sends it as your message. False when it was already answered. */
  pick(threadId: string, messageId: string, option: string): boolean;
  /**
   * The model and thinking `agentId` answers on in this chat (agents-design D82): fields given replace this chat's
   * choice, null picks the provider's default or the account's Thinking, and a pick equal to the agent's own clears it.
   */
  setChatModel(threadId: string, agentId: string, choice: ChatModel): Promise<void>;
  /** Makes this chat's choice the agent's own for every chat and routine (Profile → Model) and clears it here. */
  keepChatModel(threadId: string, agentId: string): Promise<void>;
  /** Re-asks the original request, explicitly, to the same agent with current records. Never retries automatically. */
  requestFreshProposal(threadId: string, proposalId: string): Promise<void>;
  /**
   * Runs every routine that's due (or just `onlyId`, due or not) through the agents' engine, one after another, and
   * says how many ran, how many had something to say and what failed. Nothing runs while no model is connected.
   */
  runRoutines(now: Date, onlyId?: string): Promise<RoutineRun>;
};
