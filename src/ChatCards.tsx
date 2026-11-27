// The cards an agent hands you in a chat (agents-design D13, D50, D53, D57, D61, D79): proposed tasks, notes, projects,
// changes and files to tidy with Apply and Reject; an agent Atlas drafted; a question for another agent. AgentPanel
// places them under their message. Styles: `src/styles/chat-panel.css`.
import { Component, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Archive, CalendarClock, CalendarDays, Check, CheckCheck, ChevronDown, CircleCheck, Clock, FileText, FolderInput, FolderOpen, LayoutGrid,
  ListChecks, Pencil, Plus, RotateCcw, Send, Sprout, UserRoundPlus, X,
} from "lucide-react";
import { AvatarStack } from "./AvatarStack.tsx";
import { agentTools, routineKinds } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { plantStages, projectInk } from "./look.ts";
import { blockViewLabels, keepsData, viewOf } from "./blocks.ts";
import { daysBetween, formatDate, formatNumber } from "./dates.ts";
import { repeatLabel, timeLabel } from "./routines.ts";
import type { Agent, AgentProposal, Ask, Domain, Note, Project, Proposal, ToolId } from "./model.ts";
import type { Block } from "./blocks.ts";
import { dueDay, dueWords } from "./pageGrid/due.ts";
import Plant from "./Plant.tsx";
import { addedWords, proposalWords } from "./proposals.ts";
import { reviewable } from "./formFill.ts";
import { suggestedAgents } from "./suggestedAgents.ts";
import { titleOf } from "./dataBlocks/parts.tsx";
import { Tip } from "./Popups.tsx";
import { fileNameOf, tidyTarget, windowsPath } from "../supabase/functions/agent/tidy.ts";
import { Emblem } from "./Emblem.tsx";

/** A count in words, the way a card's heading says it ("1 change", "3 tasks"). */
const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;
/** How many files of an undone tidy are back (D79). */
const backWords = (files: NonNullable<Proposal["files"]>) => {
  const back = files.undone?.filter((result) => !result.failed).length ?? 0;
  return `${plural(back, "file")} ${back === 1 ? "is back where it was" : "are back where they were"}.`;
};

/**
 * A tidy's moves (agents-design D79): each file, where it goes and why, on the computer the reply searched; once that
 * computer answered, what became of each: moved, or why it stayed, and after Undo, back or why it's still moved.
 */
function TidyMoves({ files, pending }: { files: NonNullable<Proposal["files"]>; pending: boolean }) {
  return <>
    <div className="proposal-heading"><span><FolderInput size={14} aria-hidden="true" />{pending ? "Files to tidy" : "Files"}</span>
      <span>{plural(files.moves.length, "file")} on {files.computer.name}</span></div>
    <ol className="proposal-changes">{files.moves.map((move, index) => {
      const done = files.done?.[index];
      const back = done && !done.failed ? files.undone?.find((result) => result.file === move.file) : undefined;
      const kind = back ? back.failed ? "moved" : "back" : done ? done.failed ? "stayed" : "moved" : "tidy";
      return (
        <li key={`${index}:${move.file}`} data-kind={kind}>
          {kind === "back" ? <RotateCcw size={14} aria-hidden="true" /> : kind === "moved" ? <CheckCheck size={14} aria-hidden="true" />
            : kind === "stayed" ? <X size={14} aria-hidden="true" /> : <FolderInput size={14} aria-hidden="true" />}
          <span>{fileNameOf(move.file)} → {tidyTarget(move)}</span>
          <small className="proposal-where">{done?.failed ? `Stayed: ${done.failed}` : back?.failed ? `Still moved: ${back.failed}`
            : `${move.why} · from ${windowsPath(move.file.split("/").slice(0, -1).join("/"))}`}</small>
        </li>
      );
    })}</ol>
  </>;
}

/**
 * Where an approved tidy stands (D79): waiting for its computer to move the files or put them back, why it couldn't,
 * or what moved, with Undo while anything did. A failure, or a wait past a day (when the computer's job expires),
 * offers Try again. `since` is when the tidy was last asked for, else when its message came.
 */
