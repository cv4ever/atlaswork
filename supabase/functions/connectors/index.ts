// Connections to outside accounts (agents-design D74), Google Calendar first. The signed-in app asks here for Google's
// consent link (`{start, back}`), disconnects (`{disconnect}`), adds events you approved (`{add}`), reads one day's
// events for Today's day line (`{day: {date, zone}}`, D75), which are sent back and never kept, lists the calendars
// you show so Settings can say which ones each agent reads (`{calendars: true}`, D83), and runs a calendar
// tool for an agent loop that runs elsewhere (`{tool, zone, today, calendars?}`: the dev ChatGPT bridge); Google sends
// the person back to `/callback`, where the code becomes a refresh token, sealed (google.ts) and stored with the
// service role (migration 20261122140000_connections.sql). The agent function reads the calendar with the same token
// (../agent/calendar.ts). Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CONNECTOR_KEY, and GOOGLE_REDIRECT_URI
// where the function's own address isn't what Google sees (the local stack). Tokens and event contents are never logged.
import { accessToken, addAllDay, allowedReturn, consentUrl, eventsBetween, exchange, provider, revoke, seal, shownCalendars, signState, unseal, verifyState } from "./google.ts";
import { calendarFor, dayBounds, dayEvents } from "../agent/calendar.ts";
import { outsideTools } from "../agent/tools.ts";
import { isRecord } from "../agent/validate.ts";

/** Whether `zone` is a time zone this runtime knows, so a made-up one is refused rather than read as UTC. */
const validZone = (zone: string) => { try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; } };

const env = (name: string) => Deno.env.get(name) ?? "";
const supabaseUrl = env("SUPABASE_URL");
const secret = env("CONNECTOR_KEY");
const client = { id: env("GOOGLE_CLIENT_ID"), secret: env("GOOGLE_CLIENT_SECRET"),
  redirect: env("GOOGLE_REDIRECT_URI") || `${supabaseUrl}/functions/v1/connectors/callback` };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** Calls a Postgres function with the service role, which alone may run the `*_of` connection functions. */
async function rpc(name: string, args: Record<string, unknown>) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(args),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** Google sends the person back here with a code (or an error); they land on the app with how it went. */
async function callback(url: URL) {
  const state = await verifyState(secret, url.searchParams.get("state") ?? "");
  if (!state) return new Response("This link expired. Go back to Atlaswork and connect again.", { status: 400 });
  const back = (outcome: string) => Response.redirect(`${state.back}/?connected=${outcome}`, 302);
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");
  try {
    const granted = await exchange(client, code);
    // Unticked boxes on Google's screen leave the agent half-blind: say so rather than store a grant that can't read.
    if (granted.missing.length) {
      await revoke(granted.refresh);
      return back("partial");
    }
    await rpc("set_connection_of", { p_user: state.user, p_provider: provider, p_account: granted.account, p_token: await seal(secret, granted.refresh) });
    console.info("connectors: calendar connected");
    return back(provider);
  } catch (cause) {
    console.warn(`connectors: connecting failed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected error"}`);
    return back("failed");
  }
}

