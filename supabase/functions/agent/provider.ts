// The model call, shared by the function (index.ts) and the dev comparison script (dev/compare/). No Deno APIs here.
import { AgentError } from "./logic.ts";
import type { Completion, Message, ToolCall } from "./logic.ts";
import { completeOnResponses } from "./responses.ts";
import type { Effort } from "./responses.ts";

/**
 * A chat endpoint: OpenAI-compatible unless `anthropic`, or OpenAI's Responses API when `responses`. `complete` tries
 * the next one when a provider answers HTTP 429. `own` marks the customer's own key (launch plan D16): its refusals
 * name the key, and it costs no Neurons.
 */
export type Provider = {
  name: string; url: string; key: string; model: string; neurons: (usage: ChatUsage) => number;
  anthropic?: boolean; own?: boolean; responses?: boolean;
  /** Sends `x-session-affinity`, so one person's calls with one agent reach the instance holding their cached prefix (Workers AI). */
  affinity?: boolean;
  /** Fields only some models accept, such as `reasoning_effort` for gpt-oss. */
  extra?: Record<string, unknown>;
  maxTokens: number;
  /** OpenAI's newer models refuse `max_tokens`. */
  tokenField?: "max_tokens" | "max_completion_tokens";
  /** How hard a reasoning model thinks (Responses only; the others carry it in `extra`). */
  effort?: Effort;
  /** How long a call may take; ours default to 20 s, a customer's own to 60 s. */
  timeoutMs?: number;
};
type ChatUsage = { prompt_tokens?: number; completion_tokens?: number; neurons?: number; prompt_tokens_details?: { cached_tokens?: number } };
const gptOss = { extra: { reasoning_effort: "low" }, maxTokens: 900 };
export const workersAi = (key: string): Provider => ({
  name: "workers-ai",
  url: "https://api.cloudflare.com/client/v4/accounts/a1f804d4855fa8c081645b27965f8500/ai/v1/chat/completions",
  key,
  model: "@cf/openai/gpt-oss-120b",
  // Workers AI reports `usage.neurons`; the fallback prices tokens at the pricing page's Neurons per million.
  neurons: (usage) => usage.neurons ?? ((usage.prompt_tokens ?? 0) * 31_818 + (usage.completion_tokens ?? 0) * 68_182) / 1e6,
  // Workers AI caches prompt prefixes per model instance (developers.cloudflare.com/workers-ai/features/prompt-caching).
  affinity: true,
  ...gptOss,
});
/**
 * The smaller gpt-oss on Workers AI ($0.20 and $0.30 per million tokens in and out, against $0.35 and $0.75), measured
 * for routines and simple agents with dev/compare before anything routes to it (agents-design D67).
 */
export const workersAiSmall = (key: string): Provider => ({
  ...workersAi(key), name: "workers-ai:20b", model: "@cf/openai/gpt-oss-20b",
  neurons: (usage) => usage.neurons ?? ((usage.prompt_tokens ?? 0) * 18_182 + (usage.completion_tokens ?? 0) * 27_273) / 1e6,
});
/** Groq's free tier (launch plan D6): the same model, its own organization-wide limits, no Neurons. */
export const groq = (key: string): Provider => ({
  name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key, model: "openai/gpt-oss-120b", neurons: () => 0, ...gptOss,
});
/**
 * The model that looks at images for our plan (agents-design D58): Llama 4 Scout on Workers AI, which gpt-oss can't do.
 * A 768px worksheet took 5 s and 34 Neurons on 2026-11-17; a large screenshot up to a minute, so it gets longer.
 */
export const workersAiVision = (key: string): Provider => ({
  ...workersAi(key), name: "workers-ai:vision", model: "@cf/meta/llama-4-scout-17b-16e-instruct", extra: undefined, maxTokens: 700, timeoutMs: 60_000,
  neurons: (usage) => usage.neurons ?? ((usage.prompt_tokens ?? 0) * 24_545 + (usage.completion_tokens ?? 0) * 77_273) / 1e6,
});