function TidyResult({ files, since, today, onAct }: {
  files: NonNullable<Proposal["files"]>; since?: string; today: string; onAct?: (action: "apply" | "undo") => void;
}) {
  const { computer } = files;
  const them = files.moves.length === 1 ? "it" : "them";
  const again = files.done ? "undo" : "apply";
  const retry = onAct && <button type="button" className="quiet-button" onClick={() => onAct(again)}><RotateCcw size={14} aria-hidden="true" />Try again</button>;
  if (files.failed) return <>
    <div className="proposal-result" data-tone="quiet"><span><X size={14} aria-hidden="true" />{computer.name} didn't {files.done ? `put ${them} back` : `move ${them}`}</span>{retry}</div>
    <p className="inline-error" role="alert">{files.failed}</p>
  </>;
  if (files.undoing || !files.done) {
    const asked = files.asked ?? since;
    const stale = !!asked && daysBetween(new Date(asked).toLocaleDateString("en-CA"), today) >= 2;
    return <div className="proposal-result" data-tone="quiet">
      <span><Clock size={14} aria-hidden="true" />Waiting for {computer.name} to {files.undoing ? `put ${them} back` : `move ${them}`}</span>
      {stale && retry && <Tip label={`${computer.name} didn't get to it in a day`}>{retry}</Tip>}
    </div>;
  }
  const moved = files.done.filter((result) => !result.failed).length;
  return <div className="proposal-result">
    <span><CheckCheck size={16} aria-hidden="true" />{moved === files.moves.length ? `Moved on ${computer.name}` : `Moved ${moved} of ${files.moves.length} on ${computer.name}`}</span>
    {moved > 0 && !files.undone && onAct && <button type="button" className="quiet-button" onClick={() => onAct("undo")}><RotateCcw size={14} aria-hidden="true" />Undo</button>}
  </div>;
}

/**
 * Tasks, notes, projects or changes an agent proposes, with Apply, Reject and, once applied, Undo. A proposed project
 * also offers Review, which opens the project dialog filled in to edit before Start applies it (D63), and names who
 * leads it (`agentOf` finds a crew member; one joining to lead it comes with the proposal, D61). `today` (YYYY-MM-DD,
 * from the View's clock) turns due days into words; `since`, when its message came, dates a tidy's wait (D79).
 */
