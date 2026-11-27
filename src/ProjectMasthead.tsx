// A project page's masthead (agents-design D38, docs/page-design.md): one band, edge to edge, in the theme's second
// tone, in the domain masthead's two rows. Row one: the growth-stage plant, the title with its edit pencil and the
// actions, ending with who leads (a face and a chevron that open the menu changing who leads, or a dashed "pick who
// leads") and the crew's chat button as faces. Row two: the outcome line, and on its right the stage chip (clay when
// the clock is ahead of the work; left out while the brief itself says "We're behind"), progress and the next due
// step. The team and the domain's agent are set in the project dialog, behind the pencil. Under the band, opening the
// page, the managing agent's brief (D40, `brief.ts`): the guide head from the first morning, a new project's welcome
// with its tips included. An agent's face shows once: while it speaks in the brief, the band draws it as a speech mark
// instead. Dismissed, the brief shrinks to a speech icon among the actions until it has something new to say.
// Everything it changes goes through the callbacks: it owns no data. A folder linked in a browser (FolderLink, D47) is
// that device's, not the workspace's, so it keeps its own state; one on a computer (D77) is the project's (`onFolder`).
import { ChevronDown, MessageCircle, Plus, SlidersHorizontal, UserRoundMinus, UserRoundPlus } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { PageBand } from "./PageBand.tsx";
import { Picker, Tip } from "./Popups.tsx";
import { AvatarStack } from "./AvatarStack.tsx";
import type { Brief, BriefAction } from "./brief.ts";
import { BriefBubble, BriefNote } from "./BriefView.tsx";
import { isSpeaking } from "./brief.ts";
import FolderLink from "./FolderLink.tsx";
import type { BriefState } from "./brief.ts";
import { atlasId } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { projectInk } from "./look.ts";
import { formatDate } from "./dates.ts";
import type { Agent, ComputerFolder, Places, Project, Task, WorkspaceData } from "./model.ts";
import { paceOf } from "./pace.ts";
import Plant from "./Plant.tsx";
import * as crews from "./agents.ts";
import { readyMade } from "./suggestedAgents.ts";
import type { AgentSuggestion } from "./suggestedAgents.ts";

type Props = {
  project: Project;
  data: WorkspaceData;
  /** The project's live tasks; `done` ones count as steps taken. */
  tasks: Task[];
  today: string;
  onEdit: () => void;
  onCustomize: () => void;
  onAssign: (patch: Pick<Project, "agentId">) => void;
  /** A ready-made agent joins the crew to lead it (`Actions.bringInLead`). */
  onBringIn: (suggestion: AgentSuggestion) => void;
  onNewAgent: (places: Partial<Places>) => void;
  onChat: (thread: string) => void;
  /** Sets or clears the project's folder on one of the account's computers (D77). */
  onFolder: (folder: ComputerFolder | undefined) => void;
  /** What the managing agent has to say here, if anything (`briefOf`). */
  brief: Brief | null;
  /** The brief's agent is in the open chat panel, so the brief shows as its speech icon only. */
  hushed: boolean;
  /** This device's last-seen key and the workspace's mark for this project (`BriefState`). */
  briefState: BriefState;
  onBriefState: (patch: BriefState) => void;
  onBriefAction: (action: BriefAction) => void;
};

const dayOf = (day: string) => formatDate(new Date(`${day}T12:00:00`), { weekday: "short", day: "numeric", month: "short" });

export default function ProjectMasthead({
  project, data, tasks, today, onEdit, onCustomize, onAssign, onBringIn, onNewAgent, onChat, onFolder, brief, hushed, briefState, onBriefState, onBriefAction,
}: Props) {
  const { done, total, stage, behind, nextDue } = paceOf(project, tasks, today);
  const speaking = brief && isSpeaking(brief, briefState, hushed) ? brief.agent.id : "";
  const steps = `${total ? `${done} of ${total} steps done` : "No steps yet"}${nextDue ? `, next ${nextDue < today ? "was due" : "due"} ${dayOf(nextDue)}` : ""}`;
  // While the brief says "We're behind", the strip doesn't say it again: it keeps the bar and the count.
  const saidBehind = behind && !!speaking && brief?.kind === "behind";
  return (<>
    <PageBand title={project.title} line={project.description} tile={<Plant stage={stage} />} hue={projectInk(project)} className="project-masthead"
      edit={{ label: "Edit project", onClick: onEdit }}
      actions={<>
        {brief && !speaking && <BriefNote brief={brief} hushed={hushed && brief.key !== briefState.dismissed} onState={onBriefState} />}
        <FolderLink project={project} onFolder={onFolder} />
        <Tip label="Customize this page"><button className="icon-button widgets-button" aria-label="Customize this page" onClick={onCustomize}><SlidersHorizontal size={18} /></button></Tip>
        <Crew project={project} data={data} speaking={speaking} onAssign={onAssign} onBringIn={onBringIn} onNewAgent={onNewAgent} onChat={onChat} />
      </>}
      foot={<p className="masthead-stage" title={steps}>
        {!saidBehind && (
          <span className="stage-chip" data-behind={behind || undefined} title={behind ? "More of the time has gone than of the steps. Time to push." : stage.label}>
            {behind ? "Behind" : stage.label}
          </span>
        )}
        <span className="progress-track" aria-hidden="true"><span style={{ transform: `scaleX(${total ? done / total : 0})` }} /></span>
        {/* On a narrow band the sentence gives way to its count; the whole line is the strip's tooltip. */}
        <span className="masthead-steps">{steps}</span>
        {total > 0 && <span className="masthead-count" aria-hidden="true">{done}/{total}</span>}
      </p>} />
    {speaking && brief && <BriefBubble brief={brief} state={briefState} onState={onBriefState} onAct={onBriefAction} />}
  </>);
}

