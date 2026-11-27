// The roster's options popover: its order, row size and details, each choice explained with this crew's own faces,
// names, times and counts, one real row as a live preview, and how many rows of each size fit the sidebar.
import { useState } from "react";
import type { RefObject } from "react";
import { AvatarStack } from "../AvatarStack.tsx";
import { atlasId } from "../model.ts";
import { Tip } from "../Popups.tsx";
import { initialRosterView } from "../session.ts";
import type { RosterView } from "../session.ts";
import type { RosterEntry } from "../view.ts";
import { RosterRow, attention, presenceLabel, shortTime, sortedBy } from "./RosterRow.tsx";

const sortOptions = [["attention", "Needs you first"], ["recent", "Latest message"], ["name", "Name"]] as const;
const showOptions = [["status", "What they're doing"], ["preview", "Last message"], ["time", "Time"], ["badges", "Domain badge"]] as const;
/** Row heights at comfortable density, including the gap below; used to say how many rows fit. */
const rowHeights = { detailed: 52, compact: 36 };

/** `shown`: the roster as sorted now; `nav`: the roster list, measured to say how many rows fit. */
export function RosterOptions({ shown, view, onView, now, nav }: {
  shown: RosterEntry[]; view: RosterView; onView: (patch: Partial<RosterView>) => void; now: number; nav: RefObject<HTMLElement | null>;
}) {
  const crew = shown.filter((entry) => entry.agent.id !== atlasId);
  const waiting = shown.filter((entry) => attention(entry) === 0).length;
  const busy = crew.filter((entry) => entry.presence.kind !== "idle");
  const latest = sortedBy(crew, "recent")[0];
  const byName = sortedBy(crew, "name");
  const sample = busy.find((entry) => entry.last) ?? crew.find((entry) => entry.last) ?? shown[0];
  const badges = [...new Set(shown.map((entry) => entry.emoji).filter(Boolean))];
  const changes = (Object.keys(initialRosterView) as (keyof RosterView)[])
    .filter((key) => key !== "others" && view[key] !== initialRosterView[key]).length;
  const detailsAvailable = showOptions.filter(([key]) => !(key === "preview" && view.rows === "compact"));
  const detailsOn = detailsAvailable.filter(([key]) => view[key]).length;
  const [fit, setFit] = useState({ detailed: 0, compact: 0 });
  function measureFit() {
    const list = nav.current;
    const row = list?.querySelectorAll<HTMLElement>(".roster-row")[1];
    if (!list || !row) return;
    // shortcut: the other size is scaled from comfortable-density heights; measure both rows if densities diverge further.
    const scale = (row.offsetHeight + (view.rows === "detailed" ? 2 : 0)) / rowHeights[view.rows];
    const lines = [...list.querySelectorAll<HTMLElement>(".roster-section, .roster-more")].reduce((sum, line) => sum + line.offsetHeight, 0);
    const room = list.clientHeight - 10 - lines; // Atlas's pinned gap and the section lines
    setFit({ detailed: Math.floor(room / (rowHeights.detailed * scale)), compact: Math.floor(room / (rowHeights.compact * scale)) });
  }
  const sortHint = (value: RosterView["sort"]) => value === "attention" ? (waiting ? `${waiting} waiting on you go first` : "Nobody is waiting on you now")
    : value === "recent" ? (latest?.last?.at ? `${latest.agent.name} wrote last, ${shortTime(latest.last.at, now)}` : "Newest conversation on top")
    : byName.length ? `${byName[0].agent.name} to ${byName[byName.length - 1].agent.name}` : "A to Z";
  const detailHint = (key: (typeof showOptions)[number][0], off: boolean) => key === "status"
    ? (busy.length ? `${busy.length} busy now, e.g. “${presenceLabel(busy[0].presence)}”` : "Nobody is busy right now")
    : key === "preview" ? (off ? "Detailed rows only" : sample?.last ? `“${sample.last.text}”` : "Their latest line")
    : key === "time" ? (latest?.last?.at ? `${shortTime(latest.last.at, now)} today, a weekday this week, else a date` : "When they last wrote")
    : badges.length ? `${badges.join(" ")} on the ${badges.length} who look after a domain` : "Nobody looks after a domain yet";
  return (
    <div id="roster-options" popover="auto" className="roster-options" aria-label="Roster view"
      onToggle={(event) => {
        if (event.newState !== "open") return;
        measureFit();
        // Anchored below the button, it may run past the window; cap it there and let it scroll.
        const panel = event.currentTarget;
        panel.style.maxHeight = `${innerHeight - panel.getBoundingClientRect().top - 16}px`;
      }}>
      <div className="roster-options-head">
        <strong>Roster view</strong>
        {changes > 0 && (
          <Tip label="Back to the recommended view"><button type="button" className="roster-reset" onClick={() => onView({ ...initialRosterView, others: view.others })}>
            Reset {changes} {changes === 1 ? "change" : "changes"}
          </button></Tip>
        )}
      </div>
      {/* What you get, live: one real row in the chosen view, before you close the panel. */}
      {sample && (
        <div className="roster-preview" inert data-rows={view.rows}>
          <RosterRow entry={sample} index={0} view={view} open={false} now={now} />
        </div>
      )}
      <fieldset className="roster-choices">
        <legend>Order</legend>
        {sortOptions.map(([value, label]) => (
          <label key={value} className="roster-choice">
            <input type="radio" name="roster-sort" checked={view.sort === value} onChange={() => onView({ sort: value })} />
            <span>
              <strong>{label}{value === initialRosterView.sort && <em>Recommended</em>}</strong>
              <small>{sortHint(value)}</small>
            </span>
            <AvatarStack agents={sortedBy(crew, value).slice(0, 3).map((entry) => entry.agent)} size={20} />
          </label>
        ))}
      </fieldset>
      <fieldset className="roster-sizes">
        <legend>Rows</legend>
        {(["detailed", "compact"] as const).map((rows) => (
          <label key={rows} className="roster-size">
            <input type="radio" name="roster-rows" checked={view.rows === rows} onChange={() => onView({ rows })} />
            <span className="roster-size-sketch" data-rows={rows} aria-hidden="true"><i /><i /><i /></span>
            <strong>{rows === "detailed" ? "Detailed" : "Compact"}</strong>
            <small>{!fit[rows] ? "\u00a0" : fit[rows] >= shown.length ? `All ${shown.length} fit` : `${fit[rows]} of ${shown.length} fit`}</small>
          </label>
        ))}
      </fieldset>
      <fieldset className="roster-details">
        <legend>
          Details<span className="roster-meter" aria-hidden="true">{detailsAvailable.map(([key], index) => <i key={key} data-on={index < detailsOn || undefined} />)}</span>
          <small>{detailsOn} of {detailsAvailable.length} on</small>
        </legend>
        {showOptions.map(([key, label]) => {
          const off = key === "preview" && view.rows === "compact";
          return (
            <label key={key} className="switch-row roster-switch">
              <input type="checkbox" role="switch" checked={view[key] && !off} disabled={off}
                onChange={(event) => onView({ [key]: event.target.checked })} />
              <span className="switch" aria-hidden="true" />
              <span>
                <strong>{label}</strong>
                <small>{detailHint(key, off)}</small>
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}
