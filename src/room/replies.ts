// Messages and the replies they get: your message, each responder answering it in turn (a failure stays awaiting, for
// Retry), a question one agent asks another (D50) and the asker's follow-up, and asking again for a fresh proposal.
// Every await is followed by a fresh read: a chat or an agent gone meanwhile gets no reply posted.
import { askedRequest, followUpRequest } from "../agentRequest.ts";
import * as crews from "../agents.ts";
import { inChat } from "../chatModel.ts";
import { atlasId, byId } from "../model.ts";
import type { Agent, ChatMessage, Usage } from "../model.ts";
import * as proposals from "../proposals.ts";
import type { MessageRecord } from "../records.ts";
import { retryable, sessionStartOf, sittingsOf } from "../sittings.ts";
import { threadOf } from "./core.ts";
import type { RoomCore } from "./core.ts";

/** A reply's usage with the Thinking `agent` was asked for (D82), so the chat can say when it changed. */
const thinkingIn = (usage: Usage | undefined, agent: Agent): Usage | undefined => usage && { ...usage, effort: agent.effort ?? null };

/**
 * The asked agent answers a sent question in the asker's chat (D50). It gets the question alone, no history, so a
 * question costs one short reply; it answers from its own places, asks nobody further and remembers nothing. When the
 * asker said what it would do with the answer (`then`), it follows up once, with the answer as the other's words.
 */
export async function answer(core: RoomCore, threadId: string, askId: string) {
  const { current, engine } = core;
  const asked = threadOf(current(), threadId).messages.find((message) => message.ask?.id === askId);
  const ask = asked?.ask;
  if (!asked || ask?.status !== "sent") return;
  const agent = current().agents.find((item) => item.id === ask.to && !item.archived);
  const by = byId(current().agents).get(asked.agentId ?? atlasId);
  if (!agent || !by) throw new Error("The agent you asked isn't working here any more.");
  const stillHere = () => threadOf(current(), threadId).messages.some((message) => message.ask?.id === askId);
  const live = (id: string) => current().agents.find((item) => item.id === id && !item.archived);
  const person = core.person();
  const stamp = (agentId: string) => ({ role: "agent" as const, agentId, ...asked.replyTo ? { replyTo: asked.replyTo } : {}, at: new Date().toISOString() });
  core.replying(threadId, agent);
  // Whoever answers in this chat answers on this chat's model and thinking (D82).
  const answering = inChat(agent, threadOf(current(), threadId));
  const reply = await engine.reply({ agent: answering, data: current(), asked: { by: by.name }, person, request: askedRequest(by.name, ask.question),
    onProgress: core.progressIn(threadId, agent) });
  const owner = live(agent.id);
  if (!owner || !stillHere()) return;
  core.postLanded(threadId, { ...stamp(owner.id), answers: askId }, proposals.land({ data: current(), reply, agentId: owner.id }),
    thinkingIn(reply.usage, answering));
  if (!ask.then || !live(by.id)) return;
  core.replying(threadId, by);
  const attachedNoteId = threadOf(current(), threadId).attachedNoteId;
  const asking = inChat(live(by.id)!, threadOf(current(), threadId));
  const followed = await engine.reply({ agent: asking, data: current(), asked: { by: owner.name }, person,
    attached: current().notes.find((note) => note.id === attachedNoteId),
    request: followUpRequest(owner.name, ask.question, reply.text, ask.then), onProgress: core.progressIn(threadId, by) });
  const asker = live(by.id);
  if (!asker || !stillHere()) return;
  const landed = proposals.land({ data: current(), reply: followed, agentId: asker.id, attachedNoteId: threadOf(current(), threadId).attachedNoteId });
  core.postLanded(threadId, { ...stamp(asker.id), followsUp: askId }, landed, thinkingIn(followed.usage, asking));
}

/**
 * Each responder in turn answers your message `messageId`; one that fails stays in its `awaiting`, for Retry. The agent
 * function lands a chat reply in the account itself (D76), so it asks only once your message is `saved` there, and the
 * page takes in what landed. Work you handed off (`background`, D73) lands without the page.
 */
