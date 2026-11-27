// Ready's model part (agents-design D48): who answers your agents, as cards to pick from.
import { useState } from "react";
import type { ReactNode } from "react";
import { CircleCheck, KeyRound, Link2, MessageCircle, Sparkles, Unplug } from "lucide-react";
import { auth } from "../account.ts";
import { trialDaysLeft, untilReset, useStanding } from "../allowance.ts";
import { useApp, useView } from "../appContext.ts";
import { useModelState } from "../modelMenu.ts";
import { OwnModelSection } from "../OwnModelSettings.tsx";
import { caps } from "../../supabase/functions/agent/caps.ts";
import { countUsage } from "../usage.ts";
import { Tip } from "../Popups.tsx";

/** Where Ready's model row sends you: Settings → AI model, or Account to sign in first. */
export type ModelTab = "model" | "account";

/** The ways to answer Ready offers, one card each; `key` covers both an OpenAI-compatible and an Anthropic key. */
type Way = "hosted" | "openrouter" | "key" | "local";
const trialDays = 14;

/**
 * Ready's model part (agents-design D48): who answers the agents, as cards you pick from, the one in use ticked.
 * Atlaswork's model leads on the trial with its days left as a trail and its limits as plain facts; OpenRouter (one
 * click), an API key and, on the dev server, the ChatGPT plan bridge open Settings' own setup under the cards
 * (`OwnModelSection` mounted for that pick), and `onLeave` keeps the picks while OpenRouter's sign-in leaves the page.
 * Without anything that could answer here (signed out, or a provider that can't load), one line says what's wrong and
 * its action finishes the first run and opens Settings where that's fixed.
 */
