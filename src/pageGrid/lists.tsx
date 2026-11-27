// Parts the resources widget lists with: resources behind kind-count chips, and the paste-or-drop strip.
import { useState } from "react";
import type { ReactNode } from "react";
import { kindLabels, kindOf } from "../model.ts";
import type { Note, ResourceKind } from "../model.ts";
import { kindIcons } from "../Resources.tsx";

/** Resources as kind chips with counts that filter the list under them (D39 "Counts first"). */
export function KindsList({ title, heading, items, add, empty, row, limit }: {
  title: string; heading: (action: ReactNode) => ReactNode; items: Note[]; add: ReactNode; empty: string; row: (note: Note) => ReactNode; limit: number;
}) {
  const [kind, setKind] = useState<ResourceKind | "all">("all");
  const counts = items.reduce((map, note) => map.set(kindOf(note), (map.get(kindOf(note)) ?? 0) + 1), new Map<ResourceKind, number>());
  const shown = items.filter((note) => kind === "all" || kindOf(note) === kind).slice(0, limit);
  return (
    <section className="widget resources-widget list-view kinds-view" aria-label={title}>
      {heading(add)}
      {items.length > 0 && (
        <div className="date-picks kind-picks" role="radiogroup" aria-label="Kinds">
          <button type="button" className="date-pick" role="radio" aria-checked={kind === "all"} onClick={() => setKind("all")}><strong>All {items.length}</strong></button>
          {[...counts].map(([each, count]) => { const Icon = kindIcons[each]; return (
            <button key={each} type="button" className="date-pick" role="radio" aria-checked={kind === each} data-kind={each} onClick={() => setKind(each)}><strong><Icon size={12} /> {count} {(count === 1 ? kindLabels[each] : `${kindLabels[each]}s`).toLowerCase()}</strong></button>
          ); })}
        </div>
      )}
      <ul className="resource-list">{shown.map(row)}</ul>
      {!items.length && <p className="empty-inline">{empty}</p>}
    </section>
  );
}

/** A strip that takes a pasted link or text and dropped files straight into the place; a click opens the capture dialog. */
export function DropStrip({ onOpen, onCapture }: { onOpen: () => void; onCapture: (text: string, file?: File) => void }) {
  const [over, setOver] = useState(false);
  return (
    <div className="drop-strip" role="button" tabIndex={0} data-over={over || undefined}
      onClick={onOpen} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); } }}
      onPaste={(event) => { const file = event.clipboardData.files[0], text = event.clipboardData.getData("text"); if (file || text.trim()) { event.preventDefault(); onCapture(text, file); } }}
      onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(event) => { event.preventDefault(); setOver(false); const file = event.dataTransfer.files[0], text = event.dataTransfer.getData("text"); if (file || text.trim()) onCapture(text, file); else onOpen(); }}>
      Paste a link or drop a file here<small>Ctrl+V while this is focused saves it straight away</small>
    </div>
  );
}
