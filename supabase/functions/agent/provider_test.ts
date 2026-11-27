import assert from "node:assert/strict";
import { complete, fromAnthropic, groq, ownProvider, toAnthropic, workersAi, workersAiVision } from "./provider.ts";
import type { Message } from "./logic.ts";

const reply = { choices: [{ message: { content: "hi" }, finish_reason: "stop" }], usage: { neurons: 7 } };

function fakeFetch(answer: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(answer(url, init));
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

Deno.test("a rate-limited provider hands the call to the next; other failures don't", async () => {
  const answers: Record<string, () => Response> = {};
  const fake = fakeFetch((url) => answers[new URL(url).host]());
  const hosts = () => fake.calls.map((call) => new URL(call.url).host);
  try {
    const providers = [workersAi("a"), groq("b")];
    answers["api.cloudflare.com"] = () => new Response("busy", { status: 429 });
    answers["api.groq.com"] = () => Response.json(reply);
    assert.equal((await complete(providers, [], undefined)).text, "hi");
    assert.deepEqual(hosts(), ["api.cloudflare.com", "api.groq.com"]);

    fake.calls.length = 0;
    answers["api.cloudflare.com"] = () => new Response("broken", { status: 500 });
    await assert.rejects(complete(providers, [], undefined), /failed/);
    assert.deepEqual(hosts(), ["api.cloudflare.com"], "a real failure isn't retried elsewhere");

    fake.calls.length = 0;
    answers["api.cloudflare.com"] = () => new Response("busy", { status: 429 });
    answers["api.groq.com"] = () => new Response("busy", { status: 429 });
    await assert.rejects(complete(providers, [], undefined, undefined, 0), /busy/);
    assert.deepEqual(hosts(), ["api.cloudflare.com", "api.groq.com", "api.cloudflare.com", "api.groq.com"], "all busy: one more round, then busy");

    fake.calls.length = 0;
    let rushed = true;
    answers["api.cloudflare.com"] = () => rushed ? (rushed = false, new Response("busy", { status: 429 })) : Response.json(reply);
    answers["api.groq.com"] = () => new Response("busy", { status: 429 });
    assert.equal((await complete(providers, [], undefined, undefined, 0)).text, "hi", "a moment's rush passes on the second round");
  } finally {
    fake.restore();
  }
});

Deno.test("an image goes to our vision model as an image part, and to Anthropic as an image block", async () => {
  const image = "data:image/jpeg;base64,QUJD";
  const asked: Message[] = [{ role: "system", content: "Describe it." }, { role: "user", content: "The image is “sheet”.", image }];
  const fake = fakeFetch(() => Response.json(reply));
  try {
    await complete([workersAiVision("a")], asked, undefined);
    const body = JSON.parse(String(fake.calls[0].init.body));
    assert.equal(body.model, "@cf/meta/llama-4-scout-17b-16e-instruct");
    assert.ok(!("reasoning_effort" in body), "gpt-oss's settings stay with gpt-oss");
    assert.deepEqual(body.messages[1].content, [{ type: "text", text: "The image is “sheet”." }, { type: "image_url", image_url: { url: image } }]);
  } finally {
    fake.restore();
  }
  assert.deepEqual(toAnthropic(asked, undefined).messages[0].content,
    [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } }, { type: "text", text: "The image is “sheet”." }]);
});

Deno.test("an own key reaches the customer's endpoint with that model's settings, and its refusals name the key", async () => {
  const done = `data: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [] } })}\n\n`;
  const fake = fakeFetch((url) => url.endsWith("/responses") ? new Response(done) : Response.json(reply));
  try {
    await complete([ownProvider({ provider: "openai", base_url: null, model: "gpt-x", key: "sk-1", effort: "medium" })], [], undefined);
    const openai = JSON.parse(fake.calls[0].init.body as string);
    assert.equal(fake.calls[0].url, "https://api.openai.com/v1/responses", "OpenAI itself answers through the Responses API");
    assert.deepEqual([openai.max_output_tokens, openai.reasoning, openai.store], [4000, { effort: "medium" }, false]);
    await complete([ownProvider({ provider: "openai", base_url: "https://api.mistral.ai/v1/", model: "m", key: "k-1", effort: "high" })], [], undefined);
    assert.equal(fake.calls[1].url, "https://api.mistral.ai/v1/chat/completions");
    const mistral = JSON.parse(fake.calls[1].init.body as string);
    assert.ok("max_tokens" in mistral && !("reasoning" in mistral), "other OpenAI-compatible hosts get no effort they may refuse");
    await complete([ownProvider({ provider: "openrouter", base_url: null, model: "m", key: "k", effort: "low" })], [], undefined);
    assert.deepEqual(JSON.parse(fake.calls[2].init.body as string).reasoning, { effort: "low" });
  } finally {
    fake.restore();
  }
  const refused = fakeFetch(() => new Response('{"error":{"message":"Incorrect API key"}}', { status: 401 }));
  try {
    await assert.rejects(complete([ownProvider({ provider: "openrouter", base_url: null, model: "m", key: "k" })], [], undefined), /refused the key/);
  } finally {
    refused.restore();
  }
});

