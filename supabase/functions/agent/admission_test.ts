import assert from "node:assert/strict";
import { createAdmission, providersFor, sourceFor, standsIn } from "./admission.ts";
import type { Rpc } from "./admission.ts";
import { background, caps } from "./caps.ts";
import { groq, workersAi } from "./provider.ts";
import type { OwnModel } from "./provider.ts";

const ours = [workersAi("ours"), groq("fallback")];
const key: OwnModel = { provider: "openrouter", base_url: null, model: "openai/gpt-oss-120b", key: "sk-own" };
/** The usage database as the migration answers: a stored key (or none), then one verdict for the reply. */
function usage(own: OwnModel | null, verdict: string | Error) {
  const calls: [string, Record<string, unknown>][] = [];
  const rpc: Rpc = async (name, args) => {
    calls.push([name, args]);
    if (verdict instanceof Error) throw verdict;
    return name === "model_key_for" ? own : verdict;
  };
  return { rpc, calls };
}

Deno.test("our models refuse for plan, shared budget, the account's share of it and the daily cap, and otherwise admit on our providers", async () => {
  for (const [verdict, status, error] of [["plan", 403, /invite-only/], ["budget", 429, /shared budget/], ["share", 429, /today's share/],
    ["user", 429, new RegExp(`today's ${caps.replies} live`)]] as const) {
    const refused = await createAdmission(usage(null, verdict).rpc, ours).admit("u", "reply");
    assert.ok("error" in refused);
    assert.equal(refused.status, status);
    assert.match(refused.error, error);
  }
  const { rpc, calls } = usage(null, "ok");
  assert.deepEqual(await createAdmission(rpc, ours).admit("u", "reply"), { providers: ours });
  assert.deepEqual(calls[1], ["begin_agent_reply", { p_user: "u", p_replies: caps.replies, p_neurons: caps.neurons, p_own: false, p_user_neurons: caps.userNeurons }]);
  assert.deepEqual(await createAdmission(usage(null, "ok").rpc, ours).admit("u", "test"), { status: 400, error: "Connect a model first." });
});

Deno.test("work handed off (D73) takes several of the day's replies at once, and says so when they don't fit", async () => {
  const { rpc, calls } = usage(null, "ok");
  assert.deepEqual(await createAdmission(rpc, ours).admit("u", "background"), { providers: ours });
  assert.equal(calls[1][1].p_count, background.replies);
  const refused = await createAdmission(usage(null, "user").rpc, ours).admit("u", "background");
  assert.ok("error" in refused);
  assert.match(refused.error, new RegExp(`counts as ${background.replies} replies`));
});

Deno.test("a long job's next run counts no reply, and stops when the account's share or the shared budget is used up (D76)", async () => {
  const { rpc, calls } = usage(null, "ok");
  assert.deepEqual(await createAdmission(rpc, ours).carry("u"), { providers: ours });
  assert.ok(!calls.some(([name]) => name === "begin_agent_reply"), "the hand-off's one admission covered it");
  for (const [verdict, error] of [["share", /today's share/], ["budget", /shared budget/], ["plan", /invite-only/]] as const) {
    const refused = await createAdmission(usage(null, verdict).rpc, ours).carry("u");
    assert.ok("error" in refused);
    assert.match(refused.error, error);
  }
  assert.deepEqual(await createAdmission(usage(null, new Error("down")).rpc, ours).carry("u"), { status: 503, error: "Live agents are unavailable right now. Try again in a moment." });
});

Deno.test("an own model replaces our providers under the roomier cap, for replies and the profile's Test", async () => {
  for (const kind of ["reply", "test"] as const) {
    const { rpc, calls } = usage(key, "ok");
    const admitted = await createAdmission(rpc, ours).admit("u", kind);
    assert.ok("providers" in admitted);
    assert.deepEqual(admitted.providers.map((provider) => [provider.own, provider.key, provider.model]), [[true, "sk-own", key.model]]);
    assert.deepEqual(calls[1][1], { p_user: "u", p_replies: caps.ownReplies, p_neurons: caps.neurons, p_own: true, p_user_neurons: caps.userNeurons });
  }
  const capped = await createAdmission(usage(key, "user").rpc, ours).admit("u", "reply");
  assert.deepEqual(capped, { status: 429, error: `You've used today's ${caps.ownReplies} live replies. They reset at 00:00 UTC.` });
});

Deno.test("an agent's own model and effort replace the account's only on its own provider, the model only from its catalogue", () => {
  const own = { providers: [], own: { ...key, effort: "low" as const } };
  const answer = (admitted: Parameters<typeof providersFor>[0], choice: Parameters<typeof providersFor>[1]) =>
    providersFor(admitted, choice).map((provider) => [provider.key, provider.model, JSON.stringify(provider.extra ?? null)]);
  const sonnet = { source: "openrouter", id: "anthropic/claude-sonnet-4.5" };
  assert.deepEqual(answer(own, { model: sonnet }), [["sk-own", sonnet.id, '{"reasoning":{"effort":"low"}}']], "the account's effort stays");
  assert.deepEqual(answer(own, { model: sonnet, effort: "high" }), [["sk-own", sonnet.id, '{"reasoning":{"effort":"high"}}']]);
  assert.deepEqual(answer(own, { effort: "high" }), [["sk-own", key.model, '{"reasoning":{"effort":"high"}}']], "effort alone keeps the default model");
  const groqHost = { providers: [], own: { ...key, provider: "openai" as const, base_url: "https://api.groq.com/openai/v1" } };
  assert.deepEqual(answer(groqHost, { model: { source: "openai", id: "gpt-5" } }).map(([, model]) => model), [key.model],
    "OpenAI's catalogue isn't another OpenAI-compatible host's");
  assert.deepEqual(providersFor({ providers: ours }, { model: sonnet, effort: "high" }), ours, "our hosted model offers no choice");
  assert.equal(sourceFor({ providers: ours }), "atlaswork");
  assert.equal(sourceFor(groqHost), "openai:api.groq.com");
});

Deno.test("a failing usage database refuses with 503 instead of failing the request, and recording never throws", async () => {
  const errors: string[] = [];
  const log = console.error;
  console.error = (line: string) => errors.push(line);
  try {
    const down = createAdmission(usage(null, new Error("begin_agent_reply: HTTP 500")).rpc, ours);
    assert.deepEqual(await down.admit("u", "reply"), { status: 503, error: "Live agents are unavailable right now. Try again in a moment." });
    assert.deepEqual(await createAdmission(usage(null, "surprise").rpc, ours).admit("u", "reply"),
      { status: 503, error: "Live agents are unavailable right now. Try again in a moment." });
    await down.record("u", 12.2);
    assert.equal(errors.length, 2);
  } finally {
    console.error = log;
  }
  const { rpc, calls } = usage(null, "ok");
  await createAdmission(rpc, ours).record("u", 12.2, { input: 5400, cached: 1200, output: 300 }, true);
  assert.deepEqual(calls, [["record_agent_neurons", { p_user: "u", p_neurons: 13, p_input: 5400, p_cached: 1200, p_output: 300, p_stood_in: true }]],
    "with the tokens the reply read and wrote (D64, D65) and whether Groq stood in (D67)");
});

Deno.test("a reply counts as a stand-in only when Groq answered for our Workers AI, never on an own model of the same name", () => {
  const admitted = { providers: ours };
  assert.equal(standsIn(admitted, ours[0].model), false);
  assert.equal(standsIn(admitted, ours[1].model), true);
  assert.equal(standsIn(admitted, undefined), false);
  assert.equal(standsIn({ providers: [], own: key }, ours[1].model), false);
});
