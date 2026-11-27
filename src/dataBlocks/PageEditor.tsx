// Customize: the page editor, each block's settings (`BlockEditor`) and the blocks put away with what they logged.
import { useRef, useState } from "react";
import type { CSSProperties, InputHTMLAttributes, ReactNode } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import Dialog from "../Dialog.tsx";
import { Tip } from "../Popups.tsx";
import { blockWidths, keepsData, recordWidgets, shownBlocks, blockViewLabels, viewOf, widgetKind, widgetKinds } from "../blocks.ts";
import type { Block, BlockWidth, Widget } from "../blocks.ts";
import type { Note } from "../model.ts";
import { widgetIcons, titleOf, weekday, relativeDay, between, plural, reducedMotion } from "./parts.tsx";

/** A fresh block of a kind at its kind's width, with the data that makes it useful before any setting (`widgetKinds`). */
const newBlock = (type: Widget, today: string, notes: Note[]): Block => ({ id: `${type}-${crypto.randomUUID().slice(0, 8)}`, type,
  width: widgetKind(type).width ?? "full", ...widgetKind(type).starts?.(today, notes) });
const units = ["km", "h", "kg", "€", "min", "steps", "pages"];
const widthShare: Record<BlockWidth, string> = { full: "100%", wide: "66%", half: "50%", narrow: "33%" };

/** Radio buttons drawn as a segmented control, the house pattern for picking one of a few. */
function Choice<T extends string>({ label, value, options, onChange, glyph }: {
  label: string; value: T; options: Record<T, string>; onChange: (value: T) => void; glyph?: (value: T) => ReactNode;
}) {
  return (
    <div className="segmented-control block-choice" role="radiogroup" aria-label={label}>
      {(Object.entries(options) as [T, string][]).map(([option, text]) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>{glyph?.(option)}{text}</button>
      ))}
    </div>
  );
}

