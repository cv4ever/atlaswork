// The Proposal module: what happens to an agent's Proposal, Handoff and Ask between its reply and the Workspace
// (agents-design D9, D23, D50). Landing admits them against current records, settles the Proposal by the agent's write
// mode and an Ask by whether you let that pair talk, and words the message; Apply and Send admit again before anything
// changes or goes. Pure: the Room stamps and commits what comes back, so a Proposal and its history land in one storage
// transaction, and the Room runs the asked agent. proposals.test.ts covers it.
import { replaceDrafts } from "./agentDrafts.ts";
import { admitHandoff, admitProposal, agentWorkspace } from "./agentWorkspace.ts";
import { tidyLimits } from "../supabase/functions/agent/tidy.ts";
import { warningKinds, warningsIn } from "../supabase/functions/agent/warnings.ts";
import type { AgentReply, MemoryDraft } from "./agentRequest.ts";
import { atlasId, byId, canUse } from "./model.ts";
import type { Agent, Ask, ChatMessage, Learned, Memory, Proposal, Remembered, Thread, Usage, WorkspaceData } from "./model.ts";
import { applyProposal, editAgent, remember, undoProposal, unremember } from "./workspace.ts";
import type { Change } from "./workspace.ts";

/** At most this many review changes apply on their own in one proactive run; the rest wait for your OK. */
export const reviewCap = 5;

export type Landing = {
  data: WorkspaceData;
  reply: Pick<AgentReply, "text" | "proposal" | "handoff" | "ask" | "display" | "memories" | "learned" | "used" | "warnings">;
  /** Who answered, as current records hold them; admission refuses an agent that lost the access it drafted with. */
  agentId: string;
  /** The Thread's attached Resource now, which may extend where the agent can change things. */
  attachedNoteId?: string | null;
  /**
   * A routine run, or a reply the function landed after its page had gone (D72), rather than an answer the person is
   * watching: a full-write agent then applies at most `reviewCap` review changes, and a question always waits for you.
   */
  proactive?: boolean;
};
/** The agent's messages, without identity or time, and the Change that commits with them. */
export type Landed = { messages: Pick<ChatMessage, "text" | "proposal" | "links" | "display" | "ask" | "remembered" | "learned" | "used" | "warnings">[]; change: Change };
/** Who wrote a posted message and what it answers: everything but its words and what landed with them. */
export type Stamp = Omit<ChatMessage, "id" | "text" | "proposal" | "links" | "display" | "ask" | "remembered" | "learned" | "usage" | "used" | "warnings">;

/**
 * `thread` with what landed posted under one stamp: the reply's usage on its first message, a new agent draft replacing
 * earlier ones (D57), and the agent taken off the `awaiting` of the message it answers. The function posts a reply
 * the same way when the page that asked has gone (D72).
 */
export function postedThread(thread: Thread, stamp: Stamp, messages: Landed["messages"], usage?: Usage): Thread {
  const draft = messages.find((said) => said.proposal?.agent)?.proposal;
  const kept = draft ? replaceDrafts(thread, draft.id) : thread;
  // Once nobody it asked is left, the last failure's reason goes too.
  const settled = stamp.replyTo ? kept.messages.map((message) => {
    if (message.id !== stamp.replyTo || !message.awaiting) return message;
    const awaiting = message.awaiting.filter((agentId) => agentId !== stamp.agentId);
    const { failure: _failure, ...rest } = message;
    return { ...awaiting.length ? message : rest, awaiting };
  }) : kept.messages;
  return { ...kept, messages: [...settled,
    ...messages.map((said, index) => ({ id: crypto.randomUUID(), ...stamp, ...said, ...index === 0 && usage ? { usage } : {} }))] };
}

