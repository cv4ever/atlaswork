// The Pace module: how a project stands against its clock. `paceOf` counts its steps, names the growth stage, finds the
// page's finish line (the first shown dated countdown with a start) and says whether the clock is clearly ahead of the
// work. The masthead, the Countdown block, App's project views and Workspace's onScreen read it; `byPressure` orders a
// domain's projects for the Domains page and the sidebar. Callers keep only wording.
// pace.test.ts covers it.
import { plantStages } from "./look.ts";
import { shownBlocks } from "./blocks.ts";
import type { Project, Task } from "./model.ts";
import type { Block } from "./blocks.ts";

export type Pace = {
  /** Finished and all live steps of the project. */
  done: number;
  total: number;
  stage: (typeof plantStages)[number];
  /** The page's finish line, when it has one. */
  finish?: Block;
  /** Share of the wait gone, from the finish line's start to its date (0 without a finish line). */
  timeShare: number;
  /** The clock is clearly ahead of the work: more than 20 points between the share of time gone and the share of steps done, after the first 15% of the wait. */
  behind: boolean;
  /** The earliest due day among open steps. */
  nextDue?: string;
};

const dayMs = 86_400_000;
const between = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / dayMs);

/** The stage for finished steps: nothing done is just planted, everything done is in bloom. */
export const stageOf = (done: number, total: number) => plantStages[!done ? 0 : done === total ? 3 : done / total < 1 / 3 ? 1 : 2];

/** `tasks` are the project's live tasks; `done` ones count as steps taken. */
export function paceOf(project: Pick<Project, "widgets">, tasks: Task[], today: string): Pace {
  const done = tasks.filter((task) => task.done).length;
  const total = tasks.length;
  const finish = shownBlocks(project.widgets ?? []).find((block) => block.type === "countdown" && block.date && block.since);
  const wait = finish ? between(finish.since!, finish.date!) : 0;
  const timeShare = wait > 0 ? Math.min(Math.max(between(finish!.since!, today), 0), wait) / wait : 0;
  // False before the start, past the date, or with nothing planned.
  const behind = !!finish && wait > 0 && between(today, finish.date!) > 0 && total > 0 && timeShare > 0.15 && timeShare - done / total > 0.2;
  const nextDue = tasks.filter((task) => !task.done && task.due).map((task) => task.due).sort()[0];
  return { done, total, stage: stageOf(done, total), finish, timeShare, behind, nextDue };
}

/** How a project stands for lists that put the most pressing first: its pace, late steps, and whether it's finished or stalled. */
export type Standing<P> = { project: P; pace: Pace; behind: number; finished: boolean; stalled: boolean };

/**
 * Projects with their standing, most pressing first: late or behind, then no next step, then by next due day,
 * finished last. `tasks` may hold other projects' tasks; each project takes its own. Domains and the sidebar share it.
 */
export function byPressure<P extends Pick<Project, "id" | "widgets">>(projects: P[], tasks: Task[], today: string): Standing<P>[] {
  const rank = ({ pace, behind, finished, stalled }: Standing<P>) => behind || pace.behind ? 0 : stalled ? 1 : finished ? 3 : 2;
  return projects.map((project) => {
    const steps = tasks.filter((task) => task.projectId === project.id);
    const pace = paceOf(project, steps, today);
    const finished = pace.total > 0 && pace.done === pace.total;
    return { project, pace, behind: steps.filter((task) => !task.done && !!task.due && task.due < today).length, finished,
      stalled: !finished && !steps.some((task) => !task.done) };
  }).sort((a, b) => rank(a) - rank(b) || (a.pace.nextDue ?? "~").localeCompare(b.pace.nextDue ?? "~"));
}
