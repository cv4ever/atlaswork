// The countdown block: time gone against work done, toward a date (D38, D39).
import { useEffect, useRef, useState } from "react";
import { PartyPopper } from "lucide-react";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { addDays, formatDate } from "../dates.ts";
import type { Pace } from "../pace.ts";
import { noon, Heading, between, shortWeekday, percent, short, weekday, plural } from "./parts.tsx";

/** Days of the given weekdays (0 Sunday … 6 Saturday) after `from`, up to and including `to`. */
const countDays = (from: string, to: string, weekdays: number[]) => {
  let count = 0;
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) if (weekdays.includes(new Date(noon(day)).getDay())) count++;
  return count;
};

/** On a project page, `pace` is the page's Pace: its finish line compares time gone with steps done. */
export function Countdown({ block, today, onChange, pace }: { block: Block; today: string; onChange: (block: Block) => void; pace?: Pace }) {
  const view = viewOf(block);
  const onView = (view: string) => onChange({ ...block, view });
  // The card's moment (the beat near the day, the popper on the day) plays once, when the card first comes into view.
  const card = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = card.current;
    if (seen || !element || typeof IntersectionObserver !== "function") return;
    const watch = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setSeen(true); watch.disconnect(); } }, { threshold: 0.5 });
    watch.observe(element);
    return () => watch.disconnect();
  }, [seen, block.date]);
  // No date yet (a starter project whose question was about a number, or a fresh block): ask for it right here, with
  // the usual horizons one tap away, each showing the exact day it lands on.
  const setDate = (date: string) => onChange({ ...block, date, since: block.since ?? today });
  if (!block.date) return (
    <section className="widget data-widget countdown-widget">
      <Heading block={block} onView={onView} />
      <label className="inline-date">When?<input type="date" min={today} onChange={(event) => event.target.value && setDate(event.target.value)} /></label>
      <div className="date-picks" role="group" aria-label="Common horizons">
        {([["2 weeks", 14], ["1 month", 30], ["3 months", 91]] as const).map(([label, days]) => (
          <button key={label} className="date-pick" onClick={() => setDate(addDays(today, days))}><strong>{label}</strong>
            <small>{formatDate(new Date(noon(addDays(today, days))), { weekday: "short", day: "numeric", month: "short" })}</small></button>
        ))}
      </div>
    </section>
  );
  const left = between(today, block.date);
  const ahead = Math.abs(left);
  // Progress through the wait, when we know when it began.
  const total = block.since ? between(block.since, block.date) : 0;
  // Past six weeks the calendar counts weeks, so a long wait stays a strip instead of a wall of days.
  const byWeek = total > 42;
  const behind = total > 0 ? Math.min(Math.max(between(block.since!, today), 0), total) : 0;
  const share = total > 0 ? behind / total : 0;
  const finish = pace?.finish?.id === block.id ? pace : undefined;
  const steps = finish && finish.total > 0 ? finish.done / finish.total : undefined;
  const isBehind = !!finish?.behind;
  // How many steps the clock is ahead of the work: the share of time gone, applied to the steps.
  const short_ = finish && steps !== undefined ? Math.max(Math.ceil(share * finish.total) - finish.done, 0) : 0;
  const figure = left === 0 ? <p className="countdown-figure big"><strong>Today</strong><PartyPopper className="countdown-party" size={30} aria-hidden="true" /></p>
    : <p className="countdown-figure big"><strong>{ahead}</strong><span>{ahead === 1 ? "day" : "days"} {left > 0 ? "to go" : "ago"}{view === "pace" && ` · ${shortWeekday(block.date)}`}</span></p>;
  const verdict = steps === undefined ? <>{percent(share)} of the wait is behind you, since {short(block.since!)}</>
    : isBehind ? <>Steps are <strong>{short_} behind</strong> the clock. Finish {short_ === 1 ? "one" : short_} this week to be on track.</>
    : steps >= share || steps >= 1 ? <>{percent(share)} of the time gone, <strong>{percent(steps)} of the steps</strong> done. On track.</>
    : <>{percent(share)} of the time gone, <strong>{percent(steps)} of the steps</strong> done.</>;
  return (
    <section ref={card} className={`widget data-widget countdown-widget view-${view}`} data-soon={left >= 0 && left <= 7 || undefined} data-seen={seen || undefined}>
      <Heading block={block} onView={onView} detail={view === "pace" ? isBehind ? <span className="stage-chip" data-behind>Behind</span> : undefined : <time dateTime={block.date}>{weekday(block.date)}</time>} />
      {view === "arc" ? (
        <div className="arc-wrap">
          <svg className="countdown-arc" viewBox="0 0 180 100" aria-hidden="true">
            <path className="arc-rail" d="M 10 90 A 80 80 0 0 1 170 90" />
            <path className="arc-gone" d="M 10 90 A 80 80 0 0 1 170 90" pathLength={100} strokeDasharray={`${share * 100} 100`} />
            <circle className="arc-sun" r="7" cx={90 - 80 * Math.cos(Math.PI * share)} cy={90 - 80 * Math.sin(Math.PI * share)} />
          </svg>
          <div className="arc-figure">{left === 0 ? <strong>Today</strong> : <><strong>{ahead}</strong><small>{ahead === 1 ? "day" : "days"} {left > 0 ? "to go" : "ago"}</small></>}</div>
        </div>
      ) : figure}
      {view === "calendar" && total > 0 && left > 0 && (() => {
        const count = byWeek ? Math.ceil(total / 7) : total;
        const gone = byWeek ? Math.floor(behind / 7) : behind;
        return <div className="day-grid" data-weeks={byWeek || undefined} role="img" aria-label={`${byWeek ? "Week" : "Day"} ${gone + 1} of ${count}`}>
          {Array.from({ length: count }, (_, index) => (
            <i key={index} data-gone={index < gone || undefined} data-today={index === gone || undefined} data-end={index === count - 1 || undefined} />
          ))}
        </div>;
      })()}
      {view === "pace" && total > 0 && left > 0 && (
        <div className="twin-bars">
          <div><span>Time gone</span><div className="progress-track" aria-hidden="true"><span style={{ transform: `scaleX(${share})` }} /></div><b>{percent(share)}</b></div>
          {steps !== undefined && <div><span>Steps done</span><div className="progress-track steps" aria-hidden="true"><span style={{ transform: `scaleX(${steps})` }} /></div><b>{percent(steps)}</b></div>}
        </div>
      )}
      {left > 0 && (
        <p className="widget-caption" data-behind={view === "pace" && isBehind || undefined}>
          {view === "calendar" ? total > 0 ? <>{byWeek ? "Week" : "Day"} <strong>{(byWeek ? Math.floor(behind / 7) : behind) + 1} of {byWeek ? Math.ceil(total / 7) : total}</strong> · {plural(countDays(today, block.date, [6]), "weekend")} left</> : <>{plural(countDays(today, block.date, [6]), "weekend")} left</>
            : view === "arc" ? <>{block.since && <>Started {short(block.since)} · </>}<strong>{plural(countDays(today, block.date, [1, 2, 3, 4, 5]), "working day")}</strong> left</>
            : total > 0 ? verdict : <>{shortWeekday(block.date)}</>}
        </p>
      )}
    </section>
  );
}
