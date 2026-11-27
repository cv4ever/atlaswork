// One account's due routines, run on the server while the app is closed (launch plan D17, agents-design D54). The same
// pure modules the browser runs routines with (routines.ts, routineRun.ts, agentRequest.ts, workspace.ts) decide what is
// due, what the runner is asked, and what lands; `Io` is the account's storage and the agent loop, so tests stub it.
//
// Times: routines.ts reads days and hours from the runtime's clock, which is UTC here. Each run shifts every instant it
// compares into the account's wall clock (`toWall`), asks routines.ts on that clock, and shifts the due time back.
import { draftsOf, snapshotOf } from "../../../src/agentRequest.ts";
import type { Agent, ChatMessage, RoutineKind, RoutineResult, Thread, WorkspaceData } from "../../../src/model.ts";
import { runRoutine } from "../../../src/routineRun.ts";
import type { Spent } from "../../../src/routineRun.ts";
import { lastRunOf, readinessOf, recordRun, routinesOf, runnerOf, threadFor } from "../../../src/routines.ts";
import type { PlacedRoutine } from "../../../src/routines.ts";
import { saveThread } from "../../../src/workspace.ts";
import type { Changes, RoutineClaim } from "../../../src/workspace.ts";
import type { Snapshot } from "../agent/logic.ts";
import type { WarningKind } from "../agent/warnings.ts";

/** The model's answer to one snapshot, as the agent loop gives it: words, an unchecked draft, the scams it met (D79) and tokens. */
export type Answer = { text: string; draft?: unknown; shown?: unknown; warnings?: WarningKind[]; usage?: ChatMessage["usage"] };
export type Io = {
  claim(routineId: string, due: string): Promise<RoutineClaim>;
  answer(snapshot: Snapshot): Promise<Answer>;
  /** Saves a changeset made from `before`: only the chat messages it adds or changes (agents-design D76). */
  save(changes: Changes, before: WorkspaceData): Promise<void>;
};
/** What one run posted, for its push notification (D55): who, which routine, where and the first message's words. */
export type Post = { agent: string; kind: RoutineKind; threadId: string; text: string };
export type Outcome = { ran: number; posts: Post[]; failed: string[] };

/** Minutes the zone is ahead of UTC at `instant` (negative west of Greenwich). */
export function offsetMinutes(timeZone: string, instant: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric" }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return Math.round((wall - Math.floor(instant / 6e4) * 6e4) / 6e4);
}
/** An instant as the zone's wall clock reads it, expressed on the UTC clock this runtime uses for "local" time. */
export const wallOf = (timeZone: string, instant: number) => instant + offsetMinutes(timeZone, instant) * 6e4;
/** Back from the wall clock to the instant; across a daylight-saving change the second offset settles it. */
export const instantOf = (timeZone: string, wall: number) => wall - offsetMinutes(timeZone, wall - offsetMinutes(timeZone, wall) * 6e4) * 6e4;
const shift = (timeZone: string, iso: string) => new Date(wallOf(timeZone, Date.parse(iso))).toISOString();

/** The fields readinessOf compares with a due time, on the wall clock: receipts, posted routine stamps and set-up days. */
export function toWall(data: WorkspaceData, timeZone: string): WorkspaceData {
  const routineRuns = Object.fromEntries(Object.entries(data.routineRuns).map(([id, iso]) => [id, shift(timeZone, iso)]));
  const threads = data.threads.map((thread) => thread.messages.some((message) => message.routine) ? { ...thread,
    messages: thread.messages.map((message) => message.routine ? { ...message, routine: { ...message.routine, due: shift(timeZone, message.routine.due) } } : message) } : thread);
  const since = <T extends { routines?: { since?: string }[] }>(item: T): T => item.routines?.some((routine) => routine.since)
    ? { ...item, routines: item.routines.map((routine) => routine.since ? { ...routine, since: shift(timeZone, routine.since) } : routine) } : item;
  return { ...data, routineRuns, threads, agents: data.agents.map(since), domains: data.domains.map(since), projects: data.projects.map(since) };
}

const threadOf = (data: WorkspaceData, id: string): Thread =>
  data.threads.find((thread) => thread.id === id) ?? { id, messages: [], read: 0, attachedNoteId: null };
