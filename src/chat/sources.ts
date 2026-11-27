// What a reply read to answer, as its sources line says it (agents-design D81): one entry per kind of source, in the
// order the reply first used it, connected accounts (Google Calendar, D74) first. Pure, so sources.test.ts covers it;
// MessageRow draws the line and the typing indicator borrows the kinds for its icon.
import { addDays, daysBetween, formatDate } from "../dates.ts";
import type { ToolUse } from "../model.ts";

export type SourceKind = "calendar" | "files" | "image" | "notes" | "tasks" | "pages";

export type Source = {
  kind: SourceKind;
  /** What it did, as a short sentence: "Checked Google Calendar". */
  label: string;
  /** What it was about, short enough for a chip: "Mon 24 – Sun 30 Nov", "“receipts”", "budget.md". */
  detail?: string;
  /** Everything it looked at, for the tooltip: every search and file, not only the first. */
  full: string;
  /** An outside account the person connected: the line spells it out, where their own records show as an icon. */
  connection: boolean;
  /** Every call to it failed: its grant was revoked (`disconnected`) or it didn't answer (`unanswered`). */
  failed: false | "disconnected" | "unanswered";
  /** The calendar's days from the first to the last read, at most 14 (YYYY-MM-DD), which tapping its chip reads again. */
  days?: string[];
};

/** The source kind each read tool belongs to; tools that change things (proposals, remember) are no source. */
const kinds: Record<string, SourceKind> = {
  read_calendar: "calendar", free_time: "calendar", search_files: "files", search_computer: "files", read_file: "files",
  read_image: "image", read_notes: "notes", list_tasks: "tasks", read_pages: "pages",
};

/** The source kind a tool belongs to, for the typing indicator's icon; undefined for a tool that reads nothing. */
export const sourceKind = (tool: string | undefined): SourceKind | undefined => tool ? kinds[tool] : undefined;

const day = /^\d{4}-\d{2}-\d{2}$/;
const noon = (date: string) => Date.parse(`${date}T12:00:00Z`);
const dayWords = (date: string) => formatDate(noon(date), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Days as the chat says them: "today", "tomorrow", "Tue 24 Nov", or a span "Mon 24 – Sun 30 Nov" (the month once when
 * both ends share it), from the first to the last day any call read.
 */
export function daysWords(days: string[], today: string) {
  const sorted = days.filter((item) => day.test(item)).sort();
  if (!sorted.length) return undefined;
  const [first, last] = [sorted[0], sorted.at(-1)!];
  if (first === last) return first === today ? "today" : first === addDays(today, 1) ? "tomorrow" : dayWords(first);
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);
  const start = sameMonth ? formatDate(noon(first), { weekday: "short", day: "numeric", timeZone: "UTC" }) : dayWords(first);
  return `${start} – ${dayWords(last)}`;
}

/** Every day from the earliest to the latest of `days`, at most 14, as a calendar read covers them. */
export function daysSpanned(days: string[]) {
  const sorted = days.filter((item) => day.test(item)).sort();
  if (!sorted.length) return [];
  const spanned = [sorted[0]];
  while (spanned.length < 14 && spanned.at(-1)! < sorted.at(-1)!) spanned.push(addDays(spanned.at(-1)!, 1));
  return spanned;
}

const plural = (count: number, one: string, many: string) => count === 1 ? one : `${count} ${many}`;
const quoted = (text: string) => `“${text}”`;
/** A file's name without its folders, as the chip shows it; the tooltip keeps the path. */
const fileName = (path: string) => path.split(/[\\/]/).at(-1) || path;
const unique = (items: string[]) => [...new Set(items.filter(Boolean))];
/** "Office PC and Laptop". */
const joined = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
/** The computers `uses` were made on (D84), each once, in the order they were first used. */
const computersOf = (uses: ToolUse[]) => unique(uses.flatMap((use) => use.on ?? []));
/** A file's path without the computer a search named it after ("Laptop: Papers/x.pdf", D84). */
const pathOf = (use: ToolUse) => {
  const path = use.about ?? "";
  const [on] = use.on ?? [];
  return on && path.startsWith(`${on}: `) ? path.slice(on.length + 2) : path;
};
/** A file as the tooltip names it: its path, then the computer it was read on. */
const fileOn = (use: ToolUse) => use.on?.length ? `${pathOf(use)} on ${use.on[0]}` : pathOf(use);

