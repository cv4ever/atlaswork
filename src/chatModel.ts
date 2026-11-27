// A model and thinking for one chat (agents-design D82): the choice the message box makes, stored on the Thread per
// agent, over the agent's own (D44). Plus how a model id reads in the box: its vendor, a short name, a price class.
import type { Effort } from "../supabase/functions/agent/responses.ts";
import type { Agent, Thread } from "./model.ts";

/**
 * What one agent answers on in one chat. Absent fields follow the agent; null picks the provider's default model or
 * the account's Thinking even when the agent has its own.
 */
export type ChatModel = { model?: Agent["model"] | null; effort?: Effort | null };

/** This chat's choice for `agentId`, if it made one. */
export const chatModelOf = (thread: Pick<Thread, "models">, agentId: string): ChatModel | undefined => thread.models?.[agentId];

/** `agent` as it answers in `thread`: this chat's model and thinking over its own. */
export function inChat(agent: Agent, thread: Pick<Thread, "models">): Agent {
  const choice = chatModelOf(thread, agent.id);
  if (!choice) return agent;
  const { model: _model, effort: _effort, ...rest } = agent;
  const model = choice.model === undefined ? agent.model : choice.model ?? undefined;
  const effort = choice.effort === undefined ? agent.effort : choice.effort ?? undefined;
  return { ...rest, ...model ? { model } : {}, ...effort ? { effort } : {} };
}

/**
 * Sets this chat's choice for `agentId`, dropping what matches the agent's own, so a chat that picks the agent's usual
 * again carries no choice of its own.
 */
export function withChatModel(thread: Thread, agent: Agent, choice: ChatModel): Thread {
  const merged = { ...chatModelOf(thread, agent.id), ...choice };
  const sameModel = (merged.model ?? undefined)?.id === agent.model?.id && (merged.model ?? undefined)?.source === agent.model?.source;
  const kept: ChatModel = { ...merged.model !== undefined && !sameModel ? { model: merged.model } : {},
    ...merged.effort !== undefined && (merged.effort ?? undefined) !== agent.effort ? { effort: merged.effort } : {} };
  const { [agent.id]: _old, ...others } = thread.models ?? {};
  const models = Object.keys(kept).length ? { ...others, [agent.id]: kept } : others;
  const { models: _models, ...rest } = thread;
  return Object.keys(models).length ? { ...rest, models } : rest;
}

/**
 * The models replies used lately across every chat, newest first and each once, for the picker's Recent row (D82).
 * Reads only what replies recorded (`Usage.model`, D45); pass the menu's `source` so another provider's never show.
 */
export function recentModels(threads: readonly Pick<Thread, "messages">[], source: string, limit = 4): string[] {
  const used: { id: string; at: string }[] = [];
  for (const thread of threads)
    for (const message of thread.messages)
      if (message.role === "agent" && message.usage?.model?.source === source) used.push({ id: message.usage.model.id, at: message.at ?? "" });
  used.sort((a, b) => b.at.localeCompare(a.at));
  return [...new Set(used.map((item) => item.id))].slice(0, limit);
}

/** The marks the box draws: the vendors whose models people pick most, and everything else. */
export type Vendor = "claude" | "openai" | "gemini" | "deepseek" | "mistral" | "meta" | "other";
export const vendorNames: Record<Vendor, string> = { claude: "Claude", openai: "OpenAI", gemini: "Gemini", deepseek: "DeepSeek", mistral: "Mistral", meta: "Llama", other: "Other" };

/** Who makes a model, from its id in any catalogue: OpenRouter's "anthropic/claude-…", a key's "claude-…", the plan's "gpt-5.1-codex". */
export function vendorOf(id: string): Vendor {
  const plain = id.toLowerCase();
  if (/(^|\/)(anthropic|claude)/.test(plain)) return "claude";
  if (/(^|\/)(openai|gpt|o\d|chatgpt|codex)/.test(plain)) return "openai";
  if (/(^|\/)(google|gemini|gemma)/.test(plain)) return "gemini";
  if (/(^|\/)deepseek/.test(plain)) return "deepseek";
  if (/(^|\/)(mistral|mistralai|codestral|ministral|magistral|devstral)/.test(plain)) return "mistral";
  if (/(^|\/)(meta|llama)/.test(plain)) return "meta";
  return "other";
}

/**
 * A model's name as the box shows it: the catalogue's name without its "Vendor: " prefix, else the id made readable
 * ("anthropic/claude-sonnet-4.5" → "Claude Sonnet 4.5", "gpt-5.1-codex" → "GPT-5.1 Codex"), dropping a date suffix.
 */
export function modelName(id: string, name?: string) {
  if (name && name !== id) return name.replace(/^[^:]{1,30}:\s*/, "");
  const words = (id.split("/").pop() ?? id).replace(/[-_]\d{8}$/, "").replace(/:.*$/, "").split(/[-_]/).filter(Boolean);
  const out: string[] = [];
  for (const word of words) {
    const last = out.length - 1;
    if (/^gpt$/i.test(word)) out.push("GPT");
    else if (/^\d/.test(word) && out[last] === "GPT") out[last] = `GPT-${word}`;
    else if (/^\d/.test(word) && last >= 0 && /^\d+$/.test(out[last]) && /^\d+$/.test(word) && word.length === 1) out[last] = `${out[last]}.${word}`;
    else out.push(/^\d/.test(word) || /^o\d/.test(word) ? word : word[0].toUpperCase() + word.slice(1));
  }
  return out.join(" ") || id;
}

/** How dear a model is next to others, from its price per million tokens in and out: 0 free, then 1 to 3. */
export function priceClass(price: { input: number; output: number }) {
  const sum = price.input + price.output;
  return sum === 0 ? 0 : sum < 8 ? 1 : sum <= 20 ? 2 : 3;
}
