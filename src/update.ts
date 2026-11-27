// App updates: when this installed app looks for a new version, and when one that's waiting loads. The service worker
// (vite-plugin-pwa, `registerType: "prompt"`) installs a new version in the background; this module decides when to
// switch to it. An installed app on a phone is rarely closed, so it looks again whenever you come back to it and every
// 30 minutes while it's open, and a waiting version loads while the app is in the background, or at once when you tap
// Reload (the toast, or Settings → About). It never reloads under you while you're using it.
import { registerSW } from "virtual:pwa-register";

/** Where the update stands: no worker here (the dev server), looking, up to date, a version waiting, or couldn't look. */
export type UpdateStatus = "unavailable" | "checking" | "current" | "ready" | "failed";
export type UpdateState = { status: UpdateStatus; checkedAt: number };

/** This build: its commit and the day it was built (vite.config.ts). */
export const appVersion = import.meta.env.VITE_APP_VERSION ?? "dev";
export const appBuilt = import.meta.env.VITE_APP_BUILT ?? "";

const lookAgainAfter = 30 * 60_000;
let state: UpdateState = { status: "unavailable", checkedAt: 0 };
const listeners = new Set<() => void>();
const set = (next: Partial<UpdateState>) => { state = { ...state, ...next }; for (const listener of listeners) listener(); };
let registration: ServiceWorkerRegistration | undefined;
let apply: ((reload?: boolean) => Promise<void>) | undefined;
/** Whether a background reload would lose nothing (App sets it: no save still in flight). */
let safeToReload = () => true;
export const setReloadGuard = (guard: () => boolean) => { safeToReload = guard; };
const applyInBackground = () => { if (state.status === "ready" && safeToReload()) updates.apply(); };

export const updates = {
  get: () => state,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  /** Asks the server for a newer version now; a found one installs, then reads as ready. */
  async check() {
    if (!registration || state.status === "ready" || state.status === "checking") return;
    set({ status: "checking" });
    try {
      await registration.update();
      // A newer version found here installs in the background and turns this into `ready` (onNeedRefresh).
      if (updates.get().status === "checking") set({ status: "current", checkedAt: Date.now() });
    } catch {
      set({ status: navigator.onLine ? "failed" : "current", checkedAt: Date.now() });
    }
  },
  /** Loads the waiting version: the page reloads into it. */
  apply: () => { void apply?.(true); },
};

/** Registers the service worker and starts looking for updates; call once at startup. */
export function startUpdates() {
  apply = registerSW({
    onRegisteredSW(_url, found) {
      registration = found;
      if (!found) return;
      set({ status: "current" });
      void updates.check();
      setInterval(() => { if (document.visibilityState === "visible") void updates.check(); }, lookAgainAfter);
    },
    onNeedRefresh() {
      set({ status: "ready", checkedAt: Date.now() });
      if (document.visibilityState === "hidden") applyInBackground();
    },
    // The first install has nothing to replace: this version is the current one.
    onOfflineReady() { set({ status: "current", checkedAt: Date.now() }); },
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") applyInBackground();
    // Back in the app: look again unless it looked in the last five minutes.
    if (document.visibilityState === "visible" && Date.now() - state.checkedAt > 5 * 60_000) void updates.check();
  });
}

/** The version this device ran last time, kept to say "Updated" once after a new one loads. */
const seenKey = "atlaswork.version";
export function takeUpdated(): boolean {
  try {
    const seen = localStorage.getItem(seenKey);
    localStorage.setItem(seenKey, appVersion);
    return !!seen && seen !== appVersion && appVersion !== "dev";
  } catch { return false; }
}
