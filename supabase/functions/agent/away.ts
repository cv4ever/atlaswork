// A chat reply whose page went away before it arrived (agents-design D72): index.ts finishes the reply anyway and
// lands it here, in the account's stored workspace, the way the page would have (src/room/replies.ts `respond`): bound
// against the same selection, admitted and settled by the Proposal module, and posted under your message. Pure, so
// tests cover it; index.ts loads, saves and sends the push.
import { draftsOf, learnedOf, memoriesOf } from "../../../src/agentRequest.ts";
import type { AgentRequest } from "../../../src/agentRequest.ts";
import { membersOf } from "../../../src/agents.ts";
import type { WorkspaceData } from "../../../src/model.ts";
import * as proposals from "../../../src/proposals.ts";
import { saveThread } from "../../../src/workspace.ts";
import type { Changes } from "../../../src/workspace.ts";
import type { Answered, Land } from "./contract.ts";

/** What landed and where it went; `learned` counts where things are on a computer it offered to remember (D80). */
export type Landing = { changes: Changes; agent: string; text: string; learned?: number } | { skipped: string };

/** What work you handed off says when its rounds or time ran out (D73), after what it got done. */
export const stoppedNote = "*Stopped at its limit. Ask again to go on from here.*";

/** Your message `land.message`, while it still waits for `land.agent`, with its thread. */
function waiting(data: WorkspaceData, land: Land) {
  const thread = data.threads.find((item) => item.id === land.thread);
  const message = thread?.messages.find((item) => item.id === land.message && item.role === "user");
  return thread && message?.awaiting?.includes(land.agent) ? { thread, message } : undefined;
}

/**
 * Lands `answered` under your message `land.message` while that message still waits for `land.agent`: a page that got
 * the reply, a Retry that answered meanwhile, a deleted chat or an agent gone from it leaves nothing to land. With
 * nobody `watched` it lands as a routine's would (`proactive`): a question waits for your OK rather than going at once,
 * since no page is left to run the asked agent. A chat reply whose page is still reading (D76) lands as the page would
 * have landed it. `ranOn` is the account's computer whose helper ran it (D77), where a tidy it drafted moves files
 * (D79) and where what its searches found is (D80); `computers` are the account's others, which a tidy or a place
 * found on another computer names (D84). Throws the Proposal module's refusal when the agent lost access.
 */
export function landAway(data: WorkspaceData, land: Land, answered: Answered,
  { watched = false, at = new Date(), ranOn, computers }: { watched?: boolean; at?: Date; ranOn?: { id: string; name: string };
    computers?: { id: string; name: string }[] } = {}): Landing {
  const found = waiting(data, land);
  if (!found) return { skipped: "nothing waits for it" };
  const { thread, message } = found;
  const agent = membersOf(data, thread.id).find((item) => item.id === land.agent && !item.archived);
  if (!agent) return { skipped: "the agent left the chat" };
  const request: AgentRequest = { agent, data, attached: data.notes.find((note) => note.id === thread.attachedNoteId), request: message.text,
    ...ranOn && { ranOn }, ...ranOn && computers?.length && { computers } };
  const text = answered.limited && land.background ? `${answered.text}\n\n${stoppedNote}` : answered.text;
  const reply = { text, ...draftsOf(request, [answered.draft, answered.shown]), memories: memoriesOf(request, answered.memories),
    learned: learnedOf(request, answered.learned), used: answered.used, warnings: answered.warnings };
  const landed = proposals.land({ data, reply, agentId: agent.id, attachedNoteId: thread.attachedNoteId, proactive: !watched });
  const stamp = { role: "agent" as const, agentId: agent.id, replyTo: message.id, at: at.toISOString() };
  const posted = saveThread(landed.change.data, proposals.postedThread(landed.change.data.threads.find((item) => item.id === thread.id) ?? thread,
    stamp, landed.messages, answered.usage));
  return { changes: { ...landed.change.changes, ...posted.changes }, agent: agent.name, text: landed.messages[0]?.text ?? "",
    ...landed.messages[0]?.learned && { learned: landed.messages[0].learned.length } };
}

/**
 * Work you handed off failed (D73): your message keeps waiting for the agent, with why, so the chat offers Retry as it
 * does for a reply that failed on the page. Nothing when the message no longer waits for it.
 */
export function failAway(data: WorkspaceData, land: Land, failure: string): Landing {
  const found = waiting(data, land);
  if (!found) return { skipped: "nothing waits for it" };
  const thread = { ...found.thread, messages: found.thread.messages.map((item) => item.id === found.message.id ? { ...item, failure } : item) };
  const agent = data.agents.find((item) => item.id === land.agent)?.name ?? "The agent";
  return { changes: saveThread(data, thread).changes, agent, text: failure };
}
