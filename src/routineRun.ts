// One Run of a Routine (agents-design D67, D68, D69): from a routine admitted to run to what came of it. It ends before
// asking when nothing is new, asks the runner once, asks once more when a check-in or review answered in prose, ends
// quiet when the runner has nothing to say or left meanwhile, turns a weekly improvement's numbered suggestions into
// answers to tap, and lands the reply as a proactive one. Both runners call it, the browser's Room
// (src/conversations.ts) and the routines function's for an account away (supabase/functions/routines/run.ts); each
// keeps its own claim, activity and storage, and records the outcome with `recordRun`. routineRun.test.ts covers it.
import type { AgentReply, AgentRequest } from "./agentRequest.ts";
import type { RoutineResult, Usage, WorkspaceData } from "./model.ts";
import { land } from "./proposals.ts";
import type { Landed } from "./proposals.ts";
import { routineHasNews } from "./routineNews.ts";
import { improveChoices, isQuiet, proposesOnly, proseNudge, routineRequest } from "./routines.ts";
import type { AdmittedRoutine } from "./routines.ts";

/** What a run spent (D69): model calls asked, each one of the day's live replies, and the tokens they read and wrote. */
export type Spent = { replies: number; tokens: number };
/** What came of a run; `request` is what the runner was asked, for the posted message's stamp. */
export type Verdict = { spent: Spent } & (
  | { outcome: Exclude<RoutineResult["outcome"], "posted" | "failed"> }
  | { outcome: "posted"; request: string; landed: Landed; usage?: Usage }
  | { outcome: "failed"; reason: string });

export type RunInput = {
  admitted: AdmittedRoutine;
  /** The Workspace as it is now; read again after the reply, since the Room's can change while the model answers. */
  workspace: () => WorkspaceData;
  /** When the routine last ran (ms; -Infinity if never), read before the claim stored this run's receipt. */
  since: number;
  now: Date;
  /** The account's day, YYYY-MM-DD. */
  today: string;
  /** Run now: asks even when nothing is new. */
  manual?: boolean;
  /** Answers one request; the runner adds who the person is and where progress goes. */
  ask: (request: AgentRequest) => Promise<AgentReply>;
};

export async function runRoutine({ admitted, workspace, since, now, today, manual = false, ask }: RunInput): Promise<Verdict> {
  const spent: Spent = { replies: 0, tokens: 0 };
  const { routine, runner } = admitted;
  try {
    const request = routineRequest(workspace(), admitted, today);
    // Nothing new since it last ran: the same answer as last time, so no model call (D67).
    if (!request || (!manual && !routineHasNews(workspace(), admitted, since, now, today))) return { outcome: "no-news", spent };
    const asking = async (text: string) => {
      spent.replies++;
      const answer = await ask({ agent: runner, data: workspace(), request: text, routine: { kind: routine.kind, quietDays: routine.quietDays } });
      spent.tokens += (answer.usage?.input ?? 0) + (answer.usage?.output ?? 0);
      return answer;
    };
    let reply = await asking(request);
    // A check-in or review answers with its proposal or nothing; prose gets one more ask, then counts as failed (D69).
    const prose = () => proposesOnly(routine.kind) && !reply.proposal && !isQuiet(reply.text);
    if (prose()) reply = await asking(proseNudge(request, routine.kind));
    if (prose()) return { outcome: "failed", reason: "It answered in words instead of a proposal, twice.", spent };
    const data = workspace();
    const quiet = isQuiet(reply.text);
    // A report that only shows a widget (D64) still has something to say; a runner gone meanwhile posts nothing.
    if (!data.agents.some((agent) => agent.id === runner.id && !agent.archived) || (!reply.proposal && !reply.handoff && !reply.display && quiet))
      return { outcome: "quiet", spent };
    // A weekly improvement's numbered suggestions become answers to tap (D68).
    const choices = routine.kind === "improve" && !quiet && !reply.display ? improveChoices(reply.text) : undefined;
    const landed = land({ data, reply: { ...reply, text: quiet ? "" : reply.text, ...choices && { display: { choices } } }, agentId: runner.id, proactive: true });
    return { outcome: "posted", request, landed, usage: reply.usage, spent };
  } catch (cause) {
    return { outcome: "failed", reason: cause instanceof Error ? cause.message : "couldn't run it.", spent };
  }
}
