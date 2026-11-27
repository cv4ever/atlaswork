import { useEffect, useState } from "react";
import { Check, Cloud, Download, KeyRound, LogIn, LogOut, Mail, Trash2 } from "lucide-react";
import { account, auth } from "./account.ts";
import { useApp, useUi } from "./appContext.ts";
import { forgetDeviceFiles } from "./cloud.ts";
import { useModelState } from "./modelMenu.ts";
import { planLine } from "./look.ts";
import Plant from "./Plant.tsx";
import { useTurnstile } from "./turnstile.ts";
import { caps } from "../supabase/functions/agent/caps.ts";
import { refreshStanding, untilReset, useStanding } from "./allowance.ts";
import { ComputersSection } from "./settings/ComputersSection.tsx";

const { VITE_AUTH_GOOGLE: google } = import.meta.env;
/** The address a sign-in link last went to, so signing in again starts filled in. */
const lastEmailKey = "atlaswork.last-email";

/**
 * Settings → Account (launch plan D15): a sign-in email with a link and the same one-time code, or Google when the
 * project has it on. The code is for a link that opens in the wrong browser, or that a mail scanner used up first.
 * Signing in or out reloads the app (src/main.tsx), which then opens the account's workspace or this browser's.
 * `user` is the signed-in email, or null when signed out; the profile loads it.
 */
