// The admin page's Changes section: what the agents' defaults, Atlaswork's ground rules, line templates, tool
// descriptions, the commands' prompt lines and the listing limits say now against the last release (the newest
// `release-*` tag; server.ts, `changes`), so a release is reviewed before `pnpm run release` ships it. Read from this
// checkout's files, saved or not yet committed.
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatDate } from "../../src/dates.ts";
import { post } from "./api.ts";
import type { Changes } from "./server.ts";

const fieldLabels: Record<string, string> = { role: "Role", instructions: "House rules", writeMode: "Write mode", warmth: "Personality", why: "Hook", says: "What they say" };
const shown = (value: string | number | undefined, field = "") => value === undefined ? (field === "warmth" ? "Default" : "None")
  : field === "writeMode" ? (value === "full" ? "Proactive" : "Asks first") : field === "warmth" ? ["Crisp", "Cool", "Even", "Friendly", "Warm"][Number(value)] ?? String(value) : String(value);

function Diff({ before, after, missing }: { before?: string; after: string; missing: string }) {
  return (
    <div className="admin-diff">
      <p data-side="before"><span>Released</span>{before ?? <em>{missing}</em>}</p>
      <p data-side="after"><span>Now</span>{after}</p>
    </div>
  );
}

function Change({ title, before, after, missing }: { title: string; before?: string; after: string; missing: string }) {
  return <li className="admin-change"><h3>{title}</h3><Diff before={before} after={after} missing={missing} /></li>;
}

export default function ChangesAdmin() {
  const [changes, setChanges] = useState<Changes | null>(null);
  const [error, setError] = useState("");
  const load = () => void post<Changes>("/api/admin/changes").then((next) => { setChanges(next); setError(""); }, (cause: Error) => setError(cause.message));
  useEffect(load, []);
  const groups = ([["rule", "Ground rules", "Not in the release in this wording"], ["template", "Line templates", "Not in the release in this wording"],
    ["command", "Tool instructions in the prompt", "New command"], ["tool", "Tool descriptions", "Not in the release in this wording"], ["limit", "How much a prompt lists", "Not a setting in the release"]] as const)
    .map(([kind, title, missing]) => ({ kind, title, missing, lines: changes?.lines.filter((line) => line.kind === kind) ?? [] }));
  const byAgent = new Map<string, Changes["agents"]>();
  for (const change of changes?.agents ?? []) byAgent.set(change.name, [...byAgent.get(change.name) ?? [], change]);
  const count = byAgent.size + (changes?.lines.length ?? 0);
  return (
    <section className="admin-page" aria-labelledby="changes-title">
      <header className="admin-head">
        <div><h1 id="changes-title">Changes</h1>
          <p>{changes?.release ? <>What the agents read now against <code>{changes.release.tag}</code>, released {formatDate(new Date(changes.release.date), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: {count ? `${count} ${count === 1 ? "change ships" : "changes ship"} with the next release.` : "nothing has changed since."} This checkout&rsquo;s files, committed or not.</>
            : changes ? "No release tag (release-*) was found in this checkout, so there's nothing to compare with." : "Comparing with the last release…"}</p></div>
        <button type="button" className="secondary-button" onClick={load}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
      </header>
      {error && <p className="admin-status" data-error>{error}</p>}
      {byAgent.size > 0 && <>
        <h2 className="admin-section-title">Agents <small>{byAgent.size}</small></h2>
        <ul className="admin-changes">{[...byAgent].map(([name, fields]) => (
          <li key={name} className="admin-change">
            <h3><a href={`#agents/${encodeURIComponent(name)}`}>{name}</a>{fields[0].added && <em className="admin-unreleased">New agent</em>}</h3>
            {fields.map((change) => (
              <div key={change.field} className="admin-change-field">
                <h4>{fieldLabels[change.field] ?? change.field}</h4>
                <Diff before={change.added || (change.before === undefined && change.field !== "warmth") ? undefined : shown(change.before, change.field)}
                  after={shown(change.after, change.field)} missing={change.added ? "Not in the release" : "Not set"} />
              </div>
            ))}
          </li>))}</ul>
      </>}
      {groups.filter((group) => group.lines.length).map((group) => (
        <div key={group.kind}>
          <h2 className="admin-section-title">{group.title} <small>{group.lines.length}</small></h2>
          <ul className="admin-changes">{group.lines.map((line) => <Change key={line.name} title={line.name} before={line.before} after={line.after} missing={group.missing} />)}</ul>
        </div>
      ))}
      {count > 0 && <p className="admin-lede">Before releasing changed house rules or prompt lines, run the model comparison (Agents → Cases, or README &ldquo;Live agents&rdquo;), then <code>pnpm run release</code>.</p>}
    </section>
  );
}
