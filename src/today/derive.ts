// What Today shows, worked out from the Workspace alone (docs/page-design.md, "Today"): the crew's briefs, questions and
// ideas waiting on you, the tasks in play and the week, your starred task, every page's places and blocks, the rituals
// and the horizon; where each sits in the day is day.ts. Pure: the View memoizes each on exactly its inputs (view.ts),
// and derive.test.ts covers them.
import { pendingAsks } from "../agents.ts";
import { habitStreak, shownBlocks } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { briefKinds, briefOf, domainBriefOf } from "../brief.ts";
import type { Brief } from "../brief.ts";
import { addDays } from "../dates.ts";
import { projectInk } from "../look.ts";
import { atlasId } from "../model.ts";
import type { Agent, Domain, Project, Task, Thread, Topic, WorkspaceData } from "../model.ts";
import { datesAhead, peopleOf } from "../people.ts";
import { domainKey, tabKey } from "../place.ts";
import type { Session } from "../session.ts";
import type { ShownDomain } from "../view.ts";
import * as workspace from "../workspace.ts";

export type TodayBrief = { place: string; label: string; open: string; brief: Brief };
/** A question a routine left for your OK (agents-design D50): who wants to ask whom, and the chat it waits in. */
export type TodayAsk = { thread: string; from: Agent; to: Agent };
export type PagePlace = { place: string; open: string; label: string; hue: string };
export type PlacedBlock = PagePlace & { block: Block };
export type TodayTasks = {
  garden: Task[]; open: Task[]; done: Task[]; lateCount: number; spread: number; ahead: Task[];
  days: { day: string; tasks: Task[] }[]; week: number; busiest: number;
};
export type TodayRituals = {
  items: (PlacedBlock & { days: Set<string>; done: boolean; streak: number })[];
  week: string[]; done: number; remaining: number;
};
/**
 * A dated thing on Today's horizon; `since` is when its wait began (a countdown's start, the step before a milestone,
 * a person's date a year before). `person` is the person whose date it is (D71), whose page it opens.
 */
export type HorizonDate = { key: string; title: string; date: string; since?: string; open: string; label: string; hue: string; person?: string };

/**
 * Today's row of briefs (D40): every place whose agent has something to say, not dismissed and not a welcome, one
 * card per agent so each face shows once, most pressing first. A domain's projects behind or finished are left to
 * the projects' own entries. Agents in the open chat panel (`panel`) stay quiet.
 */
export function todayRowOf(data: WorkspaceData, projects: Project[], domains: Domain[], tasks: Task[], day: string, panel: Set<string>): TodayBrief[][] {
  const byProject = new Map<string, Task[]>(), byDomain = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.projectId) (byProject.get(task.projectId) ?? byProject.set(task.projectId, []).get(task.projectId)!).push(task);
    (byDomain.get(task.domain) ?? byDomain.set(task.domain, []).get(task.domain)!).push(task);
  }
  const quiet = new Set(["behind", "bloom", "empty"]);
  const said = [
    ...projects.map((project) => ({ place: project.id, label: project.title, open: tabKey({ kind: "project", id: project.id }),
      brief: briefOf(data, project, byProject.get(project.id) ?? [], day, !!data.briefs[project.id]?.welcomed) })),
    ...domains.map((domain) => ({ place: domainKey(domain.name), label: `${domain.emoji} ${domain.name}`, open: domainKey(domain.name),
      brief: domainBriefOf(data, domain, byDomain.get(domain.name) ?? [], day) }))
      .filter((entry) => !quiet.has(entry.brief?.kind ?? "")),
  ].filter((entry): entry is TodayBrief =>
    !!entry.brief && entry.brief.kind !== "welcome" && entry.brief.key !== data.briefs[entry.place]?.dismissed && !panel.has(entry.brief.agent.id))
    .sort((a, b) => briefKinds.indexOf(a.brief.kind) - briefKinds.indexOf(b.brief.kind));
  const byAgent = new Map<string, TodayBrief[]>();
  for (const entry of said) byAgent.set(entry.brief.agent.id, [...byAgent.get(entry.brief.agent.id) ?? [], entry]);
  return [...byAgent.values()];
}

