// Find in this chat (the Chats page, Ctrl F): the query, which match is current, and stepping through the matches.
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { Tip } from "../Popups.tsx";

export type Find = { query: string; index: number };

export function FindBar({ find, found, current, onFind, onEscape }: {
  find: Find;
  /** Matches across the thread. */
  found: number;
  /** The current match, wrapped into range. */
  current: number;
  /** A new query or match; null closes the bar. */
  onFind: (find: Find | null) => void;
  /** Escape closes the bar and returns to the message box. */
  onEscape: () => void;
}) {
  const searching = !!find.query.trim();
  return (
    <div className="chat-find" role="search">
      <Search size={14} />
      <input id="chat-find" type="search" aria-label="Find in this chat" placeholder="Find in this chat" value={find.query}
        onChange={(event) => onFind({ query: event.target.value, index: 0 })}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onEscape(); }
          if (event.key === "Enter") { event.preventDefault(); onFind({ ...find, index: current + (event.shiftKey ? -1 : 1) }); }
        }} />
      <span aria-live="polite">{searching ? found ? `${current + 1} of ${found}` : "No matches" : ""}</span>
      <Tip label="Previous (Shift Enter)"><button className="icon-button" aria-label="Previous match" disabled={found < 2} onClick={() => onFind({ ...find, index: current - 1 })}><ChevronUp size={16} /></button></Tip>
      <Tip label="Next (Enter)"><button className="icon-button" aria-label="Next match" disabled={found < 2} onClick={() => onFind({ ...find, index: current + 1 })}><ChevronDown size={16} /></button></Tip>
      <Tip label="Close (Esc)"><button className="icon-button" aria-label="Close find" onClick={() => onFind(null)}><X size={16} /></button></Tip>
    </div>
  );
}
