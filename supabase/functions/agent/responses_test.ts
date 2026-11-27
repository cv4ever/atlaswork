import assert from "node:assert/strict";
import { completeOnResponses } from "./responses.ts";
import type { Message } from "./logic.ts";

/** Answers fetches in turn: an SSE body cut into 7-byte chunks (so events straddle reads), or a plain error response. */
function fakeStreams(...answers: (unknown[] | { status: number; body: unknown })[]) {
  const sent: RequestInit[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((_url: string, init: RequestInit) => {
    sent.push(init);
    const answer = answers[Math.min(sent.length - 1, answers.length - 1)];
    if (!Array.isArray(answer)) return Promise.resolve(Response.json(answer.body, { status: answer.status }));
    const bytes = new TextEncoder().encode(answer.map((event) => `event: x\ndata: ${JSON.stringify(event)}\n\n`).join(""));
    const body = new ReadableStream<Uint8Array>({ start(controller) {
      for (let at = 0; at < bytes.length; at += 7) controller.enqueue(bytes.slice(at, at + 7));
      controller.close();
    } });
    return Promise.resolve(new Response(body));
  }) as typeof fetch;
  return { sent, body: (index: number) => JSON.parse(String(sent[index].body)), restore: () => { globalThis.fetch = realFetch; } };
}

const history: Message[] = [
  { role: "system", content: "Be brief." },
  { role: "user", content: "Tidy my tasks" },
  { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "list_tasks", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "c1", content: "- Laundry" },
];
const tool = { type: "function", function: { name: "list_tasks", description: "Open tasks", parameters: { type: "object", properties: {} } } };
const plan = { key: "token", model: "gpt-x", plan: true };
const completed = (output: unknown[]) => [{ type: "response.output_text.delta", delta: "Su" },
  { type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 120, output_tokens: 30 } } }];

Deno.test("a plan call sends what the plan route accepts and reads tool calls, usage and reasoning from a chunked stream", async () => {
  const reasoning = { id: "rs_1", type: "reasoning", encrypted_content: "opaque" };
  const fake = fakeStreams(completed([reasoning,
    { type: "message", content: [{ type: "output_text", text: "Sure." }] },
    { id: "fc_1", type: "function_call", call_id: "c2", name: "atlaswork.complete_tasks", arguments: '{"ids":["t1"]}' },
  ]));
  try {
    const completion = await completeOnResponses(plan, history, [tool]);
    assert.equal(completion.text, "Sure.");
    assert.deepEqual(completion.toolCalls, [{ id: "c2", type: "function", function: { name: "complete_tasks", arguments: '{"ids":["t1"]}' } }]);
    assert.deepEqual(completion.usage, { input: 120, output: 30, cached: 0 });
    const body = fake.body(0);
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.equal(body.instructions, "Be brief.");
    assert.deepEqual(body.include, ["reasoning.encrypted_content"]);
    assert.ok(!("max_output_tokens" in body) && !("temperature" in body), "the plan route refuses these");
    assert.ok(!body.input.some((item: { role?: string }) => item.role === "system"), "system text travels as instructions");
    assert.deepEqual(body.input.slice(1), [
      { type: "function_call", call_id: "c1", namespace: "atlaswork", name: "list_tasks", arguments: "{}" },
      { type: "function_call_output", call_id: "c1", output: "- Laundry" },
    ]);
    assert.equal(body.tools[0].type, "namespace");

    // The next round sends that turn back as it came, reasoning included, without ids nothing stored can resolve.
    await completeOnResponses(plan, [...history, { role: "assistant", content: "Sure.", tool_calls: completion.toolCalls, replay: completion.replay },
      { role: "tool", tool_call_id: "c2", content: "Proposed." }], [tool]);
    const replayed = fake.body(1).input.slice(3, 6);
    assert.deepEqual(replayed.map((item: { type: string }) => item.type), ["reasoning", "message", "function_call"]);
    assert.equal(replayed[0].encrypted_content, "opaque");
    assert.ok(replayed.every((item: { id?: string }) => !item.id));
  } finally {
    fake.restore();
  }
});

Deno.test("a completed response with an empty output reads the items that streamed before it", async () => {
  const call = { type: "function_call", call_id: "c3", name: "read_notes", namespace: "atlaswork", arguments: '{"query":"bills"}' };
  const fake = fakeStreams([{ type: "response.output_item.done", item: call }, ...completed([])]);
  try {
    const completion = await completeOnResponses(plan, history, [tool]);
    assert.deepEqual(completion.toolCalls, [{ id: "c3", type: "function", function: { name: "read_notes", arguments: '{"query":"bills"}' } }]);
    assert.deepEqual(completion.replay, [call]);
  } finally {
    fake.restore();
  }
});

Deno.test("an API key gets an output cap, and a model without reasoning is asked again without it", async () => {
  const fake = fakeStreams({ status: 400, body: { error: { code: "unsupported_parameter", param: "reasoning.effort", message: "no" } } },
    completed([{ type: "message", content: [{ type: "output_text", text: "OK" }] }]));
  try {
    const completion = await completeOnResponses({ key: "sk", model: "gpt-4.1", plan: false, maxTokens: 4000, effort: "high" }, history, undefined);
    assert.equal(completion.text, "OK");
    assert.deepEqual([fake.body(0).reasoning, fake.body(0).max_output_tokens], [{ effort: "high" }, 4000]);
    assert.ok(!("reasoning" in fake.body(1)) && !("include" in fake.body(1)));
  } finally {
    fake.restore();
  }
});

Deno.test("plan limits and refusals read as what to do, even after the stream opened", async () => {
  let fake = fakeStreams([{ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" } } }]);
  try {
    await assert.rejects(completeOnResponses(plan, history, undefined), /usage limit.*chatgpt\.com\/settings\/usage/);
  } finally {
    fake.restore();
  }
  fake = fakeStreams({ status: 401, body: {} });
  try {
    await assert.rejects(completeOnResponses(plan, history, undefined), /Continue with ChatGPT again/);
    await assert.rejects(completeOnResponses({ ...plan, plan: false }, history, undefined), /refused the key/);
  } finally {
    fake.restore();
  }
  fake = fakeStreams([{ type: "response.incomplete", response: { status: "incomplete", output: [] } }]);
  try {
    assert.equal((await completeOnResponses(plan, history, undefined)).finish, "length", "a cut reply is retried like any other");
  } finally {
    fake.restore();
  }
});

Deno.test("an error event's details are read where OpenAI puts them, so an empty account says so", async () => {
  const fake = fakeStreams([{ type: "response.created", response: { status: "in_progress" } },
    { type: "error", error: { type: "insufficient_quota", code: "credit_balance_exhausted", message: "You have no credits remaining." } }]);
  try {
    await assert.rejects(completeOnResponses({ key: "sk", model: "gpt-x", plan: false }, history, undefined), /out of credit/);
  } finally {
    fake.restore();
  }
});
