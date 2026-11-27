// What the engine offers as an agent's own model and thinking (agents-design D44), shared by the agent dialog, the
// chat's Details and message box (D82), Settings → AI model and Settings' spend by agent (D45).
import { useEffect, useSyncExternalStore } from "react";
import type { AgentEngine, ModelState } from "./atlas.ts";
import { vendorOf } from "./chatModel.ts";
import type { Vendor } from "./chatModel.ts";
import type { Agent } from "./model.ts";
import { effortLabels } from "./ownModel.ts";
import type { Effort } from "../supabase/functions/agent/responses.ts";

/** The parts of the engine an agent's model comes from. */
export type ModelSource = Pick<AgentEngine, "models">;

const noModels: ModelState = { status: "ready", provider: { using: "none", own: null }, menu: null };
const noSnapshot = () => noModels;
const noSubscription = () => () => {};

/** Subscription only: loading, invalidation and failure belong to the engine's one model state. */
export function useModelState(engine: ModelSource | undefined) {
  return useSyncExternalStore(engine?.models.subscribe ?? noSubscription, engine?.models.getSnapshot ?? noSnapshot);
}

/** The current menu's models and prices while `wanted`: asked of the engine once per model state, undefined until they arrive. */
export function useCatalogue(engine: ModelSource | undefined, state: ModelState, wanted: boolean) {
  useEffect(() => { if (wanted) engine?.models.loadCatalogue(); }, [engine, state, wanted]);
  return state.status === "ready" && state.catalogue?.status === "ready" ? state.catalogue : undefined;
}

/** The model an agent answers on with `menu` in use, and how hard it thinks when that's its own, for the chat's Details. */
export function modelLabel(agent: Agent, state: ModelState) {
  if (state.status === "loading") return "Loading…";
  if (state.status === "error") return "Unavailable";
  const { menu } = state;
  if (!menu) return "The default";
  const model = agent.model?.source === menu.source ? agent.model.id : `${menu.current} (${menu.label} default)`;
  return menu.efforts && agent.effort ? `${model} · ${effortLabels[agent.effort]}` : model;
}

/**
 * The model `agent` answers on with the menu in use, for the message box (D82): its id, vendor, whether it's the
 * provider's default, and its Thinking (undefined where the provider takes none). Pass the agent as it is in the chat
 * (`inChat`). Undefined while nothing offers a choice.
 */
export function answersOn(agent: Agent, state: ModelState):
  { id: string; vendor: Vendor; isDefault: boolean; effort?: Effort | null } | undefined {
  if (state.status !== "ready" || !state.menu) return undefined;
  const { menu } = state;
  const own = agent.model?.source === menu.source;
  const id = own ? agent.model!.id : menu.current;
  return { id, vendor: vendorOf(id), isDefault: !own, ...menu.efforts ? { effort: agent.effort ?? null } : {} };
}
