// One routine beside the list (D70): its detail (`RoutineDetail`, which the dialogs show in place of their list) under
// a bar with where it sits in the list, the arrows and Close. The list stays usable behind it: another row swaps what
// it shows, the arrows step through the list as shown, Escape closes it and focus goes back to the row.
import { useEffect } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { Note, Routine, WorkspaceData } from "../model.ts";
import { Tip } from "../Popups.tsx";
import { RoutineDetail } from "../RoutineViews.tsx";
import type { Line } from "./listing.ts";

export function RoutineSheet({ line, data, notes, now, position, onStep, onClose, onEdit, onRunNow, onRemove, onChat }: {
  line: Line; data: WorkspaceData; notes: Note[]; now: Date;
  /** Where it sits in the list as shown; null when the filters hide it. */
  position: { at: number; count: number } | null;
  onStep: (step: 1 | -1) => void; onClose: () => void; onEdit: (routine: Routine) => void;
  onRunNow: () => void; onRemove: () => void; onChat: () => void;
}) {
  const id = line.routine.id;
  // Focus goes back to the row when it leaves with the sheet (Close, Escape, Remove); a click on another row keeps that
  // row's focus. The sheet is keyed by its routine, so this runs once per routine shown.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector("dialog[open]")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.activeElement === document.body) document.getElementById(`routine-main-${id}`)?.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose only clears the open id
  }, []);
  return (
    <aside id="routine-sheet" className="routine-sheet" aria-labelledby={`routine-title-${id}`}>
      <div className="routine-sheet-bar">
        <span>{position && `${position.at + 1} of ${position.count}`}</span>
        {position && <>
          <Tip label="Previous routine"><button type="button" className="icon-button" aria-label="Previous routine" disabled={position.at === 0}
            onClick={() => onStep(-1)}><ChevronUp size={16} /></button></Tip>
          <Tip label="Next routine"><button type="button" className="icon-button" aria-label="Next routine" disabled={position.at >= position.count - 1}
            onClick={() => onStep(1)}><ChevronDown size={16} /></button></Tip>
        </>}
        <Tip label="Close (Esc)"><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18} /></button></Tip>
      </div>
      <RoutineDetail scene={{ data, notes, now, owner: line.owner }} routine={line.routine}
        onChange={onEdit} onRemove={onRemove} onRunNow={onRunNow} onChat={onChat} />
    </aside>
  );
}