export function ProposalCard({ proposal, onOpenNote, openProject, onProposal, placeOf, agentOf, error, busy, onRequestFresh, onPlant, planted, today, since }: {
  proposal: Proposal;
  onOpenNote: (id: string) => void;
  /** Opens a live project by id, or undefined when it's gone or archived. */
  openProject?: (id: string) => (() => void) | undefined;
  onProposal?: (proposal: Proposal, action: "apply" | "reject" | "undo" | "review") => void;
  placeOf: (home: { domain: string; projectId: string }) => string;
  agentOf: (id: string) => Agent | undefined;
  error?: string;
  busy: boolean;
  onRequestFresh?: (proposal: Proposal) => void;
  onPlant?: (domain: Pick<Domain, "name" | "emoji" | "intention">) => void;
  planted: (name: string) => boolean;
  today: string;
  since?: string;
}) {
  const portraitSrc = usePortraitSrc();
  const notes = proposal.notes ?? [];
  const made = proposal.projects ?? [];
  const count = proposal.changes?.length ?? proposal.items.length;
  const what = proposalWords(proposal);
  // A project the proposal makes (D61) isn't in the workspace until Apply, so its rows name it themselves.
  const where = (home: { domain: string; projectId: string }) => {
    const project = made.find((item) => item.id === home.projectId);
    return project ? `${project.area} / ${project.title}` : placeOf(home);
  };
  // A sorted capture (D53) spans places, so each row says where it goes; a proposal in one place doesn't repeat it, and
  // a project's own card (D61) names it once at the top.
  const spread = new Set([...proposal.items, ...notes].map((record) => `${record.domain}/${record.projectId}`)).size > 1 || notes.length > 0 && !made.length;
  const icons = { complete: <CircleCheck size={14} />, reschedule: <CalendarClock size={14} />, archive: <Archive size={14} />,
    page: <LayoutGrid size={14} />, move: <FolderInput size={14} />, rehome: <FolderInput size={14} /> };
  const date = (day: string) => formatDate(new Date(`${day}T12:00:00`), { day: "numeric", month: "short" });
  const amount = (value: number, unit = "") => `${formatNumber(value, { maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ""}`;
  // What a data widget an agent sets up (D33) starts with, so the person sees its settings before Apply.
  const setupOf = (block: Block) => [
    block.type === "tracker" && [block.target !== undefined ? `target ${amount(block.target, block.unit)}` : block.unit, block.better === "down" && "lower is better"],
    block.type === "goal" && block.target !== undefined && [amount(block.target, block.unit), block.date && `by ${date(block.date)}`],
    block.type === "countdown" && block.date && [date(block.date)],
    block.type === "checklist" && [plural(block.items?.length ?? 0, "item")],
    block.type === "milestones" && [plural(block.steps?.length ?? 0, "step")],
  ].flatMap((parts) => parts || []).filter(Boolean).join(", ");
  const setUp = (change: { from: Block[] | null; to: Block[] }) =>
    change.to.filter((block) => keepsData(block) && !change.from?.some((item) => item.id === block.id));
  const pending = proposal.status === "pending";
  const firsts = made.length > 0 && proposal.items.every((task) => made.some((project) => project.id === task.projectId));
  // A domain Atlas plants (D61), and who looks after it (D51): its own row, before a project made with it.
  const plant = proposal.plant && <li className="proposal-planted" style={{ "--hue": proposal.plant.domain.hue } as CSSProperties}>
    <Sprout size={16} aria-hidden="true" />
    <span>{pending ? "Plant" : "Planted"} <Emblem emoji={proposal.plant.domain.emoji} /> {proposal.plant.domain.name}<small className="proposal-where">
      {proposal.plant.domain.intention && `${proposal.plant.domain.intention} · `}looked after by <img src={portraitSrc(proposal.plant.keeper)} alt="" width={16} height={16} />{proposal.plant.keeper.name}{proposal.plant.agent ? ", new to the crew" : ""}</small></span>
  </li>;
  return (
    <div className={`proposal ${proposal.status}`}>
      {made.length > 0 ? <MadeProjects proposal={proposal} made={made} today={today} agentOf={agentOf} where={where} spread={spread} firsts={firsts} />
      : plant && <>
        <div className="proposal-heading"><span><Sprout size={14} aria-hidden="true" />{pending ? "Proposed domain" : "Domain"}</span></div>
        <ul className="proposal-projects">{plant}</ul>
      </>}
      {proposal.files && <TidyMoves files={proposal.files} pending={pending} />}
      {(!!proposal.changes?.length || !made.length && proposal.items.length > 0) && <div className={`proposal-heading${made.length || plant ? " proposal-subheading" : ""}`}>
        <span>{proposal.changes ? <Pencil size={14} aria-hidden="true" /> : <ListChecks size={14} aria-hidden="true" />}
          {proposal.changes ? pending ? "Suggested changes" : "Changes" : pending ? "Proposed tasks" : "Tasks"}</span>
        <span>{plural(count, proposal.changes ? "change" : "task")}</span>
      </div>}
      {proposal.changes ? (
        <ol className="proposal-changes">{proposal.changes.map((change) => (
          <li key={change.kind === "archive" || change.kind === "rehome" ? change.projectId : change.kind === "page" ? change.place : change.taskId} data-kind={change.kind}>{icons[change.kind]}
            {change.kind === "complete" ? <>Tick off “{change.title}”</>
              : change.kind === "reschedule" ? change.at ? <>Put “{change.title}” on {date(change.to)} at {change.at}{change.why && <small className="proposal-where">{change.why}</small>}</>
                : change.from ? <>Move “{change.title}” from {date(change.from)} to {date(change.to)}</> : <>Set “{change.title}” for {date(change.to)}</>
              : change.kind === "move" ? <>Move “{change.title}” to {where(change.to)}<small className="proposal-where">from {where(change.from)}</small></>
              : change.kind === "rehome" ? <>Move the project “{change.title}” to {change.to}<small className="proposal-where">from {change.from}, with everything in it</small></>
              : change.kind === "page" ? <>Arrange “{change.title}”: {change.to.map((block) =>
                  `${titleOf(block)} (${blockViewLabels(block.type)[viewOf(block)]})`).join(", ")}
                {setUp(change).length > 0 && <small className="proposal-where">
                  New: {setUp(change).map((block) => [titleOf(block), setupOf(block)].filter(Boolean).join(" · ")).join("; ")}</small>}</>
              : <>Archive “{change.title}”, quiet for {change.quietDays} days</>}
          </li>
        ))}</ol>
      ) : <>
        {!made.length && proposal.items.length > 0 && <ol>{proposal.items.map((task) => (
          <li key={task.id}>{task.title}
            {(spread || task.due) && <small className="proposal-where">{[spread && where(task), task.due && `due ${date(task.due)}`].filter(Boolean).join(" · ")}</small>}
          </li>
        ))}</ol>}
        {!made.length && notes.length > 0 && <>
          <div className={`proposal-heading${proposal.items.length ? " proposal-subheading" : ""}`}><span><FileText size={14} aria-hidden="true" />{pending ? "Notes to keep" : "Notes"}</span><span>{plural(notes.length, "note")}</span></div>
          <ul className="proposal-notes">{notes.map((note) => <NoteRow key={note.id} note={note} where={spread ? where(note) : undefined} />)}</ul>
        </>}
        {proposal.noteId && <button className="proposal-source" onClick={() => onOpenNote(proposal.noteId)}>
          <FileText size={12} />From {proposal.sourceTitle || "Untitled note"}
        </button>}
      </>}
      {/* Domains Atlas suggests (D61) are never part of Apply: each opens the domain dialog, where its own agent comes too (D51). */}
      {proposal.domains && proposal.status !== "rejected" && <div className="proposal-plant">
        <small>{proposal.domains.length === 1 ? "A domain to plant?" : "Domains to plant?"}</small>
        {proposal.domains.map((domain) => planted(domain.name)
          ? <span key={domain.name}><Check size={14} aria-hidden="true" /><Emblem emoji={domain.emoji} /> {domain.name} is planted</span>
          : <Tip key={domain.name} label={domain.intention || undefined}><button type="button" className="quiet-button" disabled={!onPlant} onClick={() => onPlant?.(domain)}><Sprout size={14} aria-hidden="true" />Plant <Emblem emoji={domain.emoji} /> {domain.name}</button></Tip>)}
      </div>}
      {proposal.status === "pending" && onProposal && (
        <div className="proposal-actions">
          {made.length > 0
            ? <Tip label={`Adds ${what}`}><button className="primary-button" onClick={() => onProposal(proposal, "apply")}><Check size={16} />{made.length === 1 ? "Start project" : `Start ${made.length} projects`}</button></Tip>
            : proposal.files ? <button className="primary-button" onClick={() => onProposal(proposal, "apply")}><FolderInput size={16} />Tidy {plural(proposal.files.moves.length, "file")}</button>
            : <button className="primary-button" onClick={() => onProposal(proposal, "apply")}><Check size={16} />Apply {what}</button>}
          {reviewable(proposal) && <Tip label="Open it in the project dialog to change it before it starts"><button className="quiet-button" onClick={() => onProposal(proposal, "review")}><Pencil size={14} aria-hidden="true" />Review</button></Tip>}
          <button className="reject-button" onClick={() => onProposal(proposal, "reject")}><X size={14} aria-hidden="true" />Reject</button>
          {(error || !proposal.origin) && onRequestFresh && <Tip label="Ask the same agent your original request again, using current records"><button className="quiet-button" disabled={busy}
            onClick={() => onRequestFresh(proposal)}>
                    <RotateCcw size={14} />Request fresh proposal
                  </button></Tip>}
        </div>
      )}
      {proposal.status === "pending" && error && <p className="inline-error" role="alert">{error}</p>}
      {proposal.status === "applied" && proposal.files && <TidyResult files={proposal.files} since={since} today={today}
        onAct={onProposal && ((action) => onProposal(proposal, action))} />}
      {proposal.status === "applied" && !proposal.files && (() => {
        // A started project opens from its card, since Apply leaves the chat for its page (D61).
        const opens = made.flatMap((project) => { const open = openProject?.(project.id); return open ? [{ project, open }] : []; });
        return (
          <div className="proposal-result">
            <span><CheckCheck size={16} />{proposal.changes ? "Done" : made.length
              ? `${made.length === 1 ? "Project started" : `${made.length} projects started`}${proposal.items.length || notes.length ? `, with ${addedWords({ items: proposal.items, notes })}` : ""}` : "Added"}</span>
            <span>
              {opens.map(({ project, open }) => <button key={project.id} type="button" className="quiet-button" onClick={open}><FolderOpen size={14} aria-hidden="true" />{made.length === 1 ? "Open" : `Open ${project.title}`}</button>)}
              {onProposal && <button type="button" className="quiet-button" onClick={() => onProposal(proposal, "undo")}><RotateCcw size={14} aria-hidden="true" />Undo</button>}
            </span>
          </div>
        );
      })()}
      {proposal.status === "rejected" && <div className="proposal-result" data-tone="quiet"><span><X size={14} />Rejected. No changes made.</span></div>}
      {proposal.status === "undone" && <div className="proposal-result" data-tone="quiet"><span><RotateCcw size={14} />Undone. {proposal.files ? backWords(proposal.files)
        : proposal.changes || made.length ? "Everything is back as it was." : notes.length ? "The tasks and notes were removed." : "The tasks were removed."}</span></div>}
    </div>
  );
}

