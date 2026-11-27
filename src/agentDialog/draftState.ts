// What the agent dialog counts about a draft, without drawing it: how many things an edit changed (Save's label), how
// far a new agent is set up (the badge's progress), and the routines it runs once saved (the Schedule tab and its
// badge). No React; draftState.test.ts covers it.
import { agentTools, canUse } from "../model.ts";
import type { Agent, Places, ToolId, WorkspaceData } from "../model.ts";
import * as routines from "../routines.ts";

const modelKey = (agent: Agent) => agent.model ? `${agent.model.source} ${agent.model.id}` : "";

/** How many things the draft changes against the saved agent: each field, routine, tool and place once. */
export function editCount(original: Agent, draft: Agent, places: Places, base: Places) {
  const fields = ([[original.name.trim(), draft.name.trim()], [original.portrait, draft.portrait], [original.role.trim(), draft.role.trim()],
    [original.instructions.trim(), draft.instructions.trim()], [original.writeMode, draft.writeMode], [original.warmth ?? -1, draft.warmth ?? -1],
    [original.detail ?? -1, draft.detail ?? -1], [modelKey(original), modelKey(draft)], [original.effort ?? "", draft.effort ?? ""]] as const)
    .filter(([a, b]) => a !== b).length;
  // Each routine added, removed, or changed counts once.
  const routineIds = new Set([...(original.routines ?? []), ...(draft.routines ?? [])].map((routine) => routine.id));
  const routineEdits = [...routineIds].filter((id) => JSON.stringify(original.routines?.find((routine) => routine.id === id))
    !== JSON.stringify(draft.routines?.find((routine) => routine.id === id))).length;
  const asking = Number((original.mayAsk ?? []).join() !== (draft.mayAsk ?? []).join());
  const tools = (Object.keys(agentTools) as ToolId[]).filter((id) => canUse(original, id) !== canUse(draft, id)).length;
  const placeEdits = (["domains", "projectIds", "teamIds"] as const).reduce((sum, key) => sum
    + places[key].filter((item) => !base[key].includes(item)).length + base[key].filter((item) => !places[key].includes(item)).length, 0);
  return fields + routineEdits + asking + tools + placeEdits;
}

/** A new agent's five things to settle, three answered by the defaults, and the next one open. */
export function setupSteps(name: string, taken: boolean, role: string, placed: boolean) {
  const steps = [["a face", true], ["a name", !!name && !taken], ["a role", !!role.trim()], ["somewhere to look", placed], ["a personality", true]] as const;
  return { total: steps.length, done: steps.filter(([, ok]) => ok).length, next: steps.find(([, ok]) => !ok)?.[0] };
}

/** The agent's own routines, the ones places keep that it runs as their nearest owner once saved, and how many are on. */
export function scheduleOf(saved: WorkspaceData, agentId: string, now: Date) {
  const own = saved.agents.find((agent) => agent.id === agentId)?.routines ?? [];
  const placed = routines.routinesOf(saved).filter(({ owner }) => routines.runnerOf(saved, owner).id === agentId);
  return { own, inherited: placed.filter(({ owner }) => owner.kind !== "agent"), on: placed.filter((item) => routines.readinessOf(saved, item, now).enabled).length };
}
