// The tracker block: a number logged over time, with its chart and best run.
import { useState } from "react";
import type { CSSProperties } from "react";
import { ArrowDown, ArrowUp, Check, TrendingDown, TrendingUp } from "lucide-react";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { short, number, weekday, Burst, stepOf, Heading, relativeDay, between, plural, Picks, median, titleOf, Stepper } from "./parts.tsx";

/** Values over time that stretch to the block. Each slot names its date and value; values that miss the target are muted. */
function Chart({ entries, target, bars, meets, unit }: {
  entries: { date: string; value: number }[]; target?: number; bars: boolean; meets: (value: number) => boolean; unit: string;
}) {
  const width = 320, height = 110, pad = 6;
  const values = entries.map((entry) => entry.value);
  const low = Math.min(...values, target ?? Infinity, bars ? 0 : Infinity), high = Math.max(...values, target ?? -Infinity);
  const y = (value: number) => height - pad - ((value - low) / (high - low || 1)) * (height - 2 * pad);
  const x = (index: number) => pad + (index * (width - 2 * pad)) / Math.max(entries.length - (bars ? 0 : 1), 1);
  const slot = (width - 2 * pad) / entries.length;
  const line = entries.map((entry, index) => `${x(index)},${y(entry.value)}`).join(" ");
  return (<>
    <svg className="tracker-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
      aria-label={entries.map((entry) => `${short(entry.date)}: ${number(entry.value)}${unit}`).join(", ")}>
      {bars
        ? entries.map((entry, index) => <rect key={entry.date} className="tracker-bar" data-miss={!meets(entry.value) || undefined}
            data-latest={index === entries.length - 1 || undefined}
            x={pad + index * slot + slot * 0.18} width={slot * 0.64} y={y(entry.value)} height={height - pad - y(entry.value)} />)
        : <>
            <polygon className="tracker-area" points={`${x(0)},${height - pad} ${line} ${x(entries.length - 1)},${height - pad}`} />
            <polyline className="tracker-line" points={line} />
          </>}
      {target !== undefined && <line className="tracker-target" x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} />}
      {entries.map((entry, index) => (
        <rect key={`hit-${entry.date}`} className="tracker-hit" x={pad + index * slot} width={slot} y={0} height={height}>
          <title>{`${weekday(entry.date)}: ${number(entry.value)}${unit}`}</title>
        </rect>
      ))}
    </svg>
    {entries.length > 1 && <div className="chart-dates" aria-hidden="true"><span>{short(entries[0].date)}</span><span>{short(entries.at(-1)!.date)}</span></div>}
  </>);
}

/** The longest run of values meeting the target, oldest first. */
const bestRun = (values: boolean[]) => values.reduce(([best, run], hit) => hit ? [Math.max(best, run + 1), run + 1] : [best, 0], [0, 0])[0];

