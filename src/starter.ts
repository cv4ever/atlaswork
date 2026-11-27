// What a new person starts with (launch plan step 3): Everyday and Atlas, whose welcome (`welcomeOf`) says how to begin.
// The first-run flow (onboarding.ts) then offers the life areas and agents to add.
import { defaultDomain } from "./model.ts";
import type { WorkspaceData } from "./model.ts";
import { normalize } from "./workspace.ts";
import type { WorkspaceStore } from "./workspace.ts";

export function starterWorkspace(): WorkspaceData {
  // normalize adds Atlas with his default routines, the same way an older store gets him.
  return normalize({
    domains: [defaultDomain], projects: [], notes: [], tasks: [], topics: [], agents: [], teams: [], threads: [],
    routineRuns: {}, briefs: {}, memories: [], runs: [],
  }).data;
}

/** Fills a never-saved store with the starter workspace once; saved stores load as they are. */
export function withStarter(store: WorkspaceStore): WorkspaceStore {
  return {
    save: (changes, before) => store.save(changes, before),
    replace: (data) => store.replace(data),
    claimRoutine: (id, due) => store.claimRoutine(id, due),
    async load() {
      const data = await store.load();
      if (data) return data;
      const started = starterWorkspace();
      await store.save(started);
      return started;
    },
  };
}
