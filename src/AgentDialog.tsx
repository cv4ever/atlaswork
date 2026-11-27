// The agent dialog: a name badge that answers back (agentDialog/AgentBadge.tsx), beside Profile, Permissions, Tasks,
// Schedule and Briefing tabs (agentDialog/*Tab.tsx, AgentBriefing.tsx). A new agent opens on Describe it first
// (agentDialog/DescribeAgent.tsx); a draft Atlas wrote carries his note and Try it (agentDialog/AtlasNote.tsx). What it
// counts about the draft is agentDialog/draftState.ts. Nothing is saved until Save.
import type { CSSProperties, ReactNode } from "react";
import { Archive, CalendarClock, ListChecks, ScrollText, Share2, ShieldCheck, UserRound } from "lucide-react";
import AgentBriefing from "./AgentBriefing.tsx";
import type { BriefingLink } from "./AgentBriefing.tsx";
import * as crews from "./agents.ts";
import { tonePreview } from "./atlas.ts";
import Dialog from "./Dialog.tsx";
import { agentTools, atlasId, canUse } from "./model.ts";
import type { Agent, Domain, Note, Places, Project, Task, ToolId, WorkspaceData } from "./model.ts";
import type { ModelSource } from "./modelMenu.ts";
import type { DomainDraft } from "./workspace.ts";
import type { AgentDraft, AgentTab } from "./ui.ts";
import { Tip } from "./Popups.tsx";
import { AgentBadge } from "./agentDialog/AgentBadge.tsx";
import { AtlasNote } from "./agentDialog/AtlasNote.tsx";
import { DescribeAgent } from "./agentDialog/DescribeAgent.tsx";
import { editCount, scheduleOf, setupSteps } from "./agentDialog/draftState.ts";
import { PermissionsTab } from "./agentDialog/PermissionsTab.tsx";
import { placeChips, ProfileTab } from "./agentDialog/ProfileTab.tsx";
import { ScheduleTab } from "./agentDialog/ScheduleTab.tsx";

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export default function AgentDialog({ draft: agentDraft, data, domains, liveProjects, notes, now, person, renderTasks, preview, shared, onShare, engine,
  onDraft, onSave, onArchive, onSettings, onForget, onAskAtlas, onTry, onClose }: {
  draft: AgentDraft;
  /** Whether the saved agent is shared with the community (D34); `onShare` is absent when there's no account to share through. */
  shared?: boolean;
  onShare?: (agent: Agent, share: boolean) => void;
  /** Where the Profile's Model section comes from (`AgentEngine.models`); absent, one model answers every agent. */
  engine?: ModelSource;
  data: WorkspaceData;
  /** Live domains in order, each with its live projects. */
  domains: (Domain & { projects: Project[] })[];
  liveProjects: Project[];
  /** Live notes, and the clock routines run by. */
  notes: Note[];
  now: Date;
  /** Your profile, as a reply sends it (Briefing). */
  person: { name: string; about: string };
  /** The app's task list, so ticking a task here behaves as it does everywhere. */
  renderTasks: (tasks: Task[]) => ReactNode;
  preview: (draft: AgentDraft) => WorkspaceData;
  onDraft: (draft: AgentDraft) => void;
  onSave: (draft: AgentDraft) => void;
  onArchive: (agent: Agent) => void;
  /** Opens Settings over this dialog, keeping its draft: Every agent, or your Profile (Briefing's Edit links). */
  onSettings: (tab: "agents" | "you") => void;
  /** Forgets a memory for good, from Briefing (agents-design D49). */
  onForget?: (id: string) => void;
  /** Hands what you need to Atlas, who drafts the agent in his chat (D57). */
  onAskAtlas?: (goal: string) => void;
  /** Runs the draft, as it stands, on Atlas's test request without saving anything (D57): what they'd say, and what they'd propose. */
  onTry?: (draft: AgentDraft, request: string) => Promise<{ text: string; proposed?: string }>;
  onClose: () => void;
}) {
  const { agent: draft, places, tab, atlas, newDomain } = agentDraft;
  if (agentDraft.describe && !agentDraft.original)
    return <DescribeAgent draft={agentDraft} data={data} domains={domains} onDraft={onDraft} onAskAtlas={onAskAtlas} onClose={onClose} />;
  // An edit to Atlas's draft is counted when it's saved (D57).
  const touched = atlas && !atlas.edited ? { atlas: { ...atlas, edited: true as const } } : {};
  const original = agentDraft.original?.agent;
  const current = data.agents.find((agent) => agent.id === draft.id);
  const change = (patch: Partial<Agent>) => onDraft({ ...agentDraft, ...touched, agent: { ...draft, ...patch } });
  const setPlaces = (key: keyof Places, items: string[]) => onDraft({ ...agentDraft, ...touched, places: { ...places, [key]: items } });
  // A domain Atlas plants with the agent (D57): renaming or dropping it moves the agent's place along.
  const plant = (next?: DomainDraft) => onDraft({ ...agentDraft, ...touched, newDomain: next,
    places: { ...places, domains: [...places.domains.filter((item) => item !== newDomain?.name.trim()), ...next ? [next.name.trim()] : []] } });
  const name = draft.name.trim();
  const taken = data.agents.some((agent) => agent.id !== draft.id && agent.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const isAtlas = draft.id === atlasId;
  // Preview the same edit Save will commit, without restoring stale permissions or assignments.
  let saved = data;
  let previewError = "";
  try { saved = preview(agentDraft); }
  catch (cause) { previewError = cause instanceof Error ? cause.message : "Cannot preview this agent."; }
  const scope = crews.scopeOf(saved, draft.id);
  const liveIds = new Set(liveProjects.map((project) => project.id));
  const liveNames = new Set(domains.map((domain) => domain.name));
  const shown = (item: { domain: string; projectId: string }) =>
    (item.projectId ? liveIds.has(item.projectId) : liveNames.has(item.domain)) && crews.sees(scope, item);
  // Soonest due first; undated last.
  const openTasks = data.tasks.filter((task) => !task.done && shown(task))
    .sort((a, b) => (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31"));
  const reach = [count(liveProjects.filter((project) => scope.all || scope.projects.has(project.id)).length, "project"),
    count(data.notes.filter((note) => !note.archived && shown(note)).length, "resource"),
    count(openTasks.length, "open task")].join(" · ");
  const chips = placeChips(data, draft.id, places, domains, liveProjects);
  const hue = chips.find((chip) => chip.hue)?.hue;
  const edits = original ? editCount(original, draft, places, agentDraft.original!.places) : 0;
  const roles = [...new Set([...domains.map((domain) => `${domain.name} specialist`), "Meal planner", "Fitness coach", "Bookkeeper",
    "Trip planner", "Study buddy", "Weekly planner", "Writing partner", ...data.agents.map((agent) => agent.role).filter(Boolean)])];
  const tools = Object.keys(agentTools) as ToolId[];
  const added = data.tasks.filter((task) => task.agentId === draft.id);
  const schedule = scheduleOf(saved, draft.id, now);
  const tabs = [
    { id: "profile" as const, label: "Profile", icon: <UserRound size={16} />, badge: "" },
    { id: "permissions" as const, label: "Permissions", icon: <ShieldCheck size={16} />, badge: `${tools.filter((id) => canUse(draft, id)).length}/${tools.length}` },
    { id: "tasks" as const, label: "Tasks", icon: <ListChecks size={16} />, badge: String(openTasks.length) },
    { id: "schedule" as const, label: "Schedule", icon: <CalendarClock size={16} />, badge: String(schedule.on) },
    { id: "briefing" as const, label: "Briefing", icon: <ScrollText size={16} />, badge: "" },
  ];
  const pickTab = (picked: AgentTab) => {
    onDraft({ ...agentDraft, tab: picked });
    requestAnimationFrame(() => document.getElementById(`agent-tab-${picked}`)?.focus());
  };
  const editFrom = (link: BriefingLink) => link === "every" || link === "you" ? onSettings(link === "every" ? "agents" : "you") : pickTab(link);
  return (
    <Dialog className="agent-dialog" title={original ? `Configure ${original.name}` : "A new agent"} onClose={onClose}>
      <form className="agent-form" style={{ "--hue": hue } as CSSProperties}
        onSubmit={(event) => { event.preventDefault(); if (name && !taken) onSave(agentDraft); }}>
        <AgentBadge draft={draft} original={original} data={data} taken={taken} sample={tonePreview(draft, saved)} roles={roles} onChange={change}
          status={original ? edits ? `${count(edits, "change")} not saved yet` : "Everything's saved"
            : setupSteps(name, taken, draft.role, chips.length > 0 || !!newDomain)} />
        <div className="agent-pane">
          {atlas && <AtlasNote atlas={atlas} editing={original?.name} name={name} onTry={onTry && ((request) => onTry(agentDraft, request))} />}
          <div className="segmented-control agent-tabs" role="tablist" aria-label="Agent settings">
            {tabs.map((item, at) => (
              <Tip key={item.id} label={item.label}><button type="button" role="tab" id={`agent-tab-${item.id}`} aria-controls="agent-tabpanel"
                aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1} onClick={() => pickTab(item.id)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  pickTab(tabs[(at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].id);
                }}>
                {item.icon}<span className="agent-tab-label">{item.label}</span>{item.badge && <span className="sr-only">, {item.badge}</span>}
              </button></Tip>
            ))}
          </div>
          <div className="agent-fields" role="tabpanel" id="agent-tabpanel" aria-labelledby={`agent-tab-${tab}`} key={tab}>
            {previewError && <p role="status">{previewError}</p>}
            {tab === "profile" && <ProfileTab draft={draft} data={data} domains={domains} places={places} chips={chips} newDomain={newDomain} atlas={atlas}
              reach={reach} isAtlas={isAtlas} archived={!!(current?.archived ?? draft.archived)} editing={!!original?.instructions} engine={engine}
              onChange={change} onPlaces={setPlaces} onPlant={plant} />}
            {tab === "permissions" && <PermissionsTab draft={draft} data={data} atlas={atlas} onChange={change} />}
            {tab === "tasks" && (
              <section className="agent-section" aria-labelledby="agent-open">
                <h3 id="agent-open">Open where they look <small>{count(openTasks.length, "task")}{openTasks.length > 8 ? ", soonest 8 shown" : ""}</small></h3>
                {renderTasks(openTasks)}
                <p className="agent-hint">{added.length
                  ? `They've added ${count(added.length, "task")}: ${added.filter((task) => !task.done).length} open, ${added.filter((task) => task.done).length} done.`
                  : "They haven't added any tasks yet."} Ticking a task off here saves right away.</p>
              </section>
            )}
            {tab === "schedule" && <ScheduleTab agentId={draft.id} saved={saved} notes={notes} now={now} schedule={schedule} previewError={previewError}
              onChange={change} />}
            {tab === "briefing" && <AgentBriefing agent={draft} data={saved} person={person} today={now.toLocaleDateString("en-CA")} onEdit={editFrom}
              onForget={onForget} />}
          </div>
        </div>
        <div className="form-actions">
          {current && !isAtlas && !current.archived && <>
            <button type="button" className="quiet-button" onClick={() => onArchive(current)}><Archive size={14} />Archive</button>
            {onShare && <Tip label={shared ? "Take your shared setup down"
              : "Share the saved setup: name, face, role, house rules, write mode and tools. Never your notes or chats."}>
              <button type="button" className="quiet-button" onClick={() => onShare(current, !shared)}>
                <Share2 size={14} />{shared ? "Unshare" : "Share with the community"}</button></Tip>}
          </>}
          <button type="button" className="quiet-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!name || taken || (!!original && !edits)}>
            {!original ? `Welcome ${name || "them"}` : edits ? `Save ${count(edits, "change")}` : "No changes"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
