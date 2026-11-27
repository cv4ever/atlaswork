// Commands that hand over a link and never send anything: a mail draft, a calendar file (which a connected Google
// Calendar takes in one tap you make, agents-design D74), a web search.
import { limits } from "../../supabase/functions/agent/logic.ts";
import type { Task } from "../model.ts";
import { texts } from "./define.ts";
import type { CommandDef } from "./define.ts";
import { openTasks } from "./request.ts";

/** An iCalendar file with one all-day event per dated task. */
export function icsOf(tasks: Task[], now = new Date()) {
  const text = (value: string) => value.replace(/[\\;,]/g, (char) => `\\${char}`).replace(/\r?\n/g, "\\n");
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlaswork//Agents//EN",
    ...tasks.flatMap((task) => ["BEGIN:VEVENT", `UID:${task.id}@atlaswork`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${task.due.replaceAll("-", "")}`, `SUMMARY:${text(task.title)}`, "END:VEVENT"]),
    "END:VCALENDAR", ""].join("\r\n");
}

export const draft_email: CommandDef = {
  needs: ["email"],
  spec: () => ({
    description: "Draft an email; the person gets a link that opens it in their own mail app.",
    progress: "Drafting the email",
    prompt: "When the person asks for an email, call draft_email with the whole message; use an attached note's text when they point at it. Say the draft opens in their mail app and nothing is sent until they press Send.",
    args: {
      to: { description: "The recipient's email address, only when the person gave one.", optional: true },
      subject: { description: "Subject line." },
      body: { description: "The whole email, plain text.", max: 3000 },
    },
  }),
  links: (_request, args) => {
    const to = typeof args.to === "string" && /^[^\s,<>@]+@[^\s,<>@]+\.[a-z]{2,}$/i.test(args.to.trim()) ? args.to.trim() : "";
    if (typeof args.subject !== "string" || typeof args.body !== "string") return undefined;
    return { links: [{ label: "Open the draft", href: `mailto:${to}?subject=${encodeURIComponent(args.subject)}&body=${encodeURIComponent(args.body)}` }] };
  },
};
// Offered to agents at Google Calendar's Events + Add (agents-design D83), which "calendar" stands for.
export const add_to_calendar: CommandDef = {
  needs: ["calendar", "see-tasks"],
  spec: (request) => ({
    description: "Put dated open tasks on the person's calendar: they get a calendar file, and one tap adds them to a Google Calendar they connected.",
    progress: "Getting the events ready",
    prompt: "When the person asks to put tasks in their calendar, call add_to_calendar with the dated tasks they mean (all of them if they don't say). Tasks without a date can't go in; say so. Nothing is added until they tap Add.",
    args: { titles: { description: "Exact titles of open tasks with due dates.", list: { max: 20 },
      oneOf: openTasks(request).filter((task) => task.due && task.title.length <= limits.title).map((task) => task.title).slice(-limits.items) } },
  }),
  links: (request, args) => {
    const dated = openTasks(request).filter((task) => task.due);
    const named = (title: string) => dated.find((task) => task.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) ?? [];
    const tasks = [...new Set(texts(args.titles).flatMap(named))];
    return tasks.length ? { links: [{ label: `Add ${tasks.length} to my calendar`, href: `data:text/calendar;charset=utf-8,${encodeURIComponent(icsOf(tasks))}`, download: "tasks.ics",
      events: tasks.map((task) => ({ key: task.id, title: task.title, date: task.due })) }],
      taskIds: tasks.map((task) => task.id) } : undefined;
  },
};
export const search_web: CommandDef = {
  needs: ["web"],
  spec: () => ({
    description: "Hand the person a web search link.",
    progress: "Preparing a search",
    prompt: "When the person wants something looked up online, call search_web with a good query and say the link opens the results; don't claim to know what the pages say.",
    args: { query: { description: "The search query." } },
  }),
  links: (_request, args) => typeof args.query === "string" && args.query.trim()
    ? { links: [{ label: `Search for “${args.query.trim()}”`, href: `https://duckduckgo.com/?q=${encodeURIComponent(args.query.trim())}` }] } : undefined,
};
