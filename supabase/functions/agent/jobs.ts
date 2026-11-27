// Jobs (agents-design D76): work an agent does for you, stored in the account (`public.agent_jobs`, migration
// 20261123100000_agent_jobs.sql) so it outlives the page that asked. The agent function is the only worker for now: it
// stores the job after admission, claims it as `server:<run>`, runs it to its end and lands the result in the stored
// workspace, as `landAway` in away.ts does. A chat reply that pauses for this device's files (D47) lets its job wait
// for the leg that brings them, which claims it as `device:<resume nonce>` (migration 20261123140000_job_pauses.sql).
// A long hand-off's run lets it wait for the server with what it did so far, and the next run carries on
// (20261123160000_job_runs.sql). No Deno APIs here, so tests drive `runJob` with a stand-in.
import type { Answered } from "./contract.ts";
import type { Rpc } from "./admission.ts";
import type { Land, Snapshot, Turn } from "./logic.ts";
import type { ToolUse } from "../../../src/model.ts";
import type { TidyJob } from "../../../src/tidying.ts";

export type JobKind = "reply" | "handoff";
/** What a long job's runs so far left the next (D76): the model's turns, what they read (D81) and how long they ran. */
export type Carried = { turns: Turn[]; used: ToolUse[]; ms: number };
/** A job a run claimed: whose, what it was asked (as stored, unchecked), which run this is, and what earlier runs left. */
export type Claimed = Carried & { id: string; user: string; kind: JobKind; request: unknown; runs: number };

/**
 * A job's request as the page sent it. It's stored as that JSON text (a jsonb string), since a jsonb object orders its
 * keys by length, and a command's list fields are named by their first one: `tidy_files` from a stored job read each
 * move's `why` as its file (D79, seen 2026-11-24). Jobs stored before kept the object.
 */
export const requestText = (request: unknown) => typeof request === "string" ? request : JSON.stringify(request);

/** How often a job's progress line is written at most: the phone reads it, the database shouldn't feel it. */
export const progressMs = 2_000;

/** The job calls in Postgres for one run of the function, as one worker. */
export type Jobs = {
  /**
   * Stores admitted work for `user` with what it was asked (the snapshot as the function checked it, so a later run
   * can pick it up) and claims it for this run. Throws when the account can't be reached.
   */
  start(user: string, kind: JobKind, request: Snapshot & { land: Land }): Promise<string>;
  /** Claims a job that waits for this worker; null when it doesn't (it ended, expired or someone else holds it). */
  take(id: string): Promise<Claimed | null>;
  /**
   * Lets the job wait for another worker: the device a reply paused for (`device:<nonce>`), the server's next run or a
   * computer (`computer:<id>`), which gets `next`: the turns and reads so far, how long this run `ran`, and, moving to
   * a computer (D84), the request saying it runs there, stored as its JSON text like the first.
   */
  release(id: string, runsOn: string, next?: { turns: Turn[]; used: ToolUse[]; ran: number; request?: Snapshot }): Promise<unknown>;
  progress(id: string, step: string): Promise<unknown>;
  finish(id: string, state: "done" | "failed", error?: string): Promise<unknown>;
  /** Queues a tidy's Apply or Undo (D79) for the computer it moves files on, where its helper claims it; not claimed here. */
  tidy(user: string, at: { agent: string; thread: string; message: string }, job: TidyJob, computer: string): Promise<string>;
};

export function createJobs(rpc: Rpc, worker = `server:${crypto.randomUUID()}`): Jobs {
  return {
    async start(user, kind, request) {
      const { land } = request;
      const id = await rpc("create_job", { p_user: user, p_kind: kind, p_agent: land.agent, p_thread: land.thread, p_message: land.message,
        p_request: JSON.stringify(request) }) as string;
      if (!await rpc("claim_job", { p_job: id, p_worker: worker })) throw new Error("create_job: not claimed");
      return id;
    },
    async take(id) {
      const job = await rpc("claim_job", { p_job: id, p_worker: worker }) as (Omit<Claimed, keyof Carried> & Partial<Carried>) | null;
      return job && { ...job, turns: job.turns ?? [], used: job.used ?? [], ms: job.ms ?? 0 };
    },
    release: (id, runsOn, next) => rpc("release_job", { p_job: id, p_worker: worker, p_runs_on: runsOn,
      ...next && { p_turns: next.turns, p_used: next.used, p_ms: Math.round(next.ran), ...next.request && { p_request: JSON.stringify(next.request) } } }),
    progress: (id, step) => rpc("job_progress", { p_job: id, p_worker: worker, p_progress: step }),
    finish: (id, state, error) => rpc("finish_job", { p_job: id, p_worker: worker, p_state: state, p_error: error ?? null }),
    tidy: async (user, at, job, computer) => await rpc("create_job", { p_user: user, p_kind: "tidy", p_agent: at.agent, p_thread: at.thread,
      p_message: at.message, p_request: JSON.stringify(job), p_runs_on: `computer:${computer}` }) as string,
  };
}

/** A run that stopped to wait for something only another worker has, having handed the job on itself: why, for the log. */
export type Paused = { paused: string };

/** One claimed job's run: the agent loop, landing what it came to or why it failed, and the job's own record. */
export type JobRun = {
  /** Runs the agent loop, telling each step it starts. */
  answer(progress: (step: string) => void): Promise<Answered | Paused>;
  /** Lands the answer in the stored workspace; says what happened, for the log. */
  land(answered: Answered): Promise<string>;
  /** Lands why it failed on the message it answers, for Retry. */
  fail(failure: string): Promise<string>;
  progress(step: string): Promise<unknown>;
  finish(state: "done" | "failed", error?: string): Promise<unknown>;
};

/**
 * Runs a claimed job to its end, which every path reaches: answered and landed, it's done; the loop failed, its
 * failure lands on your message and the job fails with it; landing refused, the job fails too. A run that paused leaves
 * the job to whoever it handed it to. A step goes to the job when none did in the last `progressMs`, one write after
 * another. Never throws; returns what happened, for the log.
 */
export async function runJob(run: JobRun, failureOf: (cause: unknown) => string, now = () => Date.now()): Promise<string> {
  let written = -Infinity, writing: Promise<unknown> = Promise.resolve();
  const progress = (step: string) => {
    if (now() - written < progressMs) return;
    written = now();
    writing = writing.then(() => run.progress(step)).catch(() => undefined);
  };
  const end = (state: "done" | "failed", error?: string) => writing.then(() => run.finish(state, error)).catch(() => undefined);
  let answered: Answered | Paused;
  try {
    answered = await run.answer(progress);
  } catch (cause) {
    const failure = failureOf(cause);
    const landed = await run.fail(failure).catch(() => "failure not landed");
    await end("failed", failure);
    return `failed, ${landed}`;
  }
  if ("paused" in answered) {
    await writing;
    return answered.paused;
  }
  try {
    const landed = await run.land(answered);
    await end("done");
    return landed;
  } catch {
    await end("failed", "Its answer couldn't be saved in your workspace. Try again.");
    return "not landed";
  }
}
