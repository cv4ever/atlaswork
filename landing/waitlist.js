// The waitlist forms (index.html). Public values only: the Supabase publishable key and the Turnstile site key are
// safe in the page. Emails go through the waitlist Edge Function, which stores one only after Cloudflare Turnstile
// says a person sent it (supabase/functions/waitlist). The check runs in the background and shows a challenge only
// when Cloudflare isn't sure.
const config = { supabaseUrl: "https://mcihsugblojunfpuohim.supabase.co", supabaseKey: "sb_publishable_rxgN8XcAkFA9thDsYc3kQg_DrbIs1pZ", turnstileKey: "0x4AAAAAAF2sqvMjgKEDxJRJ" };
// Which link brought the visitor (the utm_ tags on shared links), kept with the signup so channels can be compared.
const params = new URLSearchParams(location.search);
const tag = (name) => (params.get(name) ?? "").toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 50);
const forms = [...document.querySelectorAll("form.waitlist")];
const checks = new Map(forms.map((form) => [form, { token: "", waiting: [] }]));

// Turnstile calls this once its script loads; each form gets its own widget, solved while the visitor types.
window.atlasTurnstile = () => {
  for (const form of forms) {
    const check = checks.get(form);
    check.widget = window.turnstile.render(form.querySelector(".human-check"), {
      sitekey: config.turnstileKey, appearance: "interaction-only",
      callback: (token) => { check.token = token; for (const waiter of check.waiting.splice(0)) waiter.resolve(token); },
      "expired-callback": () => { check.token = ""; },
      // A failed check (blocked script, network) answers the waiting submit now instead of after the timeout.
      "error-callback": () => { for (const waiter of check.waiting.splice(0)) waiter.reject(new Error("turnstile")); },
    });
  }
};
const script = document.createElement("script");
script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=atlasTurnstile";
script.async = true;
document.head.append(script);

/** The form's Turnstile token, waiting up to 20 s for a check still running. */
function tokenFor(form) {
  const check = checks.get(form);
  if (check.token) return Promise.resolve(check.token);
  // No Promise.withResolvers: this page has no build step and must run on Safari before 17.4.
  return new Promise((resolve, reject) => {
    check.waiting.push({ resolve, reject });
    setTimeout(() => reject(new Error("turnstile")), 20_000);
  });
}

for (const form of forms) {
  const status = form.querySelector("[role=status]");
  const button = form.querySelector("button");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.email.value.trim().toLowerCase();
    status.className = "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      status.className = "error";
      status.textContent = "Enter an email address like you@example.com.";
      return form.email.focus();
    }
    button.disabled = true;
    const check = checks.get(form);
    try {
      const token = await tokenFor(form);
      const response = await fetch(`${config.supabaseUrl}/functions/v1/waitlist`, {
        method: "POST",
        headers: { apikey: config.supabaseKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: `${tag("utm_source")}:${tag("utm_content")}:${form.dataset.placement}`, token }),
      });
      if (!response.ok) throw new Error(String(response.status));
      // Listed before or not, the answer is the same, so the form doesn't reveal who signed up.
      status.textContent = "You're on the list. We'll email you when there's a place for you.";
      form.reset();
    } catch {
      status.className = "error";
      status.textContent = "That didn't go through. Check your connection and try again.";
    } finally {
      // A token works once: ask for a fresh one for the next try.
      check.token = "";
      if (check.widget !== undefined) window.turnstile.reset(check.widget);
      button.disabled = false;
    }
  });
}
