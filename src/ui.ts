// The UI store: what's open on screen and not saved anywhere (the open popup, record-dialog drafts, the peek, the
// toast, the Logbook's choices), plus this device's backup dates and the minute clock. It lives outside React so
// each popup, the toast and each page subscribe to their own part (`useUi` in appContext.tsx): opening a dialog or typing
// in one re-renders that dialog, not the app (docs/adr/0002). No React or browser dependency.
import type { AtlasMark } from "./agentDrafts.ts";
import type { SharedAgent } from "./community.ts";
import type { Topic } from "./model.ts";
import type { DraftOf } from "./workspace.ts";
import type { StarterProject } from "./starterProjects.ts";
import type { QuietHours } from "./away.ts";
import type { PushState } from "./push.ts";
import type { Filled, ReviewMark, Step } from "./formFill.ts";
import type { LogbookShow } from "./chatsPage/logbook.ts";
import type { DayEvent } from "./today/day.ts";

export type AgentTab = "profile" | "permissions" | "tasks" | "schedule" | "briefing";
/**
 * What the agent dialog edits: the agent, where it works, and the open tab. Nothing is saved until Save. `atlas` marks
 * a draft Atlas wrote (agents-design D57); `describe` opens a new agent on “Describe what you need” first.
 */
export type AgentDraft = DraftOf<"agent"> & { tab: AgentTab; atlas?: AtlasMark; describe?: true };
export type SettingsTab = "you" | "account" | "model" | "connections" | "agents" | "people" | "backups" | "appearance" | "canvas" | "layout" | "about";
/** What the shell lets the rest of the app do to it: reveal chat after a note is attached, return to the workspace. */
export type WorkbenchShellHandle = {
  showChat: () => void;
  toggleChat: () => void;
  showWorkspace: () => void;
};

/**
 * The project dialog's state; `starter`: the idea it was opened from (D62), built with its page and first steps at Save,
 * `answer` filling its one number; `steps`: the steps an agent filled in (D63), added at Save instead of a starter's;
 * `filled`: what the last fill changed, lit up in the dialog; `review`: the chat proposal it opened from, applied at Start.
 */
export type ProjectForm = DraftOf<"project"> & { starter?: StarterProject; answer?: string; steps?: Step[]; filled?: Filled; review?: ReviewMark };
/** The domain dialog's state, with what the last fill changed (D63). */
export type DomainForm = DraftOf<"domain"> & { filled?: Filled };
export type Modal = "search" | "tabs" | "context" | "widgets" | "settings" | null;
/** A confirmation; `also` is one extra step it offers as a tick (deleting a domain: archive its agent too), passed to `run`. */
export type Confirming = { title: string; body: string; action: string; danger: boolean; also?: { label: string; on: boolean }; run: (also?: boolean) => void };
/** Buttons on the toast, shown only while the toast still says `for` (another toast replaces it). */
export type ToastAction = { for: string; buttons: { label: string; run: () => void }[] };
export type UiState = {
  modal: Modal;
  /** The Settings page to open; null opens Settings itself (Appearance on desktop, the list of pages on phones). */
  settingsTab: SettingsTab | null;
  /** The search, tab finder, note picker and link picker's words. */
  query: string;
  /**
   * The capture dialog's chosen home key, whether it's linking an existing Resource instead, text it opens with (a
   * share), whether it opens listening (a voice capture), and whether its header's place list is unfolded.
   */
  capture: { place: string; link?: boolean; text?: string; listen?: boolean; places?: boolean } | null;
  /** The resource in the peek, and the grid order ↑/↓ step through. */
  peek: { id: string; order: string[] } | null;
  topicDraft: Topic | null;
  /** Archiving a project with resources: which ones you keep, and in which topic (`topic:id`, "" while unchosen). */
  keepSheet: { projectId: string; keep: Record<string, string>; last: string } | null;
  editingTask: DraftOf<"task"> | null;
  domainDraft: DomainForm | null;
  projectForm: ProjectForm | null;
  agentDraft: AgentDraft | null;
  teamForm: DraftOf<"team"> | null;
  /** The "start a room" dialog: a title and the agents picked so far. */
  roomDraft: { title: string; memberIds: string[] } | null;
  confirming: Confirming | null;
  toast: string;
  toastAction: ToastAction | null;
  /** The Logbook (agents-design D19): whose conversations it lists ("" for everyone), which ones, how many it renders. */
  logbookWho: string;
  logbookShow: LogbookShow;
  logbookLimit: number;
  /** The last jump into a chat at one of its messages. */
  jump: { threadId: string; index: number; nonce: number } | null;
  /** Puts the caret in the chat's message box once per change: Ask about this hands you a quote to finish. 0 for never. */
  compose: number;
  /** The Chats page opens its All chats list, what needs you first, then clears this (the Needs you shortcut, launch.ts). */
  pickChats: boolean;
  /** The routine open in its editor, on the Routines page or in a domain or project dialog. */
  routineOpen: string | null;
  /** Whether Today's crew rail shows every agent's news, past the first three. */
  allBriefs: boolean;
  /** Whether Atlas's plan for the rest of the day shows on Today, as dashed steps (agents-design D75). */
  planning: boolean;
  /** Today's calendar events for the day line (agents-design D75), read from the connector and kept only in memory. */
  dayEvents: { day: string; events: DayEvent[] };
  /** `?onboarding` reopens the first-run flow over any workspace; its picks are safe to repeat. */
  reopenOnboarding: boolean;
  /** The domain Ready's "Start … first project" opens the first morning on (agents-design D48), until a starter is built. */
  firstMorningStart: string | null;
  /** When this browser last exported a backup, and until when the Today reminder stays away (ISO). */
  lastBackup: string | null;
  backupSnooze: string | null;
  /** Whether the browser keeps this site's data through storage pressure; null until it answers. */
  persisted: boolean | null;
  /** Which of this account's agents are shared with the community (D34), and what the community has shared. */
  sharedIds: string[];
  community: SharedAgent[];
  online: boolean;
  /** The minute clock: Today's date, the greeting and relative times follow it. */
  now: number;
  /** Whether the account runs routines while the app is closed (agents-design D54); null until it's known or signed out. */
  runAway: boolean | null;
  /** The account's quiet hours and this device's notifications (D55); null until known or signed out. */
  quietHours: QuietHours | null;
  pushState: PushState | null;
};

export type Ui = {
  get(): UiState;
  set(patch: Partial<UiState> | ((state: UiState) => Partial<UiState>)): void;
  subscribe(listener: () => void): () => void;
};

export function createUi(initial: UiState): Ui {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...typeof patch === "function" ? patch(state) : patch };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