export function AccountSection({ user, onExport }: { user: string | null; onExport: () => Promise<void> }) {
  const [email, setEmail] = useState(() => { try { return localStorage.getItem(lastEmailKey) ?? ""; } catch { return ""; } });
  const [sentTo, setSentTo] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Deleting asks you to type the address first (null: not asked yet).
  const [confirming, setConfirming] = useState<string | null>(null);
  // Supabase refuses email sign-ins without a token once its CAPTCHA protection is on.
  const { box: captchaBox, ...captcha } = useTurnstile(user === null && !sentTo);
  if (!auth) return null;
  const back = `${location.origin}${location.pathname}`;

  async function sendLink() {
    setBusy(true);
    setError("");
    const { error: refused } = await auth!.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: back, captchaToken: captcha.token || undefined } });
    setBusy(false);
    captcha.reset();
    if (refused) setError(refused.status === 429 ? "Too many sign-in emails just now. Try again in a few minutes." : refused.message);
    else {
      setSentTo(email.trim());
      try { localStorage.setItem(lastEmailKey, email.trim()); } catch { /* blocked: next time starts empty */ }
    }
  }

  /** The code from the same email, for when its link can't open here. A right code signs in and reloads (src/main.tsx). */
  async function enterCode() {
    setBusy(true);
    setError("");
    const { error: refused } = await auth!.verifyOtp({ email: sentTo, token: code.replace(/\s/g, ""), type: "email" });
    setBusy(false);
    if (refused) setError(refused.status === 429 ? "Too many tries just now. Wait a few minutes, then try again." : "That code didn't work. Check it, or ask for a new email.");
  }

  /** GDPR erasure: the account and every row that cascades from it go; this browser's own workspace stays. */
  async function deleteAccount() {
    setBusy(true);
    setError("");
    try {
      await account!.rpc("delete_my_account", {});
      await forgetDeviceFiles();
      // Signing out reloads the app into this browser's own workspace (src/main.tsx).
      await auth!.signOut({ scope: "local" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't delete the account. Nothing was changed.");
      setBusy(false);
    }
  }

  return (
    <div id="profile-account">
      {user ? <>
        <section className="settings-group" aria-labelledby="account-signed-in-title">
          <h4 id="account-signed-in-title">Signed in</h4>
          <div className="settings-card account-card">
            <span className="account-orb" aria-hidden="true"><Cloud size={18} /></span>
            <div>
              <strong>{user}</strong>
              <ul className="account-perks">
                <li><Check size={14} />Opens wherever you sign in</li>
                <li>Files and images stay on the device that added them</li>
              </ul>
            </div>
            <button className="secondary-button" onClick={() => void auth!.signOut({ scope: "local" })}><LogOut size={16} />Sign out</button>
          </div>
        </section>
        <PlanAndUsage />
        <AwaySwitch />
        <ComputersSection />
        <section className="settings-group settings-danger" aria-labelledby="account-danger-title">
          <h4 id="account-danger-title">Danger zone</h4>
          <div className="settings-card">
            <div className="setting-row">
              <div><strong>Delete account</strong>
                <p>Removes {user} and everything stored in it, for good. This browser keeps its own workspace.</p></div>
              {confirming === null && <button className="secondary-button" disabled={busy} onClick={() => setConfirming("")}><Trash2 size={16} />Delete…</button>}
            </div>
            {confirming !== null && <form className="delete-confirm" onSubmit={(event) => { event.preventDefault(); void deleteAccount(); }}>
              <p>This can't be undone. Want a copy first? <button type="button" className="text-button" onClick={() => void onExport()}><Download size={14} />Export a backup</button></p>
              <label htmlFor="delete-confirm-email">Type <strong>{user}</strong> to confirm</label>
              <input id="delete-confirm-email" autoComplete="off" spellCheck={false} value={confirming} onChange={(event) => setConfirming(event.target.value)} />
              <div className="settings-actions">
                <button className="primary-button danger-button" disabled={busy || confirming.trim().toLowerCase() !== user.toLowerCase()}><Trash2 size={16} />Delete forever</button>
                <button type="button" className="secondary-button" onClick={() => setConfirming(null)}>Keep my account</button>
              </div>
            </form>}
          </div>
        </section>
        {error && <p className="field-error" role="alert">{error}</p>}
      </> : sentTo ? (
        <section className="settings-group">
          <div className="settings-card account-card" role="status">
            <span className="account-orb" aria-hidden="true"><Mail size={18} /></span>
            <div>
              <strong>Check {sentTo}</strong>
              <p>Step 2 of 2: open the link in that email. It opens Atlaswork signed in.</p>
            </div>
            <button className="secondary-button" onClick={() => { setSentTo(""); setCode(""); setError(""); }}>Use another address</button>
          </div>
          <form className="account-form" onSubmit={(event) => { event.preventDefault(); void enterCode(); }}>
            <input inputMode="numeric" autoComplete="one-time-code" aria-label="Code from the email" placeholder="Or type the code from the email"
              maxLength={12} value={code} onChange={(event) => setCode(event.target.value)} />
            <button className="secondary-button" disabled={busy || code.replace(/\s/g, "").length < 6}><KeyRound size={16} />Sign in with code</button>
          </form>
          {error && <p className="field-error" role="alert">{error}</p>}
        </section>
      ) : <>
        <section className="settings-group" aria-labelledby="account-signin-title">
          <h4 id="account-signin-title">Sign in</h4>
          <div className="settings-card">
            <ol className="account-steps" aria-label="Sign in in 2 steps">
              <li data-current="true">Type your email</li>
              <li>Open the link or type the code</li>
            </ol>
            <form className="account-form" onSubmit={(event) => { event.preventDefault(); void sendLink(); }}>
              <input type="email" required autoComplete="email" aria-label="Email" placeholder="you@example.com" value={email}
                onChange={(event) => setEmail(event.target.value)} />
              <button className="primary-button" disabled={busy || (captcha.needed && !captcha.token)}><Mail size={16} />Email me a link</button>
            </form>
            {captcha.needed && <div ref={captchaBox} />}
            {google && <button className="secondary-button account-google"
              onClick={() => void auth!.signInWithOAuth({ provider: "google", options: { redirectTo: back } })}>
              <LogIn size={16} />Continue with Google instead</button>}
          </div>
          <p className="settings-note">The first time, your new account takes the workspace in this browser. By signing in you agree to
            the <a href="https://atlaswork.app/terms" target="_blank" rel="noreferrer">terms</a>. <a href="https://atlaswork.app/privacy" target="_blank" rel="noreferrer">How we handle your data</a></p>
          {error && <p className="field-error" role="alert">{error}</p>}
        </section>
      </>}
    </div>
  );
}

/**
 * The signed-in account's plan and today's live replies, in a component of its own because it reads the engine from
 * the app's context.
 */
function PlanAndUsage() {
  // undefined while loading, null if it couldn't be read.
  // undefined while loading, null if it couldn't be read; opening Account reads it again.
  const standing = useStanding(true);
  useEffect(() => { void refreshStanding(); }, []);
  // Whether the account saved its own provider decides its daily cap; the engine knows, so it isn't asked again.
  const models = useModelState(useApp().engine);
  const answering = models.status === "ready" ? models.provider : models.status === "loading" ? models.last : undefined;
  const own = answering && !!answering.own;
  return (
    <section className="settings-group" aria-labelledby="account-plan-title">
      <h4 id="account-plan-title">Plan and usage</h4>
      <div className="settings-card">
        {standing === undefined || own === undefined && models.status === "loading" ? <p className="settings-card-copy" role="status">Looking it up…</p>
          : standing === null ? <p className="settings-card-copy">Couldn't read your plan just now. Check your connection.</p> : (() => {
            const plan = planLine(standing.plan, standing.trialEndsAt, new Date());
            const cap = own ? caps.ownReplies : caps.replies;
            const share = Math.min(1, standing.replies / cap);
            return <>
              <div className="setting-row">
                <div><strong>{plan.label}</strong><p>{plan.detail}</p></div>
                <span className="plan-badge" aria-hidden="true"><Plant stage={plan.stage} /></span>
              </div>
              <div className="setting-row">
                <div><strong>Live replies today</strong>
                  <p>{standing.replies} of {cap}{own ? ", through your own model" : ""}. Resets {untilReset(new Date())}.</p></div>
                <span className="usage-meter" role="meter" aria-label="Live replies used today" aria-valuemin={0} aria-valuemax={cap} aria-valuenow={standing.replies}
                  data-full={share >= 1 || undefined}><i style={{ width: `${share * 100}%` }} /></span>
              </div>
            </>;
          })()}
      </div>
    </section>
  );
}

