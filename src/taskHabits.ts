// What a home's tasks usually take (docs/page-design.md, "Task dialog"): the length and part of the day picked most
// often there, so a new task opens with your own usual answers. A habit needs three tasks agreeing and at least half
// of those that set the field; anything weaker stays the plain default (half an hour, any time).
import type { Task } from "./model.ts";
import { partOf } from "./today/day.ts";
import type { DayPart } from "./today/day.ts";

export type TaskHabits = { length?: number; part?: DayPart };

/** The value most of `values` share, when three or more do and they're at least half. */
function usual<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return count !== undefined && count >= 3 && count * 2 >= values.length ? value : undefined;
}

/** The habits of a home: a project's own tasks, or every task in a domain. Done tasks count; they're the history. */
export function habitsOf(tasks: Task[], home: { domain: string; projectId: string }): TaskHabits {
  const mine = tasks.filter((task) => home.projectId ? task.projectId === home.projectId : task.domain === home.domain);
  return {
    length: usual(mine.flatMap((task) => task.length && task.length > 0 ? [task.length] : [])),
    part: usual(mine.flatMap((task) => { const part = partOf(task.at); return part ? [part] : []; })),
  };
}
