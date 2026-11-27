// What the crew's buttons do: hiring, drafting (D57), editing, sharing, archiving and deleting agents, and acting on
// a proposal from chat.
import { RecordActions } from "./records.ts";
import type { AgentDraft, AgentTab } from "../ui.ts";
import { reviewDraft, settleDraft } from "../agentDrafts.ts";
import * as crews from "../agents.ts";
import { browseShared, shareAgent, unshareAgent } from "../community.ts";
import { atlasId } from "../model.ts";
import { agentRequestPrefix } from "../sittings.ts";
import { freeName, portraits } from "../look.ts";
import type { Agent, Places, Proposal } from "../model.ts";
import { addedWords, filesWord } from "../proposals.ts";
import * as routines from "../routines.ts";
import { reviewable } from "../formFill.ts";
import { countUsage } from "../usage.ts";
import { todayDate } from "../view.ts";
import * as workspace from "../workspace.ts";

export class CrewActions extends RecordActions {
  /**
   * A new agent arrives ready to save: an unused name and face, the crew's usual write mode, the tools Settings → Every
   * agent starts them with (D46), and the first domain nobody looks after. The dialog opens on “What do you need help
   * with?” for Atlas to draft one (D57), with Start blank below it.
   */
  newAgent = (places?: Partial<Places>) => {
    const d = this.data;
    const crew = d.agents.filter((agent) => !agent.archived && agent.id !== atlasId);
    const usedFaces = new Set(d.agents.map((agent) => agent.portrait));
    const domain = places ? undefined : d.domains.find((item) => !item.archived && !crews.stewardOf(d, item.name));
    this.ui.set({ agentDraft: {
      agent: { id: crypto.randomUUID(), name: freeName(d), portrait: portraits.find((portrait) => !usedFaces.has(portrait)) ?? portraits[0],
        role: domain ? `${domain.name} specialist` : "", instructions: "", ...d.everyAgent?.tools && { tools: d.everyAgent.tools },
        writeMode: crew.filter((agent) => agent.writeMode === "propose").length > crew.length / 2 ? "propose" : "full",
        routines: [routines.newRoutine("check-in", todayDate().toISOString())] },
      places: { domains: domain ? [domain.name] : [], projectIds: [], teamIds: [], ...places },
      tab: "profile", describe: true,
    } });
  };
  /** What you need, from New agent's first step: Atlas drafts the agent in his chat (D57), in a session of its own (D28). */
  askAtlasForAgent = (text: string) => {
    if (!text.trim()) return;
    this.ui.set({ agentDraft: null });
    const thread = `agent:${atlasId}`;
    this.toAtlas(() => {
      this.conversations.newSession(thread);
      void this.conversations.send(thread, `${agentRequestPrefix}${text.trim()}`, "");
    }, "Atlas is finishing a reply. Your request goes to him right after.");
  };
  /** A community setup becomes a draft of your own, placed nowhere yet. */
  adoptShared = (agent: Omit<Agent, "archived" | "restore">) => this.ui.set({ agentDraft: {
    agent: { ...agent, routines: [routines.newRoutine("check-in", todayDate().toISOString())] },
    places: { domains: [], projectIds: [], teamIds: [] }, tab: "profile" } });
  editAgent = (agent: Agent, tab: AgentTab = "profile") => {
    const places = workspace.placesOf(this.data, agent.id);
    this.ui.set({ agentDraft: { original: { agent, places }, agent, places, tab } });
  };
  /** What an agent may do with a connection (agents-design D83), from Settings → Connections; it saves as you change it. */
  setAgentAccess = (id: string, access: NonNullable<Agent["access"]>) => {
    const agent = this.data.agents.find((item) => item.id === id);
    if (agent) this.apply((d) => workspace.editAgent(d, id, { access: { ...agent.access, ...access } }));
  };
  /** An agent draft (D57), or an agent's changes to itself (D69): the agent dialog opens with it filled in, against current records. */
  reviewAgentDraft = (threadId: string, proposal: Proposal) => {
    if (!proposal.agent) return;
    try {
      const draft = reviewDraft(this.data, proposal.agent, { thread: threadId, proposal: proposal.id }, todayDate().toISOString());
      const by = proposal.origin && proposal.origin.agentId !== atlasId ? this.data.agents.find((agent) => agent.id === proposal.origin!.agentId) : undefined;
      const routinesOnly = !!proposal.agent.routines && !proposal.agent.instructions;
      this.ui.set({ agentDraft: { ...draft, ...by && { atlas: { ...draft.atlas, by: { name: by.name, portrait: by.portrait } } }, tab: routinesOnly ? "schedule" : "profile" } });
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Couldn't open this draft.");
    }
  };
  saveAgentDraft = (form: AgentDraft) => {
    const { agent: draft, places, atlas, describe: _describe, tab: _tab, ...rest } = form;
    const change = this.apply((d) => {
      const saved = workspace.saveDraft(d, { ...rest, agent: draft, places, kind: "agent" });
      return atlas ? settleDraft(saved, atlas) : saved;
    });
    if (!change) return;
    if (atlas) {
      countUsage("agent_draft_saved");
      if (atlas.edited) countUsage("agent_draft_changed");
    }
    const where = places.domains.length + places.projectIds.length + places.teamIds.length;
    this.ui.set({ agentDraft: null, toast: form.original ? `Saved ${draft.name.trim()}.` : where ? `${draft.name.trim()} joined the crew and got to work.`
      : `${draft.name.trim()} joined the crew. Put them on a domain or project so they can see something.` });
  };
  /** Domain names, project titles, and team names, for saying where an agent works. */
  protected placeNames(places: Places) {
    const d = this.data;
    return [...places.domains, ...places.projectIds.map((id) => d.projects.find((project) => project.id === id)?.title ?? ""),
      ...places.teamIds.map((id) => d.teams.find((team) => team.id === id)?.name ?? "")].filter(Boolean);
  }
  setAgentArchived = (id: string, archived: boolean) => {
    const name = this.data.agents.find((agent) => agent.id === id)?.name;
    if (!this.apply((d) => workspace.setAgentArchived(d, id, archived))) return;
    const back = archived ? [] : this.placeNames(workspace.placesOf(this.data, id));
    this.ui.set({ agentDraft: null, toast: archived ? `${name} is resting in the Archive. Their chat stays readable.`
      : back.length ? `${name} is back in ${back.join(", ")}.` : `${name} is back. Assign them somewhere to put them to work.` });
  };
  /** Archiving takes an agent off everything, so it asks first and names what they leave; `then` runs once it's done. */
  confirmAgentArchive = (agent: Agent, then?: () => void) => {
    const places = this.placeNames(workspace.placesOf(this.data, agent.id));
    this.ui.set({ confirming: {
      title: `Archive ${agent.name}?`,
      body: `${places.length ? `They leave ${places.join(", ")}. ` : ""}Their chat stays readable, and restoring them from Archive puts them back wherever nobody has taken their place.`,
      action: "Archive",
      danger: false,
      run: () => { this.setAgentArchived(agent.id, true); then?.(); },
    } });
  };
  deleteAgent = (id: string, name: string) => this.ui.set({ confirming: {
    title: `Delete ${name}?`,
    body: "Their chat goes too. Tasks they added stay where they are.",
    action: "Delete forever",
    danger: true,
    run: () => { if (this.apply((d) => workspace.deleteAgent(d, id))) this.toast(`${name} was deleted.`); },
  } });
  toggleShare = async (agent: Agent, share: boolean) => {
    try {
      await (share ? shareAgent(agent) : unshareAgent(agent));
      this.ui.set(({ sharedIds }) => ({ sharedIds: share ? [...sharedIds, agent.id] : sharedIds.filter((id) => id !== agent.id),
        toast: share ? `${agent.name}'s setup is shared with the community.` : `${agent.name} is no longer shared.` }));
      void browseShared().then((community) => this.ui.set({ community }));
    } catch (cause) { this.toast(cause instanceof Error ? cause.message : "Couldn't reach the community."); }
  };
  handleProposal = (threadId: string, proposal: Proposal, action: "apply" | "reject" | "undo" | "review") => {
    if (action === "review") return proposal.agent ? this.reviewAgentDraft(threadId, proposal) : reviewable(proposal) ? this.reviewProject(threadId, proposal) : undefined;
    if (proposal.files && action !== "reject") return void this.askTidy(threadId, proposal.id, proposal.files, action);
    try {
      this.conversations.actOnProposal(threadId, proposal.id, action);
      const count = proposal.changes?.length ?? 0;
      const done = [proposal.plant && `${proposal.plant.domain.emoji} ${proposal.plant.domain.name} planted`, count && `${count} ${count === 1 ? "change" : "changes"} made`]
        .filter(Boolean).join(", ");
      const toast = action === "apply" ? proposal.changes ? `${done}.` : `${addedWords(proposal)} added.`
        : action === "undo" ? "Undone. Your other tasks are unchanged." : proposal.agent ? "Rejected. Nobody joined." : "Rejected. Nothing changed.";
      // Apply can open what it made or moved, out of sight of the card's Undo (2026-11-20), so the toast offers it too.
      this.ui.set({ toast, toastAction: action === "apply" ? { for: toast, buttons: [{ label: "Undo", run: () => this.handleProposal(threadId, proposal, "undo") }] } : null });
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Could not change these tasks.");
    }
  };
  /**
   * Apply and Undo of a tidy (agents-design D79) go to the account, which saves your answer on the card and asks the
   * computer its files are on; the card follows what that computer does. Reject stays here, since nothing moves.
   */
  private askTidy = async (threadId: string, proposalId: string, files: NonNullable<Proposal["files"]>, action: "apply" | "undo") => {
    const message = this.data.threads.find((thread) => thread.id === threadId)?.messages.find((item) => item.proposal?.id === proposalId);
    if (!message) return this.toast("This tidy is no longer in the conversation.");
    if (!this.tidy) return this.toast("Sign in to tidy files on your computers.");
    const count = action === "apply" ? files.moves.length : files.done?.filter((result) => !result.failed).length ?? 0;
    try {
      this.workbench.absorb(await this.tidy({ thread: threadId, message: message.id, proposal: proposalId, action }));
      this.toast(action === "apply" ? `${filesWord(count)} ${count === 1 ? "waits" : "wait"} for ${files.computer.name} to move ${count === 1 ? "it" : "them"}.`
        : `${files.computer.name} will put ${count === 1 ? "it" : "them"} back.`);
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Couldn't reach your account. Try again.");
      void this.workbench.refresh();
    }
  };
  /** A quiet agent Atlas named beside his draft (D57): archived after the usual confirmation. */
  archiveQuiet = (id: string) => {
    const agent = this.data.agents.find((item) => item.id === id && !item.archived);
    if (!agent) return this.toast("They're already archived.");
    this.confirmAgentArchive(agent, () => countUsage("agent_quiet_archived"));
  };
}
