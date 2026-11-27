// The task dialog's reading of a title (page-design.md, "Task dialog"): "Call the clinic tomorrow at 16:30 for 15 min"
// names the day, the time and the length, and saves as "Call the clinic". Only phrases that can't be part of a task's
// name count: a bare "Morning run" or "Friday drinks" keeps its words, "this morning" or "on Friday" doesn't.
import { addDays } from "../dates.ts";
import { taskLengths } from "../today/day.ts";

export type TaskWords = { due?: string; at?: string; length?: number; title: string; found: string[] };

const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const short = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const end = "(?![\\w'’])";
const clock = (hour: number, minute: number) => hour < 24 && minute < 60 ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` : undefined;
/** The nearest length the dialog offers. */
const snap = (minutes: number) => taskLengths.reduce((best, item) => Math.abs(item - minutes) < Math.abs(best - minutes) ? item : best);

/** The next `weekday` (0 Sunday) after `today`, a week on when it is today's. */
function nextWeekday(today: string, weekday: number) {
  const current = new Date(`${today}T12:00:00`).getDay();
  return addDays(today, (weekday - current + 7) % 7 || 7);
}

type Rule = { pattern: RegExp; read: (match: RegExpMatchArray, today: string) => Partial<Omit<TaskWords, "title" | "found">> | undefined };

const rules: Rule[] = [
  { pattern: new RegExp(`\\btonight${end}`, "i"), read: (_, today) => ({ due: today, at: "evening" }) },
  { pattern: new RegExp(`\\b(?:this|in the) (morning|afternoon|evening)${end}`, "i"), read: (match) => ({ at: match[1].toLowerCase() }) },
  { pattern: new RegExp(`\\b(today|tomorrow|tmrw)${end}`, "i"), read: (match, today) => ({ due: /^today$/i.test(match[1]) ? today : addDays(today, 1) }) },
  { pattern: new RegExp(`\\bnext week${end}`, "i"), read: (_, today) => ({ due: nextWeekday(today, 1) }) },
  { pattern: new RegExp(`\\bin (\\d{1,2}) days?${end}`, "i"), read: (match, today) => ({ due: addDays(today, Number(match[1])) }) },
  // A weekday after "on", "next" or "this", or a full one ending the title; "Friday drinks" stays a name.
  { pattern: new RegExp(`\\b(?:on|next|this) (${weekdays.join("|")}|${short.join("|")})${end}|\\b(${weekdays.join("|")})$`, "i"),
    read: (match, today) => {
      const word = (match[1] ?? match[2]).toLowerCase();
      return { due: nextWeekday(today, Math.max(weekdays.indexOf(word), short.indexOf(word))) };
    } },
  { pattern: /\b(?:at )?(\d{1,2})(?::(\d{2}))? ?(am|pm)(?![\w'’])/i, read: (match) => {
    const hour = Number(match[1]) % 12 + (match[3].toLowerCase() === "pm" ? 12 : 0);
    const at = Number(match[1]) <= 12 ? clock(hour, Number(match[2] ?? 0)) : undefined;
    return at ? { at } : undefined;
  } },
  { pattern: /\b(?:at )?([01]?\d|2[0-3])[:.h]([0-5]\d)(?![\w'’])/i, read: (match) => ({ at: clock(Number(match[1]), Number(match[2])) }) },
  // "at 9" alone: the hours before 7 are the afternoon's ("at 4" is 16:00).
  { pattern: /\bat (\d{1,2})(?![\w'’:.])/i, read: (match) => {
    const hour = Number(match[1]);
    return hour <= 23 ? { at: clock(hour < 7 ? hour + 12 : hour, 0) } : undefined;
  } },
  { pattern: /\bfor (?:half an? hour|30 ?m(?:in(?:ute)?s?)?)(?![\w'’])/i, read: () => ({ length: 30 }) },
  { pattern: /\bfor (\d{1,3}) ?m(?:in(?:ute)?s?)?(?![\w'’])/i, read: (match) => ({ length: snap(Number(match[1])) }) },
  { pattern: /\bfor (an|one|a|\d(?:\.\d)?|1½) ?(?:hours?|hrs?|h)(?![\w'’])/i, read: (match) => {
    const hours = /^(an|one|a)$/i.test(match[1]) ? 1 : match[1] === "1½" ? 1.5 : Number(match[1]);
    return { length: snap(hours * 60) };
  } },
];

/** What a task's title names about its day, time and length, and the title without those words. */
export function readTaskWords(title: string, today: string): TaskWords {
  const words: TaskWords = { title, found: [] };
  let rest = title;
  for (const rule of rules) {
    const match = rest.match(rule.pattern);
    if (!match) continue;
    const read = rule.read(match, today);
    if (!read) continue;
    // The first phrase naming a field wins; a later one naming it again stays in the title.
    const fresh = Object.entries(read).filter(([key, value]) => value !== undefined && words[key as keyof typeof read] === undefined);
    if (!fresh.length) continue;
    Object.assign(words, Object.fromEntries(fresh));
    words.found.push(match[0].trim());
    rest = `${rest.slice(0, match.index)} ${rest.slice(match.index! + match[0].length)}`;
  }
  if (!words.found.length) return words;
  // Said back in the order they stand in the title.
  words.found.sort((a, b) => title.indexOf(a) - title.indexOf(b));
  words.title = rest.replace(/\s{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").replace(/[\s,;:-]+$|^[\s,;:-]+/g, "").replace(/\s+(?:on|at|by)$/i, "").trim();
  return words;
}
