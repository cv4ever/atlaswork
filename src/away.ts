// Routines while the app is closed (agents-design D54): this account's away settings on the server (migration
// 20261116200000_routines_away.sql). The app says it was seen, and in which time zone, whenever it opens or comes back
// into view and every few minutes while it stays in view, so the server leaves routines to an open app and runs them
// on the right clock when none is. Your name and "about you" live in the account too, so every device and the server
// greet you the same way. This device's push notifications (D55) and the account's quiet hours go through here too.
import type { Backend } from "./cloud.ts";
import { disablePush, enablePush, pushState } from "./push.ts";
import type { PushState } from "./push.ts";

/** Quiet hours are minutes past midnight on your clock; none go out from `from` until `to` (21:00 to 08:00 unless changed). */
export type QuietHours = { from: number; to: number };
export type AwaySettings = { runAway: boolean; name: string; about: string; quiet: QuietHours };
export const defaultQuiet: QuietHours = { from: 21 * 60, to: 8 * 60 };

/** The device's time zone as the browser names it (an IANA name such as "Europe/Lisbon"). */
export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
/** How often an app in view says it's still here; the server waits 10 minutes past the last time before it runs routines. */
export const seenEveryMs = 4 * 60_000;

export type Away = {
  /** The account's settings, or null when it never had any. */
  load(): Promise<AwaySettings | null>;
  seen(): Promise<unknown>;
  setRunAway(on: boolean): Promise<unknown>;
  setPerson(name: string, about: string): Promise<unknown>;
  setQuietHours(quiet: QuietHours): Promise<unknown>;
  /** This device's notifications: whether they're on, and turning them on (asks the browser) or off. */
  pushState(): Promise<PushState>;
  setPush(on: boolean): Promise<PushState>;
};

export function createAway(backend: Pick<Backend, "rpc" | "read">): Away {
  return {
    async load() {
      const [row] = await backend.read("away_settings?select=run_away,person_name,person_about,quiet_from,quiet_to");
      return row ? { runAway: row.run_away === true, name: String(row.person_name ?? ""), about: String(row.person_about ?? ""),
        quiet: { from: Number(row.quiet_from ?? defaultQuiet.from), to: Number(row.quiet_to ?? defaultQuiet.to) } } : null;
    },
    seen: () => backend.rpc("seen_app", { p_time_zone: deviceZone() }),
    setRunAway: (on) => backend.rpc("set_away", { p_run_away: on }),
    setPerson: (name, about) => backend.rpc("set_away", { p_person_name: name, p_person_about: about }),
    setQuietHours: ({ from, to }) => backend.rpc("set_quiet_hours", { p_from: from, p_to: to }),
    pushState,
    setPush: (on) => on ? enablePush(backend) : disablePush(backend),
  };
}

/**
 * Who you are, once the account's answer is in: the account's name and about when it holds any (another device or an
 * earlier session set them); otherwise this device's, which then go up to the account. `push` says which way.
 */
export function reconcilePerson(stored: AwaySettings | null, device: { name: string; about: string }) {
  if (stored && (stored.name || stored.about)) return { name: stored.name, about: stored.about, push: false };
  return { ...device, push: !!(device.name || device.about) };
}
