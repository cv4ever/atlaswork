// A tidy job on this computer (agents-design D79). The helper stays read-only: it hands the moves, or the Undo, to the
// desktop app on its stdout, which checks and makes them, waits for what the app did on its stdin, and reports that to
// the agent function, which lands it on the tidy's card. No disk access here, so tests cover it.
import { requestText } from "../../supabase/functions/agent/jobs.ts";
import { tidyJobOf, tidyOutcomeOf } from "../../supabase/functions/agent/tidy.ts";
import type { TidyJob, TidyOutcome } from "../../src/tidying.ts";
import type { Claimed, Server } from "./job.ts";

/** How long the helper waits for the app to make the moves. */
export const answerMs = 120_000;

/** The app, as the helper reaches it: one tidy job's order, and what the app did with it. */
export type App = (job: string, order: TidyJob) => Promise<TidyOutcome>;

/** Runs a tidy job through the app and reports what came of it; returns what happened, for the log. */
export async function runTidy(job: Claimed, server: Server, app: App): Promise<string> {
  const order = tidyJobOf(requestText(job.request));
  const outcome: TidyOutcome = order
    ? await app(job.id, order).catch(() => ({ failed: "The Atlaswork app on this computer didn't answer. Try again." }))
    : { failed: "Its request couldn't be read on this computer. Ask again." };
  await server.tidied(job.id, outcome);
  if ("failed" in outcome) return "tidy failed";
  return `${order!.undo ? "put back" : "moved"} ${outcome.results.filter((result) => !result.failed).length} of ${outcome.results.length}`;
}

/**
 * The app on the helper's pipes: `ask` writes a job's order as one JSON line (`{"tidy": …}`) and waits for its answer,
 * which `heard` takes from a stdin line (`{"tidied": {"job": …, …}}`); an answer that never comes fails after `ms`.
 */
export function appOn(write: (line: string) => void, ms = answerMs): { ask: App; heard(value: unknown): void } {
  const waiting = new Map<string, (outcome: TidyOutcome) => void>();
  return {
    ask: (job, order) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(job); reject(new Error("no answer")); }, ms);
      waiting.set(job, (outcome) => { clearTimeout(timer); waiting.delete(job); resolve(outcome); });
      write(JSON.stringify({ tidy: { job, ...order } }));
    }),
    heard(value) {
      const job = typeof value === "object" && value !== null ? (value as { job?: unknown }).job : undefined;
      const outcome = tidyOutcomeOf(value);
      if (typeof job === "string" && outcome) waiting.get(job)?.(outcome);
    },
  };
}
