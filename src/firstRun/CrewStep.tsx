// The first run's Crew step: the crew you have (untick to archive), agents for your domains, for everything, for other
// domains, for work, and the community's. Each card toggles its pick; its arrow opens what they'd say and how they work
// (progressive disclosure). The picks' rules are picks.ts.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, CalendarClock, Check, ChevronDown, Eye, Hand, Users, Zap } from "lucide-react";
import type { SharedAgent } from "../community.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import type { CrewMember, OnboardingStart } from "../onboarding.ts";
import { Tip } from "../Popups.tsx";
import { suggestedAgents } from "../suggestedAgents.ts";
import type { AgentSuggestion } from "../suggestedAgents.ts";
import { Burst } from "../dataBlocks/parts.tsx";
import { cadenceOf, crewGroups, menuOf, placeOf, toggle, toggleElsewhere } from "./picks.ts";
import type { Picked, Picks } from "./picks.ts";
import { Stack } from "./Stack.tsx";
import { Emblem } from "../Emblem.tsx";

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
/** What an expanded card says, as facts with an icon each rather than a paragraph. */
const facts = (items: [ReactNode, string][]) => (
  <ul className="crew-pick-facts">{items.map(([icon, text]) => <li key={text}>{icon}{text}</li>)}</ul>
);
const mode = (writeMode: "full" | "propose"): [ReactNode, string] => writeMode === "full" ? [<Zap key="z" size={12} />, "Acts, with Undo"] : [<Hand key="h" size={12} />, "Asks first"];
const checks = (when: string): [ReactNode, string] => [<CalendarClock key="c" size={12} />, `Suggests improvements on ${when}`];
const sees = (what: string): [ReactNode, string] => [<Eye key="e" size={12} />, what];
/** Their speech bubble: one thing they'd say to you, so you hear what they're for. */
const says = (name: string, line: string) => <p className="crew-pick-says"><span className="sr-only">{name} might say: </span>{line}</p>;
const group = (title: string, hint: string, items: ReactNode, id?: string) => (
  <section className="settings-group" id={id}><h4>{title}<small>{hint}</small></h4><div className="crew-picks">{items}</div></section>
);

