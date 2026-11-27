import assert from "node:assert/strict";
import { seal } from "../connectors/google.ts";
import type { Event } from "../connectors/google.ts";
import { calendarFor, dayEvents, eventLines, freeSlots, withCalendar } from "./calendar.ts";
import type { Snapshot, ToolCall } from "./logic.ts";

const zone = "Europe/Lisbon";
const event = (title: string, start: string, end: string, more: Partial<Event> = {}): Event => ({ title, start, end, allDay: false, calendar: "Family", busy: true, ...more });
const call = (name: string, args: unknown): ToolCall => ({ id: "1", type: "function", function: { name, arguments: JSON.stringify(args) } });

Deno.test("events read as fenced lines on the person's clock, grouped by day", () => {
  const lines = eventLines([event("Dentist", "2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z"),
    event("Mãe's birthday", "2026-11-25", "2026-11-26", { allDay: true, calendar: "" })], "America/New_York");
  assert.equal(lines, "<<<calendar\nTue 24 Nov (2026-11-24)\n- 04:00–05:00 Dentist (Family)\nWed 25 Nov (2026-11-25)\n- all day Mãe's birthday\n>>>calendar");
  assert.equal(eventLines([], zone), "No events.");
});

Deno.test("free time is what busy timed events leave, at least the asked length; free and all-day events don't block it", () => {
  const day = (time: string) => Date.parse(`2026-11-24T${time}:00Z`);
  const slots = freeSlots([event("Standup", "2026-11-24T09:00:00Z", "2026-11-24T09:15:00Z"), event("Lunch", "2026-11-24T12:00:00Z", "2026-11-24T13:00:00Z"),
    event("Holiday", "2026-11-24", "2026-11-25", { allDay: true }), event("Maybe", "2026-11-24T15:00:00Z", "2026-11-24T16:00:00Z", { busy: false })],
  day("08:00"), day("18:00"), 30);
  assert.deepEqual(slots, [[day("08:00"), day("09:00")], [day("09:15"), day("12:00")], [day("13:00"), day("18:00")]]);
  assert.deepEqual(freeSlots([event("All day meeting", "2026-11-24T07:00:00Z", "2026-11-24T19:00:00Z")], day("08:00"), day("18:00"), 30), []);
});

Deno.test("a day's events for Today read in minutes on the person's clock, cut to that day; all-day ones never block", () => {
  const read = dayEvents([event("Late call", "2026-11-23T23:30:00Z", "2026-11-24T00:30:00Z"), event("Dentist", "2026-11-24T09:00:00Z", "2026-11-24T10:00:00Z"),
    event("Mãe's  birthday", "2026-11-24", "2026-11-25", { allDay: true }), event("Maybe", "2026-11-24T15:00:00Z", "2026-11-24T15:30:00Z", { busy: false }),
    event("Tomorrow", "2026-11-25T09:00:00Z", "2026-11-25T10:00:00Z")], zone, "2026-11-24");
  assert.deepEqual(read, [
    { title: "Late call", from: 0, to: 30, allDay: false, busy: true },
    { title: "Dentist", from: 540, to: 600, allDay: false, busy: true },
    { title: "Mãe's birthday", from: 0, to: 1440, allDay: true, busy: false },
    { title: "Maybe", from: 900, to: 930, allDay: false, busy: false },
  ]);
});

