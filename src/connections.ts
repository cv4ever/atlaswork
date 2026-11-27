// The account's connections to outside accounts (agents-design D74), Google Calendar first: whether it's connected and
// as whom, connecting (Google's consent page, then back here with `?connected=`), disconnecting, and adding events you
// approved from a chat. Agents read the calendar on the server (supabase/functions/agent/calendar.ts); this side only
// shows the connection and sends what you tapped. Signed out, nothing is connected. Builds without
// `VITE_GOOGLE_CALENDAR=1` (set once the hosted function has its Google secrets) show no Connections at all.
import { account } from "./account.ts";
import type { DayEvent } from "./today/day.ts";

/** Whether this build offers Google Calendar: Settings → Connections and the chat's Add button. */
export const calendarOffered = import.meta.env.VITE_GOOGLE_CALENDAR === "1";
export type CalendarConnection = { account: string; since: string };
export type Connections = Readonly<
  | { status: "idle" | "loading" }
  | { status: "ready"; calendar: CalendarConnection | null }
  | { status: "error"; message: string }
>;

let state: Connections = { status: "idle" };
const listeners = new Set<() => void>();
const publish = (next: Connections) => {
  state = next;
  for (const listener of listeners) listener();
};

/** What `?connected=` says when Google sends you back, as the toast puts it. */
const outcomes: Record<string, string> = {
  google_calendar: "Google Calendar connected. Choose which agents can use it in Settings → Connections.",
  partial: "Google Calendar needs every box ticked on Google's page to read your calendars. Connect again and leave them ticked.",
  cancelled: "Google Calendar wasn't connected.",
  failed: "Google Calendar didn't connect. Try again in a moment.",
};

type Row = { provider: string; account: string; created_at: string };
const isCalendarRow = (item: unknown): item is Row => typeof item === "object" && item !== null && "provider" in item && item.provider === "google_calendar"
  && "account" in item && typeof item.account === "string" && "created_at" in item && typeof item.created_at === "string";
const isDayEvent = (item: unknown): item is DayEvent => typeof item === "object" && item !== null && "title" in item && typeof item.title === "string"
  && "from" in item && typeof item.from === "number" && "to" in item && typeof item.to === "number" && "allDay" in item && typeof item.allDay === "boolean"
  && "busy" in item && typeof item.busy === "boolean";
/** A calendar you show in Google Calendar: its id (what an agent's access names), its name, and whether it's your main one. */
export type ShownCalendar = { id: string; name: string; primary: boolean };
const isShown = (item: unknown): item is ShownCalendar => typeof item === "object" && item !== null && "id" in item && typeof item.id === "string"
  && "name" in item && typeof item.name === "string" && "primary" in item && typeof item.primary === "boolean";

export const connections = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  getSnapshot: () => state,
  /** Reads what the account has connected (`my_connections`); signed out, nothing. */
  async load() {
    if (!account || !calendarOffered) return publish({ status: "ready", calendar: null });
    publish({ status: "loading" });
    try {
      const rows = await account.rpc("my_connections", {});
      const row = Array.isArray(rows) ? rows.find(isCalendarRow) : undefined;
      publish({ status: "ready", calendar: row ? { account: row.account, since: row.created_at } : null });
    } catch (cause) {
      publish({ status: "error", message: cause instanceof Error ? cause.message : "Couldn't read your connections." });
    }
  },
  /** Opens Google's consent page; Google sends you back to this address with `?connected=`. */
  async connectCalendar() {
    if (!account) throw new Error("Sign in first, from Settings → Account.");
    const { url } = await account.connectors({ start: "google_calendar", back: location.origin });
    if (typeof url !== "string" || !url.startsWith("https://accounts.google.com/")) throw new Error("Google's page didn't open. Try again.");
    location.assign(url);
  },
  async disconnectCalendar() {
    if (!account) return;
    await account.connectors({ disconnect: "google_calendar" });
    publish({ status: "ready", calendar: null });
  },
  /**
   * Adds dated tasks to your main Google Calendar as all-day events, after you tapped Add; each task's id keeps it to
   * one event however often you tap. Returns how many went in and how many were already there.
   */
  async addEvents(events: { key: string; title: string; date: string }[]) {
    if (!account) throw new Error("Sign in first, from Settings → Account.");
    const { added, already } = await account.connectors({ add: events });
    return { added: typeof added === "number" ? added : 0, already: typeof already === "number" ? already : 0 };
  },
  /**
   * One day's events on your clock for Today's day line (agents-design D75), read fresh each time and kept only in
   * memory; signed out, without the calendar, or when Google doesn't answer, none.
   */
  async readDay(date: string, zone = Intl.DateTimeFormat().resolvedOptions().timeZone): Promise<DayEvent[]> {
    if (!account || !calendarOffered) return [];
    const { events } = await account.connectors({ day: { date, zone } }).catch(() => ({ events: [] }));
    return Array.isArray(events) ? events.filter(isDayEvent) : [];
  },
  /**
   * The calendars you show in Google Calendar (agents-design D83), main one first, so Settings → Connections can say
   * which ones each agent reads. Throws when Google doesn't answer; none when nothing is connected.
   */
  async listCalendars(): Promise<ShownCalendar[]> {
    if (!account || !calendarOffered) return [];
    const { calendars } = await account.connectors({ calendars: true });
    return Array.isArray(calendars) ? calendars.filter(isShown) : [];
  },
};

/**
 * What Google's return said, once: the toast to show, and the URL left without `?connected=`. Undefined when the app
 * didn't open from a connection.
 */
export function takeConnectedReturn(url: URL): { toast: string; url: string } | undefined {
  const outcome = url.searchParams.get("connected");
  if (outcome === null) return undefined;
  url.searchParams.delete("connected");
  return { toast: outcomes[outcome] ?? outcomes.failed, url: `${url.pathname}${url.search}${url.hash}` };
}
