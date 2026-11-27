// The goal block: an amount toward a target, with picks from its own history.
import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { PartyPopper, Plus, Undo2, X } from "lucide-react";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { addDays } from "../dates.ts";
import { between, median, number, short, plural, Heading, percent, Burst, Picks, titleOf, Stepper, relativeDay } from "./parts.tsx";

/**
 * Progress toward a target. The amounts offered come from history (last time, the usual, the step); each logged
 * contribution can be taken back (Undo on the newest, × on any in the path), and the slider corrects the total.
 */
export function Goal({ block, today, onChange }: { block: Block; today: string; onChange: (block: Block) => void }) {
  const view = viewOf(block);
  const target = block.target ?? 0;
  const [draft, setDraft] = useState<number | null>(null);
  const [pops, setPops] = useState(0);
  const [added, setAdded] = useState<number | null>(null);
  const current = draft ?? block.current ?? 0;
  const share = target ? Math.min(current / target, 1) : 0;
  const unit = block.unit ? ` ${block.unit}` : "";
  // A step a tenth of the target's scale: 100 € toward 6,000 €, 1 km toward 10 km.
  const step = 10 ** (Math.floor(Math.log10(target || 1)) - 1);
  const [amount, setAmount] = useState(step);
  const entries = block.entries ?? [];
  const reached = (value: number) => { if (value >= target && (block.current ?? 0) < target) setPops(pops + 1); };
  const save = (value: number) => {
    setDraft(null);
    if (value === block.current) return;
    reached(value);
    onChange({ ...block, current: value });
  };
  const contribute = (value = amount) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const next = Math.round(((block.current ?? 0) + value) * 100) / 100;
    reached(next);
    onChange({ ...block, current: next, entries: [...entries, { date: today, value }] });
    setAdded(entries.length);
  };
  /** Takes a logged contribution back out of the total; a mistaken or trial tap costs one more tap. */
  const remove = (index: number) => {
    const entry = entries[index];
    onChange({ ...block, current: Math.max(Math.round(((block.current ?? 0) - entry.value) * 100) / 100, 0),
      entries: entries.filter((_, at) => at !== index) });
    setAdded(null);
  };
  const path = entries.map((entry, index) => ({ ...entry, index })).slice(-4).reverse();
  // Pace: contributions a month since the first one, and where that lands.
  const months = entries.length ? Math.max(between(entries[0].date, today) / 30.4, 1) : 0;
  const rate = months ? entries.reduce((sum, entry) => sum + entry.value, 0) / months : 0;
  const remaining = Math.max(target - current, 0);
  const monthsLeft = rate > 0 ? remaining / rate : 0;
  const arrival = rate > 0 ? addDays(today, Math.round(monthsLeft * 30.4)) : undefined;
  const dueIn = block.date ? between(today, block.date) / 30.4 : undefined;
  const expected = block.date && block.since
    ? Math.min(Math.max(between(block.since, today) / Math.max(between(block.since, block.date), 1), 0), 1) : undefined;
  const nextFlag = [0.25, 0.5, 0.75, 1].map((mark) => mark * target).find((mark) => mark > current);
  const picks: [number, string][] = [
    [entries.at(-1)?.value ?? NaN, "last time"], [entries.length >= 3 ? median(entries.map((entry) => entry.value)) : NaN, "your usual"],
    ...view === "flags" && nextFlag ? [[Math.round((nextFlag - current) * 100) / 100, "to the next flag"] as [number, string]] : [],
    ...view === "pace" && dueIn && dueIn > 0 ? [[Math.ceil(remaining / dueIn / step) * step, "a month, to be on time"] as [number, string]] : [],
    ...entries.length < 3 && step !== amount ? [[step, "a step"] as [number, string]] : [],
  ];
  const numbers = (
    <p className="goal-numbers"><strong>{number(current)}</strong> of {number(target)}{unit}
      <small>{target > 0 && current >= target ? "Reached" : !target ? "Set a target in Customize" : view === "flags" && nextFlag ? `${number(nextFlag - current)}${unit} to the next flag · ${number(remaining)}${unit} to go`
        : view === "pace" ? rate > 0 ? <>At {number(rate)}{unit} a month you arrive <strong>{short(arrival!)}</strong>{dueIn !== undefined && <>, {Math.abs(Math.round(monthsLeft - dueIn)) < 1 ? "on time" : `${plural(Math.abs(Math.round(monthsLeft - dueIn)), "month")} ${monthsLeft > dueIn ? "late" : "early"}`}</>}</> : "Add the first amount to see your pace"
        : <>{number(remaining)}{unit} to go{rate > 0 && <> · {plural(Math.ceil(monthsLeft), "month")} at this rate</>}</>}</small></p>
  );
  return (
    <section className={`widget data-widget goal-widget view-${view}`} style={{ "--share": share } as CSSProperties} data-reached={share >= 1 || undefined}>
      <Heading block={block} onView={(view) => onChange({ ...block, view })} detail={view === "pace" && block.date ? `by ${short(block.date)}` : percent(share)} />
      {view === "pace" ? (
        <div className="goal-ring-wrap">
          <svg className="goal-ring" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="40" className="goal-track" />
            {expected !== undefined && <circle cx="50" cy="50" r="40" className="goal-expected" pathLength={100} strokeDasharray="1.2 100" strokeDashoffset={-expected * 100} />}
            <circle cx="50" cy="50" r="40" className="goal-fill" pathLength={100} strokeDasharray={`${share * 100} 100`} />
          </svg>
          <span className="goal-center">{share >= 1 ? <PartyPopper size={28} role="img" aria-label="Reached" /> : percent(share)}</span>
          <Burst count={pops} />
        </div>
      ) : view === "flags" ? (
        <div className="goal-bar" aria-hidden="true"><span />{[0.25, 0.5, 0.75, 1].map((mark) => (
          <i key={mark} className="goal-flag" style={{ left: `${mark * 100}%` }} data-passed={share >= mark || undefined}>{number(mark * target)}</i>))}<Burst count={pops} /></div>
      ) : (
        <div className="goal-vessel" aria-hidden="true">
          {money(block.unit) ? <PiggyBank /> : <MasonJar />}
          {added !== null && money(block.unit) && <i key={added} className="goal-coin" />}
          <Burst count={pops} />
        </div>
      )}
      {numbers}
      <div className="widget-log">
        <Picks label={`Add to ${titleOf(block)}`} unit={unit} picks={picks} onPick={contribute} />
        <span className="goal-other">
          <Stepper value={amount} onChange={setAmount} label={`Add to ${titleOf(block)}`} unit={block.unit} />
          <button type="button" className="secondary-button log-button" onClick={() => contribute()} disabled={!Number.isFinite(amount) || amount <= 0}><Plus size={14} />Add</button>
        </span>
      </div>
      {path.length > 0 && <ul className="goal-path">{path.map((entry) => (
        <li key={entry.index}><span>+{number(entry.value)}{unit}</span><small>{relativeDay(between(today, entry.date))}</small>
          {entry.index === added ? <button type="button" className="text-button goal-undo" onClick={() => remove(entry.index)}><Undo2 size={12} />Undo</button>
            : <button type="button" className="icon-button checklist-remove" aria-label={`Take back ${number(entry.value)}${unit} from ${relativeDay(between(today, entry.date))}`} onClick={() => remove(entry.index)}><X size={14} /></button>}
        </li>))}</ul>}
      <input className="goal-slider" type="range" min={0} max={target || 1} step={step} value={Math.min(current, target)} aria-label={`${titleOf(block)}, now ${number(current)}${unit}; drag to correct`}
        onChange={(event) => setDraft(event.target.valueAsNumber)}
        onPointerUp={(event) => save(event.currentTarget.valueAsNumber)} onKeyUp={(event) => save(event.currentTarget.valueAsNumber)}
        onBlur={() => draft !== null && save(draft)} />
    </section>
  );
}

