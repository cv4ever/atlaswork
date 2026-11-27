// Routines on screen: a list of what someone does on its own, a routine's detail (its head, the editor that asks what,
// how often and when, its last runs, Remove and Run now), the Routines page's week of runs, and a routine's last results.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronLeft, MessageCircle, MessagesSquare, Moon, Play, Sprout, Sun, Sunrise, Telescope, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { routineKinds } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { formatDate, formatNumber, weekdays } from "./dates.ts";
import type { Agent, Note, Routine, RoutineKind, RoutineResult, WorkspaceData } from "./model.ts";
import * as routines from "./routines.ts";
import type { RoutineOwner } from "./routines.ts";
import { Tip } from "./Popups.tsx";

export const routineIcons: Record<RoutineKind, LucideIcon> = { "check-in": Sunrise, report: MessagesSquare, review: Telescope, improve: Sprout };
const timeIcons: Record<string, LucideIcon> = { Morning: Sunrise, Midday: Sun, Evening: Moon };
const kinds = Object.keys(routineKinds) as RoutineKind[];
const everyDay = [0, 1, 2, 3, 4, 5, 6];
const workweek = [1, 2, 3, 4, 5];
const sameDays = (a: number[], b: number[]) => a.length === b.length && b.every((day) => a.includes(day));

/** The workspace, live notes, clock and owner; the Routine module derives the runner and readiness. */
export type RoutineScene = { data: WorkspaceData; notes: Note[]; now: Date; owner: RoutineOwner };

/**
 * A place's or agent's routines as rows, in the agent, domain and project dialogs. A row opens its detail in place of
 * the list (agents-design D70: the same detail the Routines page shows in its sheet), with a way back to all of them.
 * Adding one picks the usual answers for its kind and opens it.
 */
export function RoutineList({ scene, list, open, onOpen, onChange, onRunNow, canAdd = true }: {
  scene: RoutineScene;
  list: Routine[];
  open: string | null;
  onOpen: (id: string | null) => void;
  onChange: (list: Routine[]) => void;
  /** Runs one now, whatever its schedule; only where changes save right away. */
  onRunNow?: (routine: Routine) => void;
  /** Off where one shared "Add a routine" bar sits above many lists. */
  canAdd?: boolean;
}) {
  const set = (routine: Routine) => onChange(list.map((item) => item.id === routine.id ? routine : item));
  const runner = routines.runnerOf(scene.data, scene.owner);
  const opened = list.find((routine) => routine.id === open);
  if (opened) {
    const back = () => {
      onOpen(null);
      requestAnimationFrame(() => document.getElementById(`routine-summary-${opened.id}`)?.focus({ preventScroll: true }));
    };
    return (
      <div className="routine-list routine-drill">
        <button type="button" className="quiet-button routine-back" onClick={back}><ChevronLeft size={14} />{list.length === 1 ? "Back to the list" : `All ${list.length} routines`}</button>
        <RoutineDetail key={opened.id} scene={scene} routine={opened} onChange={set}
          onRemove={() => { onOpen(null); onChange(list.filter((item) => item.id !== opened.id)); }}
          onRunNow={onRunNow && (() => onRunNow(opened))} level={4} />
      </div>
    );
  }
  return (
    <div className="routine-list">
      {list.map((routine) => {
        const Icon = routineIcons[routine.kind];
        const { missing, enabled, due, manualDue } = routines.readinessOf(scene.data, { routine, owner: scene.owner }, scene.now);
        const next = enabled ? routines.nextDue(routine, scene.now)[0] : undefined;
        const name = routineKinds[routine.kind].label;
        return (
          <article key={routine.id} id={`routine-${routine.id}`} className={`routine-row ${routine.kind}`} data-paused={!enabled || undefined}>
            <div className="routine-head">
              <span className="routine-seal" aria-hidden="true"><Icon size={18} /></span>
              <button type="button" id={`routine-summary-${routine.id}`} className="routine-summary" onClick={() => onOpen(routine.id)}>
                <strong>{name}</strong>
                <span>{routines.repeatLabel(routine)}, {routines.timeLabel(routine.time)}</span>
              </button>
              <span className={`routine-next ${due ? "due" : ""}`}>
                {routine.paused ? "Paused" : missing.length ? "Needs a tool" : !enabled ? "Archived" : due ? "Due now" : next ? routines.whenLabel(next, scene.now) : "Never"}
              </span>
              <Tip label={routine.paused ? "Paused" : "On"}><label className="routine-switch">
                <input type="checkbox" role="switch" aria-label={`${name} on`} checked={!routine.paused}
                  onChange={(event) => set({ ...routine, paused: !event.target.checked || undefined })} />
                <span className="switch" aria-hidden="true" />
              </label></Tip>
              {onRunNow && (
                <Tip label="Run it now"><button type="button" className="icon-button" aria-label={`Run ${name.toLowerCase()} now`} disabled={!manualDue} onClick={() => onRunNow(routine)}><Play size={16} /></button></Tip>
              )}
            </div>
          </article>
        );
      })}
      {canAdd && <div className="routine-add" role="group" aria-label="Add a routine">
        <span>{list.length ? "Add another" : `Nothing scheduled yet. Give ${runner.name} a`}</span>
        {kinds.map((kind) => {
          const Icon = routineIcons[kind];
          return (
            <button key={kind} type="button" className={`routine-chip ${kind}`} onClick={() => {
              const routine = routines.newRoutine(kind, scene.now.toISOString());
              onChange([...list, routine]);
              onOpen(routine.id);
            }}><Icon size={14} />{routineKinds[kind].label}</button>
          );
        })}
      </div>}
    </div>
  );
}