Deno.test("Anthropic gets the system prompt apart and cacheable, tool results as user turns, and its reply reads like OpenAI's", () => {
  const messages: Message[] = [
    { role: "system", content: "Be brief." },
    { role: "user", content: "What's due?" },
    { role: "assistant", content: "", tool_calls: [{ id: "t1", type: "function", function: { name: "list_tasks", arguments: '{"due_by":null}' } },
      { id: "t2", type: "function", function: { name: "read_notes", arguments: '{"query":"tax"}' } }] },
    { role: "tool", tool_call_id: "t1", content: "- Pay rent" },
    { role: "tool", tool_call_id: "t2", content: "No notes." },
  ];
  const tools = [{ type: "function", function: { name: "read_notes", description: "Read.", parameters: { type: "object", properties: {} } } },
    { type: "function", function: { name: "list_tasks", description: "List.", parameters: { type: "object", properties: {} } } }];
  const request = toAnthropic(messages, tools);
  const cache = { type: "ephemeral" };
  assert.deepEqual(request.system, [{ type: "text", text: "Be brief.", cache_control: cache }]);
  assert.deepEqual(request.messages.map((turn) => turn.role), ["user", "assistant", "user"], "both tool results share one user turn");
  assert.deepEqual(request.messages[1].content[0], { type: "tool_use", id: "t1", name: "list_tasks", input: { due_by: null } });
  assert.deepEqual(request.tools, [{ name: "read_notes", description: "Read.", input_schema: { type: "object", properties: {} } },
    { name: "list_tasks", description: "List.", input_schema: { type: "object", properties: {} }, cache_control: cache }], "the cache reaches through the last tool");

  const completion = fromAnthropic({ stop_reason: "max_tokens", content: [{ type: "text", text: "Rent " }, { type: "tool_use", id: "u1", name: "complete_tasks", input: { tasks: ["Pay rent"] } }],
    usage: { input_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000, output_tokens: 9 } });
  assert.deepEqual(completion, { text: "Rent ", finish: "length", neurons: 0, usage: { input: 2050, output: 9, cached: 2000 },
    toolCalls: [{ id: "u1", type: "function", function: { name: "complete_tasks", arguments: '{"tasks":["Pay rent"]}' } }] }, "input counts what the cache served");
});

Deno.test("Claude thinks within its budget, and a turn that thought before a tool call goes back signed and whole (D82)", async () => {
  const thinking = { type: "thinking", thinking: "Rent first.", signature: "sig" };
  const call = { type: "tool_use", id: "u1", name: "list_tasks", input: {} };
  const fake = fakeFetch(() => Response.json({ stop_reason: "tool_use", content: [thinking, call], usage: { input_tokens: 5, output_tokens: 3 } }));
  try {
    const claude = ownProvider({ provider: "anthropic", base_url: null, model: "claude-x", key: "k", effort: "medium" });
    const completion = await complete([claude], [{ role: "user", content: "What's due?" }], undefined);
    const body = JSON.parse(fake.calls[0].init.body as string);
    assert.deepEqual([body.thinking, body.max_tokens], [{ type: "enabled", budget_tokens: 4000 }, 8000], "the budget rides on top of the answer's cap");
    assert.deepEqual(completion.replay, [thinking, call]);
    const next = toAnthropic([{ role: "user", content: "What's due?" },
      { role: "assistant", content: "", tool_calls: completion.toolCalls, replay: completion.replay },
      { role: "tool", tool_call_id: "u1", content: "- Pay rent" }], undefined);
    assert.deepEqual(next.messages[1].content, [thinking, call], "the thinking block comes back before its tool call");
    await complete([ownProvider({ provider: "anthropic", base_url: null, model: "claude-x", key: "k" })], [], undefined);
    assert.ok(!("thinking" in JSON.parse(fake.calls[1].init.body as string)), "Default asks no thinking");
  } finally {
    fake.restore();
  }
});
