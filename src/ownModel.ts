import type { Effort } from "../supabase/functions/agent/responses.ts";
import { sourceOf } from "../supabase/functions/agent/provider.ts";
import type { AgentAdapter, ModelMenu } from "./atlas.ts";
import { account } from "./account.ts";
import { countUsage } from "./usage.ts";

/**
 * The customer's own AI model (launch plan D16): an OpenRouter account connected by sign-in, or an API key. The key
 * goes to the server once (`set_model_key`, encrypted in Supabase Vault) and never comes back; the app only sees a hint.
 * The UI saves, removes and tests it through the engine (`accountModel`), so every reader of the model state follows.
 */
export type OwnProvider = "openrouter" | "openai" | "anthropic";
export const effortLabels: Record<Effort, string> = { low: "Fast", medium: "Balanced", high: "Thorough" };
export type OwnModelStatus = { provider: OwnProvider; base_url: string | null; model: string; hint: string; effort?: Effort | null } | null;
export const providerLabels: Record<OwnProvider, string> = { openrouter: "OpenRouter", openai: "OpenAI-compatible API", anthropic: "Anthropic API" };
/** A cheap model that follows the agent prompts well (the one our hosted agents use). */
export const openRouterDefault = "openai/gpt-oss-120b";
/** What Settings saves: a null key keeps the stored one while the provider stays the same. */
export type OwnChoice = { provider: OwnProvider; model: string; key: string | null; baseUrl: string | null; effort: Effort | null };

const ownModelStatus = async () => (await account!.rpc("model_key_status", {})) as OwnModelStatus;
const saveOwnModel = ({ provider, model, key, baseUrl, effort }: OwnChoice) =>
  account!.rpc("set_model_key", { p_provider: provider, p_base_url: baseUrl, p_model: model, p_key: key, p_effort: effort });
const removeOwnModel = () => account!.rpc("clear_model_key", {});

/** "Test" in Settings, or in an agent's Profile with its own model and effort: one tiny call through the agent service. Rejects with the reason. */
async function testOwnModel(choice: { model?: { source: string; id: string }; effort?: Effort } = {}): Promise<{ text: string; ms: number }> {
  const response = await account!.agent(JSON.stringify({ test: true, ...choice }));
  const result = await response.json().catch(() => ({})) as { text?: string; ms?: number; error?: string };
  if (!response.ok || typeof result.text !== "string") throw new Error(result.error ?? "The test failed.");
  return { text: result.text, ms: result.ms ?? 0 };
}

/** A model a key reaches, for the model picker. */
export type ListedModel = { id: string; name: string };
/** The models the stored key reaches, asked through the agent service (the key never comes back to the browser). */
export async function storedKeyModels(): Promise<ListedModel[]> {
  const response = await account!.agent('{"models":true}');
  const result = await response.json().catch(() => []) as ListedModel[] | { error?: string };
  if (!response.ok || !Array.isArray(result)) throw new Error(!Array.isArray(result) && result.error || "Your provider didn't list its models.");
  return result;
}
/** OpenAI's catalogue also lists audio, image, embedding and moderation models. */
const notChat = /audio|realtime|tts|transcribe|image|embedding|moderation|search|dall-e|whisper/;
/**
 * The models a key just typed reaches, asked from this browser before it's saved (both providers allow it; Anthropic
 * once told this is a browser). Empty when the provider refuses or can't be reached: the id can still be typed.
 */
export async function typedKeyModels(provider: "openai" | "anthropic", baseUrl: string, key: string): Promise<ListedModel[]> {
  const anthropic = provider === "anthropic";
  const base = anthropic ? "https://api.anthropic.com/v1" : baseUrl.replace(/\/+$/, "");
  try {
    const response = await fetch(`${base}/models${anthropic ? "?limit=100" : ""}`, { headers: anthropic
      ? { "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" } : { Authorization: `Bearer ${key}` } });
    if (!response.ok) return [];
    const { data = [] } = await response.json() as { data?: { id: string; display_name?: string; created?: number; created_at?: string }[] };
    const openAi = new URL(base).hostname === "api.openai.com";
    const age = (model: (typeof data)[number]) => model.created ?? (Date.parse(model.created_at ?? "") / 1000 || 0);
    return data.filter((model) => !openAi || /^(gpt|o\d|chatgpt)/.test(model.id) && !notChat.test(model.id))
      .sort((a, b) => age(b) - age(a)).map((model) => ({ id: model.id, name: model.display_name ?? model.id }));
  } catch {
    return [];
  }
}

