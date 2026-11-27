// Settings → Connections (agents-design D74, D83): the accounts agents can use, each with who may use it and how. Google
// Calendar first: connect it, then give each agent a rung (Off, Free time, Events, Events + Add), and under its chevron
// whether it also reads while you're away and which of your calendars. Each row says when that agent last read it; right
// after connecting, a suggested setup fills the rungs in one tap; Disconnect asks first. Signed in only: the connection
// lives with the account, on the server; each agent's access lives on the agent and saves as you change it.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, ChevronDown, LogIn, Plug, Sparkles, Unplug } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import { GoogleCalendarMark } from "../BrandMarks.tsx";
import { calendarReads, suggestedAccess } from "../connectionAccess.ts";
import { connections } from "../connections.ts";
import type { CalendarConnection, ShownCalendar } from "../connections.ts";
import { formatDate } from "../dates.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { atlasId, byId, calendarAccess, calendarLevels } from "../model.ts";
import type { Agent, CalendarAccess, CalendarLevel, WorkspaceData } from "../model.ts";
import { Tip } from "../Popups.tsx";
import { editedAgo } from "../StatusBar.tsx";

/** Not now on the suggested setup holds on this device. */
const setupKey = "atlaswork.calendar-setup-dismissed";
const stored = () => { try { return localStorage.getItem(setupKey) === "1"; } catch { return false; } };

const levels: Record<CalendarLevel, { label: string; hint: string }> = {
  off: { label: "Off", hint: "Can't use your calendar" },
  free: { label: "Free time", hint: "Busy and free times only, no titles: enough to say when something fits" },
  events: { label: "Events", hint: "Free time, plus each event's title, time and calendar. Never descriptions or guests" },
  add: { label: "Events + Add", hint: "Events, plus dates it hands you with an Add to Google Calendar button. Nothing goes in until you tap it" },
};

export function ConnectionsSection({ signedIn, onAccount, data, now, onAccess }: {
  signedIn: boolean; onAccount: () => void; data: WorkspaceData;
  /** The clock the rows' "Read it 2 hr ago" counts from. */
  now: number;
  onAccess: (agentId: string, access: NonNullable<Agent["access"]>) => void;
}) {
  const state = useSyncExternalStore(connections.subscribe, connections.getSnapshot);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (signedIn) void connections.load(); }, [signedIn]);
  if (!signedIn) return (
    <div className="settings-empty">
      <span aria-hidden="true">🔌</span>
      <p>Sign in first: a connection lives with your account, so agents can use it on every device and while you're away.</p>
      <button className="primary-button" onClick={onAccount}><LogIn size={16} />Go to Account</button>
    </div>
  );
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "That didn't work. Try again."); } finally { setBusy(false); }
  };
  const calendar = state.status === "ready" ? state.calendar : undefined;
  return <>
    {state.status === "error" && <p className="field-error" role="alert">{state.message}</p>}
    {state.status === "loading" && <p className="settings-note" role="status">Checking your connections…</p>}
    {calendar && (
      <section className="settings-group" aria-labelledby="connections-on">
        <h4 id="connections-on">Connected</h4>
        <CalendarCard connection={calendar} data={data} now={now} busy={busy} onAccess={onAccess}
          onDisconnect={() => void run(() => connections.disconnectCalendar())} />
      </section>
    )}
    {state.status === "ready" && !calendar && (
      <section className="settings-group" aria-labelledby="connections-add">
        <h4 id="connections-add">Add a connection</h4>
        <div className="settings-card conn-card">
          <div className="conn-head">
            <span className="conn-mark" aria-hidden="true"><GoogleCalendarMark size={18} /></span>
            <div className="conn-title"><strong>Google Calendar</strong>
              <small>Agents you choose find free time and read your events. Nothing goes in until you tap Add.</small></div>
            <button className="secondary-button" disabled={busy} onClick={() => void run(() => connections.connectCalendar())}>
              <Plug size={16} />{busy ? "Opening Google…" : "Connect"}</button>
          </div>
        </div>
      </section>
    )}
    {error && <p className="field-error" role="alert">{error}</p>}
    {/* Google asks for the in-product notice (agents-design D83): what's read, where it goes, that nothing is kept. */}
    <p className="settings-note">{calendar ? "New agents start with it off. " : "Once it's connected, you choose which agents can use it, and how. "}
      What an agent reads goes to the AI model answering it, for that reply only; events aren't kept or used to train models.{" "}
      <a href="https://atlaswork.app/privacy#google-calendar" target="_blank" rel="noopener noreferrer">How we handle your calendar</a></p>
  </>;
}

type Calendars = { status: "loading" } | { status: "ready"; list: ShownCalendar[] } | { status: "error"; message: string };