/**
 * One message's cards drawn apart from the chat: a card whose stored data it can't draw (2026-11-20: an empty date in
 * a reschedule threw while rendering and blanked the whole app) says so in its place, and the chat keeps working.
 */
export class CardBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <p className="inline-error" role="alert">This card can't be shown. The rest of the chat still works.</p> : this.props.children;
  }
}

/** A note a proposal keeps: its title, where it goes when the card spans places, and the start of its words. */
function NoteRow({ note, where }: { note: Note; where?: string }) {
  return <li><FileText size={14} aria-hidden="true" /><span>{note.title}<small className="proposal-where">
    {[where, note.body && `${note.body.slice(0, 80)}${note.body.length > 80 ? "…" : ""}`].filter(Boolean).join(" · ")}</small></span></li>;
}

type ProjectFact = "plant" | "lead" | "steps" | "notes";
/** A goal longer than this starts on one line, with More to read it whole. */
const goalFold = 60;

/**
 * The projects a proposal makes (D61), one question at a glance: start this? Each is a seed packet in the colour it
 * will wear: the plant it starts as, the title, its goal on one line until More. While it waits on you, one row of
 * facts follows, the project dialog's chips (D62): the domain (a planted one says "new" and unfolds its purpose and
 * keeper), who leads it, the steps with the first day due, the finish line, the notes it keeps. A chip unfolds its
 * detail under the row, one at a time; once answered the facts fold away and the result row says what landed.
 */
