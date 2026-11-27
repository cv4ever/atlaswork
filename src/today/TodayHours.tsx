// Today's hours (agents-design D75): the Anytime tray of tasks with no place in the day yet (and the rituals still to
// tick), then Morning, Afternoon and Evening with their tasks by time. A task moves by dragging it into a part, or from
// its chip's menu; from the evening the tray moves what's left to tomorrow.
import { useState } from "react";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, Clock, Moon, Plus, Sprout, Sun, Sunrise } from "lucide-react";
import { useApp, useView } from "../appContext.ts";
import { addDays, isClock } from "../dates.ts";
import type { Task } from "../model.ts";
import { useMentions } from "../MentionPicker.tsx";
import { dueDay } from "../pageGrid/due.ts";
import { TaskRows } from "../pageGrid/TaskRows.tsx";
import { domainKey } from "../place.ts";
import { Picker, Tip } from "../Popups.tsx";
import * as workspace from "../workspace.ts";
import { StartForm } from "./cards.tsx";
import type { PagePlace } from "./derive.ts";
import { clockOf, dayParts, minuteNow, partAt } from "./day.ts";
import type { DayPart } from "./day.ts";
import { Emblem } from "../Emblem.tsx";

const partIcons: Record<DayPart, ReactNode> = { morning: <Sunrise size={16} />, afternoon: <Sun size={16} />, evening: <Moon size={16} /> };
const dragType = "application/x-atlaswork-task";

/** A part of the day or a tray takes a dragged task; `at` is where it lands ("" for anytime). */
function useDrop(at: string) {
  const { actions } = useApp();
  const [over, setOver] = useState(false);
  const label = at ? dayParts.find((part) => part.part === at)?.label.toLowerCase() ?? at : "anytime";
  return {
    over,
    handlers: {
      onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes(dragType)) { event.preventDefault(); setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: (event: DragEvent) => {
        setOver(false);
        const id = event.dataTransfer.getData(dragType);
        if (id) actions.placeInDay([{ id, at }], at ? `Moved it to the ${label}.` : "Moved it to anytime today.");
      },
    },
  };
}

/** A task with no place in the day: tick it, open it, drag it into a part, or pick where it goes from its menu. */
function TrayChip({ task }: { task: Task }) {
  const { actions } = useApp();
  const today = useView((view) => view.today);
  const free = useView((view) => view.todayFree);
  const domain = useView((view) => view.domains.find((item) => item.name === task.domain));
  const late = task.due < today;
  const put = (at: string, words: string) => actions.placeInDay([{ id: task.id, at }], `Put “${task.title}” ${words}.`);
  return (
    <li className="tray-chip" draggable onDragStart={(event) => { event.dataTransfer.setData(dragType, task.id); event.dataTransfer.effectAllowed = "move"; }}
      style={{ "--hue": domain?.hue ?? "var(--accent)" } as CSSProperties}>
      <Tip label="Complete task"><button className="tray-tick" aria-label={`Complete: ${task.title}`} onClick={() => actions.toggleTask(task)} /></Tip>
      {domain && <span className="tray-emblem" aria-hidden="true"><Emblem emoji={domain.emoji} /></span>}
      <button className="tray-title" onClick={() => actions.editTask(task)}>{task.title}</button>
      {late && <span className="tray-late">{dueDay(task.due, today).when}</span>}
      <Picker className="tray-menu" label={`Where “${task.title}” goes today`} tip="Put it in your day"
        trigger={<button type="button" className="icon-button tray-place" aria-label={`Put “${task.title}” in your day`}><Clock size={16} /></button>}>
        <Menu.GroupLabel>Put it in your day</Menu.GroupLabel>
        {dayParts.map((part) => <Menu.Item key={part.part} onClick={() => put(part.part, `in the ${part.label.toLowerCase()}`)}>{part.label}</Menu.Item>)}
        {free.slice(0, 4).map((minute) => <Menu.Item key={minute} onClick={() => put(clockOf(minute), `at ${clockOf(minute)}`)}>At {clockOf(minute)}, free</Menu.Item>)}
        <Menu.Item onClick={() => actions.editTask(task)}>Another time…</Menu.Item>
      </Picker>
    </li>
  );
}

/** Rituals still to tick today, as seeds in the tray; ticking one marks today done on the block where it lives. */
function TrayRituals() {
  const { actions } = useApp();
  const today = useView((view) => view.today);
  const { items } = useView((view) => view.todayRituals);
  const [adding, setAdding] = useState(false);
  const start = (title: string, at: PagePlace) => {
    const added = !!actions.apply((d) => workspace.addBlock(d, at.place, { id: `habit-${crypto.randomUUID().slice(0, 8)}`, type: "habit", title, width: "half", days: [] }));
    if (added) { actions.toast(`“${title}” is on ${at.label}'s page. Tick it here each day.`); setAdding(false); }
    return added;
  };
  return (
    <div className="tray-rituals">
      <ul>
        {items.map(({ block, place, label, hue, days, done, streak }) => {
          const title = block.title || "Habit";
          return (
            <li key={`${place}/${block.id}`} style={{ "--hue": hue } as CSSProperties}>
              <Tip label={`${label}${streak ? `, ${streak}-day streak` : ""}. ${done ? "Done today, press to undo" : "Press to mark today done"}`}>
                <button className="ritual-tick" aria-pressed={done} aria-label={`${done ? "Undo today" : "Mark today done"}: ${title}`} onClick={(event) => {
                  const button = event.currentTarget;
                  const nextDays = done ? [...days].filter((day) => day !== today) : [...days, today].sort();
                  if (!actions.apply((d) => workspace.editBlock(d, place, { ...block, days: nextDays }))) return;
                  if (!done && !matchMedia("(prefers-reduced-motion: reduce)").matches)
                    button.animate([{ scale: 0.7, rotate: "-14deg" }, { scale: 1.18, rotate: "8deg", offset: 0.5 }, { scale: 1, rotate: "0deg" }], { duration: 420, easing: "ease-out" });
                }}>{done ? <Check size={14} /> : <Sprout size={14} />}</button>
              </Tip>
              <span>{title}</span>
            </li>
          );
        })}
        <li><Tip label="Start a ritual"><button className="icon-button" aria-label="Start a ritual" aria-expanded={adding} onClick={() => setAdding(!adding)}><Plus size={16} /></button></Tip></li>
      </ul>
      {adding && <StartForm dated={false} label="Name a ritual" onAdd={start} onCancel={() => setAdding(false)} />}
    </div>
  );
}

