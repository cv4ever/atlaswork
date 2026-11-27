// A task's due day in words, as every task list and Today say it: "Today", "3 days late", "Thursday", "Sat 14 Nov".
import { daysBetween, formatDate } from "../dates.ts";

export const daysUntil = (day: string, today: string) => daysBetween(today, day);

/** A due day in words: "Today", "Tomorrow", "3 days late", "Thursday" within the week, else "Sat 14 Nov". */
export function dueDay(due: string, today: string) {
  const days = daysUntil(due, today);
  const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday"
    : days < 0 ? `${-days} days late` : days < 7 ? formatDate(new Date(`${due}T12:00:00`), { weekday: "long" })
    : formatDate(new Date(`${due}T12:00:00`), { weekday: "short", day: "numeric", month: "short" });
  return { when, late: days < 0, soon: days >= 0 && days < 2 };
}

/** dueDay's words mid-sentence ("next Friday", "next tomorrow"): relative words lose their capital, day names and dates keep it. */
export function dueWords(due: string, today: string) {
  const { when } = dueDay(due, today);
  return daysUntil(due, today) < 2 ? when.toLowerCase() : when;
}

/** Soonest due first, undated last; for sorting open tasks. */
export const byDue = (a: { due: string }, b: { due: string }) => { const x = a.due || "9", y = b.due || "9"; return x < y ? -1 : x > y ? 1 : 0; };
/** Whole days from `today` to `day`, both at noon (clear of time-zone edges). */
export const daysTo = (day: string, today: string) => Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 864e5);
