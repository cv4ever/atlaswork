// A reply's sources line (agents-design D81), above its words: a connected account it read speaks as a chip with the
// service's mark and what it did ("Checked Google Calendar · Mon 24 – Sun 30 Nov"), and one whose grant Google revoked
// offers Reconnect beside it; your own notes, tasks, pages, files and images show only their icon, the words in the
// tooltip (progressive disclosure, docs/page-design.md). Tapping one opens what it read under the line: for the
// calendar, those days' events read fresh from Google (never stored, as on Today's day line, D75); for the rest, its words.
import { useState, useSyncExternalStore } from "react";
import { connections } from "../connections.ts";
import { formatDate } from "../dates.ts";
import type { ToolUse } from "../model.ts";
import { Tip } from "../Popups.tsx";
import type { DayEvent } from "../today/day.ts";
import { SourceIcon } from "./SourceIcon.tsx";
import { sourcesOf } from "./sources.ts";
import type { Source } from "./sources.ts";

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dayHeading = (date: string) => formatDate(Date.parse(`${date}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

type Read = { status: "loading" } | { status: "ready"; days: { date: string; events: DayEvent[] }[] };

/** The calendar's days as Google has them now, each with its events; days with none are left out. */
function CalendarRead({ read }: { read: Read }) {
  if (read.status === "loading") return <p className="source-read-note" role="status">Reading your calendar…</p>;
  const days = read.days.filter((item) => item.events.length);
  if (!days.length) return <p className="source-read-note">Nothing on your calendar those days.</p>;
  return (
    <dl className="source-read-days">
      {days.map(({ date, events }) => (
        <div key={date}>
          <dt>{dayHeading(date)}</dt>
          {events.map((event, index) => (
            <dd key={index}><span>{event.allDay ? "All day" : `${hhmm(event.from)}–${hhmm(event.to)}`}</span>{event.title}</dd>
          ))}
        </div>
      ))}
    </dl>
  );
}

export function Sources({ used, today, onReconnect }: { used: ToolUse[] | undefined; today: string; onReconnect?: () => void }) {
  const sources = sourcesOf(used, today);
  const linked = useSyncExternalStore(connections.subscribe, connections.getSnapshot);
  const [open, setOpen] = useState<Source["kind"] | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  if (!sources.length) return null;
  const calendarLinked = linked.status === "ready" && !!linked.calendar;
  const toggle = (source: Source) => {
    if (open === source.kind) return setOpen(null);
    setOpen(source.kind);
    if (source.kind !== "calendar" || !source.days || read?.status === "ready") return;
    setRead({ status: "loading" });
    void Promise.all(source.days.map(async (date) => ({ date, events: await connections.readDay(date) })))
      .then((days) => setRead({ status: "ready", days }));
  };
  const shown = sources.find((source) => source.kind === open);
  return (
    <div className="message-sources-block">
      <ul className="message-sources" aria-label="What it read">
        {sources.map((source) => {
          // A calendar chip opens its days only while the calendar is still connected; a failed one has nothing to show.
          const opens = source.connection ? !!source.days && calendarLinked : true;
          const face = source.connection
            ? <><SourceIcon kind={source.kind} />{source.label}{source.detail && <small>{source.detail}</small>}</>
            : <SourceIcon kind={source.kind} />;
          const className = source.connection ? "source-chip" : "source-icon";
          return (
            <li key={source.kind} data-connection={source.connection || undefined} data-failed={source.failed || undefined}>
              {opens
                ? <Tip label={source.full}><button type="button" className={className} aria-expanded={open === source.kind}
                    aria-label={source.connection ? undefined : source.full} onClick={() => toggle(source)}>{face}</button></Tip>
                : <Tip label={source.full}><span className={className}>{face}</span></Tip>}
              {source.failed === "disconnected" && onReconnect && <button type="button" className="source-reconnect" onClick={onReconnect}>Reconnect</button>}
            </li>
          );
        })}
      </ul>
      {shown && (
        <div className="source-read">
          {shown.kind === "calendar" && read ? <CalendarRead read={read} /> : <p className="source-read-note">{shown.full}</p>}
        </div>
      )}
    </div>
  );
}
