// The blocks a domain's or project's page is made of: each widget kind with its views and widths, which blocks keep
// data the person logged, a page's default blocks, and a habit's streak.
import { addDays, daysBetween } from "./dates.ts";
import type { Note } from "./model.ts";

/**
 * A habit's streak under "never miss twice": the days done, counting back from today (or yesterday while today is
 * open), where one missed day keeps the run and two in a row end it. `atRisk` says the last day that counts was
 * missed, so ticking today is what keeps the streak.
 */
export function habitStreak(days: Set<string>, today: string) {
  let streak = 0, missed = 0, atRisk = false;
  for (let day = days.has(today) ? today : addDays(today, -1); missed < 2; day = addDays(day, -1)) {
    if (days.has(day)) { streak++; missed = 0; continue; }
    if (!streak) atRisk = true;
    missed++;
  }
  return { streak, atRisk: atRisk && streak > 0 };
}

/**
 * What a page block can be (D32), and the ways each one draws (D39: three views each, the first the default Carlos
 * chose; tasks keep Next up for starter pages). Each view names itself and says in a line what it is for, so the
 * block's view menu can explain the choice. Tasks, projects and resources read the place's records; the rest keep
 * their own words and numbers on the block, start at `width` with `starts`' data, and `says` what they show in the
 * line an agent reads (the title before it). How a kind draws and its tint stay in Widgets.tsx and the styles.
 */
export const widgetKinds = {
  tasks: { label: "Tasks", hint: "Open tasks here", views: {
    first: { label: "First one large", hint: "the next step set large, the rest below" },
    when: { label: "Grouped by when", hint: "late first, then this week and later" },
    add: { label: "Add with a when", hint: "a day is asked as a step is added" },
    next: { label: "Next up", hint: "the one thing to do now" } } },
  projects: { label: "Projects", hint: "A domain's projects, or a project's neighbours", views: {
    pace: { label: "Behind first", hint: "sorted by how each stands against its clock" },
    tiles: { label: "Garden tiles", hint: "stage as a plant, next due day" },
    steps: { label: "Next step in the row", hint: "each project's next task, ticked here" } } },
  resources: { label: "Resources", hint: "What's kept here", views: {
    kinds: { label: "Counts first", hint: "links, notes and files as chips that filter" },
    recent: { label: "Recent, with age", hint: "the one you touched last on top" },
    drop: { label: "Paste or drop strip", hint: "capture without a dialog" } } },
  countdown: { label: "Countdown", hint: "Days until a date", width: "narrow", views: {
    pace: { label: "Two bars, one verdict", hint: "time gone against steps done" },
    calendar: { label: "Calendar of days", hint: "each day a tile, today ringed" },
    arc: { label: "Sun over the arc", hint: "a dial with the day moving along it" } },
    starts: (today: string) => ({ date: addDays(today, 30), since: today }),
    says: (block: Block, today: string) => {
      if (!block.date) return "no date set";
      const left = daysBetween(today, block.date);
      return `${left > 0 ? `in ${left} days` : left === 0 ? "today" : `${-left} days ago`} (${block.date})`;
    } },
  tracker: { label: "Tracker", hint: "A number you log over time", width: "half", views: {
    latest: { label: "Latest large", hint: "the last value, its change and the target" },
    picks: { label: "Three guesses", hint: "last, usual and target one tap away" },
    slider: { label: "Slide to the number", hint: "a rail with target and last value marked" } },
    says: (block: Block) => {
      const last = block.entries?.at(-1), unit = block.unit ? ` ${block.unit}` : "";
      return `${last ? `last ${last.value}${unit} on ${last.date}` : "nothing logged"}${block.target !== undefined ? `, target ${block.target}${unit}` : ""}`;
    } },
  habit: { label: "Habit", hint: "Days you did something", width: "half", views: {
    month: { label: "Four weeks and a sprout", hint: "the plant grows with the streak" },
    today: { label: "Today is the big tile", hint: "the week, today as the button" },
    ring: { label: "Ring of seven", hint: "the streak in the middle" } },
    says: (block: Block, today: string) => `${(block.days ?? []).filter((day) => daysBetween(day, today) < 7).length} of the last 7 days` },
  goal: { label: "Goal", hint: "Progress toward a target", width: "narrow", views: {
    jar: { label: "Piggy bank", hint: "money fills a pig, the rest a jar" },
    flags: { label: "Named flags", hint: "quarters say their amount" },
    pace: { label: "At this pace", hint: "the ring says when you arrive" } },
    starts: () => ({ current: 0, target: 100 }),
    says: (block: Block) => `${block.current ?? 0} of ${block.target ?? "?"}${block.unit ? ` ${block.unit}` : ""}` },
  note: { label: "Pinned note", hint: "One note, always open", width: "half", views: {
    paper: { label: "Taped to the page", hint: "paper, the first lines" },
    ticks: { label: "Ticks in the note", hint: "its checkboxes become live" },
    edit: { label: "Write right here", hint: "the body is the editor" } },
    starts: (_today: string, notes: Note[]) => notes[0] ? { noteId: notes[0].id } : {} },
  checklist: { label: "Checklist", hint: "Named things to tick off", width: "half", views: {
    chips: { label: "Chips", hint: "a compact definition of done" },
    left: { label: "What's left on top", hint: "done rows fold away" },
    run: { label: "Add in a run", hint: "Enter keeps the cursor" } },
    says: (block: Block) => {
      const items = block.items ?? [];
      return `${items.filter((item) => item.done).length} of ${items.length} ticked${items.length ? `, open: ${items.filter((item) => !item.done).map((item) => item.text).join(", ")}` : ""}`;
    } },
  milestones: { label: "Milestones", hint: "Dated steps to the finish line", width: "half", views: {
    next: { label: "Next step as the figure", hint: "the rest folded under it" },
    road: { label: "The road", hint: "horizontal, spaced by time" },
    spaced: { label: "A date before you ask", hint: "the add form guesses the gap" } },
    says: (block: Block) => {
      const steps = block.steps ?? [], next = steps.find((step) => !step.done);
      return `${steps.filter((step) => step.done).length} of ${steps.length} reached${next ? `, next "${next.title}" on ${next.date}` : ""}`;
    } },
} as const;
export type Widget = keyof typeof widgetKinds;

