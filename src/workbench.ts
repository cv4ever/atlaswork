// The Workbench module: Workspace, Session and navigation behind one interface (`Workbench` documents each call).
// It owns load and legacy-thread migration, tab restoration and cleanup after rename, move, archive and delete, the
// remembered section per domain, persistence status and current-record retry, debounced scroll and the unload guard.
// React observes its snapshot through useSyncExternalStore. Its NavigationHistory seam is window.history in App.tsx
// and an in-memory history in workbench.test.ts, which covers it and its navigation rules (tabs.ts). Its writes and
// Retry are workbench/saving.ts, what a load makes of older saves workbench/migrate.ts, and where an edit leaves you
// workbench/selection.ts.
import { initialSession } from "./session.ts";
import { recordWidgets } from "./blocks.ts";
import type { ChatMessage, Domain, WorkspaceData } from "./model.ts";
import type { Session, TabSet } from "./session.ts";
import type { Block } from "./blocks.ts";
import { mergeRoutineRuns, readinessOf, routinesOf } from "./routines.ts";
import type { AdmittedRoutine, PlacedRoutine } from "./routines.ts";
import { withRecords } from "./records.ts";
import type { Records } from "./records.ts";
import * as tabs from "./tabs.ts";
import { migrated } from "./workbench/migrate.ts";
import { createSaving } from "./workbench/saving.ts";
import { sessionAfter } from "./workbench/selection.ts";
import { arrangePage, normalize, purgeBlock, resetPage } from "./workspace.ts";
import type { Change, RoutineClaim, WorkspaceStore } from "./workspace.ts";

export type SavedSession = Partial<Session> & {
  domains?: Domain[];
  messages?: ChatMessage[];
  attachedNoteId?: string | null;
  atlasWelcomeRead?: boolean;
  /** The day agents last ran their routines, before routines ran on their own schedules. */
  checkedIn?: string;
  /** Each routine's last run on this device, before runs were shared through the workspace. */
  routinesRan?: Record<string, string>;
};
/** Device-local presentation, kept separate from portable workspace records. */
export type SessionStore = {
  load(): Promise<SavedSession | undefined>;
  save(session: Session): Promise<void>;
};
/** Browser history in App and the local history adapter in checks cross the same navigation seam. */
export type NavigationHistory = {
  read(): URL;
  write(url: URL, mode: "push" | "replace"): void;
};
export type WorkbenchSnapshot = {
  data: WorkspaceData | null;
  session: Session;
  loadError: string;
  storageError: string;
};
export type Workbench = {
  getSnapshot(): WorkbenchSnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * Whether a write is in flight. It has its own subscription, off the snapshot: it flips twice on every edit, and
   * publishing it through the snapshot re-rendered the whole app a second time while the edit's animation played.
   */
  isSaving(): boolean;
  subscribeSaving(listener: () => void): () => void;
  load(): Promise<void>;
  /**
   * Applies a Workspace transition to the current records and commits what it returns. A transition that refuses
   * (a record deleted elsewhere, a name taken) commits nothing, and its reason comes back as a string instead of a throw.
   */
  edit<T extends Change>(transition: (data: WorkspaceData) => T): T | string;
  commit(change: Change): Promise<void>;
  /** Checks current eligibility and durable ownership together. Refuses storage failures instead of dispatching. */
  admitRoutine(placed: PlacedRoutine, now: Date, manual?: boolean): Promise<AdmittedRoutine | null>;
  navigate(target: string | URL): Promise<void>;
  selectDomain(name: string): Promise<void>;
  closeTab(key: string): Promise<void>;
  reorderTabs(keys: string[]): Promise<void>;
  togglePin(key: string): Promise<void>;
  updateSession(patch: Partial<Omit<Session, keyof TabSet | "domain" | "domainTabs" | "view">>): Promise<void>;
  retrySaving(): Promise<void>;
  rememberScroll(key: string, top: number): void;
  hasUnsavedChanges(): boolean;
  /** Reloads records saved elsewhere (another device or tab); skipped while local edits are unsaved or arrive meanwhile. */
  refresh(): Promise<void>;
  /**
   * Takes in records the account wrote elsewhere (agents-design D76: what the agent function landed for this page)
   * without saving them again. A refresh already under way then keeps them rather than loading over them.
   */
  absorb(records: Records): void;
  /**
   * Arranges the page `place` names (`onScreen(…).page.place`): a Domain's or Project's blocks change in the Workspace,
   * which puts away data blocks left out; "" is Today, whose record widgets are a Session choice. Returns a refusal.
   */
  arrangePage(place: string, blocks: Block[], today: string): string | undefined;
  /** Puts that page back on its default; a Page keeps its data blocks put away. */
  resetPage(place: string, today: string): string | undefined;
  /** Deletes a put-away block of a Page, and what it logged, for good. */
  purgeBlock(place: string, id: string): string | undefined;
  /**
   * Replaces every record with a backup's, after `keepCopy` saved the workspace as it is now. A copy that can't be
   * kept, or a store that refuses, replaces nothing; the reason comes back as a string. The device Session becomes the
   * backup's (or the defaults). Reload afterwards: nothing on screen follows the swap.
   */
  restore(backup: { data: WorkspaceData; session?: Session }, keepCopy: (data: WorkspaceData, session: Session) => Promise<void>): Promise<string | undefined>;
};

