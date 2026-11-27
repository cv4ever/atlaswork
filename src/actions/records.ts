// What the record dialogs and menus do: domains, projects (with a chat proposal reviewed in the dialog, D63), archive
// and delete, teams, tasks and a note's words.
import { ChatActions } from "./chat.ts";
import * as crews from "../agents.ts";
import { domainHues } from "../model.ts";
import { quietestColour } from "../look.ts";
import { addDays } from "../dates.ts";
import type { Agent, ComputerFolder, Note, Project, Proposal, Task, Team } from "../model.ts";
import { suggestedDomains } from "../onboarding.ts";
import { domainKey, homeKey, parseHome, tabKey } from "../place.ts";
import { addSteps, buildStarter } from "../starterProjects.ts";
import type { StarterProject } from "../starterProjects.ts";
import type { AgentSuggestion } from "../suggestedAgents.ts";
import type { DomainForm, ProjectForm } from "../ui.ts";
import { amendedProposal, reviewForm } from "../formFill.ts";
import { countUsage } from "../usage.ts";
import { todayDate } from "../view.ts";
import { habitsOf } from "../taskHabits.ts";
import { dayParts, minuteNow } from "../today/day.ts";
import * as workspace from "../workspace.ts";
import type { Change, DomainDraft, DraftOf, Target } from "../workspace.ts";

export class RecordActions extends ChatActions {
  /** Saves the domain dialog. A new domain's toast offers Undo, which takes back the domain and the agent hired with it. */
  saveDomain = ({ filled, ...form }: DomainForm) => {
    const change = this.apply((d) => workspace.saveDraft(d, { kind: "domain", ...form }));
    if (!change) return;
    if (filled) countUsage("describe_saved");
    const domain = change.data.domains.find((item) => item.name === form.domain.name.trim())!;
    if (form.original) return this.ui.set({ domainDraft: null, toast: `${domain.emoji} ${domain.name} is tended.` });
    const keeper = crews.stewardOf(change.data, domain.name);
    const hired = keeper && change.changes.agents?.some((agent) => agent.id === keeper.id) ? keeper.id : undefined;
    countUsage("domain_planted");
    if (suggestedDomains.some((item) => item.name === domain.name && item.emoji === domain.emoji)) countUsage("domain_planted_common");
    if (!form.keeper || form.keeper.fresh) countUsage("domain_keeper_changed");
    this.shell.current?.showWorkspace();
    const toast = `${domain.emoji} ${domain.name} is planted${keeper ? `, and ${keeper.name} looks after it` : ""}.`;
    this.ui.set({ domainDraft: null, toast, toastAction: { for: toast, buttons: [{ label: "Undo", run: () => {
      if (!this.apply((d) => workspace.unplant(d, domain.name, hired))) return;
      countUsage("domain_unplanted");
      this.toast(`${domain.name} is unplanted${hired ? `, and ${keeper!.name} with it` : ""}.`);
    } }] } });
  };
  /** Domains are workspaces: park the current tab set and restore the target's (or seed one). */
  switchDomain = (name: string) => {
    void this.workbench.selectDomain(name);
    this.shell.current?.showWorkspace();
  };
  /**
   * Opens the new-domain form, pre-filled from a suggestion when given (a common domain, or one Atlas suggests while
   * sorting, D61); its hue only when no domain wears it yet. Its own agent comes preselected (`keeperFor`, agents-design D51).
   */
  newDomain = (preset?: Pick<DomainDraft, "name" | "emoji" | "intention"> & Partial<Pick<DomainDraft, "hue">>) => {
    const used = new Set(this.data.domains.map((domain) => domain.hue));
    const hue = preset?.hue && !used.has(preset.hue) ? preset.hue : Object.values(domainHues).find((value) => !used.has(value)) ?? domainHues.Sage;
    this.ui.set({ domainDraft: { domain: { name: preset?.name ?? "", emoji: preset?.emoji ?? "🌱", hue, intention: preset?.intention ?? "" },
      keeper: { since: todayDate().toISOString() } } });
  };
  editDomain = (name: string) => {
    const domain = this.data.domains.find((item) => item.name === name);
    if (domain) this.ui.set({ domainDraft: { original: domain, domain } });
  };

