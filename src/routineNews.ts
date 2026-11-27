// Whether a scheduled routine has anything new to act on since it last ran (agents-design D67). A check-in or review
// with nothing new would ask the model for the same answer as last time, usually `NOTHING NEW`, so it ends quietly
// before any model call, as a routine with nowhere to look already did. Reports always run: they're the scheduled
// summary the person reads. Run now always asks. `runRoutine` (src/routineRun.ts) checks it for both runners, the
// browser's and the routines function's for an account away.
import { quietProjects } from "./commands/request.ts";
import { addDays } from "./dates.ts";
import type { Task, WorkspaceData } from "./model.ts";
import { planAhead } from "./people.ts";
import { coveredBy, datesToPlanFor, plansDay, runnerOf } from "./routines.ts";
import type { PlacedRoutine } from "./routines.ts";

const dayMs = 86_400_000;

/**
 * Whether `placed`, which last ran at `since` (ms; -Infinity if never), has news at `now`, `today` being the
 * account's YYYY-MM-DD: a note it reads added or edited since; for Atlas's check-in also a new day with open tasks to
 * plan (agents-design D75); for a review or a weekly improvement (D68) also a task it sees changed or that fell due
 * since; for an improvement also a person's date with nothing planned that came within reach since (D71); for a
 * review also a project that went quiet since (`quietProjects`, the list review_changes offers to archive).
 */
export function routineHasNews(data: WorkspaceData, placed: PlacedRoutine, since: number, now: Date, today: string): boolean {
  if (placed.routine.kind === "report" || !Number.isFinite(since)) return true;
  const looks = coveredBy(data, placed);
  if (!looks) return true;
  const after = (stamp?: string) => !!stamp && Date.parse(stamp) > since;
  if (data.notes.some((note) => !note.archived && looks.covered(note) && after(note.updatedAt))) return true;
  const sinceDay = new Date(since).toISOString().slice(0, 10);
  if (placed.routine.kind === "check-in") return sinceDay < today && plansDay(data, placed, today);
  if (placed.routine.kind !== "review" && placed.routine.kind !== "improve") return false;
  const touched = (task: Task) => after(task.updatedAt) || !task.done && !!task.due && task.due >= sinceDay && task.due < today;
  if (data.tasks.some((task) => looks.covered(task) && touched(task))) return true;
  if (placed.routine.kind === "improve") return datesToPlanFor(data, placed, today).some(({ next }) => addDays(next.day, -planAhead) > sinceDay);
  const quietDays = placed.routine.quietDays ?? 60;
  const elapsed = (now.getTime() - since) / dayMs;
  return quietProjects({ agent: runnerOf(data, placed.owner), data, routine: { kind: "review", quietDays } }, now).some(({ days }) => days - elapsed < quietDays);
}
