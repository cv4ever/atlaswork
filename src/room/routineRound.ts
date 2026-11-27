// A round of routines (D68): each one that's due (or the one asked for), admitted by the Workbench's claim, run through
// the agents' engine, its reply posted in the owner's chat and how it went recorded. One round at a time.
import type { RoutineResult } from "../model.ts";
import { runRoutine } from "../routineRun.ts";
import type { Spent } from "../routineRun.ts";
import * as routines from "../routines.ts";
import type { PlacedRoutine } from "../routines.ts";
import type { RoomCore } from "./core.ts";
import type { RoutineRun } from "./types.ts";
import { withStep } from "./types.ts";

/** Runs one placed routine and adds what happened to `counts`; a run that never got its claim leaves no result. */
async function runOne(core: RoomCore, placed: PlacedRoutine, now: Date, onlyId: string | undefined, counts: RoutineRun) {
  const { current, workbench, engine, publish, activity } = core;
  let threadId = routines.threadFor(current(), placed.owner);
  if (activity().thinking[threadId]) return;
  let name = routines.runnerOf(current(), placed.owner)?.name ?? routines.ownerLabel(current(), placed.owner);
  let working = false;
  let ran: { id: string; due: string } | undefined;
  // How the run went, recorded once it's admitted.
  const result = (outcome: RoutineResult["outcome"], reason?: string, spent?: Spent) => {
    if (ran) void workbench.commit(routines.recordRun(current(), {
      routineId: ran.id, due: ran.due, at: new Date().toISOString(), outcome, ...reason ? { reason } : {}, ...spent?.replies ? spent : {} }));
  };
  try {
    // Read before the claim stores this run's receipt: when it ran last, for the news check (D67).
    const since = routines.lastRunOf(current(), placed.routine.id);
    const admitted = await workbench.admitRoutine(placed, now, !!onlyId);
    if (!admitted) return;
    const { routine, runner: agent, due } = admitted;
    ran = { id: routine.id, due: due.toISOString() };
    name = agent.name;
    counts.ran++;
    threadId = routines.threadFor(current(), admitted.owner);
    if (activity().thinking[threadId]) return;
    const verdict = await runRoutine({ admitted, workspace: current, since, now, today: now.toLocaleDateString("en-CA"), manual: !!onlyId,
      ask: (request) => {
        if (!working) core.replying(threadId, agent);
        working = true;
        return engine.reply({ ...request, person: core.person(),
          onProgress: (text, tool) => publish({ progress: { ...activity().progress, [threadId]: withStep(activity().progress[threadId], { text, tool }) } }) });
      } });
    if (verdict.outcome === "failed") counts.failed.push(`${name}: ${verdict.reason}`);
    if (verdict.outcome === "posted") {
      counts.posted++;
      const stamp = { role: "agent" as const, agentId: agent.id, at: new Date().toISOString(),
        routine: { id: routine.id, kind: routine.kind, due: due.toISOString(), request: verdict.request } };
      core.postLanded(threadId, stamp, verdict.landed, verdict.usage);
    }
    result(verdict.outcome, verdict.outcome === "failed" ? verdict.reason : undefined, verdict.spent);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "couldn't run it.";
    counts.failed.push(`${name}: ${reason}`);
    result("failed", reason);
  } finally {
    if (working) core.settle(threadId);
  }
}

/** Every due routine (or just `onlyId`), one after another. Nothing runs while no model is connected. */
export async function runRound(core: RoomCore, now: Date, onlyId?: string): Promise<RoutineRun> {
  const counts: RoutineRun = { ran: 0, posted: 0, failed: [] };
  if (core.engine.about?.().offline) return { ...counts, offline: true };
  for (const placed of routines.routinesOf(core.current())) {
    if (onlyId && placed.routine.id !== onlyId) continue;
    await runOne(core, placed, now, onlyId, counts);
  }
  return counts;
}
