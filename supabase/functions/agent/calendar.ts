// Google Calendar as the agent reads it (agents-design D74): `read_calendar` and `free_time`, run for the account
// that asked, on its own clock. The connection and its tokens live in ../connectors; this turns events into the lines
// the model reads, and works out free time. Calendar text is the outside world's words: it reaches the model fenced
// as quoted content, never as instructions.
import { accessToken, eventsBetween, unseal } from "../connectors/google.ts";
import type { Client, Event } from "../connectors/google.ts";
import { instantOf, wallOf } from "../routines/run.ts";
import type { Snapshot } from "./contract.ts";
import type { Outside } from "./run.ts";
import { outsideTools } from "./tools.ts";
import { isRecord } from "./validate.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const day = /^\d{4}-\d{2}-\d{2}$/;
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const pad = (value: number) => String(value).padStart(2, "0");

/** The person's wall-clock day `date` at `time` (HH:MM) as an instant. */
const at = (zone: string, date: string, time = "00:00") => instantOf(zone, Date.parse(`${date}T${time}:00Z`));
/** An instant as HH:MM on the person's clock. */
const hhmm = (zone: string, instant: number) => { const wall = new Date(wallOf(zone, instant)); return `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`; };
const addDays = (date: string, days: number) => { const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + days); return next.toISOString().slice(0, 10); };
/** A day as people and the chat say it, with the date the tools take: "Tue 24 Nov (2026-11-24)" (D81). */
const dayName = (date: string) => `${new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} (${date})`;

/** Events as the model reads them, one line each, grouped under their day, between fences that say whose words they are. */
export function eventLines(events: Event[], zone: string) {
  if (!events.length) return "No events.";
  const lines: string[] = [];
  let last = "";
  for (const event of events) {
    const date = event.allDay ? event.start : new Date(wallOf(zone, Date.parse(event.start))).toISOString().slice(0, 10);
    if (date !== last) lines.push(dayName(date));
    last = date;
    const when = event.allDay ? "all day" : `${hhmm(zone, Date.parse(event.start))}–${hhmm(zone, Date.parse(event.end))}`;
    lines.push(`- ${when} ${event.title.replace(/\s+/g, " ")}${event.calendar ? ` (${event.calendar})` : ""}`);
  }
  return `<<<calendar\n${lines.join("\n")}\n>>>calendar`;
}

