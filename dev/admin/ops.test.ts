// The admin page's one production write (ops.ts, `invite`): it emails only addresses on the waitlist without an account.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { invite } from "./ops.ts";

const real = globalThis.fetch;
afterEach(() => { globalThis.fetch = real; });
/** A project holding `listed` on the waitlist and `users` as accounts, recording every call. */
function project(listed: string[], users: string[]) {
  const calls: { method: string; path: string; body?: string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? "GET", path: url.pathname, body: init?.body as string | undefined });
    const json = url.pathname === "/rest/v1/waitlist" ? listed.filter((email) => url.searchParams.get("email") === `eq.${email}`).map((email) => ({ email }))
      : url.pathname === "/auth/v1/admin/users" ? { users: users.map((email, id) => ({ id: String(id), email, created_at: "" })) } : {};
    return new Response(JSON.stringify(json), { status: 200 });
  };
  return calls;
}

test("an address on the waitlist without an account gets the invite", async () => {
  const calls = project(["sam@example.test"], ["ana@example.test"]);
  assert.deepEqual(await invite("https://p.test", "key", "sam@example.test"), { invited: "sam@example.test" });
  assert.deepEqual(calls.at(-1), { method: "POST", path: "/auth/v1/invite", body: JSON.stringify({ email: "sam@example.test" }) });
});

test("addresses off the waitlist, or with an account, are refused before anything is sent", async () => {
  const calls = project(["ana@example.test"], ["Ana@example.test"]);
  await assert.rejects(invite("https://p.test", "key", "eve@example.test"), /isn't on the waitlist/);
  await assert.rejects(invite("https://p.test", "key", "ana@example.test"), /already has an account/);
  await assert.rejects(invite("https://p.test", undefined, "ana@example.test"), /no service-role key/);
  assert.ok(!calls.some((call) => call.method === "POST"), "no invite was sent");
});
