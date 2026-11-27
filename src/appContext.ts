// The app's services for every component, through one context whose value never changes: components subscribe to the
// part of the View or the UI store they draw, so a change redraws only who reads it (docs/adr/0002). appServices.ts
// creates them; this file only reads them, so it imports nothing but types.
import { createContext, use, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import type { Actions } from "./actions.ts";
import type { AgentEngine } from "./atlas.ts";
import type { Away } from "./away.ts";
import type { Conversations } from "./conversations.ts";
import type { JobWatch } from "./jobs.ts";
import type { Ui, UiState } from "./ui.ts";
import type { View, ViewStore } from "./view.ts";
import type { Workbench, WorkbenchSnapshot } from "./workbench.ts";
import type { WorkbenchShellHandle } from "./ui.ts";

export type App = {
  workbench: Workbench;
  conversations: Conversations;
  engine: AgentEngine;
  ui: Ui;
  view: ViewStore;
  actions: Actions;
  shell: RefObject<WorkbenchShellHandle | null>;
  signedIn: boolean;
  /** The account's away settings (agents-design D54); null signed out. */
  away: Away | null;
  /** What the agent function is doing for the account (agents-design D76); null signed out. */
  jobs: JobWatch | null;
};

export const AppContext = createContext<App | null>(null);

export function useApp() {
  const app = use(AppContext);
  if (!app) throw new Error("useApp needs AppContext.");
  return app;
}

/**
 * One part of the View. `select` must return a part as the View holds it (or a primitive), never a new object: the
 * component redraws only when that part changes. Use it once the Workspace has loaded.
 */
export function useView<T>(select: (view: View) => T): T {
  const { view } = useApp();
  return useSyncExternalStore(view.subscribe, () => select(view.get()!));
}

/** One part of the UI store; like `useView`, return a part as the store holds it or a primitive. */
export function useUi<T>(select: (state: UiState) => T): T {
  const { ui } = useApp();
  return useSyncExternalStore(ui.subscribe, () => select(ui.get()));
}

/** One part of the Workbench snapshot that the View doesn't carry: the load and storage errors. */
export function useWorkbench<T>(select: (snapshot: WorkbenchSnapshot) => T): T {
  const { workbench } = useApp();
  return useSyncExternalStore(workbench.subscribe, () => select(workbench.getSnapshot()));
}

/** Who is replying, failed or working on what, per thread (the Room's activity). */
export function useActivity() {
  const { conversations } = useApp();
  return useSyncExternalStore(conversations.subscribe, conversations.getSnapshot);
}