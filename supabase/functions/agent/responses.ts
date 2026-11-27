// OpenAI's Responses API in the agent loop's terms: an OpenAI API key (provider.ts) and ChatGPT plan usage through
// Sign in with ChatGPT (https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), which today
// only the dev server's bridge calls (dev/chatgpt/); once OpenAI approves Atlaswork the function can too (launch plan
// D16). Nothing is stored at OpenAI (`store: false`), so each call sends the whole history, and the model's encrypted
// reasoning from earlier tool rounds goes back with it. No Deno APIs here.
import { AgentError } from "./logic.ts";
import type { Completion, Message, ToolCall } from "./logic.ts";

export const responsesUrl = "https://api.openai.com/v1/responses";
/** How hard a reasoning model thinks before answering: Fast, Balanced, Thorough in Settings → AI model. */
export type Effort = "low" | "medium" | "high";
export const efforts: Effort[] = ["low", "medium", "high"];
/**
 * Where a call goes. `plan` is a ChatGPT plan token: the plan route takes neither `max_output_tokens` nor `temperature`.
 * An API key gets `maxTokens` as its output cap.
 */
export type ResponsesTarget = { url?: string; key: string; model: string; effort?: Effort; plan: boolean; maxTokens?: number };
/** The plan route takes function tools only grouped in a namespace (preview limitations); API keys accept it too. */
const namespace = "atlaswork";
type ToolDef = { function: { name: string; description: string; parameters: unknown } };
type Item = { type: string; role?: string; content?: { type: string; text?: string }[]; call_id?: string; name?: string; namespace?: string; arguments?: string };
type Result = {
  status?: string; output?: Item[]; incomplete_details?: { reason?: string } | null; error?: { code?: string; message?: string } | null;
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
};

/**
 * The loop's chat messages as a Responses request: system text as `instructions` (the plan route refuses system
 * items), the whole history in `input`, tools in one namespace, not strict (optional arguments). An assistant turn this
 * adapter produced goes back as its own output items (`replay`), encrypted reasoning included.
 */
export function toResponses(messages: Message[], tools: unknown[] | undefined) {
  const input: unknown[] = [];
  for (const message of messages) {
    if (message.role === "user") input.push({ role: "user", content: message.image
      ? [{ type: "input_text", text: message.content }, { type: "input_image", image_url: message.image }] : message.content });
    if (message.role === "assistant" && message.replay) input.push(...message.replay);
    else if (message.role === "assistant") {
      if (message.content) input.push({ role: "assistant", content: message.content });
      for (const call of message.tool_calls ?? [])
        input.push({ type: "function_call", call_id: call.id, namespace, name: call.function.name, arguments: call.function.arguments });
    }
    if (message.role === "tool") input.push({ type: "function_call_output", call_id: message.tool_call_id, output: message.content });
  }
  const instructions = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  return { ...instructions ? { instructions } : {}, input,
    ...tools?.length ? { tools: [{ type: "namespace", name: namespace, description: "Atlaswork: read the person's notes and tasks, and propose changes.",
      tools: (tools as ToolDef[]).map(({ function: f }) => ({ type: "function", name: f.name, description: f.description, parameters: f.parameters, strict: false })) }] } : {} };
}

/** A finished response as a completion; a reply cut at a limit reads as "length", like Chat Completions. */
export function fromResponses(result: Result): Completion {
  const output = result.output ?? [];
  const toolCalls: ToolCall[] = output.filter((item) => item.type === "function_call").map((item) => ({
    id: item.call_id!, type: "function",
    function: { name: item.name!.startsWith(`${namespace}.`) ? item.name!.slice(namespace.length + 1) : item.name!, arguments: item.arguments ?? "{}" },
  }));
  const text = output.filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("");
  // Unstored items can't be referenced by id (OpenAI answers "Item not found" when store is false), so ids stay behind.
  return { text, toolCalls, finish: result.status === "incomplete" ? "length" : "stop", neurons: 0,
    replay: output.map(({ id: _id, ...item }: Item & { id?: string }) => item),
    usage: { input: result.usage?.input_tokens ?? 0, output: result.usage?.output_tokens ?? 0, cached: result.usage?.input_tokens_details?.cached_tokens ?? 0 } };
}