/** The word beside the kind when a routine isn't simply on. */
export function routineState({ routine, missing, enabled, due }: { routine: Routine } & Pick<routines.Readiness, "missing" | "enabled" | "due">, failed: boolean): { word: string; tone?: string } | null {
  return routine.paused ? { word: "Off" } : missing.length ? { word: "Needs a tool", tone: "warn" } : !enabled ? { word: "Archived" }
    : due ? { word: "Due now", tone: "due" } : failed ? { word: "Failed", tone: "bad" } : null;
}

/** " for 🌿 Health", " for Studio relaunch", or `own` when it's the agent's own routine. */
export function whereLabel(data: WorkspaceData, owner: RoutineOwner, own: string) {
  if (owner.kind === "agent") return own;
  const place = routines.ownerOf(data, owner);
  return ` for ${place.domain && !place.project ? `${place.domain.emoji} ` : ""}${place.label}`;
}

/**
 * One routine in full (D70), in the Routines page's sheet and in place of a dialog's list: the runner's face (asleep
 * when it's off), the kind, a state word and the switch; the editor with what a run would do and the next runs first;
 * the last runs; then Remove, which asks twice, and Run now where changes save right away. Its title takes focus on
 * open, so the keyboard starts here.
 */
export function RoutineDetail({ scene, routine, onChange, onRemove, onRunNow, onChat, level = 2 }: {
  scene: RoutineScene;
  routine: Routine;
  onChange: (routine: Routine) => void;
  onRemove: () => void;
  onRunNow?: () => void;
  /** Opens the chat a posted run went to. */
  onChat?: () => void;
  /** Its title's heading level: 2 in the page's sheet, 4 under a dialog section's heading. */
  level?: 2 | 4;
}) {
  const portraitSrc = usePortraitSrc();
  const Title = level === 2 ? "h2" : "h4";
  const Section = level === 2 ? "h3" : "h5";
  const [armed, setArmed] = useState(false);
  const ready = routines.readinessOf(scene.data, { routine, owner: scene.owner }, scene.now);
  const results = routines.resultsOf(scene.data, routine.id);
  const state = routineState({ routine, ...ready }, results[0]?.outcome === "failed");
  const label = routineKinds[routine.kind].label;
  const Icon = routine.paused ? Moon : routineIcons[routine.kind];
  const posted = results.filter((result) => result.outcome === "posted").length;
  const titleId = `routine-title-${routine.id}`;
  useEffect(() => { document.getElementById(titleId)?.focus({ preventScroll: true }); }, [titleId]);
  return (
    <div className={`routine-detail ${routine.kind}`} data-off={!ready.enabled || undefined}>
      <div className="routine-detail-body">
        <header className="routine-detail-head">
          <span className="routine-face"><img src={portraitSrc(ready.runner)} alt="" /><span className="routine-face-kind" aria-hidden="true"><Icon size={14} /></span></span>
          <div>
            <Title id={titleId} className="routine-detail-title" tabIndex={-1}>{label}{state && <em data-tone={state.tone}>{state.word}</em>}</Title>
            <p>{ready.runner.name}{whereLabel(scene.data, scene.owner, ", wherever they look")}</p>
          </div>
          <label className="routine-switch routine-detail-switch">
            <input type="checkbox" role="switch" aria-label="Runs on schedule" checked={!routine.paused} onChange={(event) => onChange({ ...routine, paused: !event.target.checked || undefined })} />
            <span className="switch" aria-hidden="true" />
            <span aria-hidden="true">{routine.paused ? "Off" : "On"}</span>
          </label>
        </header>
        <RoutineEditor scene={scene} routine={routine} onChange={onChange} />
        <section className="routine-runs" aria-labelledby={`${titleId}-runs`}>
          <Section id={`${titleId}-runs`} className="routine-runs-title">Last runs{results.length > 0 && <small>{posted} of {results.length} had something for you</small>}</Section>
          {results.length ? (
            <ol>
              {results.map((result) => (
                <li key={result.id} data-outcome={result.outcome}>
                  <i aria-hidden="true" />
                  <span><strong>{routines.whenLabel(new Date(result.due), scene.now)}</strong><small>{resultWords[result.outcome]}{result.reason ? `: ${result.reason}` : ""}
                    {result.replies ? ` · ${result.replies} ${result.replies === 1 ? "reply" : "replies"}${result.tokens ? `, ${formatNumber(result.tokens, { notation: "compact" })} tokens` : ""}` : ""}</small></span>
                  {result.outcome === "posted" && onChat && <button type="button" className="quiet-button" onClick={onChat}><MessageCircle size={14} />Open chat</button>}
                </li>
              ))}
            </ol>
          ) : <p>No runs yet.{onRunNow && ready.manualDue ? " Run now starts the first one." : ""}</p>}
        </section>
      </div>
      <div className="routine-detail-foot">
        <Tip label={armed ? "Click again to remove it; its results go too" : "Remove this routine"}>
          <button type="button" className={armed ? "danger-button routine-remove" : "icon-button"} aria-label={armed ? "Remove it for good" : `Remove ${label.toLowerCase()}`}
            onClick={() => armed ? onRemove() : setArmed(true)} onBlur={() => setArmed(false)}>{armed ? "Remove?" : <Trash2 size={16} />}</button>
        </Tip>
        {onRunNow && <Tip label="Run it now, without changing its schedule"><button type="button" className="secondary-button" disabled={!ready.manualDue} onClick={onRunNow}><Play size={16} />Run now</button></Tip>}
      </div>
    </div>
  );
}

