// The crew style (agents-design D16): which pack draws every portrait, Atlas's too. The saved choice is this device's
// Session (`crewStyle`); Settings → Appearance tries another on while the pointer or focus rests on its card.
import { use, useSyncExternalStore } from "react";
import { AppContext } from "./appContext.ts";
import { portraitSrc } from "./look.ts";
import type { CrewStyle } from "./look.ts";
import type { Agent } from "./model.ts";

let trying: CrewStyle | null = null;
const listeners = new Set<() => void>();
const unsubscribed = () => () => {};

/** The style tried on in Settings, drawn instead of the saved one until it ends (`null`). */
export const crewStylePreview = {
  set(style: CrewStyle | null) {
    if (style === trying) return;
    trying = style;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get: () => trying,
};

/**
 * Draws a portrait in the crew's style, or the one being tried on. Each component that shows faces asks for it, so a new
 * style redraws them all at once. Outside the app (the gate, dev pages) faces stay in Storybook.
 */
export function usePortraitSrc() {
  const app = use(AppContext);
  const saved = useSyncExternalStore(app?.view.subscribe ?? unsubscribed, () => app?.view.get()?.session.crewStyle ?? "storybook");
  const preview = useSyncExternalStore(crewStylePreview.subscribe, crewStylePreview.get);
  const style = preview ?? saved;
  return (agent: Pick<Agent, "portrait">) => portraitSrc(agent, style);
}