type Added = { key: string; title: string; date: string };
const isAdded = (value: unknown): value is Added => isRecord(value) && typeof value.key === "string" && value.key.length > 0 && value.key.length <= 200
  && typeof value.title === "string" && value.title.trim() !== "" && value.title.length <= 1000 && typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date);

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname.endsWith("/callback")) return callback(url);
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);
  if (!secret || !client.id || !client.secret) return json({ error: "Connections aren't set up on this server yet." }, 503);
  const user = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: request.headers.get("Authorization") ?? "" },
  }).then((response) => response.ok ? response.json() as Promise<{ id: string; email?: string; is_anonymous?: boolean }> : null).catch(() => null);
  if (!user?.id || user.is_anonymous) return json({ error: "You're signed out. Sign in again from Settings → Account." }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "That request was malformed." }, 400); }
  if (!isRecord(body)) return json({ error: "That request was malformed." }, 400);

  if (body.start === provider) {
    const back = typeof body.back === "string" ? body.back.replace(/\/+$/, "") : "";
    if (!allowedReturn(back)) return json({ error: "That request was malformed." }, 400);
    return json({ url: consentUrl(client, await signState(secret, { user: user.id, back, expires: Date.now() + 10 * 60_000 }), user.email) });
  }
  if (body.disconnect === provider) {
    const token = await rpc("drop_connection_of", { p_user: user.id, p_provider: provider });
    if (typeof token === "string") await revoke(await unseal(secret, token).catch(() => ""));
    return json({ disconnected: true });
  }
  if (Array.isArray(body.add)) {
    const events = body.add.filter(isAdded).slice(0, 20);
    if (!events.length || events.length !== body.add.length) return json({ error: "That request was malformed." }, 400);
    const rows = await rpc("connection_of", { p_user: user.id, p_provider: provider });
    const stored = Array.isArray(rows) && isRecord(rows[0]) && typeof rows[0].token === "string" ? rows[0].token : "";
    if (!stored) return json({ error: "Connect Google Calendar first, in Settings → Connections." }, 409);
    try {
      const access = await accessToken(client, await unseal(secret, stored));
      if (typeof access !== "string") return json({ error: "Google Calendar is no longer connected. Connect it again in Settings → Connections." }, 409);
      // The key is the account's and the task's, so adding the same task twice keeps one event.
      return json(await addAllDay(access, events.map((event) => ({ ...event, key: `${user.id}:${event.key}`, title: event.title.trim() }))));
    } catch (cause) {
      console.warn(`connectors: adding events failed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected error"}`);
      return json({ error: "Google Calendar didn't take them. Try again in a moment." }, 502);
    }
  }
  // Today's events for the day line (agents-design D75): read on the person's clock for the page, never stored or logged.
  if (isRecord(body.day) && typeof body.day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.day.date)
    && typeof body.day.zone === "string" && body.day.zone.length <= 64 && validZone(body.day.zone)) {
    const { date, zone } = body.day as { date: string; zone: string };
    const rows = await rpc("connection_of", { p_user: user.id, p_provider: provider });
    const stored = Array.isArray(rows) && isRecord(rows[0]) && typeof rows[0].token === "string" ? rows[0].token : "";
    if (!stored) return json({ events: [], connected: false });
    try {
      const access = await accessToken(client, await unseal(secret, stored));
      if (typeof access !== "string") return json({ events: [], connected: false });
      const [start, end] = dayBounds(zone, date);
      return json({ events: dayEvents(await eventsBetween(access, new Date(start), new Date(end), zone), zone, date), connected: true });
    } catch (cause) {
      console.warn(`connectors: reading the day failed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected error"}`);
      return json({ error: "Google Calendar didn't answer. Try again in a moment." }, 502);
    }
  }
  // The calendars you show (D83), names only, for Settings → Connections to say which ones each agent reads.
  if (body.calendars === true) {
    const rows = await rpc("connection_of", { p_user: user.id, p_provider: provider });
    const stored = Array.isArray(rows) && isRecord(rows[0]) && typeof rows[0].token === "string" ? rows[0].token : "";
    if (!stored) return json({ calendars: [], connected: false });
    try {
      const access = await accessToken(client, await unseal(secret, stored));
      if (typeof access !== "string") return json({ calendars: [], connected: false });
      return json({ calendars: await shownCalendars(access), connected: true });
    } catch (cause) {
      console.warn(`connectors: listing calendars failed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected error"}`);
      return json({ error: "Google Calendar didn't answer. Try again in a moment." }, 502);
    }
  }
  // One calendar tool call for an agent loop that doesn't hold the account's grant (the dev ChatGPT bridge, D74): the
  // same tool the agent function runs, for this account, on its clock, on the agent's calendars (D83). The model reads the result.
  const calendars = body.calendars === undefined ? undefined
    : Array.isArray(body.calendars) && body.calendars.length <= 20 && body.calendars.every((id) => typeof id === "string" && id !== "" && id.length <= 300)
      ? body.calendars as string[] : null;
  if (isRecord(body.tool) && typeof body.tool.name === "string" && outsideTools.has(body.tool.name) && typeof body.tool.arguments === "string"
    && body.tool.arguments.length <= 2000 && typeof body.zone === "string" && body.zone.length <= 64 && validZone(body.zone)
    && typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today) && calendars !== null) {
    const outside = await calendarFor(rpc, user.id, secret, client, { zone: body.zone, today: body.today, calendars }).catch(() => null);
    if (!outside) return json({ result: "Google Calendar isn't connected. Tell the person to connect it in Settings → Connections." });
    const ran = await outside({ id: "connectors", type: "function", function: { name: body.tool.name, arguments: body.tool.arguments } });
    return json({ result: ran.text, ...ran.used && { used: ran.used } });
  }
  return json({ error: "That request was malformed." }, 400);
});