/** What a customer connected in Settings → AI model (`public.model_keys`). `effort` null leaves the model's default. */
export type OwnModel = { provider: "openrouter" | "openai" | "anthropic"; base_url: string | null; model: string; key: string; effort?: Effort | null };
/**
 * Reasoning models spend part of the cap thinking, and the customer pays, so their cap is roomier than ours. OpenAI
 * itself answers through the Responses API, which OpenAI recommends for its reasoning models; other OpenAI-compatible
 * hosts keep Chat Completions. OpenRouter takes the effort in its unified `reasoning` field; Anthropic as a thinking
 * budget (`thinkingBudget`) on top of the answer's cap.
 */
export function ownProvider({ provider, base_url, model, key, effort }: OwnModel): Provider {
  const shared = { key, model, own: true, neurons: () => 0, maxTokens: 4_000 };
  if (provider === "anthropic") return { ...shared, name: "own:anthropic", url: "https://api.anthropic.com/v1/messages", anthropic: true,
    ...effort ? { effort, maxTokens: shared.maxTokens + thinkingBudget[effort] } : {} };
  if (provider === "openrouter") return { ...shared, name: "own:openrouter", url: "https://openrouter.ai/api/v1/chat/completions",
    ...effort ? { extra: { reasoning: { effort } } } : {} };
  const base = (base_url ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  if (new URL(base).hostname === "api.openai.com") return { ...shared, name: "own:openai", url: `${base}/responses`, responses: true, effort: effort ?? undefined };
  return { ...shared, name: "own:openai", url: `${base}/chat/completions`, tokenField: "max_tokens" };
}

/** Claude's extended thinking per Thinking level, in tokens (agents-design D82); Anthropic's floor is 1024. */
export const thinkingBudget: Record<Effort, number> = { low: 1_024, medium: 4_000, high: 12_000 };

/**
 * The catalogue a model id belongs to: the provider, plus the host for an OpenAI-compatible address other than
 * OpenAI's own. An agent's own model (`Snapshot.model`) applies only while the account's model comes from the same one.
 */
export function sourceOf({ provider, base_url }: Pick<OwnModel, "provider" | "base_url">): string {
  if (provider !== "openai") return provider;
  const host = new URL(base_url ?? "https://api.openai.com/v1").hostname;
  return host === "api.openai.com" ? "openai" : `openai:${host}`;
}

/** A model the customer's key may use, for the picker in Settings → AI model. */
export type ListedModel = { id: string; name: string };
/** Chat models only: OpenAI's catalogue also lists audio, image, embedding and moderation models. */
const notChat = /audio|realtime|tts|transcribe|image|embedding|moderation|search|dall-e|whisper/;
/** The models a stored key reaches, newest first; OpenRouter's public catalogue needs no key, so it isn't here. */
export async function ownModels({ provider, base_url, key }: OwnModel): Promise<ListedModel[]> {
  const anthropic = provider === "anthropic";
  const base = anthropic ? "https://api.anthropic.com/v1" : provider === "openrouter" ? "https://openrouter.ai/api/v1" : (base_url ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/models${anthropic ? "?limit=100" : ""}`, {
    headers: anthropic ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new AgentError(response.status === 401 || response.status === 403 ? "Your AI provider refused the key. Check it in Settings → AI model." : "Your AI provider didn't list its models.");
  const { data = [] } = await response.json() as { data?: { id: string; display_name?: string; name?: string; created?: number; created_at?: string }[] };
  const openAi = new URL(base).hostname === "api.openai.com";
  const age = (model: (typeof data)[number]) => model.created ?? (Date.parse(model.created_at ?? "") / 1000 || 0);
  return data.filter((model) => !openAi || /^(gpt|o\d|chatgpt)/.test(model.id) && !notChat.test(model.id))
    .sort((a, b) => age(b) - age(a))
    .map((model) => ({ id: model.id, name: model.display_name ?? model.name ?? model.id }));
}

const busy = "The AI service is busy.";

/**
 * A stable, opaque id for one person's calls with one agent: the prefix-cache routing key (`Provider.affinity`). It's
 * a hash, so the provider never sees the account id.
 */
export async function sessionOf(user: string, agent: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${user}\n${agent}`)));
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * One model call on the first provider that isn't rate-limited. When every one is, it waits `pause` and goes round once
 * more, inside the reply already admitted, so a moment's rush costs no second reply from the day's cap (seen twice in a
 * row on 2026-11-18). Any other failure ends the call.
 */
