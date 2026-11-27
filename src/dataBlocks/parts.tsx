// What every data block shares: day and number words, the heading with its view menu (D39), the burst a tick plays,
// quick picks and the stepper.
import type { CSSProperties, ReactNode } from "react";
import { CalendarClock, Check, CheckCheck, Flag, Gauge, LayoutGrid, LayoutTemplate, Link2, ListChecks, Milestone, Minus, Plus, StickyNote, TrendingUp } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { Picker } from "../Popups.tsx";
import { viewOf, widgetKinds } from "../blocks.ts";
import type { Block, Widget } from "../blocks.ts";
import { addDays, formatDate, formatNumber } from "../dates.ts";

const dayMs = 86_400_000;
export const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
export const between = (from: string, to: string) => Math.round((noon(to) - noon(from)) / dayMs);
export const short = (day: string) => formatDate(new Date(noon(day)), { day: "numeric", month: "short" });
export const weekday = (day: string) => formatDate(new Date(noon(day)), { weekday: "long", day: "numeric", month: "long" });
export const number = (value: number) => formatNumber(value, { maximumFractionDigits: 1 });
export const plural = (count: number, one: string, many = `${one}s`) => `${number(count)} ${count === 1 ? one : many}`;

/** "today", "tomorrow", "in 12 days", "3 days ago". */
export const relativeDay = (days: number) => days === 0 ? "today" : days === 1 ? "tomorrow" : days === -1 ? "yesterday"
  : days > 0 ? `in ${plural(days, "day")}` : `${plural(-days, "day")} ago`;

/** A step that moves a value by a sensible amount for its size: half-hours of sleep, single kilos, tens of euros. */
export const stepOf = (value: number) => Math.abs(value) < 20 ? 0.5 : Math.abs(value) < 200 ? 1 : Math.abs(value) < 2_000 ? 10 : 50;
export const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const percent = (share: number) => `${Math.round(share * 100)}%`;
export const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0;
};

/** The next Monday to Friday after today. */
export const nextWorkday = (today: string) => {
  let day = addDays(today, 1);
  while ([0, 6].includes(new Date(noon(day)).getDay())) day = addDays(day, 1);
  return day;
};
export const shortWeekday = (day: string) => formatDate(new Date(noon(day)), { weekday: "short", day: "numeric", month: "short" });

export const widgetIcons: Record<Widget, typeof Plus> = {
  tasks: CheckCheck, projects: LayoutGrid, resources: Link2, countdown: CalendarClock, tracker: TrendingUp, habit: Flag, goal: Gauge, note: StickyNote,
  checklist: ListChecks, milestones: Milestone,
};

/** A block's title, or its widget's name. */
export const titleOf = (block: Block) => block.title || widgetKinds[block.type].label;

/**
 * The block's view menu (D39): the heading's secondary action, shown on hover or focus with its words as the tooltip,
 * opens a menu naming the kind's views with a line each (ADR 0003). Picking one saves `block.view`, the field the
 * Arrange dialog sets. Record widgets in App.tsx use it too.
 */
export function ViewMenu({ block, onView }: { block: Block; onView?: (view: string) => void }) {
  return onView ? <ViewPicker views={widgetKinds[block.type].views} value={viewOf(block)} onView={onView} /> : null;
}

/** ViewMenu for any set of views, such as a Today card's (`todayCards` in model.ts). */
export function ViewPicker({ views, value, onView }: {
  views: Record<string, { label: string; hint: string }>; value: string; onView: (view: string) => void }) {
  const entries = Object.entries(views);
  if (entries.length < 2) return null;
  return (
    <Picker className="view-menu" label="View" tip="Change view"
      trigger={<button type="button" className="icon-button view-button" aria-label="Change view"><LayoutTemplate size={16} /></button>}>
      <Menu.RadioGroup value={value} onValueChange={(view: string) => onView(view)}>
        <Menu.GroupLabel>View</Menu.GroupLabel>
        {entries.map(([view, { label, hint }]) => (
          <Menu.RadioItem key={view} value={view} label={label} closeOnClick>
            <Check size={14} /><span><strong>{label}</strong><small>{hint}</small></span>
          </Menu.RadioItem>
        ))}
      </Menu.RadioGroup>
    </Picker>
  );
}

export function Heading({ block, detail, onView }: { block: Block; detail?: ReactNode; onView?: (view: string) => void }) {
  const Icon = widgetIcons[block.type];
  return (
    <div className="section-heading"><h2><Icon size={16} /><span className="heading-title" title={titleOf(block)}>{titleOf(block)}</span></h2>
      <span className="heading-actions">{detail && <span>{detail}</span>}<ViewMenu block={block} onView={onView} /></span></div>
  );
}

/** A small celebration that plays once when something is done; keyed so each new success replays it. */
export function Burst({ count }: { count: number }) {
  if (!count || reducedMotion()) return null;
  return <span key={count} className="burst" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</span>;
}

/** One of a few amounts offered before the field: the usual answers, each with why it is offered. */
export function Picks({ label, picks, value, onPick, unit }: {
  label: string; picks: [number, string][]; value?: number; onPick: (value: number) => void; unit: string }) {
  const seen = new Set<number>();
  const unique = picks.filter(([amount]) => Number.isFinite(amount) && amount > 0 && !seen.has(amount) && seen.add(amount));
  if (!unique.length) return null;
  return (
    <div className="date-picks value-picks" role="group" aria-label={label}>
      {unique.map(([amount, why]) => <button key={why} type="button" className="date-pick" aria-pressed={value === amount || undefined} onClick={() => onPick(amount)}>
        <strong>{number(amount)}{unit}</strong><small>{why}</small></button>)}
    </div>
  );
}

/** A number field between − and + buttons that step by a sensible amount. */
export function Stepper({ value, onChange, label, unit }: { value: number; onChange: (value: number) => void; label: string; unit?: string }) {
  const step = stepOf(value);
  const round = (next: number) => Math.round(next * 100) / 100;
  return (
    <span className="stepper">
      <button type="button" className="icon-button" aria-label={`${step} less`} onClick={() => onChange(round(value - step))}><Minus size={14} /></button>
      <input type="number" inputMode="decimal" step={step} aria-label={label} value={Number.isFinite(value) ? value : ""}
        style={{ width: `${Math.max(String(Number.isFinite(value) ? value : "").length, 3) + 3}ch` }}
        onChange={(event) => onChange(event.target.valueAsNumber)} />
      {unit && <span className="stepper-unit">{unit}</span>}
      <button type="button" className="icon-button" aria-label={`${step} more`} onClick={() => onChange(round(value + step))}><Plus size={14} /></button>
    </span>
  );
}
