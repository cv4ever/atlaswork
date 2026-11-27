// What the screen's buttons do: Workspace edits through the Workbench, chat moves through the Room, and the popups,
// drafts and toasts in the UI store. Every action reads the current state when it runs, never a value captured while
// rendering, so one stable Actions object serves every component (docs/adr/0002). Its areas build on each other in
// src/actions/ (core, chat, records, crew, library); this last one holds briefs, every agent's settings, routines,
// backups and onboarding.
import { LibraryActions } from "./actions/library.ts";
import { backupOf, readBackup } from "./backup.ts";
import type { RestoredBackup } from "./backup.ts";
import type { BriefAction, BriefState } from "./brief.ts";
import { locale } from "./dates.ts";
import type { EveryAgent, ReviewChange, Routine, WorkspaceData } from "./model.ts";
import type { Session } from "./session.ts";
import { applyOnboarding } from "./onboarding.ts";
import type { OnboardingPicks } from "./onboarding.ts";
import { tabKey } from "./place.ts";
import type { QuietHours } from "./away.ts";
import type { RoutineOwner } from "./routines.ts";
import { todayDate } from "./view.ts";
import { morph } from "./morph.ts";
import * as workspace from "./workspace.ts";
import { clockOf } from "./today/day.ts";
import type { DayStep } from "./today/day.ts";

export class Actions extends LibraryActions {
  /** `seen` stays on this device; Not now and Got it go to the workspace, so every device agrees (D40). */
  setBriefState = (place: string, { seen, ...mark }: BriefState) => {
    if (seen !== undefined) void this.updateSession({ briefs: { ...this.session.briefs, [place]: { seen } } });
    if (Object.keys(mark).length) this.apply((d) => workspace.markBrief(d, place, mark));
  };
  /** Settings → Every agent (D46): what every agent shares, saved as you go. */
  setEveryAgent = (patch: Partial<EveryAgent>) => this.apply((d) => workspace.saveEveryAgent(d, patch));
  /** A brief's one action: open its thread (with words ready to send), move late steps to today, open or archive a project, or sort a capture. */
  actOnBrief = (action: BriefAction) => {
    if (action.kind === "today") {
      const change = this.apply((d) => workspace.moveTasksToDay(d, action.taskIds, this.shown.today));
      if (change) this.toast(`Moved ${action.taskIds.length === 1 ? "it" : `${action.taskIds.length} steps`} to today.`);
      return;
    }
    if (action.kind === "open") return this.openTab(tabKey({ kind: "project", id: action.projectId }));
    if (action.kind === "archive") {
      const project = this.data.projects.find((item) => item.id === action.projectId);
      return project && this.archiveProject(project);
    }
    if (action.kind === "sort") return this.sortWithAtlas(action.noteId);
    if (action.draft) void this.updateSession({ chatDraft: action.draft });
    this.chatWith(action.thread);
  };

