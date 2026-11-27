#!/usr/bin/env node
// Throwaway accounts on the hosted project, for browser checks of signed-in features.
//
//   node dev/test-account.mjs create [--plan trial|pro|free]   → writes {id, email, hash} to the file it prints
//   node dev/test-account.mjs delete <id>
//   node dev/test-account.mjs delete --all-test                → every ui-test-*@example.test account
//
// Run it with the Supabase secret key in WORKBENCH_SUPABASE_SECRET_KEY (the Bitwarden key of the same name; an agent
// passes it as a bws placeholder in that variable, so the value never shows). Open `http://127.0.0.1:5191/` + hash (or
// any allowed origin) in the test browser to land signed in. The hash holds a one-hour session, so it goes to a file
// rather than stdout; nothing else is written to disk.
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = "https://mcihsugblojunfpuohim.supabase.co";
const testEmail = /^ui-test-\d+@example\.test$/;

const key = process.env.WORKBENCH_SUPABASE_SECRET_KEY;
if (!key) throw new Error("Set WORKBENCH_SUPABASE_SECRET_KEY (Bitwarden key of the same name) to the Supabase secret key.");
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
async function call(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path}: HTTP ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

const [command, arg, value] = process.argv.slice(2);
if (command === "create") {
  const plan = arg === "--plan" ? value : "trial";
  if (!["trial", "pro", "free"].includes(plan)) throw new Error("--plan is trial, pro or free");
  const email = `ui-test-${Date.now()}@example.test`;
  const user = await call("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email, email_confirm: true }) });
  // New accounts start on the trial (migration *_accounts_and_workspace.sql); other plans are set like billing will.
  if (plan !== "trial") await call(`/rest/v1/entitlements?user_id=eq.${user.id}`, { method: "PATCH", body: JSON.stringify({ plan, trial_ends_at: null }) });
  const link = await call("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email }) });
  // Following the link server-side yields the session in the redirect's hash, whatever origin the site URL names.
  const verify = await fetch(link.action_link ?? link.properties.action_link, { redirect: "manual" });
  const hash = new URL(verify.headers.get("location")).hash;
  if (!hash.includes("access_token")) throw new Error("The sign-in link returned no session.");
  const file = join(tmpdir(), "atlaswork-test-account.json");
  writeFileSync(file, JSON.stringify({ id: user.id, email, plan, hash }));
  console.log(`created ${email} (${plan}), id ${user.id}; session in ${file}`);
} else if (command === "delete" && arg === "--all-test") {
  const { users } = await call("/auth/v1/admin/users?per_page=1000");
  const doomed = users.filter((user) => testEmail.test(user.email ?? ""));
  for (const user of doomed) await call(`/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
  console.log(`deleted ${doomed.length} test account(s)`);
} else if (command === "delete" && arg) {
  const user = await call(`/auth/v1/admin/users/${arg}`);
  // Only throwaway accounts: a mistyped id must never delete a real one.
  if (!testEmail.test(user.email ?? "")) throw new Error(`${user.email} is not a test account; refusing.`);
  await call(`/auth/v1/admin/users/${arg}`, { method: "DELETE" });
  console.log(`deleted ${user.email}`);
} else {
  console.error("Usage: node dev/test-account.mjs create [--plan trial|pro|free] | delete <id> | delete --all-test");
  process.exit(2);
}
