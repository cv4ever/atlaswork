// What happens to a tidy (agents-design D79) between your Apply or Undo and its computer. Apply and Undo come from any
// device through the agent function (`createTidyAsk`), which saves what `askTidy` returns and queues a job for that
// computer; its helper relays the job to the desktop app, which moves the files, and what it reports lands here through
// `tidied`. A proactive agent's tidy is approved as it lands, and `approvedTidies` names those that need a job. Pure,
// so tests cover it; the function and the page share it.
import type { FileMove } from "../supabase/functions/agent/tidy.ts";
import { atlasId } from "./model.ts";
import type { ChatMessage, FileResult, Proposal, Thread, WorkspaceData } from "./model.ts";
import { act } from "./proposals.ts";
import { recordsIn } from "./records.ts";
import type { Records } from "./records.ts";

/** Your Apply or Undo of the tidy `proposal` on `message` in `thread`. */
export type TidyAsk = { thread: string; message: string; proposal: string; action: "apply" | "undo" };
/** What a tidy job asks its computer: the moves on Apply, or Undo of those it made for that proposal. */
export type TidyJob = { proposal: string; undo: boolean; moves?: FileMove[] };
/** What a computer reports: each file moved, or put back, or why it stayed; or why it couldn't run the job at all. */
export type TidyOutcome = { results: FileResult[] } | { failed: string };

type Files = NonNullable<Proposal["files"]>;

function tidyAt(data: WorkspaceData, at: { thread: string; message: string }, proposalId: string) {
  const thread = data.threads.find((item) => item.id === at.thread);
  const message = thread?.messages.find((item) => item.id === at.message);
  const proposal = message?.proposal;
  return thread && message && proposal?.id === proposalId && proposal.files ? { thread, message, proposal, files: proposal.files } : undefined;
}

const withProposal = (thread: Thread, messageId: string, proposal: Proposal): Thread =>
  ({ ...thread, messages: thread.messages.map((item) => item.id === messageId ? { ...item, proposal } : item) });

/** `files` without what the last ask left: why it failed, and that Undo was on its way. */
const settled = ({ failed: _failed, undoing: _undoing, ...files }: Files) => files;

/**
 * Your Apply or Undo of a tidy, from any device. Apply admits it again (the agent may still tidy) and approves it, or
 * asks again for an approved tidy its computer hasn't moved; Undo asks for the files it moved back. Either says when
 * it `asked`, so a card waiting a day offers Try again. Returns the thread to save and the job for its computer;
 * throws the refusal, and then nothing changes.
 */
export function askTidy(data: WorkspaceData, ask: TidyAsk, now = new Date()): { thread: Thread; job: TidyJob; computer: Files["computer"]; agentId: string } {
  const at = tidyAt(data, ask, ask.proposal);
  if (!at) throw new Error("This tidy is no longer in the conversation.");
  const { thread, message, proposal, files } = at;
  const agentId = message.agentId ?? atlasId;
  if (ask.action === "apply") {
    if (files.done) throw new Error(`${files.computer.name} already moved them.`);
    if (proposal.status !== "pending" && proposal.status !== "applied") throw new Error("This tidy was turned down.");
    const approved = proposal.status === "pending" ? act(data, { ...message, proposal }, thread.attachedNoteId, "apply").proposal : proposal;
    return { thread: withProposal(thread, message.id, { ...approved, files: { ...settled(files), asked: now.toISOString() } }), agentId,
      computer: files.computer, job: { proposal: proposal.id, undo: false, moves: files.moves } };
  }
  if (proposal.status !== "applied" || files.undone || !files.done?.some((result) => !result.failed)) throw new Error("Nothing to undo: those files haven't moved.");
  if (files.undoing) throw new Error(`${files.computer.name} is already putting them back.`);
  return { thread: withProposal(thread, message.id, { ...proposal, files: { ...settled(files), undoing: true, asked: now.toISOString() } }), agentId,
    computer: files.computer, job: { proposal: proposal.id, undo: true } };
}

/**
 * What a computer reported for a tidy job, on its proposal: on Apply what it did with each move, in order (a file the
 * report leaves out stayed); on Undo what came back of those it moved, the tidy undone once any did; or why it couldn't
 * run the job at all, for Try again. Undefined when the tidy is no longer there.
 */
export function tidied(data: WorkspaceData, at: { thread: string; message: string }, job: TidyJob, outcome: TidyOutcome): Thread | undefined {
  const found = tidyAt(data, at, job.proposal);
  if (!found) return undefined;
  const { thread, message, proposal, files } = found;
  const rest = settled(files);
  if ("failed" in outcome) return withProposal(thread, message.id, { ...proposal, files: { ...rest, failed: outcome.failed } });
  const resultOf = (file: string): FileResult => outcome.results.find((result) => result.file === file) ?? { file, failed: "the computer didn't say" };
  if (!job.undo) return withProposal(thread, message.id, { ...proposal, status: "applied", files: { ...rest, done: files.moves.map((move) => resultOf(move.file)) } });
  const undone = (files.done ?? []).filter((result) => !result.failed).map((result) => resultOf(result.file));
  return withProposal(thread, message.id, { ...proposal, ...undone.some((result) => !result.failed) && { status: "undone" as const }, files: { ...rest, undone } });
}

/**
 * The tidies a reply to `replyTo` landed approved (a proactive agent's, D79) that still need a job for their computer:
 * not moved, not refused, and not among `earlier` messages, whose own landing asked for theirs.
 */
type TidyMessage = ChatMessage & { proposal: Proposal & { files: Files } };
export const approvedTidies = (thread: Thread, replyTo: string, earlier: readonly ChatMessage[] = []): TidyMessage[] =>
  thread.messages.filter((message): message is TidyMessage => message.replyTo === replyTo
    && message.proposal?.status === "applied" && !!message.proposal.files && !message.proposal.files.done && !message.proposal.files.failed
    && !earlier.some((item) => item.id === message.id));

/**
 * Apply and Undo of a tidy from this page, through the agent function (`agent`, the signed-in backend's): returns the
 * records it wrote for the page to take in, or throws its refusal.
 */
export const createTidyAsk = (agent: (body: string) => Promise<Response>) => async (ask: TidyAsk): Promise<Records> => {
  const response = await agent(JSON.stringify({ tidy: ask }));
  const answer = await response.json().catch(() => null) as { records?: unknown; error?: unknown } | null;
  const records = recordsIn(answer?.records);
  if (response.ok && records) return records;
  throw new Error(typeof answer?.error === "string" ? answer.error : "Couldn't reach your account. Try again.");
};
