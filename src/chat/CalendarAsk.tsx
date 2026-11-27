// An agent asking for Google Calendar access under its reply (agents-design D83): Allow gives it that rung, keeping
// what else Settings → Connections says about it (while you're away, which calendars); once it has the rung, Ask again
// sends your question once more. Without a connection it points to Settings. It asks; only your tap changes anything.
// Styles: `.calendar-ask` in agents.css.
import { useEffect, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { useApp } from "../appContext.ts";
import { GoogleCalendarMark } from "../BrandMarks.tsx";
import { connections } from "../connections.ts";
import { calendarAccess, calendarLevels } from "../model.ts";
import type { Agent, CalendarLevel } from "../model.ts";

const asks: Record<CalendarLevel, string> = {
  off: "", free: "see when you're free", events: "read your events", add: "read your events and offer Add",
};

export function CalendarAsk({ level, agent, threadId, question, readOnly }: {
  level: CalendarLevel; agent: Agent; threadId: string;
  /** Your message this reply answered, which Ask again sends once more from where you asked it. */
  question?: { text: string; from?: string };
  readOnly: boolean;
}) {
  const { actions, conversations } = useApp();
  const linked = useSyncExternalStore(connections.subscribe, connections.getSnapshot);
  useEffect(() => { if (linked.status === "idle") void connections.load(); }, [linked.status]);
  if (linked.status !== "ready") return null;
  const access = calendarAccess(agent);
  const has = calendarLevels.indexOf(access.level) >= calendarLevels.indexOf(level);
  const settings = () => actions.openSettings("connections");
  return (
    <div className="calendar-ask" role="group" aria-label={`${agent.name} asks to use Google Calendar`} data-done={has || undefined}>
      <span className="calendar-ask-mark" aria-hidden="true">{has ? <Check size={14} /> : <GoogleCalendarMark size={14} />}</span>
      {!linked.calendar ? <>
        <p>{agent.name} needs Google Calendar for this, and it isn't connected.</p>
        {!readOnly && <button type="button" className="secondary-button" onClick={settings}>Connect in Settings</button>}
      </> : has ? <>
        <p>{agent.name} can {asks[level]} now.</p>
        {!readOnly && question && <button type="button" className="secondary-button"
          onClick={() => void conversations.send(threadId, question.text, question.from ?? "")}>Ask again</button>}
      </> : <>
        <p>Let {agent.name} {asks[level]} in Google Calendar?</p>
        {!readOnly && <>
          <button type="button" className="secondary-button" onClick={() => actions.setAgentAccess(agent.id, { calendar: { ...access, level } })}>Allow</button>
          <button type="button" className="text-button" onClick={settings}>More in Settings</button>
        </>}
      </>}
    </div>
  );
}
