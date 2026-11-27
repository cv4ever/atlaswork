// The task rows every list draws: tick with a pop (confetti for the last one open), swipe on a phone, a star for
// Today's one thing, the due day in words; and the add row that asks the day.
import { useDeferredValue, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import { ArrowRight, Circle, CircleCheck, Plus, Sparkles, Star } from "lucide-react";
import * as crews from "../agents.ts";
import { useApp, useView } from "../appContext.ts";
import { atlasId } from "../model.ts";
import type { Task } from "../model.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { addDays, formatDate } from "../dates.ts";
import { Tip } from "../Popups.tsx";
import { useMentions } from "../MentionPicker.tsx";
import { dueDay } from "./due.ts";
import { DayTiles } from "../DayTiles.tsx";
import { Emblem } from "../Emblem.tsx";

/** Ticks a task off with a pop, and scatters confetti when it was the last one open in `tasks`. */
function celebrate(button: HTMLButtonElement, task: Task, tasks: Task[]) {
  if (task.done || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  button.animate(
    [
      { transform: "scale(0.78) rotate(-12deg)" },
      { transform: "scale(1.2) rotate(8deg)", offset: 0.45 },
      { transform: "scale(0.96) rotate(-3deg)", offset: 0.75 },
      { transform: "none" },
    ],
    { duration: 420, easing: "ease-out" },
  );
  // On Today a timed task's flower on the day line blooms once the tick has redrawn it.
  requestAnimationFrame(() => document.querySelector(`.day-pin[data-task="${task.id}"] .plant-flower`)?.animate(
    [{ scale: 0.15, rotate: "-50deg", opacity: 0.4 }, { scale: 1.12, rotate: "6deg", opacity: 1, offset: 0.6 }, { scale: 1, rotate: "0deg" }],
    { duration: 520, easing: "ease-out" },
  ));
  if (tasks.some((item) => item.id !== task.id && !item.done)) return;
  const origin = button.getBoundingClientRect();
  for (let i = 0; i < 12; i++) {
    const chip = document.createElement("span");
    chip.className = "completion-chip";
    chip.setAttribute("aria-hidden", "true");
    chip.style.left = `${origin.left + origin.width / 2}px`;
    chip.style.top = `${origin.top + origin.height / 2}px`;
    chip.style.background = `var(--${["sage", "clay", "ochre", "accent"][i % 4]})`;
    document.body.append(chip);
    const angle = (i / 12) * Math.PI * 2;
    const x = Math.cos(angle) * (32 + i % 3 * 10);
    const y = Math.sin(angle) * 32 - 20;
    const animation = chip.animate([
      { transform: "translate(-50%, -50%) scale(0.5)", opacity: 1 },
      { transform: `translate(${x}px, ${y}px) rotate(${i * 43}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x * 1.4}px, ${y + 32}px) rotate(${i * 70}deg) scale(0.5)`, opacity: 0 },
    ], { duration: 600, easing: "ease-out" });
    animation.onfinish = animation.oncancel = () => chip.remove();
  }
}

/** Rows a long list draws with its page; the rest follow in a background render (`TaskRows`). */
const firstRows = 20;

/**
 * Task rows; `large` sets the first row at 16px: the one to do next (D39 "First one large"). `showDomain` marks each row
 * with its domain (Today mixes them); `among` is the set whose last tick celebrates, `tasks` by default. `star` offers
 * a star on each open row (Today's one thing): shown on hover or focus, and always on the starred one. `timeOf` shows
 * where in the day a row sits (Today's parts, agents-design D75) in place of its due day. A new list longer
 * than `firstRows` paints its first rows at once and draws the rest just after, below the fold, so a page with dozens
 * of late tasks opens in one frame (DEVELOPMENT.md, "Speed check").
 */
export function TaskRows({ tasks, limit = 8, large = false, showDomain = false, among = tasks, star, timeOf }: {
  tasks: Task[]; limit?: number; large?: boolean; showDomain?: boolean; among?: Task[];
  star?: { id: string; onToggle: (task: Task) => void }; timeOf?: (task: Task) => string;
}) {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const domains = useView((view) => view.domains);
  const drawn = useDeferredValue(limit, Math.min(limit, firstRows));
  // The row a finger is swiping: only it carries the parts behind it, so a list at rest adds nothing to the page.
  const [swiping, setSwiping] = useState<string | null>(null);
  const swipe = useSwipe({
    onShow: setSwiping,
    onDone: (id, row) => {
      const task = tasks.find((item) => item.id === id);
      const button = row.querySelector<HTMLButtonElement>(".task-check");
      if (task && button && actions.toggleTask(task)) celebrate(button, task, among);
    },
  });
  return (
    <div className="task-list" {...swipe.handlers}>
      {tasks.slice(0, drawn).map((task, index) => (
        <div key={task.id} data-task={task.id} className={`task-row ${task.done ? "is-done" : ""}${large && !index ? " is-first" : ""}`}>
          {swiping === task.id && <span className="task-swipe-done" aria-hidden="true"><CircleCheck size={18} /></span>}
          <Tip label={task.done ? "Mark incomplete" : "Complete task"}><button className="task-check" aria-label={`${task.done ? "Mark incomplete" : "Complete"}: ${task.title}`}
          aria-pressed={task.done}
          onClick={(event) => {
            const button = event.currentTarget;
            for (const animation of button.getAnimations({ subtree: true })) animation.cancel();
            if (actions.toggleTask(task)) celebrate(button, task, among);
          }}>
            {task.done ? <CircleCheck size={18} /> : <Circle size={18} />}
          </button></Tip>
          <button className="task-title" onClick={() => actions.editTask(task)}>{task.title}</button>
          {star && !task.done && (
            <Tip label={star.id === task.id ? "Your one thing today. Press to unstar" : "Make this your one thing today"}><button className="task-star" aria-pressed={star.id === task.id} onClick={() => star.onToggle(task)} aria-label={`${star.id === task.id ? "Unstar" : "Star as your one thing today"}: ${task.title}`}>
            <Star size={16} />
                        </button></Tip>
          )}
          {/* Who added it, where it lives and when: beside the title on larger screens, a line under it on phones (D60). */}
          <span className="task-meta">
            {task.createdBy && (() => {
              const by = crews.agentById(data, task.agentId ?? atlasId);
              return (
                <span title={`Added by ${by?.name ?? "an agent"}`} className="task-agent-mark">
                  {by ? <img src={portraitSrc(by)} alt={`by ${by.name}`} /> : <Sparkles size={12} />}
                </span>
              );
            })()}
            {showDomain && (() => {
              const home = domains.find((item) => item.name === task.domain);
              return home && <span className="task-domain" title={home.name} style={{ "--hue": home.hue } as CSSProperties}>
                <span aria-hidden="true"><Emblem emoji={home.emoji} /></span><span className="sr-only task-domain-name">{home.name}</span></span>;
            })()}
            {timeOf ? <span className="task-when task-time">{timeOf(task)}</span> : task.due && (() => {
              const { when, late, soon } = dueDay(task.due, today);
              return <span className="task-when" data-late={late && !task.done || undefined} data-soon={soon && !task.done || undefined} title={formatDate(new Date(`${task.due}T12:00:00`), { dateStyle: "full" })}>{when}</span>;
            })()}
            {!timeOf && !task.due && !task.done && <button className="task-when task-when-ask" onClick={() => actions.editTask(task)}>When?</button>}
          </span>
          {swiping === task.id && !task.done && (
            // For fingers only: keyboard and screen readers reach the same through the row's own buttons.
            <span className="task-swipe-actions" aria-hidden="true">
              {star && <button type="button" tabIndex={-1} className="task-swipe-star" data-on={star.id === task.id || undefined}
                onClick={() => { swipe.close(); star.onToggle(task); }}><Star size={16} /><small>{star.id === task.id ? "Unstar" : "Star"}</small></button>}
              <button type="button" tabIndex={-1} onClick={() => { swipe.close(); actions.moveTaskTo(task, addDays(today, 1), "tomorrow"); }}>
                <ArrowRight size={16} /><small>Tomorrow</small></button>
            </span>
          )}
        </div>
      ))}
      {!tasks.length && <p className="empty-inline">Nothing here yet. A little space for what's next.</p>}
    </div>
  );
}

/**
 * Swiping task rows on a touch screen, handled once for the whole list: right ticks a row off, left uncovers Tomorrow
 * (and the star, where the list has one) behind it, and a tap anywhere else closes them. Mouse and pen leave the rows
 * alone, and a drag that starts vertical stays a scroll. The row moves by its `--swipe` property, set here directly,
 * so a finger's every move redraws one row and not the list.
 */
function useSwipe({ onShow, onDone }: { onShow: (id: string) => void; onDone: (id: string, row: HTMLElement) => void }) {
  const gesture = useRef<{ row: HTMLElement; id: string; x: number; y: number; base: number; dx: number; horizontal?: boolean } | null>(null);
  const open = useRef<HTMLElement | null>(null);
  const swiped = useRef(false);
  const place = (row: HTMLElement, dx: number) => row.style.setProperty("--swipe", `${dx}px`);
  const reveal = (row: HTMLElement) => row.querySelector<HTMLElement>(".task-swipe-actions")?.offsetWidth ?? 0;
  const close = () => { if (open.current) place(open.current, 0); open.current = null; };
  const settle = () => {
    const at = gesture.current;
    gesture.current = null;
    if (!at?.horizontal) return;
    delete at.row.dataset.swiping;
    // The click a swipe ends with follows at once; one that never comes mustn't swallow the next tap.
    swiped.current = true;
    setTimeout(() => { swiped.current = false; }, 400);
    const width = reveal(at.row);
    if (at.dx > 88) { place(at.row, 0); open.current = null; onDone(at.id, at.row); }
    else if (width && at.dx < -width / 2) { place(at.row, -width); open.current = at.row; }
    else { place(at.row, 0); open.current = null; }
  };
  return {
    close,
    handlers: {
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (event.pointerType !== "touch") return;
        const row = (event.target as Element).closest<HTMLElement>(".task-row[data-task]");
        if (!row) return;
        if (open.current && open.current !== row) close();
        gesture.current = { row, id: row.dataset.task!, x: event.clientX, y: event.clientY, base: open.current === row ? -reveal(row) : 0, dx: 0 };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const at = gesture.current;
        if (!at) return;
        const moved = event.clientX - at.x;
        if (at.horizontal === undefined) {
          if (Math.abs(moved) < 10 && Math.abs(event.clientY - at.y) < 10) return;
          at.horizontal = Math.abs(moved) > Math.abs(event.clientY - at.y);
          if (!at.horizontal) { gesture.current = null; return; }
          at.row.dataset.swiping = "";
          onShow(at.id);
        }
        at.dx = Math.max(-(reveal(at.row) || 128) - 24, Math.min(120, at.base + moved));
        place(at.row, at.dx);
      },
      onPointerUp: settle,
      onPointerCancel: settle,
      onClickCapture(event: MouseEvent<HTMLElement>) {
        // The click a swipe ends with, or a tap while a row's buttons show, only settles the rows.
        const behind = (event.target as Element).closest(".task-swipe-actions");
        if (swiped.current || (open.current && !behind)) {
          event.preventDefault();
          event.stopPropagation();
          if (!swiped.current) close();
        }
        swiped.current = false;
      },
    },
  };
}

/** The tasks block's "Add with a when" row (D39): a title and the day it lands on as the day tiles, the next free weekday preselected. */
export function TaskAddRow({ today, taken, finish, onAdd }: {
  today: string; taken: Set<string>; finish?: string; onAdd: (title: string, due: string) => unknown }) {
  const [title, setTitle] = useState("");
  const mention = useMentions<HTMLInputElement>(title, setTitle);
  let free = addDays(today, 1);
  while (taken.has(free) || [0, 6].includes(new Date(`${free}T12:00:00`).getDay())) free = addDays(free, 1);
  const [due, setDue] = useState(free);
  const submit = () => { if (title.trim() && onAdd(title.trim(), due) !== false) setTitle(""); };
  return (
    <form className="task-add-row" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <span className="mention-host">
        <input {...mention.field} value={title} maxLength={120} placeholder="Add a step" aria-label="Add a step" onChange={(event) => setTitle(event.target.value)} />
        {mention.list}
      </span>
      <DayTiles due={due} onDue={setDue} label="When" finish={finish && finish > today ? { day: finish, title: "this project" } : undefined} />
      <button type="submit" className="text-button" disabled={!title.trim()}><Plus size={14} />Add</button>
    </form>
  );
}
