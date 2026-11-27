// The live agent engine (docs/mvp-launch-plan.md, launch step 4). Verifies the caller's Supabase user, admits the
// reply under the daily caps (admission.ts), runs the agent loop (logic.ts) on Workers AI, or on the customer's own model when they
// connected one (D16), and streams NDJSON: `{progress, tool}` lines, then `{text, proposal?, used?}`, `{pending, turns, resume, used?}`
// when the browser must run file tools first (agents-design D47: it sends the turns back with the one-use `resume`
// token, resume.ts, and that leg isn't counted again), or `{error}`. `used` is what each leg read, for the reply's
// sources (D81). Prompts and replies are never logged.
// Every chat reply and hand-off is a job (D76, jobs.ts): stored with what it was asked, run here and landed in the
// account's workspace (away.ts) whatever becomes of the page, which gets `{job}` first and the records written last
// (`{landed}`); a page that left gets a push instead (../routines/send.ts). Work you hand off (D73, `land.background`)
// answers `{background, job}` at once and runs on a larger budget (caps.ts) across several runs: each run hands on to
// the next by calling this function with its own secret, and pg_cron's minute sweep restarts a job whose run died.
// A job for one of the account's computers (D77) runs in its desktop app's helper, which asks here, with the computer's
// token, for each model call and lands its answer through here too (computer.ts, `computerAsk`).
import { createAdmission, providersFor, sourceFor, standsIn, unavailable } from "./admission.ts";
import type { Admitted } from "./admission.ts";
import { failAway, landAway } from "./away.ts";
import { callsPerJob, computerFor, parseComputerAsk, searchedComputer } from "./computer.ts";
import { searchAnswerOf, searchLimits } from "./searches.ts";
import type { Part } from "./searches.ts";
import { tidyAskIn, tidyJobOf, withTidy } from "./tidy.ts";
import type { Landing } from "./away.ts";
import type { Answered } from "./contract.ts";
import { background as handedOff } from "./caps.ts";
import { createJobs, requestText, runJob } from "./jobs.ts";
import type { Carried, Jobs } from "./jobs.ts";
import { AgentError, limits, parseSnapshot, parseTest, runAgent } from "./logic.ts";
import type { AgentOutcome, Completion, Land, Model, Snapshot } from "./logic.ts";
import { complete, groq, ownModels, sessionOf, workersAi, workersAiVision } from "./provider.ts";
import type { OwnModel } from "./provider.ts";
import { digestOf, resumeMs, signResume, verifyResume } from "./resume.ts";
import type { Claims } from "./resume.ts";
import { createPushes } from "../routines/send.ts";
import { accountRecordsOf, workspaceOf } from "../../../src/records.ts";
import type { Records } from "../../../src/records.ts";
import type { Thread, ToolUse, WorkspaceData } from "../../../src/model.ts";
import { atlasId } from "../../../src/model.ts";
import { approvedTidies, askTidy, tidied } from "../../../src/tidying.ts";
import type { TidyAsk, TidyJob, TidyOutcome } from "../../../src/tidying.ts";
import { normalize, saveThread } from "../../../src/workspace.ts";
import type { Changes } from "../../../src/workspace.ts";
import { calendarFor, withCalendar } from "./calendar.ts";
import { computerOf } from "./tools.ts";

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void } | undefined;
const env = (name: string) => Deno.env.get(name) ?? "";
const supabaseUrl = env("SUPABASE_URL");
// Resume tokens (D47) are signed with a key derived from the service role's, which only this function holds.
const resumeSecret = env("SUPABASE_SERVICE_ROLE_KEY");
// The bearer of the function's own calls (D76): a long job's next run, and pg_cron's sweep (Vault's `jobs_secret`).
// Without it a hand-off gets one run.
const jobsSecret = env("JOBS_SECRET");
// Groq takes over when Workers AI says it's busy; without its key, Workers AI alone.
const ours = [workersAi(env("WORKERS_AI_TOKEN")), ...env("GROQ_API_KEY") ? [groq(env("GROQ_API_KEY"))] : []];
// Google Calendar (D74): the OAuth client the connectors function connected the account with, and the key it sealed the token with.
const google = { id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET") };
// Images (agents-design D58) on our plan; an account's own model looks at its images itself.
const seer = workersAiVision(env("WORKERS_AI_TOKEN"));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const refuse = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } });
const keep = (work: Promise<unknown>) => { if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work); };

/** Calls a usage function with the service role; anon and authenticated may not execute them (see the migration). */
async function rpc(name: string, args: Record<string, unknown>) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const admission = createAdmission(rpc, ours);
const notify = createPushes(rpc, env("VAPID_KEYS"));

/**
 * Lands what a reply or a hand-off came to in the account's stored workspace (D72, D73, D76) and, with `push` (nobody
 * is watching), tells the account's devices. The page saved your message before it asked, so the stored workspace
 * holds it, still waiting for this agent; anything else lands nothing. Only the messages it posts or changes are
 * written, so a message you send meanwhile stays. A tidy it landed approved goes to its computer (D79), and each place
 * it offered to remember on a computer adds to the anonymous counts (D80, R7). Returns what happened, for the log, and
 * the records it wrote, for a page still reading to take in.
 */