export async function complete(providers: Provider[], messages: Message[], tools: unknown[] | undefined, session?: string, pause = 2500): Promise<Completion> {
  if (!providers.length) throw new AgentError("No AI service is configured.");
  for (let round = 0; ; round++) {
    for (const [index, provider] of providers.entries()) {
      try {
        return { ...await completeOn(provider, messages, tools, session), model: provider.model };
      } catch (cause) {
        if (!(cause instanceof AgentError && cause.message === busy)) throw cause;
        if (index === providers.length - 1 && round === 1) throw cause;
      }
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, pause);
    await promise;
  }
}

type ToolDef = { function: { name: string; description: string; parameters: unknown } };
/** Marks where Anthropic may cache the prompt up to (tools, then system); reads of it cost a tenth of input. */
const cached = { cache_control: { type: "ephemeral" } };
/**
 * OpenAI-style messages and tools as Anthropic's Messages API wants them: system apart, tool results as user turns.
 * The tools and the system prompt are cache breakpoints: within a reply's rounds both repeat, across replies the tools.
 */
export function toAnthropic(messages: Message[], tools: unknown[] | undefined) {
  const turns: { role: "user" | "assistant"; content: unknown[] }[] = [];
  const push = (role: "user" | "assistant", blocks: unknown[]) => {
    const last = turns.at(-1);
    if (last?.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
  };
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") push("user", [...message.image ? [imageBlock(message.image)] : [], { type: "text", text: message.content }]);
    if (message.role === "tool") push("user", [{ type: "tool_result", tool_use_id: message.tool_call_id, content: message.content }]);
    // A turn that thought (Claude's extended thinking) goes back verbatim, signed thinking blocks first, as Anthropic
    // requires before a tool result; others are rebuilt from text and calls.
    if (message.role === "assistant") push("assistant", message.replay ?? [
      ...message.content ? [{ type: "text", text: message.content }] : [],
      ...(message.tool_calls ?? []).map((call) => ({ type: "tool_use", id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) })),
    ]);
  }
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const defs = (tools as ToolDef[] | undefined)?.map(({ function: f }) => ({ name: f.name, description: f.description, input_schema: f.parameters }));
  return { ...system ? { system: [{ type: "text", text: system, ...cached }] } : {}, messages: turns,
    ...defs?.length ? { tools: defs.map((def, index) => index === defs.length - 1 ? { ...def, ...cached } : def) } : {} };
}
const parseArgs = (text: string) => { try { return JSON.parse(text || "{}"); } catch { return {}; } };
/** A data URL as an Anthropic image block. */
const imageBlock = (image: string) => {
  const [, type, data] = /^data:(image\/\w+);base64,(.*)$/s.exec(image) ?? [];
  return { type: "image", source: { type: "base64", media_type: type, data } };
};
/**
 * Anthropic's reply in the loop's terms; a reply cut at the cap reads as "length", like OpenAI's. Its `input_tokens`
 * leaves out what was written to or read from the cache, so `input` adds them back: every token the call read.
 */