/** Open stretches of at least `minutes` between `from` and `to` (instants), around the busy timed events. */
export function freeSlots(events: Event[], from: number, to: number, minutes: number) {
  const busy = events.filter((event) => !event.allDay && event.busy).map((event) => [Date.parse(event.start), Date.parse(event.end)] as const)
    .filter(([start, end]) => end > from && start < to).sort((a, b) => a[0] - b[0]);
  const slots: [number, number][] = [];
  let cursor = from;
  for (const [start, end] of busy) {
    if (start - cursor >= minutes * 6e4) slots.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (to - cursor >= minutes * 6e4) slots.push([cursor, to]);
  return slots;
}

/** A day's events as Today's day line draws them (agents-design D75). Read for the page and never kept. */
export type DayEvent = { title: string; from: number; to: number; allDay: boolean; busy: boolean };

/** The person's day `date` on their clock, as the instants it starts and ends. */
export const dayBounds = (zone: string, date: string): [number, number] => [at(zone, date), at(zone, addDays(date, 1))];

/**
 * Events on `date` in minutes past midnight on the person's clock, cut to that day; an all-day event covers it whole
 * and never counts as busy, as `freeSlots` treats it. Titles keep the calendar's words, at most 120 characters.
 */
export function dayEvents(events: Event[], zone: string, date: string): DayEvent[] {
  const [start, end] = dayBounds(zone, date);
  const minute = (instant: number) => Math.round((Math.min(Math.max(instant, start), end) - start) / 6e4);
  return events.flatMap((event): DayEvent[] => {
    const title = event.title.replace(/\s+/g, " ").trim().slice(0, 120);
    if (event.allDay) return event.start <= date && event.end > date ? [{ title, from: 0, to: 24 * 60, allDay: true, busy: false }] : [];
    const from = Date.parse(event.start), to = Date.parse(event.end);
    return to > start && from < end ? [{ title, from: minute(from), to: minute(to), allDay: false, busy: event.busy }] : [];
  });
}

/**
 * The account's calendar tools, or null when it has no calendar connected (then the agent isn't offered them).
 * `zone` is the person's clock; `today` their date; `calendars` the ones this agent reads (D83), absent every one shown.
 * A revoked grant reads as a request to connect again.
 */
export async function calendarFor(rpc: Rpc, user: string, secret: string, client: Pick<Client, "id" | "secret">,
  { zone, today, calendars }: { zone: string; today: string; calendars?: readonly string[] }, fetcher: typeof fetch = fetch): Promise<Outside | null> {
  const rows = await rpc("connection_of", { p_user: user, p_provider: "google_calendar" });
  const row = Array.isArray(rows) && isRecord(rows[0]) && typeof rows[0].token === "string" ? rows[0].token : undefined;
  if (!row || !secret || !client.id) return null;
  let token: string | undefined;
  const access = async () => {
    if (token) return token;
    const got = await accessToken(client, await unseal(secret, row), fetcher);
    if (typeof got !== "string") throw new Error("revoked");
    return token = got;
  };
  return async (call) => {
    const tool = call.function.name;
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(call.function.arguments || "{}"); } catch { return { text: "Arguments were not valid JSON." }; }
    if (!isRecord(args)) return { text: "Arguments must be an object." };
    // What the reply's sources name (D81): the days read, as an ISO interval, or the one day searched for free time.
    let about = "";
    try {
      if (tool === "read_calendar") {
        const first = typeof args.from === "string" && day.test(args.from) ? args.from : today;
        const asked = typeof args.to === "string" && day.test(args.to) && args.to >= first ? args.to : addDays(first, 6);
        const last = asked > addDays(first, 13) ? addDays(first, 13) : asked;
        about = first === last ? first : `${first}/${last}`;
        const events = await eventsBetween(await access(), new Date(at(zone, first)), new Date(at(zone, addDays(last, 1))), zone, fetcher, calendars);
        return { text: `${first} to ${last}${last !== asked ? " (14 days at most)" : ""}:\n${eventLines(events, zone)}`, used: { tool, about } };
      }
      const date = typeof args.date === "string" && day.test(args.date) ? args.date : "";
      if (!date) return { text: "Give date as YYYY-MM-DD." };
      about = date;
      const from = typeof args.from === "string" && clock.test(args.from) ? args.from : "08:00";
      const to = typeof args.to === "string" && clock.test(args.to) && args.to > from ? args.to : "20:00";
      const minutes = typeof args.minutes === "number" && args.minutes >= 5 && args.minutes <= 600 ? Math.round(args.minutes) : 30;
      const start = at(zone, date, from), end = at(zone, date, to);
      const events = await eventsBetween(await access(), new Date(start), new Date(end), zone, fetcher, calendars);
      const slots = freeSlots(events, Math.max(start, date === today ? Date.now() : start), end, minutes);
      return { text: slots.length ? `Free on ${dayName(date)} (${minutes} min or more):\n${slots.map(([a, b]) => `- ${hhmm(zone, a)}–${hhmm(zone, b)}`).join("\n")}`
        : `No free stretch of ${minutes} minutes between ${from} and ${to} on ${date}.`, used: { tool, about } };
    } catch (cause) {
      const revoked = cause instanceof Error && cause.message === "revoked";
      return { text: revoked ? "Google Calendar is no longer connected. Tell the person to connect it again in Settings → Connections."
        : "Google Calendar didn't answer. Say you couldn't read it this time.", used: { tool, about, failed: revoked ? "disconnected" : "unanswered" } };
    }
  };
}

/**
 * The snapshot as the loop runs it: the browser asks for calendar tools whenever the agent may use the calendar, and
 * they stay only when `connect` finds the account's calendar (a failure counts as none).
 */
export async function withCalendar(snapshot: Snapshot, connect: () => Promise<Outside | null>): Promise<{ asked: Snapshot; outside?: Outside }> {
  if (!snapshot.tools.some((tool) => outsideTools.has(tool))) return { asked: snapshot };
  const outside = await connect().catch(() => null);
  return outside ? { asked: snapshot, outside } : { asked: { ...snapshot, tools: snapshot.tools.filter((tool) => !outsideTools.has(tool)) } };
}
