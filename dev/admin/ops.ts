// What the admin page's Operations section shows (/dev/admin/): the waitlist, accounts and plans, replies against the
// caps, the anonymous counts (src/usage.ts) and shared agents, read from the hosted project with the service-role key
// in this dev server's environment. The key never leaves this process; the browser gets the figures. The one write is
// `invite`, which Carlos confirms per address on the page.
import { caps } from "../../supabase/functions/agent/caps.ts";

/** One section's figures, or why they couldn't be read; each is read on its own, so one failure leaves the rest. */
export type Panel<T> = { ok: true; value: T } | { ok: false; error: string };
/** Every waitlist entry, newest first; `account` says the address already has one (invited or signed up). */
export type Waitlist = { total: number; week: number; bySource: [string, number][]; entries: { email: string; source: string; at: string; account: boolean }[] };
export type Accounts = {
  total: number; tests: number; byPlan: Record<string, number>; trialsEnding: number; newWeek: number; activeWeek: number;
  recent: { email: string; plan: string; created: string; lastSignIn: string | null }[];
};
/**
 * Per UTC day: replies, Neurons, accounts, the tokens replies read (the cached part apart) and wrote (D66, D67), and
 * the replies Groq answered because Workers AI refused (`standIns`, D67); 0 before their migrations.
 */
export type Replies = { days: { day: string; replies: number; neurons: number; accounts: number; input: number; cached: number; output: number; standIns: number }[]; caps: typeof caps; heaviest: { replies: number; neurons: number } };
/** `days` oldest first; each event's counts line up with them. */
export type Counts = { days: string[]; events: Record<string, number[]> };
export type Shared = { total: number; recent: { name: string; role: string; at: string }[] };
export type OpsReport =
  | { configured: false; base: string }
  | { configured: true; base: string; read: string; waitlist: Panel<Waitlist>; accounts: Panel<Accounts>; replies: Panel<Replies>; counts: Panel<Counts>; shared: Panel<Shared> };

const testEmail = /^ui-test-\d+@example\.test$/;
const dayMs = 864e5;
const dayOf = (time: number) => new Date(time).toISOString().slice(0, 10);
type User = { id: string; email?: string; created_at: string; last_sign_in_at?: string | null };

async function settle<T>(read: () => Promise<T>): Promise<Panel<T>> {
  try { return { ok: true, value: await read() }; } catch (cause) { return { ok: false, error: cause instanceof Error ? cause.message : String(cause) }; }
}

