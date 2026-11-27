// How each project stands for the projects widget: its pace, days to its finish line, its next open task, whether
// it's done, and the order the widget lists them in (behind first, then on the clock, then undated, finished last).
// Pure; paced.test.ts covers it.
import type { Project, Task } from "../model.ts";
import { paceOf } from "../pace.ts";
import type { Pace } from "../pace.ts";
import { byDue, daysTo } from "./due.ts";

export type PacedProject = { project: Project; pace: Pace; daysLeft?: number; next?: Task; done: boolean };

export function pacedProjects(projects: Project[], tasks: Task[], today: string): PacedProject[] {
  return projects.map((project) => {
    const own = tasks.filter((task) => task.projectId === project.id);
    const pace = paceOf(project, own, today);
    const daysLeft = pace.finish?.date ? daysTo(pace.finish.date, today) : undefined;
    const next = own.filter((task) => !task.done).sort(byDue)[0];
    const done = pace.total > 0 && pace.done === pace.total;
    const rank = pace.behind ? 0 : daysLeft !== undefined && !done ? 1 : !done ? 2 : 3;
    return { entry: { project, pace, daysLeft, next, done }, rank };
  }).sort((a, b) => a.rank - b.rank || (a.entry.daysLeft ?? Infinity) - (b.entry.daysLeft ?? Infinity)).map(({ entry }) => entry);
}
