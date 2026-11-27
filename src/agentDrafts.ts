// Agents Atlas drafts from your goal (agents-design D57): what he picks from (your crew, the suggested agents, free
// faces, quiet agents), the agent dialog's draft a proposal opens as, and the Save that marks it applied in the same
// change. propose_agent in commands.ts turns his call into the AgentProposal. agentDrafts.test.ts covers it.
import { atlasId, defaultDomain, domainHues, toolDefault } from "./model.ts";
import { freeName, portraits } from "./look.ts";
import type { Agent, AgentProposal, Places, Thread, ToolId, WorkspaceData } from "./model.ts";
import { newRoutine } from "./routines.ts";
import { suggestedAgents } from "./suggestedAgents.ts";
import type { AgentSuggestion } from "./suggestedAgents.ts";
import { placesOf, saveThread, weeklyImprovement } from "./workspace.ts";
import type { Change, DomainDraft } from "./workspace.ts";

/** Days without a word before Atlas offers to archive an agent beside his draft (D57). */
export const quietDays = 30;
const dayMs = 864e5;
const lower = (text: string) => text.trim().toLocaleLowerCase();

/**
 * Crew agents that said nothing for `quietDays`: counted from their last message in any chat or, never having spoken,
 * from when their first routine was set up. An agent with neither isn't judged.
 */
export function quietAgents(data: WorkspaceData, now = new Date()): { agent: Agent; days: number }[] {
  const last = new Map<string, string>();
  for (const thread of data.threads) for (const message of thread.messages)
    if (message.role === "agent" && message.agentId && message.at && message.at > (last.get(message.agentId) ?? "")) last.set(message.agentId, message.at);
  return data.agents.flatMap((agent) => {
    if (agent.archived || agent.id === atlasId) return [];
    const since = last.get(agent.id) ?? agent.routines?.map((routine) => routine.since).filter(Boolean).sort()[0];
    const days = since ? Math.floor((now.getTime() - new Date(since).getTime()) / dayMs) : 0;
    return days >= quietDays ? [{ agent, days }] : [];
  });
}

/** What Atlas picks from: the active crew, suggested agents whose name nobody here goes by, unworn faces, and quiet agents. */
export function agentOptions(data: WorkspaceData, now = new Date()) {
  const names = new Set(data.agents.map((agent) => lower(agent.name)));
  const worn = new Set(data.agents.map((agent) => agent.portrait));
  return {
    crew: data.agents.filter((agent) => !agent.archived && agent.id !== atlasId),
    suggestions: suggestedAgents.filter((agent) => !names.has(lower(agent.name))),
    faces: portraits.filter((portrait) => !worn.has(portrait)),
    quiet: quietAgents(data, now),
  };
}

/** `agentOptions` as list_agent_options answers it. */
export function optionsText(data: WorkspaceData, now = new Date()) {
  const { crew, suggestions, faces, quiet } = agentOptions(data, now);
  const where = (agent: Agent) => {
    const places = placesOf(data, agent.id);
    return [...places.domains, ...places.projectIds.map((id) => data.projects.find((project) => project.id === id)?.title ?? "")].filter(Boolean).join(", ") || "nowhere yet";
  };
  return [
    `Your crew (name: role; where; house rules):\n${crew.map((agent) => `- ${agent.name}: ${agent.role}; ${where(agent)}; “${agent.instructions}”`).join("\n") || "nobody yet"}`,
    `Suggested agents (name: role; domain; house rules):\n${suggestions.map((agent) => `- ${agent.name}: ${agent.role}; ${agent.domain ?? "everywhere"}; “${agent.instructions}”`).join("\n") || "none left"}`,
    `Free faces: ${faces.join(", ") || "none"}.`,
    `Quiet for ${quietDays} days or more: ${quiet.map(({ agent, days }) => `${agent.name} (${days} days)`).join(", ") || "nobody"}.`,
  ].join("\n\n");
}

/**
 * Who reviews the draft and what Atlas changed, so the dialog can mark it (D57). `was`: a crew agent's house rules
 * before; `edited`: you changed something in the dialog before saving; `test`: the request Try it sends; `by`: the
 * agent that drafted changes to itself (D69), when it isn't Atlas.
 */
export type AtlasMark = { thread: string; proposal: string; why?: string; flagged: (ToolId | "proactive")[]; was?: string; edited?: true; test?: string; by?: Pick<Agent, "name" | "portrait"> };
export type ReviewDraft = { original?: { agent: Agent; places: Places }; agent: Agent; places: Places; newDomain?: DomainDraft; atlas: AtlasMark };

/**
 * The agent dialog's draft for a proposal, against current records: a crew agent with Atlas's fields over theirs, or a
 * new agent from the suggestion (when its name is still free) or from scratch, with a free name and face, the tools every
 * agent starts with and a check-in. A domain that doesn't exist (any more) is planted with it. Throws when the crew
 * agent it changes is gone.
 */
