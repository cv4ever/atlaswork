// Edits to one chat that ask no agent: a new room, the attached note, read state, a fresh session (D28), answering a
// proposal (Apply, Reject, Undo), taking back a memory (D49), tapping a choice (D64) and the model and thinking an agent
// answers on here (D82). Proposal edits commit with the message that records them.
import { chatModelOf, inChat, withChatModel } from "../chatModel.ts";
import type { ChatModel } from "../chatModel.ts";
import type { Proposal } from "../model.ts";
import * as proposals from "../proposals.ts";
import { editAgent } from "../workspace.ts";
import { threadOf } from "./core.ts";
import type { RoomCore } from "./core.ts";

/** The agent `agentId`, still working and in this chat. */
function memberOf(core: RoomCore, threadId: string, agentId: string) {
  const agent = core.current().agents.find((item) => item.id === agentId && !item.archived);
  if (!agent) throw new Error("That agent isn't working here any more.");
  return agent;
}

/** This chat's model and thinking for `agentId` (D82); fields left out stay as they were. */
export function setChatModel(core: RoomCore, threadId: string, agentId: string, choice: ChatModel) {
  const agent = memberOf(core, threadId, agentId);
  return core.post(threadId, (thread) => withChatModel(thread, agent, choice));
}

/**
 * Makes this chat's model and thinking the agent's own (Profile → Model, D44), for every chat and routine, and drops
 * the chat's choice in the same write.
 */
export function keepChatModel(core: RoomCore, threadId: string, agentId: string) {
  const agent = memberOf(core, threadId, agentId);
  const thread = threadOf(core.current(), threadId);
  if (!chatModelOf(thread, agentId)) return Promise.resolve();
  const { model, effort } = inChat(agent, thread);
  const change = editAgent(core.current(), agentId, { model, effort });
  return core.post(threadId, (item) => withChatModel(item, { ...agent, model, effort }, {}), change);
}

export function startRoom(core: RoomCore, title: string, memberIds: string[]) {
  const ids = [...new Set(memberIds)];
  if (!ids.length || ids.some((id) => !core.current().agents.some((agent) => agent.id === id && !agent.archived)))
    throw new Error("Choose active agents for this room.");
  if (ids.length === 1) return `agent:${ids[0]}`;
  const id = `chat:${crypto.randomUUID()}`;
  core.post(id, (thread) => ({ ...thread, title: title.trim(), memberIds: ids }));
  return id;
}

export function newSession(core: RoomCore, threadId: string) {
  const thread = threadOf(core.current(), threadId);
  // A new day already gives agents a fresh start, but the chat still shows yesterday; New clears it (D28), so it
  // waits only for a reply in flight or a chat that is already clear.
  if (core.activity().thinking[threadId] || !thread.messages.length || thread.sessionStarts?.includes(thread.messages.length)) return;
  core.post(threadId, (item) => ({ ...item, sessionStarts: [...(item.sessionStarts ?? []), item.messages.length] }));
}

export function markRead(core: RoomCore, threadId: string) {
  const thread = threadOf(core.current(), threadId);
  if (thread.read < thread.messages.length) core.post(threadId, (item) => ({ ...item, read: item.messages.length }));
}

export function actOnProposal(core: RoomCore, threadId: string, proposalId: string, action: "apply" | "reject" | "undo", amended?: Proposal) {
  const { activity, publish } = core;
  const thread = threadOf(core.current(), threadId);
  const message = thread.messages.find((item) => item.proposal?.id === proposalId);
  const stored = message?.proposal;
  if (!stored) throw new Error("This proposal is no longer in the conversation.");
  // An edit keeps what binds it: its id, its status and the command and permissions it came from.
  const proposal = amended && stored.status === "pending" && action === "apply"
    ? { ...amended, id: stored.id, status: stored.status, origin: stored.origin } : stored;
  try {
    const answered = proposals.act(core.current(), { ...message, proposal }, thread.attachedNoteId, action);
    core.post(threadId, (item) => ({ ...item, messages: item.messages.map((said) =>
      said.proposal?.id === proposalId ? { ...said, proposal: answered.proposal } : said) }), answered.change);
    if (activity().proposalErrors[proposalId]) publish({ proposalErrors: { ...activity().proposalErrors, [proposalId]: undefined } });
  } catch (cause) {
    if (action === "apply") publish({ proposalErrors: { ...activity().proposalErrors,
      [proposalId]: cause instanceof Error ? cause.message : "This proposal could not be applied." } });
    throw cause;
  }
}

export function unremember(core: RoomCore, threadId: string, messageId: string, memoryId: string) {
  const message = threadOf(core.current(), threadId).messages.find((item) => item.id === messageId);
  const undone = proposals.unrememberIn(core.current(), message?.remembered ?? [], memoryId);
  core.post(threadId, (thread) => ({ ...thread, messages: thread.messages.map((item) =>
    item.id === messageId ? { ...item, remembered: undone.remembered } : item) }), undone.change);
}

export function learn(core: RoomCore, threadId: string, messageId: string, memoryId: string, action: "keep" | "decline" | "undo") {
  const message = threadOf(core.current(), threadId).messages.find((item) => item.id === messageId);
  const decided = proposals.decideLearned(core.current(), message?.learned ?? [], memoryId, action);
  core.post(threadId, (thread) => ({ ...thread, messages: thread.messages.map((item) =>
    item.id === messageId ? { ...item, learned: decided.learned } : item) }), decided.change);
}

export function pick(core: RoomCore, threadId: string, messageId: string, option: string) {
  const display = threadOf(core.current(), threadId).messages.find((item) => item.id === messageId)?.display;
  if (!display?.choices?.includes(option) || display.picked) return false;
  core.post(threadId, (thread) => ({ ...thread, messages: thread.messages.map((item) =>
    item.id === messageId ? { ...item, display: { ...display, picked: option } } : item) }));
  return true;
}
