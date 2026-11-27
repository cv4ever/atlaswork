import test from "node:test";
import assert from "node:assert/strict";
import { createJobWatch, idleMs, jobLine, jobsQuery, watchMs } from "./jobs.ts";
import type { Job } from "./jobs.ts";
import { finishing } from "./sittings.ts";
import type { Thread } from "./model.ts";

const row = (state: string, extra: Record<string, unknown> = {}) => ({
  id: "j1", kind: "handoff", agent_id: "atlas", thread_id: "agent:atlas", message_id: "m1", runs_on: "server", state,
  runs: 1, created_at: "2026-11-23T10:00:00.000Z", ...extra,
});

test("the job watch hears work another device asked for, follows it while open and reports when it ended (D76)", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ended = row("done", { ended_at: "2026-11-23T10:05:00.000Z" });
  const answers = [[], [row("running", { progress: "Reading notes" })], [row("waiting")], [ended]];
  const asked: string[] = [];
  const news: string[] = [];
  let awake = true;
  const watch = createJobWatch(async (path) => { asked.push(path); return answers.shift() ?? [ended]; },
    (jobs) => news.push(...jobs.map((job) => `${job.id} ${job.state}`)), () => awake);
  await watch.refresh();
  assert.deepEqual(news, [], "the first look is where it starts");
  t.mock.timers.tick(idleMs);
  await watch.refresh(); // the look the timer started is under way: this one joins it
  assert.deepEqual(watch.getSnapshot().map((job) => [job.state, job.progress]), [["running", "Reading notes"]]);
  t.mock.timers.tick(watchMs);
  await watch.refresh();
  assert.equal(watch.getSnapshot()[0].state, "waiting", "a long job between runs is still open");
  t.mock.timers.tick(watchMs);
  await watch.refresh();
  assert.deepEqual(news, ["j1 running", "j1 done"], "it appeared, then it ended; nothing between");
  awake = false;
  t.mock.timers.tick(idleMs);
  await watch.refresh();
  const looks = asked.length;
  t.mock.timers.tick(idleMs * 3);
  assert.equal(asked.length, looks, "out of view with nothing open, nothing is asked");
  assert.ok(asked.every((path) => path === jobsQuery) && !jobsQuery.includes("request"), "never the job's request");
});

test("a look that can't reach the account keeps what was seen", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let down = false;
  const watch = createJobWatch(async () => { if (down) throw new Error("offline"); return [row("running")]; }, () => {});
  await watch.refresh();
  down = true;
  await watch.refresh();
  assert.equal(watch.getSnapshot()[0]?.state, "running");
});

test("the chat says what a job is doing, what it waits for and how it ended", () => {
  const job = (state: Job["state"], extra: Partial<Job> = {}): Job => ({
    id: "j", kind: "reply", agentId: "atlas", threadId: "t", messageId: "m", runsOn: "server", state, runs: 1,
    createdAt: "2026-11-23T10:00:00.000Z", ...extra,
  });
  assert.equal(jobLine(job("running", { progress: "Reading notes" }), "Atlas", false), "Reading notes…");
  assert.equal(jobLine(job("waiting", { runsOn: "device:n1" }), "Atlas", false), "Atlas is waiting for the device that asked…");
  const computers = new Map([["c1", "Office PC"]]);
  assert.equal(jobLine(job("waiting", { runsOn: "computer:c1" }), "Atlas", true, computers), "Atlas is waiting for Office PC…");
  assert.equal(jobLine(job("waiting", { runsOn: "computer:c2" }), "Atlas", false, computers), "Atlas is waiting for your computer…",
    "a computer no folder names any more");
  assert.equal(jobLine(job("running", { runsOn: "computer:c1", progress: "Reading a file" }), "Atlas", false, computers), "Reading a file on Office PC…",
    "a step names the computer it's on (D84)");
  assert.equal(jobLine(job("running", { runsOn: "computer:c1", progress: "Searching your computers" }), "Atlas", false, computers), "Searching your computers…",
    "unless the step already says where");
  assert.equal(jobLine(job("waiting", { runsOn: "computer:c1" }), "Atlas", false, computers, new Set(["c1"])), "Atlas is waiting for Office PC to be switched on…",
    "a computer that's off is waited for until it's on");
  assert.equal(jobLine(job("waiting"), "Atlas", true), "Atlas is working on it in the background…");
  assert.equal(jobLine(job("failed", { error: "Atlas couldn't answer: busy." }), "Atlas", false), "Atlas couldn't answer: busy.");
  assert.equal(jobLine(undefined, "Atlas", false), "Atlas is finishing your answer…");
});

test("a message stays on its way while its job is open, however long, and briefly once it ended (D76)", () => {
  const asked = "2026-11-23T10:00:00.000Z";
  const thread: Thread = { id: "agent:atlas", read: 1, attachedNoteId: null, messages: [
    { id: "m1", role: "user", text: "Plan my week", awaiting: ["atlas"], at: asked },
  ] };
  const at = (minutes: number) => Date.parse(asked) + minutes * 60_000;
  const job = (state: Job["state"], endedAt?: string): Job => ({
    id: "j1", kind: "reply", agentId: "atlas", threadId: thread.id, messageId: "m1", runsOn: "server", state, runs: 2,
    createdAt: asked, ...endedAt && { endedAt },
  });
  assert.equal(finishing(thread, at(5)).length, 0, "without its job, a reply is given up after 150 s");
  assert.equal(finishing(thread, at(5), [job("running")]).length, 1, "its open job keeps it on its way");
  const ended = job("done", new Date(at(5)).toISOString());
  assert.equal(finishing(thread, at(6), [ended]).length, 1, "the page loads what it landed");
  assert.equal(finishing(thread, at(8), [ended]).length, 0, "then it's an unanswered message again, for Retry");
});