/** One kind's entry with every optional part typed, for code that reads any kind. */
export type WidgetKind = {
  label: string; hint: string; views: Record<string, { label: string; hint: string }>; width?: BlockWidth;
  starts?: (today: string, notes: Note[]) => Partial<Block>; says?: (block: Block, today: string) => string;
};
export const widgetKind = (type: Widget): WidgetKind => widgetKinds[type];

/** A kind's views as a plain label map, for segmented controls. */
export const blockViewLabels = (type: Widget) => Object.fromEntries(Object.entries(widgetKinds[type].views).map(([view, { label }]) => [view, label]));

/** Today's widgets read records only. */
export const recordWidgets = ["tasks", "projects", "resources"] as const satisfies readonly Widget[];

/** Blocks of other widgets keep their own data, so taking one off a page puts it away instead of deleting it. */
export const keepsData = (block: Block) => !(recordWidgets as readonly Widget[]).includes(block.type);

/** How much of the page's width a block takes; phones stack everything full width. */
export const blockWidths = { full: "Full", wide: "Wide", half: "Half", narrow: "Narrow" } as const;
export type BlockWidth = keyof typeof blockWidths;

/** One block on a page: a widget, how it draws, how wide, and its own data when it keeps any. */
export type Block = {
  id: string;
  type: Widget;
  view?: string;
  width?: BlockWidth;
  title?: string;
  /** Countdown: the day it counts to; goal: the day to reach the target by (YYYY-MM-DD). */
  date?: string;
  /** Countdown: the day the wait began, so it can show how much is behind you. */
  since?: string;
  /** Tracker and goal: what the numbers measure ("km", "€"). */
  unit?: string;
  /** Tracker (a line to beat) and goal (where it ends). */
  target?: number;
  /** Tracker: "down" when less is better (spend, resting heart rate); otherwise more is better. */
  better?: "up" | "down";
  /** Goal: where it stands. */
  current?: number;
  /** Tracker: logged values, oldest first. */
  entries?: { date: string; value: number }[];
  /** Habit: days done (YYYY-MM-DD). */
  days?: string[];
  /** Pinned note. */
  noteId?: string;
  /** Checklist: the things to tick off, in order. */
  items?: { text: string; done: boolean }[];
  /** Milestones: dated steps, oldest first; `reached` is the day one was marked reached (the brief celebrates it, D40). */
  steps?: { title: string; date: string; done: boolean; reached?: string }[];
  /** The day it was taken off the page. Data widgets are put away rather than deleted, so what they logged can come back. */
  removed?: string;
};

/** The blocks a page shows; removed ones wait in the editor until restored or deleted for good. */
export const shownBlocks = (blocks: Block[]) => blocks.filter((block) => !block.removed);
export const viewOf = (block: Block) => block.view && block.view in widgetKinds[block.type].views ? block.view : Object.keys(widgetKinds[block.type].views)[0];

/** Each domain overview and project page starts from these until you or an agent change it. Today uses `Session.widgets`. */
export const defaultPages: Record<"domain" | "project", Block[]> = {
  domain: [{ id: "projects", type: "projects" }, { id: "tasks", type: "tasks" }, { id: "resources", type: "resources" }],
  project: [{ id: "resources", type: "resources" }, { id: "tasks", type: "tasks" }],
};
