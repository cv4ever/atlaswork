// Settings → AI model and OpenRouter's model picker; its status card and small parts are src/modelSettings/.
import { useEffect, useMemo, useState } from "react";
import { CircleCheck, ExternalLink, KeyRound, Link2, PlugZap, Unlink } from "lucide-react";
import type { Effort } from "../supabase/functions/agent/responses.ts";
import type { LocalModel } from "./atlas.ts";
import { useApp } from "./appContext.ts";
import { useModelState } from "./modelMenu.ts";
import { countUsage } from "./usage.ts";
import { connectOpenRouter, openRouterDefault, openRouterModels, providerLabels, storedKeyModels, typedKeyModels } from "./ownModel.ts";
import type { ListedModel, OwnProvider, RouterModel } from "./ownModel.ts";
import { AnswerStatus } from "./modelSettings/AnswerStatus.tsx";
import { HostedChoice, ThinkingPicker } from "./modelSettings/parts.tsx";

/** Filled in when the model field is empty: OpenRouter's cheap default; the others take the first model their key lists. */
const modelDefaults: Record<OwnProvider, string> = { openai: "", anthropic: "", openrouter: openRouterDefault };
const price = (model: RouterModel) => model.free ? (/\bfree\b/i.test(model.name) ? "" : " · free") : ` · $${model.input.toFixed(2)} in, $${model.output.toFixed(2)} out per million tokens`;

/**
 * OpenRouter's catalogue, narrowed to models that can call tools, with a free-only switch and a search box. With
 * `fallback` (an agent's Profile, D44) a model is optional: the first row keeps that default and `onChange("")` picks it.
 */
export function RouterModelPicker({ value, onChange, fallback }: { value: string; onChange: (id: string) => void; fallback?: string }) {
  const [models, setModels] = useState<RouterModel[]>();
  const [freeOnly, setFreeOnly] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => { void openRouterModels().then(setModels); }, []);
  const shown = useMemo(() => {
    const words = search.trim().toLowerCase();
    return (models ?? []).filter((model) => (!freeOnly || model.free) && (!words || `${model.name} ${model.id}`.toLowerCase().includes(words)));
  }, [models, freeOnly, search]);
  const current = models?.find((model) => model.id === value);
  // The list couldn't load (offline, or OpenRouter changed): the id can still be typed.
  if (models && !models.length) return <label className="setting-row"><strong>Model</strong>
    <input required={fallback === undefined} value={value} onChange={(event) => onChange(event.target.value)}
      placeholder={fallback === undefined ? "e.g. openai/gpt-oss-120b" : `Default: ${fallback}`} /></label>;
  return (
    <div className="own-model-picker">
      <div className="setting-row"><strong>Model</strong>
        <input type="search" aria-label="Find a model" placeholder={models ? `Search ${models.length} models` : "Loading models…"}
          value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <label className="own-model-free"><input type="checkbox" checked={freeOnly} onChange={(event) => setFreeOnly(event.target.checked)} />
        Free models only <small>(slower, rate-limited, and the provider may keep prompts)</small></label>
      <select aria-label="Model" size={8} required={fallback === undefined} value={shown.some((model) => model.id === value) || (fallback !== undefined && !value) ? value : ""}
        onChange={(event) => onChange(event.target.value)}>
        {fallback !== undefined && <option value="">Default: {models?.find((model) => model.id === fallback)?.name ?? fallback}</option>}
        {shown.slice(0, 300).map((model) => <option key={model.id} value={model.id}>{model.name}{price(model)}</option>)}
      </select>
      <p className="own-model-hint">{current ? <>Chosen: <strong>{current.name}</strong>{price(current)}.</> : value ? <>Chosen: <code>{value}</code>.</>
        : fallback !== undefined ? <>The default, <code>{fallback}</code>.</> : "Pick a model."} Only models that can use the agents' tools are listed.</p>
    </div>
  );
}

export type ModelChoice = "hosted" | OwnProvider | "local";
type Choice = ModelChoice;

/**
 * Settings → AI model (launch plan D16): the provider every agent answers through, picked from one row. Atlaswork's
 * hosted model (Pro or the trial), the account's own provider (OpenRouter by sign-in or key, an OpenAI-compatible
 * key, an Anthropic key; on any plan, billed by that provider), or the engine's device-local model when it has one
 * (the dev ChatGPT bridge). Each choice opens its own setup; the one in use changes only once that setup succeeds.
 * Keys are write-only: afterwards only their last four characters show. Who answers comes from the engine's model
 * state, and saving goes through the engine, so an agent's Model and the chat's Details follow at once.
 * The first run's Ready step (agents-design D48) picks the provider on its own cards and mounts this per pick
 * (`initial`, keyed by it) to show only that provider's setup: no status card, no Provider row. It saves its picks in
 * `onLeave` before OpenRouter's sign-in leaves the page.
 */
