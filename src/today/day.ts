// Today as a day (docs/page-design.md, "Today"; agents-design D75): where each task sits in the hours (a time, a part of
// the day, or anytime), the free half hours left, the crew's next steps placed in them, Atlas's plan for the rest, and
// the line Atlas opens the crew rail with. Pure: the View memoizes each part (view.ts), and day.test.ts covers them.
import { isClock } from "../dates.ts";
import type { Agent, Project, Proposal, ReviewChange, Task, Thread } from "../model.ts";
import { atlasId, routineKinds } from "../model.ts";
import { paceOf } from "../pace.ts";
import { dueDay } from "../pageGrid/due.ts";
import type { TodayBrief } from "./derive.ts";

export type DayPart = "morning" | "afternoon" | "evening";
/** The parts of the day in minutes past midnight: the hour boundaries Today's columns and the day line use. */
export const dayParts: { part: DayPart; label: string; from: number; to: number }[] = [
  { part: "morning", label: "Morning", from: 0, to: 12 * 60 },
  { part: "afternoon", label: "Afternoon", from: 12 * 60, to: 19 * 60 },
  { part: "evening", label: "Evening", from: 19 * 60, to: 24 * 60 },
];
/** The day line runs from 07:00 to 23:00; earlier or later things sit at its ends. */
export const lineFrom = 7 * 60, lineTo = 23 * 60;
/** Steps are placed on the half hour, never starting after 22:00; a task holds its length (half an hour unless set). */
const slot = 30, lastSlot = 22 * 60;
/** The lengths a task can hold, in minutes (the task dialog's "How long"). */
export const taskLengths = [15, 30, 45, 60, 90, 120];
export const lengthOf = (task: Pick<Task, "length">) => task.length && task.length > 0 ? task.length : slot;

/** A calendar event on today's line (agents-design D75, from the D74 connector): minutes past midnight on your clock. */
export type DayEvent = { title: string; from: number; to: number; allDay: boolean; busy: boolean };

export const isPart = (at: string | undefined): at is DayPart => at === "morning" || at === "afternoon" || at === "evening";
/** "16:30" as 990; anything else null. */
export const minuteOf = (at: string | undefined) => isClock(at) ? Number(at.slice(0, 2)) * 60 + Number(at.slice(3)) : null;
export const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export const partAt = (minute: number): DayPart => dayParts.find((part) => minute < part.to)?.part ?? "evening";
/** The part a task's `at` names: its own for a part, the one its time falls in for a time, none for anytime. */
export const partOf = (at: string | undefined): DayPart | null => isPart(at) ? at : isClock(at) ? partAt(minuteOf(at)!) : null;
export const minuteNow = (now: number) => { const time = new Date(now); return time.getHours() * 60 + time.getMinutes(); };
/** Where a minute sits along the day line, 0 to 1. */
export const lineShare = (minute: number) => Math.min(1, Math.max(0, (minute - lineFrom) / (lineTo - lineFrom)));

/** A task's place in today: its time or part only counts on the day it's due; a late task's old time is anytime now. */
export const placedAt = (task: Pick<Task, "due" | "at">, day: string) => task.due === day ? task.at : undefined;

export type TodayDay = {
  /** Open tasks in play with no time or part today, oldest due first. */
  anytime: Task[];
  /** Each part's tasks, timed ones by time, then the ones placed in the part without a time. */
  parts: Record<DayPart, Task[]>;
  /** Done tasks with no place today, folded under the tray. */
  doneAnytime: Task[];
};

/** Splits the tasks in play today (`todayTasksOf`'s garden: due by today, open or done today) into the tray and the parts of the day. */
export function todayDayOf(inPlay: Task[], day: string): TodayDay {
  const parts: TodayDay["parts"] = { morning: [], afternoon: [], evening: [] };
  const anytime: Task[] = [], doneAnytime: Task[] = [];
  for (const task of inPlay) {
    const part = partOf(placedAt(task, day));
    if (part) parts[part].push(task);
    else (task.done ? doneAnytime : anytime).push(task);
  }
  const order = (a: Task, b: Task) => (minuteOf(placedAt(a, day)) ?? 9999) - (minuteOf(placedAt(b, day)) ?? 9999);
  for (const part of dayParts) parts[part.part].sort(order);
  anytime.sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
  return { anytime, parts, doneAnytime };
}

/** The stretches of today already held: timed open tasks for their length, and busy timed calendar events. */
export const busySpans = (inPlay: Task[], day: string, events: DayEvent[] = []): [number, number][] => [
  ...inPlay.flatMap((task): [number, number][] => {
    const minute = task.done ? null : minuteOf(placedAt(task, day));
    return minute === null ? [] : [[minute, minute + lengthOf(task)]];
  }),
  ...events.filter((event) => event.busy && !event.allDay).map((event): [number, number] => [event.from, event.to]),
];

/** The half hours from `from` until 22:00 that nothing held overlaps, earliest first. */
export function freeSlots(spans: [number, number][], from: number): number[] {
  const free: number[] = [];
  for (let minute = Math.ceil(from / slot) * slot; minute <= lastSlot; minute += slot)
    if (!spans.some(([start, end]) => start < minute + slot && end > minute)) free.push(minute);
  return free;
}

