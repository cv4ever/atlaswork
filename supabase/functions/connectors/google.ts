// Google Calendar for agents (agents-design D74): the OAuth consent link and its signed state, the refresh token
// sealed before it's stored, and the three things agents do with a calendar: read events, find free time and add
// events. No Deno APIs beyond Web Crypto and fetch, which callers pass in, so tests run it without the network.

export const provider = "google_calendar";
/** Read every calendar you see, write only to calendars you own, and know which account it is. */
export const scopes = ["openid", "email", "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.events.owned"];
/** Where the app may ask to return after consent: production and local development only. */
export const allowedReturn = (url: string) => /^(https:\/\/app\.atlaswork\.app|http:\/\/(localhost|127\.0\.0\.1):\d+)$/.test(url);

type Fetch = typeof fetch;
export type Client = { id: string; secret: string; redirect: string };
export type Event = { title: string; start: string; end: string; allDay: boolean; calendar: string; busy: boolean };

const bytes = (text: string) => new TextEncoder().encode(text);
const b64 = (data: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(data))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const unb64 = (text: string) => Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));

/** Two keys from the function secret CONNECTOR_KEY: one seals tokens, one signs the consent state. */
async function keysOf(secret: string) {
  const raw = await crypto.subtle.importKey("raw", bytes(secret), "HKDF", false, ["deriveKey"]);
  const derive = (info: string, algorithm: AesKeyGenParams | HmacImportParams, usages: KeyUsage[]) => crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: bytes(info) }, raw, algorithm, false, usages);
  return {
    seal: await derive("atlaswork connector token", { name: "AES-GCM", length: 256 }, ["encrypt", "decrypt"]),
    sign: await derive("atlaswork connector state", { name: "HMAC", hash: "SHA-256", length: 256 }, ["sign", "verify"]),
  };
}

/** The refresh token as stored: `v1.<iv>.<ciphertext>`. */
export async function seal(secret: string, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, (await keysOf(secret)).seal, bytes(token));
  return `v1.${b64(iv)}.${b64(sealed)}`;
}
export async function unseal(secret: string, stored: string) {
  const [version, iv, sealed] = stored.split(".");
  if (version !== "v1" || !iv || !sealed) throw new Error("unknown token format");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, (await keysOf(secret)).seal, unb64(sealed)));
}

/** The consent state: who asked, where to send them back, and until when it's good (10 minutes). */
export type State = { user: string; back: string; expires: number };
export async function signState(secret: string, state: State) {
  const body = b64(bytes(JSON.stringify(state)));
  return `${body}.${b64(await crypto.subtle.sign("HMAC", (await keysOf(secret)).sign, bytes(body)))}`;
}
export async function verifyState(secret: string, signed: string, now = Date.now()): Promise<State | null> {
  const [body, mac] = signed.split(".");
  if (!body || !mac) return null;
  try {
    if (!await crypto.subtle.verify("HMAC", (await keysOf(secret)).sign, unb64(mac), bytes(body))) return null;
    const state = JSON.parse(new TextDecoder().decode(unb64(body))) as State;
    return state.expires > now && allowedReturn(state.back) ? state : null;
  } catch {
    return null;
  }
}

/** Google's consent page for Calendar, offline access so the agent can read while you're away. */
export const consentUrl = (client: Client, state: string, hint?: string) => `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
  client_id: client.id, redirect_uri: client.redirect, response_type: "code", scope: scopes.join(" "), access_type: "offline",
  prompt: "consent", include_granted_scopes: "true", state, ...hint ? { login_hint: hint } : {},
})}`;

/** Trades the consent code for tokens: the refresh token to keep, and the account's email from the ID token. */
export async function exchange(client: Client, code: string, fetcher: Fetch = fetch) {
  const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: client.id, client_secret: client.secret, redirect_uri: client.redirect, grant_type: "authorization_code" }) });
  const body = await response.json().catch(() => ({})) as { refresh_token?: string; id_token?: string; scope?: string };
  if (!response.ok || !body.refresh_token) throw new Error(`Google didn't connect (HTTP ${response.status}).`);
  const granted = (body.scope ?? "").split(" ");
  const missing = scopes.filter((scope) => scope.startsWith("https://") && !granted.includes(scope));
  let account = "";
  try { account = String(JSON.parse(new TextDecoder().decode(unb64(body.id_token!.split(".")[1]))).email ?? ""); } catch { /* the email only labels it */ }
  return { refresh: body.refresh_token, account, missing };
}