export async function respond(core: RoomCore, threadId: string, messageId: string, text: string, responders: Agent[], start: number, background = false,
  saved?: Promise<void>) {
  const { current, engine, publish, activity } = core;
  publish({ thinking: { ...activity().thinking, [threadId]: responders[0] }, errors: { ...activity().errors, [threadId]: undefined } });
  const stillHere = () => current().threads.some((thread) => thread.id === threadId && thread.messages.some((message) => message.id === messageId));
  const member = (id: string) => crews.membersOf(current(), threadId).find((item) => item.id === id && !item.archived);
  try {
    for (const responder of responders) {
      if (!stillHere()) break;
      const found = member(responder.id);
      if (!found) continue;
      // This chat's model and thinking, when the message box chose them, over the agent's own (D82).
      const agent = inChat(found, threadOf(current(), threadId));
      core.replying(threadId, agent);
      try {
        await saved;
        if (!stillHere()) break;
        const attached = current().notes.find((note) => note.id === threadOf(current(), threadId).attachedNoteId);
        const history = threadOf(current(), threadId).messages.slice(start).filter((message) => message.id !== messageId);
        if (background) {
          // The function finds your message in the account, so it's stored first; a Retry starts the clock again.
          await core.post(threadId, (thread) => ({ ...thread, messages: thread.messages.map((message) => {
            if (message.id !== messageId) return message;
            const { failure: _failure, ...rest } = message;
            return { ...rest, background: new Date().toISOString() };
          }) }));
        }
        const reply = await engine.reply({ agent, data: current(), attached, request: text, history, person: core.person(),
          land: { threadId, messageId, ...background && { background: true as const } }, onProgress: core.progressIn(threadId, agent),
          ...core.offers && { offers: core.offers } });
        // Handed off (D73), or the connection dropped after the function took it (D76): it lands in the account.
        if (!stillHere() || reply.background || reply.onItsWay) break;
        if (reply.landed) {
          // The function landed it in the account (D76): take in what it wrote rather than save it again.
          core.workbench.absorb(reply.landed);
          if (reply.failed) publish({ errors: { ...activity().errors, [threadId]: reply.failed } });
          // A pair you always let talk asks at once; the answer comes before the next responder (D50).
          const said = reply.landed.puts.flatMap(([key, value]): ChatMessage[] => {
            if (!key.startsWith("message:")) return [];
            const record: MessageRecord = value as MessageRecord;
            return [record.message];
          });
          const sent = said.find((message) => message.agentId === agent.id && message.ask?.status === "sent")?.ask;
          if (sent) await answer(core, threadId, sent.id);
          continue;
        }
        const owner = member(agent.id);
        if (!owner) continue;
        const landed = proposals.land({ data: current(), reply, agentId: owner.id, attachedNoteId: threadOf(current(), threadId).attachedNoteId });
        core.postLanded(threadId, { role: "agent", agentId: agent.id, replyTo: messageId, at: new Date().toISOString() }, landed, thinkingIn(reply.usage, agent));
        // A pair you always let talk asks at once; the answer comes before the next responder (D50).
        const sent = landed.messages.find((said) => said.ask?.status === "sent")?.ask;
        if (sent) await answer(core, threadId, sent.id);
      } catch (cause) {
        if (!stillHere()) continue;
        const failure = cause instanceof Error ? cause.message : `${agent.name} couldn't answer.`;
        publish({ errors: { ...activity().errors, [threadId]: failure } });
        // A failure after it answered (a question it asked, D50) leaves your message answered.
        void core.post(threadId, (thread) => ({ ...thread, messages: thread.messages.map((message) =>
          message.id === messageId && message.awaiting?.includes(agent.id) ? { ...message, failure } : message) }));
      }
    }
  } finally {
    core.settle(threadId);
  }
}

/**
 * Posts your message and has the chat's responders answer it: a room's addressees, or only `refreshFor`. Handed off
 * (`background`, D73), only the first of them takes it.
 */
