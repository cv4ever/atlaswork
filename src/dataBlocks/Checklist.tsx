// The checklist block: items ticked in place.
import { useState } from "react";
import { Check, ChevronRight, Plus, X } from "lucide-react";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { titleOf, Heading, plural, Burst } from "./parts.tsx";

/** Named things to tick off, edited on the block: the project's definition of done. */
export function Checklist({ block, onChange }: { block: Block; onChange: (block: Block) => void }) {
  const view = viewOf(block);
  const items = block.items ?? [];
  const [adding, setAdding] = useState("");
  const [open, setOpen] = useState(false);
  const [pops, setPops] = useState(0);
  const done = items.filter((item) => item.done).length;
  const set = (next: typeof items) => onChange({ ...block, items: next });
  const toggle = (index: number) => {
    if (!items[index].done && done + 1 === items.length) setPops(pops + 1);
    set(items.map((item, at) => at === index ? { ...item, done: !item.done } : item));
  };
  const add = () => { if (adding.trim()) { set([...items, { text: adding.trim(), done: false }]); setAdding(""); } };
  const row = (item: (typeof items)[number], index: number) => (
    <li key={index} data-done={item.done || undefined}>
      <button type="button" className="task-check" aria-pressed={item.done} aria-label={`${item.done ? "Untick" : "Tick"}: ${item.text}`} onClick={() => toggle(index)}>{item.done && <Check size={14} strokeWidth={3} />}</button>
      <span>{item.text}</span>
      <button type="button" className="icon-button checklist-remove" aria-label={`Remove ${item.text}`} onClick={() => set(items.filter((_, at) => at !== index))}><X size={14} /></button>
    </li>
  );
  const ordered = items.map((item, index) => [item, index] as const);
  const left = items.length - done;
  const words = ["No more", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const addForm = (placeholder: string) => (
    <form className="checklist-add" onSubmit={(event) => { event.preventDefault(); add(); }}>
      <input value={adding} maxLength={120} placeholder={placeholder} aria-label={`Add to ${titleOf(block)}`} ref={view === "chips" ? (input) => input?.focus() : undefined} onChange={(event) => setAdding(event.target.value)} />
      <button type="submit" className="text-button" disabled={!adding.trim()}><Plus size={14} />Add</button>
    </form>
  );
  return (
    <section className={`widget data-widget checklist-widget view-${view}`} data-complete={items.length > 0 && done === items.length || undefined}>
      <Heading block={block} onView={(view) => onChange({ ...block, view })}
        detail={!items.length ? undefined : view === "left" ? <strong>{left ? `${left} left` : "All done"}</strong> : view === "run" ? plural(items.length, "item") : <strong>{done} of {items.length}</strong>} />
      {items.length > 0 && view !== "run" && <div className="progress-track"><span style={{ transform: `scaleX(${done / items.length})` }} /></div>}
      {view === "chips" ? <>
        <div className="checklist-chips">
          {items.map((item, index) => (
            <button key={index} type="button" aria-pressed={item.done} onClick={() => toggle(index)}>
              <i className="task-check" aria-hidden="true">{item.done && <Check size={12} strokeWidth={3} />}</i>{item.text}
            </button>
          ))}
          {!open && <button type="button" className="checklist-chip-add" onClick={() => setOpen(true)}><Plus size={14} />Add</button>}
        </div>
        {open && addForm("What else means done?")}
        <p className="widget-caption" data-empty={!items.length || undefined}>{!items.length ? "Nothing listed yet. Add the things that mean \"done\"." : left ? `${words[Math.min(left, 9)]} to go, then this project blooms.` : "All done. This project blooms."}</p>
      </> : <>
        <ul className="checklist-items">
          {(view === "left" ? ordered.filter(([item]) => !item.done) : ordered).map(([item, index]) => row(item, index))}
          {!items.length && <li className="empty-inline">Nothing listed yet. Add the things that mean "done".</li>}
        </ul>
        {view === "left" && done > 0 && (
          <details className="task-fold"><summary><ChevronRight size={14} />{done} done</summary>
            <ul className="checklist-items">{ordered.filter(([item]) => item.done).map(([item, index]) => row(item, index))}</ul></details>
        )}
        {addForm(view === "run" ? `Item ${items.length + 1}, then Enter for item ${items.length + 2}` : "What else means done?")}
      </>}
      <Burst count={pops} />
    </section>
  );
}
