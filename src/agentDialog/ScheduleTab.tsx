// The agent dialog's Schedule tab: the routines they run on their own, edited here, and those of places they look
// after, edited on the Routines page.
import { useState } from "react";
import { routineKinds } from "../model.ts";
import type { Agent, Note, Routine, WorkspaceData } from "../model.ts";
import * as routines from "../routines.ts";
import type { RoutineOwner } from "../routines.ts";
import { RoutineList, routineIcons } from "../RoutineViews.tsx";

export function ScheduleTab({ agentId, saved, notes, now, schedule, previewError, onChange }: {
  agentId: string;
  /** The workspace as Save would leave it. */
  saved: WorkspaceData;
  notes: Note[];
  now: Date;
  schedule: { own: Routine[]; inherited: { routine: Routine; owner: RoutineOwner }[]; on: number };
  /** The draft can't be previewed, so its routines can't be edited. */
  previewError: string;
  onChange: (patch: Partial<Agent>) => void;
}) {
  const [openRoutine, setOpenRoutine] = useState<string | null>(null);
  const { own, inherited, on } = schedule;
  return <>
    <section className="agent-section" aria-labelledby="agent-routines">
      <h3 id="agent-routines">On their own <small>{on} of {own.length + inherited.length} on</small></h3>
      <p className="agent-hint">Each runs once its time has passed, the next time you open the workspace. Missed ones run once, not once per miss.</p>
      {!previewError && <RoutineList scene={{ data: saved, notes, now, owner: { kind: "agent", id: agentId } }}
        list={own} open={openRoutine} onOpen={setOpenRoutine} onChange={(list) => onChange({ routines: list })} />}
    </section>
    {inherited.length > 0 && (
      <section className="agent-section" aria-labelledby="agent-inherited">
        <h3 id="agent-inherited">For places they look after <small>edit on the Routines page</small></h3>
        <ul className="inherited-routines">
          {inherited.map(({ routine, owner }) => {
            const Icon = routineIcons[routine.kind];
            return (
              <li key={routine.id} data-paused={routine.paused || undefined}>
                <Icon size={16} /><strong>{routineKinds[routine.kind].label}</strong> for {routines.ownerLabel(saved, owner)}
                <small>{routines.repeatLabel(routine)}, {routines.timeLabel(routine.time)}</small>
              </li>
            );
          })}
        </ul>
      </section>
    )}
  </>;
}