async function landStored(user: string, land: Land, landing: (data: WorkspaceData) => Landing, push?: { title?: (agent: string) => string }) {
  const none: Records = { puts: [], deletes: [] };
  const stored = workspaceOf(Object.entries(await rpc("load_workspace_of", { p_user: user }) as Record<string, unknown>));
  if (!stored) return { said: "no workspace", records: none };
  const before = normalize(stored).data;
  const landed = landing(before);
  if ("skipped" in landed) return { said: landed.skipped, records: none };
  const records = accountRecordsOf(landed.changes, before);
  await rpc("save_workspace_of", { p_user: user, p_puts: Object.fromEntries(records.puts), p_deletes: records.deletes });
  await queueTidies(user, land, landed.changes, before).catch((cause) => console.warn(`tidies not queued: ${String(cause).slice(0, 120)}`));
  for (let offered = 0; offered < (landed.learned ?? 0); offered++) await rpc("count_usage", { event: "memory_learned" }).catch(() => undefined);
  if (!push) return { said: "landed", records };
  const pushed = await notify(user, land.zone, [{ agent: landed.agent, threadId: land.thread, text: landed.text, ...push.title && { title: push.title(landed.agent) } }])
    .catch(() => 0);
  return { said: `landed, ${pushed} pushed`, records };
}

/**
 * Saves one thread of the account's stored workspace as `make` returns it from the stored one (only the messages it
 * changes are written, D76), and returns the records it wrote; nothing without a workspace. `make` may refuse by
 * throwing, and then nothing is saved.
 */
async function storedThread(user: string, make: (data: WorkspaceData) => Thread | Promise<Thread | undefined> | undefined) {
  const stored = workspaceOf(Object.entries(await rpc("load_workspace_of", { p_user: user }) as Record<string, unknown>));
  if (!stored) return undefined;
  const before = normalize(stored).data;
  const thread = await make(before);
  if (!thread) return undefined;
  const records = accountRecordsOf(saveThread(before, thread).changes, before);
  await rpc("save_workspace_of", { p_user: user, p_puts: Object.fromEntries(records.puts), p_deletes: records.deletes });
  return records;
}

/** Why `computer` can't take a tidy job now (D79): it left the account, or tidying is off there (R12). */
async function tidyRefusal(user: string, computer: { id: string; name: string }) {
  const [found] = await computersOf(user, `&id=eq.${encodeURIComponent(computer.id)}`);
  return !found ? `${computer.name} was removed from your account.`
    : !found.tidy ? `Tidying is off on ${computer.name}. Turn it on in Atlaswork there.` : undefined;
}

/** Whether a tidy job for `message` still waits for its computer or runs there. */
async function openTidy(user: string, message: string) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const rows = await fetch(`${supabaseUrl}/rest/v1/agent_jobs?select=id&user_id=eq.${encodeURIComponent(user)}&kind=eq.tidy`
    + `&message_id=eq.${encodeURIComponent(message)}&state=in.(waiting,running)`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error(`agent_jobs: ${response.status}`)));
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * A proactive agent's tidy (D79) lands approved: each one this landing posted in reply to `land.message` goes to its
 * computer as a job, or, when that computer can't take it now, lands why on its card, for Try again.
 */
async function queueTidies(user: string, land: Land, changes: Changes, before: WorkspaceData) {
  const thread = changes.threads?.find((item) => item.id === land.thread);
  const earlier = before.threads.find((item) => item.id === land.thread)?.messages;
  for (const message of thread ? approvedTidies(thread, land.message, earlier) : []) {
    const { id, files } = message.proposal;
    const at = { thread: land.thread, message: message.id };
    const job: TidyJob = { proposal: id, undo: false, moves: files.moves };
    const refused = await tidyRefusal(user, files.computer).catch(() => `Couldn't reach ${files.computer.name}. Try again.`);
    if (!refused) {
      try {
        await createJobs(rpc).tidy(user, { agent: message.agentId ?? atlasId, ...at }, job, files.computer.id);
        continue;
      } catch { /* lands below, for Try again */ }
    }
    await storedThread(user, (data) => tidied(data, at, job, { failed: refused ?? `Couldn't ask ${files.computer.name}. Try again.` }));
  }
}

/**
 * Your Apply or Undo of a tidy (D79), from any device: saved on its proposal in the stored workspace, then queued as a
 * job for its computer, whose helper hands it to the desktop app. Refused while that computer can't take it (R12) or
 * is still on an earlier ask. Costs no reply. Answers the records it wrote, for the page to take in.
 */
