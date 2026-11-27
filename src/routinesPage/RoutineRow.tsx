// One routine as a row: the runner's face (dozing while it's off), what it is and where, its last results, when it's
// next, Run now and the switch. The row opens its sheet.
import { Moon, Play } from "lucide-react";
import { usePortraitSrc } from "../crewStyle.ts";
import { routineKinds } from "../model.ts";
import type { WorkspaceData } from "../model.ts";
import { Tip } from "../Popups.tsx";
import * as routines from "../routines.ts";
import { ResultStrip, routineIcons, routineState, whereLabel } from "../RoutineViews.tsx";
import { timingOf } from "./listing.ts";
import type { Line } from "./listing.ts";

export function RoutineRow({ line, data, now, open, stir, onOpen, onRunNow, onToggle }: {
  line: Line;
  data: WorkspaceData;
  now: Date;
  /** Its sheet is open beside the list. */
  open: boolean;
  /** The one animation of a row just switched off (its agent dozes off) or on (wakes up). */
  stir?: "sleep" | "wake";
  onOpen: () => void;
  onRunNow: () => void;
  onToggle: (on: boolean) => void;
}) {
  const portraitSrc = usePortraitSrc();
  const Icon = line.routine.paused ? Moon : routineIcons[line.routine.kind];
  const label = routineKinds[line.routine.kind].label;
  const state = routineState(line, line.failed);
  const [when, from] = timingOf(line, now);
  return (
    <li id={`routine-${line.routine.id}`} className={`routine-line ${line.routine.kind}`} data-open={open || undefined} data-off={!line.enabled || undefined}
      data-stir={stir}>
      <div className="routine-line-head">
        <button type="button" id={`routine-main-${line.routine.id}`} className="routine-line-main" aria-haspopup="dialog" aria-expanded={open}
          aria-controls={open ? "routine-sheet" : undefined} onClick={onOpen}>
          <span className="routine-face"><img src={portraitSrc(line.runner)} alt="" /><span className="routine-face-kind" aria-hidden="true"><Icon size={12} /></span>
            <span className="routine-zz" aria-hidden="true">z<i>z</i></span></span>
          <span className="routine-line-text">
            <span className="routine-line-title"><strong>{label}</strong>{state && <em data-tone={state.tone}>{state.word}</em>}</span>
            <small>{line.runner.name}{whereLabel(data, line.owner, "")} · {routines.repeatLabel(line.routine)}, {routines.timeLabel(line.routine.time)}</small>
          </span>
        </button>
        {line.results.length > 0 && <ResultStrip results={line.results} now={now} />}
        <span className="routine-line-when" data-due={!!line.due || undefined}><span>{when}</span><small>{from}</small></span>
        <span className="routine-line-actions">
          <Tip label="Run it now, without changing its schedule"><button type="button" className="icon-button" aria-label={`Run ${label.toLowerCase()} now`}
            disabled={!line.manualDue} onClick={onRunNow}><Play size={16} /></button></Tip>
        </span>
        <Tip label={line.routine.paused ? `Off: ${line.runner.name} sleeps through it. Switch it on to run on schedule.` : "On: runs on schedule."}>
          <label className="routine-switch">
            <input type="checkbox" role="switch" aria-label={`${label} on`} checked={!line.routine.paused} onChange={(event) => onToggle(event.target.checked)} />
            <span className="switch" aria-hidden="true" />
          </label>
        </Tip>
      </div>
    </li>
  );
}