/**
 * Routines while the app is closed (agents-design D54): the account's switch, beside the replies they spend. Once it's
 * on, this device's notifications and the account's quiet hours (D55) unfold under it.
 */
function AwaySwitch() {
  const { actions } = useApp();
  const runAway = useUi((state) => state.runAway);
  const quiet = useUi((state) => state.quietHours);
  const push = useUi((state) => state.pushState);
  const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const minutesOf = (value: string) => { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; };
  const pushNote = push === "blocked" ? "Blocked for Atlaswork in this browser: allow notifications in its site settings first."
    : push === "unsupported" ? "This browser can't show them here. On an iPhone, add Atlaswork to the home screen and open it from there."
    : "When a routine posts while the app is closed: who, which routine and the first words. Tapping one opens that chat.";
  return (
    <section className="settings-group" aria-labelledby="account-away-title">
      <h4 id="account-away-title">While you're away</h4>
      <div className="settings-card">
        <label className="setting-row toggle-row">
          <div><strong>Run routines while I'm away</strong>
            <p>Check-ins, reports and reviews run on time even with the app closed, and wait in their chats. Each run is one of the day's live
              replies; they pause after a week without opening the app.</p></div>
          <input type="checkbox" role="switch" checked={!!runAway} disabled={runAway === null}
            onChange={(event) => void actions.setRunAway(event.target.checked)} />
          <span className="switch" aria-hidden="true" />
        </label>
        {runAway && <>
          <label className="setting-row toggle-row">
            <div><strong>Notify me on this device</strong><p>{pushNote}</p></div>
            <input type="checkbox" role="switch" checked={push === "on"} disabled={push === null || push === "unsupported"}
              onChange={(event) => void actions.setPush(event.target.checked)} />
            <span className="switch" aria-hidden="true" />
          </label>
          {quiet && <div className="setting-row">
            <div><strong>Quiet hours</strong><p>No notifications in between; what comes waits in the chat.</p></div>
            <span className="quiet-hours">
              <input type="time" aria-label="Quiet from" value={clock(quiet.from)} step={900}
                onChange={(event) => event.target.value && void actions.setQuietHours({ ...quiet, from: minutesOf(event.target.value) })} />
              <span aria-hidden="true">to</span>
              <input type="time" aria-label="Quiet until" value={clock(quiet.to)} step={900}
                onChange={(event) => event.target.value && void actions.setQuietHours({ ...quiet, to: minutesOf(event.target.value) })} />
            </span>
          </div>}
        </>}
      </div>
    </section>
  );
}
