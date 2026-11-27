// The Routines page's filters: whose routines (faces), which state (with counts), the sort, and Sort again, which
// keeps its place in the bar, hidden until the order is held, so offering it never moves the list.
import { usePortraitSrc } from "../crewStyle.ts";
import type { Agent } from "../model.ts";
import { Tip } from "../Popups.tsx";
import { inStatus, sorts, statuses } from "./listing.ts";
import type { Line, Sort, Status } from "./listing.ts";

export function RoutineFilters({ lines, runners, who, status, sort, resorted, onWho, onStatus, onSort, onResort }: {
  lines: Line[];
  /** Everyone who runs a routine. */
  runners: Agent[];
  who: string[];
  status: Status;
  sort: Sort;
  /** The held order differs from a fresh sort. */
  resorted: boolean;
  onWho: (who: string[]) => void;
  onStatus: (status: Status) => void;
  onSort: (sort: Sort) => void;
  onResort: () => void;
}) {
  const portraitSrc = usePortraitSrc();
  return (
    <div className="routine-filters">
      <div className="routine-who" role="group" aria-label="Whose routines">
        {runners.map((agent) => {
          const picked = who.includes(agent.id);
          const count = lines.filter((line) => line.runner.id === agent.id).length;
          const tip = `${agent.name}: ${count} ${count === 1 ? "routine" : "routines"}. ${picked ? "Stop showing only theirs." : who.length ? "Show theirs too." : "Show only theirs."}`;
          return (
            <Tip key={agent.id} label={tip}>
              <button type="button" aria-pressed={picked} aria-label={agent.name} data-dim={who.length > 0 && !picked || undefined}
                onClick={() => onWho(picked ? who.filter((id) => id !== agent.id) : [...who, agent.id])}><img src={portraitSrc(agent)} alt="" /></button>
            </Tip>
          );
        })}
      </div>
      <div className="segmented-control" role="group" aria-label="Show">
        {statuses.map((item) => {
          const count = lines.filter((line) => inStatus(line, item.value)).length;
          return <Tip key={item.value} label={item.tip}><button type="button" aria-pressed={status === item.value} onClick={() => onStatus(item.value)}>
            {item.label}<small>{count}</small></button></Tip>;
        })}
      </div>
      <span className="routine-sort">
        <Tip label={resorted ? "Rows stay where they were while you change them; this puts them in order again" : undefined}>
          <button type="button" className="quiet-button routine-resort" disabled={!resorted} aria-hidden={!resorted || undefined} onClick={onResort}>Sort again</button></Tip>
        Sort
        <span className="segmented-control" role="group" aria-label="Sort by">
          {sorts.map((item) => <button key={item.value} type="button" aria-pressed={sort === item.value} onClick={() => onSort(item.value)}>{item.label}</button>)}
        </span>
      </span>
    </div>
  );
}