function sourceOf(kind: SourceKind, uses: ToolUse[], today: string): Source {
  const abouts = unique(uses.map((use) => use.about ?? ""));
  const failed = uses.every((use) => use.failed) && (uses.some((use) => use.failed === "disconnected") ? "disconnected" : "unanswered");
  const plain = { kind, connection: false, failed: false as const };
  if (kind === "calendar") {
    const days = uses.flatMap((use) => {
      const [from, to] = (use.about ?? "").split("/");
      return to ? [from, to] : [from];
    });
    const span = daysWords(days, today);
    const label = failed === "disconnected" ? "Google Calendar disconnected" : failed ? "Couldn't reach Google Calendar"
      : uses.every((use) => use.tool === "free_time") ? "Found free time in Google Calendar" : "Checked Google Calendar";
    const spanned = daysSpanned(days);
    return { kind, label, ...span && !failed && { detail: span }, full: span ? `${label}: ${span}` : label, connection: true, failed,
      ...spanned.length && !failed && { days: spanned } };
  }
  if (kind === "files") {
    const reads = uses.filter((use) => use.tool === "read_file"), searches = uses.filter((use) => use.tool === "search_files" || use.tool === "search_computer");
    const opened = unique(reads.map(fileOn));
    const searched = unique(searches.map((use) => use.about ?? ""));
    // Read or searched on the account's computers (D84): the line names them, else it's this device's folders.
    const readOn = computersOf(reads), searchedOn = computersOf(searches);
    const label = opened.length ? `Read ${plural(opened.length, "a file", "files")}${readOn.length ? ` on ${joined(readOn)}` : ""}`
      : searchedOn.length ? `Searched ${joined(searchedOn)}` : "Searched your files";
    const detail = opened.length ? unique(reads.map((use) => fileName(use.about ?? ""))).join(", ") : searched.map(quoted).join(", ");
    const full = [searched.length && `Searched ${searchedOn.length ? `${joined(searchedOn)} ` : ""}for ${searched.map(quoted).join(", ")}`,
      opened.length && `Read ${opened.join(", ")}`].filter(Boolean).join(". ") || label;
    return { ...plain, label, ...detail && { detail }, full };
  }
  if (kind === "image") {
    const on = computersOf(uses);
    const label = `Looked at ${plural(Math.max(1, abouts.length), "an image", "images")}${on.length ? ` on ${joined(on)}` : ""}`;
    return { ...plain, label, ...abouts.length && { detail: abouts.map(fileName).join(", ") },
      full: abouts.length ? `${label}: ${unique(uses.map(pathOf)).join(", ")}` : label };
  }
  if (kind === "notes") {
    const label = "Read your notes";
    return { ...plain, label, ...abouts.length && { detail: abouts.map(quoted).join(", ") },
      full: abouts.length ? `${label}, looking for ${abouts.map(quoted).join(", ")}` : label };
  }
  if (kind === "tasks") {
    const label = "Checked your open tasks";
    const by = abouts.filter((about) => day.test(about)).sort().at(-1);
    const due = by && (daysBetween(today, by) < 0 ? "late ones" : `due by ${daysWords([by], today)}`);
    return { ...plain, label, ...due && { detail: due }, full: due ? `${label}: ${due}` : label };
  }
  return { ...plain, label: "Looked at your pages", full: "Looked at your pages" };
}

/** What `used` read, one Source per kind: connected accounts first, then in the order the reply first used each. */
export function sourcesOf(used: ToolUse[] | undefined, today: string): Source[] {
  const grouped = new Map<SourceKind, ToolUse[]>();
  for (const use of used ?? []) {
    const kind = kinds[use.tool];
    if (kind) grouped.set(kind, [...grouped.get(kind) ?? [], use]);
  }
  const sources = [...grouped].map(([kind, uses]) => sourceOf(kind, uses, today));
  return [...sources.filter((source) => source.connection), ...sources.filter((source) => !source.connection)];
}
