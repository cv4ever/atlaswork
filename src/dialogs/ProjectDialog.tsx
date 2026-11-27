// The project dialog: start or edit a project, from a starter, a fill or an agent's proposal (D61, D62, D63). Its
// unfolded panels and Describe it are src/dialogs/project/.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Archive, CalendarDays, ChevronDown, ListChecks, Repeat, Trash2 } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import * as crews from "../agents.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import Dialog from "../Dialog.tsx";
import type { ProjectField } from "../formFill.ts";
import { atlasId, kindOf } from "../model.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { projectColours } from "../look.ts";
import { defaultPages, shownBlocks } from "../blocks.ts";
import { formatDate } from "../dates.ts";
import type { WorkspaceData } from "../model.ts";
import { LookPicker } from "../LookPicker.tsx";
import { paceOf } from "../pace.ts";
import { RoutineList } from "../RoutineViews.tsx";
import * as routines from "../routines.ts";
import { routineDate } from "../view.ts";
import * as workspace from "../workspace.ts";
import type { ProjectDraft } from "../workspace.ts";
import { Tip } from "../Popups.tsx";
import { useFill } from "./useFill.ts";
import { ProjectDescribe } from "./project/ProjectDescribe.tsx";
import type { ProjectFact } from "./project/ProjectDescribe.tsx";
import { CrewPanel, FinishPanel, StepsPanel } from "./project/ProjectPanels.tsx";
import { Emblem } from "../Emblem.tsx";

/** The fill field each fact shows (D63), to light it up and to open it from an assumption. */
const factFields: Record<ProjectFact, ProjectField> = { domain: "domain", finish: "finish", crew: "lead", steps: "steps", routines: "routines" };

/**
 * Start or edit a project. Like the domain's seed packet: the colour, the name and why it matters in one card that
 * takes the project's colour. Editing, a line under it says where the work stands. Every other choice is a fact on one
 * line (domain, finish date, crew, first steps, routines), each a chip that unfolds its choices below, one at a time
 * (progressive disclosure, D62). A new project comes filled in (`Actions.newProject`): done in a month, the domain's
 * agent on it, and from an idea, the starter's name, line, colour, page and first steps. Above the card, Describe it:
 * tell the domain's agent what you want and it fills the form, steps included, lighting up what it changed (D63). A
 * project an agent proposed in chat opens here too, to review before Start applies it.
 */
