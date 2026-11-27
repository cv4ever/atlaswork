// Settings → AI model's first card: who every agent answers through now (Atlaswork's model, your own provider with its
// model and thinking, or a model on this device), what that costs, and Retry when the provider couldn't load.
import { PlugZap, Sparkles } from "lucide-react";
import type { ModelState, Provider } from "../atlas.ts";
import { effortLabels, providerLabels } from "../ownModel.ts";

export function AnswerStatus({ state, answering, hosted, signedIn, onRetry }: {
  state: ModelState;
  /** The provider answering now, or the one that answered until a reload began. */
  answering: Provider | undefined;
  /** Atlaswork's own model is the one in use. */
  hosted: boolean;
  signedIn: boolean;
  onRetry: () => void;
}) {
  const status = answering?.own ?? null;
  const label = !answering ? state.status === "error" ? "Couldn't load your provider" : "Loading…"
    : hosted ? (signedIn ? "Atlaswork's hosted model" : "No model yet") : answering.using === "device" ? answering.device!
    : `${status!.model}${status!.effort ? ` · ${effortLabels[status!.effort]}` : ""} through ${providerLabels[status!.provider]}`
      + (status!.base_url ? ` (${new URL(status!.base_url).host})` : "");
  const note = !answering ? null : hosted ? (signedIn
    ? "Atlaswork's model is invite-only for now. Pick your own provider below to answer on any plan, billed by that provider."
    : "Signed out, nothing answers your agents yet. Sign in to connect your own provider, or pick one on this device below.")
    : answering.using === "device" ? `On this device only${status ? `; your account's ${providerLabels[status.provider]} key stays saved for other devices` : ""}.`
    : `Key ${status!.hint}. Works on any plan; your provider bills you.`;
  return (
    <section className="settings-group" aria-labelledby="own-model-status">
      <h4 id="own-model-status">Agents answer through</h4>
      <div className="settings-card account-card" aria-busy={state.status === "loading" || undefined}>
        <span className="account-orb" data-on={!hosted || undefined} aria-hidden="true">{!hosted ? <PlugZap size={18} /> : <Sparkles size={18} />}</span>
        <div>
          <strong>{label}</strong>
          {state.status === "error" ? <p className="field-error" role="alert">{state.message}{" "}
            <button type="button" className="text-button" onClick={onRetry}>Retry</button></p>
            : note && <p>{note}</p>}
        </div>
      </div>
    </section>
  );
}
