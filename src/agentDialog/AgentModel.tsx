// Profile → Model (agents-design D44): which of the provider's models answers this agent, and how hard it thinks.
import { useState } from "react";
import type { ModelMenu } from "../atlas.ts";
import type { Agent } from "../model.ts";
import { RouterModelPicker } from "../OwnModelSettings.tsx";
import { effortLabels } from "../ownModel.ts";
import { useCatalogue, useModelState } from "../modelMenu.ts";
import type { ModelSource } from "../modelMenu.ts";
import type { Effort } from "../../supabase/functions/agent/responses.ts";
import { Tip } from "../Popups.tsx";

/**
 * Profile → Model (agents-design D44): a model of the provider in use instead of its default, and how hard it thinks,
 * for this agent's replies and routines. Empty means the default. One set for another provider stays saved and answers
 * again when it's back. OpenRouter gets Settings' searchable picker with prices; other providers a field that suggests
 * what they list. Thinking shows where the provider takes it.
 */
export function AgentModel({ name, value, effort, engine, onChange }: { name: string; value: Agent["model"]; effort: Agent["effort"]; engine?: ModelSource;
  onChange: (patch: Pick<Agent, "model" | "effort">) => void }) {
  const state = useModelState(engine);
  const menu = state.status === "ready" ? state.menu : null;
  // OpenRouter's picker lists its own catalogue; other providers suggest what they list.
  const models = useCatalogue(engine, state, !!menu && menu.source !== "openrouter")?.models ?? [];
  const [test, setTest] = useState<{ menu: ModelMenu; key: string; text: string; failed?: boolean } | null>(null);
  const here = !!menu && value?.source === menu.source;
  const id = here ? value!.id : "";
  const thinks = menu?.efforts ? effort : undefined;
  const who = name || "this agent";
  const pick = (typed: string) => {
    const clean = typed.replace(/[^\w.:/@+-]/g, "");
    onChange({ model: clean && menu ? { source: menu.source, id: clean } : undefined, effort });
  };
  // A result belongs to the menu it was asked of (one per provider load) as well as the model and effort it tried.
  const testKey = `${id}|${thinks ?? ""}`;
  const tested = test?.menu === menu && test.key === testKey ? test : null;
  const runTest = () => {
    if (!menu) return;
    setTest({ menu, key: testKey, text: "Testing…" });
    menu.test({ id: id || undefined, effort: thinks }).then(({ text, ms }) => setTest((current) => current?.menu === menu && current.key === testKey
      ? { ...current, text: `It answered in ${(ms / 1000).toFixed(1)} s${text ? `: “${text.slice(0, 40)}”` : ""}.` } : current),
      (cause: unknown) => setTest((current) => current?.menu === menu && current.key === testKey
        ? { ...current, text: cause instanceof Error ? cause.message : "The test failed.", failed: true } : current));
  };
  return (
    <details className="agent-section agent-rules agent-model" open={!!value || !!effort || undefined}>
      <summary>Model <small>{menu ? `${here ? id : `${menu.label} default`}${thinks ? ` · ${effortLabels[thinks]}` : ""}` : state.status === "loading" ? "Loading…" : state.status === "error" ? "Unavailable" : "the default"}</small></summary>
      {state.status === "loading" && <p className="agent-hint" role="status">Loading the current provider's model…</p>}
      {state.status === "error" && <p className="field-error" role="alert">{state.message}{" "}
        <button type="button" className="text-button" onClick={engine?.models.reload}>Retry</button></p>}
      {menu ? <>
        {menu.source === "openrouter" ? <RouterModelPicker value={id} fallback={menu.current} onChange={pick} /> : <>
          <input list="agent-models" aria-label="Model" maxLength={200} spellCheck={false} autoComplete="off" value={id}
            placeholder={`Default: ${menu.current}`} onChange={(event) => pick(event.target.value)} />
          <datalist id="agent-models">{models.slice(0, 500).map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>
        </>}
        {menu.efforts && <div className="agent-model-effort">
          <span>Thinking</span>
          <div className="segmented-control" role="group" aria-label="Thinking">
            <Tip label={`The account's setting: ${menu.efforts.current ? effortLabels[menu.efforts.current] : "the model's own"}`}><button type="button" aria-pressed={!effort} onClick={() => onChange({ model: value, effort: undefined })}>Default</button></Tip>
            {(Object.keys(effortLabels) as Effort[]).map((level) => (
              <button type="button" key={level} aria-pressed={effort === level} onClick={() => onChange({ model: value, effort: level })}>{effortLabels[level]}</button>
            ))}
          </div>
        </div>}
        <p className="agent-hint">Replies and routines from {who} use these. Empty keeps {menu.label}'s default, {menu.current}{menu.efforts ? ", and Default its Thinking setting" : ""}.</p>
        {(id || thinks) && <p className="agent-model-test">
          <button type="button" className="secondary-button" disabled={tested?.text === "Testing…"} onClick={runTest}>Test</button>
          {tested && <span className={tested.failed ? "field-error" : "agent-hint"} role="status">{tested.text}</span>}
        </p>}
      </> : state.status === "ready" && <p className="agent-hint">One model answers every agent here. Connect your own provider in Settings → AI model to give {who} a model of their own.</p>}
      {value && !here && state.status === "ready" && <p className="agent-hint">Set to {value.id} for another provider, so the default answers here.{" "}
        <button type="button" className="text-button" onClick={() => onChange({ model: undefined, effort })}>Clear it</button></p>}
    </details>
  );
}
