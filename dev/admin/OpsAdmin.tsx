// The admin page's Operations section: the hosted project's figures, read by this dev server with the service-role key
// (ops.ts), never by the browser. Without the key it says how to start the server with one. Each part reports its own
// failure, so a missing table leaves the rest readable. Warnings come first: budgets and caps close to running out.
// The waitlist's Invite sends Supabase's invite email, after a confirmation per address.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CircleAlert, KeyRound, MailPlus, RefreshCw } from "lucide-react";
import { formatDate } from "../../src/dates.ts";
import { usageEvents } from "../../src/usage.ts";
import { post } from "./api.ts";
import type { Counts, OpsReport, Panel, Waitlist } from "./ops.ts";

/** Getting started in the order a person meets it (src/OnboardingDialog.tsx), for the funnel. */
const funnel = ["onboarding_shown", "onboarding_domains", "onboarding_crew", "onboarding_model", "onboarding_ready", "onboarding_finished"] as const;
/** Share of a budget or cap at which the page warns. */
const warnAt = { neurons: 0.75, account: 0.8 };

/** The anonymous counts in their families (src/usage.ts), each with the words the page uses. */
const families: [string, Record<string, string>][] = [
  ["Getting started", { onboarding_shown: "Saw the first run", onboarding_domains: "Picked domains", onboarding_crew: "Picked a crew", onboarding_model: "Chose who answers",
    onboarding_ready: "Reached Ready", onboarding_finished: "Finished", onboarding_skipped: "Skipped", own_domain_added: "Named a domain", starter_built: "Built a starter project" }],
  ["Who answers", { own_model_connected: "Connected their own model" }],
  ["Replies", { agent_replied: "Agents replied", agent_cant: "Said they can't, proposing nothing" }],
  ["Linked folders", { folder_linked: "Linked a folder", folder_reconnected: "Reconnected one", folder_unlinked: "Unlinked one", files_searched: "Searched files", file_read: "Read a file", file_reply: "Replied from files" }],
  ["Memory", { memory_saved: "Saved", memory_replaced: "Corrected", memory_undone: "Undone", memory_forgotten: "Forgotten from Briefing",
    memory_learned: "Where things are: offered", memory_learned_kept: "Kept", memory_learned_declined: "Not this" }],
  ["Asking each other", { ask_proposed: "Questions drafted", ask_sent: "Sent", ask_always: "Always let them", ask_declined: "Declined" }],
  ["Planting domains", { domain_planted: "Planted", domain_planted_common: "From a common one", domain_keeper_changed: "Changed the agent",
    domain_look_opened: "Opened the look", domain_unplanted: "Undone", domain_keeper_archived: "Deleted with its agent archived" }],
  ["Opening from outside", { shortcut_note: "New note shortcut", shortcut_atlas: "Ask Atlas shortcut", shortcut_today: "Today shortcut",
    shortcut_needs: "Needs you shortcut", shortcut_voice: "Speak shortcut", share_opened: "Shared to the app", push_opened: "Opened a notification" }],
  ["Capture", { capture_dictated: "Spoke into Capture", capture_sorted: "Handed to Atlas to sort" }],
  ["Agents Atlas drafts", { agent_drafted: "Drafted", agent_drafted_existing: "From a crew or suggested agent", agent_draft_tried: "Tried before Save",
    agent_draft_saved: "Saved", agent_draft_changed: "Saved with changes", agent_quiet_archived: "Quiet agent archived" }],
  ["Phone navigation", { nav_today: "Today", nav_projects: "Projects", nav_capture: "Capture", nav_chat: "Chat", nav_needs: "Chat held for Needs you",
    nav_more: "More", nav_domain: "A domain seed", nav_swipe: "Swiped between domains", nav_search: "Search", nav_profile: "Picture",
    nav_domains: "More: Domains", nav_library: "More: Library", nav_archive: "More: Archive", nav_agents: "More: Agents", nav_routines: "More: Routines",
    nav_settings: "More: Settings" }],
];
const number = new Intl.NumberFormat("en");
const when = (iso: string) => formatDate(new Date(iso), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => formatDate(new Date(`${iso}T12:00:00Z`), { weekday: "short", day: "numeric", month: "short" });

function Part<T>({ title, panel, children }: { title: string; panel: Panel<T>; children: (value: T) => ReactNode }) {
  return (
    <section className="admin-ops-part" aria-label={title}>
      <h2 className="admin-section-title">{title}</h2>
      {panel.ok ? children(panel.value) : <p className="admin-status" data-error>Couldn&rsquo;t read it: {panel.error}</p>}
    </section>
  );
}

function Figure({ value, label, note }: { value: number | string; label: string; note?: string }) {
  return <div className="admin-figure"><strong>{typeof value === "number" ? number.format(value) : value}</strong><span>{label}</span>{note && <small>{note}</small>}</div>;
}

export default function OpsAdmin() {
  const [report, setReport] = useState<OpsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    setError("");
    try { setReport(await post<OpsReport>("/api/admin/ops")); } catch (cause) { setError(cause instanceof Error ? cause.message : "Reading failed."); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  return (
    <section className="admin-page" aria-labelledby="ops-title" aria-busy={loading}>
      <header className="admin-head">
        <div><h1 id="ops-title">Operations</h1>
          <p>{report?.configured ? <>Read {when(report.read)} from <code>{report.base}</code>. Test accounts (<code>ui-test-…@example.test</code>) are left out.</>
            : "The hosted project's waitlist, accounts, replies and anonymous counts, read by this dev server."}</p></div>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{loading ? "Reading…" : "Refresh"}</button>
      </header>
      {error && <p className="admin-status" data-error>{error}</p>}
      {report && !report.configured && (
        <div className="empty-state admin-empty">
          <KeyRound size={28} aria-hidden="true" />
          <h2>This dev server has no service-role key</h2>
          <p>Start it with <code>WORKBENCH_SUPABASE_SECRET_KEY</code> set from the Bitwarden key of that name. The key stays in the server; the page only gets the figures. {report.base ? <>It would read <code>{report.base}</code>.</> : <>Set <code>VITE_SUPABASE_URL</code> too.</>}</p>
          <pre>WORKBENCH_SUPABASE_SECRET_KEY=… pnpm run dev</pre>
        </div>
      )}
      {report?.configured && <Alerts report={report} />}
      {report?.configured && (
        <div className="admin-ops">
          <Part title="Waitlist" panel={report.waitlist}>{(list) => <>
            <div className="admin-figures"><Figure value={list.total} label="on the waitlist" /><Figure value={list.week} label="joined in 7 days" />
              <Figure value={list.entries.filter((entry) => !entry.account).length} label="not invited yet" /></div>
            {list.bySource.length > 0 && <ul className="admin-bars" aria-label="By source">{list.bySource.map(([source, count]) => (
              <li key={source}><span>{source}</span><i style={{ inlineSize: `${(count / list.total) * 100}%` }} aria-hidden="true" /><b>{number.format(count)}</b></li>))}</ul>}
            <WaitlistTable entries={list.entries} />
          </>}</Part>
          <Part title="Accounts" panel={report.accounts}>{(accounts) => <>
            <div className="admin-figures">
              <Figure value={accounts.total} label="accounts" note={accounts.tests ? `${accounts.tests} test accounts left out` : undefined} />
              <Figure value={accounts.newWeek} label="new in 7 days" />
              <Figure value={accounts.activeWeek} label="signed in within 7 days" />
              <Figure value={accounts.trialsEnding} label="trials ending in 7 days" />
            </div>
            <p className="admin-lede">By plan: {Object.entries(accounts.byPlan).map(([plan, count]) => `${plan} ${count}`).join(", ") || "none"}.</p>
            <Recent heads={["Email", "Plan", "Joined", "Last sign-in"]} rows={accounts.recent.map((row) => [row.email, row.plan, when(row.created), row.lastSignIn ? when(row.lastSignIn) : "Never"])} empty="No accounts yet." />
          </>}</Part>
          <Part title="Live replies" panel={report.replies}>{(replies) => {
            const today = replies.days.at(-1)!;
            return <>
              <div className="admin-figures">
                <Figure value={today.replies} label="replies today" note={`${today.accounts} accounts`} />
                <Figure value={`${Math.round((today.neurons / replies.caps.neurons) * 100)}%`} label="of today's Neurons budget" note={`${number.format(today.neurons)} of ${number.format(replies.caps.neurons)}`} />
                <Figure value={`${replies.heaviest.replies} of ${replies.caps.replies}`} label="most replies by one account" />
                {today.input > 0 && <Figure value={number.format(Math.round(today.input / Math.max(1, today.replies)))} label="tokens a reply read today"
                  note={`${Math.round((today.cached / today.input) * 100)}% from cache; ${number.format(Math.round(today.output / Math.max(1, today.replies)))} written`} />}
              </div>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead><tr><th scope="col">Day (UTC)</th><th scope="col" className="admin-num">Replies</th><th scope="col" className="admin-num">Neurons</th><th scope="col" className="admin-num">Accounts</th>
                    <th scope="col" className="admin-num">Tokens a reply</th><th scope="col" className="admin-num">Cached</th><th scope="col" className="admin-num">Written a reply</th>
                    <th scope="col" className="admin-num" title="Replies Groq answered because Workers AI refused">By Groq</th></tr></thead>
                  <tbody>{[...replies.days].reverse().map((row) => (
                    <tr key={row.day}><th scope="row">{day(row.day)}</th><td className="admin-num">{number.format(row.replies)}</td>
                      <td className="admin-num">{number.format(row.neurons)}</td><td className="admin-num">{number.format(row.accounts)}</td>
                      <td className="admin-num">{row.input ? number.format(Math.round(row.input / Math.max(1, row.replies))) : "–"}</td>
                      <td className="admin-num">{row.input ? `${Math.round((row.cached / row.input) * 100)}%` : "–"}</td>
                      <td className="admin-num">{row.output ? number.format(Math.round(row.output / Math.max(1, row.replies))) : "–"}</td>
                      <td className="admin-num">{number.format(row.standIns)}</td></tr>))}</tbody>
                </table>
              </div>
            </>;
          }}</Part>
          <Part title="Anonymous counts" panel={report.counts}>{(counts) => <>
            <p className="admin-lede">Counted per day with no person behind any of them (launch plan D8), over the last {counts.days.length} days, today included.</p>
            <Funnel counts={counts} />
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th scope="col">Moment</th><th scope="col" className="admin-num">{counts.days.length} days</th><th scope="col" className="admin-num">Today</th></tr></thead>
                {families.map(([family, labels]) => (
                  <tbody key={family}>
                    <tr className="admin-group-row"><th scope="rowgroup" colSpan={3}>{family}</th></tr>
                    {Object.entries(labels).map(([event, label]) => {
                      const values = counts.events[event] ?? [];
                      return <tr key={event}><th scope="row">{label}<small><code>{event}</code></small></th>
                        <td className="admin-num">{number.format(values.reduce((sum, value) => sum + value, 0))}</td><td className="admin-num">{number.format(values.at(-1) ?? 0)}</td></tr>;
                    })}
                  </tbody>
                ))}
              </table>
            </div>
            {usageEvents.some((event) => !families.some(([, labels]) => event in labels)) && (
              <p className="admin-unsorted">Not grouped yet: {usageEvents.filter((event) => !families.some(([, labels]) => event in labels)).join(", ")}. Add them to families in dev/admin/OpsAdmin.tsx.</p>)}
          </>}</Part>
          <Part title="Shared agents" panel={report.shared}>{(shared) => <>
            <div className="admin-figures"><Figure value={shared.total} label="shared with the community" /></div>
            <Recent heads={["Name", "Role", "Shared"]} rows={shared.recent.map((row) => [row.name, row.role, when(row.at)])} empty="None shared yet." />
          </>}</Part>
        </div>
      )}
    </section>
  );
}

/** What's close to running out, or already has: today's shared Neurons, Workers AI refusing, one account's replies or share, and trials about to end. */
function Alerts({ report }: { report: Extract<OpsReport, { configured: true }> }) {
  const alerts: string[] = [];
  if (report.replies.ok) {
    const { days, caps, heaviest } = report.replies.value;
    const today = days.at(-1)!;
    if (today.neurons >= caps.neurons * warnAt.neurons)
      alerts.push(`Today's Neurons are at ${Math.round((today.neurons / caps.neurons) * 100)}% of the ${number.format(caps.neurons)} everyone shares; at 100% live replies stop until 00:00 UTC.`);
    if (today.standIns)
      alerts.push(`Workers AI refused ${today.standIns} of today's ${today.replies} replies, so Groq answered them: its free allowance is spent, and frees up 24 hours after the spend.`);
    if (heaviest.replies >= caps.replies * warnAt.account) alerts.push(`One account has used ${heaviest.replies} of its ${caps.replies} replies today.`);
    if (heaviest.neurons >= caps.userNeurons * warnAt.account)
      alerts.push(`One account has used ${number.format(heaviest.neurons)} of its ${number.format(caps.userNeurons)} Neurons today.`);
  }
  if (report.accounts.ok && report.accounts.value.trialsEnding)
    alerts.push(`${report.accounts.value.trialsEnding} ${report.accounts.value.trialsEnding === 1 ? "trial ends" : "trials end"} within 7 days.`);
  if (!alerts.length) return null;
  return <ul className="admin-alerts" role="status">{alerts.map((alert) => <li key={alert}><CircleAlert size={16} aria-hidden="true" />{alert}</li>)}</ul>;
}

/** Getting started as a funnel over the period: each step's count, as a share of the step before and of everyone who saw it. */
function Funnel({ counts }: { counts: Counts }) {
  const total = (event: string) => (counts.events[event] ?? []).reduce((sum, value) => sum + value, 0);
  const shown = total("onboarding_shown");
  const percent = (part: number, whole: number) => whole ? `${Math.round((part / whole) * 100)}%` : "–";
  const labels = families[0][1];
  return (
    <>
      <h3 className="admin-sub">Getting started, step by step</h3>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">Step</th><th scope="col" className="admin-num">Times</th><th scope="col" className="admin-num">Of the step before</th><th scope="col" className="admin-num">Of the first run</th></tr></thead>
          <tbody>
            {funnel.map((event, index) => (
              <tr key={event}><th scope="row">{labels[event]}</th><td className="admin-num">{number.format(total(event))}</td>
                <td className="admin-num">{index ? percent(total(event), total(funnel[index - 1])) : ""}</td><td className="admin-num">{percent(total(event), shown)}</td></tr>
            ))}
            <tr><th scope="row">{labels.onboarding_skipped}</th><td className="admin-num">{number.format(total("onboarding_skipped"))}</td><td className="admin-num" /><td className="admin-num">{percent(total("onboarding_skipped"), shown)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="admin-lede">Counts are moments, not people: someone who runs setup twice counts twice, and Chose who answers only shows when the first run offers it.</p>
    </>
  );
}

/** The waitlist, newest first, eight at a time; an address without an account can be invited, after a confirmation. */
function WaitlistTable({ entries }: { entries: Waitlist["entries"] }) {
  const [all, setAll] = useState(false);
  const [asking, setAsking] = useState("");
  const [sent, setSent] = useState<Record<string, "sending" | "sent" | string>>({});
  if (!entries.length) return <p className="admin-lede">Nobody yet.</p>;
  const send = async (email: string) => {
    setAsking("");
    setSent((now) => ({ ...now, [email]: "sending" }));
    try { await post("/api/admin/invite", { email }); setSent((now) => ({ ...now, [email]: "sent" })); }
    catch (cause) { setSent((now) => ({ ...now, [email]: cause instanceof Error ? cause.message : "The invite failed." })); }
  };
  return (
    <>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th scope="col">Email</th><th scope="col">Source</th><th scope="col">Joined</th><th scope="col">Access</th></tr></thead>
          <tbody>{(all ? entries : entries.slice(0, 8)).map((entry) => {
            const state = sent[entry.email];
            return (
              <tr key={entry.email}>
                <th scope="row">{entry.email}</th><td>{entry.source || "direct"}</td><td>{when(entry.at)}</td>
                <td className="admin-invite">
                  {entry.account || state === "sent" ? <small>{state === "sent" ? "Invite sent" : "Has an account"}</small>
                    : state === "sending" ? <small role="status">Sending…</small>
                    : asking === entry.email ? <span role="group" aria-label={`Invite ${entry.email}`}>
                      <small>Email an invite to sign in?</small>
                      <button type="button" className="primary-button" onClick={() => void send(entry.email)}>Send invite</button>
                      <button type="button" className="quiet-button" onClick={() => setAsking("")}>Cancel</button></span>
                    : <>{state && <small className="admin-status" data-error>{state}</small>}
                      <button type="button" className="quiet-button" onClick={() => setAsking(entry.email)}><MailPlus size={14} aria-hidden="true" />Invite</button></>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {entries.length > 8 && <button type="button" className="quiet-button" onClick={() => setAll(!all)}>{all ? "Show the newest 8" : `Show all ${entries.length}`}</button>}
    </>
  );
}

function Recent({ heads, rows, empty }: { heads: string[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <p className="admin-lede">{empty}</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr>{heads.map((head) => <th key={head} scope="col">{head}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, at) => at ? <td key={at}>{cell}</td> : <th key={at} scope="row">{cell}</th>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