function MadeProjects({ proposal, made, today, agentOf, where, spread, firsts }: {
  proposal: Proposal;
  made: Project[];
  today: string;
  agentOf: (id: string) => Agent | undefined;
  where: (home: { domain: string; projectId: string }) => string;
  spread: boolean;
  firsts: boolean;
}) {
  const portraitSrc = usePortraitSrc();
  const [unfolded, setUnfolded] = useState<ProjectFact | null>(null);
  const [whole, setWhole] = useState<string | null>(null);
  const pending = proposal.status === "pending";
  const { plant, items: tasks } = proposal;
  const notes = proposal.notes ?? [];
  // Who leads each: one joining to lead it, the keeper planted with it, or a crew member.
  const leaders = [...new Map(made.flatMap((project) => {
    const leader = project.agentId && ([proposal.lead, plant?.agent].find((agent) => agent?.id === project.agentId) ?? agentOf(project.agentId));
    return leader ? [[leader.name, leader] as const] : [];
  })).values()];
  const joining = (leader: Pick<Agent, "name" | "portrait">) => leader === proposal.lead || leader === plant?.agent;
  const areas = [...new Set(made.map((project) => project.area))];
  const firstDue = tasks.map((task) => task.due).filter(Boolean).sort()[0];
  const finish = made.length === 1 ? made[0].widgets?.find((block) => block.type === "countdown")?.date : undefined;
  const left = finish ? daysBetween(today, finish) : 0;
  const stepWord = firsts ? "step" : "task";
  const fact = (id: ProjectFact, label: string, icon: ReactNode, words: string) => (
    <Tip label={`${label}: ${words}`}><button type="button" className="where-chip project-fact" aria-expanded={unfolded === id} aria-controls={`${proposal.id}-${id}`}
      onClick={() => setUnfolded(unfolded === id ? null : id)}>{icon}<span>{words}</span><ChevronDown size={14} aria-hidden="true" /></button></Tip>
  );
  const panel = (id: ProjectFact, body: ReactNode) => unfolded === id && <div className="project-panel proposal-panel" id={`${proposal.id}-${id}`}>{body}</div>;
  return <>
    {made.map((project, index) => (
      <div key={project.id} className="proposal-packet" style={{ "--hue": projectInk(project) } as CSSProperties}>
        <span className="project-idea-plant" aria-hidden="true"><Plant stage={plantStages[0]} /></span>
        <div>
          <strong>{index === 0 && pending && <span className="sr-only">{made.length === 1 ? "Proposed project, waiting on you: " : `${made.length} proposed projects, waiting on you: `}</span>}{project.title}</strong>
          {project.description && <p className="proposal-goal" id={`${project.id}-goal`} data-whole={whole === project.id || undefined}>{project.description}</p>}
          {project.description.length > goalFold && <button type="button" className="text-button" aria-expanded={whole === project.id} aria-controls={`${project.id}-goal`}
            onClick={() => setWhole(whole === project.id ? null : project.id)}>{whole === project.id ? "Less" : "More"}</button>}
        </div>
      </div>
    ))}
    {pending && <>
      <div className="proposal-facts">
        {plant ? fact("plant", "A new domain", <span aria-hidden="true"><Emblem emoji={plant.domain.emoji} /></span>, `${plant.domain.name} · new`)
          : <span className="where-chip project-fact">in {areas.join(", ")}</span>}
        {leaders.length > 0 && fact("lead", "Who leads it", <>{leaders.map((leader) => <img key={leader.name} className="project-fact-face" src={portraitSrc(leader)} alt="" />)}</>,
          `${leaders.map((leader) => leader.name).join(" and ")} ${leaders.length === 1 ? "leads" : "lead"}${leaders.some(joining) ? " · joins" : ""}`)}
        {tasks.length > 0 && fact("steps", firsts ? "First steps" : "Tasks", <ListChecks size={14} aria-hidden="true" />,
          `${plural(tasks.length, stepWord)}${firstDue ? ` · first ${dueWords(firstDue, today)}` : ""}`)}
        {finish && <span className="where-chip project-fact"><CalendarDays size={14} aria-hidden="true" />Done by {dueDay(finish, today).when}{left > 1 ? ` · ${left} days left` : ""}</span>}
        {notes.length > 0 && fact("notes", "Notes to keep", <FileText size={14} aria-hidden="true" />, plural(notes.length, "note"))}
      </div>
      {plant && panel("plant", <p className="proposal-panel-line">
        <span><span aria-hidden="true"><Emblem emoji={plant.domain.emoji} /></span><span><strong>{plant.domain.name}</strong>, a new domain{plant.domain.intention ? `: ${plant.domain.intention}` : ""}</span></span>
        <span><img className="project-fact-face" src={portraitSrc(plant.keeper)} alt="" /><span>{plant.keeper.name} looks after it{plant.agent ? ", joining your crew" : ""}.</span></span>
      </p>)}
      {panel("lead", <ul className="proposal-panel-line">{leaders.map((leader) => (
        <li key={leader.name}><img className="project-fact-face" src={portraitSrc(leader)} alt="" />
          <span><strong>{leader.name}</strong>, {leader.role.toLocaleLowerCase()}, {joining(leader) ? "joins your crew to lead it." : "leads it."}</span></li>
      ))}</ul>)}
      {panel("steps", <ol className="proposal-steps">{tasks.map((task) => {
        const due = task.due ? dueDay(task.due, today) : undefined;
        return <li key={task.id}><div><span>{task.title}{spread && <small className="proposal-where">{where(task)}</small>}</span>
          {due && <small className="task-when" data-soon={due.soon || undefined} data-late={due.late || undefined}>{due.when}</small>}</div></li>;
      })}</ol>)}
      {panel("notes", <ul className="proposal-notes">{notes.map((note) => <NoteRow key={note.id} note={note} where={spread ? where(note) : undefined} />)}</ul>)}
    </>}
  </>;
}