/** An OpenRouter model the agents can use: it must call tools. Prices are dollars per million tokens. */
export type RouterModel = { id: string; name: string; free: boolean; input: number; output: number };
let routerModels: Promise<RouterModel[]> | undefined;
/** OpenRouter's public catalogue, filtered to models that call tools; fetched once per page load. */
export function openRouterModels(): Promise<RouterModel[]> {
  return routerModels ??= fetch("https://openrouter.ai/api/v1/models").then((response) => response.json())
    .then(({ data }: { data: { id: string; name: string; pricing?: { prompt?: string; completion?: string }; supported_parameters?: string[] }[] }) => data
      .filter((model) => model.supported_parameters?.includes("tools"))
      .map((model) => {
        const input = Number(model.pricing?.prompt ?? 0) * 1e6, output = Number(model.pricing?.completion ?? 0) * 1e6;
        return { id: model.id, name: model.name, free: input === 0 && output === 0, input, output };
      })
      .sort((a, b) => a.name.localeCompare(b.name)))
    .catch(() => { routerModels = undefined; return []; });
}

/**
 * The signed-in account's part of the engine (agents-design D44): who answers (its own provider, else Atlaswork's
 * hosted model) and the menu an agent's Profile offers, or null on the hosted model, which is one model. A key whose
 * provider won't list models lists none; an id can still be typed. Thinking applies on OpenRouter, OpenAI's own API
 * and Anthropic's (as extended thinking, D82), as in Settings. Saving, removing and testing go through the engine,
 * which reloads what readers see.
 */
export const accountModel: Required<Pick<AgentAdapter, "load" | "own">> = {
  async load() {
    const status = await ownModelStatus();
    if (!status) return { provider: { using: "hosted", own: null }, menu: null };
    const source = sourceOf(status);
    const menu: ModelMenu = { source, label: providerLabels[status.provider], current: status.model,
      ...source === "openrouter" || source === "openai" || source === "anthropic" ? { efforts: { current: status.effort ?? null } } : {},
      list: async () => (status.provider === "openrouter" ? await openRouterModels() : await storedKeyModels().catch(() => [])).map(({ id, name }) => ({ id, name })),
      // Only OpenRouter's catalogue lists prices; OpenAI's and Anthropic's model lists don't.
      ...status.provider === "openrouter" ? { prices: async () => Object.fromEntries((await openRouterModels()).map(({ id, input, output }) => [id, { input, output }])) } : {},
      test: ({ id, effort }) => testOwnModel({ ...id ? { model: { source, id } } : {}, ...effort ? { effort } : {} }) };
    return { provider: { using: "own", own: status }, menu };
  },
  own: { save: saveOwnModel, remove: removeOwnModel, test: () => testOwnModel() },
};

const verifierKey = "atlaswork.openrouter-verifier";
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** OpenRouter's OAuth PKCE: off to openrouter.ai, back here with `?code=`, which `finishOpenRouter` trades for a key. */
export async function connectOpenRouter() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem(verifierKey, JSON.stringify({ verifier, state }));
  // OpenRouter drops the callback's own query, so the return is recognised by its `code` and `state` instead.
  const back = `${location.origin}${location.pathname}`;
  location.assign(`https://openrouter.ai/auth?callback_url=${encodeURIComponent(back)}&code_challenge=${challenge}&code_challenge_method=S256&state=${state}&key_label=Atlaswork`);
}

/** Runs at startup: finishes an OpenRouter sign-in that just came back, and cleans the URL. */
export async function finishOpenRouter(): Promise<string | undefined> {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const returned = url.searchParams.get("state");
  const pending = JSON.parse(sessionStorage.getItem(verifierKey) ?? "null") as { verifier: string; state: string } | null;
  if (!code || !pending) return;
  for (const param of ["code", "state"]) url.searchParams.delete(param);
  history.replaceState(null, "", url);
  sessionStorage.removeItem(verifierKey);
  // A code without the state this tab sent didn't start here: ignore it.
  if (returned !== pending.state) return "OpenRouter didn't finish connecting. Try again from Settings → AI model.";
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: pending.verifier, code_challenge_method: "S256" }),
    });
    const { key } = await response.json() as { key?: string };
    if (!response.ok || !key) return "OpenRouter refused the connection. Try again from Settings → AI model.";
    await saveOwnModel({ provider: "openrouter", model: openRouterDefault, key, baseUrl: null, effort: null });
    countUsage("own_model_connected");
  } catch {
    return "Couldn't finish connecting OpenRouter. Try again from Settings → AI model.";
  }
}