  /**
   * Puts tasks at a time or part of today (`at` "" for anytime) in one changeset, with Undo back to the day and place
   * each had while nobody changed it since (agents-design D75): Today's tray, Other time, and a step's Apply.
   */
  placeInDay = (places: { id: string; at: string }[], words: string) => {
    const before = places.flatMap(({ id }) => this.data.tasks.filter((task) => task.id === id));
    const change = this.apply((d) => workspace.placeTasks(d, places, this.shown.today));
    if (!change?.changes.tasks?.length) return;
    const placed = change.changes.tasks;
    this.ui.set({ toast: words, toastAction: { for: words, buttons: [{ label: "Undo", run: () => {
      const stamp = (id: string) => placed.find((item) => item.id === id)?.updatedAt;
      const untouched = before.filter((task) => this.data.tasks.find((item) => item.id === task.id)?.updatedAt === stamp(task.id));
      for (const task of untouched) this.apply((d) => workspace.editTask(d, task.id, { due: task.due, at: task.at ?? "" }));
    } }] } });
  };
  /**
   * Applies next steps (D75): a crew step lands at its time; a proposal that adds tasks applies as it stands; a plan's
   * changes put their tasks in place one by one, and the plan itself is applied (with its own Undo) once every change
   * in it is applied or already in place, so the chat shows it done.
   */
  applySteps = (steps: DayStep[]) => {
    const placed: { id: string; at: string }[] = [];
    const plans = new Map<string, DayStep[]>();
    for (const step of steps) {
      if (step.proposal?.change) plans.set(step.proposal.proposal.id, [...plans.get(step.proposal.proposal.id) ?? [], step]);
      else if (step.proposal) this.handleProposal(step.proposal.thread, step.proposal.proposal, "apply");
      else if (step.task) placed.push({ id: step.task.id, at: step.minute === undefined ? "" : clockOf(step.minute) });
    }
    for (const chosen of plans.values()) {
      const { thread, proposal } = chosen[0].proposal!;
      const done = (change: ReviewChange) => change.kind === "reschedule" && this.data.tasks.some((task) => task.id === change.taskId
        && task.due === change.to && task.at === change.at);
      // A step whose named time had gone was given another; it lands there, so the plan as written isn't applied.
      const at = (step: DayStep) => step.minute === undefined ? step.proposal!.change!.at! : clockOf(step.minute);
      const asNamed = chosen.every((step) => at(step) === step.proposal!.change!.at);
      const whole = asNamed && (proposal.changes ?? []).every((change) => done(change) || chosen.some((step) => step.proposal!.change === change));
      if (whole) this.handleProposal(thread, proposal, "apply");
      else placed.push(...chosen.map((step) => ({ id: step.task!.id, at: at(step) })));
    }
    if (placed.length) this.placeInDay(placed, placed.length === 1 ? `Put “${steps.find((step) => step.task?.id === placed[0].id)!.title}” in your day.`
      : `Put ${placed.length} steps in your day.`);
  };
  /** Not now on a step: it stays away for the rest of today on this device. */
  skipStep = (key: string) => {
    const { day, keys } = this.session.todaySkipped;
    const today = this.shown.today;
    void this.updateSession({ todaySkipped: { day: today, keys: [...day === today ? keys : [], key] } });
  };

  /** Saves one owner's routines straight away: the Routines page edits in place, like ticking a task. */
  saveRoutines = (owner: RoutineOwner, list: Routine[]) => { this.apply((d) => workspace.setRoutines(d, owner, list)); };
  /** Runs what's due (or just `onlyId`) and says what happened. */
  runRoutines = (onlyId?: string) => this.conversations.runRoutines(todayDate(), onlyId);
  /**
   * Turns routines-while-away on or off for the account (agents-design D54). The switch moves at once and moves back,
   * with the reason, when the account refuses.
   */
  setRunAway = async (on: boolean) => {
    if (!this.away) return;
    const was = this.ui.get().runAway;
    this.ui.set({ runAway: on });
    try {
      await this.away.setRunAway(on);
      this.toast(on ? "Your crew runs routines while you're away. What they find waits in their chats." : "Routines run only while the app is open.");
    } catch (cause) {
      this.ui.set({ runAway: was });
      this.toast(cause instanceof Error ? cause.message : "Couldn't change that. Try again.");
    }
  };
  /** This device's notifications for what routines post while you're away (D55); turning them on asks the browser. */
  setPush = async (on: boolean) => {
    if (!this.away) return;
    try {
      const state = await this.away.setPush(on);
      this.ui.set({ pushState: state });
      if (state === "blocked") this.toast("Notifications are blocked for Atlaswork. Allow them in the browser's site settings, then try again.");
      else if (state === "unsupported") this.toast("This browser can't show notifications here. On an iPhone, add Atlaswork to the home screen first.");
      else this.toast(state === "on" ? "This device hears when a routine has something for you." : "No more notifications on this device.");
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Couldn't change notifications. Try again.");
    }
  };
  /** The account's quiet hours: none go out between `from` and `to`, minutes past midnight on your clock. */
  setQuietHours = async (quiet: QuietHours) => {
    if (!this.away) return;
    const was = this.ui.get().quietHours;
    this.ui.set({ quietHours: quiet });
    try {
      await this.away.setQuietHours(quiet);
    } catch (cause) {
      this.ui.set({ quietHours: was });
      this.toast(cause instanceof Error ? cause.message : "Couldn't change quiet hours. Try again.");
    }
  };