/** Owns Workspace edits, device Session, navigation, and persistence failures. No browser or React dependency. */
export function createWorkbench(store: WorkspaceStore, sessions: SessionStore, history: NavigationHistory): Workbench {
  let snapshot: WorkbenchSnapshot = { data: null, session: initialSession, loadError: "", storageError: "" };
  const listeners = new Set<() => void>();
  let boot: Promise<void> | undefined;
  let edits = 0;
  let scrollTimer: number | NodeJS.Timeout | undefined;
  const publish = (patch: Partial<WorkbenchSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const saving = createSaving(store, sessions, {
    data: () => snapshot.data, session: () => snapshot.session, setStorageError: (storageError) => publish({ storageError }) });
  const { write, persist } = saving;
  function writeLocation(session: Session, mode: "push" | "replace", base = history.read()) {
    const url = tabs.toUrl(session, base);
    if (url.href !== history.read().href) history.write(url, mode);
  }
  function commit(change: Change) {
    const { data, changes } = change;
    const before = snapshot.data ?? undefined;
    const previous = snapshot.session;
    const { session, mode } = sessionAfter(snapshot.data, previous, change);
    // Selection and records publish together; persistence remains separate and shares the existing retry rules.
    edits++;
    publish({ data, session });
    const recordWrite = persist(changes, before);
    if (session === previous) return recordWrite;
    writeLocation(session, mode);
    return Promise.all([recordWrite, write(() => sessions.save(session))]).then(() => undefined);
  }
  function updateSession(patch: Partial<Session>) {
    const session = { ...snapshot.session, ...patch };
    publish({ session });
    return write(() => sessions.save(session));
  }
  function navigate(session: Session, mode: "push" | "replace", base?: URL) {
    writeLocation(session, mode, base);
    return session === snapshot.session ? Promise.resolve() : updateSession(session);
  }
  function edit<T extends Change>(transition: (data: WorkspaceData) => T): T | string {
    if (!snapshot.data) return "Your workspace is still opening. Try again in a moment.";
    let change;
    try { change = transition(snapshot.data); } catch (cause) { return cause instanceof Error ? cause.message : "That change didn't go through."; }
    void commit(change);
    return change;
  }
  const refusal = (result: Change | string) => typeof result === "string" ? result : undefined;
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    isSaving: saving.isSaving,
    subscribeSaving: saving.subscribe,
    async admitRoutine(placed, now, manual = false) {
      const locate = () => snapshot.data && routinesOf(snapshot.data).find(({ routine, owner }) =>
        routine.id === placed.routine.id && owner.kind === placed.owner.kind && owner.id === placed.owner.id);
      const selected = locate();
      if (!selected) return null;
      const ready = readinessOf(snapshot.data!, selected, now);
      const due = manual ? ready.manualDue : ready.due;
      if (!due) return null;
      let claim: RoutineClaim | undefined;
      await write(async () => { claim = await store.claimRoutine(selected.routine.id, due.toISOString()); });
      if (!claim) throw new Error(snapshot.storageError || "Couldn't save the routine's receipt. Nothing ran.");
      const data = snapshot.data!;
      edits++;
      publish({ data: { ...data, routineRuns: mergeRoutineRuns(data.routineRuns, claim.receipts) } });
      if (!claim.claimed) return null;
      // A changed schedule or revoked permission while the claim was saving cannot start an obsolete run.
      const current = locate();
      if (!current || current.routine !== selected.routine) return null;
      const checked = readinessOf(snapshot.data!, current, now);
      if (!(manual ? checked.permitted : checked.enabled)) return null;
      return { ...current, runner: checked.runner, due };
    },
    /** StrictMode and repeat callers share the same load and migration. */
    load() {
      return boot ??= Promise.all([store.load(), sessions.load()]).then(async ([stored, saved = {}]) => {
        const { change, presentation } = migrated(stored, saved);
        const session = tabs.restore(presentation, change.data, history.read());
        await Promise.all([commit(change), updateSession(session)]);
        writeLocation(snapshot.session, "replace");
      }).catch((cause) => {
        publish({ loadError: cause instanceof Error ? cause.message : "Could not open local storage." });
      });
    },
    commit,
    edit,
    arrangePage(place, blocks, today) {
      if (place) return refusal(edit((data) => arrangePage(data, place, blocks, today)));
      void updateSession({ widgets: blocks.flatMap((block) => recordWidgets.find((type) => type === block.type) ?? []),
        todayViews: Object.fromEntries(blocks.flatMap((block) =>
          block.view && recordWidgets.includes(block.type as never) ? [[block.type, block.view]] : [])) });
    },
    resetPage(place, today) {
      if (place) return refusal(edit((data) => resetPage(data, place, today)));
      void updateSession({ widgets: initialSession.widgets });
    },
    purgeBlock: (place, id) => refusal(edit((data) => purgeBlock(data, place, id))),
    navigate(target) {
      if (!snapshot.data) return Promise.resolve();
      return target instanceof URL
        ? navigate(tabs.fromUrl(snapshot.session, snapshot.data, target), "replace", target)
        : navigate(tabs.open(snapshot.session, snapshot.data, target), "push");
    },
    selectDomain: (name) => navigate(tabs.selectDomain(snapshot.session, snapshot.data!, name), "push"),
    closeTab: (key) => navigate(tabs.close(snapshot.session, key), "replace"),
    reorderTabs: (keys) => navigate(tabs.reorder(snapshot.session, snapshot.data!, keys), "replace"),
    togglePin: (key) => navigate(tabs.togglePin(snapshot.session, key), "replace"),
    updateSession,
    /** Scroll is not rendered state. Keep it current without rerendering the page on every scroll event. */
    rememberScroll(key, top) {
      snapshot = { ...snapshot, session: { ...snapshot.session, scroll: { ...snapshot.session.scroll, [key]: top } } };
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        scrollTimer = undefined;
        void write(() => sessions.save(snapshot.session));
      }, 180);
    },
    absorb(records) {
      if (!snapshot.data) return;
      edits++;
      publish({ data: withRecords(snapshot.data, records) });
    },
    async refresh() {
      if (!snapshot.data || saving.isSaving() || snapshot.storageError) return;
      const before = edits;
      let stored;
      try { stored = await store.load(); } catch { return; } // offline: keep what's on screen; the next refresh tries again
      if (!stored || edits !== before || saving.isSaving() || snapshot.storageError) return;
      const { data } = normalize(stored);
      const previous = snapshot.session;
      const session = tabs.reconcile(previous, data);
      publish({ data, session });
      // A tab whose record went away elsewhere closes here too.
      if (session !== previous) {
        writeLocation(session, "replace");
        await write(() => sessions.save(session));
      }
    },
    async restore(backup, keepCopy) {
      if (!snapshot.data) return "Your workspace is still opening. Try again in a moment.";
      try { await keepCopy(snapshot.data, snapshot.session); } catch { return "Couldn't save a copy of your current workspace, so nothing was restored."; }
      try { await store.replace(backup.data); } catch { return "Couldn't restore the backup. Your current workspace is unchanged."; }
      // A pending scroll save would put the old Session back over the backup's.
      clearTimeout(scrollTimer);
      scrollTimer = undefined;
      // The view is device state: if it fails to save, the restored workspace opens in the default view.
      await sessions.save(backup.session ?? initialSession).catch(() => undefined);
    },
    hasUnsavedChanges: () => saving.isSaving() || !!snapshot.storageError || scrollTimer !== undefined,
    /** Retry current records, never stale edits. A newer failure must keep the unload guard and error visible. */
    retrySaving: saving.retry,
  };
}