export function ProjectDialog() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const fill = useFill();
  const form = useUi((state) => state.projectForm);
  const routineOpen = useUi((state) => state.routineOpen);
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const clock = useView((view) => view.now);
  const liveDomains = useView((view) => view.visible.domains);
  // The unfolded fact, for the project it was unfolded on, so the next dialog opens folded.
  const [unfolding, setUnfolding] = useState<{ id: string; fact: ProjectFact | null } | null>(null);
  if (!form) return null;
  const { starter, answer, steps, ...record } = form;
  const { original, project: draft } = record;
  const isNew = !original;
  const lit = (field: ProjectField) => form.filled?.fields.includes(field) || undefined;
  // A chat proposal under review (D63): who proposed it, and the notes that land with it.
  const reviewed = form.review && data.threads.find((thread) => thread.id === form.review!.thread)
    ?.messages.find((message) => message.proposal?.id === form.review!.proposal);
  const proposer = reviewed && crews.agentById(data, reviewed.agentId ?? atlasId);
  const unfolded = unfolding?.id === draft.id ? unfolding.fact : routineOpen ? "routines" : null;
  const change = (patch: Partial<ProjectDraft>) => actions.setUi({ projectForm: { ...form, project: { ...draft, ...patch } } });
  const now = routineDate(clock);
  const close = () => actions.setUi({ projectForm: null });
  const swatch = (color: string) => `var(--${color === "pine" ? "skin-accent" : color})`;
  // Where the work stands (edit only): the same pace the masthead shows.
  const pace = paceOf(draft, data.tasks.filter((task) => task.projectId === draft.id), today);
  const dayName = (day: string) => formatDate(new Date(`${day}T12:00:00`), { weekday: "short", day: "numeric", month: "short" });
  const daysTo = (day: string) => Math.round((Date.parse(`${day}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 864e5);
  // The finish line is the page's first countdown (`paceOf`), read from the page as it is now. A date picked here
  // waits in the form and moves that countdown at Save, or adds one at the top (`workspace.withFinish`).
  const page = data.projects.find((item) => item.id === draft.id)?.widgets ?? draft.widgets ?? defaultPages.project;
  const finish = form.finish ? form.finish.date : shownBlocks(page).find((block) => block.type === "countdown")?.date ?? "";
  const setFinish = (date: string) => actions.setUi({ projectForm: { ...form, finish: { date, today } } });
  const left = finish ? daysTo(finish) : 0;
  const leftWords = left > 0 ? `${left} days left` : left === 0 ? "today" : `${-left} days ago`;
  // A starter asking for its own date ("When is the race?") asks it here, with nothing picked for you; one asking a number gets a field.
  const dateAsk = isNew && starter?.ask?.kind === "date" ? starter.ask.prompt : undefined;
  const numberAsk = isNew && starter?.ask?.field === "target" ? starter.ask : undefined;
  // Who answers here, in order (`crewOf`): the lead, the team, and the domain's agent, who joins every project there. A
  // lead a fill or a chat proposal brings in (D63, D61) shows among the crew to pick until Save adds them, picked or not.
  const hire = isNew && form.hire && !data.agents.some((agent) => agent.id === form.hire!.id) ? form.hire : undefined;
  const crewData = hire ? { ...data, agents: [...data.agents, hire] } : data;
  const lead = crews.agentById(crewData, draft.agentId);
  const team = crews.teamById(data, draft.teamId);
  const domainAgent = crews.stewardOf(data, draft.area);
  const joins = domainAgent && domainAgent.id !== draft.agentId && !team?.memberIds.includes(domainAgent.id) ? domainAgent : undefined;
  const crew = crews.crewOf(crewData, draft);
  const crewLine = [lead && !lead.archived && `${lead.name}${lead === hire ? `, new ${lead.role.toLocaleLowerCase()},` : ""} leads`, team && `${team.name} (${crews.teamMembers(data, team).length})`,
    joins && `${joins.name} joins from ${draft.area}`].filter(Boolean).join(" · ") || "Atlas answers until someone joins";
  const agents = crewData.agents.filter((agent) => !agent.archived);
  const domain = liveDomains.find((item) => item.name === draft.area);
  // Routines can be set up before the name: the preview borrows a stand-in title.
  const owner = { kind: "project" as const, id: draft.id };
  const list = draft.routines ?? [];
  let preview: WorkspaceData | undefined;
  let previewError = "";
  try { preview = workspace.saveDraft(data, { kind: "project", ...record, project: { ...draft, title: draft.title.trim() || "New project" } }).data; }
  catch (cause) { previewError = cause instanceof Error ? cause.message : "Cannot preview this project."; }
  const on = preview ? list.filter((routine) => routines.readinessOf(preview, { routine, owner }, now).enabled).length : 0;
  /** One folded choice: its icon and current answer; pressing it unfolds its choices under the row. Lit when a fill changed it (D63). */
  const fact = (id: ProjectFact, label: string, icon: ReactNode, words: string) => (
    <Tip label={`${label}: ${words}`}><button type="button" className="where-chip project-fact" aria-expanded={unfolded === id} aria-controls={`project-${id}`} data-filled={lit(factFields[id])} onClick={() => setUnfolding({ id: draft.id, fact: unfolded === id ? null : id })}>
    {icon}<span>{words}</span><ChevronDown size={14} aria-hidden="true" />
        </button></Tip>
  );
  return (
    <Dialog title={reviewed ? `${proposer?.name ?? "An agent"}'s project` : isNew ? "Start a project" : `Edit ${draft.title || "project"}`} onClose={close}>
      <form className="task-form domain-form project-form" style={{ "--hue": swatch(draft.color) } as CSSProperties}
        onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) actions.saveProject(form); }}>
        {fill && <ProjectDescribe form={form} filler={domainAgent && !domainAgent.archived ? domainAgent : crews.agentById(data, atlasId)!} fill={fill}
          finish={finish} data={data} today={today} now={now} onUnfold={(next) => setUnfolding({ id: draft.id, fact: next })} />}
        {reviewed?.proposal && (
          <p className="project-review-note">
            {proposer && <img src={portraitSrc(proposer)} alt="" />}
            <span>{proposer?.name ?? "An agent"} proposed it in chat{reviewed.proposal.notes?.length ? `, with ${reviewed.proposal.notes.length === 1 ? "a note" : `${reviewed.proposal.notes.length} notes`}` : ""}. Start applies it as you leave it here; Undo stays on the card.</span>
          </p>
        )}
        <div className="domain-preview" key={`packet-${form.filled?.at}`}>
          <LookPicker id="project-look" className={`domain-seed${lit("colour") ? " is-filled" : ""}`} colour={draft.color} onColour={(color) => change({ color })}
            colours={projectColours.map((color) => ({ value: color, label: color[0].toUpperCase() + color.slice(1), swatch: swatch(color) }))} />
          <div className="domain-packet-fields">
            <input id="project-title" className="domain-name" required maxLength={60} placeholder="Run a 10k, repaint the hallway…" aria-label="What are you growing?"
              data-filled={lit("title")} value={draft.title} onChange={(event) => change({ title: event.target.value })} />
            <textarea id="project-goal" className="domain-about project-about" rows={2} maxLength={160} placeholder="Why it matters… (optional)" aria-label="Why it matters"
              data-filled={lit("goal")} value={draft.description} onChange={(event) => change({ description: event.target.value })} />
          </div>
          <i /><i /><i />
        </div>
        {numberAsk && (
          <label className="project-ask">
            <span>{numberAsk.prompt}</span>
            <input type="number" inputMode="decimal" min={0} step="any" placeholder={numberAsk.placeholder} value={answer ?? ""}
              onChange={(event) => actions.setUi({ projectForm: { ...form, answer: event.target.value } })} />
          </label>
        )}
        {!isNew && (
          <p className="project-pace">
            <span className="stage-chip" data-behind={pace.behind || undefined}>{pace.behind ? "Behind" : pace.stage.label}</span>
            <span className="progress-track" aria-hidden="true"><span style={{ transform: `scaleX(${pace.total ? pace.done / pace.total : 0})` }} /></span>
            <span>{pace.total ? `${pace.done} of ${pace.total} steps done` : "No steps yet"}{pace.nextDue ? ` · next ${pace.nextDue < today ? "was due" : "due"} ${dayName(pace.nextDue)}` : ""}</span>
          </p>
        )}
        <div className="project-facts" key={`facts-${form.filled?.at}`}>
          {fact("domain", "Domain", <span aria-hidden="true"><Emblem emoji={domain?.emoji} /></span>, draft.area)}
          {fact("finish", dateAsk ?? "Done by", <CalendarDays size={14} aria-hidden="true" />, finish ? `${dayName(finish)} · ${leftWords}` : dateAsk ?? "No finish date")}
          {fact("crew", "Who works on it", crew.length ? <AvatarStack agents={crew} size={20} /> : <img className="project-fact-face" src={portraitSrc(crews.agentById(data, atlasId)!)} alt="" />, crewLine)}
          {steps?.length ? fact("steps", isNew ? "First steps" : "Steps to add", <ListChecks size={14} aria-hidden="true" />, `${steps.length} ${isNew ? "first" : "new"} ${steps.length === 1 ? "step" : "steps"}`)
            : isNew && starter && fact("steps", "Comes with", <ListChecks size={14} aria-hidden="true" />, `${starter.tasks.length} first steps`)}
          {fact("routines", "Routines", <Repeat size={14} aria-hidden="true" />, list.length ? `${on} of ${list.length} routines on` : "No routines")}
        </div>
        {unfolded === "domain" && (
          <fieldset className="project-choice project-panel" id="project-domain">
            <legend>Domain</legend>
            <div className="project-chips" role="radiogroup" aria-label="Domain">
              {liveDomains.map((item) => (
                <button key={item.name} type="button" role="radio" className="where-chip" aria-checked={draft.area === item.name}
                  onClick={() => change({ area: item.name })}><span aria-hidden="true"><Emblem emoji={item.emoji} /></span>{item.name}</button>
              ))}
            </div>
          </fieldset>
        )}
        {unfolded === "finish" && <FinishPanel today={today} finish={finish} label={dateAsk ?? "Done by"} leftWords={leftWords} dayName={dayName} onFinish={setFinish} />}
        {unfolded === "crew" && <CrewPanel data={data} agents={agents} lead={lead} team={team} agentId={draft.agentId}
          onLead={(agentId) => change({ agentId })} onTeam={(teamId) => change({ teamId })} />}
        {unfolded === "steps" && <StepsPanel steps={steps} starter={starter} isNew={isNew} dayName={dayName}
          onSteps={(next) => actions.setUi({ projectForm: { ...form, steps: next } })} />}
        {unfolded === "routines" && (
          <div className="project-panel routine-fieldset" id="project-routines">
            {preview ? <RoutineList scene={{ data: preview, notes: workspace.visible(preview, draft.area, today).notes.filter((note) => kindOf(note) === "note"), now, owner }}
              list={list} open={routineOpen} onOpen={(id) => actions.setUi({ routineOpen: id })}
              onChange={(next) => change({ routines: next })} /> : <p role="status">{previewError}</p>}
          </div>
        )}
        <div className="form-actions">
          {original && <>
            <button type="button" className="quiet-button domain-remove"
              onClick={() => actions.deleteForever({ kind: "project", id: draft.id }, draft.title)}><Trash2 size={14} />Delete</button>
            <Tip label="Rest it in the Archive"><button type="button" className="quiet-button" onClick={() => actions.archiveProject(original)}><Archive size={14} />Archive</button></Tip>
          </>}
          <button type="button" className="quiet-button" onClick={close}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!draft.title.trim()}>{isNew ? (draft.title.trim() ? `Start ${draft.title.trim()}` : "Start it") : "Save"}</button>
        </div>
      </form>
    </Dialog>
  );
}
