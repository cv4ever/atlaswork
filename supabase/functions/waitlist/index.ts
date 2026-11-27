// The waitlist's only way in (landing page and src/Gate.tsx). A Cloudflare Turnstile token must pass before an email is
// stored, so bots can't fill the list or skew the per-channel counts. Every accepted request gets the same answer,
// listed before or not, so the form can't be used to learn who signed up.
import { checkSignup } from "./logic.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const answer = (status: number, body: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Cloudflare's verdict on a Turnstile token (https://developers.cloudflare.com/turnstile/get-started/server-side-validation/). */
async function human(token: string, ip: string | null) {
  const form = new FormData();
  form.append("secret", env("TURNSTILE_SECRET_KEY"));
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return response.ok && (await response.json() as { success?: boolean }).success === true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return answer(405, { error: "Use POST." });
  const signup = checkSignup(await request.text());
  if ("error" in signup) return answer(400, { error: signup.error });
  if (!await human(signup.token, request.headers.get("cf-connecting-ip")).catch(() => false)) {
    return answer(403, { error: "The check that you're not a bot failed. Try again." });
  }
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const stored = await fetch(`${env("SUPABASE_URL")}/rest/v1/waitlist?on_conflict=email`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify({ email: signup.email, source: signup.source }),
  });
  if (!stored.ok) {
    console.error(`waitlist insert: HTTP ${stored.status}`);
    return answer(502, { error: "That didn't go through." });
  }
  return answer(200, { ok: "listed" });
});
