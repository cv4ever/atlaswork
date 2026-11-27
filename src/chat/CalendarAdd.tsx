// "Add to Google Calendar" beside a calendar file an agent handed over (agents-design D74): one tap puts its dated
// tasks in your connected Google Calendar as all-day events. Nothing shows until a calendar is connected; tapping again
// adds nothing twice (each task's id names its event).
import { useState, useSyncExternalStore } from "react";
import { CalendarCheck } from "lucide-react";
import { GoogleCalendarMark } from "../BrandMarks.tsx";
import { connections } from "../connections.ts";
import type { MessageLink } from "../model.ts";

export function CalendarAdd({ events }: { events: NonNullable<MessageLink["events"]> }) {
  const state = useSyncExternalStore(connections.subscribe, connections.getSnapshot);
  const [said, setSaid] = useState<{ busy?: boolean; text?: string; failed?: boolean }>({});
  if (state.status !== "ready" || !state.calendar) return null;
  const add = async () => {
    setSaid({ busy: true });
    try {
      const { added, already } = await connections.addEvents(events);
      setSaid({ text: added ? `Added ${added} to Google Calendar${already ? `, ${already} already there` : ""}` : "Already in Google Calendar" });
    } catch (cause) {
      setSaid({ text: cause instanceof Error ? cause.message : "Google Calendar didn't take them.", failed: true });
    }
  };
  return said.text && !said.failed
    ? <span className="message-link" role="status"><CalendarCheck size={14} />{said.text}</span>
    : <>
      <button type="button" className="message-link" disabled={said.busy} onClick={() => void add()}>
        <GoogleCalendarMark size={14} />{said.busy ? "Adding…" : `Add to Google Calendar`}
      </button>
      {said.failed && <span className="inline-error" role="alert">{said.text}</span>}
    </>;
}
