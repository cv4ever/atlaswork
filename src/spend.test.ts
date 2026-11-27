import test from "node:test";
import assert from "node:assert/strict";
import { spendByAgent } from "./spend.ts";
import type { ChatMessage, Usage } from "./model.ts";
import { normalize } from "./workspace.ts";

const base = normalize(null).data;
const data = { ...base, agents: [...base.agents, { ...base.agents[0], id: "kin", name: "Kin" }] };
const reply = (agentId: string | undefined, at: string, usage?: Usage): ChatMessage =>
  ({ id: crypto.randomUUID(), role: "agent", text: "ok", at, ...agentId ? { agentId } : {}, ...usage ? { usage } : {} });
const openrouter = (id: string) => ({ source: "openrouter", id });
const prices = { source: "openrouter", byModel: { "cheap/model": { input: 1, output: 2 }, "strong/model": { input: 10, output: 30 } } };

test("spend counts each agent's measured replies in the window and prices only models the provider in use lists", () => {
  const threads = [{ id: "agent:atlas", read: 0, attachedNoteId: null, messages: [
    reply(undefined, "2026-11-09T10:00:00Z", { input: 1_000_000, output: 100_000, model: openrouter("strong/model") }),
    // The same id from another catalogue isn't OpenRouter's price.
    reply("atlas", "2026-11-09T11:00:00Z", { input: 1_000, output: 100, model: { source: "openai", id: "strong/model" } }),
    reply("atlas", "2026-11-09T12:00:00Z", { input: 500, output: 50 }),
    reply("atlas", "2026-10-01T12:00:00Z", { input: 9_000_000, output: 9_000_000, model: openrouter("strong/model") }),
    reply("atlas", "2026-11-09T13:00:00Z"),
    { id: "u", role: "user" as const, text: "hi", at: "2026-11-09T09:00:00Z" },
  ] }, { id: "agent:kin", read: 0, attachedNoteId: null, messages: [
    reply("kin", "2026-11-09T10:00:00Z", { input: 2_000_000, output: 0, model: openrouter("cheap/model") }),
    reply("kin", "2026-11-09T10:05:00Z", { input: 1_000, output: 0, model: openrouter("unlisted/model") }),
  ] }];
  const rows = spendByAgent({ ...data, threads }, "2026-11-01T00:00:00Z", prices);
  assert.deepEqual(rows.map((row) => [row.agent.id, row.replies, row.input, row.output, row.priced]),
    [["kin", 2, 2_001_000, 0, 1], ["atlas", 3, 1_001_500, 100_150, 1]], "most tokens first; out-of-window and unmeasured replies are left out");
  assert.equal(rows[0].cost, 2);
  assert.equal(rows[1].cost, 10 + 3, "a million in at $10 and 100k out at $30 per million");
  assert.deepEqual(spendByAgent({ ...data, threads }, "2026-11-01T00:00:00Z").map((row) => row.priced), [0, 0], "without prices nothing is priced");
});
