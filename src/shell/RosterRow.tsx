// One roster row (face, status, last line, time) and how the roster orders and words its agents: what each is doing,
// who needs you first, and when they last wrote.
import type { CSSProperties } from "react";
import { ClipboardCheck, MessageCircleQuestionMark, Sparkles, TriangleAlert } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import { needsYou } from "../agents.ts";
import type { Presence } from "../agents.ts";
import { atlasId } from "../model.ts";
import { formatDate } from "../dates.ts";
import type { RosterView } from "../session.ts";
import { Tip } from "../Popups.tsx";
import type { RosterEntry } from "../view.ts";
import { Emblem } from "../Emblem.tsx";

/** Today a clock time, this week a weekday, otherwise a date; `now` is the minute clock, never read while drawing. */
export function shortTime(at: string, now: number) {
  const date = new Date(at);
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return formatDate(date, { hour: "2-digit", minute: "2-digit" });
  if (now - date.getTime() < 6 * 864e5) return formatDate(date, { weekday: "short" });
  return formatDate(date, { month: "short", day: "numeric" });
}

/** What an agent is doing, in a few words; empty while idle. */
export const presenceLabel = (presence: Presence) => presence.kind === "working" ? "Replying…"
  : presence.kind === "approval" ? `${presence.count} to approve`
  : presence.kind === "question" ? `Asked: ${presence.text}`
  : presence.kind === "stuck" ? presence.reason : "";
const presenceIcons = { approval: ClipboardCheck, question: MessageCircleQuestionMark, stuck: TriangleAlert };
function PresenceMark({ presence }: { presence: Presence }) {
  if (presence.kind === "idle") return null;
  if (presence.kind === "working") return <span className="roster-typing"><i /><i /><i /></span>;
  const Icon = presenceIcons[presence.kind];
  return <Icon size={14} />;
}

/** Needs you (approve, answer, unblock), then working, then unread, then the rest. */
export const attention = (entry: RosterEntry) => needsYou(entry.presence) ? 0
  : entry.presence.kind === "working" ? 1 : entry.unread ? 2 : 3;

/** Atlas stays pinned on top, like a chat app's saved contact; the crew sorts under him. */
export const sortedBy = (entries: RosterEntry[], sort: RosterView["sort"]) => [...entries].sort((a, b) =>
  Number(b.agent.id === atlasId) - Number(a.agent.id === atlasId)
  || (sort === "name" ? a.agent.name.localeCompare(b.agent.name)
    : (sort === "attention" ? attention(a) - attention(b) : 0) || (b.last?.at ?? "").localeCompare(a.last?.at ?? "")));

/** One roster row. The options popover renders one too, inert, as a live preview of the chosen view. */
export function RosterRow({ entry, index, view, open, now, onOpen }: {
  entry: RosterEntry; index: number; view: RosterView; open: boolean; now: number; onOpen?: () => void;
}) {
  const status = view.status ? presenceLabel(entry.presence) : "";
  return (
    <Tip label={status ? `${entry.agent.name}: ${status}` : entry.agent.name}><button className="roster-row" aria-current={open ? "true" : undefined}
      data-needs={status && attention(entry) === 0 ? "" : undefined} style={{ "--hue": entry.hue, "--i": index } as CSSProperties}
    aria-label={`Chat with ${entry.agent.name}${status ? `, ${status}` : ""}${entry.unread ? `, ${entry.unread} unread` : ""}`}
    onClick={onOpen}>
    <span className="roster-avatar" aria-hidden="true">
      <AvatarStack agents={[entry.agent]} size={view.rows === "compact" ? 28 : 36} />
      {view.badges && entry.emoji && <span className="roster-emoji"><Emblem emoji={entry.emoji} /></span>}
      {entry.agent.id === atlasId && <Sparkles className="roster-sparkle" size={14} />}
      {status && <span className="roster-presence" data-kind={entry.presence.kind} />}
      {entry.unread > 0 && <span className="strip-unread">{entry.unread}</span>}
    </span>
    <span className="roster-text" aria-hidden="true">
      <span className="roster-line">
        <strong>{entry.agent.name}</strong>
        {view.rows === "compact" && status && <span className="roster-status" data-kind={entry.presence.kind}><PresenceMark presence={entry.presence} /></span>}
        {/* Atlas's status line already says why he's on top while he has something to approve. */}
        {view.time && entry.last?.at && !(entry.agent.id === atlasId && entry.presence.kind === "approval")
          && <time dateTime={entry.last.at}>{shortTime(entry.last.at, now)}</time>}
      </span>
      {view.rows === "detailed" && (status
        ? <small className="roster-status" data-kind={entry.presence.kind}><PresenceMark presence={entry.presence} /><span>{status}</span></small>
        : <small>{view.preview && entry.last ? `${entry.last.by === "You" ? "You: " : ""}${entry.last.text}` : entry.role}</small>)}
    </span>
        </button></Tip>
  );
}