/** Three questions, each with the usual answer already picked, and what the answers mean: the next runs and what a run does. */
export function RoutineEditor({ scene, routine, onChange }: { scene: RoutineScene; routine: Routine; onChange: (routine: Routine) => void }) {
  const portraitSrc = usePortraitSrc();
  const set = (patch: Partial<Routine>) => onChange({ ...routine, ...patch });
  const { repeat } = routine;
  const cadence = repeat.every === "month" ? "month" : repeat.weeks === 1 && sameDays(repeat.days, everyDay) ? "day"
    : repeat.weeks === 1 && sameDays(repeat.days, workweek) ? "weekdays" : "week";
  const id = `routine-editor-${routine.id}`;
  const { runner, missing, enabled, manualDue } = routines.readinessOf(scene.data, { routine, owner: scene.owner }, scene.now);
  const upcoming = enabled ? routines.nextDue(routine, scene.now, 4) : [];
  // A run asks the model, so this says what the runner is asked to do rather than guessing its answer.
  const preview = missing.length ? `It needs ${missing.join(" and ")} before it can run.`
    : !manualDue ? "It isn't available to run at this time."
    : `${runner.name} ${routine.kind === "check-in" ? "reads the notes here and proposes new tasks, or stays quiet"
      : routine.kind === "report" ? "posts what's open and where to start"
      : routine.kind === "improve" ? "looks back at the week here and suggests up to three changes for you to pick from, or stays quiet"
      : `ticks off what the notes mark done, gives overdue tasks new days and archives projects untouched for ${routine.quietDays ?? 60} days, or stays quiet`}.`;
  const chip = (pressed: boolean, label: string, onClick: () => void, extra?: string) => (
    <button key={label} type="button" aria-pressed={pressed} aria-label={extra} onClick={onClick}>{label}</button>
  );
  return (
    <div className="routine-editor" id={id}>
      <fieldset className="routine-question">
        <legend><img src={portraitSrc(runner)} alt="" />What should {runner.name} do?</legend>
        <div className="routine-kinds">
          {kinds.map((kind) => {
            const Icon = routineIcons[kind];
            return (
              <label key={kind} className={`routine-kind ${kind}`}>
                <input type="radio" name={`${id}-kind`} checked={routine.kind === kind}
                  onChange={() => set({ kind, quietDays: kind === "review" ? routine.quietDays ?? 60 : undefined })} />
                <span><Icon size={18} /><strong>{routineKinds[kind].label}</strong><small>{routineKinds[kind].does}</small></span>
              </label>
            );
          })}
        </div>
        {missing.length > 0 && <small className="field-error">Paused until {runner.name} can use {missing.join(" and ")}. Switch {missing.length === 1 ? "it" : "them"} on in their Permissions.</small>}
      </fieldset>
      <fieldset className="routine-question">
        <legend>How often?</legend>
        <div className="segmented-control routine-cadence">
          {chip(cadence === "day", "Every day", () => set({ repeat: { every: "week", days: everyDay, weeks: 1 } }))}
          {chip(cadence === "weekdays", "Weekdays", () => set({ repeat: { every: "week", days: workweek, weeks: 1 } }))}
          {chip(cadence === "week", "Weekly", () => set({ repeat: { every: "week", days: [scene.now.getDay()], weeks: 1 } }))}
          {chip(cadence === "month", "Monthly", () => set({ repeat: { every: "month", day: 1 } }))}
        </div>
        {repeat.every === "week" && cadence === "week" && <>
          <div className="day-chips" role="group" aria-label="Days">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => chip(repeat.days.includes(day), weekdays[day].slice(0, 2), () => set({ repeat: { ...repeat,
              days: repeat.days.includes(day) ? repeat.days.filter((item) => item !== day) : [...repeat.days, day] } }), routines.longWeekdays[day]))}
          </div>
          <div className="day-chips" role="group" aria-label="Repeats">
            {[1, 2, 3, 4].map((weeks) => chip(repeat.weeks === weeks, weeks === 1 ? "Every week" : `Every ${weeks} weeks`, () => set({ repeat: { ...repeat, weeks } })))}
          </div>
          {!repeat.days.length && <small className="field-error">Pick at least one day, or it never runs.</small>}
        </>}
        {repeat.every === "month" && <>
          <div className="day-chips" role="group" aria-label="Monthly by">
            {chip("day" in repeat, "On a date", () => set({ repeat: { every: "month", day: 1 } }))}
            {chip(!("day" in repeat), "On a weekday", () => set({ repeat: { every: "month", week: 1, weekday: 1 } }))}
          </div>
          {"day" in repeat ? <>
            <div className="month-grid" role="group" aria-label="Day of the month">
              {Array.from({ length: 31 }, (_, index) => index + 1).map((day) =>
                chip(repeat.day === day, String(day), () => set({ repeat: { every: "month", day } }), `The ${day}`))}
              {chip(repeat.day < 0, "Last", () => set({ repeat: { every: "month", day: -1 } }), "The last day")}
            </div>
            {repeat.day > 28 && <small className="agent-hint">Shorter months use their last day.</small>}
          </> : <>
            <div className="day-chips" role="group" aria-label="Which one">
              {[1, 2, 3, 4, -1].map((week) => chip(repeat.week === week, week < 0 ? "Last" : routines.weekOrdinals[week - 1], () => set({ repeat: { ...repeat, week } })))}
            </div>
            <div className="day-chips" role="group" aria-label="Weekday">
              {[1, 2, 3, 4, 5, 6, 0].map((weekday) => chip(repeat.weekday === weekday, weekdays[weekday].slice(0, 2),
                () => set({ repeat: { ...repeat, weekday } }), routines.longWeekdays[weekday]))}
            </div>
          </>}
        </>}
      </fieldset>
      <fieldset className="routine-question">
        <legend>At what time?</legend>
        <div className="routine-times">
          {routines.dayparts.map(([label, time]) => {
            const Icon = timeIcons[label];
            return (
              <button key={label} type="button" className="routine-time" aria-pressed={routine.time === time} onClick={() => set({ time })}>
                <Icon size={16} /><span>{label}<small>{routines.timeLabel(time)}</small></span>
              </button>
            );
          })}
          <label className="routine-exact">Exact
            <input type="time" step={300} value={routine.time} onChange={(event) => event.target.value && set({ time: event.target.value })} />
          </label>
        </div>
      </fieldset>
      {routine.kind === "review" && (
        <fieldset className="routine-question">
          <legend>Archive projects quiet for</legend>
          <div className="segmented-control routine-cadence">
            {[30, 60, 90].map((days) => chip((routine.quietDays ?? 60) === days, `${days} days`, () => set({ quietDays: days })))}
          </div>
          <small className="agent-hint">Quiet means nothing new in its resources, and nothing open from today on.</small>
        </fieldset>
      )}
      <div className="routine-preview">
        {/* Weekend leaves are the week line's weekend paper, so a Saturday run reads as one at a glance. */}
        <div className="routine-leaves" aria-label="Next runs">
          {upcoming.length ? upcoming.map((due, index) => (
            <span key={due.toISOString()} className="routine-leaf" style={{ "--i": index } as CSSProperties} data-weekend={due.getDay() === 0 || due.getDay() === 6 || undefined}>
              <small>{formatDate(due, { month: "short" })}</small>
              <b>{due.getDate()}</b>
              <span>{formatDate(due, { weekday: "short" })}</span>
              <span>{routines.timeLabel(routine.time)}</span>
              {index === 0 && <em>{routines.fromNow(due, scene.now)}</em>}
            </span>
          )) : <p className="agent-hint">{routine.paused ? "Paused. Switch it on to see when it runs." : missing.length ? "It won't run until the tools are on." : "No runs ahead. Pick a day."}</p>}
        </div>
        <figure className="badge-speech routine-today">
          <figcaption>If it ran now</figcaption>
          <blockquote key={preview}>{preview}</blockquote>
        </figure>
      </div>
    </div>
  );
}