const tasksWord = (count: number) => `${count} ${count === 1 ? "task" : "tasks"}`;
/** "a domain, a project, 3 tasks and 2 notes": what a proposal adds, leaving out a kind it has none of. */
export const addedWords = (proposal: Pick<Proposal, "items" | "notes" | "projects" | "plant">) => {
  const parts = [proposal.plant ? "a domain" : "", proposal.projects?.length ? proposal.projects.length === 1 ? "a project" : `${proposal.projects.length} projects` : "",
    proposal.items.length ? tasksWord(proposal.items.length) : "",
    proposal.notes?.length ? `${proposal.notes.length} ${proposal.notes.length === 1 ? "note" : "notes"}` : ""].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? tasksWord(0);
};
/** "3 files", "one file": how many files a tidy (D79) moves. */
export const filesWord = (count: number) => `${count} ${count === 1 ? "file" : "files"}`;
/** "a domain and 3 changes", "2 tasks and a note", "3 files on Office PC": what a proposal's Apply does, as its card and the Logbook say it. */
export const proposalWords = (proposal: Pick<Proposal, "items" | "notes" | "projects" | "plant" | "changes" | "files">) => proposal.files
  ? `${filesWord(proposal.files.moves.length)} on ${proposal.files.computer.name}`
  : proposal.changes
  ? [proposal.plant && "a domain", proposal.changes.length && `${proposal.changes.length} ${proposal.changes.length === 1 ? "change" : "changes"}`].filter(Boolean).join(" and ")
  : addedWords(proposal);
const changesWord = (count: number) => count === 1 ? "one change" : `${count} changes`;

/**
 * What a full-write agent applies on its own and what waits for you: at most `reviewCap` review changes in a proactive
 * run, and at most `tidyLimits.onTheirOwn` files in any tidy (D79), in chat too. The rest come as a second message with
 * their own proposal, waiting.
 */
function splitOff(proposal: Proposal, agent: Agent, proactive: boolean): [Proposal, Landed["messages"][number]?] {
  if (agent.writeMode !== "full") return [proposal];
  if (proactive && proposal.changes && proposal.changes.length > reviewCap) {
    const rest = proposal.changes.slice(reviewCap);
    return [{ ...proposal, changes: proposal.changes.slice(0, reviewCap) }, {
      text: `And ${rest.length === 1 ? "one more change" : `${rest.length} more changes`}, past the ${reviewCap} I make on my own in one go. Your call.`,
      proposal: { ...proposal, id: crypto.randomUUID(), changes: rest } }];
  }
  const cap = tidyLimits.onTheirOwn;
  if (proposal.files && proposal.files.moves.length > cap) {
    const { moves } = proposal.files;
    const rest = moves.slice(cap);
    return [{ ...proposal, files: { ...proposal.files, moves: moves.slice(0, cap) } }, {
      text: `And ${rest.length === 1 ? "one more file" : `${rest.length} more files`}, past the ${cap} I move on my own in one go. Your call.`,
      proposal: { ...proposal, id: crypto.randomUUID(), files: { ...proposal.files, moves: rest } } }];
  }
  return [proposal];
}

/** What the agent says it did when a proposal applied on its own. */
const appliedWords = (made: Proposal) => made.files ? `I'll tidy ${filesWord(made.files.moves.length)} on ${made.files.computer.name}.`
  : `${made.changes ? `I made ${changesWord(made.changes.length)}` : `I added ${addedWords(made)}`}. Undo if it isn't right.`;

/**
 * Full write mode applies at once with Undo; source drift leaves it pending, never partially applied. An agent draft
 * always waits for its review (D57), and so does a domain planted with a project or a project someone joins to lead,
 * since they join the crew (D61).
 */
function settle(data: WorkspaceData, agent: Agent, proposal: Proposal): { proposal: Proposal; change: Change } {
  if (agent.writeMode === "full" && !proposal.agent && !proposal.plant && !proposal.lead) {
    try {
      return { proposal: { ...proposal, status: "applied" }, change: applyProposal(data, proposal) };
    } catch { /* Stays pending for the person to look at. */ }
  }
  return { proposal, change: { data, changes: {} } };
}

/**
 * Admits a reply's Proposal and Handoff against current records, settles the Proposal by the agent's write mode and
 * says what happened. Throws the refusal when the agent lost a permission, target or attachment it drafted with; then
 * nothing lands. Empty text with no Proposal reads "Done.". What the reply read (D81) goes on its first message, and so
 * do the scam warnings (D79): those the loop found in what it read and wrote, and any its words set off, checked here
 * whoever ran it. What it remembered (D49) lands too, whatever the write mode, on its first message for Undo, and where
 * things are on a computer (D80) waits there for Keep or Not this: only about you or places the agent is still
 * assigned; others are dropped.
 */