  setArchived = (target: Target, archived: boolean) => {
    if (!this.apply((d) => workspace.setArchived(d, target, archived))) return;
    this.ui.set({ domainDraft: null, projectForm: null, topicDraft: null, toast: archived ? "Archived. You'll find it in Archive." : "Restored to its place." });
  };
  confirmArchive = (target: Target, label: string) => this.ui.set({ confirming: {
    title: `Archive ${label}?`,
    body: `${target.kind === "note" ? "It" : "It and everything in it"} moves to the Archive, out of sight. Restore it from there whenever you like.`,
    action: "Archive",
    danger: false,
    run: () => this.setArchived(target, true),
  } });
  archiveNote = (id: string) =>
    this.confirmArchive({ kind: "note", id }, `“${this.data.notes.find((note) => note.id === id)?.title || "this resource"}”`);
  /** A project with resources of its own opens the keep-sheet first: what's worth keeping moves to a topic (PARA). */
  archiveProject = (project: Project) => {
    const homed = this.data.notes.some((note) => note.projectId === project.id && !note.archived);
    if (!homed) return this.confirmArchive({ kind: "project", id: project.id }, `“${project.title}”`);
    const first = this.data.topics.find((topic) => !topic.archived);
    this.ui.set({ keepSheet: { projectId: project.id, keep: {}, last: first ? homeKey({ domain: "", topicId: first.id }) : "" } });
  };
  finishKeepSheet = (projectId: string, keep: Record<string, string>) => {
    const topics = Object.fromEntries(Object.entries(keep).map(([id, key]) => { const home = parseHome(key); return [id, home.kind === "topic" ? home.id : ""]; }));
    if (!this.apply((d) => workspace.archiveProject(d, projectId, topics))) return;
    const kept = Object.keys(topics).length;
    this.ui.set({ keepSheet: null, projectForm: null, toast: kept ? `Archived. ${kept} ${kept === 1 ? "resource moved" : "resources moved"} to the Library.` : "Archived. You'll find it in Archive." });
  };
  /**
   * Asks before deleting for good. A domain whose agent looks after nothing else offers to archive that agent too
   * (ticked), so deleting a domain doesn't leave an idle agent in the crew; Archive brings it back.
   */
  deleteForever = (target: Target, label: string) => {
    const data = this.data;
    const { projects, notes, tasks } = workspace.contents(data, target);
    const parts = ([[projects.length, "project"], [notes.length, "resource"], [tasks.length, "task"]] as const)
      .filter(([count]) => count).map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`);
    // A resource linked into other projects leaves those too.
    const linked = target.kind === "note" ? (notes[0]?.linkedProjectIds ?? []).map((id) => data.projects.find((project) => project.id === id)?.title).filter(Boolean) : [];
    const steward = target.kind === "domain" ? crews.stewardOf(data, target.id) : undefined;
    const places = steward && workspace.placesOf(data, steward.id);
    const lone = places && !places.projectIds.length && !places.teamIds.length && places.domains.every((name) => name === target.id) ? steward : undefined;
    this.ui.set({ confirming: {
      title: `Delete ${label}?`,
      body: `${target.kind === "note" ? "It" : `It and everything in it${parts.length ? ` (${parts.join(", ")})` : ""}`} will be gone for good.${linked.length ? ` It also disappears from ${linked.join(", ")}, where it's linked.` : ""} Archive keeps things out of sight without losing them.`,
      action: "Delete forever",
      danger: true,
      ...lone && { also: { label: `Archive ${lone.name} too, who looks after nothing else`, on: true } },
      run: (also) => {
        const archive = lone && also ? lone : undefined;
        if (!this.apply((d) => {
          const rested = archive ? workspace.setAgentArchived(d, archive.id, true) : { data: d, changes: {} };
          const gone = workspace.deleteForever(rested.data, target);
          return { data: gone.data, changes: { ...rested.changes, ...gone.changes } };
        })) return;
        if (archive) countUsage("domain_keeper_archived");
        this.ui.set({ domainDraft: null, projectForm: null, topicDraft: null,
          toast: archive ? `${label} was deleted, and ${archive.name} is resting in the Archive.` : `${label} was deleted.` });
        if (target.kind === "topic") this.setLibraryTopic("");
      },
    } });
  };

  /**
   * Saves the project dialog; one opened from an idea (D62) is built from its starter: its page, finish line and first
   * steps. Steps an agent filled in (D63) take the place of a starter's and are added to a project being edited. One
   * opened to review a chat proposal applies that proposal as you left it (`applyReview`).
   */
  saveProject = (form: ProjectForm) => {
    if (form.review) return this.applyReview(form);
    const { starter, answer, steps = [], filled, review: _review, ...draft } = form;
    const { title, description, color, agentId, teamId, routines: list } = draft.project;
    const today = this.shown.today;
    const change = this.apply((current): Change & { moved?: boolean } => {
      // A lead the fill hired (D63) joins the crew first; `saveDraft` does that itself, a starter's build doesn't.
      const joined = starter && !draft.original && draft.hire && agentId === draft.hire.id && !current.agents.some((agent) => agent.id === agentId)
        ? workspace.createAgent(current, draft.hire) : undefined;
      const d = joined?.data ?? current;
      const built: Change & { moved?: boolean } = starter && !draft.original
        ? buildStarter(d, draft.project.area, steps.length ? { ...starter, tasks: [] } : starter, answer ?? "", today,
          { id: draft.project.id, finish: draft.finish?.date, project: { title, description, color, agentId, teamId, routines: list } })
        : workspace.saveDraft(d, { kind: "project", ...draft });
      const saved = joined ? { ...built, changes: { ...joined.changes, ...built.changes } } : built;
      return steps.length ? { ...addSteps(saved, draft.project.id, steps, today), moved: saved.moved } : saved;
    });
    if (!change) return;
    if (starter && !draft.original) countUsage("starter_built");
    if (filled) countUsage("describe_saved");
    const project = change.data.projects.find((item) => item.id === form.project.id)!;
    if (!form.original || change.moved) this.shell.current?.showWorkspace();
    this.ui.set({ projectForm: null, toast: !form.original ? `“${project.title}” is growing in ${project.area}.` : `Saved “${project.title}”.` });
  };
  /**
   * A project an agent proposed in chat (D61), opened in the project dialog to review (D63). Start there applies the
   * proposal as you left it from its chat, so its card shows Undo as an Apply would; a refusal keeps the dialog open.
   */
  reviewProject = (threadId: string, proposal: Proposal) => {
    countUsage("project_reviewed");
    this.ui.set({ projectForm: reviewForm(proposal, threadId) });
  };
  protected applyReview(form: ProjectForm) {
    const { thread, proposal: id } = form.review!;
    const proposal = this.data.threads.find((item) => item.id === thread)?.messages.find((message) => message.proposal?.id === id)?.proposal;
    if (proposal?.status !== "pending") return this.ui.set({ projectForm: null, toast: "That proposal was already answered in its chat." });
    try {
      this.conversations.actOnProposal(thread, id, "apply", amendedProposal(proposal, form, this.shown.today));
    } catch (cause) {
      return this.toast(cause instanceof Error ? cause.message : "Couldn't start this project.");
    }
    countUsage("project_review_saved");
    if (form.filled) countUsage("describe_saved");
    this.shell.current?.showWorkspace();
    this.openTab(tabKey({ kind: "project", id: form.project.id }));
    this.ui.set({ projectForm: null, toast: `“${form.project.title.trim()}” is growing in ${form.project.area}.` });
  }
  /**
   * Opens the new-project form in `area`, the selected domain by default, filled in from `starter` when an idea was
   * picked (D62). It comes ready to save: done in a month (unless the starter asks for its own date), in the colour
   * the domain uses least.
   */
  newProject = (area = this.session.domain, starter?: StarterProject) =>
    this.ui.set({ projectForm: this.projectStart(area, starter ? { title: starter.title, description: starter.line, color: starter.color } : {}, starter) });
  protected projectStart(area: string, fields: Partial<Project>, starter?: StarterProject): ProjectForm {
    const today = this.shown.today;
    const color = quietestColour(this.data.projects, area);
    return { project: { id: crypto.randomUUID(), title: "", area, description: "", color, ...fields },
      ...starter?.ask?.kind !== "date" && { finish: { date: addDays(today, 30), today } }, ...starter && { starter } };
  }
  editProject = (project: Project) => this.ui.set({ projectForm: { original: project, project } });
  /** Sets a project's assigned agent or team; either may be cleared with undefined. */
  assignProject = (project: Project, patch: Pick<Project, "agentId"> | Pick<Project, "teamId">) => {
    this.apply((d) => workspace.editProject(d, project.id, patch));
  };
  /** Sets or clears a project's folder on one of the account's computers (D77): every device then knows where it is. */
  setProjectFolder = (project: Project, folder: ComputerFolder | undefined) => {
    this.apply((d) => workspace.editProject(d, project.id, { folder }));
  };
  /**
   * A ready-made agent picked in a project's crew menu (D61): they join the crew and lead it at once. The toast's Undo
   * gives the project back to whoever led it and lets them go while they've done nothing else.
   */
  bringInLead = (project: Project, suggestion: AgentSuggestion) => {
    const agent = workspace.agentFrom(this.data, suggestion);
    if (!this.apply((d) => workspace.bringInLead(d, project.id, agent))) return;
    const toast = `${agent.name} joined the crew and leads “${project.title}”.`;
    this.ui.set({ toast, toastAction: { for: toast, buttons: [{ label: "Undo", run: () => {
      if (this.apply((d) => workspace.sendBackLead(d, project.id, agent.id, project.agentId))) this.toast(`${agent.name} left “${project.title}”.`);
    } }] } });
  };
  /** Makes `agent` the domain's steward: it sees everything there, joins every crew and runs its routines. */
  assignDomain = (domain: string, agent: Agent) => {
    if (this.apply((d) => workspace.editDomain(d, domain, { agentId: agent.id }))) this.toast(`${agent.name} now looks after ${domain}.`);
  };

  newTeam = () => this.ui.set({ teamForm: { team: { id: crypto.randomUUID(), name: "", purpose: "", memberIds: [] } } });
  editTeam = (team: Team) => this.ui.set({ teamForm: { original: team, team } });
  saveTeamDraft = (form: DraftOf<"team">) => {
    const { original, team } = form;
    if (!this.apply((d) => workspace.saveDraft(d, { kind: "team", ...form }))) return;
    this.ui.set({ teamForm: null, toast: !original ? `${team.name.trim()} is ready. Put them on a project, or chat with them as a team.` : `Saved ${team.name.trim()}.` });
  };
  deleteTeam = (team: Team) => this.ui.set({ confirming: {
    title: `Disband ${team.name}?`,
    body: "Its projects keep their assigned agent, and its team chat goes. The agents stay on your crew.",
    action: "Disband",
    danger: true,
    run: () => {
      if (!this.apply((d) => workspace.deleteTeam(d, team.id))) return;
      this.ui.set({ teamForm: null, toast: `${team.name} was disbanded.` });
    },
  } });

  changeNote = (id: string, patch: Partial<Pick<Note, "title" | "body" | "source">>) => {
    this.apply((d) => workspace.editResource(d, id, patch));
  };
  /**
   * A new Task starts in the given Project, else straight in the selected Domain, due today as Capture's is, with that
   * home's usual length and part of the day (`habitsOf`) while that part isn't over. Workspace refuses a home that has gone.
   */
  newTask = (projectId = "") => {
    const project = this.data.projects.find((item) => item.id === projectId);
    const usual = habitsOf(this.data.tasks, { domain: project?.area ?? this.session.domain, projectId: project?.id ?? "" });
    const open = usual.part && dayParts.find((part) => part.part === usual.part)!.to > minuteNow(this.shown.now);
    this.ui.set({ editingTask: { title: "", due: this.shown.today, at: open ? usual.part! : "", length: usual.length ?? 0, done: false,
      home: projectId || domainKey(this.session.domain) } });
  };
  editTask = (task: Task) => this.ui.set({ editingTask: { original: task, title: task.title, due: task.due, at: task.at ?? "", length: task.length ?? 0, done: task.done,
    home: homeKey(task) } });
  /** Sends only what the dialog changed, so an agent's edit made while it was open survives. */
  saveTaskForm = (form: DraftOf<"task">) => {
    if (this.apply((d) => workspace.saveDraft(d, { kind: "task", ...form }))) this.ui.set({ editingTask: null });
  };
  /** The task dialog's Delete: gone at once, with Undo on the toast instead of a confirmation. */
  deleteTask = (task: Task) => {
    const current = this.data.tasks.find((item) => item.id === task.id) ?? task;
    if (!this.apply((d) => workspace.deleteTask(d, task.id))) return;
    const toast = `Deleted “${current.title}”.`;
    this.ui.set({ editingTask: null, toast, toastAction: { for: toast, buttons: [{ label: "Undo", run: () => this.apply((d) => workspace.restoreTask(d, current)) }] } });
  };
  toggleTask = (task: Task) => !!this.apply((d) => workspace.editTask(d, task.id, { done: !task.done }));
  /** A swipe's Tomorrow: moves the task's day, with Undo back to the day it had while nobody changed it since. */
  moveTaskTo = (task: Task, day: string, label: string) => {
    const change = this.apply((d) => workspace.editTask(d, task.id, { due: day }));
    if (!change) return;
    const toast = `Moved “${task.title}” to ${label}.`;
    this.ui.set({ toast, toastAction: { for: toast, buttons: [{ label: "Undo", run: () => {
      if (this.data.tasks.find((item) => item.id === task.id)?.due === day) this.apply((d) => workspace.editTask(d, task.id, { due: task.due }));
    } }] } });
  };
}
