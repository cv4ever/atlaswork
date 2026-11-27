// The tasks widget: the domain's tasks on its overview, else the open project's (or every live task on Today). Next up
// (the one thing to do now), By when (grouped Late to Someday, with the pace to the finish line), or the list with
// finished ones folded, its first one large or an add row that asks the day.
import type { ReactNode } from "react";
import { ChevronRight, CircleCheck, Plus } from "lucide-react";
import { useApp, useView } from "../appContext.ts";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { addDays } from "../dates.ts";
import type { Task } from "../model.ts";
import { domainKey } from "../place.ts";
import { Tip } from "../Popups.tsx";
import type { ShownDomain } from "../view.ts";
import * as workspace from "../workspace.ts";
import { BlockHeading } from "./BlockHeading.tsx";
import { byDue, daysTo, dueWords } from "./due.ts";
import { TaskAddRow, TaskRows } from "./TaskRows.tsx";

export function TasksWidget({ block, domain }: { block: Block; domain?: ShownDomain }) {
  const { actions } = useApp();
  const today = useView((view) => view.today);
  const domainTasks = useView((view) => view.visible.domainTasks);
  const projectTasks = useView((view) => view.projectTasks);
  const projectPace = useView((view) => view.projectPace);
  const screen = useView((view) => view.screen);
  const selectedDomain = useView((view) => view.session.domain);
  const tasks = domain ? domainTasks : projectTasks;
  const open = tasks.filter((task) => !task.done);
  const finished = tasks.length - open.length;
  const sorted = [...open].sort(byDue);
  const view = viewOf(block);
  const addTask = () => actions.newTask(domain ? undefined : screen.projectId);
  const add = <Tip label="Add task"><button className="icon-button heading-add" aria-label="Add task" onClick={addTask}><Plus size={16} /></button></Tip>;
  const title = domain ? `Tasks in ${domain.name}` : "Tasks";
  const finishDate = domain ? undefined : projectPace?.finish?.date;
  if (view === "next") {
    // The one thing to do now: overdue first, then the soonest due, then the oldest undated.
    const first = sorted[0];
    return (
      <section className="widget tasks-widget next-view" data-clear={!first || undefined}>
        <BlockHeading block={block} fallback="Next up" Icon={CircleCheck} action={<><span className="count-chip">{open.length} open</span>{add}</>} />
        {first ? <>
          <TaskRows tasks={[first]} limit={1} />
          <p className="widget-caption">{open.length > 1 ? `${open.length - 1} more after this` : "The last one open"}{finished ? ` · ${finished} done` : ""}</p>
        </> : <p className="next-clear">All clear{tasks.length ? `: ${finished} of ${tasks.length} done` : ""}.{" "}
          <button className="text-button" onClick={addTask}>Add the next step</button></p>}
      </section>
    );
  }
  if (view === "when") return <ByWhen block={block} title={title} tasks={tasks} sorted={sorted} today={today} finishDate={finishDate} add={add} />;
  // Open steps first (soonest due on top); finished ones fold behind their count, so the list shows what's left.
  const second = sorted[1];
  const home = domain ? domainKey(domain.name) : screen.projectId || domainKey(selectedDomain);
  return (
    <section className={`widget tasks-widget ${view}-view`}>
      <BlockHeading block={block} fallback={title} Icon={CircleCheck} action={<span>{finished} of {tasks.length} done</span>} />
      <div className="progress-track"><span style={{ transform: `scaleX(${tasks.length ? finished / tasks.length : 0})` }} /></div>
      <TaskRows tasks={sorted} limit={screen.projectPage || domain ? 8 : 5} large={view === "first"} />
      {view === "first" && second && <p className="widget-caption">Next after this: <strong>{second.title}</strong>{second.due && `, ${dueWords(second.due, today)}`}</p>}
      {finished > 0 && (
        <details className="task-fold">
          <summary><ChevronRight size={14} />{finished} done</summary>
          <TaskRows tasks={tasks.filter((task) => task.done)} limit={20} />
        </details>
      )}
      {view === "add"
        ? <TaskAddRow today={today} taken={new Set(open.map((task) => task.due))} finish={finishDate}
          onAdd={(text, due) => actions.apply((d) => workspace.createTask(d, { title: text, due }, home))} />
        : <button className="add-task" onClick={addTask}><Plus size={16} />Add task</button>}
    </section>
  );
}

/** By when: open tasks grouped Late, Today, This week, Later and Someday, and how the rest fits before the finish line. */
function ByWhen({ block, title, tasks, sorted, today, finishDate, add }: {
  block: Block; title: string; tasks: Task[]; sorted: Task[]; today: string; finishDate?: string; add: ReactNode;
}) {
  const weekEnd = addDays(today, 7);
  const open = sorted.length, finished = tasks.length - open;
  const late = sorted.filter((task) => task.due && task.due < today);
  const groups: [string, Task[]][] = [["Late", late], ["Today", sorted.filter((task) => task.due === today)],
    ["This week", sorted.filter((task) => task.due > today && task.due <= weekEnd)], ["Later", sorted.filter((task) => task.due > weekEnd)],
    ["Someday", sorted.filter((task) => !task.due)]];
  const daysLeft = finishDate ? daysTo(finishDate, today) : 0;
  const pace = open > 1 && daysLeft >= open && `: about one every ${Math.round(daysLeft / open)} days`;
  return (
    <section className="widget tasks-widget when-view">
      <BlockHeading block={block} fallback={title} Icon={CircleCheck}
        action={<>{late.length > 0 && <span className="count-chip" data-late>{late.length} late</span>}<span className="count-chip">{open} open</span>{add}</>} />
      {groups.filter(([, group]) => group.length).map(([label, group]) => (
        <div key={label} className="task-group" data-group={label}><h3>{label} <small>{group.length}</small></h3><TaskRows tasks={group} limit={6} /></div>
      ))}
      {!open && <p className="empty-inline">Nothing open. A little space for what's next.</p>}
      <p className="widget-caption">{finished} of {tasks.length} done{open > 0 && daysLeft > 0 && <>
        {" "}· <strong>{daysLeft} days</strong> to the finish line, {open} {open === 1 ? "step" : "steps"} left{pace}</>}</p>
    </section>
  );
}
