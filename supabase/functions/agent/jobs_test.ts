import assert from "node:assert/strict";
import { progressMs, runJob } from "./jobs.ts";
import type { JobRun } from "./jobs.ts";

/** A job run that records what reached the job and the workspace, in order. */
function recorder(answer: JobRun["answer"], land = async () => "landed") {
  const calls: string[] = [];
  const run: JobRun = {
    answer,
    land: async (answered) => { calls.push(`land ${answered.text}`); return await land(); },
    fail: async (failure) => { calls.push(`fail ${failure}`); return "failure landed"; },
    progress: async (step) => { calls.push(`progress ${step}`); },
    finish: async (state, error) => { calls.push(error ? `finish ${state}: ${error}` : `finish ${state}`); },
  };
  return { run, calls };
}
const failureOf = (cause: unknown) => `Atlas couldn't answer: ${cause instanceof Error ? cause.message : "?"}`;

Deno.test("every way a job goes ends it: landed is done, a failed loop or a refused save is failed (D76)", async () => {
  const done = recorder(async () => ({ text: "Here's your plan." }));
  assert.equal(await runJob(done.run, failureOf), "landed");
  assert.deepEqual(done.calls, ["land Here's your plan.", "finish done"]);

  const failed = recorder(async () => { throw new Error("the model is busy."); });
  assert.equal(await runJob(failed.run, failureOf), "failed, failure landed");
  assert.deepEqual(failed.calls, ["fail Atlas couldn't answer: the model is busy.", "finish failed: Atlas couldn't answer: the model is busy."],
    "why it failed waits on your message for Retry, and the job says the same");

  const refused = recorder(async () => ({ text: "Done." }), async () => { throw new Error("save_workspace_of: HTTP 400"); });
  assert.equal(await runJob(refused.run, failureOf), "not landed");
  assert.equal(refused.calls.at(-1), "finish failed: Its answer couldn't be saved in your workspace. Try again.");

  const paused = recorder(async () => ({ paused: "paused for files" }));
  assert.equal(await runJob(paused.run, failureOf), "paused for files");
  assert.deepEqual(paused.calls, [], "a reply waiting for this device's files lands nothing and stays open for the leg that brings them");
});

Deno.test("progress reaches the job at most every two seconds, and before it ends", async () => {
  let clock = 0;
  const steps = recorder(async (progress) => {
    progress("Reading notes");
    clock += 500;
    progress("Reading tasks");
    clock += progressMs;
    progress("Drafting tasks");
    return { text: "Done." };
  });
  await runJob(steps.run, failureOf, () => clock);
  assert.deepEqual(steps.calls.filter((call) => call.startsWith("progress")), ["progress Reading notes", "progress Drafting tasks"]);
  assert.equal(steps.calls.at(-1), "finish done", "no step lands after the job ended");
});