/**
 * An agent Atlas drafted (agents-design D57): who, where, the house rules, anything beyond what every agent starts
 * with, and quiet agents he'd archive. Review opens the agent dialog filled in; Save there applies it.
 */
export function AgentDraftCard({ proposal, draft, speaker, onProposal, onArchive }: { proposal: Proposal; draft: AgentProposal;
  speaker: (id?: string) => Agent | undefined; onProposal?: (proposal: Proposal, action: "review" | "reject") => void; onArchive?: (id: string) => void }) {
  const portraitSrc = usePortraitSrc();
  const member = draft.agentId ? speaker(draft.agentId) : undefined;
  const suggestion = draft.from ? suggestedAgents.find((agent) => agent.name === draft.from) : undefined;
  const name = member?.name ?? draft.name ?? suggestion?.name ?? "A new agent";
  const portrait = draft.portrait ?? member?.portrait ?? suggestion?.portrait;
  const where = draft.newDomain ? `plants ${draft.newDomain.emoji} ${draft.newDomain.name}` : draft.domain ? `in ${draft.domain}` : suggestion?.domain ? `in ${suggestion.domain}` : "";
  const extra = [...Object.entries(draft.tools ?? {}).filter(([, on]) => on).map(([id]) => agentTools[id as ToolId].label), ...draft.writeMode === "full" ? ["Proactive"] : []];
  const quiet = (draft.quiet ?? []).flatMap((id) => speaker(id) ?? []).filter((agent) => !agent.archived);
  return (
    <div className={`proposal agent-draft-card ${proposal.status}`}>
      <div className="proposal-heading"><span><UserRoundPlus size={14} aria-hidden="true" />{member ? `Changes to ${member.name}` : proposal.status === "pending" ? "Proposed agent" : "Agent"}</span>
        {proposal.status === "pending" && <span>Waiting for your review</span>}
      </div>
      <div className="agent-draft-who">
        {portrait ? <img src={portraitSrc({ portrait })} alt="" width={40} height={40} /> : <span className="agent-draft-face" aria-hidden="true"><Plus size={18} /></span>}
        <span><strong>{name}</strong><small>{[draft.role ?? member?.role ?? suggestion?.role, where, draft.checkIn === "daily" ? "checks in daily" : draft.checkIn ? "suggests improvements weekly" : ""].filter(Boolean).join(" · ")}</small></span>
      </div>
      {draft.instructions && <p className="agent-draft-rules">“{draft.instructions}”</p>}
      {draft.routines && <p className="agent-draft-extra"><CalendarClock size={12} aria-hidden="true" /> {draft.routines.length
        ? draft.routines.map((routine) => `${routineKinds[routine.kind].label}, ${repeatLabel(routine).toLocaleLowerCase()} at ${timeLabel(routine.time)}`).join("; ") : "No routines"}</p>}
      {extra.length > 0 && <p className="agent-draft-extra">Also: {extra.join(", ")}{draft.why ? `. ${draft.why}` : ""}</p>}
      {quiet.length > 0 && <ul className="agent-draft-quiet">{quiet.map((agent) => (
        <li key={agent.id}><img src={portraitSrc(agent)} alt="" width={18} height={18} />{agent.name} has been quiet a while
          {onArchive && <button type="button" className="text-button" onClick={() => onArchive(agent.id)}><Archive size={12} />Archive</button>}</li>
      ))}</ul>}
      {proposal.status === "pending" && onProposal && (
        <div className="proposal-actions">
          <button className="primary-button" onClick={() => onProposal(proposal, "review")}><Check size={16} />Review {member ? "changes" : name === "A new agent" ? "agent" : name}</button>
          <button className="reject-button" onClick={() => onProposal(proposal, "reject")}><X size={14} aria-hidden="true" />Reject</button>
        </div>
      )}
      {proposal.status === "applied" && <div className="proposal-result"><span><CheckCheck size={16} />{member ? "Saved" : "Joined the crew"}</span></div>}
      {proposal.status === "rejected" && <div className="proposal-result" data-tone="quiet"><span><X size={14} />{proposal.replaced ? "Replaced by a newer draft." : "Rejected. Nobody joined."}</span></div>}
    </div>
  );
}

