// The sidebar's Agents tab: Atlas pinned on top, the selected domain's crew under its name, everyone else folded, each
// row an agent (face, status, last line, time), and the options popover for its order, row size and details.
import { useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus, SlidersHorizontal } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import { atlasId } from "../model.ts";
import type { RosterView } from "../session.ts";
import { Tip } from "../Popups.tsx";
import type { RosterEntry } from "../view.ts";
import { RosterOptions } from "./RosterOptions.tsx";
import { RosterRow, sortedBy } from "./RosterRow.tsx";
import { Emblem } from "../Emblem.tsx";

export function SidebarRoster({ roster, view, onView, now, domain, isOpen, onOpenChat, onEditDomain, onNewAgent }: {
  /** Atlas first, then the crew by latest message. */
  roster: RosterEntry[];
  view: RosterView;
  onView: (patch: Partial<RosterView>) => void;
  /** The minute clock, for the rows' times. */
  now: number;
  /** The selected domain, whose crew is listed under its name. */
  domain: { name: string; emoji?: string };
  /** Whether a thread is open in the chat panel or as the page, highlighted here. */
  isOpen: (thread: string) => boolean;
  onOpenChat: (thread: string) => void;
  onEditDomain: (name: string) => void;
  onNewAgent: () => void;
}) {
  const shown = sortedBy(roster, view.sort);
  // Atlas on top, then the selected domain's crew under its name, then everyone else, which folds.
  const atlasEntry = shown.find((entry) => entry.agent.id === atlasId);
  const hereCrew = shown.filter((entry) => entry.here && entry.agent.id !== atlasId);
  const otherCrew = shown.filter((entry) => !entry.here && entry.agent.id !== atlasId);
  // Agents you've never talked to are the hiring shelf, not your chats: each section folds them behind "N more".
  const [shelfOpen, setShelfOpen] = useState({ here: false, others: false });
  const rosterNav = useRef<HTMLElement>(null);
  // Roster rows count up across the sections, so the cards deal in one after another.
  let rowIndex = 0;
  const rosterRow = (entry: RosterEntry) => (
    <RosterRow key={entry.thread} entry={entry} index={rowIndex++} view={view} now={now}
      open={isOpen(entry.thread)} onOpen={() => onOpenChat(entry.thread)} />
  );
  const talkedTo = (entry: RosterEntry) => !!entry.last || entry.unread > 0 || entry.presence.kind !== "idle";
  function crewGroup(key: "here" | "others", entries: RosterEntry[]) {
    const quiet = entries.filter((entry) => !talkedTo(entry));
    return <>
      {entries.filter(talkedTo).map(rosterRow)}
      {quiet.length > 0 && (shelfOpen[key] ? <>
        {quiet.map(rosterRow)}
        <button className="nav-item nav-add roster-more" onClick={() => setShelfOpen({ ...shelfOpen, [key]: false })}>
          <ChevronUp size={16} /><span>Show fewer</span></button>
      </> : (
        <Tip label={`Not talked to yet: ${quiet.map((entry) => entry.agent.name).join(", ")}`}>
          <button className="nav-item nav-add roster-more" onClick={() => setShelfOpen({ ...shelfOpen, [key]: true })}>
            <AvatarStack agents={quiet.slice(0, 3).map((entry) => entry.agent)} size={20} /><span>{quiet.length} more</span>
          </button></Tip>
      ))}
    </>;
  }
  return (
    <div id="sidebar-agents" className="sidebar-panel" role="tabpanel" aria-labelledby="sidebar-tab-agents">
      <RosterOptions shown={shown} view={view} onView={onView} now={now} nav={rosterNav} />
      {/* A chat app's contact list: each row opens that agent's own thread as the page, the list staying beside it. */}
      {/* Keyed by the view so a new sort or row size deals the cards in again. */}
      <nav ref={rosterNav} key={`${view.sort}|${view.rows}`} className="sidebar-roster" aria-label="Agents" data-rows={view.rows}>
        {atlasEntry && rosterRow(atlasEntry)}
        {/* The selected domain's crew under its name; Sort and display sits at the end of that line. Each section is
            a labelled group, so screen readers hear where one ends. */}
        <div className="roster-group" role="group" aria-labelledby="roster-here">
          <div className="roster-section">
            <span className="roster-section-name"><span aria-hidden="true"><Emblem emoji={domain.emoji} /></span><span id="roster-here">{domain.name}</span>
              <span className="roster-count">{hereCrew.length}</span></span>
            <Tip label="Sort and display"><button className="icon-button roster-options-button" popoverTarget="roster-options" aria-label="Roster options">
              <SlidersHorizontal size={16} />
            </button></Tip>
          </div>
          {hereCrew.length ? crewGroup("here", hereCrew) : (
            <p className="roster-empty"><span className="roster-wave">👋</span> Only Atlas works in {domain.name}. <button onClick={() => onEditDomain(domain.name)}>Give it an agent</button></p>
          )}
        </div>
        {otherCrew.length > 0 && <div className="roster-group" role="group" aria-labelledby="roster-others">
          <button className="roster-section roster-fold" aria-expanded={view.others} onClick={() => onView({ others: !view.others })}>
            <span className="roster-section-name"><ChevronDown size={14} aria-hidden="true" /><span id="roster-others">Everyone else</span>
              <span className="roster-count">{otherCrew.length}</span></span>
          </button>
          {view.others && crewGroup("others", otherCrew)}
        </div>}
        <Tip label="New agent"><button className="nav-item nav-add roster-add" onClick={onNewAgent}><Plus size={16} /><span>New agent</span></button></Tip>
      </nav>
    </div>
  );
}
