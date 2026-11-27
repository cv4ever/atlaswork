// What the Logbook lists (agents-design D19): every conversation across your chats that matches a search and the
// filters, what came of each, and how they group: what waits on you first, then by age. No React; logbook.test.ts
// covers it.
import { ageBucket } from "../dates.ts";
import type { ChatMessage, Proposal } from "../model.ts";
import { proposalWords } from "../proposals.ts";
import type { AgentRequest, Sitting } from "../sittings.ts";

type Named = { id: string; label: string; detail: string };

/** Which conversations the Logbook shows: all of them, the ones waiting on you, or the ones where something was decided. */
export type LogbookShow = "all" | "waiting" | "decided";

/**
 * What came of a conversation, in words: something waits on you, something was applied, something was turned down,
 * or it was only talk. `text` is empty for talk, which the Logbook leaves unsaid.
 */
export type Outcome = { tone: "waiting" | "done" | "declined" | "talk"; text: string };

/** Where an agent request stands (D57), as the Logbook says it. */
const requestOutcomes: Record<AgentRequest["status"], Outcome> = {
  asked: { tone: "talk", text: "No draft yet" },
  unanswered: { tone: "talk", text: "Not answered" },
  pending: { tone: "waiting", text: "Agent draft to review" },
  saved: { tone: "done", text: "Agent saved" },
  rejected: { tone: "declined", text: "Draft rejected" },
  replaced: { tone: "declined", text: "Replaced by a newer draft" },
};

const capital = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

/** What came of one conversation, from the proposals, questions and agent request in its messages. */
export function outcomeOf(sitting: Pick<Sitting, "request">, messages: readonly Pick<ChatMessage, "proposal" | "ask">[]): Outcome {
  if (sitting.request) {
    const outcome = requestOutcomes[sitting.request.status];
    return sitting.request.name ? { ...outcome, text: `${sitting.request.name}: ${outcome.text.toLocaleLowerCase()}` } : outcome;
  }
  const proposals = messages.flatMap((message) => message.proposal && !message.proposal.agent ? [message.proposal] : []);
  const pending = proposals.filter((proposal) => proposal.status === "pending");
  const asks = messages.filter((message) => message.ask?.status === "pending").length;
  if (pending.length > 1) return { tone: "waiting", text: `${pending.length} suggestions to review` };
  if (pending.length) return { tone: "waiting", text: `${capital(proposalWords(pending[0]))} to review` };
  if (asks) return { tone: "waiting", text: asks === 1 ? "A question to pass on" : `${asks} questions to pass on` };
  const applied = proposals.filter((proposal) => proposal.status === "applied");
  if (applied.length) {
    const verb = (proposal: Proposal) => proposal.files ? "approved" : proposal.changes ? "made" : "added";
    const words = applied.slice(0, 2).map((proposal) => `${verb(proposal)} ${proposalWords(proposal)}`).join(", ");
    return { tone: "done", text: `${capital(words)}${applied.length > 2 ? ` and ${applied.length - 2} more` : ""}` };
  }
  if (proposals.some((proposal) => proposal.status === "undone")) return { tone: "declined", text: "Undone" };
  if (proposals.length) return { tone: "declined", text: "Turned down" };
  return { tone: "talk", text: "" };
}

/** Sittings in chats still listed, in `who`'s chat when one is picked, matching `needle` (already lowercased). */
export function matchSittings(sittings: Sitting[], entries: ReadonlyMap<string, Named>, needle: string, who: string) {
  const named = new Set(needle ? [...entries.values()].filter((chat) => `${chat.label} ${chat.detail}`.toLocaleLowerCase().includes(needle)).map((chat) => chat.id) : []);
  const matches = sittings.filter((sitting) => entries.has(sitting.threadId) && (!who || sitting.threadId === who)
    && (!needle || named.has(sitting.threadId) || sitting.text.includes(needle)));
  return { named, matches };
}

/** Whether a conversation belongs under a Show filter. */
export const shows = (show: LogbookShow, outcome: Outcome) =>
  show === "all" || (show === "waiting" ? outcome.tone === "waiting" : outcome.tone === "done" || outcome.tone === "declined");

/** What waits on you comes first in a group of its own, so it's easy to find again; the rest by age. */
export function groupLogbook<T extends { sitting: Pick<Sitting, "at">; outcome: Outcome }>(shown: T[], now: number) {
  const waiting = shown.filter((item) => item.outcome.tone === "waiting");
  const groups: { label: string; items: T[] }[] = waiting.length ? [{ label: "Waiting on you", items: waiting }] : [];
  for (const item of shown.filter((entry) => entry.outcome.tone !== "waiting")) {
    const label = ageBucket(item.sitting.at, now);
    if (groups.at(-1)?.label === label) groups.at(-1)!.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
