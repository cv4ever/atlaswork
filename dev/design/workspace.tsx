// The app's services over a workspace held in memory, so the showcase never reads or changes this browser's own.
import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { AppContext } from "../../src/appContext.ts";
import { createAppServices } from "../../src/appServices.ts";
import { createAgentEngine, offlineEngine } from "../../src/atlas.ts";
import { withDemoSeed } from "../../src/demo.ts";
import { withStarter } from "../../src/starter.ts";
import type { WorkspaceStore } from "../../src/workspace.ts";
import { withLargeSeed } from "../large/index.ts";

/** What the workspace starts from: the demo, what a new person gets, or the demo plus a year of records. */
export type Seed = "demo" | "new" | "large";
const seeds = { demo: withDemoSeed, new: withStarter, large: withLargeSeed };

/** Never saved: every visit starts from the seed, and routines never claim a run, so no agent is asked anything. */
const memory: WorkspaceStore = {
  load: async () => null, save: async () => {}, replace: async () => {}, claimRoutine: async () => ({ claimed: false, receipts: {} }),
};

/** The services over their own workspace, opened at `place` (a query such as `tab=project:demo-cooking`; empty is Today). */
export function useDemoApp(place = "", seed: Seed = "demo") {
  const [app] = useState(() => {
    let url = new URL(`${location.origin}/?${place}`);
    const pinned = new URLSearchParams(location.search).get("today");
    if (pinned) url.searchParams.set("today", pinned);
    return createAppServices({
      store: seeds[seed](memory), engine: createAgentEngine(offlineEngine),
      sessions: { load: async () => undefined, save: async () => {} },
      history: { read: () => new URL(url), write: (next) => { url = new URL(next); } },
    });
  });
  const loaded = useSyncExternalStore(app.view.subscribe, () => app.view.get() !== null);
  useEffect(() => { void app.workbench.load(); }, [app]);
  return loaded ? app : null;
}

/** Children drawn over a workspace of their own, once it has opened. */
export function Workspace({ seed, place, children }: { seed: Seed; place?: string; children: ReactNode }) {
  const app = useDemoApp(place, seed);
  return app ? <AppContext value={app}>{children}</AppContext> : <p className="empty-inline">Opening that workspace…</p>;
}
