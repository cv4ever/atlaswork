// The milestones block: dated steps toward a goal, the next one as the figure.
import { Fragment, useState } from "react";
import type { CSSProperties } from "react";
import { Check, ChevronRight, Plus, X } from "lucide-react";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { addDays, formatDate } from "../dates.ts";
import { between, short, plural, relativeDay, Heading, weekday, nextWorkday, noon, titleOf, shortWeekday } from "./parts.tsx";

/** Dated steps to the finish line; tick a step as you pass it. */
export function Milestones({ block, today, onChange }: { block: Block; today: string; onChange: (block: Block) => void }) {
  const view = viewOf(block);
  const steps = block.steps ?? [];
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [picked, setPicked] = useState<"half" | "week" | "before" | "own">("half");
  const set = (next: typeof steps) => onChange({ ...block, steps: [...next].sort((a, b) => a.date.localeCompare(b.date)) });
  const next = steps.find((step) => !step.done);
  const late = steps.find((step) => !step.done && step.date < today);
  const last = steps.at(-1);
  // Where a new step lands: halfway from the next step (or today) to the finish, a week on, or the week before the finish.
  const from = next && next.date > today ? next.date : today;
  const guesses: Record<"half" | "week" | "before", string | undefined> = {
    half: last && last.date > from ? addDays(from, Math.round(between(from, last.date) / 2)) : undefined,
    week: addDays(last && last.date > today ? last.date : today, 7),
    before: last && between(today, last.date) > 7 ? addDays(last.date, -7) : undefined,
  };
  const available = (["half", "week", "before"] as const).filter((key) => guesses[key]);
  // The guess picked, or the first one that exists for this list (a list with no steps has no halfway).
  const chosen = picked === "own" ? "own" : guesses[picked] ? picked : available[0];
  const landing = view === "spaced" && chosen !== "own" ? guesses[chosen] : date;
  const add = () => { if (title.trim() && landing) { set([...steps, { title: title.trim(), date: landing, done: false }]); setTitle(""); setDate(""); } };
  const toggle = (index: number) => set(steps.map((item, at) => at !== index ? item : item.done
    ? { title: item.title, date: item.date, done: false } : { ...item, done: true, reached: today }));
  const todayAt = steps.findIndex((step) => step.date > today);
  const row = (step: (typeof steps)[number], index: number) => {
    const isLate = !step.done && step.date < today;
    return (
      <li key={`${step.date}-${index}`} data-done={step.done || undefined} data-late={isLate || undefined} data-next={step === next || undefined}>
        <time dateTime={step.date}>{short(step.date)}</time>
        <button type="button" className="milestone-dot" aria-pressed={step.done} aria-label={`${step.done ? "Reopen" : "Reached"}: ${step.title}`} onClick={() => toggle(index)}>{step.done && <Check size={12} strokeWidth={3} />}</button>
        <span><strong>{step.title}</strong>{!step.done && <small>{isLate ? `${plural(between(step.date, today), "day")} late` : relativeDay(between(today, step.date))}</small>}</span>
        <button type="button" className="icon-button checklist-remove" aria-label={`Remove ${step.title}`} onClick={() => set(steps.filter((_, at) => at !== index))}><X size={14} /></button>
      </li>
    );
  };
  const hero = late ?? next;
  const first = steps[0]?.date, stretch = first && last ? Math.max(between(first, last.date), 1) : 1;
  const place = (day: string) => `${Math.min(Math.max(between(first!, day) / stretch, 0), 1) * 100}%`;
  return (
    <section className={`widget data-widget milestones-widget view-${view}`}>
      <Heading block={block} onView={(view) => onChange({ ...block, view })}
        detail={steps.length ? <><strong>{steps.filter((step) => step.done).length} of {steps.length}</strong> reached</> : undefined} />
      {view === "road" && steps.length > 1 ? (
        <div className="milestone-road">
          <ol>{today >= first! && today <= last!.date && <li className="road-today" style={{ "--x": place(today) } as CSSProperties} aria-label="Today">Today</li>}{steps.map((step, index) => {
            const isLate = !step.done && step.date < today;
            // Five or more steps share the road: only the next step and the finish keep their words, the rest say theirs on hover.
            const quiet = steps.length > 4 && step !== next && step !== last;
            return <li key={`${step.date}-${index}`} style={{ "--x": place(step.date) } as CSSProperties} data-done={step.done || undefined} data-late={isLate || undefined} data-next={step === next || undefined}
              data-quiet={quiet || undefined} title={quiet ? `${step.title}, ${short(step.date)}` : undefined}>
              <button type="button" className="milestone-dot" aria-pressed={step.done} aria-label={`${step.done ? "Reopen" : "Reached"}: ${step.title}, ${weekday(step.date)}`} onClick={() => toggle(index)}>{step.done && <Check size={12} strokeWidth={3} />}</button>
              <b>{step.title}</b><small>{short(step.date)}{isLate && ` · ${plural(between(step.date, today), "day")} late`}</small>
            </li>;
          })}</ol>
        </div>
      ) : <>
        {view === "next" && hero && (
          <div className="milestone-hero" data-late={hero === late || undefined}>
            <small>{hero === late ? `Late by ${plural(between(hero.date, today), "day")}` : `Next · ${relativeDay(between(today, hero.date))}`}</small>
            <strong>{hero.title}</strong>
            <span>{hero === late ? "was due" : "due"} {weekday(hero.date)} · <button type="button" className="text-button" onClick={() => toggle(steps.indexOf(hero))}>Reached</button>
              {hero === late && <> · <button type="button" className="text-button" onClick={() => set(steps.map((step) => step === hero ? { ...step, date: nextWorkday(today) } : step))}>Move to {formatDate(new Date(noon(nextWorkday(today))), { weekday: "long" })}</button></>}</span>
          </div>
        )}
        {view === "next" ? (() => {
          // The next three steps after the hero; the rest wait behind "n later", the reached ones behind their count.
          const indexed = steps.map((step, index) => [step, index] as const);
          const ahead = indexed.filter(([step]) => step !== hero && !step.done);
          const reached = indexed.filter(([step]) => step.done);
          return <>
            <ol className="milestone-list">
              {ahead.slice(0, 3).map(([step, index]) => row(step, index))}
              {!steps.length && <li className="empty-inline">No steps yet. Add the dates that lead to the finish line.</li>}
            </ol>
            {ahead.length > 3 && <details className="task-fold"><summary><ChevronRight size={14} />{ahead.length - 3} later</summary>
              <ol className="milestone-list">{ahead.slice(3).map(([step, index]) => row(step, index))}</ol></details>}
            {reached.length > 0 && <details className="task-fold"><summary><ChevronRight size={14} />{reached.length} reached</summary>
              <ol className="milestone-list">{reached.map(([step, index]) => row(step, index))}</ol></details>}
          </>;
        })() : (
          <ol className="milestone-list" data-timeline>
            {steps.map((step, index) => <Fragment key={`${step.date}-${index}`}>
              {index === todayAt && <li className="milestone-today" aria-label="Today"><time dateTime={today}>{short(today)}</time><i /><span>Today</span></li>}
              {row(step, index)}
            </Fragment>)}
            {steps.length > 0 && todayAt === -1 && <li className="milestone-today" aria-label="Today"><time dateTime={today}>{short(today)}</time><i /><span>Today</span></li>}
            {!steps.length && <li className="empty-inline">No steps yet. Add the dates that lead to the finish line.</li>}
          </ol>
        )}
      </>}
      {view === "road" && steps.length > 1 && next && <p className="widget-caption"><strong>{plural(Math.max(between(today, next.date), 0), "day")}</strong> to the next step{last !== next && <>, then {plural(between(next.date, last!.date), "day")} to the finish</>}</p>}
      <form className="milestone-add" data-spaced={view === "spaced" || undefined} onSubmit={(event) => { event.preventDefault(); add(); }}>
        <input value={title} maxLength={80} placeholder={view === "spaced" && next && last && next !== last ? `A step between ${next.title} and ${last.title}` : "A step"} aria-label={`Add a step to ${titleOf(block)}`} onChange={(event) => setTitle(event.target.value)} />
        {view === "spaced" ? (
          <div className="date-picks" role="radiogroup" aria-label="When">
            {([["half", "Halfway"], ["week", "+1 week"], ["before", "Week before finish"]] as const).filter(([key]) => guesses[key]).map(([key, label]) => (
              <button key={key} type="button" className="date-pick" role="radio" aria-checked={chosen === key} onClick={() => setPicked(key)}><strong>{label}</strong><small>{shortWeekday(guesses[key]!)}</small></button>))}
            {chosen === "own" ? <input type="date" value={date} aria-label="When" ref={(input) => input?.focus()} onChange={(event) => setDate(event.target.value)} />
              : <button type="button" className="date-pick" role="radio" aria-checked={false} onClick={() => setPicked("own")}><strong>Pick a day</strong></button>}
          </div>
        ) : <input type="date" value={date} aria-label="When" onChange={(event) => setDate(event.target.value)} />}
        <button type="submit" className="text-button" disabled={!title.trim() || !landing}><Plus size={14} />Add</button>
      </form>
    </section>
  );
}