export function reviewDraft(data: WorkspaceData, draft: AgentProposal, mark: Pick<AtlasMark, "thread" | "proposal">, since: string): ReviewDraft {
  const names = new Set(data.agents.map((agent) => lower(agent.name)));
  const worn = new Set(data.agents.map((agent) => agent.portrait));
  const current = draft.agentId ? data.agents.find((agent) => agent.id === draft.agentId) : undefined;
  if (draft.agentId && (!current || current.archived)) throw new Error("That agent isn't in the crew any more. Ask Atlas for a fresh draft.");
  const base: Partial<AgentSuggestion> = !current && draft.from ? suggestedAgents.find((agent) => lower(agent.name) === lower(draft.from!)) ?? {} : {};
  const free = (name?: string) => name && !names.has(lower(name)) ? name.trim() : undefined;
  const face = (portrait?: string) => portrait && !worn.has(portrait) ? portrait : undefined;
  const tools = { ...current ? current.tools : data.everyAgent?.tools, ...draft.tools };
  const agent: Agent = current ? { ...current, ...draft.portrait && face(draft.portrait) && { portrait: draft.portrait } } : {
    id: crypto.randomUUID(),
    name: free(draft.name) ?? free(base.name) ?? freeName(data),
    portrait: face(draft.portrait) ?? face(base.portrait) ?? portraits.find((portrait) => !worn.has(portrait)) ?? portraits[0],
    role: base.role ?? "", instructions: base.instructions ?? "", writeMode: "propose", ...base.warmth !== undefined && { warmth: base.warmth },
    // A daily goal keeps a morning check-in of its own; every new agent suggests improvements once a week (D68).
    routines: [...draft.checkIn === "daily" ? [newRoutine("check-in", since)] : [], weeklyImprovement(data, since)],
  };
  Object.assign(agent, {
    ...draft.role && { role: draft.role }, ...draft.instructions && { instructions: draft.instructions }, ...draft.writeMode && { writeMode: draft.writeMode },
    ...draft.warmth !== undefined && { warmth: draft.warmth }, ...draft.detail !== undefined && { detail: draft.detail },
    ...Object.keys(tools).length && { tools: Object.fromEntries(Object.entries(tools).filter(([id, on]) => on !== toolDefault(id as ToolId))) },
    // A crew agent's own suggestion may set all its routines (D69).
    ...current && draft.routines && { routines: draft.routines },
  });
  const places = current ? placesOf(data, current.id) : { domains: [], projectIds: [], teamIds: [] };
  // Everyday stays Atlas's (D51): a draft that names it looks after nothing yet.
  const named = draft.newDomain?.name ?? draft.domain;
  const wanted = named && lower(named) !== lower(defaultDomain.name) ? named : undefined;
  const live = wanted ? data.domains.find((domain) => !domain.archived && lower(domain.name) === lower(wanted)) : undefined;
  const usedHues = new Set(data.domains.map((domain) => domain.hue));
  const newDomain: DomainDraft | undefined = wanted && !live && !data.domains.some((domain) => lower(domain.name) === lower(wanted))
    ? { name: wanted.trim(), emoji: draft.newDomain?.emoji || "🌱", intention: draft.newDomain?.intention ?? "",
      hue: Object.values(domainHues).find((hue) => !usedHues.has(hue)) ?? domainHues.Sage } : undefined;
  const home = live?.name ?? newDomain?.name;
  if (home && !places.domains.includes(home)) places.domains = [...places.domains, home];
  const flagged = [...(Object.keys(draft.tools ?? {}) as ToolId[]).filter((id) => draft.tools![id] && !toolDefault(id) && !current?.tools?.[id]),
    ...draft.writeMode === "full" && current?.writeMode !== "full" ? ["proactive" as const] : []];
  return { ...current && { original: { agent: current, places: placesOf(data, current.id) } }, agent, places, ...newDomain && { newDomain },
    atlas: { ...mark, ...draft.why && { why: draft.why }, ...draft.test && { test: draft.test }, flagged,
      ...current && draft.instructions && draft.instructions !== current.instructions && { was: current.instructions } } };
}

/** Save's change with the proposal it came from marked applied in its chat, so both land in one storage transaction. */
export function settleDraft(change: Change, mark: Pick<AtlasMark, "thread" | "proposal">): Change {
  const thread = change.data.threads.find((item) => item.id === mark.thread);
  if (!thread?.messages.some((message) => message.proposal?.id === mark.proposal && message.proposal.status === "pending")) return change;
  const saved = saveThread(change.data, { ...thread, messages: thread.messages.map((message) => message.proposal?.id === mark.proposal
    ? { ...message, proposal: { ...message.proposal, status: "applied" as const } } : message) });
  return { data: saved.data, changes: { ...change.changes, ...saved.changes } };
}

/** A new draft takes the place of the earlier ones still waiting in its chat (D57): they read as replaced. */
export const replaceDrafts = (thread: Thread, newest: string): Thread => ({ ...thread, messages: thread.messages.map((message) =>
  message.proposal?.agent && message.proposal.status === "pending" && message.proposal.id !== newest
    ? { ...message, proposal: { ...message.proposal, status: "rejected" as const, replaced: true as const } } : message) });