async function askTidyFor(user: string, ask: TidyAsk) {
  let asked: ReturnType<typeof askTidy> | undefined;
  let records: Records | undefined;
  try {
    records = await storedThread(user, async (data) => {
      try {
        asked = askTidy(data, ask);
      } catch (cause) {
        throw new AgentError(cause instanceof Error ? cause.message : "This tidy can't change now.");
      }
      const refused = await tidyRefusal(user, asked.computer) ?? (await openTidy(user, ask.message) ? `${asked.computer.name} is still on it.` : undefined);
      if (refused) throw new AgentError(refused);
      return asked.thread;
    });
  } catch (cause) {
    return cause instanceof AgentError ? refuse(409, cause.message) : refuse(502, "Couldn't reach your workspace. Try again.");
  }
  if (!records || !asked) return refuse(502, "Your workspace couldn't be read. Try again.");
  const { computer, job, agentId } = asked;
  try {
    await createJobs(rpc).tidy(user, { agent: agentId, thread: ask.thread, message: ask.message }, job, computer.id);
  } catch {
    const failed = `Couldn't ask ${computer.name}. Try again.`;
    await storedThread(user, (data) => tidied(data, ask, job, { failed })).catch(() => undefined);
    return refuse(502, failed);
  }
  return json({ records });
}

/** What a computer did with a tidy job it holds (D79), landed on its proposal; a tidy job asks nothing else. */
async function tidiedOn(user: string, worker: string, job: { id: string; thread_id: string; message_id: string; request: unknown }, outcome: TidyOutcome) {
  const tidy = tidyJobOf(requestText(job.request));
  if (!tidy) return refuse(409, "This computer doesn't hold that job.");
  const jobs = createJobs(rpc, worker);
  const failed = "failed" in outcome ? outcome.failed : undefined;
  try {
    await storedThread(user, (data) => tidied(data, { thread: job.thread_id, message: job.message_id }, tidy, outcome));
    await jobs.finish(job.id, failed ? "failed" : "done", failed);
    return json({ said: failed ? "failed" : "tidied" });
  } catch (cause) {
    await jobs.finish(job.id, "failed", "What it did couldn't be saved in your workspace.").catch(() => undefined);
    console.warn(`tidy not landed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected"}`);
    return refuse(502, "What it did couldn't be saved in your workspace.");
  }
}

