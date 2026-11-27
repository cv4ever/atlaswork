import assert from "node:assert/strict";
import { addAllDay, consentUrl, exchange, scopes, seal, signState, unseal, verifyState } from "./google.ts";

const secret = "test-connector-key";
const client = { id: "client", secret: "shh", redirect: "https://example.supabase.co/functions/v1/connectors/callback" };

Deno.test("a sealed refresh token opens only with the same key", async () => {
  const stored = await seal(secret, "1//refresh");
  assert.ok(!stored.includes("refresh"), "nothing readable is stored");
  assert.equal(await unseal(secret, stored), "1//refresh");
  await assert.rejects(unseal("another-key", stored));
});

Deno.test("the consent state holds only when signed, unexpired and sending people back to the app", async () => {
  const state = { user: "u1", back: "https://app.atlaswork.app", expires: Date.now() + 60_000 };
  const signed = await signState(secret, state);
  assert.deepEqual(await verifyState(secret, signed), state);
  assert.equal(await verifyState("another-key", signed), null, "another key's signature fails");
  const [body, mac] = signed.split(".");
  const forged = btoa(JSON.stringify({ ...state, user: "u2" })).replace(/=+$/, "");
  assert.equal(await verifyState(secret, `${forged}.${mac}`), null, "a changed user fails");
  assert.equal(await verifyState(secret, signed, state.expires + 1), null, "an expired one fails");
  assert.equal(await verifyState(secret, await signState(secret, { ...state, back: "https://evil.example" })), null, "only the app's own address");
  assert.ok(await verifyState(secret, await signState(secret, { ...state, back: "http://localhost:5191" })), "local development");
  assert.ok(body);
});

Deno.test("consent asks for offline Calendar access with the narrow scopes", () => {
  const url = new URL(consentUrl(client, "state", "me@example.com"));
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("scope"), scopes.join(" "));
  assert.ok(!scopes.some((scope) => scope.endsWith("/auth/calendar")), "never the full calendar scope");
  assert.equal(url.searchParams.get("login_hint"), "me@example.com");
});

Deno.test("an exchange keeps the refresh token and the account, and names scopes left unticked", async () => {
  const idToken = `x.${btoa(JSON.stringify({ email: "me@example.com" })).replace(/=+$/, "")}.y`;
  const answer = (scope: string) => () => Promise.resolve(new Response(JSON.stringify({ refresh_token: "1//r", id_token: idToken, scope })));
  const full = await exchange(client, "code", answer(scopes.join(" ")));
  assert.deepEqual(full, { refresh: "1//r", account: "me@example.com", missing: [] });
  const partial = await exchange(client, "code", answer("openid email https://www.googleapis.com/auth/calendar.events.readonly"));
  assert.equal(partial.missing.length, 2);
  await assert.rejects(exchange(client, "code", () => Promise.resolve(new Response("{}", { status: 400 }))), /didn't connect/);
});

Deno.test("an event added twice keeps one: the second comes back as already there", async () => {
  const ids = new Set<string>();
  const fetcher = (_url: string | URL | Request, init?: RequestInit) => {
    const id = JSON.parse(String(init?.body)).id as string;
    if (ids.has(id)) return Promise.resolve(new Response("{}", { status: 409 }));
    ids.add(id);
    return Promise.resolve(new Response("{}"));
  };
  const events = [{ key: "u1:t1", title: "Pay rent", date: "2026-11-30" }];
  assert.deepEqual(await addAllDay("token", events, fetcher), { added: 1, already: 0 });
  assert.deepEqual(await addAllDay("token", events, fetcher), { added: 0, already: 1 });
  assert.match([...ids][0], /^[0-9a-v]{5,1024}$/, "a valid Google event id");
});