export function land(landing: Landing): Landed {
  const drafted = landDraft(landing);
  const { data, reply, agentId } = landing;
  const said = new Set(warningsIn(reply.text));
  const warnings = warningKinds.filter((kind) => reply.warnings?.includes(kind) || said.has(kind));
  const agent = byId(data.agents).get(agentId);
  const current = agent && agentWorkspace({ data, agent });
  const at = new Date().toISOString();
  // A correction takes the id of the memory it replaces, so saving it swaps that one.
  const memoryOf = ({ replaces, ...draft }: MemoryDraft): Memory =>
    ({ id: replaces && data.memories.some((memory) => memory.id === replaces) ? replaces : crypto.randomUUID(), ...draft, agentId, at });
  const learned = (current && reply.learned?.filter((draft) => current.mayRemember(draft)).map((draft): Learned => ({ memory: memoryOf(draft), state: "offered" }))) || [];
  const onFirst = { ...reply.used?.length && { used: reply.used }, ...warnings.length && { warnings }, ...learned.length && { learned } };
  const landed = Object.keys(onFirst).length
    ? { ...drafted, messages: drafted.messages.map((message, index) => index ? message : { ...message, ...onFirst }) } : drafted;
  if (!reply.memories?.length || !current) return landed;
  const memories = reply.memories.filter((draft) => current.mayRemember(draft)).map(memoryOf);
  if (!memories.length) return landed;
  const saved = remember(landed.change.data, memories);
  const [first, ...rest] = landed.messages;
  return { messages: [{ ...first, remembered: saved.remembered }, ...rest],
    change: { data: saved.data, changes: { ...landed.change.changes, ...saved.changes } } };
}

/**
 * Your answer to where something is on a computer, as a reply offered to remember it (D80), on any device and whatever
 * the write mode: Keep saves it as a Memory, replacing the one it corrects, while its agent may still remember there;
 * Not this saves nothing; Undo forgets a kept one, refused once it changed since. Returns the message's updated list.
 */
export function decideLearned(data: WorkspaceData, learned: Learned[], id: string, action: "keep" | "decline" | "undo"): { learned: Learned[]; change: Change } {
  const item = learned.find((entry) => entry.memory.id === id);
  if (!item || item.state !== (action === "undo" ? "kept" : "offered")) throw new Error("That memory is no longer waiting in this message.");
  const settled = (next: Learned) => learned.map((entry) => entry === item ? next : entry);
  if (action === "decline") return { learned: settled({ ...item, state: "declined" }), change: { data, changes: {} } };
  if (action === "undo") return { learned: settled({ ...item, state: "undone" }), change: unremember(data, item) };
  const agent = byId(data.agents).get(item.memory.agentId);
  if (!agent || agent.archived || !agentWorkspace({ data, agent }).mayRemember(item.memory))
    throw new Error(`${agent?.name ?? "That agent"} can't remember there any more.`);
  const saved = remember(data, [{ ...item.memory, at: new Date().toISOString() }]);
  const [kept] = saved.remembered;
  return { learned: settled({ memory: kept.memory, state: "kept", ...kept.replaced && { replaced: kept.replaced } }),
    change: { data: saved.data, changes: saved.changes } };
}

/** Takes back one memory a reply saved: refused once the memory changed since. Returns the message's updated list. */
export function unrememberIn(data: WorkspaceData, remembered: Remembered[], id: string): { remembered: Remembered[]; change: Change } {
  const item = remembered.find((entry) => entry.memory.id === id && !entry.undone);
  if (!item) throw new Error("That memory is no longer in this message.");
  return { remembered: remembered.map((entry) => entry === item ? { ...entry, undone: true } : entry), change: unremember(data, item) };
}

/**
 * A question is admitted while its asker may still ask and the asked agent still works here (D50). Throws the
 * refusal; then nothing is sent.
 */
export function admitAsk(data: WorkspaceData, ask: Ask, agentId: string): void {
  const agents = byId(data.agents), agent = agents.get(agentId), to = agents.get(ask.to);
  if (ask.origin.agentId !== agentId || !agent || agent.archived || !ask.origin.needs.every((tool) => canUse(agent, tool)))
    throw new Error("The agent's permissions changed. Ask again; nothing was sent.");
  if (!to || to.archived || to.id === agentId) throw new Error(`${to?.name ?? "That agent"} isn't working here any more. Nothing was sent.`);
}

