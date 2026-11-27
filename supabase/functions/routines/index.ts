// Routines while the app is closed (launch plan D17, agents-design D54). pg_cron posts here every 15 minutes with the
// ROUTINES_CRON_SECRET bearer (migration 20261116200000_routines_away.sql). It answers at once and then, for each
// account away_accounts names, loads the workspace, runs what's due (run.ts) through the same admission and agent loop
// as a live reply (../agent), and saves what landed. Each run counts as one of the day's replies, like the app's.
// It stops starting accounts after two minutes; whatever is left is still due 15 minutes later. What a run posted goes
// out as a push to each device that subscribed (send.ts, D55), unless it's the account's quiet hours. Prompts, replies
// and workspace contents are never logged.
import { createAdmission, providersFor, sourceFor, standsIn } from "../agent/admission.ts";
import { calendarFor, withCalendar } from "../agent/calendar.ts";
import { AgentError, runAgent } from "../agent/logic.ts";
import type { Model } from "../agent/logic.ts";
import { complete, groq, sessionOf, workersAi } from "../agent/provider.ts";
import { accountRecordsOf, workspaceOf } from "../../../src/records.ts";
import { normalize } from "../../../src/workspace.ts";
import { runDue } from "./run.ts";
import type { Io } from "./run.ts";
import { createPushes } from "./send.ts";

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void } | undefined;
const env = (name: string) => Deno.env.get(name) ?? "";
const ours = [workersAi(env("WORKERS_AI_TOKEN")), ...env("GROQ_API_KEY") ? [groq(env("GROQ_API_KEY"))] : []];
// Google Calendar (agents-design D74): a routine reads it as a reply does, on the account's clock.
const google = { id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET") };
/** Accounts start only within this much of a tick; the Edge runtime stops background work at 150 s. */
const budgetMs = 120_000;

/** Calls a Postgres function with the service role, which alone may run the `*_of` and `away_*` functions. */
async function rpc(name: string, args: Record<string, unknown>) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${env("SUPABASE_URL")}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const admission = createAdmission(rpc, ours);

type Away = { user_id: string; time_zone: string; person_name: string; person_about: string };

/**
 * The account's storage and agent loop for run.ts. A reply is admitted like the app's: plan, daily cap, own model. It
 * reads a connected Google Calendar (D74) on the account's clock, `zone`.
 */
function ioFor(user: string, zone: string): Io {
  return {
    claim: async (id, due) => await rpc("claim_routine_of", { p_user: user, p_id: id, p_due: due }),
    async answer(snapshot) {
      const admitted = await admission.admit(user, "reply");
      if ("error" in admitted) throw new Error(admitted.error);
      const providers = providersFor(admitted, snapshot);
      // As the app's replies: one person's calls with one agent share a cached prompt prefix (Workers AI).
      const session = await sessionOf(user, snapshot.agent.name);
      let neurons = 0, answered = "", stoodIn = false;
      const tokens = { input: 0, cached: 0, output: 0 };
      const model: Model = async (messages, tools) => {
        const completion = await complete(providers, messages, tools, session);
        neurons += completion.neurons;
        tokens.input += completion.usage?.input ?? 0;
        tokens.cached += completion.usage?.cached ?? 0;
        tokens.output += completion.usage?.output ?? 0;
        answered = completion.model ?? answered;
        stoodIn ||= standsIn(admitted, completion.model);
        return completion;
      };
      try {
        const { asked, outside } = await withCalendar(snapshot, () => calendarFor(rpc, user, env("CONNECTOR_KEY"), google, { zone, today: snapshot.today, calendars: snapshot.calendars }));
        const reply = await runAgent(asked, model, () => undefined, undefined, outside ? { outside } : {});
        // No linked folders run here, so a reply never pauses for file tools; one that did would be a bug.
        if ("pending" in reply) throw new Error("it asked for files only a device has.");
        const usage = reply.usage as { input?: number; output?: number; peak?: number } | undefined;
        return { text: reply.text, draft: reply.draft, shown: reply.shown, ...reply.used && { used: reply.used }, ...reply.warnings && { warnings: reply.warnings },
          ...usage && { usage: { input: usage.input ?? 0, output: usage.output ?? 0, peak: usage.peak, ...answered ? { model: { source: sourceFor(admitted), id: answered } } : {} } } };
      } catch (cause) {
        throw new Error(cause instanceof AgentError ? cause.message : "something went wrong.");
      } finally {
        await admission.record(user, neurons, tokens, stoodIn);
      }
    },
    async save(changes, before) {
      const { puts, deletes } = accountRecordsOf(changes, before);
      await rpc("save_workspace_of", { p_user: user, p_puts: Object.fromEntries(puts), p_deletes: deletes });
    },
  };
}

const notify = createPushes(rpc, env("VAPID_KEYS"));

async function runAll() {
  const started = Date.now();
  const accounts = await rpc("away_accounts", {}) as Away[];
  let ran = 0, posted = 0, failed = 0, pushed = 0;
  for (const account of accounts) {
    if (Date.now() - started > budgetMs) break;
    try {
      const rows = Object.entries(await rpc("load_workspace_of", { p_user: account.user_id }) as Record<string, unknown>);
      const stored = workspaceOf(rows);
      if (!stored) continue;
      const outcome = await runDue(normalize(stored).data, new Date(), account.time_zone,
        { name: account.person_name, about: account.person_about }, ioFor(account.user_id, account.time_zone));
      await rpc("away_ran", { p_user: account.user_id });
      ran += outcome.ran;
      posted += outcome.posts.length;
      if (outcome.posts.length) pushed += await notify(account.user_id, account.time_zone, outcome.posts).catch((cause) => {
        console.warn(`an account's pushes failed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected error"}`);
        return 0;
      });
      failed += outcome.failed.length;
    } catch (cause) {
      failed++;
      console.warn(`an account's routines failed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected error"}`);
    }
  }
  console.info(`routines: ${accounts.length} accounts away, ${ran} ran, ${posted} posted, ${pushed} pushed, ${failed} failed, ${Date.now() - started} ms`);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Use POST.", { status: 405 });
  const secret = env("ROUTINES_CRON_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) return new Response("Not allowed.", { status: 401 });
  const work = runAll().catch((cause) => console.error(`routines: ${String(cause).slice(0, 200)}`));
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(work);
    return new Response(JSON.stringify({ started: true }), { status: 202, headers: { "Content-Type": "application/json" } });
  }
  await work;
  return new Response(JSON.stringify({ done: true }), { headers: { "Content-Type": "application/json" } });
});