/** GET and POST on the project at `base` as the service role. */
function project(base: string, key: string) {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const response = await fetch(`${base}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
    if (!response.ok) throw new Error(`${path.split("?")[0]}: HTTP ${response.status}`);
    return response.json() as Promise<T>;
  };
  return { get: call, users: async () => (await call<{ users: User[] }>("/auth/v1/admin/users?per_page=1000")).users };
}

/**
 * Sends Supabase's invite email to `email`, an address on the waitlist without an account yet, so a mistyped or
 * arbitrary address can't be invited from here. Its link signs the person in at the project's site URL.
 */
export async function invite(base: string, key: string | undefined, email: string) {
  if (!base || !key) throw new Error("This dev server has no service-role key.");
  const { get, users } = project(base, key);
  const listed = await get<{ email: string }[]>(`/rest/v1/waitlist?select=email&email=eq.${encodeURIComponent(email)}`);
  if (!listed.length) throw new Error(`${email} isn't on the waitlist.`);
  if ((await users()).some((user) => user.email?.toLowerCase() === email.toLowerCase())) throw new Error(`${email} already has an account.`);
  await get("/auth/v1/invite", { method: "POST", body: JSON.stringify({ email }) });
  return { invited: email };
}

/** Reads every section from the project at `base`, with `key` its secret (service-role) key. `days` of history. */
export async function readOps(base: string, key: string | undefined, days = 14, now = Date.now()): Promise<OpsReport> {
  if (!base || !key) return { configured: false, base };
  const { get, users: readUsers } = project(base, key);
  // Both the waitlist (who has an account) and Accounts read the users; one request serves them.
  const users = readUsers();
  users.catch(() => {});
  const since = dayOf(now - (days - 1) * dayMs);
  const week = now - 7 * dayMs;
  const dayList = Array.from({ length: days }, (_, index) => dayOf(now - (days - 1 - index) * dayMs));

  const [waitlist, accounts, replies, counts, shared] = await Promise.all([
    settle(async (): Promise<Waitlist> => {
      const [rows, holders] = await Promise.all([get<{ email: string; source: string; created_at: string }[]>("/rest/v1/waitlist?select=email,source,created_at&order=created_at.desc"),
        users.then((list) => new Set(list.map((user) => user.email?.toLowerCase())), () => new Set<string | undefined>())]);
      const sources = new Map<string, number>();
      for (const row of rows) {
        const source = row.source.split(":").filter(Boolean).join(" · ") || "direct";
        sources.set(source, (sources.get(source) ?? 0) + 1);
      }
      return { total: rows.length, week: rows.filter((row) => Date.parse(row.created_at) >= week).length, bySource: [...sources].sort((a, b) => b[1] - a[1]),
        entries: rows.map((row) => ({ email: row.email, source: row.source, at: row.created_at, account: holders.has(row.email.toLowerCase()) })) };
    }),
    settle(async (): Promise<Accounts> => {
      const [list, plans] = await Promise.all([users,
        get<{ user_id: string; plan: string; trial_ends_at: string | null }[]>("/rest/v1/entitlements?select=user_id,plan,trial_ends_at"),
      ]);
      const planOf = new Map(plans.map((row) => [row.user_id, row]));
      const real = list.filter((user) => !testEmail.test(user.email ?? ""));
      const byPlan: Record<string, number> = {};
      for (const user of real) {
        const plan = planOf.get(user.id)?.plan ?? "none";
        byPlan[plan] = (byPlan[plan] ?? 0) + 1;
      }
      const trialsEnding = real.filter((user) => {
        const ends = planOf.get(user.id)?.trial_ends_at;
        return planOf.get(user.id)?.plan === "trial" && ends && Date.parse(ends) >= now && Date.parse(ends) < now + 7 * dayMs;
      }).length;
      return { total: real.length, tests: list.length - real.length, byPlan, trialsEnding,
        newWeek: real.filter((user) => Date.parse(user.created_at) >= week).length,
        activeWeek: real.filter((user) => user.last_sign_in_at && Date.parse(user.last_sign_in_at) >= week).length,
        recent: [...real].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
          .map((user) => ({ email: user.email ?? "", plan: planOf.get(user.id)?.plan ?? "none", created: user.created_at, lastSignIn: user.last_sign_in_at ?? null })) };
    }),
    settle(async (): Promise<Replies> => {
      // Tokens arrive with migration 20261118120000 (D66, D67) and stand-ins with 20261120130000 (D67); before them the
      // columns are missing, so ask for them only then.
      type Row = { user_id: string; day: string; replies: number; neurons: number; input_tokens?: number; cached_tokens?: number; output_tokens?: number; stand_ins?: number };
      const tokens = "input_tokens,cached_tokens,output_tokens";
      const rows = await get<Row[]>(`/rest/v1/agent_usage?select=user_id,day,replies,neurons,${tokens},stand_ins&day=gte.${since}`)
        .catch(() => get<Row[]>(`/rest/v1/agent_usage?select=user_id,day,replies,neurons,${tokens}&day=gte.${since}`))
        .catch(() => get<Row[]>(`/rest/v1/agent_usage?select=user_id,day,replies,neurons&day=gte.${since}`));
      const today = dayOf(now);
      const todays = rows.filter((row) => row.day === today);
      const sum = (on: Row[], field: "replies" | "neurons" | "input_tokens" | "cached_tokens" | "output_tokens" | "stand_ins") => on.reduce((total, row) => total + (row[field] ?? 0), 0);
      return { caps, days: dayList.map((day) => {
        const on = rows.filter((row) => row.day === day);
        return { day, replies: sum(on, "replies"), neurons: sum(on, "neurons"), accounts: on.length,
          input: sum(on, "input_tokens"), cached: sum(on, "cached_tokens"), output: sum(on, "output_tokens"), standIns: sum(on, "stand_ins") };
      }), heaviest: { replies: Math.max(0, ...todays.map((row) => row.replies)), neurons: Math.max(0, ...todays.map((row) => row.neurons)) } };
    }),
    settle(async (): Promise<Counts> => {
      const rows = await get<{ day: string; event: string; count: number }[]>(`/rest/v1/usage_counts?select=day,event,count&day=gte.${since}`);
      const events: Record<string, number[]> = {};
      for (const row of rows) {
        const at = dayList.indexOf(row.day);
        if (at >= 0) (events[row.event] ??= dayList.map(() => 0))[at] = row.count;
      }
      return { days: dayList, events };
    }),
    settle(async (): Promise<Shared> => {
      const rows = await get<{ name: string; role: string; created_at: string }[]>("/rest/v1/shared_agents?select=name,role,created_at&order=created_at.desc");
      return { total: rows.length, recent: rows.slice(0, 6).map((row) => ({ name: row.name, role: row.role, at: row.created_at })) };
    }),
  ]);
  return { configured: true, base, read: new Date(now).toISOString(), waitlist, accounts, replies, counts, shared };
}
