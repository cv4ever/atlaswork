// What the Routines page lists and says, without drawing it (agents-design D68, D70): every routine as a line (who
// runs it, whether it can, when it's next, how it's been going), the filters and sorts, the held order that keeps a
// row under the pointer while you change it, and the words for timing and outcomes. No React; listing.test.ts covers it.
import { routineKinds } from "../model.ts";
import type { Agent, RoutineKind, RoutineResult, WorkspaceData } from "../model.ts";
import * as routines from "../routines.ts";
import type { PlacedRoutine } from "../routines.ts";
import type { RoutineRun } from "../conversations.ts";

export type Status = "all" | "attention" | "on" | "off";
export type Sort = "next" | "agent" | "kind";
export const statuses: { value: Status; label: string; tip: string }[] = [
  { value: "all", label: "All", tip: "Every routine" },
  { value: "attention", label: "Needs you", tip: "Due now, waiting on a tool, or its last run failed" },
  { value: "on", label: "On", tip: "Runs on its schedule" },
  { value: "off", label: "Off", tip: "Switched off, or its owner is archived" },
];
export const sorts: { value: Sort; label: string }[] = [{ value: "next", label: "Next run" }, { value: "agent", label: "Agent" }, { value: "kind", label: "Kind" }];
export const kinds = Object.keys(routineKinds) as RoutineKind[];

/** One routine as the page shows it: where it sits, who runs it, whether it can, when it's next and how it's been going. */
export type Line = PlacedRoutine & routines.Readiness & { key: string; next?: Date; results: RoutineResult[]; failed: boolean };

export function linesOf(data: WorkspaceData, now: Date): Line[] {
  return routines.routinesOf(data).map((placed) => {
    const ready = routines.readinessOf(data, placed, now);
    const results = routines.resultsOf(data, placed.routine.id);
    return { ...placed, ...ready, key: `${routines.ownerKey(placed.owner)}/${placed.routine.id}`, results, failed: results[0]?.outcome === "failed",
      ...ready.enabled && { next: routines.nextDue(placed.routine, now)[0] } };
  });
}

/** Due now, a tool it needs is off, or its last run failed. */
const needsYou = (line: Line) => !!line.due || !line.routine.paused && line.missing.length > 0 || line.failed;
export const inStatus = (line: Line, value: Status) => value === "all" || (value === "attention" ? needsYou(line) : value === "on" ? line.enabled : !line.enabled);

export type Filters = { status: Status; who: string[]; pinned: { at: number; ids: string[] } | null; sort: Sort };

/**
 * The lines as shown: filtered, then sorted (what's due first, by when it came due; then by next run). `held` is the
 * order the list had when you first changed something in it: held rows keep their places, one added meanwhile joins at
 * the end, and `resorted` says the held order differs from a fresh sort, so Sort again is worth offering.
 */
export function ordered(lines: Line[], { status, who, pinned, sort }: Filters, held: string[] | null) {
  const shown = lines.filter((line) =>
    inStatus(line, status) && (!who.length || who.includes(line.runner.id)) && (!pinned || pinned.ids.includes(line.routine.id)));
  const order = (line: Line) => (line.due ?? line.next)?.getTime() ?? Infinity;
  const fresh = [...shown].sort((a, b) => sort === "agent" ? a.runner.name.localeCompare(b.runner.name) || order(a) - order(b)
    : sort === "kind" ? kinds.indexOf(a.routine.kind) - kinds.indexOf(b.routine.kind) || order(a) - order(b) : order(a) - order(b));
  const byKey = new Map(lines.map((line) => [line.key, line]));
  const sorted = held ? [...held.flatMap((key) => byKey.get(key) ?? []), ...fresh.filter((line) => !held.includes(line.key))] : fresh;
  const resorted = !!held && (sorted.length !== fresh.length || sorted.some((line, index) => fresh[index].key !== line.key));
  return { sorted, resorted };
}

/** "Atlas's check-in", "Vital's weekly improvement for Health". */
export function whatOf(data: WorkspaceData, line: { routine: { kind: RoutineKind }; owner: routines.RoutineOwner; runner: Agent }) {
  return `${line.runner.name}'s ${routineKinds[line.routine.kind].label.toLocaleLowerCase()}${line.owner.kind === "agent" ? "" : ` for ${routines.ownerLabel(data, line.owner)}`}`;
}

/** "in 10 hours" within two days, where "in 1 day" would say it less closely; "in 4 days" after. */
export function untilLabel(next: Date, now: Date) {
  const hours = Math.round((next.getTime() - now.getTime()) / 36e5);
  return hours > 0 && hours < 48 ? `in ${hours} ${hours === 1 ? "hour" : "hours"}` : routines.fromNow(next, now);
}

/** When, then how far that is from now: "Tomorrow, 08:00" over "in 9 hours", "Sat 31 Oct, 18:00" over "due 19 days ago". */
export function timingOf(line: Line, now: Date): [string, string] {
  if (line.due) {
    const hours = Math.max(1, Math.floor((now.getTime() - line.due.getTime()) / 36e5));
    const days = Math.floor(hours / 24);
    return [routines.whenLabel(line.due, now), days ? `due ${days} ${days === 1 ? "day" : "days"} ago` : `due ${hours} ${hours === 1 ? "hour" : "hours"} ago`];
  }
  if (line.next) return [routines.whenLabel(line.next, now), untilLabel(line.next, now)];
  const last = line.results[0];
  return last ? [routines.whenLabel(new Date(last.due), now), "its last run"] : ["Never ran", line.routine.paused ? "switched off" : "nothing ahead"];
}

/** What a run did, for the toast: routines answer through the model, so this follows once they're back. */
export const outcomeOf = ({ ran, posted, failed, offline }: RoutineRun, quiet: string) => offline
  ? "No AI model is connected, so routines wait. Connect one in Settings → AI model."
  : failed.length ? `${failed.length === ran ? "It" : `${failed.length} of ${ran}`} couldn't run. ${failed[0]}`
  : posted ? `${posted === 1 && ran === 1 ? "It's" : `${posted} had something to say; it's`} in their chat${posted === 1 ? "" : "s"}.` : quiet;