/**
 * Takes the first free stretch long enough for `length` from `left` and returns its start, leaving the half hour after
 * it free of other steps too, so suggestions never stand shoulder to shoulder on the line. Undefined when none fits.
 */
export function takeSlot(left: number[], length: number): number | undefined {
  const fits = (minute: number) => Array.from({ length: Math.ceil(length / slot) }, (_, index) => minute + index * slot).every((half) => left.includes(half));
  const start = left.find(fits);
  if (start === undefined) return undefined;
  for (let index = left.length - 1; index >= 0; index--) if (left[index] >= start && left[index] < start + length + slot) left.splice(index, 1);
  return start;
}

/**
 * A next step for today (agents-design D75): an agent puts a task at a time, dashed on the day line until you apply it.
 * `task` steps set the task's day and time on Apply. A `proposal` step comes from a chat or routine proposal: one that
 * adds tasks for today is applied as it stands; one of a plan's changes (`change`, a task at a time with the agent's
 * reason) puts that one task in place. `minute` is absent when nothing names a time and no half hour is free.
 */
export type DayStep = {
  key: string;
  agent: Agent;
  title: string;
  why: string;
  minute?: number;
  hue: string;
  label: string;
  open: string;
  task?: Task;
  proposal?: { thread: string; proposal: Proposal; change?: Extract<ReviewChange, { kind: "reschedule" }> };
};

const sentence = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/**
 * Each speaking agent's one next step (D75), worked out from the workspace like its brief: for late work, the oldest
 * late task where it speaks; for a project behind its finish line, its next open step. Agents whose brief says
 * something else (an approval, a question, a report) have no step here; their news stays in the rail below.
 */
export function crewStepsOf(briefs: TodayBrief[][], tasks: Task[], projects: Project[], hues: Map<string, string>, day: string): Omit<DayStep, "minute">[] {
  const steps: Omit<DayStep, "minute">[] = [];
  const taken = new Set<string>();
  for (const entries of briefs) {
    for (const entry of entries) {
      const { brief } = entry;
      const project = projects.find((item) => item.id === entry.place);
      const own = tasks.filter((task) => !task.done && !taken.has(task.id) && (project ? task.projectId === project.id : `area:${task.domain}` === entry.place));
      let task: Task | undefined, why = "";
      if (brief.kind === "late") {
        task = own.filter((item) => item.due && item.due < day).sort((a, b) => a.due < b.due ? -1 : 1)[0];
        if (task) why = `${sentence(dueDay(task.due, day).when.toLowerCase())}, the oldest in ${entry.label}.`;
      } else if (brief.kind === "behind" && project) {
        const live = tasks.filter((item) => item.projectId === project.id);
        const pace = paceOf(project, live, day);
        task = own.filter((item) => !(item.due === day && item.at)).sort((a, b) => (a.due || "9") < (b.due || "9") ? -1 : 1)[0];
        const left = pace.finish?.date ? Math.round((Date.parse(`${pace.finish.date}T12:00:00`) - Date.parse(`${day}T12:00:00`)) / 864e5) : 0;
        if (task) why = `${project.title} is behind: ${pace.done} of ${pace.total} steps done${left > 0 ? ` with ${left} ${left === 1 ? "day" : "days"} left` : ""}. This is the next one.`;
      }
      if (!task) continue;
      taken.add(task.id);
      steps.push({ key: `step:${task.id}`, agent: brief.agent, title: task.title, why, hue: hues.get(task.domain) ?? "var(--accent)",
        label: entry.label, open: entry.open, task });
      break;
    }
  }
  return steps;
}

/** A plan's change already done: its task is on that day at that time. */
const inPlace = (task: Task, change: Extract<ReviewChange, { kind: "reschedule" }>) => task.due === change.to && (change.at === undefined || task.at === change.at);

/**
 * Chat and routine proposals still waiting with something for today or earlier, from the agent that proposed them:
 * one step for new tasks, applied as it stands; one step per change of a plan that puts an open task at a time today,
 * with the agent's own reason (Atlas's morning check-in, `plan_day`), until that task is in place.
 */
export function proposalStepsOf(threads: Thread[], agents: Agent[], tasks: Task[], hues: Map<string, string>, day: string): Omit<DayStep, "minute">[] {
  return threads.flatMap((thread) => thread.messages.flatMap((message): Omit<DayStep, "minute">[] => {
    const proposal = message.proposal;
    const agent = agents.find((item) => item.id === message.agentId);
    if (!proposal || proposal.status !== "pending" || proposal.agent || !agent) return [];
    // A routine's plan names the routine (Atlas's check-in); a chat's, the chat.
    const label = message.routine ? routineKinds[message.routine.kind].label : thread.title || "Your chat";
    if (proposal.changes?.length) return proposal.changes.flatMap((change) => {
      const task = change.kind === "reschedule" && change.at && change.to === day ? tasks.find((item) => item.id === change.taskId && !item.done) : undefined;
      if (!task || change.kind !== "reschedule" || inPlace(task, change)) return [];
      return [{ key: `proposal:${proposal.id}:${task.id}`, agent, title: task.title, why: change.why || `Planned in your chat with ${agent.name}.`,
        hue: hues.get(task.domain) ?? "var(--accent)", label, open: thread.id, task, proposal: { thread: thread.id, proposal, change } }];
    });
    const items = proposal.items.filter((item) => item.due && item.due <= day);
    if (!items.length) return [];
    const title = items.length === 1 ? items[0].title : `${items.length} tasks for today, starting with ${items[0].title}`;
    return [{ key: `proposal:${proposal.id}`, agent, title, why: `Proposed in your chat with ${agent.name}; nothing changes until you apply it.`,
      hue: hues.get(items[0].domain) ?? "var(--accent)", label, open: thread.id, proposal: { thread: thread.id, proposal } }];
  }));
}