  /** Downloads a backup of these records and remembers when; throws when the file can't be built. */
  downloadBackup = async (data: WorkspaceData, session: Session) => {
    const url = URL.createObjectURL(await backupOf(data, session));
    const link = document.createElement("a");
    link.href = url;
    link.download = `workspace-backup-${new Date().toLocaleDateString("en-CA")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const at = new Date().toISOString();
    this.ui.set({ lastBackup: at });
    try { localStorage.setItem("atlaswork.last-backup", at); } catch { /* blocked: the profile just won't remember it */ }
  };
  exportBackup = async () => {
    try {
      await this.downloadBackup(this.data, this.session);
      this.toast("Backup exported, files and images included. Keep it somewhere other than this browser.");
    } catch {
      this.toast("Couldn't export the backup. Nothing was changed.");
    }
  };
  restoreBackup = async (file: File) => {
    let backup: RestoredBackup;
    try { backup = readBackup(await file.text()); }
    catch (cause) { this.toast(cause instanceof Error ? cause.message : "That file isn't a workspace backup."); return; }
    const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString(locale) : "an unknown date";
    const lost = backup.missingFiles ? ` ${backup.missingFiles} file ${backup.missingFiles === 1 ? "resource comes" : "resources come"} back without ${backup.missingFiles === 1 ? "its file" : "their files"}: older backups didn't keep them.` : "";
    if (!confirm(`Replace everything in this browser with the backup from ${when}? A copy of what's here now downloads first.${lost}`)) return;
    const refusal = await this.workbench.restore(backup, this.downloadBackup);
    if (refusal) return this.toast(refusal);
    location.reload();
  };
  /** Keeps the Today backup reminder away for a week. */
  snoozeBackup = () => {
    const until = new Date(Date.now() + 7 * 864e5).toISOString();
    this.ui.set({ backupSnooze: until });
    try { localStorage.setItem("atlaswork.backup-snooze", until); } catch { /* blocked: it asks again next visit */ }
  };

  /** Runs the welcome again over the workspace as it is (Settings → Profile, Ctrl+K); what you untick is archived. */
  openOnboarding = () => this.ui.set({ modal: null, reopenOnboarding: true });
  closeOnboarding = () => {
    this.ui.set({ reopenOnboarding: false });
    const url = new URL(location.href);
    if (url.searchParams.has("onboarding")) { url.searchParams.delete("onboarding"); history.replaceState(null, "", url); }
    void this.updateSession({ onboarded: true });
  };
  /** `start` names the domain whose starters the first morning opens on (Ready's primary action, D48). */
  finishOnboarding = (picks: OnboardingPicks, start?: string) => morph(() => {
    this.ui.set({ firstMorningStart: start ?? null });
    const made = this.apply((d) => applyOnboarding(d, picks, todayDate().toISOString()));
    this.closeOnboarding();
    // Adding a domain opens it; the first morning starts on Today, where Atlas's portrait morphs into the guide (D35).
    if (made?.changes.domains) void this.workbench.navigate("today");
    const joined = made?.changes.agents?.filter((agent) => !agent.archived) ?? [];
    const resting = (picks.archive?.domains.length ?? 0) + (picks.archive?.agentIds.length ?? 0);
    const parts = [joined.length ? `${joined.length === 1 ? joined[0].name : `${joined.length} agents`} joined the crew` : "",
      resting ? `${resting} went to the Archive` : ""].filter(Boolean);
    if (made && parts.length) this.toast(`${parts.join("; ")}.`);
  });
}
