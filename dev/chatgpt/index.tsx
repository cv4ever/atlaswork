// Dev builds only: src/main.tsx loads this behind `import.meta.env.DEV`, so production bundles never contain it.
import { useEffect, useState } from "react";
import { CircleCheck, ExternalLink, LogOut, PlugZap } from "lucide-react";
import { limits } from "../../supabase/functions/agent/logic.ts";
import type { AgentAdapter, EngineInfo } from "../../src/atlas.ts";
import { createLiveEngine } from "../../src/live.ts";
import { effortLabels } from "../../src/ownModel.ts";
import { efforts } from "../../supabase/functions/agent/responses.ts";
import type { ChatGptStatus } from "./oauth.ts";
import type { PlanModel } from "./server.ts";
import { auth } from "../../src/account.ts";

/** This device's choice: "on" while agents answer on the ChatGPT plan. */
export const choiceKey = "workbench.dev.chatgpt";
const usage = "https://chatgpt.com/settings/usage";
const planInfo: EngineInfo = { badge: "ChatGPT plan", maxRequest: limits.request, manage: { label: "Manage usage", href: usage } };
type Call = (route: string, body?: string, headers?: Record<string, string>) => Promise<Response>;

async function json<T>(call: Call, route: string, body?: string): Promise<T> {
  const response = await call(route, body);
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "The ChatGPT bridge failed.");
  return result;
}