/** One connected Google Calendar: who it is, Disconnect (asked first), a first setup, and the agents who may use it, folding behind their faces. */
function CalendarCard({ connection, data, now, busy, onAccess, onDisconnect }: {
  connection: CalendarConnection; data: WorkspaceData; now: number; busy: boolean;
  onAccess: (agentId: string, access: NonNullable<Agent["access"]>) => void; onDisconnect: () => void;
}) {
  const portraitSrc = usePortraitSrc();
  const crew = data.agents.filter((agent) => !agent.archived).sort((a, b) => Number(b.id === atlasId) - Number(a.id === atlasId));
  const using = crew.filter((agent) => calendarAccess(agent).level !== "off");
  const reads = useMemo(() => calendarReads(data), [data]);
  const suggestions = useMemo(() => suggestedAccess(data), [data]);
  const [open, setOpen] = useState(true);
  const [unfolded, setUnfolded] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [dismissed, setDismissed] = useState(stored);
  const [calendars, setCalendars] = useState<Calendars>({ status: "loading" });
  useEffect(() => {
    let live = true;
    connections.listCalendars().then((list) => { if (live) setCalendars({ status: "ready", list }); },
      (cause: unknown) => { if (live) setCalendars({ status: "error", message: cause instanceof Error ? cause.message : "Google Calendar didn't answer." }); });
    return () => { live = false; };
  }, []);
  const since = connection.since ? ` · since ${formatDate(new Date(connection.since), { day: "numeric", month: "short", year: "numeric" })}` : "";
  const shown = calendars.status === "ready" ? calendars.list : [];
  const agents = byId(data.agents);
  const notNow = () => {
    setDismissed(true);
    try { localStorage.setItem(setupKey, "1"); } catch { /* private mode: it shows again next time */ }
  };
  return (
    <div className="settings-card conn-card">
      <div className="conn-head">
        <span className="conn-mark" aria-hidden="true"><GoogleCalendarMark size={18} /></span>
        <div className="conn-title"><strong>Google Calendar</strong>
          <small>{connection.account ? `Connected as ${connection.account}` : "Connected"}{since}{shown.length ? ` · ${shown.length} calendar${shown.length === 1 ? "" : "s"}` : ""}</small></div>
        {!confirming && <button className="secondary-button" disabled={busy} onClick={() => setConfirming(true)}><Unplug size={16} />Disconnect</button>}
      </div>
      {confirming && (
        <div className="conn-confirm" role="alertdialog" aria-labelledby="conn-confirm-title">
          <p id="conn-confirm-title"><strong>Disconnect Google Calendar?</strong> Agents stop reading it at once, and connecting again goes
            through Google's page. Who may use it stays as you set it.</p>
          <div className="settings-actions">
            <button className="primary-button danger-button" disabled={busy} onClick={() => { setConfirming(false); onDisconnect(); }}><Unplug size={16} />Disconnect</button>
            {/* Keep it takes focus, so Enter backs out rather than disconnecting. */}
            <button className="secondary-button" ref={(button) => button?.focus()} onClick={() => setConfirming(false)}>Keep it</button>
          </div>
        </div>
      )}
      {!dismissed && suggestions.length > 0 && (
        <div className="conn-setup" aria-labelledby="conn-setup-title">
          <p id="conn-setup-title"><Sparkles size={14} aria-hidden="true" /><strong>A first setup</strong> Atlas keeps all of it; these agents get what their work needs.</p>
          <ul>
            {suggestions.map((suggestion) => {
              const agent = agents.get(suggestion.agentId)!;
              return (
                <li key={suggestion.agentId}>
                  <img className="conn-face" src={portraitSrc(agent)} alt="" width={24} height={24} />
                  <span><strong>{agent.name} · {levels[suggestion.level].label}</strong><small>{suggestion.why}</small></span>
                </li>
              );
            })}
          </ul>
          <div className="settings-actions">
            <button className="primary-button" onClick={() => {
              for (const suggestion of suggestions)
                onAccess(suggestion.agentId, { calendar: { ...calendarAccess(agents.get(suggestion.agentId)!), level: suggestion.level } });
            }}><Check size={16} />Use this setup</button>
            <button className="secondary-button" onClick={notNow}>Not now</button>
          </div>
        </div>
      )}
      <button className="conn-who-toggle" aria-expanded={open} aria-controls="conn-calendar-agents" onClick={() => setOpen(!open)}>
        <span>Who can use it</span>
        {!open && using.length > 0 && <AvatarStack agents={using} size={24} />}
        <small>{using.length} of {crew.length} agents</small>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <ul className="conn-agents" id="conn-calendar-agents">
          {crew.map((agent) => (
            <AgentRow key={agent.id} agent={agent} calendars={calendars} lastRead={reads.get(agent.id)} now={now} unfolded={unfolded === agent.id}
              onUnfold={(on) => setUnfolded(on ? agent.id : undefined)} onChange={(calendar) => onAccess(agent.id, { calendar })} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One agent's rung, and under its chevron whether it reads while you're away and which calendars. Its line says when it
 * last read the calendar, and in clay when calendars it was given are gone from Google.
 */
function AgentRow({ agent, calendars, lastRead, now, unfolded, onUnfold, onChange }: {
  agent: Agent; calendars: Calendars; lastRead?: string; now: number; unfolded: boolean; onUnfold: (on: boolean) => void;
  onChange: (access: CalendarAccess) => void;
}) {
  const portraitSrc = usePortraitSrc();
  const access = calendarAccess(agent);
  const off = access.level === "off";
  const shown = calendars.status === "ready" ? calendars.list : [];
  // Calendars it reads that you still show; none named means every one, including any you show later.
  const reads = access.calendars ? shown.filter((calendar) => access.calendars!.includes(calendar.id)) : shown;
  const gone = calendars.status === "ready" && access.calendars ? access.calendars.length - reads.length : 0;
  const used = lastRead ? `Read it ${editedAgo(lastRead, now)}` : "Hasn't read it yet";
  const warning = off || !gone ? "" : !reads.length ? "Its calendars are gone: pick again"
    : `${gone === 1 ? "1 of its calendars is" : `${gone} of its calendars are`} gone`;
  const summary = off ? lastRead ? `${agent.role ? `${agent.role} · ` : ""}last read it ${editedAgo(lastRead, now)}` : agent.role
    : [used, access.away ? "also while you're away" : "only while you're here",
      !access.calendars ? "every calendar" : shown.length ? `${reads.length} of ${shown.length} calendars` : ""].filter(Boolean).join(" · ");
  const toggle = (id: string) => {
    const next = reads.some((calendar) => calendar.id === id) ? reads.filter((calendar) => calendar.id !== id)
      : [...reads, ...shown.filter((calendar) => calendar.id === id)];
    const { calendars: _all, ...rest } = access;
    onChange(next.length === shown.length ? rest : { ...rest, calendars: next.map((calendar) => calendar.id) });
  };
  const detail = `conn-calendar-${agent.id}`;
  return (
    <li data-off={off || undefined} data-open={(unfolded && !off) || undefined}>
      <div className="conn-agent">
        <img className="conn-face" src={portraitSrc(agent)} alt="" width={32} height={32} />
        <div className="conn-agent-name"><strong>{agent.name}</strong>
          {warning ? <small className="conn-warning" title={summary}>{warning}</small> : <small title={summary}>{summary}</small>}</div>
        <div className="segmented-control" role="radiogroup" aria-label={`What ${agent.name} may do with Google Calendar`}>
          {calendarLevels.map((level) => (
            <Tip key={level} label={levels[level].hint}>
              <button role="radio" aria-checked={access.level === level} onClick={() => onChange({ ...access, level })}>{levels[level].label}</button>
            </Tip>
          ))}
        </div>
        <Tip label={unfolded ? "Fewer options" : "While you're away, and which calendars"}>
          <button className="icon-button conn-more" aria-expanded={unfolded && !off} aria-controls={detail} disabled={off}
            aria-label={`More for ${agent.name}: while you're away, and which calendars`} onClick={() => onUnfold(!unfolded)}><ChevronDown size={16} /></button>
        </Tip>
      </div>
      {unfolded && !off && (
        <div className="conn-detail" id={detail}>
          <label className="switch-row">
            <input type="checkbox" role="switch" checked={access.away} onChange={() => onChange({ ...access, away: !access.away })} />
            <span className="switch" aria-hidden="true" />
            <span><strong>Use it while you're away</strong>
              <small>Its routines and work you hand off read it too, not only replies while you're here.</small></span>
          </label>
          <div className="conn-cals">
            <strong>Calendars it reads</strong>
            {calendars.status === "loading" && <small role="status">Reading your calendars…</small>}
            {calendars.status === "error" && <small className="field-error" role="alert">{calendars.message}</small>}
            {calendars.status === "ready" && (
              <div>
                {shown.map((calendar) => {
                  const on = reads.some((item) => item.id === calendar.id);
                  // The last one stays: an agent with Calendar on reads at least one; Off is the rung above. With every one
                  // it had gone, any first pick is allowed.
                  const last = on && reads.length === 1;
                  return (
                    <Tip key={calendar.id} label={last ? "It reads at least one. To stop it reading, pick Off." : calendar.primary ? "Your main calendar, where Add puts events" : calendar.name}>
                      <button className="where-chip" aria-pressed={on} aria-disabled={last || undefined} onClick={() => { if (!last) toggle(calendar.id); }}>
                        {on && <Check size={14} />}{calendar.name || "Untitled"}
                      </button>
                    </Tip>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