const samePlace = (a: PlacedRoutine, b: PlacedRoutine) => a.routine.id === b.routine.id && a.owner.kind === b.owner.kind && a.owner.id === b.owner.id;

/**
 * Runs every routine due at `now` in `timeZone`, one after another, as the browser's runRoutines does: claim first (a
 * device that runs it meanwhile wins the claim), then ask the runner, land what it says as a proactive reply in the
 * routine's thread, and save that thread. A quiet answer posts nothing. Returns what ran, what posted and what failed.
 */
export async function runDue(start: WorkspaceData, now: Date, timeZone: string, person: { name: string; about: string }, io: Io): Promise<Outcome> {
  const outcome: Outcome = { ran: 0, posts: [], failed: [] };
  let data = start;
  const wallNow = new Date(wallOf(timeZone, now.getTime()));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  for (const placed of routinesOf(data)) {
    let name = runnerOf(data, placed.owner)?.name ?? "A routine";
    let ran: string | undefined;
    let spent: Spent | undefined;
    /** How the run went (D68), saved with the rest of the run; a run that never got its claim leaves no result. */
    const result = (from: WorkspaceData, outcome: RoutineResult["outcome"], reason?: string) =>
      recordRun(from, { routineId: placed.routine.id, due: ran!, at: new Date().toISOString(), outcome, ...reason ? { reason } : {}, ...spent?.replies ? spent : {} });
    try {
      const ready = readinessOf(toWall(data, timeZone), placed, wallNow);
      if (!ready.due) continue;
      const due = new Date(instantOf(timeZone, ready.due.getTime())).toISOString();
      // Read before the claim stores this run's receipt: when it ran last, for the news check (D67).
      const since = lastRunOf(data, placed.routine.id);
      const claim = await io.claim(placed.routine.id, due);
      data = { ...data, routineRuns: { ...data.routineRuns, ...claim.receipts } };
      if (!claim.claimed) continue;
      const current = routinesOf(data).find((item) => samePlace(item, placed));
      if (!current) continue;
      const runner: Agent = ready.runner;
      name = runner.name;
      outcome.ran++;
      ran = due;
      const verdict = await runRoutine({ admitted: { ...current, runner, due: new Date(due) }, workspace: () => data, since, now, today,
        ask: async (request) => {
          const asked = { ...request, person };
          const said = await io.answer(snapshotOf(asked, today));
          return { text: said.text, ...draftsOf(asked, [said.draft, said.shown]), ...said.warnings?.length && { warnings: said.warnings }, ...said.usage && { usage: said.usage } };
        } });
      spent = verdict.spent;
      if (verdict.outcome !== "posted") {
        if (verdict.outcome === "failed") outcome.failed.push(`${name}: ${verdict.reason}`);
        const recorded = result(data, verdict.outcome, verdict.outcome === "failed" ? verdict.reason : undefined);
        // A failure is already in `outcome`; a result that can't be saved either only leaves the strip a run short.
        await io.save(recorded.changes, data).then(() => { data = recorded.data; }, (cause) => { if (verdict.outcome !== "failed") throw cause; });
        continue;
      }
      const { landed, request, usage } = verdict;
      const threadId = threadFor(landed.change.data, current.owner);
      const stamp = { role: "agent" as const, agentId: runner.id, routine: { id: current.routine.id, kind: current.routine.kind, due, request }, at: new Date().toISOString() };
      const thread = threadOf(landed.change.data, threadId);
      const posted = saveThread(landed.change.data, { ...thread, messages: [...thread.messages,
        ...landed.messages.map((said, index) => ({ id: crypto.randomUUID(), ...stamp, ...said, ...index === 0 && usage ? { usage } : {} }))] });
      const recorded = result(posted.data, "posted");
      await io.save({ ...landed.change.changes, ...posted.changes, ...recorded.changes }, data);
      data = recorded.data;
      outcome.posts.push({ agent: runner.name, kind: current.routine.kind, threadId, text: landed.messages[0]?.text ?? "" });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "couldn't run it.";
      outcome.failed.push(`${name}: ${reason}`);
      // The failure is already in `outcome`; a result that can't be saved either only leaves the strip a run short.
      if (ran) {
        const recorded = result(data, "failed", reason);
        await io.save(recorded.changes, data).then(() => { data = recorded.data; }, () => undefined);
      }
    }
  }
  return outcome;
}
