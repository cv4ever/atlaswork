// What a comparison may still spend on Workers AI (DEVELOPMENT.md "Model comparison"). The account's 10,000 free Neurons are
// not reset at 00:00 UTC as Cloudflare's pricing page says: they behave as a rolling 24-hour window (measured
// 2026-11-20: refused with error 4006 at 00:20 UTC after a day with nothing spent, and free again about 24 hours after
// the spend). Production shares them, and runs from several sessions added up past the allowance on 18 and 19
// November, so every run checks the last 24 hours before it asks Workers AI.
//
// The spend comes from Cloudflare's analytics when CLOUDFLARE_ANALYTICS_TOKEN (Account Analytics Read) is set: every
// caller on the account counts, production and other computers included. Without it, from this computer's ledger of
// what comparisons spent, which knows nothing of other callers.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const allowance = 10_000;
const day = 24 * 60 * 60 * 1000;
const account = "a1f804d4855fa8c081645b27965f8500"; // scripts/release-plan.mjs, cloudflareAccount
const ledger = join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "state"), "atlaswork", "workers-ai-spend.jsonl");

export type Spend = { at: number; neurons: number };

/** Writes what one reply spent on Workers AI to this computer's ledger. */
export function recordSpend(neurons: number, at = Date.now()) {
  if (neurons <= 0) return;
  mkdirSync(dirname(ledger), { recursive: true });
  appendFileSync(ledger, `${JSON.stringify({ at, neurons: Math.ceil(neurons) })}\n`);
}

/** The ledger's entries from the last 24 hours. */
function ledgerSpend(now: number): Spend[] {
  if (!existsSync(ledger)) return [];
  return readFileSync(ledger, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as Spend).filter((entry) => entry.at > now - day);
}

/** Every caller's Neurons in the last 24 hours, per quarter hour, from Cloudflare's analytics. */
async function analyticsSpend(token: string, now: number): Promise<Spend[]> {
  const query = `query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){aiInferenceAdaptiveGroups(limit:200,filter:{datetime_geq:$s,datetime_lt:$e}){sum{totalNeurons} dimensions{datetimeFifteenMinutes}}}}}`;
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { a: account, s: new Date(now - day).toISOString(), e: new Date(now).toISOString() } }) });
  const result = await response.json() as { data?: { viewer: { accounts: { aiInferenceAdaptiveGroups: { sum: { totalNeurons: number }; dimensions: { datetimeFifteenMinutes: string } }[] }[] } }; errors?: { message: string }[] };
  if (!result.data) throw new Error(`Cloudflare analytics refused CLOUDFLARE_ANALYTICS_TOKEN: ${result.errors?.map((error) => error.message).join("; ") ?? response.status}`);
  return result.data.viewer.accounts[0].aiInferenceAdaptiveGroups.map((group) => ({ at: Date.parse(group.dimensions.datetimeFifteenMinutes), neurons: group.sum.totalNeurons }));
}

/**
 * How much of the window is free now, keeping `reserve` for production, and when `needed` more would be free as
 * older spend leaves the window (null when it already is).
 */
export function budgetOf(spends: Spend[], now: number, reserve: number, needed: number) {
  const spent = spends.reduce((total, entry) => total + entry.neurons, 0);
  const left = Math.max(0, allowance - reserve - spent);
  let freed = left;
  let freesAt: number | null = null;
  for (const entry of [...spends].sort((a, b) => a.at - b.at)) {
    if (freed >= needed) break;
    freed += entry.neurons;
    freesAt = entry.at + day;
  }
  return { spent: Math.round(spent), left: Math.floor(left), freesAt: left >= needed ? null : freesAt };
}

/** The last 24 hours' spend and where it was read from. */
export async function recentSpend(now = Date.now()): Promise<{ spends: Spend[]; source: string }> {
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  return token ? { spends: await analyticsSpend(token, now), source: "Cloudflare analytics, every caller" }
    : { spends: ledgerSpend(now), source: `this computer's ledger (${ledger}); set CLOUDFLARE_ANALYTICS_TOKEN to count every caller` };
}
