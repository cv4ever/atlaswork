// What a stranger sees at app.atlaswork.app while the app is closed (launch plan step 5): the waitlist, and a sign-in
// for invited accounts. src/main.tsx shows it instead of the app when nobody is signed in on that host.
import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { backend } from "./account.ts";
import { AccountSection } from "./AccountSettings.tsx";
import { useTurnstile } from "./turnstile.ts";

export default function Gate() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [signIn, setSignIn] = useState(false);
  // The waitlist function refuses a signup without a solved Turnstile check (supabase/functions/waitlist).
  const { box: captchaBox, ...captcha } = useTurnstile(!signIn);
  async function join() {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setStatus({ text: "Type a full email address.", error: true });
    setStatus({ text: "Adding you…" });
    try {
      // The same function and source format as the landing page: "<utm_source>:<utm_content>:<placement>".
      const response = await fetch(`${backend!.url}/functions/v1/waitlist`, {
        method: "POST", headers: { apikey: backend!.key, "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), source: "app::gate", token: captcha.token }),
      });
      captcha.reset();
      // Listed before or not, the answer is the same, so the form doesn't reveal who signed up.
      if (response.ok) setStatus({ text: "You're on the list. We'll email you when there's a place for you." });
      else setStatus({ text: "That didn't go through. Try again, or write to hello@atlaswork.app and we'll add you.", error: true });
    } catch { setStatus({ text: "You seem to be offline. Try again in a moment.", error: true }); }
  }
  return (
    <main className="gate">
      <div className="gate-card">
        <img className="gate-atlas" src="/atlas.webp" alt="" width={96} height={96} />
        <h1>Atlaswork</h1>
        <p className="gate-lede">Notes, tasks and a crew of AI agents for your life. In closed beta: join the waitlist and we'll invite people in small groups.</p>
        <a className="gate-more" href="https://atlaswork.app">See what Atlaswork does<ArrowRight size={14} /></a>
        {signIn ? <AccountSection user={null} onExport={async () => undefined} /> : (
          <form className="gate-form" noValidate onSubmit={(event) => { event.preventDefault(); void join(); }}>
            <input type="email" autoComplete="email" aria-label="Email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            <button className="primary-button" disabled={status?.text === "Adding you…" || (captcha.needed && !captcha.token)}><Mail size={16} />Join the waitlist</button>
            {captcha.needed && <div ref={captchaBox} />}
            <p role="status" className={status?.error ? "field-error" : "settings-note"}>{status?.text}</p>
            <p className="settings-note">We'll use your email only to invite you to the beta and to tell you when Atlaswork opens. <a href="https://atlaswork.app/privacy" target="_blank" rel="noreferrer">Waitlist privacy notice</a>.</p>
          </form>
        )}
        <button type="button" className="text-button gate-switch" onClick={() => setSignIn(!signIn)}>{signIn ? "Back to the waitlist" : "Invited? Sign in"}</button>
      </div>
    </main>
  );
}