/** A crew member's face, or a speech mark while that agent speaks in the brief under the band (one face per agent). */
function Face({ agent, speaking }: { agent: Agent; speaking: string }) {
  const portraitSrc = usePortraitSrc();
  return agent.id === speaking
    ? <span className="crew-speaking" title={`${agent.name} is speaking below`}><MessageCircle size={14} /></span>
    : <img src={portraitSrc(agent)} alt="" />;
}

/**
 * Who works on a project, at the end of the band's actions: who leads, as a face and a chevron opening the menu that
 * changes it (the crew, then the ready-made agents with no domain of their own, who join to lead it (Forge for an app,
 * D41), then a new agent, and Unassign), or a dashed person-plus while nobody leads; then the crew's chat button as
 * the other faces, its words the tooltip.
 */
function Crew({ project, data, speaking, onAssign, onBringIn, onNewAgent, onChat }: Pick<Props, "project" | "data" | "onAssign" | "onBringIn" | "onNewAgent" | "onChat"> & { speaking: string }) {
  const portraitSrc = usePortraitSrc();
  const assigned = crews.agentById(data, project.agentId);
  const lead = assigned && !assigned.archived ? assigned : undefined;
  const crew = crews.crewOf(data, project);
  const atlas = crews.agentById(data, atlasId)!;
  const ready = readyMade(data).filter((suggestion) => !suggestion.domain);
  const agentItems = <>
    {data.agents.filter((agent) => !agent.archived).map((agent) => (
      <Menu.Item key={agent.id} aria-current={agent.id === project.agentId || undefined} onClick={() => onAssign({ agentId: agent.id })}>
        <img src={portraitSrc(agent)} alt="" /><span><strong>{agent.name}</strong><small>{agent.role}</small></span>
      </Menu.Item>
    ))}
    {ready.length > 0 && <Menu.Group>
      <Menu.GroupLabel className="crew-picker-group">Bring in</Menu.GroupLabel>
      {ready.map((suggestion) => (
        <Menu.Item key={suggestion.name} onClick={() => onBringIn(suggestion)}>
          <img src={portraitSrc(suggestion)} alt="" /><span><strong>{suggestion.name}</strong><small>{suggestion.role}, joins the crew</small></span>
        </Menu.Item>
      ))}
    </Menu.Group>}
    <Menu.Item className="crew-picker-new" onClick={() => onNewAgent({ projectIds: [project.id] })}>
      <Plus size={16} /><span><strong>New agent</strong><small>Create one who starts on {project.title}</small></span>
    </Menu.Item>
    {lead && <Menu.Item className="crew-picker-new" onClick={() => onAssign({ agentId: undefined })}>
      <UserRoundMinus size={16} /><span><strong>Unassign {lead.name}</strong><small>Nobody leads it</small></span>
    </Menu.Item>}
  </>;
  const label = crew.length > 1 ? "Open the room" : `Chat with ${(crew[0] ?? atlas).name}`;
  const talkers = crew.length ? crew : [atlas];
  // The lead's face is its own button, so the chat button leaves it out (one face per agent).
  const chatFaces = talkers.filter((agent) => agent.id !== speaking && agent.id !== lead?.id);
  return <>
    {lead ? (
      <Picker className="crew-picker" label="Who leads it" tip={`${lead.name}, ${lead.role}, leads. Change who leads`}
        trigger={<button className="crew-lead-pick" aria-label={`${lead.name} leads. Change who leads`}>
          <Face agent={lead} speaking={speaking} /><ChevronDown size={14} aria-hidden="true" />
        </button>}>{agentItems}</Picker>
    ) : <Picker className="crew-picker" label="Who leads it" tip="Pick who leads it"
      trigger={<button className="crew-add" aria-label="Pick who leads it"><UserRoundPlus size={16} aria-hidden="true" /></button>}>{agentItems}</Picker>}
    <Tip label={label}><button className="secondary-button crew-chat" aria-label={label} onClick={() => onChat(crews.nearestThread(data, project.area, project.id))}>
      {talkers.some((agent) => agent.id === speaking && agent.id !== lead?.id) && <span className="crew-speaking" title="Speaking below"><MessageCircle size={14} /></span>}
      {chatFaces.length ? <AvatarStack agents={chatFaces} size={26} /> : !talkers.some((agent) => agent.id === speaking) && <span className="crew-chat-icon" aria-hidden="true"><MessageCircle size={16} /></span>}
    </button></Tip>
  </>;
}