/** Money fills a piggy bank; any other unit (km, pages, hours) fills a jar. */
const money = (unit?: string) => !!unit && /^(?:[€$£¥₹]|[A-Z]{3})$/.test(unit.trim());

/** A piggy bank in profile, its body filling from the bottom with the share reached (`--share` on the card). */
function PiggyBank() {
  const clip = useId();
  return (
    <svg className="goal-piggy" viewBox="0 0 140 104">
      <defs><clipPath id={clip}><ellipse cx="66" cy="56" rx="46" ry="34" /></clipPath></defs>
      <path className="vessel-part" d="M84 29 C85 19 91 13 99 13 C101 21 99 28 94 33 Z" />
      <rect className="vessel-leg" x="34" y="78" width="14" height="20" rx="5" />
      <rect className="vessel-leg" x="78" y="78" width="14" height="20" rx="5" />
      <path className="vessel-line" d="M21 54 c-9 -3 -13 7 -6 9 c6 2 5 -8 -3 -6" />
      <g clipPath={`url(#${clip})`}>
        <rect className="vessel-empty" x="20" y="22" width="92" height="68" />
        <rect className="vessel-fill" x="20" y="22" width="92" height="68" />
      </g>
      <ellipse className="vessel-edge" cx="66" cy="56" rx="46" ry="34" />
      <path className="vessel-sheen" d="M34 44 q8 -12 22 -15" />
      <rect className="vessel-part" x="104" y="46" width="19" height="22" rx="8" />
      <circle className="vessel-dot" cx="113" cy="57" r="1.6" /><circle className="vessel-dot" cx="118" cy="57" r="1.6" />
      <circle className="vessel-dot" cx="96" cy="45" r="2.6" />
      <rect className="vessel-slot" x="54" y="24" width="24" height="4" rx="2" />
    </svg>
  );
}

/** A mason jar with its lid on, filling from the bottom with the share reached. */
function MasonJar() {
  const clip = useId();
  const body = "M44 24 h52 v5 c11 4 16 12 16 24 v36 c0 10 -8 16 -18 16 h-48 c-10 0 -18 -6 -18 -16 v-36 c0 -12 5 -20 16 -24 z";
  return (
    <svg className="goal-mason" viewBox="0 0 140 108">
      <defs><clipPath id={clip}><path d={body} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect className="vessel-empty" x="26" y="24" width="88" height="81" />
        <rect className="vessel-fill" x="26" y="29" width="88" height="76" />
      </g>
      <path className="vessel-edge" d={body} />
      <path className="vessel-sheen" d="M37 50 v30" />
      <rect className="vessel-part" x="40" y="6" width="60" height="16" rx="4" />
      <path className="vessel-line" d="M48 11 v6 M56 11 v6 M64 11 v6 M72 11 v6 M80 11 v6 M88 11 v6" />
    </svg>
  );
}