export async function send(core: RoomCore, threadId: string, text: string, from: string, refreshFor?: string, background = false) {
  const { current } = core;
  const members = crews.membersOf(current(), threadId).filter((agent) => !agent.archived);
  const addressed = refreshFor ? members.filter((agent) => agent.id === refreshFor)
    : crews.isRoom(threadId) ? crews.addressees(text, members) : members;
  const responders = background ? addressed.slice(0, 1) : addressed;
  if (!text.trim() || core.activity().thinking[threadId] || !responders.length) return;
  const before = threadOf(current(), threadId);
  const start = sessionStartOf(before, sittingsOf(before), Date.now());
  const messageId = crypto.randomUUID();
  const saved = core.post(threadId, (thread) => ({ ...thread, read: thread.messages.length + 1, messages: [...thread.messages,
    { id: messageId, role: "user", text, from, awaiting: responders.map((agent) => agent.id), at: new Date().toISOString() }] }));
  // Recovering a proposal must not discard an unrelated message already being drafted.
  if (!refreshFor) void core.workbench.updateSession({ chatDraft: "" });
  await respond(core, threadId, messageId, text, responders, start, background, saved);
}

export function retry(core: RoomCore, threadId: string, messageId: string) {
  const thread = threadOf(core.current(), threadId);
  const start = sessionStartOf(thread, sittingsOf(thread), Date.now());
  const message = retryable(thread, start);
  const responders = crews.membersOf(core.current(), threadId).filter((agent) => !agent.archived && message?.awaiting?.includes(agent.id));
  if (message?.id !== messageId || core.activity().thinking[threadId] || !responders.length) return Promise.resolve();
  return respond(core, threadId, messageId, message.text, responders, start, !!message.background);
}

export async function requestFreshProposal(core: RoomCore, threadId: string, proposalId: string) {
  const thread = threadOf(core.current(), threadId);
  const index = thread.messages.findIndex((message) => message.proposal?.id === proposalId);
  const message = thread.messages[index];
  if (!message || message.proposal?.status !== "pending") throw new Error("This pending proposal is no longer in the conversation.");
  if (core.activity().thinking[threadId]) throw new Error("Wait for the current reply before requesting a fresh proposal.");
  const agentId = message.agentId ?? atlasId;
  if (!crews.membersOf(core.current(), threadId).some((agent) => agent.id === agentId && !agent.archived))
    throw new Error("This agent is no longer in the conversation. Restore them before requesting a fresh proposal.");
  const original = message.routine ? undefined : message.replyTo
    ? thread.messages.find((item) => item.id === message.replyTo && item.role === "user")
    : thread.messages.slice(0, index).findLast((item) => item.role === "user");
  const text = message.routine?.request ?? original?.text;
  if (!text?.trim()) throw new Error(message.routine
    ? "This older routine did not keep its request. Run it again from Routines."
    : "The original request is no longer in this conversation. Write a new request instead.");
  await send(core, threadId, text, original?.from ?? "", agentId);
}

export function actOnAsk(core: RoomCore, threadId: string, askId: string, action: "send" | "always" | "decline", question?: string) {
  const { current, publish, activity } = core;
  const message = threadOf(current(), threadId).messages.find((item) => item.ask?.id === askId);
  if (!message?.ask) throw new Error("This question is no longer in the conversation.");
  if (action !== "decline" && activity().thinking[threadId]) throw new Error("Wait for the current reply before sending it.");
  const answered = proposals.answerAsk(current(), { ...message, ask: message.ask }, action, question);
  core.post(threadId, (thread) => ({ ...thread, messages: thread.messages.map((item) =>
    item.ask?.id === askId ? { ...item, ask: answered.ask } : item) }), answered.change);
  if (answered.ask.status !== "sent") return Promise.resolve();
  publish({ errors: { ...activity().errors, [threadId]: undefined } });
  return answer(core, threadId, askId).catch((cause) => {
    publish({ errors: { ...activity().errors, [threadId]: cause instanceof Error ? cause.message : "They couldn't answer." } });
  }).finally(() => core.settle(threadId));
}