const manage = "Check it at chatgpt.com/settings/usage.";
/** The plan route's documented error codes (errors-and-recovery) as what to do; unknown ones quote OpenAI. */
export function planError(status: number, code: string | undefined, message: string | undefined): AgentError {
  if (code === "subscription_sharing_usage_limit_exceeded" || status === 429) return new AgentError(`You've reached your ChatGPT plan's usage limit for Atlaswork. ${manage}`);
  if (code === "subscription_sharing_user_not_eligible") return new AgentError("This ChatGPT account's plan can't be used in other apps (it needs Plus or Pro).");
  if (code === "subscription_sharing_invalid_user" || status === 401) return new AgentError("ChatGPT no longer accepts this sign-in. Continue with ChatGPT again in Settings → AI model.");
  if (status === 503 || code === "subscription_sharing_usage_unavailable" || code === "subscription_sharing_user_unavailable") return new AgentError("ChatGPT is unavailable right now.");
  return new AgentError(`ChatGPT said: ${(message || code || `HTTP ${status}`).slice(0, 200)}`);
}
/** An OpenAI API key's refusals, in the words the other own-model providers use (provider.ts). */
function keyError(status: number, code: string | undefined, message: string | undefined): AgentError {
  if (status === 401 || status === 403) return new AgentError("Your AI provider refused the key. Check it in Settings → AI model.");
  if (/insufficient_quota|credit_balance/.test(code ?? "") || status === 402) return new AgentError("Your AI provider account is out of credit.");
  if (status === 429) return new AgentError("Your AI provider is rate-limiting this key. Try again in a moment.");
  return new AgentError(message ? `Your AI provider said: ${message.slice(0, 200)}` : "The AI service failed.");
}

/**
 * Server-sent events as parsed `data:` payloads. An `error` event carries its details in `error` (older streams put
 * them at the top); `response.output_item.done` carries one finished output item in `item`.
 */
async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<{ type?: string; response?: Result; item?: Item; code?: string; message?: string; error?: { code?: string; message?: string } }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffer += decoder.decode(chunk.value, { stream: true });
    let end: number;
    while ((end = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const data = buffer.slice(0, end).split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, "");
      if (data && data !== "[DONE]") yield JSON.parse(data);
    }
  }
}

/**
 * One model call, streamed (the plan route accepts nothing else) and never stored. Only `response.completed` (or
 * `incomplete`) counts as done. Its `output` can come back empty while the items streamed one by one (the plan route
 * did from 2026-11-17 whenever tools were offered), so the streamed items stand in for it then. A model without
 * reasoning refuses `reasoning` and `include`; the call is then repeated once without them.
 */
export async function completeOnResponses(target: ResponsesTarget, messages: Message[], tools: unknown[] | undefined, signal?: AbortSignal): Promise<Completion> {
  const fail = target.plan ? planError : keyError;
  const call = async (reasoning: boolean): Promise<Completion> => {
    let response: Response;
    try {
      response = await fetch(target.url ?? responsesUrl, {
        method: "POST", headers: { Authorization: `Bearer ${target.key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ model: target.model, ...toResponses(messages, tools), store: false, stream: true,
          ...reasoning ? { reasoning: { effort: target.effort ?? "low" }, include: ["reasoning.encrypted_content"] } : {},
          ...!target.plan && target.maxTokens ? { max_output_tokens: target.maxTokens } : {} }),
        signal: AbortSignal.any([AbortSignal.timeout(90_000), ...signal ? [signal] : []]),
      });
    } catch {
      throw new AgentError(target.plan ? "ChatGPT didn't answer in time." : "The AI service didn't answer in time.");
    }
    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      let parsed: { error?: { code?: string; message?: string; param?: string }; detail?: string } = {};
      try { parsed = JSON.parse(body); } catch { /* a plain-text refusal */ }
      if (reasoning && response.status === 400 && /^(reasoning|include)/.test(parsed.error?.param ?? "")) return call(false);
      throw fail(response.status, parsed.error?.code, parsed.error?.message ?? parsed.detail);
    }
    try {
      const streamed: Item[] = [];
      for await (const event of events(response.body)) {
        if (event.type === "response.output_item.done" && event.item) streamed.push(event.item);
        if (event.type === "response.completed" || event.type === "response.incomplete")
          return fromResponses({ ...event.response, output: event.response?.output?.length ? event.response.output : streamed });
        if (event.type === "response.failed") throw fail(0, event.response?.error?.code ?? undefined, event.response?.error?.message ?? undefined);
        if (event.type === "error") throw fail(0, event.error?.code ?? event.code, event.error?.message ?? event.message);
      }
    } catch (cause) {
      if (cause instanceof AgentError) throw cause;
    }
    throw new AgentError("The connection dropped before the reply finished.");
  };
  return call(true);
}