export function ReadyModel({ onModel, onLeave }: { onModel: (tab: ModelTab) => void; onLeave: () => void }) {
  const { engine, signedIn } = useApp();
  const now = useView((view) => view.now);
  const state = useModelState(engine);
  const answering = state.status === "ready" ? state.provider : state.status === "loading" ? state.last : undefined;
  // Atlaswork's model only answers a signed-in account, or the dev server's `?as=trial` preview.
  const hosted = answering?.using === "hosted";
  const standing = useStanding(signedIn || hosted);
  const { localModel } = engine;
  const own = answering?.using === "own" ? answering.own : null;
  const inUse: Way | undefined = !answering ? undefined : hosted ? "hosted" : own ? own.provider === "openrouter" ? "openrouter" : "key"
    : answering.using === "device" && answering.device === localModel?.label ? "local" : undefined;
  const [chosen, setChosen] = useState<Way>();
  const days = standing?.plan === "trial" ? trialDaysLeft(standing.trialEndsAt, now) : 0;
  const plan = standing?.plan === "pro" ? "pro" : days > 0 ? "trial" : standing ? "none" : "unknown";
  // Atlaswork's model is invite-only (launch plan D12), so an account without it starts on OpenRouter's card.
  const shown = chosen ?? (inUse === "hosted" && plan === "none" ? "openrouter" : inUse) ?? "hosted";
  const [keyKind, setKeyKind] = useState<"openai" | "anthropic">(own?.provider === "anthropic" ? "anthropic" : "openai");
  const go = (tab: ModelTab) => { countUsage("onboarding_model"); onModel(tab); };
  // Nothing on this device can pick a provider: say what's missing, and go where it's fixed.
  if (!answering || (!signedIn && !hosted && !localModel)) {
    const failed = state.status === "error";
    const action = failed ? { label: "Open AI model", tab: "model" as const } : answering && auth ? { label: "Sign in", tab: "account" as const } : undefined;
    return (
      <div className="ready-model-note" data-needed={failed || !!answering || undefined}>
        <Unplug size={18} aria-hidden="true" />
        <p>{failed ? <><strong>Your AI model isn't answering.</strong> {state.status === "error" && state.message}</>
          : !answering ? "Checking which AI model answers…"
          : auth ? <><strong>No AI model yet.</strong> Sign in to connect your own.</>
          : <><strong>No AI model yet.</strong> Agents wait until one is connected.</>}</p>
        {action && <Tip label="Opens your workspace, then Settings"><button type="button" className="secondary-button" onClick={() => go(action.tab)}>{action.label}</button></Tip>}
      </div>
    );
  }
  const ways: { way: Way; icon: ReactNode; title: string; line: string; disabled?: boolean }[] = [
    { way: "hosted", icon: <Sparkles size={18} />, title: "Atlaswork",
      line: plan === "pro" ? "Included with Pro" : plan === "trial" ? `Free for ${days} more ${days === 1 ? "day" : "days"}` : "Invite only" },
    { way: "openrouter", icon: <Link2 size={18} />, title: "OpenRouter", line: "1 click · free and paid models" },
    { way: "key", icon: <KeyRound size={18} />, title: "API key", line: "OpenAI-compatible or Anthropic" },
    localModel ? { way: "local", icon: <MessageCircle size={18} />, title: "ChatGPT", line: `Your ${localModel.label} · this device only` }
      : { way: "local", icon: <MessageCircle size={18} />, title: "ChatGPT", line: "Your plan, once OpenAI approves Atlaswork", disabled: true },
  ];
  const resets = untilReset(new Date(now));
  return (
    <section className="settings-group ready-model" aria-labelledby="ready-model-title">
      <h4 id="ready-model-title">Who answers your agents</h4>
      <div className="model-picks" role="radiogroup" aria-labelledby="ready-model-title">
        {ways.map(({ way, icon, title, line, disabled }) => (
          <button key={way} type="button" role="radio" className="model-pick" aria-checked={shown === way} disabled={disabled}
            onClick={() => setChosen(way)}>
            <span className="model-pick-copy"><strong><span className="model-pick-icon" aria-hidden="true">{icon}</span>{title}</strong><small>{disabled ? `Coming soon · ${line}` : line}</small></span>
            {way === inUse && <span className="model-pick-use"><CircleCheck size={14} aria-hidden="true" />In use</span>}
          </button>
        ))}
      </div>
      {shown === "hosted" ? (
        <div className="model-detail">
          {plan === "trial" && <div className="trial-trail" role="meter" aria-label="Trial days left" aria-valuemin={0} aria-valuemax={trialDays} aria-valuenow={days}>
            <span aria-hidden="true">{Array.from({ length: trialDays }, (_, index) => <i key={index} data-left={index >= trialDays - days || undefined} />)}</span>
            <small>{days} of {trialDays} days left</small>
          </div>}
          <dl className="model-facts">
            <div><dt>Replies</dt><dd>{caps.replies} a day, all agents together, routines included</dd></div>
            <div><dt>Resets</dt><dd>00:00 UTC, {resets}</dd></div>
            <div><dt>Model</dt><dd>One for every agent, no choice of model or thinking</dd></div>
            <div><dt>{plan === "pro" ? "Plan" : "Afterwards"}</dt><dd>{plan === "pro" ? "Pro" : "Invite only for now; a model of your own works on any plan"}</dd></div>
          </dl>
        </div>
      ) : (
        <div className="model-detail">
          {shown === "key" && <div className="segmented-control" role="radiogroup" aria-label="Key from">
            {(["openai", "anthropic"] as const).map((kind) => <button key={kind} type="button" role="radio" aria-checked={keyKind === kind}
              onClick={() => setKeyKind(kind)}>{kind === "openai" ? "OpenAI-compatible" : "Anthropic"}</button>)}
          </div>}
          {shown !== "local" && <p className="model-facts-line">Up to {caps.ownReplies} replies a day, any model it offers. Your provider bills you.</p>}
          <OwnModelSection key={shown === "key" ? keyKind : shown} signedIn={signedIn} localModel={localModel}
            initial={shown === "key" ? keyKind : shown === "openrouter" ? "openrouter" : "local"}
            onLeave={() => { countUsage("onboarding_model"); onLeave(); }} />
        </div>
      )}
    </section>
  );
}
