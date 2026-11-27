import assert from "node:assert/strict";
import { test } from "node:test";
import { modelName, recentModels, vendorOf } from "./chatModel.ts";

test("model ids from every catalogue read as names under their maker's mark (D82)", () => {
  const read = (id: string, name?: string) => [vendorOf(id), modelName(id, name)];
  assert.deepEqual(read("anthropic/claude-sonnet-4.5", "Anthropic: Claude Sonnet 4.5"), ["claude", "Claude Sonnet 4.5"]);
  assert.deepEqual(read("claude-sonnet-4-5-20250929"), ["claude", "Claude Sonnet 4.5"]);
  assert.deepEqual(read("gpt-5.1-codex"), ["openai", "GPT-5.1 Codex"]);
  assert.deepEqual(read("openai/gpt-4o-mini"), ["openai", "GPT-4o Mini"]);
  assert.deepEqual(read("o4-mini"), ["openai", "o4 Mini"]);
  assert.deepEqual(read("google/gemini-2.5-flash"), ["gemini", "Gemini 2.5 Flash"]);
  assert.deepEqual(read("deepseek/deepseek-chat-v3.1:free"), ["deepseek", "Deepseek Chat V3.1"]);
  assert.deepEqual(read("mistralai/mistral-medium-3.1"), ["mistral", "Mistral Medium 3.1"]);
  assert.deepEqual(read("meta-llama/llama-3.3-70b-instruct"), ["meta", "Llama 3.3 70b Instruct"]);
  assert.deepEqual(read("echo-small"), ["other", "Echo Small"]);
});

test("Recent lists the models replies used on this provider, newest first and each once (D82)", () => {
  const reply = (id: string, at: string, source = "openrouter") => ({ id: at, role: "agent" as const, text: "", at, usage: { input: 1, output: 1, model: { source, id } } });
  const threads = [
    { messages: [reply("a/old", "2026-11-20T09:00:00Z"), reply("b/new", "2026-11-23T09:00:00Z"), { id: "u", role: "user" as const, text: "hi" }] },
    { messages: [reply("a/old", "2026-11-22T09:00:00Z"), reply("other", "2026-11-23T10:00:00Z", "anthropic"), reply("c/mid", "2026-11-21T09:00:00Z")] },
  ];
  assert.deepEqual(recentModels(threads, "openrouter"), ["b/new", "a/old", "c/mid"]);
  assert.deepEqual(recentModels(threads, "openrouter", 2), ["b/new", "a/old"]);
});
