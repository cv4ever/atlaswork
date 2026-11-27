// What the project dialog's facts unfold to (D62), one at a time: the finish date, who works on it (lead and team),
// and the steps a fill or a starter brings.
import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { AvatarStack } from "../../AvatarStack.tsx";
import * as crews from "../../agents.ts";
import { addDays } from "../../dates.ts";
import type { Step } from "../../formFill.ts";
import { usePortraitSrc } from "../../crewStyle.ts";
import type { Agent, Team, WorkspaceData } from "../../model.ts";
import { Tip } from "../../Popups.tsx";
import type { StarterProject } from "../../starterProjects.ts";

export function FinishPanel({ today, finish, label, leftWords, dayName, onFinish }: {
  today: string;
  /** The finish day, YYYY-MM-DD, or "" for none. */
  finish: string;
  /** "Done by", or the starter's own question ("When is the race?"). */
  label: string;
  leftWords: string;
  dayName: (day: string) => string;
  onFinish: (day: string) => void;
}) {
  const chips = [[addDays(today, 14), "In 2 weeks"], [addDays(today, 30), "In a month"], [addDays(today, 91), "In 3 months"]] as const;
  const picked = !!finish && !chips.some(([day]) => day === finish);
  return (
    <fieldset className="project-choice project-panel" id="project-finish">
      <legend>{label} <small>{finish ? `${dayName(finish)} · ${leftWords}` : "no finish date"}</small></legend>
      <div className="project-chips" role="radiogroup" aria-label="Done by">
        <button type="button" role="radio" className="where-chip" aria-checked={!finish} onClick={() => onFinish("")}>No date</button>
        {chips.map(([day, chip]) => (
          <Tip key={chip} label={dayName(day)}><button type="button" role="radio" className="where-chip" aria-checked={finish === day} onClick={() => onFinish(day)}>{chip}</button></Tip>
        ))}
        <label className="where-chip capture-pick-day" data-picked={picked || undefined}>
          <CalendarDays size={14} />{picked ? dayName(finish) : "Pick a day"}
          <input type="date" aria-label="Pick a finish day" value={finish} onClick={(event) => event.currentTarget.showPicker?.()}
            onChange={(event) => onFinish(event.target.value)} />
        </label>
      </div>
    </fieldset>
  );
}

export function CrewPanel({ data, agents, lead, team, agentId, onLead, onTeam }: {
  data: WorkspaceData;
  /** Who may lead it: the live crew, with a lead a fill or proposal brings in. */
  agents: Agent[];
  lead?: Agent;
  team?: Team;
  agentId?: string;
  onLead: (agentId?: string) => void;
  onTeam: (teamId?: string) => void;
}) {
  const portraitSrc = usePortraitSrc();
  // The lead's face being pointed at or focused (null: Nobody), named under the faces; otherwise the chosen lead is.
  const [pointing, setPointing] = useState<Agent | null>();
  const named = pointing === undefined ? (lead && !lead.archived ? lead : null) : pointing;
  const hover = (agent: Agent | null) => ({ onMouseEnter: () => setPointing(agent), onMouseLeave: () => setPointing(undefined),
    onFocus: () => setPointing(agent), onBlur: () => setPointing(undefined) });
  return (
    <div className="project-panel" id="project-crew">
      <fieldset className="steward-faces">
        <legend>Leads it</legend>
        <Tip label="Nobody in particular"><label {...hover(null)}>
          <input type="radio" name="project-lead" checked={!lead || lead.archived} aria-label="Nobody in particular" onChange={() => onLead(undefined)} />
          <span className="project-nobody" aria-hidden="true"><X size={14} /></span>
        </label></Tip>
        {agents.map((agent) => (
          <Tip key={agent.id} label={`${agent.name}, ${agent.role}`}><label {...hover(agent)}>
            <input type="radio" name="project-lead" checked={agentId === agent.id} aria-label={`${agent.name}, ${agent.role}`} onChange={() => onLead(agent.id)} />
            <img src={portraitSrc(agent)} alt="" />
          </label></Tip>
        ))}
        <small className="project-lead-name" aria-hidden="true">{named ? <><strong>{named.name}</strong> · {named.role}</> : "Nobody in particular"}</small>
      </fieldset>
      <fieldset className="project-team">
        <legend>Team</legend>
        <div className="project-chips" role="radiogroup" aria-label="Team">
          <button type="button" role="radio" className="where-chip" aria-checked={!team} onClick={() => onTeam(undefined)}>No team</button>
          {data.teams.map((item) => (
            <Tip key={item.id} label={crews.teamMembers(data, item).map((agent) => agent.name).join(", ")}>
              <button type="button" role="radio" className="where-chip" aria-checked={team?.id === item.id} onClick={() => onTeam(item.id)}>
                <AvatarStack agents={crews.teamMembers(data, item)} size={20} />{item.name}</button></Tip>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function StepsPanel({ steps, starter, isNew, dayName, onSteps }: {
  /** Steps a fill brought, added at Save; otherwise a starter's own first steps show. */
  steps?: Step[];
  starter?: StarterProject;
  isNew: boolean;
  dayName: (day: string) => string;
  onSteps: (steps: Step[]) => void;
}) {
  if (steps?.length) return (
    <div className="project-panel" id="project-steps">
      <ol className="project-first-steps project-filled-steps">{steps.map((step, index) => (
        <li key={`${index}-${step.title}`}><div><span>{step.title}</span>{step.due && <small>{dayName(step.due)}</small>}
          <Tip label={`Leave out “${step.title}”`}><button type="button" className="icon-button" aria-label={`Leave out “${step.title}”`}
            onClick={() => onSteps(steps.filter((_, at) => at !== index))}>
            <X size={14} /></button></Tip></div></li>
      ))}</ol>
      <p className="widget-caption">{isNew ? "Added when you start it" : "Added when you save"}; a step without a day lands on the next days.</p>
    </div>
  );
  return starter ? (
    <div className="project-panel" id="project-steps">
      <ol className="project-first-steps">{starter.tasks.map((task) => <li key={task}>{task}</li>)}</ol>
      <p className="widget-caption">Due over the next days, on a page laid out for this kind of project. {starter.tip}</p>
    </div>
  ) : null;
}
