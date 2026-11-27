// New agent's ready-made list (agents-design D57): the agents Atlaswork suggests that nobody here is named after, as
// onboarding's cards (D34). Picking one fills the agent dialog to review and save; nothing joins before Save.
import { useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, Eye, Hand, Plus, Zap } from "lucide-react";
import { usePortraitSrc } from "./crewStyle.ts";
import type { Domain, WorkspaceData } from "./model.ts";
import { Tip } from "./Popups.tsx";
import { freeHome, readyMade } from "./suggestedAgents.ts";
import type { AgentSuggestion } from "./suggestedAgents.ts";
import { Emblem } from "./Emblem.tsx";

export default function ReadyMadeAgents({ data, domains, onPick }: {
  data: WorkspaceData;
  /** Live domains, for each card's hue and emoji. */
  domains: Domain[];
  onPick: (suggestion: AgentSuggestion) => void;
}) {
  const portraitSrc = usePortraitSrc();
  const [open, setOpen] = useState<string | null>(null);
  const offered = readyMade(data);
  if (!offered.length) return null;
  const domainOf = (agent: AgentSuggestion) => domains.find((domain) => domain.name === agent.domain);
  const yours = offered.filter((agent) => domainOf(agent));
  const general = offered.filter((agent) => !agent.domain && !agent.work);
  const work = offered.filter((agent) => agent.work);
  const elsewhere = offered.filter((agent) => agent.domain && !domainOf(agent));
  const card = (agent: AgentSuggestion) => {
    const domain = domainOf(agent);
    const home = freeHome(data, agent);
    const expanded = open === agent.name;
    return (
      <div key={agent.name} className="crew-pick" data-open={expanded || undefined} style={{ "--hue": domain?.hue } as CSSProperties}>
        <button type="button" className="crew-pick-main" onClick={() => onPick(agent)} aria-label={`Start from ${agent.name}, ${agent.role}`}>
          <img src={portraitSrc(agent)} alt="" />
          <span className="crew-pick-copy"><strong>{agent.name}</strong><small>{agent.role}</small>
            <em>{domain ? <><Emblem emoji={domain.emoji} /> {agent.why}</> : agent.domain ? `${agent.domain}: ${agent.why}` : agent.why}</em></span>
          <span className="pick-check" aria-hidden="true"><Plus size={14} strokeWidth={3} /></span>
        </button>
        <Tip label={expanded ? "Less" : "What they'd do"}><button type="button" className="crew-pick-more" aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} what ${agent.name} does`} onClick={() => setOpen(expanded ? null : agent.name)}>
          <ChevronDown size={16} /></button></Tip>
        {expanded && <div className="crew-pick-details">
          <p className="crew-pick-says"><span className="sr-only">{agent.name} might say: </span>{agent.says}</p>
          <ul className="crew-pick-facts">
            <li><Eye size={12} />{home ? `Looks after ${home.name}` : "Works where you put them"}</li>
            <li>{agent.writeMode === "full" ? <><Zap size={12} />Acts, with Undo</> : <><Hand size={12} />Asks first</>}</li>
          </ul>
        </div>}
      </div>
    );
  };
  const group = (title: string, agents: AgentSuggestion[]) => agents.length > 0 && (
    <section className="ready-group"><h3>{title}</h3><div className="crew-picks ready-picks">{agents.map(card)}</div></section>
  );
  return (
    <div className="ready-made">
      <h2 className="ready-made-title">Or start from a ready-made one<small>Each comes with a role and house rules you can change before you save.</small></h2>
      {group("For your domains", yours)}
      {group("For everything", general)}
      {group("For work and side projects", work)}
      {elsewhere.length > 0 && (
        <details className="ready-group">
          <summary><h3>For other domains<span className="ready-count">{elsewhere.length}</span></h3></summary>
          <div className="crew-picks ready-picks">{elsewhere.map(card)}</div>
        </details>
      )}
    </div>
  );
}