export function fromAnthropic(result: { content?: { type: string; text?: string; id?: string; name?: string; input?: unknown }[]; stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } }): Completion {
  const blocks = result.content ?? [];
  const toolCalls: ToolCall[] = blocks.filter((block) => block.type === "tool_use")
    .map((block) => ({ id: block.id!, type: "function", function: { name: block.name!, arguments: JSON.stringify(block.input ?? {}) } }));
  const usage = result.usage ?? {};
  const thought = blocks.some((block) => block.type === "thinking" || block.type === "redacted_thinking");
  return { text: blocks.filter((block) => block.type === "text").map((block) => block.text).join(""), toolCalls,
    finish: result.stop_reason === "max_tokens" ? "length" : result.stop_reason ?? "", neurons: 0,
    usage: { input: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0), output: usage.output_tokens ?? 0,
      cached: usage.cache_read_input_tokens ?? 0 },
    ...thought && toolCalls.length ? { replay: blocks } : {} };
}

async function completeOn(provider: Provider, messages: Message[], tools: unknown[] | undefined, session?: string): Promise<Completion> {
  if (provider.responses)
    return completeOnResponses({ url: provider.url, key: provider.key, model: provider.model, effort: provider.effort, plan: false, maxTokens: provider.maxTokens }, messages, tools);
  const started = Date.now();
  // `replay` belongs to the Responses adapter; Chat Completions hosts refuse fields they don't know.
  const chat = messages.map((message) => message.role === "assistant" ? { role: message.role, content: message.content, ...message.tool_calls ? { tool_calls: message.tool_calls } : {} }
    : message.role === "user" && message.image ? { role: "user", content: [{ type: "text", text: message.content }, { type: "image_url", image_url: { url: message.image } }] } : message);
  const body = provider.anthropic
    ? { model: provider.model, max_tokens: provider.maxTokens, ...provider.effort ? { thinking: { type: "enabled", budget_tokens: thinkingBudget[provider.effort] } } : {},
      ...toAnthropic(messages, tools) }
    : { model: provider.model, messages: chat, [provider.tokenField ?? "max_tokens"]: provider.maxTokens, ...provider.extra, ...tools ? { tools } : {} };
  const headers: Record<string, string> = provider.anthropic
    ? { "x-api-key": provider.key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
    : { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json", ...provider.own ? { "X-Title": "Atlaswork" } : {},
      ...provider.affinity && session ? { "x-session-affinity": session } : {} };
  let response: Response;
  try {
    response = await fetch(provider.url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(provider.timeoutMs ?? (provider.own ? 60_000 : 20_000)) });
  } catch (cause) {
    console.warn(`${provider.name}: ${cause instanceof DOMException && cause.name === "TimeoutError" ? "timed out" : "unreachable"} after ${Date.now() - started} ms`);
    throw new AgentError("The AI service didn't answer in time.");
  }
  if (!response.ok) {
    console.warn(`${provider.name}: HTTP ${response.status} after ${Date.now() - started} ms`);
    // The customer's provider says why; it's their account, so show it (trimmed). Ours stays generic.
    const detail = provider.own ? ((await response.text().catch(() => "")).match(/"message"\s*:\s*"([^"]{1,200})/)?.[1] ?? "") : (await response.body?.cancel(), "");
    if (response.status === 429) throw new AgentError(busy);
    if (provider.own && [401, 403].includes(response.status)) throw new AgentError("Your AI provider refused the key. Check it in Settings → AI model.");
    if (provider.own && response.status === 402) throw new AgentError("Your AI provider account is out of credit.");
    throw new AgentError(provider.own && detail ? `Your AI provider said: ${detail}` : "The AI service failed.");
  }
  const result = await response.json();
  if (provider.anthropic) return fromAnthropic(result);
  const choice = result.choices?.[0];
  const usage: ChatUsage = result.usage ?? {};
  return { text: choice?.message?.content ?? "", toolCalls: choice?.message?.tool_calls ?? [], finish: choice?.finish_reason ?? "",
    neurons: provider.neurons(usage), usage: { input: usage.prompt_tokens ?? 0, output: usage.completion_tokens ?? 0, cached: usage.prompt_tokens_details?.cached_tokens ?? 0 } };
}