/** The tasks in play today (the garden, open and done), the seven days ahead, and the numbers Today's sentence says. */
export function todayTasksOf(tasks: Task[], day: string): TodayTasks {
  const inPlay = workspace.todayInPlay(tasks, day);
  const open = inPlay.filter((task) => !task.done).sort((a, b) => a.due.localeCompare(b.due));
  const done = inPlay.filter((task) => task.done);
  const ahead = tasks.filter((task) => !task.done && task.due > day).sort((a, b) => a.due.localeCompare(b.due));
  const days = Array.from({ length: 7 }, (_, index) => ({ day: addDays(day, index + 1), tasks: [] as Task[] }));
  const byDay = new Map(days.map((entry) => [entry.day, entry.tasks]));
  for (const task of ahead) byDay.get(task.due)?.push(task);
  let lateCount = 0;
  const spread = new Set<string>();
  for (const task of open) { if (task.due < day) lateCount++; spread.add(task.domain); }
  return { open, done, ahead, days, lateCount, spread: spread.size,
    garden: [...inPlay].sort((a, b) => Number(b.done) - Number(a.done) || a.due.localeCompare(b.due)),
    week: days.reduce((sum, entry) => sum + entry.tasks.length, 0), busiest: Math.max(...days.map((entry) => entry.tasks.length)) };
}

/** Your starred task, if you starred it today and it's still open. */
export const todayFocusOf = (open: Task[], picked: Session["todayFocus"], day: string) =>
  picked?.day === day ? open.find((task) => task.id === picked.id) : undefined;

/** Every live page: each domain, then its projects. */
export const pagePlacesOf = (shown: ShownDomain[]): PagePlace[] => shown.flatMap((domain) => [
  { place: domainKey(domain.name), open: domainKey(domain.name), label: domain.name, hue: domain.hue },
  ...domain.projects.map((project) => ({ place: project.id, open: tabKey({ kind: "project", id: project.id }), label: project.title, hue: projectInk(project) })),
]);

/** Every block shown on those pages, with its place. */
export function pageBlocksOf(places: PagePlace[], domains: Domain[], projects: Project[]): PlacedBlock[] {
  const pages = { domains, projects };
  return places.flatMap((at) => shownBlocks(workspace.pageOf(pages, at.place) ?? []).map((block) => ({ ...at, block })));
}

/** Every habit block as a ritual: its days, whether today is done and its streak, and the last seven days. */
export function todayRitualsOf(blocks: PlacedBlock[], day: string): TodayRituals {
  let finished = 0;
  const items = blocks.filter(({ block }) => block.type === "habit").map((at) => {
    const days = new Set(at.block.days ?? []);
    const done = days.has(day);
    if (done) finished++;
    return { ...at, days, done, streak: habitStreak(days, day).streak };
  });
  return { items, done: finished, remaining: items.length - finished, week: Array.from({ length: 7 }, (_, index) => addDays(day, index - 6)) };
}

/** People's dates in the coming year (D71), each from the same day a year before. */
export const peopleHorizonOf = (topics: Topic[], day: string): HorizonDate[] => peopleOf(topics).flatMap((person) =>
  datesAhead(person.person, day).map((next) => ({ key: `person:${person.id}/${next.date.id}`, title: `${person.name}'s ${next.date.label.toLocaleLowerCase()}`,
    date: next.day, since: addDays(next.day, -365), open: "library", label: person.person.relation || "People", hue: person.person.hue,
    person: person.id })));

/**
 * The next five dated things: countdowns still ahead, each milestones block's next open step, and people's dates; a
 * person's date a page already counts down to (same day, same title) shows once, as the page's.
 */
export function todayHorizonOf(blocks: PlacedBlock[], day: string, people: HorizonDate[] = []): HorizonDate[] {
  const paged = blocks.flatMap(({ block, open, label, hue }) =>
    block.type === "countdown" && block.date && block.date >= day
      ? [{ key: `${open}/${block.id}`, title: block.title || "Countdown", date: block.date, since: block.since, open, label, hue }]
      : block.type === "milestones" ? (block.steps ?? []).flatMap((step, index, steps) => !step.done && step.date >= day
        ? [{ key: `${open}/${block.id}/${step.title}`, title: step.title, date: step.date, since: steps[index - 1]?.date, open, label, hue }] : []).slice(0, 1)
      : []);
  const same = (a: HorizonDate, b: HorizonDate) => a.date === b.date && a.title.toLocaleLowerCase() === b.title.toLocaleLowerCase();
  return [...paged, ...people.filter((date) => !paged.some((page) => same(page, date)))].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
}

/** Questions routines left for your OK, with who asks and who's asked; one whose agents are gone drops out. */
export const todayAsksOf = (threads: Thread[], agents: Agent[]): TodayAsk[] => pendingAsks(threads).filter(({ message }) => message.routine)
  .flatMap(({ thread, message }) => {
    const from = agents.find((agent) => agent.id === (message.agentId ?? atlasId)), to = agents.find((agent) => agent.id === message.ask!.to);
    return from && to ? [{ thread, from, to }] : [];
  });
