// The pinned note block: a resource's words taped to the page.
import { useState } from "react";
import { Check, StickyNote } from "lucide-react";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import type { Note } from "../model.ts";
import { Heading, relativeDay, between, ViewMenu, plural } from "./parts.tsx";

const checkLine = /^(\s*[-*]\s+\[)( |x|X)(\]\s+)(.*)$/;

export function PinnedNote({ block, notes, today, onOpen, onChange, onEdit }: {
  block: Block; notes: Note[]; today: string; onOpen: (note: Note) => void; onChange: (block: Block) => void; onEdit: (id: string, body: string) => void;
}) {
  const view = viewOf(block);
  const [expanded, setExpanded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const note = notes.find((item) => item.id === block.noteId);
  const onView = (view: string) => onChange({ ...block, view });
  if (!note) return <section className="widget data-widget note-widget"><Heading block={block} onView={onView} /><p className="empty-inline">Pick a note in Customize.</p></section>;
  const long = view === "paper" && note.body.length > 260 && !expanded;
  const edited = note.updatedAt ? relativeDay(between(today, new Date(note.updatedAt).toLocaleDateString("en-CA"))) : "";
  const lines = note.body.split("\n");
  const ticks = lines.map((line, index) => [line.match(checkLine), index] as const).filter(([match]) => match) as [RegExpMatchArray, number][];
  const ticked = ticks.filter(([match]) => match[2] !== " ").length;
  const toggleLine = (index: number) => onEdit(note.id, lines.map((line, at) => at === index ? line.replace(checkLine, (_, lead, mark, close, text) => `${lead}${mark === " " ? "x" : " "}${close}${text}`) : line).join("\n"));
  const heading = (
    <div className="section-heading"><h2><StickyNote size={16} /><span className="heading-title" title={block.title || note.title || "Untitled note"}>{block.title || note.title || "Untitled note"}</span></h2>
      <span className="heading-actions">
        {view === "ticks" && ticks.length > 0 ? <span><strong>{ticked} of {ticks.length}</strong></span> : view === "edit" ? <span className="count-chip">{dirty ? "Unsaved" : "Saved"}</span> : <button className="text-button" onClick={() => onOpen(note)}>Open</button>}
        <ViewMenu block={block} onView={onView} />
      </span></div>
  );
  return (
    <section className={`widget data-widget note-widget view-${view}`}>
      {heading}
      {view === "ticks" && ticks.length > 0 ? <>
        <div className="progress-track"><span style={{ transform: `scaleX(${ticked / ticks.length})` }} /></div>
        <ul className="checklist-items">{ticks.map(([match, index]) => (
          <li key={index} data-done={match[2] !== " " || undefined}>
            <button type="button" className="task-check" aria-pressed={match[2] !== " "} aria-label={`${match[2] !== " " ? "Untick" : "Tick"}: ${match[4]}`} onClick={() => toggleLine(index)}>{match[2] !== " " && <Check size={14} strokeWidth={3} />}</button>
            <span>{match[4]}</span>
          </li>))}</ul>
        <p className="widget-caption">{lines.length > ticks.length ? "Plain lines stay in the note · " : ""}<button type="button" className="text-button" onClick={() => onOpen(note)}>Open</button></p>
      </> : view === "edit" ? <>
        <textarea key={note.body} className="note-edit" defaultValue={note.body} aria-label={`${note.title || "Note"} body`} placeholder="Write here"
          onChange={() => setDirty(true)} onBlur={(event) => { if (event.target.value !== note.body) onEdit(note.id, event.target.value); setDirty(false); }} />
        <p className="widget-caption">Saves when you leave · <button type="button" className="text-button" onClick={() => onOpen(note)}>Open full page</button></p>
      </> : <>
        <p className="pinned-body">{long ? `${note.body.slice(0, 260).trimEnd()}…` : note.body || "Nothing written yet."}</p>
        <p className="widget-caption">
          {edited && <>Edited <strong>{edited}</strong></>}{note.body && <> · {plural(lines.filter((line) => line.trim()).length, "line")}</>}
          {view === "ticks" && <> · Add <code>- [ ]</code> lines to tick them here</>}
          {note.body.length > 260 && view === "paper" && <> · <button type="button" className="text-button" onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Show all"}</button></>}
        </p>
      </>}
    </section>
  );
}