/** One run on the week line: whose routine, what it is, and when. */
export type WeekRun = { id: string; runner: Agent; what: string; due: Date };
/** A stack's width in pixels: up to three 22px faces overlapping by 10px, "+n" after them, and its padding and border. */
const stackWidth = (count: number) => 22 + 12 * (Math.min(count, 3) - 1) + (count > 3 ? 18 : 0) + 6;

/**
 * The next seven days as one line (agents-design D68, after Herdr's scheduled jobs panel): today starts at the left
 * with a mark for now, and each run sits at its time as its runner's face. A run whose face would overlap the stack
 * before it joins that stack (D70: measured on the drawn width, so stacks never cover each other at any width). A stack
 * picks the routines it holds (`onPin`), and again lets them go.
 */
export function RoutineWeek({ runs, now, pinned, onPin }: {
  runs: WeekRun[]; now: Date; pinned: number | null; onPin: (at: number | null, ids: string[]) => void }) {
  const portraitSrc = usePortraitSrc();
  const track = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (track.current) observer.observe(track.current);
    return () => observer.disconnect();
  }, []);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const span = 7 * 864e5;
  const share = (time: number) => Math.min(span, Math.max(0, time - start.getTime())) / span;
  const at = (date: Date) => `${share(date.getTime()) * 100}%`;
  const stacks: { at: number; runs: WeekRun[] }[] = [];
  for (const run of [...runs].sort((a, b) => a.due.getTime() - b.due.getTime())) {
    const last = stacks.at(-1);
    // A stack's left edge sits 14px before its time; 4px of air keeps two stacks apart.
    if (last && share(run.due.getTime()) * width < share(last.at) * width + stackWidth(last.runs.length) + 4) last.runs.push(run);
    else stacks.push({ at: run.due.getTime(), runs: [run] });
  }
  const days = Array.from({ length: 7 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index));
  return (
    <section className="routine-week" aria-label="The next seven days">
      <div className="routine-week-head"><strong>Next 7 days</strong><small>{runs.length} {runs.length === 1 ? "run" : "runs"}</small></div>
      <div className="routine-week-track" ref={track}>
        <ol className="routine-week-days">
          {days.map((day, index) => <li key={day.toISOString()} data-weekend={day.getDay() === 0 || day.getDay() === 6 || undefined}>
            {index === 0 ? "Today" : <><span className="routine-week-weekday">{weekdays[day.getDay()].slice(0, 3)} </span>{day.getDate()}</>}</li>)}
        </ol>
        <span className="routine-week-now" style={{ left: at(now) }} aria-hidden="true" />
        {stacks.map((stack) => {
          const on = pinned === stack.at;
          const label = `${stack.runs.map((run) => `${run.what}, ${routines.whenLabel(run.due, now)}`).join("; ")}. ${on ? "Show every routine again." : "Show only these."}`;
          return (
            <Tip key={stack.at} label={label}>
              <button type="button" className="routine-week-stack" style={{ left: at(new Date(stack.at)) }} aria-pressed={on} aria-label={label}
                onClick={() => onPin(on ? null : stack.at, stack.runs.map((run) => run.id))}>
                <span className="routine-week-faces">{stack.runs.slice(0, 3).map((run, index) => <img key={index} src={portraitSrc(run.runner)} alt="" />)}</span>
                {stack.runs.length > 3 && <small>+{stack.runs.length - 3}</small>}
              </button>
            </Tip>
          );
        })}
        {!stacks.length && <p className="routine-week-empty">Nothing runs in the next seven days.</p>}
      </div>
    </section>
  );
}

/** A result in words, for its tooltip and the run list. */
export const resultWords: Record<RoutineResult["outcome"], string> = {
  posted: "Had something for you", quiet: "Looked, nothing new", "no-news": "Skipped, nothing had changed", failed: "Couldn't run",
};
/** A routine's last five results as marks, oldest first: filled when it posted, hollow when quiet, a dash when skipped. */
export function ResultStrip({ results, now }: { results: RoutineResult[]; now: Date }) {
  const shown = results.slice(0, 5).reverse();
  const label = shown.length ? `Last ${shown.length === 1 ? "run" : `${shown.length} runs`}: ${shown.map((result) => `${routines.whenLabel(new Date(result.due), now)}, ${resultWords[result.outcome].toLocaleLowerCase()}`).join("; ")}` : "No runs yet";
  return (
    <Tip label={label}>
      <span className="routine-results" role="img" aria-label={label}>
        {Array.from({ length: 5 - shown.length }, (_, index) => <i key={`gap-${index}`} />)}
        {shown.map((result) => <i key={result.id} data-outcome={result.outcome} />)}
      </span>
    </Tip>
  );
}