/**
 * A question one agent wants to ask another for you (agents-design D50): who asks whom, the question, what the asker
 * then does with the answer, and Send. Always and Decline are the quieter choices; the pencil turns the question into a
 * field so you can reword it before it goes. On Atlaswork's model it says how many of today's replies it uses.
 */
export function AskCard({ ask, from, to, busy, left, onAsk }: { ask: Ask; from?: Agent; to?: Agent; busy: boolean;
  /** Live replies left today on Atlaswork's model (D48); absent on any other model. */
  left?: number;
  onAsk?: (action: "send" | "always" | "decline", question?: string) => void }) {
  const name = to?.name ?? "another agent";
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  // The answer is one reply; a follow-up by the asker is a second.
  const cost = ask.then ? 2 : 1;
  const act = (action: "send" | "always" | "decline") => {
    onAsk!(action, editing && action !== "decline" ? draft : undefined);
    setDraft(null);
  };
  const pending = ask.status === "pending" && !!onAsk;
  return (
    <div className={`proposal ask ${ask.status}`}>
      <div className="proposal-heading">
        <span>{ask.status === "pending" ? `A question for ${name}` : `Question for ${name}`}</span>
        <span className="ask-heading-end">
          {pending && !editing && <Tip label="Reword the question before it goes"><button type="button" className="ask-edit" aria-label="Edit the question" onClick={() => setDraft(ask.question)}><Pencil size={14} /></button></Tip>}
          {from && to && <AvatarStack agents={[from, to]} size={18} />}
        </span>
      </div>
      {editing ? (
        <textarea className="ask-question ask-editor" aria-label={`Question for ${name}`} value={draft} maxLength={500} rows={3}
          ref={(field) => field?.focus()} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setDraft(null); } }} />
      ) : <blockquote className="ask-question">{ask.question}</blockquote>}
      {ask.then && <p className="ask-note">Then {from?.name ?? "they"} follows up: {ask.then}</p>}
      {pending && left !== undefined && <p className="ask-note" data-short={left < cost || undefined}>
        {left < cost ? `Needs ${cost} of today's replies; ${left} left.` : `Uses ${cost} of the ${left} replies left today.`}</p>}
      {pending && (
        <div className="proposal-actions">
          <button className="primary-button" disabled={busy || (editing && !draft.trim())} onClick={() => act("send")}><Send size={16} />Send to {name}</button>
          {from && to && <Tip label={`Send it, and let ${from.name} ask ${to.name} without checking with you from now on. Undo it in ${from.name}'s Permissions.`}><button className="quiet-button" disabled={busy || (editing && !draft.trim())} onClick={() => act("always")}>
          Always let {from.name} ask</button></Tip>}
          <button className="reject-button" onClick={() => act("decline")}><X size={14} aria-hidden="true" />Decline</button>
        </div>
      )}
      {ask.status === "sent" && <div className="proposal-result"><span><CheckCheck size={16} />Sent</span></div>}
      {ask.status === "declined" && <div className="proposal-result" data-tone="quiet"><span><X size={14} />Declined. Nothing was sent.</span></div>}
    </div>
  );
}
