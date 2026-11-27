// Dates, times and numbers as the app writes them: always English (`locale`, whatever the browser's language), with
// cached formatters, plus day arithmetic, the pinned day for checks (`?today=`) and the labels the chat and lists use.


/**
 * The one locale for dates, times and numbers. The app is written in English, so they are too, whatever the browser's
 * language: a Portuguese browser wrote "ter., 10/11" inside English sentences. British English gives the design's
 * "Tue 10 Nov" and a 24-hour clock. eslint.config.js refuses the browser default (`undefined`, `[]` or no argument).
 */
export const locale = "en-GB";

const dateFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Formats a date or time in `locale`. `toLocaleDateString(locale, options)` builds a new formatter on every call
 * (about 0.2 ms, 90 times a cached one), which made renders with many dated rows slow; these keep one per options.
 */
export function formatDate(date: Date | number, options: Intl.DateTimeFormatOptions) {
  const key = JSON.stringify(options);
  let format = dateFormats.get(key);
  if (!format) dateFormats.set(key, format = new Intl.DateTimeFormat(locale, options));
  return format.format(date);
}

/** Formats a number in `locale`, with one cached formatter per options (see `formatDate`). */
export function formatNumber(value: number, options: Intl.NumberFormatOptions) {
  const key = JSON.stringify(options);
  let format = numberFormats.get(key);
  if (!format) numberFormats.set(key, format = new Intl.NumberFormat(locale, options));
  return format.format(value);
}

/** The calendar day `days` after `day` (both YYYY-MM-DD; negative goes back). Plain date arithmetic, no `Intl`: loops over weeks of days call it. */
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** A time of day as HH:MM on the 24-hour clock ("16:30"), as a task's `at` and an agent's proposed time hold it. */
export const isClock = (at: unknown): at is string => typeof at === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(at);

/** Whole days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 864e5);

/**
 * `?today=YYYY-MM-DD` pins the day for checks: Today and every date drawn from it, the demo seed's dates and the day
 * routines run for. "" when unpinned, and outside a browser (tests).
 */
export const pinnedDay = (() => {
  const day = typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("today") ?? "";
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "";
})();

export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function daypartAt(hour: number) {
  return hour >= 5 && hour < 11 ? "morning" : hour >= 11 && hour < 17 ? "day" : hour >= 17 && hour < 21 ? "evening" : "night";
}

/** Calendar days from `at` to `now`, between local midnights; rounding absorbs daylight-saving hours. */
function daysAgo(at: string, now: number) {
  const then = new Date(at), today = new Date(now);
  return Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
    - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / 86_400_000);
}

// One formatter for every label: `toLocaleDateString` builds a new one per call, which long transcripts feel.
const shortDay = new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" });

/** A day heading for a sitting: Today, Yesterday, or the date. Messages from before timestamps sit under "Earlier". */
export function dayLabel(at: string | undefined, now: number) {
  if (!at) return "Earlier";
  const days = daysAgo(at, now);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : shortDay.format(new Date(at));
}

/** Where a sitting sits in the history: Today, Yesterday, Previous 7 days, Previous 30 days, then by month. */
export function ageBucket(at: string | undefined, now: number) {
  if (!at) return "Earlier";
  const days = daysAgo(at, now);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 days";
  if (days <= 30) return "Previous 30 days";
  return formatDate(new Date(at), { month: "long", year: "numeric" });
}