/** The tray: what's in play today with no place in the day yet, the rituals, how many got done, and a field to add one more. */
export function TodayTray() {
  const { actions } = useApp();
  const today = useView((view) => view.today);
  const evening = useView((view) => view.evening);
  const { anytime, doneAnytime } = useView((view) => view.todayDay);
  const open = useView((view) => view.todayTasks.open);
  const domain = useView((view) => view.session.domain);
  const home = useView((view) => view.domains.find((item) => item.name === domain));
  const rituals = useView((view) => !view.session.todayHidden.includes("rituals"));
  const [title, setTitle] = useState("");
  const mention = useMentions<HTMLInputElement>(title, setTitle);
  const drop = useDrop("");
  const late = anytime.filter((task) => task.due < today);
  const tomorrow = addDays(today, 1);
  const move = (tasks: Task[], day: string, words: string) => {
    if (actions.apply((d) => workspace.moveTasksToDay(d, tasks.map((task) => task.id), day)))
      actions.toast(`Moved ${tasks.length === 1 ? "it" : `${tasks.length} tasks`} to ${words}.`);
  };
  const add = () => {
    if (!title.trim()) return;
    if (actions.apply((d) => workspace.createTask(d, { title: title.trim(), due: evening ? tomorrow : today }, domainKey(domain)))) setTitle("");
  };
  return (
    <section className="day-tray" data-over={drop.over || undefined} aria-label={evening ? "Still open today" : "Anytime today"} {...drop.handlers}>
      <div className="day-tray-head">
        <h2>{evening ? "Still open" : "Anytime today"}</h2>
        {!evening && anytime.length > 0 && <small>Drag one into a part of the day</small>}
        {evening && open.length > 0 && <button className="quiet-button" onClick={() => move(open, tomorrow, "tomorrow")}>Move what's left to tomorrow</button>}
        {!evening && late.length > 0 && <button className="quiet-button" onClick={() => move(late, today, "today")}>Move the late ones to today</button>}
      </div>
      {anytime.length > 0 ? <ul className="tray-chips">{anytime.map((task) => <TrayChip key={task.id} task={task} />)}</ul>
        : <p className="empty-inline">{open.length ? "Everything has its place in the day." : "Nothing waiting. Add one below or let a quiet day be."}</p>}
      {rituals && <TrayRituals />}
      <form className="day-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
        <Plus size={16} aria-hidden="true" />
        <span className="mention-host">
          <input {...mention.field} value={title} maxLength={120} placeholder={evening ? "Add something for tomorrow" : "Add something for today"}
            aria-label={evening ? "Add a task for tomorrow" : "Add a task for today"} onChange={(event) => setTitle(event.target.value)} />
          {mention.list}
        </span>
        {home && <span className="day-add-home" title={`Saved to ${home.name}`} style={{ "--hue": home.hue } as CSSProperties}><span aria-hidden="true"><Emblem emoji={home.emoji} /></span>{home.name}</span>}
        <button type="submit" className="secondary-button" disabled={!title.trim()}>Add</button>
      </form>
      {doneAnytime.length > 0 && <p className="tray-done"><Check size={14} aria-hidden="true" />{doneAnytime.length} more done today</p>}
    </section>
  );
}

/** One part of the day: its tasks by time, the one you're in lit, the ones behind you quieter; drop a task here to move it. */
function DayPartColumn({ part, label, from, to }: (typeof dayParts)[number]) {
  const { actions } = useApp();
  const tasks = useView((view) => view.todayDay.parts[part]);
  const today = useView((view) => view.today);
  const focus = useView((view) => view.todayFocus);
  const minute = minuteNow(useView((view) => view.now));
  const drop = useDrop(part);
  const now = partAt(minute) === part;
  const past = minute >= to;
  const open = tasks.filter((task) => !task.done).length;
  const star = { id: focus?.id ?? "", onToggle: (task: Task) => void actions.updateSession({ todayFocus: focus?.id === task.id ? null : { id: task.id, day: today } }) };
  return (
    <section className="day-part" data-now={now || undefined} data-past={past || undefined} data-open={open > 0 || undefined} data-over={drop.over || undefined}
      aria-label={label} {...drop.handlers}>
      <h2>{partIcons[part]}{label}
        <small>{past ? (open ? `${open} still open` : `${tasks.length} done`) : now ? `now${to < 24 * 60 ? `, until ${clockOf(to)}` : ""}` : open ? `${open} to go` : `from ${clockOf(from)}`}</small></h2>
      {tasks.length ? <TaskRows tasks={tasks} limit={20} showDomain star={star} timeOf={(task) => isClock(task.at) && task.due === today ? task.at : ""} />
        : <p className="empty-inline">{past ? "Nothing was placed here." : "Nothing placed yet. Drag a task here."}</p>}
    </section>
  );
}

export function TodayParts() {
  return <div className="day-parts">{dayParts.map((part) => <DayPartColumn key={part.part} {...part} />)}</div>;
}
