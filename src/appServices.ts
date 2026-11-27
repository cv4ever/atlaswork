// Creates the app's services once. Apart from appContext.tsx, so a component that only reads the context doesn't pull
// the Workbench, the Room and every action into its chunk.
import { createRef } from "react";
import { Actions } from "./actions.ts";
import type { App } from "./appContext.ts";
import type { AgentEngine } from "./atlas.ts";
import type { AgentRequest } from "./agentRequest.ts";
import type { Away } from "./away.ts";
import { createConversations } from "./conversations.ts";
import { desktop } from "./desktop.ts";
import { createJobWatch, isOpen } from "./jobs.ts";
import type { Job } from "./jobs.ts";
import { createUi } from "./ui.ts";
import { createView } from "./view.ts";
import { createWorkbench } from "./workbench.ts";
import type { NavigationHistory, SessionStore } from "./workbench.ts";
import type { WorkspaceStore } from "./workspace.ts";
import type { Records } from "./records.ts";
import type { TidyAsk } from "./tidying.ts";
import type { WorkbenchShellHandle } from "./ui.ts";

const stored = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };

/**
 * The services App provides, created once: the Workbench over `store`, `sessions` and `history`, the Room, the UI
 * store, the View and the Actions. App passes the browser's; the design showcase (dev/design) a demo workspace in memory.
 * Signed in, `readJobs` reads the account's jobs (agents-design D76): the Room follows them, and the workspace reloads
 * when one ends, for what it landed, or starts for a message asked on another device, so it shows here on its way.
 * In the desktop app (D77), which lives on in the tray, it watches while hidden too, and a job that ends while the
 * window is hidden says so in a notification. `tidy` asks the account to Apply or Undo a tidy (D79).
 */
export function createAppServices({ store, engine, sessions, history, signedIn = false, portrait, away = null, tidy = null, readJobs, offers }: {
  store: WorkspaceStore; engine: AgentEngine; sessions: SessionStore; history: NavigationHistory;
  signedIn?: boolean; portrait?: string; away?: Away | null; tidy?: ((ask: TidyAsk) => Promise<Records>) | null;
  readJobs?: (path: string) => Promise<Record<string, unknown>[]>;
  /** Connections this build offers (D83), so an agent may ask for one in a chat. */
  offers?: AgentRequest["offers"];
}): App {
  const shell = createRef<WorkbenchShellHandle>();
  const workbench = createWorkbench(store, sessions, history);
  const conversations = createConversations(workbench, engine, offers);
  const held = (job: Job) => workbench.getSnapshot().data?.threads.find((thread) => thread.id === job.threadId)
    ?.messages.some((message) => message.id === job.messageId);
  const hidden = () => document.visibilityState !== "visible";
  const tell = (job: Job) => {
    const agent = workbench.getSnapshot().data?.agents.find((item) => item.id === job.agentId)?.name ?? "Your agent";
    if (job.kind === "tidy") return void desktop?.notify(job.state === "done" ? `${agent}'s tidy is done` : `${agent}'s tidy didn't run`,
      job.state === "done" ? "See in the chat what moved." : job.error ?? "Open the chat to try again.");
    void desktop?.notify(job.state === "done" ? `${agent} finished` : `${agent} couldn't finish`,
      job.state === "done" ? `The ${job.kind === "handoff" ? "work you handed off" : "answer"} is in the chat.` : job.error ?? "Open the chat to try again.");
  };
  const jobs = readJobs ? createJobWatch(readJobs, (news) => {
    if (desktop && hidden()) news.filter((job) => !isOpen(job)).forEach(tell);
    if (!news.some((job) => !isOpen(job) || !held(job))) return;
    void workbench.refresh();
    // A reload is skipped while an edit saves, so a second one a few seconds later brings what landed anyway.
    setTimeout(() => void workbench.refresh(), 5_000);
  }, () => !!desktop || !hidden()) : null;
  jobs?.subscribe(() => conversations.followJobs(jobs.getSnapshot()));
  const ui = createUi({
    modal: null, settingsTab: "you", query: "", capture: null, peek: null, topicDraft: null, keepSheet: null, editingTask: null,
    domainDraft: null, projectForm: null, agentDraft: null, teamForm: null, roomDraft: null, confirming: null, toast: "", toastAction: null,
    logbookWho: "", logbookShow: "all", logbookLimit: 120, jump: null, compose: 0, pickChats: false, routineOpen: null, allBriefs: false, planning: false,
    dayEvents: { day: "", events: [] },
    reopenOnboarding: new URLSearchParams(location.search).has("onboarding"), firstMorningStart: null,
    lastBackup: stored("atlaswork.last-backup"), backupSnooze: stored("atlaswork.backup-snooze"),
    persisted: null, sharedIds: [], community: [], online: navigator.onLine, now: Date.now(), runAway: null, quietHours: null, pushState: null,
  });
  const view = createView(workbench, conversations, ui, engine, portrait);
  const actions = new Actions(workbench, conversations, ui, view, shell, away, tidy);
  return { workbench, conversations, engine, ui, view, actions, shell, signedIn, away, jobs };
}
