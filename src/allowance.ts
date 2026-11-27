// The signed-in account's plan and today's live replies (launch plan D12, D15), read under row-level security as the
// user, kept once per page load for every reader: Settings → Account, the first run's Ready step, Today's plan notice
// and the chat's allowance chip (agents-design D48). The chat re-reads it after each reply. `planNotice` says when
// Today should speak about it.
import { useEffect, useSyncExternalStore } from "react";
import { account } from "./account.ts";
import { caps } from "../supabase/functions/agent/caps.ts";

export type Standing = { plan: "trial" | "pro" | "free"; trialEndsAt: string | null; replies: number };

/** undefined until read, null when it couldn't be. */
let current: Standing | null | undefined;
let reading: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = () => current;

/** Reads the plan and today's (UTC) replies again; a read already running is shared. */
export function refreshStanding() {
  if (!account) return Promise.resolve();
  return reading ??= (async () => {
    const day = new Date().toISOString().slice(0, 10);
    try {
      const [[entitlement], [usage]] = await Promise.all([account!.read("entitlements?select=plan,trial_ends_at"), account!.read(`agent_usage?select=replies&day=eq.${day}`)]);
      current = { plan: (entitlement?.plan ?? "free") as Standing["plan"], trialEndsAt: (entitlement?.trial_ends_at ?? null) as string | null,
        replies: Number(usage?.replies ?? 0) };
    } catch {
      current = null;
    }
    reading = undefined;
    for (const listener of listeners) listener();
  })();
}

/** The dev server's `?as=trial` (src/main.tsx): shows this standing without an account, and no read replaces it. */
export function previewStanding(standing: Standing) {
  current = standing;
  for (const listener of listeners) listener();
}

/** The standing while `signedIn`, read on first use; undefined while loading or signed out. */
export function useStanding(signedIn: boolean) {
  const standing = useSyncExternalStore(subscribe, snapshot);
  useEffect(() => { if (signedIn && current === undefined) void refreshStanding(); }, [signedIn]);
  return signedIn ? standing : undefined;
}

/** Days left on a trial, rounded up; 0 once it ended or without one. */
export const trialDaysLeft = (trialEndsAt: string | null, now: number) =>
  trialEndsAt ? Math.max(0, Math.ceil((Date.parse(trialEndsAt) - now) / 86_400_000)) : 0;

/** "in 3 h" or "in 40 min": until the daily caps reset at 00:00 UTC. */
export function untilReset(now: Date) {
  const minutes = Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 60_000);
  return minutes >= 60 ? `in ${Math.round(minutes / 60)} h` : `in ${minutes} min`;
}

/** The share of the hosted model's daily replies at which the chat's allowance chip warns. */
export const nearCap = 0.8;
/** Today speaks this many days before a trial ends. */
export const trialWarningDays = 3;

export type PlanNotice = { key: string; title: string; line: string };
/**
 * What Today says about the plan while Atlaswork's model answers, or null: a trial in its last days, or a plan with no
 * live replies. (A model of your own answers on any plan, so Today asks this only without one.) `key` changes with
 * what it says, so a dismissed notice comes back only when that changes.
 */
export function planNotice(standing: Standing, now: number): PlanNotice | null {
  if (standing.plan === "pro") return null;
  const days = standing.plan === "trial" ? trialDaysLeft(standing.trialEndsAt, now) : 0;
  if (days > trialWarningDays) return null;
  if (days > 0) return { key: `trial:${standing.trialEndsAt}:${days}`, title: `Your trial ends ${days === 1 ? "within a day" : `in ${days} days`}`,
    line: `After that, agents answer only through an AI model of your own. Connect one now (OpenRouter takes one click) and they won't pause; your provider bills you, up to ${caps.ownReplies} replies a day.` };
  return { key: `no-model:${standing.plan}`, title: "Your agents can't answer yet",
    line: `Your plan has no live replies on Atlaswork's model. Connect an AI model of your own (OpenRouter takes one click) and they answer on any plan; your provider bills you.` };
}