Deno.test("an account without a calendar gets no calendar tools; one with it reads through Google on its own clock", async () => {
  const snapshot = { tools: ["read_notes", "read_calendar", "free_time"] } as Snapshot;
  assert.deepEqual((await withCalendar(snapshot, () => Promise.resolve(null))).asked.tools, ["read_notes"]);
  assert.deepEqual((await withCalendar(snapshot, () => Promise.reject(new Error("down")))).asked.tools, ["read_notes"], "a failure counts as none");
  const none = await calendarFor(() => Promise.resolve([]), "u1", "key", { id: "c", secret: "s" }, { zone, today: "2026-11-24" });
  assert.equal(none, null);

  const token = await seal("key", "1//refresh");
  const asked: string[] = [];
  const fetcher = (url: string | URL | Request) => {
    const href = String(url);
    asked.push(href);
    if (href.startsWith("https://oauth2.googleapis.com/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "at" })));
    if (href.includes("/calendarList")) return Promise.resolve(new Response(JSON.stringify({ items: [{ id: "primary", summary: "Me" }, { id: "hidden", hidden: true }] })));
    return Promise.resolve(new Response(JSON.stringify({ items: [{ summary: "Dentist", start: { dateTime: "2026-11-24T09:00:00Z" }, end: { dateTime: "2026-11-24T10:00:00Z" } },
      { summary: "Called off", status: "cancelled", start: { dateTime: "2026-11-24T11:00:00Z" }, end: { dateTime: "2026-11-24T12:00:00Z" } }] })));
  };
  const outside = await calendarFor(() => Promise.resolve([{ account: "me@example.com", token }]), "u1", "key", { id: "c", secret: "s" }, { zone, today: "2026-11-24" }, fetcher);
  assert.ok(outside);
  const read = await outside(call("read_calendar", { from: "2026-11-24", to: "2027-01-30" }));
  assert.match(read.text, /^2026-11-24 to 2026-12-07 \(14 days at most\)/);
  assert.match(read.text, /- 09:00–10:00 Dentist \(Me\)/);
  assert.deepEqual(read.used, { tool: "read_calendar", about: "2026-11-24/2026-12-07" }, "the chat names the days actually read");
  assert.ok(!read.text.includes("Called off"), "cancelled events are left out");
  assert.ok(!asked.some((href) => href.includes("/calendars/hidden/")), "hidden calendars aren't read");
  const free = await outside(call("free_time", { date: "2026-11-25", from: "08:00", to: "12:00", minutes: 60 }));
  assert.match(free.text, /^Free on Wed 25 Nov \(2026-11-25\)/);
  assert.deepEqual(await outside(call("free_time", {})), { text: "Give date as YYYY-MM-DD." }, "a call that never reached Google names no source");
  assert.equal(asked.filter((href) => href.startsWith("https://oauth2")).length, 1, "one access token per reply");
});

Deno.test("a grant Google revoked asks the person to connect again", async () => {
  const token = await seal("key", "1//refresh");
  const revoked = () => Promise.resolve(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
  const outside = await calendarFor(() => Promise.resolve([{ token }]), "u1", "key", { id: "c", secret: "s" }, { zone, today: "2026-11-24" }, revoked);
  const said = await outside!(call("read_calendar", {}));
  assert.match(said.text, /connect it again in Settings → Connections/);
  assert.deepEqual(said.used, { tool: "read_calendar", about: "2026-11-24/2026-11-30", failed: "disconnected" }, "a revoked grant offers Reconnect");
});

Deno.test("an agent given some calendars reads only those, for events and free time alike (D83)", async () => {
  const token = await seal("key", "1//refresh");
  const asked: string[] = [];
  const fetcher = (url: string | URL | Request) => {
    const href = String(url);
    asked.push(href);
    if (href.startsWith("https://oauth2.googleapis.com/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "at" })));
    if (href.includes("/calendarList")) return Promise.resolve(new Response(JSON.stringify({ items: [{ id: "me@example.com", summary: "Me", primary: true }, { id: "work", summary: "Work" }] })));
    const work = href.includes("/calendars/work/");
    return Promise.resolve(new Response(JSON.stringify({ items: [{ summary: work ? "Standup" : "Dentist",
      start: { dateTime: `2026-11-24T${work ? "09" : "10"}:00:00Z` }, end: { dateTime: `2026-11-24T${work ? "10" : "11"}:00:00Z` } }] })));
  };
  // `today` is the day before: free time on `today` starts at the clock, so this failed on 2026-11-24 after 10:00 UTC.
  const outside = await calendarFor(() => Promise.resolve([{ token }]), "u1", "key", { id: "c", secret: "s" }, { zone, today: "2026-11-23", calendars: ["work"] }, fetcher);
  const read = await outside!(call("read_calendar", { from: "2026-11-24", to: "2026-11-24" }));
  assert.match(read.text, /Standup \(Work\)/);
  assert.ok(!read.text.includes("Dentist"), "the other calendar's events never reach the model");
  const free = await outside!(call("free_time", { date: "2026-11-24", from: "08:00", to: "12:00", minutes: 60 }));
  assert.match(free.text, /10:00–12:00/, "the unread calendar's 10:00 dentist doesn't block");
  assert.ok(!asked.some((href) => href.includes("/calendars/me%40example.com/")), "the calendar it may not read isn't fetched");
});
