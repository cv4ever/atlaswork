// The agent dialog's Permissions tab: proactive or asks first, which tools they may use (only differences from the
// defaults are stored), and whom they ask without checking with you first (D50).
import { Hand, X, Zap } from "lucide-react";
import type { AtlasMark } from "../agentDrafts.ts";
import * as crews from "../agents.ts";
import { ToolSections } from "../AgentSettingsParts.tsx";
import { formatDate } from "../dates.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { atlasId, calendarAccess, canUse, toolDefault } from "../model.ts";
import type { Agent, ToolId, WorkspaceData } from "../model.ts";
import { Tip } from "../Popups.tsx";
import { GoogleCalendarMark } from "../BrandMarks.tsx";
import { calendarOffered } from "../connections.ts";

/** An agent's Google Calendar access in a few words (agents-design D83), as Settings → Connections sets it. */
function calendarWords(agent: Agent) {
  const access = calendarAccess(agent);
  if (access.level === "off") return "off";
  const what = { free: "free time only", events: "reads events", add: "reads events and offers Add" }[access.level];
  return `${what}, ${access.away ? "also while you're away" : "only while you're here"}`;
}

export function PermissionsTab({ draft, data, atlas, onChange }: {
  draft: Agent;
  data: WorkspaceData;
  atlas?: AtlasMark;
  onChange: (patch: Partial<Agent>) => void;
}) {
  const portraitSrc = usePortraitSrc();
  const crew = data.agents.filter((agent) => !agent.archived && agent.id !== atlasId && agent.id !== draft.id);
  const proactive = crew.filter((agent) => agent.writeMode === "full").length;
  // Who they ask without checking with you first (D50): added from a question's "Always let … ask". Atlas asks nobody.
  const trusted = (draft.mayAsk ?? []).flatMap((id) => data.agents.find((agent) => agent.id === id && !agent.archived) ?? []);
  return <>
    {draft.id === atlasId && <p className="agent-hint">Atlas can always use every tool, so a workspace with only Atlas can still do everything. Connections are set for him like anyone.</p>}
    <section className="agent-section" aria-labelledby="agent-initiative">
      <h3 id="agent-initiative">When they find something to do <small>{crew.length ? `${proactive} of ${crew.length} others are proactive` : ""}</small></h3>
      <div className="segmented-control mode-switch" role="radiogroup" aria-labelledby="agent-initiative">
        {([["full", "Proactive", <Zap size={16} />], ["propose", "Asks first", <Hand size={16} />]] as const).map(([mode, label, icon]) => (
          <button key={mode} type="button" role="radio" aria-checked={draft.writeMode === mode}
            onClick={() => onChange({ writeMode: mode })}>{icon}{label}</button>
        ))}
      </div>
      <p className="agent-hint">{!(["see-tasks", "add-tasks", "arrange-pages", "tidy-files"] as const).some((id) => canUse(draft, id))
        ? "See tasks, Add tasks, Arrange pages and Tidy files are off, so there's nothing for them to change."
        : draft.writeMode === "full" ? "Does it, with an Undo in their chat." : "Suggests it. Nothing changes until you tap Apply."}</p>
      {atlas?.flagged.includes("proactive") && draft.writeMode === "full" && <p className="atlas-flag">Atlas made them proactive{atlas.why ? `: ${atlas.why}` : "."}</p>}
    </section>
    <ToolSections isOn={(id) => canUse(draft, id)} disabled={draft.id === atlasId} onChange={(id, on) => {
      // Only differences from the default are stored.
      const rest = Object.fromEntries(Object.entries(draft.tools ?? {}).filter(([key]) => key !== id));
      onChange({ tools: on === toolDefault(id) ? rest : { ...rest, [id]: on } });
    }} flagged={atlas && { ids: atlas.flagged.filter((id): id is ToolId => id !== "proactive"), why: atlas.why }} />
    {calendarOffered && (
      <section className="agent-section" aria-labelledby="agent-connections">
        <h3 id="agent-connections">Connections</h3>
        <p className="agent-hint"><GoogleCalendarMark size={14} /> Google Calendar: {calendarWords(draft)}. Change it in Settings → Connections.</p>
      </section>
    )}
    {draft.id !== atlasId && canUse(draft, "ask-agents") && (
      <section className="agent-section" aria-labelledby="agent-asks">
        <h3 id="agent-asks">Asks without checking with you <small>{trusted.length ? trusted.length : "Nobody"}</small></h3>
        <p className="agent-hint">{trusted.length ? "Questions to these agents go at once; to anyone else, and from routines, they wait for your OK."
          : `Every question waits for your OK. “Always let ${draft.name.trim() || "them"} ask” on a question adds that agent here.`}</p>
        {trusted.length > 0 && (
          <div className="place-chips">
            {trusted.map((agent) => {
              // When they last asked this one, so a pair you let talk but no longer need stands out.
              const last = crews.lastAsked(data, draft.id, agent.id);
              return (
                <span key={agent.id} className="assignment-chip place-chip">
                  <img src={portraitSrc(agent)} alt="" width={16} height={16} />{agent.name}
                  <small>{last ? `last asked ${formatDate(new Date(last), { day: "numeric", month: "short" })}` : "not asked yet"}</small>
                  <Tip label={`Check with you before asking ${agent.name}`}><button type="button" aria-label={`Check with you before asking ${agent.name}`}
                    onClick={() => onChange({ mayAsk: draft.mayAsk!.filter((id) => id !== agent.id) })}><X size={12} /></button></Tip>
                </span>
              );
            })}
          </div>
        )}
      </section>
    )}
  </>;
}