/**
 * Gives each step its time, dropping the ones skipped today: a proposal keeps the time it names (a plan's change, or
 * the first task it adds) while that time is still ahead, and holds it from the others; the rest, and a named time
 * already gone, take the first free stretch their task's length fits, a half hour apart.
 */
export function placeSteps(steps: Omit<DayStep, "minute">[], free: number[], day: string, skipped: string[], now = 0): { steps: DayStep[]; free: number[] } {
  const left = [...free];
  const shown = steps.filter((step) => !skipped.includes(step.key));
  const named = new Map(shown.flatMap((step) => {
    if (!step.proposal) return [];
    const minute = step.proposal.change ? minuteOf(step.proposal.change.at)
      : step.proposal.proposal.items.map((item) => minuteOf(placedAt(item, day))).find((at) => at !== null);
    return minute === undefined || minute === null || minute < now ? [] : [[step.key, minute] as const];
  }));
  for (const [key, minute] of named) {
    const length = lengthOf(shown.find((step) => step.key === key)?.task ?? {});
    for (let index = left.length - 1; index >= 0; index--) if (left[index] + slot > minute && left[index] < minute + length + slot) left.splice(index, 1);
  }
  const placed = shown.map((step): DayStep => {
    if (named.has(step.key)) return { ...step, minute: named.get(step.key) };
    if (step.proposal && !step.proposal.change) return step;
    const minute = takeSlot(left, step.task ? lengthOf(step.task) : slot);
    return minute === undefined ? step : { ...step, minute };
  });
  return { steps: placed, free: left };
}

/** Plan the rest of my day (D75): Atlas puts every task left in the tray where its length fits, oldest first, a half hour apart. */
export function planOf(anytime: Task[], free: number[], atlas: Agent, hues: Map<string, string>, day: string, skipped: string[],
  stepped: Set<string>): DayStep[] {
  const left = [...free];
  return anytime.filter((task) => !task.done && !stepped.has(task.id) && !skipped.includes(`plan:${task.id}`)).flatMap((task) => {
    const minute = takeSlot(left, lengthOf(task));
    if (minute === undefined) return [];
    const { when, late } = dueDay(task.due, day);
    return [{ key: `plan:${task.id}`, agent: atlas, title: task.title, why: late ? `${sentence(when.toLowerCase())}; this time is free.` : "Due today; this time is free.",
      minute, hue: hues.get(task.domain) ?? "var(--accent)", label: task.domain, open: task.projectId || `area:${task.domain}`, task }];
  });
}

/**
 * The line Atlas opens the crew rail with: what matters most today (your starred task, else the oldest late one, else
 * the next timed one), then how many next steps wait below.
 */
export function atlasLineOf(open: Task[], focus: Task | undefined, steps: DayStep[], day: string, nowMinute: number):
  { lead?: Task; before: string; after: string } {
  const late = open.filter((task) => task.due < day).sort((a, b) => a.due < b.due ? -1 : 1)[0];
  const next = open.map((task) => ({ task, minute: minuteOf(placedAt(task, day)) })).filter((item) => item.minute !== null && item.minute >= nowMinute)
    .sort((a, b) => a.minute! - b.minute!)[0]?.task;
  const lead = focus ?? late ?? next;
  const count = steps.length;
  const after = count ? ` ${count === 1 ? "One next step below waits" : `${count} next steps below wait`} for your yes, dashed on your day until then.`
    : " Nobody needs a yes from you right now.";
  if (!lead) return { before: open.length ? `${open.length} ${open.length === 1 ? "thing" : "things"} today, nothing late.` : "Nothing due today.", after };
  const reason = lead === focus ? ": you starred it" : lead.due < day ? `: it's ${dueDay(lead.due, day).when.toLowerCase()}` : `, at ${placedAt(lead, day)}`;
  return { lead, before: "", after: ` matters most today${reason}.${after}` };
}

/** Crew agents with nothing to say today: no brief on Today and no step. */
export const quietAgentsOf = (agents: Agent[], briefs: TodayBrief[][], steps: DayStep[]) => agents.filter((agent) => agent.id !== atlasId && !agent.archived
  && !briefs.some((entries) => entries[0].brief.agent.id === agent.id) && !steps.some((step) => step.agent.id === agent.id));
