// The day tiles (docs/page-design.md, "Task dialog"; Carlos's O1, 2026-11-22): every place a task gets a day answers
// with the same week of tiles, each saying how full that day already is, so nobody does the maths. The task dialog,
// Capture and the tasks widget's add row use it.
import { useState } from "react";
import { CalendarDays, CalendarOff, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useView } from "./appContext.ts";
import { addDays, daysBetween, formatDate } from "./dates.ts";
import { Tip } from "./Popups.tsx";
import { lengthOf, lineFrom } from "./today/day.ts";

const longDay = (day: string) => formatDate(new Date(`${day}T12:00:00`), { weekday: "short", day: "numeric", month: "short" });
const shortDate = (day: string) => formatDate(new Date(`${day}T12:00:00`), { day: "numeric", month: "short" });
/** The hours a day can be planned in, 07:00 to 22:00: a tile's bar is what's due there against them. */
const dayMinutes = 22 * 60 - lineFrom;
/** How far the tiles step ahead before Pick a date takes over. */
const weeksAhead = 5;

/** The week (0 is the one starting today) a day falls in, while it's within reach. */
const weekOf = (today: string, day: string) => {
  const ahead = day ? daysBetween(today, day) : 0;
  return ahead >= 0 && ahead < weeksAhead * 7 ? Math.floor(ahead / 7) : 0;
};

export function DayTiles({ due, onDue, label, someday, finish, exclude }: {
  /** The picked day, YYYY-MM-DD, or "" for Someday. */
  due: string;
  onDue: (day: string) => void;
  /** What the tiles answer, for screen readers ("Day", "Due"). */
  label: string;
  /** Offer a Someday tile (no day at all). */
  someday?: boolean;
  /** A project's finish line, offered beside Pick a date. */
  finish?: { day: string; title: string };
  /** The task being edited, left out of each day's load. */
  exclude?: string;
}) {
  const today = useView((view) => view.today);
  const tasks = useView((view) => view.data.tasks);
  // The week shown follows the picked day when it changes from outside (the title's words, Pick a date).
  const [shown, setShown] = useState({ week: weekOf(today, due), for: due });
  if (shown.for !== due) setShown({ week: weekOf(today, due), for: due });
  const week = shown.week;
  const first = addDays(today, week * 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(first, index));
  const elsewhere = !!due && !days.includes(due);
  const open = tasks.filter((task) => !task.done && task.id !== exclude);
  return (
    <div className="day-tiles">
      <div className="day-tiles-nav">
        {week > 0 && <button type="button" className="text-button" onClick={() => setShown({ week: week - 1, for: due })}><ChevronLeft size={14} aria-hidden="true" />Earlier</button>}
        <span>{shortDate(first)} to {shortDate(addDays(first, 6))}</span>
        {finish && <Tip label={`When ${finish.title} is done`}><button type="button" className="text-button" aria-pressed={due === finish.day} onClick={() => onDue(finish.day)}>
          <Flag size={14} aria-hidden="true" />Finish line, {longDay(finish.day)}</button></Tip>}
        <label className="text-button capture-pick-day" data-picked={elsewhere || undefined}>
          <CalendarDays size={14} aria-hidden="true" />{elsewhere ? longDay(due) : "Pick a date"}
          <input type="date" aria-label="Pick a date" min={today} value={elsewhere ? due : ""} onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => event.target.value && onDue(event.target.value)} />
        </label>
        {week < weeksAhead - 1 && <button type="button" className="text-button" onClick={() => setShown({ week: week + 1, for: due })}>Next week<ChevronRight size={14} aria-hidden="true" /></button>}
      </div>
      <div className="day-tiles-week" role="radiogroup" aria-label={label} data-someday={someday || undefined}>
        {days.map((day) => {
          const there = open.filter((task) => task.due === day);
          const planned = there.reduce((sum, task) => sum + lengthOf(task), 0);
          const hours = planned < 60 ? `${planned} min` : `${Math.floor(planned / 60)} h${planned % 60 ? ` ${planned % 60}` : ""}`;
          const words = `${longDay(day)}: ${there.length ? `${there.length} ${there.length === 1 ? "task" : "tasks"}, ${hours}` : "nothing due"}`;
          return (
            <Tip key={day} label={words}><button type="button" role="radio" className="day-tile" aria-checked={due === day} aria-label={words}
              data-weekend={[0, 6].includes(new Date(`${day}T12:00:00`).getDay()) || undefined} onClick={() => onDue(day)}>
              <small>{day === today ? "Today" : formatDate(new Date(`${day}T12:00:00`), { weekday: "short" })}</small>
              <strong>{Number(day.slice(8))}</strong>
              <span className="day-tile-load"><span style={{ width: `${Math.min(100, (planned / dayMinutes) * 100)}%` }} /></span>
            </button></Tip>
          );
        })}
        {someday && (
          <Tip label="Someday: no day yet, so it waits on its page, off Today"><button type="button" role="radio" className="day-tile day-tile-someday" aria-checked={!due}
            aria-label="Someday, no day yet" onClick={() => onDue("")}>
            <small>No day</small><strong><CalendarOff size={18} aria-hidden="true" /></strong><span className="day-tile-load" />
          </button></Tip>
        )}
      </div>
    </div>
  );
}