function landDraft({ data, reply, agentId, attachedNoteId, proactive = false }: Landing): Landed {
  if (reply.proposal) admitProposal(data, reply.proposal, agentId, attachedNoteId);
  if (reply.handoff) admitHandoff(data, reply.handoff, agentId, attachedNoteId);
  if (reply.ask) admitAsk(data, reply.ask, agentId);
  const links = reply.handoff?.links;
  // A display (D64) only points at your own records, which the chat draws live, so it needs no admission; it rides on
  // the reply's first message, beside its proposal or question when it has one.
  const { proposal, display } = reply;
  if (reply.ask) {
    // A routine's question always waits for you; in chat, a pair you always let talk goes at once.
    const sent = !proactive && !!byId(data.agents).get(agentId)!.mayAsk?.includes(reply.ask.to);
    const ask: Ask = { ...reply.ask, status: sent ? "sent" : "pending" };
    const text = reply.text.trim() || `I'd like to ask ${byId(data.agents).get(ask.to)!.name}.`;
    return { messages: [{ text: sent ? text : `${text} Nothing is sent until you approve.`, ask, ...display && { display } }], change: { data, changes: {} } };
  }
  if (!proposal) return { messages: [{ text: reply.text.trim() ? reply.text : display ? "" : "Done.", ...links && { links }, ...display && { display } }], change: { data, changes: {} } };
  const agent = byId(data.agents).get(agentId)!;
  const [now, later] = splitOff(proposal, agent, proactive);
  const settled = settle(data, agent, now);
  const made = settled.proposal;
  const outcome = made.status === "applied" ? appliedWords(made) : made.agent ? "Nothing changes until you review and save it."
    : made.files ? "Nothing moves until you approve." : "Nothing changes until you approve.";
  return {
    messages: [{ text: `${reply.text} ${outcome}`.trim(), proposal: made, ...links && { links }, ...display && { display } }, ...later ? [later] : []],
    change: settled.change,
  };
}

/**
 * The person's answer to a posted Proposal. Apply admits it again against current records first; Undo reverses it only
 * while everything it changed is untouched; Reject only records the answer. Throws the refusal; then nothing changes.
 */
export function act(data: WorkspaceData, message: Pick<ChatMessage, "agentId"> & { proposal: Proposal }, attachedNoteId: string | null | undefined,
  action: "apply" | "reject" | "undo"): { proposal: Proposal; change: Change } {
  const { proposal } = message;
  if (action === "apply") admitProposal(data, proposal, message.agentId ?? atlasId, attachedNoteId);
  // A tidy (D79) changes no records: its files move on its computer, and only what moved can be put back.
  if (action === "undo" && proposal.files) throw new Error("Nothing to undo: those files haven't moved.");
  const change = action === "apply" ? applyProposal(data, proposal) : action === "undo" ? undoProposal(data, proposal) : { data, changes: {} };
  return { proposal: { ...proposal, status: action === "apply" ? "applied" : action === "reject" ? "rejected" : "undone" }, change };
}

/**
 * Your answer to a waiting question (D50). Send admits it again first; Always also lets this agent ask that one
 * without you from now on (`Agent.mayAsk`); Decline only records it. `edited` is your rewording, sent instead and kept
 * as the question, so the card shows what went. Throws the refusal; then nothing is sent.
 */
export function answerAsk(data: WorkspaceData, message: Pick<ChatMessage, "agentId"> & { ask: Ask }, action: "send" | "always" | "decline",
  edited?: string): { ask: Ask; change: Change } {
  const { ask } = message;
  if (ask.status !== "pending") throw new Error("You already answered this question.");
  if (action === "decline") return { ask: { ...ask, status: "declined" }, change: { data, changes: {} } };
  const question = edited === undefined ? ask.question : edited.trim();
  if (!question) throw new Error("Write the question before sending it.");
  if (question.length > 500) throw new Error("Keep the question under 500 characters.");
  const agentId = message.agentId ?? atlasId;
  admitAsk(data, ask, agentId);
  const mayAsk = byId(data.agents).get(agentId)!.mayAsk ?? [];
  const change = action === "always" && !mayAsk.includes(ask.to) ? editAgent(data, agentId, { mayAsk: [...mayAsk, ask.to] }) : { data, changes: {} };
  return { ask: { ...ask, question, status: "sent" }, change };
}