/** A short-lived access token from the stored refresh token; `revoked` when Google no longer honours it. */
export async function accessToken(client: Pick<Client, "id" | "secret">, refresh: string, fetcher: Fetch = fetch): Promise<string | { revoked: true }> {
  const response = await fetcher("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: client.id, client_secret: client.secret, grant_type: "refresh_token" }) });
  const body = await response.json().catch(() => ({})) as { access_token?: string; error?: string };
  if (body.error === "invalid_grant") return { revoked: true };
  if (!response.ok || !body.access_token) throw new Error(`Google Calendar didn't answer (HTTP ${response.status}).`);
  return body.access_token;
}

/** Tells Google to forget the grant; a token it already forgot is fine. */
export const revoke = (refresh: string, fetcher: Fetch = fetch) =>
  fetcher(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh)}`, { method: "POST" }).then(() => undefined, () => undefined);

/** A refusal from the Calendar API, with its HTTP status (409: that event id is already there). */
export class CalendarError extends Error {
  constructor(readonly status: number) { super(`Google Calendar refused (HTTP ${status}).`); }
}
const api = "https://www.googleapis.com/calendar/v3";
async function call<T>(token: string, path: string, fetcher: Fetch, init?: RequestInit): Promise<T> {
  const response = await fetcher(`${api}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (!response.ok) throw new CalendarError(response.status);
  return await response.json() as T;
}

type GoogleEvent = { summary?: string; status?: string; transparency?: string; start?: { date?: string; dateTime?: string }; end?: { date?: string; dateTime?: string } };

/** A calendar the account shows in Google Calendar, as Settings → Connections names it (agents-design D83). */
export type Shown = { id: string; name: string; primary: boolean };

/** The calendars the account shows (hidden and unticked ones left out), at most 20, its main one first. */
export async function shownCalendars(token: string, fetcher: Fetch = fetch): Promise<Shown[]> {
  const list = await call<{ items?: { id: string; summary?: string; summaryOverride?: string; hidden?: boolean; selected?: boolean; primary?: boolean }[] }>(token, "/users/me/calendarList?minAccessRole=reader", fetcher);
  return (list.items ?? []).filter((item) => !item.hidden && item.selected !== false).slice(0, 20)
    .map((item) => ({ id: item.id, name: (item.summaryOverride ?? item.summary ?? "").slice(0, 100), primary: !!item.primary }))
    .sort((a, b) => Number(b.primary) - Number(a.primary));
}

/**
 * Events between two instants on every calendar the account shows, or only those in `only` (an agent's calendars,
 * D83), in start order, read on the person's clock (`zone`). Cancelled events and declined copies are dropped; at most `max`.
 */
export async function eventsBetween(token: string, from: Date, to: Date, zone: string, fetcher: Fetch = fetch, only?: readonly string[], max = 60): Promise<Event[]> {
  const calendars = (await shownCalendars(token, fetcher)).filter((calendar) => !only || only.includes(calendar.id));
  const query = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", timeZone: zone, maxResults: String(max) });
  const read = await Promise.all(calendars.map(async (calendar) => {
    const page = await call<{ items?: GoogleEvent[] }>(token, `/calendars/${encodeURIComponent(calendar.id)}/events?${query}`, fetcher).catch(() => ({ items: [] }));
    return (page.items ?? []).filter((event) => event.status !== "cancelled" && (event.start?.date || event.start?.dateTime)).map((event): Event => ({
      title: (event.summary ?? "(no title)").slice(0, 200), calendar: calendar.name,
      allDay: !!event.start!.date, start: event.start!.dateTime ?? event.start!.date!, end: event.end?.dateTime ?? event.end?.date ?? event.start!.dateTime ?? event.start!.date!,
      busy: event.transparency !== "transparent" }));
  }));
  return read.flat().sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.title.localeCompare(b.title)).slice(0, max);
}

/** Adds all-day events to the account's main calendar; `key` makes each one's id, so adding it twice keeps one. */
export async function addAllDay(token: string, events: { key: string; title: string; date: string }[], fetcher: Fetch = fetch) {
  let added = 0, already = 0;
  for (const event of events) {
    const id = await eventId(event.key);
    const next = new Date(`${event.date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    try {
      await call(token, "/calendars/primary/events", fetcher, { method: "POST", body: JSON.stringify({ id, summary: event.title,
        start: { date: event.date }, end: { date: next.toISOString().slice(0, 10) }, transparency: "transparent" }) });
      added++;
    } catch (cause) {
      if (cause instanceof CalendarError && cause.status === 409) already++;
      else throw cause;
    }
  }
  return { added, already };
}
/** Google's event ids take 0-9 and a-v; a hash of the key fits. */
async function eventId(key: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes(`atlaswork:${key}`)));
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