/** Settings → AI model → ChatGPT plan: Continue with ChatGPT, the account's models, Test, Use, Sign out. */
function ChatGptSetup({ call, active, onUse, onChange }: { call: Call; active: boolean; onUse: () => void; onChange: () => void }) {
  const [status, setStatus] = useState<ChatGptStatus>();
  const [models, setModels] = useState<PlanModel[]>([]);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const ready = !!status?.connected && status.plan;

  useEffect(() => { void json<ChatGptStatus>(call, "status").then(setStatus, (cause: Error) => setError(cause.message)); }, [call]);
  useEffect(() => {
    if (ready) void json<PlanModel[]>(call, "models").then(setModels, (cause: Error) => setError(cause.message));
  }, [call, ready]);
  // While the ChatGPT tab is open, look every 2 s for the sign-in to land, for up to 5 minutes.
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 300_000) { setWaiting(false); return; }
      void json<ChatGptStatus>(call, "status").then((next) => { if (next.connected) { setStatus(next); setWaiting(false); onChange(); } }, () => undefined);
    }, 2_000);
    return () => clearInterval(timer);
  }, [call, waiting, onChange]);

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNote("");
    try { await work(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That didn't work. Try again."); }
    finally { setBusy(false); }
  }
  const connect = () => act(async () => {
    const { url } = await json<{ url: string }>(call, "login");
    window.open(url, "_blank", "noopener");
    setWaiting(true);
  });
  const test = () => act(async () => {
    const { text, ms, model } = await json<{ text: string; ms: number; model: string }>(call, "agent", '{"test":true}');
    setNote(`${model} answered in ${(ms / 1000).toFixed(1)} s${text ? `: “${text.slice(0, 40)}”` : ""}.`);
  });
  const choose = async (choice: { model?: string; effort?: string }) => {
    setStatus(await json<ChatGptStatus>(call, "model", JSON.stringify(choice)));
    onChange();
  };
  const model = status?.model ?? models[0]?.slug ?? "";

  if (!status) return error ? <p className="field-error" role="alert">{error}</p> : null;
  return (
    <div className="settings-card own-model-form">
      {ready ? <>
        <p className="own-model-note">Signed in to ChatGPT as {status.email ?? "your account"}. Replies count toward your plan's usage.
          {" "}<a href={usage} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Manage usage</a></p>
        {!status.welcomed && <div className="own-model-note" role="status">
          <strong>You're using your ChatGPT plan</strong>
          <p>Agent replies on this computer use your ChatGPT plan, not Atlaswork's model. You can see and limit that usage in ChatGPT settings.</p>
          <button type="button" className="secondary-button" onClick={() => void act(async () => { await json(call, "welcome"); setStatus({ ...status, welcomed: true }); })}>Got it</button>
        </div>}
        <label className="setting-row"><strong>Model</strong>
          <select value={model} disabled={!models.length || busy}
            onChange={(event) => void act(() => choose({ model: event.target.value }))}>
            {!models.length && <option value="">Loading models…</option>}
            {models.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
          </select></label>
        <div className="setting-row"><strong>Thinking</strong>
          <div className="segmented-control" role="radiogroup" aria-label="Thinking">
            {efforts.map((value) => (
              <button key={value} type="button" role="radio" aria-checked={(status.effort ?? "low") === value} disabled={busy}
                onClick={() => void act(() => choose({ effort: value }))}>{effortLabels[value]}</button>
            ))}
          </div></div>
        <div className="settings-actions">
          {!active && <button type="button" className="primary-button" disabled={busy} onClick={onUse}><CircleCheck size={16} />Use ChatGPT plan</button>}
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void test()}><PlugZap size={16} />Test</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={() => void act(async () => {
            const { revoked } = await json<{ revoked: boolean }>(call, "logout");
            onChange();
            setStatus(await json<ChatGptStatus>(call, "status"));
            if (!revoked) setNote("Signed out here. OpenAI didn't confirm it, so also disconnect Atlaswork in ChatGPT settings → Apps.");
          })}><LogOut size={16} />Sign out</button>
        </div>
      </> : <>
        <p className="own-model-note">{status.connected
          ? `Signed in as ${status.email ?? "your account"}, but ChatGPT plan use wasn't allowed. Continue again and allow it.`
          : "Agents answer on your ChatGPT Plus or Pro plan, through this computer. OpenAI counts the replies in your plan's usage; nothing is billed here."}</p>
        <div className="settings-actions">
          <button type="button" className="primary-button" disabled={busy || waiting} onClick={() => void connect()}>Continue with ChatGPT</button>
        </div>
        {waiting && <p className="own-model-note" role="status">Finish signing in in the ChatGPT tab…</p>}
      </>}
      {busy && <p className="own-model-note" role="status">Working…</p>}
      {note && <p className="own-model-note own-model-ok" role="status"><CircleCheck size={14} /> {note}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * Wraps `base` so that, once this device chooses the ChatGPT plan, every agent answers through the dev bridge
 * (server.ts) on the same NDJSON as the Edge Function, with proposals and Undo. Without the bridge's page token
 * (production, `vite preview`) it returns `base` untouched.
 */
export function withChatGpt(base: AgentAdapter): AgentAdapter {
  const token = document.querySelector<HTMLMetaElement>('meta[name="workbench-chatgpt-token"]')?.content;
  if (!token) return base;
  const call: Call = (route, body = "{}", headers = {}) => fetch(`/api/chatgpt/${route}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Workbench-Token": token, ...headers }, body,
  });
  // Signed in, a reply carries the account's session, so the bridge can read a connected Google Calendar through the
  // connectors function as this account (agents-design D74); signed out it carries none and the calendar tools go.
  const live = createLiveEngine({ agent: async (body) => {
    const session = auth && (await auth.getSession()).data.session;
    return call("agent", body, session ? { "X-Atlaswork-Session": session.access_token } : {});
  } }, planInfo);
  const listeners = new Set<() => void>();
  let active = localStorage.getItem(choiceKey) === "on";
  const changed = () => { for (const listener of listeners) listener(); };
  const setActive = (on: boolean) => {
    active = on;
    if (on) localStorage.setItem(choiceKey, "on");
    else localStorage.removeItem(choiceKey);
    changed();
  };
  return {
    // The account's own provider stays reachable for Settings while the plan answers.
    ...base.own && { own: base.own },
    about: () => active ? planInfo : base.about(),
    reply: (request, snapshot, files) => active ? live.reply(request, snapshot, files) : base.reply(request, snapshot, files),
    subscribe(listener) {
      listeners.add(listener);
      const off = base.subscribe?.(listener);
      return () => { listeners.delete(listener); off?.(); };
    },
    localModel: { label: "ChatGPT plan", active: () => active, setActive,
      Setup: ({ onUse }) => <ChatGptSetup call={call} active={active} onUse={onUse} onChange={changed} /> },
    // Who answers, and the plan's own models and thinking for an agent's Profile (agents-design D44); the defaults are
    // the ones chosen in AI model. The account's saved provider stays known while the plan answers.
    load: async () => {
      const below = await base.load?.() ?? { provider: { using: "none" as const, own: null }, menu: null };
      if (!active) return below;
      const [status, models] = await Promise.all([json<ChatGptStatus>(call, "status"), json<PlanModel[]>(call, "models")]);
      return { provider: { ...below.provider, using: "device" as const, device: planInfo.badge },
        menu: { source: "chatgpt", label: "ChatGPT plan", current: status.model ?? models[0]?.slug ?? "", efforts: { current: status.effort ?? null },
          list: async () => models.map((model) => ({ id: model.slug, name: model.name })),
          test: ({ id, effort }) => json<{ text: string; ms: number }>(call, "agent",
            JSON.stringify({ test: true, ...id ? { model: { source: "chatgpt", id } } : {}, ...effort ? { effort } : {} })) } };
    },
  };
}
