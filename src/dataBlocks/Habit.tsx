// The habit block: days done, the streak, and the sprout that grows with it.
import { useState } from "react";
import type { CSSProperties } from "react";
import { Check, Flame } from "lucide-react";
import { habitStreak, viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { addDays, formatDate } from "../dates.ts";
import { noon, Burst, Heading, weekday, percent } from "./parts.tsx";

export function Habit({ block, today, onChange }: { block: Block; today: string; onChange: (block: Block) => void }) {
  const view = viewOf(block);
  const done = new Set(block.days ?? []);
  const [pops, setPops] = useState(0);
  const toggle = (day: string) => {
    if (!done.has(day) && day === today) setPops(pops + 1);
    onChange({ ...block, days: done.has(day) ? [...done].filter((item) => item !== day) : [...done, day].sort() });
  };
  const { streak, atRisk } = habitStreak(done, today);
  const monday = addDays(today, -((new Date(noon(today)).getDay() + 6) % 7));
  const month = view === "month";
  const days = month ? Array.from({ length: 28 }, (_, index) => addDays(monday, index - 21)) : Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const past = days.filter((day) => day <= today);
  const count = past.filter((day) => done.has(day)).length;
  const inWeek = (start: string) => Array.from({ length: 7 }, (_, index) => addDays(start, index)).filter((day) => done.has(day)).length;
  // The four weeks before the grid, for the comparison; past weeks of the whole record, for the best.
  const previous = Array.from({ length: 28 }, (_, index) => addDays(monday, index - 49)).filter((day) => done.has(day)).length;
  // Compared only when the habit was kept before the grid began; shares, since the grid's past days and the four weeks differ.
  const keptBefore = [...done].some((day) => day < addDays(monday, -21));
  const share = count / Math.max(past.length, 1), before = previous / 28;
  const best = Math.max(count, ...[...done].map((day) => inWeek(addDays(day, -((new Date(noon(day)).getDay() + 6) % 7)))));
  const todayButton = (
    <button type="button" className={`secondary-button habit-today${done.has(today) ? " is-done" : ""}`} aria-pressed={done.has(today)} onClick={() => toggle(today)}>
      {done.has(today) ? <><Check size={14} />Done today</> : "Mark today done"}
      <Burst count={pops} />
    </button>
  );
  const streakTitle = atRisk ? `${streak}-day streak. Yesterday was missed: tick today to keep it` : `${streak}-day streak; one missed day keeps it, two end it`;
  const streakDetail = streak > 1 ? <span className="streak" data-at-risk={atRisk || undefined} title={streakTitle}><Flame size={12} aria-hidden="true" />{streak}{view === "today" ? "-day streak" : ""}</span> : undefined;
  const ring = 2 * Math.PI * 40, segment = ring / 7;
  return (
    <section className={`widget data-widget habit-widget view-${view}`}>
      <Heading block={block} onView={(view) => onChange({ ...block, view })} detail={view === "ring" ? <>{count} of 7</> : streakDetail} />
      {view === "ring" ? (
        <div className="habit-ring-wrap">
          <svg className="habit-ring" viewBox="0 0 100 100">
            {days.map((day, index) => (
              <circle key={day} className="habit-segment" cx="50" cy="50" r="40" pathLength={ring} strokeDasharray={`${segment - 3} ${ring}`} strokeDashoffset={-index * segment}
                data-done={done.has(day) || undefined} data-today={day === today || undefined} data-future={day > today || undefined}
                role="checkbox" aria-checked={done.has(day)} aria-disabled={day > today || undefined} tabIndex={day > today ? -1 : 0}
                aria-label={`${weekday(day)}: ${done.has(day) ? "done" : "not done"}`}
                onClick={() => day <= today && toggle(day)} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && day <= today) { event.preventDefault(); toggle(day); } }} />
            ))}
          </svg>
          <div className="habit-ring-center">{streak > 1 ? <><span className="streak" data-at-risk={atRisk || undefined} title={streakTitle}><Flame size={18} aria-hidden="true" />{streak}</span><small>day streak</small></> : <>{count}<small>of 7</small></>}</div>
        </div>
      ) : (<div className={month ? "habit-month" : undefined}>
        <div className="habit-days" data-month={month || undefined} data-hero={view === "today" || undefined}
          style={view === "today" ? { gridTemplateColumns: days.map((day) => day === today ? "2fr" : "minmax(0, 1fr)").join(" ") } : undefined}>
          {month && Array.from({ length: 7 }, (_, index) => <small key={index} className="habit-label" aria-hidden="true">
            {formatDate(new Date(noon(addDays(monday, index))), { weekday: "narrow" })}</small>)}
          {days.map((day) => (
            <button key={day} type="button" className="habit-day" aria-pressed={done.has(day)} disabled={day > today} data-today={day === today || undefined}
              aria-label={`${weekday(day)}: ${done.has(day) ? "done" : "not done"}`} onClick={() => toggle(day)}>
              {!month && <small>{formatDate(new Date(noon(day)), { weekday: view === "today" && day === today ? "long" : "short" })}</small>}
              {done.has(day) ? <Check size={month ? 12 : 16} strokeWidth={3} /> : view === "today" && day === today ? <small>tap when done</small> : null}
              {view === "today" && day === today && <Burst count={pops} />}
            </button>
          ))}
        </div>
        {month && <svg className="habit-sprout" viewBox="0 0 34 44" aria-hidden="true" style={{ "--grown": 0.3 + 0.7 * Math.min(streak, 10) / 10 } as CSSProperties}>
          <path d="M17 42 C 17 32, 17 24, 17 14" pathLength={1} />
          <ellipse cx="11" cy="26" rx="6" ry="3.5" transform="rotate(-30 11 26)" data-open={streak >= 3 || undefined} />
          <ellipse cx="23" cy="20" rx="6" ry="3.5" transform="rotate(30 23 20)" data-open={streak >= 6 || undefined} />
        </svg>}
      </div>)}
      <div className="habit-foot">
        <p className="widget-caption">
          {view === "ring" ? count === 7 ? <><strong>Ring closed.</strong> A full week.</> : <>{count} of 7 done{!done.has(today) && <> · <strong>tap today</strong> to close the ring</>}</>
            : month ? <><strong>{count} of {past.length}</strong> days · {percent(share)}{keptBefore && <>, {percent(share) === percent(before) ? "the same as" : share > before ? "up from" : "down from"} {percent(before)} the four weeks before</>}</>
            : <><strong>{count} of 7</strong> this week · last week {inWeek(addDays(monday, -7))} · best week {best}</>}
        </p>
        {view !== "today" && todayButton}
      </div>
    </section>
  );
}