export function OwnModelSection({ signedIn, localModel, initial, onLeave }: { signedIn: boolean; localModel?: LocalModel;
  initial?: ModelChoice; onLeave?: () => void }) {
  const { engine } = useApp();
  const state = useModelState(engine);
  // While the engine reloads, the provider that answered until now stays on screen, dimmed, and its actions wait.
  const answering = state.status === "ready" ? state.provider : state.status === "loading" ? state.last : undefined;
  const settling = state.status === "loading";
  const status = answering?.own ?? null;
  const localOn = answering?.using === "device" && answering.device === localModel?.label;
  // Unknown on a first load; a device model other than this one (the browser checks' echo) has no choice in the row.
  const inUse: Choice | undefined = !answering ? undefined : answering.using === "device" ? localOn ? "local" : undefined
    : answering.using === "own" && status ? status.provider : "hosted";
  // Mounted for one pick (Ready), it starts as `pick(initial)` would leave it: that provider's form open unless it's the one saved.
  const isOwn = (value?: Choice): value is OwnProvider => !!value && value !== "hosted" && value !== "local";
  const [choice, setChoice] = useState<Choice | undefined>(initial);
  const shown = choice ?? inUse ?? "hosted";
  const [editing, setEditing] = useState(() => isOwn(initial) && status?.provider !== initial);
  const [baseUrl, setBaseUrl] = useState(() => status?.base_url ?? "https://api.openai.com/v1");
  const [model, setModel] = useState(() => isOwn(initial) ? status?.provider === initial ? status.model : modelDefaults[initial] : "");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState("");
  const [effort, setEffort] = useState<Effort | null>(() => isOwn(initial) && status?.provider === initial ? status.effort ?? null : null);
  // The models the key reaches, for the model field's suggestions; empty until listed (the id can always be typed).
  const [listed, setListed] = useState<ListedModel[]>([]);

  /** Switching the device model reloads the model state, so only an actual change does. */
  const switchLocal = (on: boolean) => { if (localModel && localModel.active() !== on) localModel.setActive(on); };
  async function runTest() {
    setTested("");
    setError("");
    try {
      const { text, ms } = await engine.own!.test();
      setTested(`It answered in ${(ms / 1000).toFixed(1)} s${text ? `: “${text.slice(0, 40)}”` : ""}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The test failed.");
    }
  }
  async function act(work: () => Promise<unknown>, thenTest = false) {
    setBusy(true);
    setError("");
    setTested("");
    try {
      await work();
      setEditing(false);
      setKey("");
      if (thenTest) await runTest();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  /** Lists what the key reaches and fills an empty model field with the newest. */
  const list = (models: Promise<ListedModel[]>) => void models.then((found) => {
    setListed(found);
    setModel((current) => current || found[0]?.id || "");
  }, () => setListed([]));
  const openForm = (next: OwnProvider) => {
    setEditing(true);
    setListed([]);
    if (next !== "openrouter" && status?.provider === next) list(storedKeyModels());
  };
  const pick = (next: Choice) => {
    setChoice(next);
    setTested("");
    setError("");
    setEditing(false);
    const own = next !== "hosted" && next !== "local";
    if (own) {
      setModel(status?.provider === next ? status.model : modelDefaults[next]);
      setBaseUrl(status?.base_url ?? "https://api.openai.com/v1");
      setEffort(status?.provider === next ? status.effort ?? null : null);
      if (status?.provider !== next) openForm(next);
    }
  };
  const provider = shown === "hosted" || shown === "local" ? undefined : shown;
  // The stored key carries over while the provider stays the same; another provider needs its own key.
  const keepsKey = !!status && status.provider === provider && !key;
  const choices: [Choice, string][] = [["hosted", "Atlaswork"], ["openrouter", "OpenRouter"], ["openai", "OpenAI API"], ["anthropic", "Anthropic API"],
    ...localModel ? [["local", localModel.label] as [Choice, string]] : []];

  return (
    <div className="own-model">
      {!initial && <AnswerStatus state={state} answering={answering} hosted={inUse === "hosted"} signedIn={signedIn} onRetry={engine.models.reload} />}
      <section className="settings-group" aria-labelledby={initial ? undefined : "own-model-provider"} aria-label={initial ? `${providerLabels[initial as OwnProvider] ?? localModel?.label ?? "Atlaswork"} setup` : undefined}>
        {!initial && <>
          <h4 id="own-model-provider">Provider</h4>
          <div className="segmented-control own-model-choices" role="radiogroup" aria-labelledby="own-model-provider">
            {choices.map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={shown === value} onClick={() => pick(value)}>
                {label}{value === inUse && (value !== "hosted" || signedIn) && <CircleCheck size={14} aria-label="in use" />}
              </button>
            ))}
          </div>
        </>}

        {shown === "hosted" && <HostedChoice signedIn={signedIn} inUse={inUse === "hosted"} status={status} disabled={busy || settling}
          onUse={() => void act(async () => {
            switchLocal(false);
            if (status) await engine.own!.remove();
          })} />}

        {shown === "local" && localModel && <>
          <localModel.Setup onUse={() => switchLocal(true)} />
          {localOn && <div className="settings-actions">
            <button className="secondary-button" onClick={() => switchLocal(false)}><Unlink size={16} />Stop using {localModel.label}</button>
          </div>}
        </>}

        {provider && !signedIn && <p className="own-model-note">Sign in first: your key is stored with your account.</p>}
        {provider && signedIn && !editing && status?.provider === provider && <div className="settings-actions own-model-actions">
          {inUse !== provider && <button className="primary-button" disabled={busy || settling} onClick={() => switchLocal(false)}><CircleCheck size={16} />Use {providerLabels[provider]}</button>}
          <button className="secondary-button" disabled={busy || settling} onClick={() => void act(async () => undefined, true)}><PlugZap size={16} />Test</button>
          <button className="secondary-button" disabled={busy || settling} onClick={() => openForm(provider)}><KeyRound size={16} />Change model or key</button>
          <button className="secondary-button" disabled={busy || settling} onClick={() => void act(() => engine.own!.remove())}><Unlink size={16} />Disconnect</button>
        </div>}
        {provider === "openrouter" && signedIn && status?.provider === "openrouter" && !editing && <p className="settings-note">
          <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer"><ExternalLink size={12} /> Keys and spending on OpenRouter</a></p>}
        {provider && signedIn && editing && <form className="settings-card own-model-form" onSubmit={(event) => {
          event.preventDefault();
          void act(async () => {
            await engine.own!.save({ provider, model: model.trim(), key: key.trim() || null, baseUrl: provider === "openai" ? baseUrl.trim() : null, effort });
            if (!keepsKey) countUsage("own_model_connected");
            switchLocal(false);
          }, true);
        }}>
          {provider === "openrouter" && !keepsKey && <div className="settings-actions">
            <button type="button" className="primary-button" disabled={busy} onClick={() => { switchLocal(false); onLeave?.(); void connectOpenRouter(); }}><Link2 size={16} />Connect OpenRouter</button>
            <span className="own-model-note">One click, lets you cap spending, has free models. Or paste a key below.</span>
          </div>}
          {provider === "openai" && <label className="setting-row"><strong>Address</strong>
            <input type="url" required value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" /></label>}
          {provider === "openrouter" ? <RouterModelPicker value={model} onChange={setModel} />
            : <label className="setting-row"><strong>Model</strong>
              <input required value={model} list="own-model-options" onChange={(event) => setModel(event.target.value)}
                placeholder={listed.length ? "Pick or type a model" : provider === "anthropic" ? "a Claude model id" : "a model id"} />
              <datalist id="own-model-options">{listed.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</datalist></label>}
          <label className="setting-row"><strong>API key</strong>
            <input type="password" autoComplete="off" required={!keepsKey} value={key} onChange={(event) => setKey(event.target.value)}
              onBlur={() => { if (key.trim() && provider !== "openrouter") list(typedKeyModels(provider, baseUrl, key.trim())); }}
              placeholder={keepsKey ? `Keep ${status!.hint}` : provider === "openrouter" ? "Paste an OpenRouter key (sk-or-…)" : "Paste your key"} /></label>
          <ThinkingPicker value={effort} onChange={setEffort} />
          {provider === "openai" && <p className="own-model-note">An API key bills your OpenAI API account per token. A ChatGPT subscription isn't an API key.</p>}
          <div className="settings-actions">
            <button className="primary-button" disabled={busy || !model.trim()}>Save and test</button>
            {status?.provider === provider && <button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>}
        {busy && <p className="own-model-note" role="status">Working…</p>}
        {tested && <p className="own-model-note own-model-ok" role="status"><CircleCheck size={14} /> {tested}</p>}
        {error && <p className="field-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