/** A text or number field that saves when you leave it or press Enter, not on every keystroke. */
function Field({ value, onSave, ...props }: { value: string; onSave: (value: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onBlur">) {
  // Keyed by the saved value, so a change made elsewhere shows up instead of the stale draft.
  return <input {...props} key={value} defaultValue={value} onBlur={(event) => { if (event.target.value !== value) onSave(event.target.value); }}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}
const loggedIn = (block: Block) => (block.entries?.length ?? 0) + (block.days?.length ?? 0) + (block.items?.length ?? 0) + (block.steps?.length ?? 0);

/** One block's row in the editor: what it is, how it draws, how wide, and its own settings. */
function BlockEditor({ block, index, count, today, notes, todayPage, edit, move, remove }: {
  block: Block; index: number; count: number; today: string; notes: Note[]; todayPage: boolean;
  edit: (patch: Partial<Block>) => void; move: (by: number) => void; remove: () => void;
}) {
  const Icon = widgetIcons[block.type];
  const kind = widgetKinds[block.type];
  const amount = (value: string) => value.trim() === "" ? undefined : Number(value.replace(",", "."));
  return (
    <li>
      <div className="block-row">
        <span className="block-kind"><Icon size={16} />{titleOf(block)}{block.title && <small>{kind.label}</small>}</span>
        <span className="block-tools">
          <Tip label="Move up"><button className="icon-button" aria-label={`Move ${titleOf(block)} up`} disabled={!index} onClick={() => move(-1)}><ArrowUp size={16} /></button></Tip>
          <Tip label="Move down"><button className="icon-button" aria-label={`Move ${titleOf(block)} down`} disabled={index === count - 1} onClick={() => move(1)}><ArrowDown size={16} /></button></Tip>
          <Tip label={keepsData(block) ? "Remove (you can restore it below)" : "Remove"}><button className="icon-button" aria-label={`Remove ${titleOf(block)}`} onClick={remove}><Trash2 size={16} /></button></Tip>
        </span>
      </div>
      <div className="block-choices">
        <Choice label={`How ${titleOf(block)} draws`} value={viewOf(block)} options={blockViewLabels(block.type)} onChange={(view) => edit({ view })} />
        {!todayPage && <Choice label={`How wide ${titleOf(block)} is`} value={block.width ?? "full"} options={blockWidths} onChange={(width) => edit({ width })}
          glyph={(width) => <i className="width-glyph" style={{ "--share": widthShare[width] } as CSSProperties} aria-hidden="true" />} />}
      </div>
      {keepsData(block) && (
        <div className="block-settings">
          <label>Title<Field value={block.title ?? ""} placeholder={kind.label} onSave={(title) => edit({ title: title.trim() || undefined })} /></label>
          {(block.type === "countdown" || block.type === "goal") && <label>{block.type === "goal" ? "Reach by (optional)" : "Date"}<input type="date" value={block.date ?? ""} min={today}
            onChange={(event) => edit({ date: event.target.value || undefined, since: block.since ?? (event.target.value ? today : undefined) })} />
            {block.date && <small>{weekday(block.date)}, {relativeDay(between(today, block.date))}</small>}</label>}
          {(block.type === "tracker" || block.type === "goal") && <>
            <label>Unit<Field list="block-units" value={block.unit ?? ""} placeholder="km, €, h" onSave={(unit) => edit({ unit: unit.trim() || undefined })} /></label>
            <label>{block.type === "goal" ? "Target" : "Target (optional)"}<Field type="number" inputMode="decimal" value={block.target === undefined ? "" : String(block.target)}
              onSave={(target) => edit({ target: amount(target) })} /></label>
          </>}
          {block.type === "tracker" && <div className="block-setting">Better when<Choice label={`${titleOf(block)} is better when`} value={block.better ?? "up"}
            options={{ up: "Higher", down: "Lower" }} onChange={(better) => edit({ better })} /></div>}
          {block.type === "note" && <label>Note<select value={block.noteId ?? ""} onChange={(event) => edit({ noteId: event.target.value || undefined })}>
            <option value="">Pick a note…</option>
            {notes.map((note) => <option key={note.id} value={note.id}>{note.title || "Untitled note"}</option>)}
          </select></label>}
        </div>
      )}
    </li>
  );
}

/** A put-away data widget: brought back with one tap, or deleted for good after saying what that loses. */
function RemovedBlock({ block, today, restore, purge }: { block: Block; today: string; restore: () => void; purge: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const Icon = widgetIcons[block.type];
  const logged = loggedIn(block);
  return (
    <li>
      <span className="block-kind"><Icon size={16} />{titleOf(block)}
        <small>{logged ? `${plural(logged, "logged value")}, ` : ""}removed {relativeDay(between(today, block.removed ?? today))}</small></span>
      <span className="block-tools">
        <button className="text-button" onClick={restore}>Restore</button>
        {confirming
          ? <button className="quiet-button block-confirm" onClick={purge}>{logged ? `Delete ${plural(logged, "value")} for good?` : "Delete for good?"}</button>
          : <Tip label="Delete for good"><button className="icon-button" aria-label={`Delete ${titleOf(block)} for good`} onClick={() => setConfirming(true)}><Trash2 size={16} /></button></Tip>}
      </span>
    </li>
  );
}

/**
 * Arranges one page: which blocks, in what order, drawn how and how wide, and each data block's own settings. Today
 * offers record widgets only. Changes save as they're made: `onArrange` gets the blocks to show, and Workspace puts
 * away any data widget left out (listed under the page until restored or purged); `onReset` returns to the default.
 */
export function PageEditor({ name, blocks, today, notes, custom, todayPage, cards, onArrange, onReset, onPurge, onClose }: {
  name: string; blocks: Block[]; today: string; notes: Note[]; custom: boolean; todayPage: boolean;
  /** Today's own cards, as switches above its widgets. */
  cards?: ReactNode;
  onArrange: (shown: Block[]) => void; onReset: () => void; onPurge: (id: string) => void; onClose: () => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const shown = shownBlocks(blocks);
  const removed = blocks.filter((block) => block.removed);
  const edit = (id: string, patch: Partial<Block>) => onArrange(shown.map((block) => block.id === id ? { ...block, ...patch } : block));
  const add = (type: Widget) => {
    onArrange([...shown, todayPage ? { id: type, type } : newBlock(type, today, notes)]);
    // The new block lands at the bottom of a scrolling list; bring it into view so its settings are the next thing you see.
    requestAnimationFrame(() => list.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }));
  };
  const move = (index: number, by: number) => {
    const next = [...shown];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onArrange(next);
  };
  const remove = (block: Block) => onArrange(shown.filter((item) => item.id !== block.id));
  const restore = (block: Block) => onArrange([...shown, block]);
  const kinds = (todayPage ? recordWidgets : Object.keys(widgetKinds) as Widget[])
    .filter((type) => !todayPage || !shown.some((block) => block.type === type));
  return (
    <Dialog title={`Arrange ${name}`} onClose={onClose}>
      <p className="dialog-description">{todayPage ? "Choose Today's cards, then the widgets under Keep going, in order." : `${plural(shown.length, "widget")} on ${name}'s page. Only this page changes.`}</p>
      {cards}
      {todayPage && <h3 className="page-editor-title">Keep going</h3>}
      <datalist id="block-units">{units.map((unit) => <option key={unit} value={unit} />)}</datalist>
      <ol className="page-editor" ref={list}>
        {shown.map((block, index) => (
          <BlockEditor key={block.id} block={block} index={index} count={shown.length} today={today} notes={notes} todayPage={todayPage}
            edit={(patch) => edit(block.id, patch)} move={(by) => move(index, by)} remove={() => remove(block)} />
        ))}
        {!shown.length && <li className="empty-inline">Nothing on this page yet. Pick a widget below.</li>}
      </ol>
      {!!removed.length && <div className="removed-blocks">
        <h3>Put away <small>{removed.length}</small></h3>
        <ul>{removed.map((block) => <RemovedBlock key={block.id} block={block} today={today} restore={() => restore(block)}
          purge={() => onPurge(block.id)} />)}</ul>
      </div>}
      {!!kinds.length && <div className="block-picker" role="group" aria-label="Add a widget">
        {kinds.map((type) => {
          const Icon = widgetIcons[type];
          return (
            <button key={type} type="button" onClick={() => add(type)}>
              <Icon size={18} /><strong>{widgetKinds[type].label}</strong><small>{widgetKinds[type].hint}</small>
            </button>
          );
        })}
      </div>}
      <div className="dialog-footer">
        <span>Saved as you go.</span>
        <span>
          {custom && <Tip label={removed.length || shown.some(keepsData) ? "Data widgets are put away, not deleted" : undefined}><button className="secondary-button" onClick={onReset}>Use the default</button></Tip>}
          <button className="primary-button" onClick={onClose}>Done</button>
        </span>
      </div>
    </Dialog>
  );
}