export function CrewStep({ start, picks, crewFrom, community, bursts, onPicked }: {
  start: OnboardingStart;
  picks: Picks;
  /** The domains picked when Crew opened: they sort its groups, so a tile ticked further down stays where it is. */
  crewFrom: string[];
  /** null until the community answers; [] when this build has no backend or nobody shared anything. */
  community: SharedAgent[] | null;
  /** How many times each pick was ticked on, so a burst plays per tick. */
  bursts: Record<string, number>;
  onPicked: (picked: Picked) => void;
}) {
  const portraitSrc = usePortraitSrc();
  /** Cards whose details are open, by key. */
  const [open, setOpen] = useState<string[]>([]);
  const { crew } = start;
  const { domainOf } = menuOf(start, picks.own);
  const { forDomains, elsewhere, general, work } = crewGroups(start, picks, crewFrom);
  const picked = (agent: AgentSuggestion) => picks.agents.includes(agent.name);
  /**
   * A pick tile: face, name, role and their one-line hook toggle the pick; the arrow opens what they'd say and how
   * they work (progressive disclosure).
   */
  const crewCard = ({ key, portrait, title, role, tag, details, on, onToggle, hue }: {
    key: string; portrait: string; title: string; role: string; tag: ReactNode; details: ReactNode; on: boolean; onToggle: () => void; hue?: string;
  }) => {
    const expanded = open.includes(key);
    return (
      <div key={key} className="crew-pick" data-on={on || undefined} data-open={expanded || undefined} style={{ "--hue": hue } as CSSProperties}>
        <button type="button" className="crew-pick-main" aria-pressed={on} onClick={onToggle}>
          <span className="crew-pick-face"><img src={portraitSrc({ portrait })} alt="" />
            <span className="pick-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span></span>
          <span className="crew-pick-copy"><strong>{title}</strong><small>{role || "No role yet"}</small><em>{tag}</em></span>
          <Burst count={bursts[key] ?? 0} />
        </button>
        <Tip label={expanded ? "Less" : "What they'd do"}><button type="button" className="crew-pick-more" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} what ${title} does`} onClick={() => setOpen((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])}><ChevronDown size={16} /></button></Tip>
        {expanded && <div className="crew-pick-details">{details}</div>}
      </div>
    );
  };
  const suggestionCard = (agent: AgentSuggestion) => {
    const domain = domainOf(agent.domain);
    return crewCard({ key: agent.name, portrait: agent.portrait, title: agent.name, role: agent.role, on: picked(agent), hue: domain?.hue || undefined,
      onToggle: () => onPicked(elsewhere.includes(agent) ? toggleElsewhere(start, picks, agent) : toggle(picks, "agents", agent.name)),
      tag: domain ? <><Emblem emoji={domain.emoji} /> {agent.why}</> : agent.why,
      details: <>{says(agent.name, agent.says)}
        {facts([sees(placeOf(start, picks, agent)), mode(agent.writeMode), checks(cadenceOf(start, picks, agent.name))])}</> });
  };
  /** Someone already in the crew: a suggested agent's line when they are one, else the start of their own house rules. */
  const memberCard = (agent: CrewMember) => {
    const domain = domainOf(agent.home);
    const on = picks.keeping.includes(agent.id);
    const known = suggestedAgents.find((item) => same(item.name, agent.name));
    return crewCard({ key: agent.id, portrait: agent.portrait, title: agent.name, role: agent.role, on, hue: domain?.hue || undefined,
      onToggle: () => onPicked(toggle(picks, "keeping", agent.id)),
      tag: !on ? "Archived when you finish" : domain ? <><Emblem emoji={domain.emoji} /> {known?.why ?? `Looks after ${domain.name}`}</> : known?.why ?? "On the bench",
      details: <>{known ? says(agent.name, known.says) : <p className="crew-pick-rules">{agent.instructions || "No house rules written."}</p>}
        {facts([sees(domain ? `Looks after ${domain.name}` : "On the bench"), mode(agent.writeMode)])}</> });
  };
  const others = [...general, ...elsewhere, ...work, ...(community ?? [])];
  /**
   * The slot a short row of your domains' agents leaves (Health has two): a tile with the other agents' faces that
   * scrolls down to them, since everyone is already shown below (Carlos, 2026-11-14). A full row gets none.
   */
  const moreTile = forDomains.length % 3 !== 0 && others.length > 0 ? (
    <button key="more" type="button" className="crew-more-tile" onClick={() => document.getElementById("crew-everything")
      ?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}>
      <Stack items={others.map((item, index) => <img key={index} src={portraitSrc(item)} alt="" style={{ "--n": index } as CSSProperties} />)} />
      <strong>{others.length} more agents</strong>
      <small>For every domain, other domains, work{community?.length ? ", the community" : ""}<ArrowDown size={12} aria-hidden="true" /></small>
    </button>
  ) : null;
  return <>
    {crew.length > 0 && group("Your crew now", "Untick to archive; Archive brings them back", crew.map(memberCard))}
    {forDomains.length > 0 && group("For your domains", "Each sees only its domain", [...forDomains.map(suggestionCard), moreTile])}
    {group("For everything", "They see every domain", general.map(suggestionCard), "crew-everything")}
    {elsewhere.length > 0 && group("For other domains", "Ticking one adds its domain", elsewhere.map(suggestionCard))}
    {group("For work and side projects", "Bring in as needed", work.map(suggestionCard))}
    {community === null ? <p className="onboarding-aside">Looking for agents people have shared…</p>
      : community.length > 0 && group("Shared by the community", "Their setup, yours to adjust", community.map((item) => crewCard({
        key: item.id, portrait: item.portrait, title: item.name, role: item.role, tag: "Community", on: picks.shared.includes(item.id), onToggle: () => onPicked(toggle(picks, "shared", item.id)),
        details: <><p className="crew-pick-rules">{item.instructions || "No house rules written."}</p>{facts([mode(item.write_mode), [<Users key="u" size={12} />, "Shared by the community"]])}</> })))}
  </>;
}
