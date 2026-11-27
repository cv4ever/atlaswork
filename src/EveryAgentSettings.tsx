// Settings → Every agent (agents-design D46): house rules every agent reads before its own, the personality agents
// without their own follow, and the tools a new agent starts with. Saved as you go, in the workspace, so every device
// agrees. The model and its thinking stay in AI model; an agent's own choice of either stays in its Profile.
import { useState } from "react";
import { limits } from "../supabase/functions/agent/logic.ts";
import { PersonalitySliders, ToolSections } from "./AgentSettingsParts.tsx";
import { toolDefault } from "./model.ts";
import type { Agent, EveryAgent } from "./model.ts";

export function EveryAgentSection({ value, agents, onChange, onModel }: { value?: EveryAgent; agents: Agent[];
  onChange: (patch: Partial<EveryAgent>) => void;
  /** Opens AI model; absent when there's no account to keep a model in. */
  onModel?: () => void }) {
  // The rules save when you leave the field, not on every key.
  const [rules, setRules] = useState(value?.rules ?? "");
  const live = agents.filter((agent) => !agent.archived);
  const follow = (key: "warmth" | "detail") => live.filter((agent) => agent[key] === undefined).length;
  const tools = value?.tools ?? {};
  return <>
    <section className="settings-group">
      <div className="settings-group-head">
        <h4><label htmlFor="every-agent-rules">House rules for every agent</label></h4>
        <small data-full={rules.length >= limits.everyAgent || undefined}>{rules.length} of {limits.everyAgent}</small>
      </div>
      <div className="settings-card">
        <textarea id="every-agent-rules" rows={4} maxLength={limits.everyAgent} value={rules}
          placeholder="“Answer in Portuguese.” “Prices in euros.” “Never book anything for me.”"
          onChange={(event) => setRules(event.target.value)} onBlur={() => onChange({ rules })} />
      </div>
      <p className="settings-note">All {live.length} agents read these before their own house rules, Atlas included. Where the two differ, theirs win.
        Each agent's Briefing tab shows everything it's told.</p>
    </section>

    <section className="settings-group" aria-labelledby="every-agent-personality">
      <h4 id="every-agent-personality">Personality</h4>
      <div className="settings-card">
        <PersonalitySliders own={{ warmth: value?.warmth, detail: value?.detail }} fallback={{ warmth: 2, detail: 2 }}
          follow={{ tag: "Default", reset: "Back to default" }} onChange={onChange} />
      </div>
      <p className="settings-note">Agents without their own follow these: warmth for {follow("warmth")} of {live.length}, detail for {follow("detail")}.
        The others set theirs in their Profile, where “Follow every agent” brings them back.</p>
    </section>

    <section className="settings-group" aria-labelledby="every-agent-tools">
      <h4 id="every-agent-tools">New agents start with</h4>
      <div className="settings-card every-agent-tools">
        <ToolSections isOn={(id) => tools[id] ?? toolDefault(id)} onChange={(id, on) => {
          const rest = Object.fromEntries(Object.entries(tools).filter(([key]) => key !== id));
          onChange({ tools: on === toolDefault(id) ? rest : { ...rest, [id]: on } });
        }} />
      </div>
      <p className="settings-note">Agents you already have keep their own switches, and Atlas can always use every tool.</p>
    </section>

    <section className="settings-group" aria-labelledby="every-agent-model">
      <h4 id="every-agent-model">Model and thinking</h4>
      <div className="settings-card">
        <div className="setting-row">
          <span><strong>Set in AI model</strong><p>An agent can pick another model, and how hard it thinks, in its Profile.</p></span>
          {onModel && <button type="button" className="secondary-button" onClick={onModel}>Open AI model</button>}
        </div>
      </div>
    </section>
  </>;
}