export function Tracker({ block, today, onChange }: { block: Block; today: string; onChange: (block: Block) => void }) {
  const view = viewOf(block);
  const all = block.entries ?? [];
  const logged = all.find((entry) => entry.date === today);
  const last = all.at(-1);
  // Smart default: today's value if logged, else the last value, else the target.
  const [value, setValue] = useState(logged?.value ?? last?.value ?? block.target ?? 0);
  const [pops, setPops] = useState(0);
  const entries = all.slice(-12);
  const before = entries.at(-2);
  const unit = block.unit ? ` ${block.unit}` : "";
  const lower = block.better === "down";
  const meets = (amount: number) => block.target === undefined || (lower ? amount <= block.target : amount >= block.target);
  const recent = all.slice(-7);
  const average = recent.length ? recent.reduce((sum, entry) => sum + entry.value, 0) / recent.length : 0;
  const hits = recent.filter((entry) => meets(entry.value)).length;
  function log() {
    if (!Number.isFinite(value)) return;
    onChange({ ...block, entries: [...all.filter((entry) => entry.date !== today), { date: today, value }].sort((a, b) => a.date.localeCompare(b.date)) });
    if (meets(value) && block.target !== undefined) setPops(pops + 1);
  }
  const Trend = lower ? TrendingDown : TrendingUp;
  const logButton = (
    <button type="button" className="secondary-button log-button" onClick={log} disabled={!Number.isFinite(value) || logged?.value === value}>
      {logged ? logged.value === value ? <><Check size={14} />Logged today</> : "Update today" : <>Log {number(value)}{unit}</>}
      <Burst count={pops} />
    </button>
  );
  // The slider's rail: the logged range and the target, with room either side.
  const points = [...all.map((entry) => entry.value), ...(block.target === undefined ? [] : [block.target]), value].filter(Number.isFinite);
  const span = Math.max(Math.max(...points) - Math.min(...points), stepOf(value) * 8);
  const low = Math.min(...points) - span * 0.25, high = Math.max(...points) + span * 0.25;
  const at = (amount: number) => `${((amount - low) / (high - low)) * 100}%`;
  return (
    <section className={`widget data-widget tracker-widget view-${view}`}>
      <Heading block={block} onView={(view) => onChange({ ...block, view })}
        detail={block.target !== undefined ? <><Trend size={13} aria-hidden="true" /> {lower ? "under" : "at least"} {number(block.target)}{unit}</> : undefined} />
      {!entries.length ? <p className="empty-inline">Nothing logged yet. Your first value starts the chart.</p> : view === "latest" ? (
        <div className="tracker-latest">
          <p className="countdown-figure big"><strong>{number(last!.value)}</strong><span>{block.unit} · {relativeDay(between(today, last!.date))}</span></p>
          {(before || block.target !== undefined) && (() => {
            const change = before ? last!.value - before.value : 0;
            const good = change === 0 || (lower ? change < 0 : change > 0);
            const gap = block.target === undefined ? 0 : last!.value - block.target;
            return <p className={`tracker-delta ${good && meets(last!.value) ? "good" : "bad"}`}>
              {before && <>{change > 0 ? <ArrowUp size={12} role="img" aria-label="Up" /> : change < 0 ? <ArrowDown size={12} role="img" aria-label="Down" /> : "="} {number(Math.abs(change))}{unit} since {short(before.date)}</>}
              {block.target !== undefined && <>{before && " · "}{meets(last!.value) ? "on target" : <><strong>{number(Math.abs(gap))}{unit}</strong> {gap > 0 ? "over" : "under"} target</>}</>}
            </p>;
          })()}
          <Chart entries={entries} target={block.target} bars meets={meets} unit={unit} />
          <p className="widget-caption">
            {block.target !== undefined
              ? <><strong>{hits} of {recent.length}</strong> on target
                {recent.length > 2 && <> · best run {bestRun(recent.map((entry) => meets(entry.value)))}</>}</>
              : <>Average {number(average)}{unit} over the last {plural(recent.length, "entry", "entries")}</>}
          </p>
        </div>
      ) : <>
        <Chart entries={entries} target={block.target} bars={false} meets={meets} unit={unit} />
        <p className="widget-caption">
          {view === "slider" && all.length > 1 ? (() => {
            const change = last!.value - all[0].value, days = between(all[0].date, last!.date);
            return <><strong>{change > 0 ? <ArrowUp size={12} role="img" aria-label="Up" /> : change < 0 ? <ArrowDown size={12} role="img" aria-label="Down" /> : "="} {number(Math.abs(change))}{unit}</strong> in {days >= 14 ? plural(Math.round(days / 7), "week") : plural(days, "day")}
              {block.target !== undefined && <> · {meets(last!.value) ? "on target" : `${number(Math.abs(last!.value - block.target))}${unit} to target`}</>}</>;
          })() : <>Average {number(average)}{unit} over the last {plural(recent.length, "entry", "entries")}
            {block.target !== undefined && <> · <strong>{hits} of {recent.length}</strong> on target</>}</>}
        </p>
      </>}
      {view === "picks" && <Picks label="Usual values" unit={unit} value={value} onPick={setValue}
        picks={[[last?.value ?? NaN, "last time"], [median(recent.map((entry) => entry.value)), "your usual"], [block.target ?? NaN, "target"]]} />}
      {view === "slider" ? (
        <div className="widget-log">
          <div className="value-slider" style={{ "--at": at(value) } as CSSProperties}>
            <div className="value-rail" aria-hidden="true"><span /></div>
            {block.target !== undefined && <i className="value-mark target" style={{ "--x": at(block.target) } as CSSProperties}><small>target {number(block.target)}</small></i>}
            {last && <i className="value-mark" style={{ "--x": at(last.value) } as CSSProperties}><small>last {number(last.value)}</small></i>}
            <span className="value-knob" aria-hidden="true">{number(value)}</span>
            <input type="range" min={low} max={high} step={stepOf(value)} value={Number.isFinite(value) ? value : low} aria-label={`${titleOf(block)} for today, ${number(value)}${unit}`}
              onChange={(event) => setValue(Math.round(event.target.valueAsNumber * 100) / 100)} />
          </div>
          {logButton}
        </div>
      ) : (
        <div className="widget-log">
          <Stepper value={value} onChange={setValue} label={`${titleOf(block)} for today`} unit={block.unit} />
          {logButton}
        </div>
      )}
    </section>
  );
}