/** "Test" in Settings or an agent's Profile: proves the stored key, address and model answer, without any workspace content. */
async function testOwnModel(userId: string, choice: Pick<Snapshot, "model" | "effort">) {
  const admitted = await admission.admit(userId, "test");
  if ("error" in admitted) return refuse(admitted.status, admitted.error);
  const providers = providersFor(admitted, choice);
  const started = Date.now();
  try {
    const reply = await complete(providers, [{ role: "user", content: "Reply with the single word OK." }], undefined);
    return new Response(JSON.stringify({ text: reply.text.trim().slice(0, 200), ms: Date.now() - started, model: providers[0]?.model }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (cause) {
    return refuse(502, cause instanceof AgentError ? cause.message : "The AI service failed.");
  }
}

/** The profile's model picker: what the stored key reaches. Costs no reply, so it skips admission. */
async function listOwnModels(userId: string) {
  try {
    const own = await rpc("model_key_for", { p_user: userId }) as OwnModel | null;
    if (!own) return refuse(400, "Connect a model first.");
    return new Response(JSON.stringify(await ownModels(own)), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (cause) {
    return refuse(502, cause instanceof AgentError ? cause.message : "Your AI provider didn't list its models.");
  }
}

/** One run's model calls on the admitted providers, with what they spent (D66, D67) and the model that answered last. */
type Meter = {
  model: Model; see: Model; source: string;
  spent: { neurons: number; tokens: { input: number; cached: number; output: number }; answered: string; stoodIn: boolean };
  /** Counts what the run spent against the caps, including a run that failed part-way. Never throws. */
  record(): Promise<void>;
};
async function meterFor(user: string, admitted: Admitted, snapshot: Snapshot): Promise<Meter> {
  const providers = providersFor(admitted, snapshot);
  // One person's calls with one agent go to the instance that holds their cached prompt prefix (Workers AI).
  const session = await sessionOf(user, snapshot.agent.name);
  const spent = { neurons: 0, tokens: { input: 0, cached: 0, output: 0 }, answered: "", stoodIn: false };
  const count = (completion: Completion) => {
    spent.neurons += completion.neurons;
    spent.tokens.input += completion.usage?.input ?? 0;
    spent.tokens.cached += completion.usage?.cached ?? 0;
    spent.tokens.output += completion.usage?.output ?? 0;
  };
  return {
    source: sourceFor(admitted),
    spent,
    // Groq stands in for Workers AI when it's busy, and the reply counts as a stand-in.
    async model(messages, tools) {
      const completion = await complete(providers, messages, tools, session);
      count(completion);
      spent.answered = completion.model ?? spent.answered;
      spent.stoodIn ||= standsIn(admitted, completion.model);
      return completion;
    },
    async see(messages) {
      const completion = await complete(admitted.own ? providers : [seer], messages, undefined);
      count(completion);
      return completion;
    },
    record: () => admission.record(user, spent.neurons, spent.tokens, spent.stoodIn),
  };
}

/** What a reply that goes to the page spent, as the browser records it. */
const spentOf = (reply: AgentOutcome, meter: Meter) => ({ neurons: Math.round(reply.neurons * 10) / 10, calls: reply.calls, usage: reply.usage,
  ...meter.spent.answered ? { model: { source: meter.source, id: meter.spent.answered } } : {} });

/**
 * What the loop came to, as away.ts lands it: with what earlier legs or runs read (D81), the tokens it read, the model
 * that answered and the thinking it was asked for (D82).
 */
function answerOf(reply: Extract<AgentOutcome, { text: string }>, meter: Meter, snapshot: Snapshot, earlier: ToolUse[]): Answered {
  const usage = reply.usage as { input?: number; output?: number; peak?: number } | undefined;
  const used = [...earlier, ...reply.used ?? []].slice(0, 12);
  const { answered } = meter.spent;
  return { text: reply.text, draft: reply.draft, shown: reply.shown, memories: reply.memories, limited: reply.limited, ...used.length && { used },
    ...reply.warnings && { warnings: reply.warnings },
    ...usage && { usage: { input: usage.input ?? 0, output: usage.output ?? 0, peak: usage.peak, ...answered && { model: { source: meter.source, id: answered } },
      effort: snapshot.effort ?? null } } };
}

const failureOf = (snapshot: Snapshot) => (cause: unknown) =>
  `${snapshot.agent.name} couldn't answer: ${cause instanceof AgentError ? cause.message : "something went wrong."} Try again in a moment.`;

/** Starts the next run of a job the server holds (D76) as a call to this function, so it gets the runtime's whole time. */
function nextRun(id: string) {
  return fetch(`${supabaseUrl}/functions/v1/agent`, { method: "POST", headers: { Authorization: `Bearer ${jobsSecret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ continue: id }) }).then((response) => response.body?.cancel(), (cause) => console.warn(`next run: ${String(cause).slice(0, 120)}`));
}

/** One run of a job: whose, which, what it was asked and where it lands, what earlier runs left, and the page if any. */
type JobRunOf = {
  user: string; id: string; jobs: Jobs; snapshot: Snapshot; land: Land; admitted: Admitted; carried: Carried; runs: number;
  /** A leg resuming after this device read its files (D47). */
  claims?: Claims;
  send(line: unknown): void; gone(): boolean;
};

/**
 * Runs a job once and lands what it came to (D76). A page still reading gets the steps and the records written; one
 * that left gets a push. A hand-off (D73) hands on to the next run after `background.runMs` with what it did, until its
 * runs or time are spent and the last stops offering tools. A chat reply that asks for this device's files (D47) lets
 * the job wait for that device, and a reply or hand-off that asks for a computer's (D77) moves the job to that
 * computer, whose helper reads them and goes on. Returns what happened, for the log.
 */
async function runJobOnce(run: JobRunOf): Promise<string> {
  const { user, id, jobs, snapshot, land, carried, claims, send, gone } = run;
  const background = !!land.background;
  const meter = await meterFor(user, run.admitted, snapshot);
  // Calendar tools (D74) stay only when the account has its calendar connected; they read the agent's calendars (D83).
  const { asked, outside } = await withCalendar(snapshot, () =>
    calendarFor(rpc, user, env("CONNECTOR_KEY"), google, { zone: snapshot.zone ?? land.zone ?? "UTC", today: snapshot.today, calendars: snapshot.calendars }));
  const started = Date.now();
  const left = handedOff.ms - carried.ms;
  const last = !jobsSecret || run.runs >= handedOff.runs || left <= handedOff.runMs;
  const budget = !background ? { rounds: limits.rounds, lookups: limits.lookups }
    : { rounds: handedOff.rounds, lookups: handedOff.lookups, ...last ? { deadline: started + Math.max(0, Math.min(left, handedOff.runMs)) } : { yieldAt: started + handedOff.runMs } };
  const earlier = [...carried.used, ...claims?.used ?? []];
  const outcome = await runJob({
    async answer(progress) {
      const reply = await runAgent(carried.turns.length ? { ...asked, turns: carried.turns } : asked, meter.model, (step, tool) => {
        send({ progress: step, ...tool && { tool } });
        progress(step);
      }, meter.see, { budget, ...outside && { outside } });
      if (!("pending" in reply)) return answerOf(reply, meter, snapshot, earlier);
      const used = [...earlier, ...reply.used ?? []].slice(0, 12);
      // A computer's folders (D77) or its search list (D78): the job moves to the computer its first file tool names,
      // and its request says it runs there (D84).
      const target = reply.pending.length ? computerFor(snapshot, reply.pending[0]) : undefined;
      const computer = target?.id ? { id: target.id, name: target.name } : reply.pending.length ? computerOf(snapshot) : undefined;
      if (computer) {
        if (!await holds(user, computer.id)) throw new AgentError(`${computer.name} was removed from your account, so its files can't be read.`);
        await jobs.release(id, `computer:${computer.id}`, { turns: reply.turns, used, ran: Date.now() - started,
          request: { ...snapshot, at: { id: computer.id, name: computer.name } } });
        return { paused: "handed to its computer" };
      }
      if (background) {
        // None of this device's folders or images go with handed-off work, so an empty pause is its run handing on to the next.
        if (reply.pending.length) throw new Error("it paused for files");
        await jobs.release(id, "server", { turns: reply.turns, used, ran: Date.now() - started });
        await nextRun(id);
        return { paused: `run ${run.runs} handed on` };
      }
      // This device runs the files and comes back with the token, which names the job it then claims (D47).
      const nonce = crypto.randomUUID();
      const resume = await signResume(resumeSecret, { user, nonce, expires: Date.now() + resumeMs, leg: (claims?.leg ?? 0) + 1, turns: reply.turns.length,
        digest: await digestOf(snapshot.request, reply.turns), job: id, used });
      await jobs.release(id, `device:${nonce}`);
      send({ pending: reply.pending, turns: reply.turns, resume, used: reply.used, ...spentOf(reply, meter) });
      return { paused: "paused for files" };
    },
    // A page still reading gets what landed; when the account refused it, the page posts the failure itself.
    async land(answer) {
      const landed = await landStored(user, land, (data) => landAway(data, land, answer, { watched: !gone() }),
        gone() ? { ...background && { title: (agent: string) => `${agent} finished` } } : undefined)
        .catch((cause) => { send({ error: failureOf(snapshot)(cause) }); throw cause; });
      send({ landed: landed.records });
      return landed.said;
    },
    async fail(failure) {
      const landed = await landStored(user, land, (data) => failAway(data, land, failure), gone() ? { title: (agent) => `${agent} couldn't finish` } : undefined)
        .catch((cause) => { send({ error: failure }); throw cause; });
      send({ error: failure, landed: landed.records });
      return landed.said;
    },
    progress: (step) => jobs.progress(id, step),
    finish: (state, error) => jobs.finish(id, state, error),
  }, (cause) => {
    // Why, never what was asked: the loop's own words, or an error's name and first words (an RPC's or a provider's status).
    console.warn(`job failed after ${Date.now() - started} ms: ${cause instanceof AgentError ? cause.message : cause instanceof Error ? `${cause.name} ${cause.message.slice(0, 120)}` : "unexpected"}`);
    return failureOf(snapshot)(cause);
  });
  await meter.record();
  return `${outcome}: ${Math.round(meter.spent.neurons)} neurons, ${Date.now() - started} ms`;
}

/**
 * A job's next run, which a run that handed on or the minute sweep started (D76): it claims the job back, goes on from
 * what earlier runs left without counting another reply, and stops with why when the account can't go on.
 */
async function continueJob(id: string) {
  const jobs = createJobs(rpc);
  const job = await jobs.take(id);
  if (!job) return;
  const snapshot = parseSnapshot(requestText(job.request));
  const land = snapshot?.land;
  if (!snapshot || !land) {
    await jobs.finish(id, "failed", "Its request couldn't be read. Ask again.");
    return;
  }
  const admitted = await admission.carry(job.user);
  if ("error" in admitted) {
    const landed = await landStored(job.user, land, (data) => failAway(data, land, admitted.error), { title: (agent) => `${agent} couldn't finish` })
      .catch(() => ({ said: "not landed" }));
    await jobs.finish(id, "failed", admitted.error);
    console.info(`${job.kind} run ${job.runs} stopped, ${landed.said}`);
    return;
  }
  const outcome = await runJobOnce({ user: job.user, id, jobs, snapshot, land, admitted, carried: job, runs: job.runs, send: () => undefined, gone: () => true });
  console.info(`${job.kind} run ${job.runs}, ${outcome}`);
}

/** The function's own calls (D76): `{continue}` runs a job's next run; `{sweep}`, pg_cron's, starts one for every stalled job. */
function carryOn(body: unknown) {
  const work = !body || typeof body !== "object" ? null
    : "continue" in body && typeof body.continue === "string" ? continueJob(body.continue)
    : "sweep" in body ? (rpc("stalled_jobs", {}) as Promise<string[]>).then((ids) => Promise.all(ids.map(nextRun)))
    : null;
  if (!work) return refuse(400, "That request was malformed.");
  keep(work.catch((cause) => console.error(`jobs: ${String(cause).slice(0, 200)}`)));
  return new Response(null, { status: 202, headers: cors });
}

const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { ...cors, "Content-Type": "application/json" } });

/** `user`'s computers that also match `filter` (PostgREST, such as `&search=is.true`), oldest first, read with the service role. */
async function computersOf(user: string, filter = ""): Promise<{ id: string; name: string; tidy?: boolean; last_seen?: string | null }[]> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const rows = await fetch(`${supabaseUrl}/rest/v1/computers?select=id,name,tidy,last_seen&user_id=eq.${encodeURIComponent(user)}${filter}&order=created_at`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((response) => response.ok ? response.json() : Promise.reject(new Error(`computers: ${response.status}`)));
  return Array.isArray(rows) ? rows : [];
}

/**
 * Asks `user`'s computers with search on other than `asker` for their part of a search (D84), all at once: each that
 * asked for work in the last `searchLimits.seen` gets an ask, which it claims with `computer_poll` and answers from its
 * index (`answer_search`, migration `20261125190000_computer_searches.sql`); one still silent after `searchLimits.wait`
 * is late, one not seen is off. The asks go once it's over, so a query and what it found stay only that long.
 */
async function searchOthers(user: string, asker: string, query: string): Promise<Part[]> {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const others = await computersOf(user, `&search=is.true&id=neq.${encodeURIComponent(asker)}`);
  const started = Date.now();
  const on = others.filter((computer) => !!computer.last_seen && started - Date.parse(computer.last_seen) <= searchLimits.seen);
  const asks = on.length ? await fetch(`${supabaseUrl}/rest/v1/computer_searches?select=id`, {
    method: "POST", headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(on.map((computer) => ({ user_id: user, computer_id: computer.id, query }))),
  }).then((response) => response.ok ? response.json() : []).catch(() => []) as { id: string }[] : [];
  const ids = asks.map((ask) => ask.id).join(",");
  const answers = new Map<string, unknown>();
  try {
    while (asks.length && answers.size < asks.length && Date.now() - started < searchLimits.wait) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const rows = await fetch(`${supabaseUrl}/rest/v1/computer_searches?select=computer_id,answer&id=in.(${ids})&answered_at=not.is.null`, { headers })
        .then((response) => response.ok ? response.json() : []).catch(() => []) as { computer_id: string; answer: unknown }[];
      for (const row of rows) answers.set(row.computer_id, row.answer);
    }
  } finally {
    if (asks.length) await fetch(`${supabaseUrl}/rest/v1/computer_searches?id=in.(${ids})`, { method: "DELETE", headers }).catch(() => undefined);
  }
  return others.map((computer): Part => {
    if (!on.includes(computer)) return { computer: computer.name, missing: "off" };
    const answer = searchAnswerOf(answers.get(computer.id));
    return answer ? { computer: computer.name, ...answer } : { computer: computer.name, missing: "late" };
  });
}

/** Whether `computer` is still one of `user`'s computers (D77): a job never waits for one that was removed. */
const holds = async (user: string, computer: string) => (await computersOf(user, `&id=eq.${encodeURIComponent(computer)}`)).length > 0;

/**
 * A step of a job a computer holds (agents-design D77, computer.ts): its helper runs the agent loop there and asks this
 * function for each model call, image and calendar read, counted against the job (`job_call`) and the account's caps
 * without another reply (`admission.carry`, as a long job's later runs are), then lands the answer or why it failed
 * as a hand-off does. A tidy job (D79) only reports what the app did. A token that names no computer, or a job that
 * computer doesn't hold, gets nothing.
 */
async function computerAsk(token: string, text: string) {
  const computer = await rpc("computer_of", { p_token: token }).catch(() => null) as { id: string; user: string; name: string } | null;
  if (!computer) return refuse(403, "This computer was removed from its account. Pair it again from the desktop app.");
  const ask = parseComputerAsk(text);
  if (!ask) return refuse(400, "That request was too large or malformed.");
  const worker = `computer:${computer.id}`;
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const rows = await fetch(`${supabaseUrl}/rest/v1/agent_jobs?select=id,user_id,kind,thread_id,message_id,worker,state,created_at,request&id=eq.${ask.job}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` } }).then((response) => response.ok ? response.json() : []).catch(() => []) as
    { id: string; user_id: string; kind: string; thread_id: string; message_id: string; worker: string | null; state: string; created_at: string; request: unknown }[];
  const job = rows[0];
  if (!job || job.user_id !== computer.user || job.worker !== worker || job.state !== "running") return refuse(409, "This computer doesn't hold that job.");
  if (job.kind === "tidy") return "tidied" in ask ? tidiedOn(computer.user, worker, job, ask.tidied) : refuse(409, "A tidy job asks nothing else.");
  const snapshot = parseSnapshot(requestText(job.request));
  const land = snapshot?.land;
  if (!snapshot || !land || "tidied" in ask) return refuse(409, "This computer doesn't hold that job.");
  const jobs = createJobs(rpc, worker);
  if ("progress" in ask) return json({ ok: await jobs.progress(ask.job, ask.progress) });
  // A file the job asked for is on another of the account's computers (D84): it waits for that one, its request saying
  // it runs there with what its searches found, and that computer's helper claims it and goes on.
  if ("move" in ask) {
    const target = (await computersOf(computer.user)).find((item) => item.name.toLowerCase() === ask.move.to.toLowerCase());
    if (!target || target.id === computer.id) return refuse(404, `${ask.move.to} isn't another of your computers.`);
    const moved = await jobs.release(ask.job, `computer:${target.id}`, { turns: ask.move.turns, used: ask.move.used, ran: ask.move.ran,
      request: { ...snapshot, at: { id: target.id, name: target.name, ...ask.move.found.length && { found: ask.move.found } } } });
    return moved ? json({ moved: target.name }) : refuse(409, "This computer doesn't hold that job.");
  }
  if ("land" in ask || "fail" in ask) {
    const failed = "fail" in ask ? ask.fail : undefined;
    try {
      // A tidy or a place a reply learned may be on another computer it searched (D84), named by that computer's name.
      const computers = "land" in ask ? (await computersOf(computer.user).catch(() => [])).map(({ id, name }) => ({ id, name })) : [];
      const landed = "land" in ask
        ? await landStored(computer.user, land, (data) => landAway(data, land, ask.land, { ranOn: { id: computer.id, name: computer.name }, computers }),
          { title: (agent) => `${agent} finished` })
        : await landStored(computer.user, land, (data) => failAway(data, land, failed!), { title: (agent) => `${agent} couldn't finish` });
      await jobs.finish(ask.job, failed ? "failed" : "done", failed);
      console.info(`computer job ${failed ? "failed" : "done"}, ${landed.said}`);
      return json({ said: landed.said });
    } catch (cause) {
      await jobs.finish(ask.job, "failed", "Its answer couldn't be saved in your workspace. Try again.").catch(() => undefined);
      console.warn(`computer job not landed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected"}`);
      return refuse(502, "Its answer couldn't be saved in your workspace.");
    }
  }
  // A model call, an image or a calendar read: within the job's time and calls; a model call or an image also within
  // the account's plan, budget and share.
  if (Date.now() - Date.parse(job.created_at) > handedOff.ms + 60_000) return refuse(408, "It ran out of time.");
  const calls = await rpc("job_call", { p_job: ask.job, p_worker: worker }) as number | null;
  if (calls === null) return refuse(409, "This computer doesn't hold that job.");
  if (calls > callsPerJob) return refuse(429, "It took more steps than one job may.");
  // A search on the computer running the reply asks the others too (D84).
  if ("search" in ask) return json({ parts: await searchOthers(computer.user, computer.id, ask.search) });
  if ("outside" in ask) {
    const { outside } = await withCalendar(snapshot, () =>
      calendarFor(rpc, computer.user, env("CONNECTOR_KEY"), google, { zone: snapshot.zone ?? land.zone ?? "UTC", today: snapshot.today, calendars: snapshot.calendars }));
    return json(outside ? await outside(ask.outside) : { text: "Google Calendar isn't connected to this account; say so." });
  }
  const admitted = await admission.carry(computer.user);
  if ("error" in admitted) return refuse(admitted.status, admitted.error);
  const meter = await meterFor(computer.user, admitted, snapshot);
  try {
    const completion = "model" in ask ? await meter.model(ask.model.messages, ask.model.tools) : await meter.see(ask.see.messages, undefined);
    return json({ ...completion, source: meter.source });
  } catch (cause) {
    return refuse(502, cause instanceof AgentError ? cause.message : "The AI service failed.");
  } finally {
    await meter.record();
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return refuse(405, "Use POST.");
  if (jobsSecret && request.headers.get("Authorization") === `Bearer ${jobsSecret}`) return carryOn(await request.json().catch(() => null));
  const bearer = request.headers.get("Authorization") ?? "";
  if (bearer.startsWith("Bearer awc_")) return computerAsk(bearer.slice("Bearer ".length), await request.text());
  const user = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: request.headers.get("Authorization") ?? "" },
  }).then((response) => response.ok ? response.json() as Promise<{ id: string }> : null).catch(() => null);
  if (!user?.id) return refuse(401, "You're signed out. Sign in again from Settings → Account.");
  const text = await request.text();
  // "Test": one tiny call to the customer's own model (or an agent's, D44), counted like a reply.
  const test = parseTest(text);
  if (test) return testOwnModel(user.id, test);
  if (text === '{"models":true}') return listOwnModels(user.id);
  // Your Apply or Undo of a tidy (D79): no reply, a job for its computer.
  const tidy = tidyAskIn(text);
  if (tidy) return askTidyFor(user.id, tidy);
  const snapshot = parseSnapshot(text);
  if (!snapshot) return refuse(400, "That request was too large or malformed.");
  // A resumed leg (D47) continues an admitted reply: its token is checked and claimed instead of another reply.
  const claims = snapshot.resume ? await verifyResume(resumeSecret, user.id, snapshot, Date.now()) : null;
  if (typeof claims === "string") return refuse(409, claims);
  // Work you hand off (D73) can't pause for this device's files or images: nobody may be there to read them. A
  // computer's folders (D77) go with a reply or hand-off, whose job moves there for them, but not with a request that
  // has nowhere to land, nor this device's images beside them.
  const background = snapshot.land?.background;
  if (background && (snapshot.resume || snapshot.turns)) return refuse(400, "That request was too large or malformed.");
  const onComputer = !!snapshot.folders?.[0]?.computer;
  const kept: Snapshot = onComputer ? { ...snapshot, folders: snapshot.land ? snapshot.folders : undefined, images: undefined }
    : background ? { ...snapshot, folders: undefined, images: undefined } : snapshot;
  // A reply or hand-off whose agent may read files may search one of the account's computers (D78), which only this
  // sets: its job may move there, so this device's image notes stay out, as beside a computer's folders. A resumed leg
  // searches none; its job never moved.
  const searching = snapshot.land && !claims && kept.tools.includes("search_computer")
    ? await computersOf(user.id, "&search=is.true").catch((cause) => { console.warn(`computers: ${String(cause).slice(0, 120)}`); return []; })
    : [];
  const search = searchedComputer(kept, searching);
  // Tidying (D79) only where that computer has it on.
  const tidies = !!search && searching.some((computer) => computer.id === search.id && computer.tidy === true);
  // Where a job runs (D84) is the function's to say: one a browser sends is dropped.
  const unpaused: Snapshot = withTidy(search ? { ...kept, search, at: undefined, images: undefined } : { ...kept, search: undefined, at: undefined }, tidies);
  const admitted = claims ? await admission.resume(user.id, claims.nonce) : await admission.admit(user.id, background ? "background" : "reply");
  if ("error" in admitted) return refuse(admitted.status, admitted.error);
  // Every chat reply and hand-off is a job (D76), stored with what it was asked and claimed by this run. A leg that
  // resumes with this device's file results (D47) claims the job its pause left waiting for that device.
  const land = snapshot.land;
  const jobs = createJobs(rpc, claims ? `device:${claims.nonce}` : undefined);
  let job: string | undefined;
  if (land) {
    try {
      if (claims?.job) {
        if (!await jobs.take(claims.job)) return refuse(409, "This reply took too long to continue. Ask again.");
        job = claims.job;
      } else if (!claims) job = await jobs.start(user.id, background ? "handoff" : "reply", { ...unpaused, land });
    } catch (cause) {
      console.error(`jobs: ${String(cause).slice(0, 200)}`);
      return refuse(unavailable.status, unavailable.error);
    }
  }
  const encoder = new TextEncoder();
  // Set when the page stops reading (a closed tab, a reload): the reply runs on and lands, and a push tells the
  // account's devices. Handed-off work lets the page go at once.
  let gone = false;
  const body = new ReadableStream({
    start(controller) {
      const send = (line: unknown) => {
        if (gone) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)); } catch { gone = true; }
      };
      const close = () => { if (!gone) controller.close(); };
      const started = Date.now();
      if (job && land) {
        const id = job;
        send(background ? { background: true, job: id } : { job: id });
        if (background) {
          close();
          gone = true;
        }
        keep(runJobOnce({ user: user.id, id, jobs, snapshot: unpaused, land, admitted, carried: { turns: [], used: [], ms: 0 }, runs: 1, ...claims && { claims },
          send, gone: () => gone }).then((outcome) => {
          close();
          console.info(`${background ? "work handed off" : gone ? "reply after the page left" : "reply"}, ${outcome}`);
        }));
        return;
      }
      // Not for a chat (a routine the page runs, an asked agent's answer, a dialog's fill): the page posts it.
      keep((async () => {
        const meter = await meterFor(user.id, admitted, snapshot);
        try {
          const { asked, outside } = await withCalendar(unpaused, () =>
            calendarFor(rpc, user.id, env("CONNECTOR_KEY"), google, { zone: unpaused.zone ?? "UTC", today: unpaused.today, calendars: unpaused.calendars }));
          const reply = await runAgent(asked, meter.model, (progress, tool) => send({ progress, ...tool && { tool } }), meter.see,
            { budget: { rounds: limits.rounds, lookups: limits.lookups }, ...outside && { outside } });
          if ("pending" in reply) {
            const resume = await signResume(resumeSecret, { user: user.id, nonce: crypto.randomUUID(), expires: Date.now() + resumeMs, leg: (claims?.leg ?? 0) + 1,
              turns: reply.turns.length, digest: await digestOf(snapshot.request, reply.turns) });
            send({ pending: reply.pending, turns: reply.turns, resume, used: reply.used, ...spentOf(reply, meter) });
          } else send({ text: reply.text, proposal: reply.draft, shown: reply.shown, memories: reply.memories, used: reply.used, warnings: reply.warnings, ...spentOf(reply, meter) });
          console.info(`${"pending" in reply ? "paused for files" : "reply"}: ${reply.calls} calls, ${reply.neurons} neurons, ${Date.now() - started} ms`);
        } catch (cause) {
          console.warn(`failed after ${Date.now() - started} ms: ${cause instanceof AgentError ? cause.message : "unexpected error"}`);
          send({ error: failureOf(snapshot)(cause) });
        } finally {
          close();
          await meter.record();
        }
      })());
    },
    cancel() { gone = true; },
  });
  return new Response(body, { headers: { ...cors, "Content-Type": "application/x-ndjson" } });
});
