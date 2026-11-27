// The admin page's Agents section: the catalogue on the left, the chosen agent's defaults in the middle and, on the
// right, exactly what the model reads (PromptView.tsx), redrawn as you type. Save writes the defaults into the source
// (server.ts, source.ts); Vite then reloads the catalogue. Unsaved agent drafts and prompt wording live in this tab's
// sessionStorage, so a reload or the dev server restarting after a save keeps them. Fields and lines the last release
// doesn't have yet are marked (server.ts, `changes`).
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Hand, RotateCcw, Save, Zap } from "lucide-react";
import { warmthLabels } from "../../src/agentRequest.ts";
import { portraitSrc } from "../../src/look.ts";
import { post } from "./api.ts";
import { catalogue, draftOf, noSample, noWording, sameDraft } from "./catalogue.ts";
import type { Draft, Entry, Wording } from "./catalogue.ts";
import { patchLimits } from "./limits.ts";
import { PromptView } from "./PromptView.tsx";
import type { Look, ProfileField } from "./PromptView.tsx";
import type { Changes, Saved } from "./server.ts";

const draftsKey = "atlaswork.admin.drafts", wordingKey = "atlaswork.admin.wording", savedKey = "atlaswork.admin.saved";
const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(sessionStorage.getItem(key) ?? "null") as T ?? fallback; } catch { return fallback; } };

export default function AgentsAdmin({ selected }: { selected: string }) {
  const groups = catalogue();
  const entries = groups.flatMap((group) => group.entries);
  const entry = entries.find((item) => item.key === selected) ?? entries[0];
  // Drafts that match the source (saved, or typed back) are dropped, so the list's marks stay true.
  const [drafts, setDrafts] = useState(() => Object.fromEntries(Object.entries(stored<Record<string, Draft>>(draftsKey, {}))
    .filter(([key, draft]) => { const found = entries.find((item) => item.key === key); return found && !sameDraft(draft, draftOf(found)); })));
  useEffect(() => { sessionStorage.setItem(draftsKey, JSON.stringify(drafts)); }, [drafts]);
  const edit = (key: string, draft: Draft | null) => setDrafts(({ [key]: _old, ...rest }) => draft ? { ...rest, [key]: draft } : rest);
  const [wording, setWording] = useState<Wording>(() => ({ ...noWording, ...stored(wordingKey, noWording) }));
  useEffect(() => { sessionStorage.setItem(wordingKey, JSON.stringify(wording)); }, [wording]);
  // What the right-hand column shows stays as you move between agents.
  const [look, setLook] = useState<Look>({ view: "prompt", seed: "demo", sample: { ...noSample, name: "Alex" } });
  const [changes, setChanges] = useState<Changes | null>(null);
  const loadChanges = () => void post<Changes>("/api/admin/changes").then(setChanges, () => setChanges(null));
  useEffect(loadChanges, []);
  const unreleased = new Set(changes?.agents.filter((change) => change.name === entry.suggestion.name).map((change) => change.field));
  return (
    <div className="admin-agents">
      <nav className="admin-roster" aria-label="Agents">
        {groups.map((group) => (
          <section key={group.title}>
            <h2>{group.title}</h2>
            <ul>
              {group.entries.map((item) => (
                <li key={item.key}>
                  <a href={`#agents/${encodeURIComponent(item.key)}`} aria-current={item.key === entry.key ? "page" : undefined}>
                    <img src={portraitSrc(item.suggestion)} alt="" width={32} height={32} />
                    <span><strong>{item.kind === "template" ? "Steward" : item.suggestion.name}</strong><small>{item.kind === "template" ? "Named after your domain" : item.suggestion.role}</small></span>
                    {drafts[item.key] && !sameDraft(drafts[item.key], draftOf(item)) && <i className="admin-dirty" title="Unsaved changes" aria-label="Unsaved changes" />}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
      <AgentDetail key={entry.key} entry={entry} draft={drafts[entry.key] ?? draftOf(entry)} unreleased={unreleased} onSaved={loadChanges}
        onDraft={(draft) => edit(entry.key, !draft || sameDraft(draft, draftOf(entry)) ? null : draft)}>
        {(draft, onField) => <PromptView entry={entry} draft={draft} saved={draftOf(entry)} look={look} onLook={setLook}
          wording={wording} onWording={setWording} changes={changes} onSaved={loadChanges} onField={onField} />}
      </AgentDetail>
    </div>
  );
}

function Field({ label, hint, count, released = true, children }: { label: string; hint?: string; count?: [number, number]; released?: boolean; children: ReactNode }) {
  return (
    <label className="admin-field">
      <span>{label}{!released && <em className="admin-unreleased">Not released</em>}{count && <small data-over={count[0] > count[1] || undefined}>{count[0]} / {count[1]}</small>}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/**
 * The chosen agent's defaults, and the column `children` draws beside them. `onDraft(null)` drops the draft: after
 * Revert, or once Save wrote it. `unreleased` names the fields the last release holds differently.
 */
function AgentDetail({ entry, draft, unreleased, onDraft, onSaved, children }: {
  entry: Entry; draft: Draft; unreleased: Set<string>; onDraft: (draft: Draft | null) => void; onSaved: () => void;
  children: (draft: Draft, onField: (field: ProfileField) => void) => ReactNode;
}) {
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ error?: string; saved?: Saved } | null>(() => {
    const kept = JSON.parse(sessionStorage.getItem(savedKey) ?? "null") as { key: string; saved: Saved } | null;
    return kept?.key === entry.key ? { saved: kept.saved } : null;
  });
  useEffect(() => { sessionStorage.removeItem(savedKey); }, []);
  const saved = draftOf(entry);
  const dirty = !sameDraft(draft, saved);
  const atlas = entry.kind === "atlas", template = entry.kind === "template";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => { setStatus(null); onDraft({ ...draft, [key]: value }); };
  const checked: (keyof typeof patchLimits)[] = atlas ? ["role", "instructions"] : ["role", "instructions", "why", "says"];
  const invalid = checked.some((key) => !draft[key]?.trim() || draft[key].trim().length > patchLimits[key]);
  /** A prompt line's profile field, focused and in view. */
  const onField = (field: ProfileField) => {
    const target = document.getElementById(field);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    (target?.matches("input, textarea") ? target : target?.querySelector<HTMLElement>("[aria-pressed='true'], button"))?.focus({ preventScroll: true });
  };

  const save = async () => {
    const patch = Object.fromEntries((Object.keys(draft) as (keyof Draft)[]).filter((key) => draft[key] !== saved[key])
      .map((key) => [key, key === "warmth" ? draft.warmth ?? null : draft[key]]));
    setSaving(true);
    try {
      const result = await post<Saved>("/api/admin/agent", { name: entry.key, patch });
      // Vite reloads the catalogue after the write; keep the result for a full reload.
      sessionStorage.setItem(savedKey, JSON.stringify({ key: entry.key, saved: result }));
      setStatus({ saved: result });
      onDraft(null);
      onSaved();
    } catch (cause) {
      setStatus({ error: cause instanceof Error ? cause.message : "Saving failed." });
    } finally { setSaving(false); }
  };

  const { suggestion } = entry;
  const facts = [
    suggestion.domain ? `Looks after ${suggestion.domain}` : atlas ? "Leads in every domain" : template ? "Looks after the domain you named" : suggestion.work ? "Offered for work" : "Offered for everything",
    atlas ? "Morning check-in, Monday review" : "Weekly improvement",
    atlas ? "Always has every tool" : "Workspace tools on, outside tools off",
  ];
  return (
    <>
      <section className="admin-editor" aria-labelledby="agent-name">
        <header className="admin-agent-head">
          <img src={portraitSrc(suggestion)} alt="" width={64} height={64} />
          <div>
            <h1 id="agent-name">{template ? "Steward for a domain you name" : suggestion.name}</h1>
            <p>{facts.join(" · ")}</p>
          </div>
        </header>
        {!atlas && !template && <p className="admin-bubble"><span>{draft.says}</span></p>}
        {template ? (
          <p className="admin-note">Written per domain by <code>stewardForOwn</code> in <code>src/suggestedAgents.ts</code>: a spare name and face, and house rules built from the domain&rsquo;s name and what it&rsquo;s for. The preview names an Allotment domain. Change it in code.</p>
        ) : (
          <div className="admin-form">
            <Field label="Role" count={[draft.role.trim().length, patchLimits.role]} released={!unreleased.has("role")}>
              <input id="field-role" value={draft.role} onChange={(event) => set("role", event.target.value)} />
            </Field>
            {!atlas && <>
              <Field label="Hook" hint="The one line on their onboarding card." count={[draft.why.trim().length, patchLimits.why]} released={!unreleased.has("why")}>
                <input value={draft.why} onChange={(event) => set("why", event.target.value)} />
              </Field>
              <Field label="What they say" hint="Their speech bubble in onboarding: a proposal in their own voice." count={[draft.says.trim().length, patchLimits.says]} released={!unreleased.has("says")}>
                <textarea rows={2} value={draft.says} onChange={(event) => set("says", event.target.value)} />
              </Field>
            </>}
            <Field label="House rules" hint="What they do, written for the model: the work, a good proposal, the one line they never cross. Tone belongs to Personality."
              count={[draft.instructions.trim().length, patchLimits.instructions]} released={!unreleased.has("instructions")}>
              <textarea id="field-instructions" rows={7} value={draft.instructions} onChange={(event) => set("instructions", event.target.value)} />
            </Field>
              <div className="admin-field" role="group" aria-labelledby="write-mode">
                <span id="write-mode">Write mode{unreleased.has("writeMode") && <em className="admin-unreleased">Not released</em>}</span>
                <div className="segmented-control">
                  {([["propose", "Asks first", Hand], ["full", "Proactive", Zap]] as const).map(([mode, label, Icon]) => (
                    <button key={mode} type="button" aria-pressed={draft.writeMode === mode} onClick={() => set("writeMode", mode)}><Icon size={14} aria-hidden="true" />{label}</button>
                  ))}
                </div>
              </div>
              <div className="admin-field" role="group" aria-labelledby="personality-label" id="personality">
                <span id="personality-label">Personality{unreleased.has("warmth") && <em className="admin-unreleased">Not released</em>}</span>
                <div className="segmented-control">
                  <button type="button" aria-pressed={draft.warmth === undefined} onClick={() => set("warmth", undefined)} title="Follows Settings → Every agent (Even unless the person changed it)">Default</button>
                  {warmthLabels.map((label, value) => (
                    <button key={label} type="button" aria-pressed={draft.warmth === value} onClick={() => set("warmth", value)}>{label}</button>
                  ))}
                </div>
              </div>
            <div className="admin-actions">
              <button type="button" className="primary-button" disabled={!dirty || invalid || saving} onClick={() => void save()}>
                <Save size={16} aria-hidden="true" />{saving ? "Saving…" : "Save to source"}</button>
              <button type="button" className="quiet-button" disabled={!dirty || saving} onClick={() => { setStatus(null); onDraft(null); }}>
                <RotateCcw size={14} aria-hidden="true" />Revert</button>
              <p className="admin-status" role="status" data-error={status?.error ? true : undefined}>
                {status?.error ?? (status?.saved ? savedLine(status.saved) : dirty ? "Unsaved: the prompt on the right already shows it." : "")}
              </p>
            </div>
          </div>
        )}
      </section>
      {children(draft, onField)}
    </>
  );
}

function savedLine({ files, retired }: Saved) {
  if (!files.length) return "Nothing changed in the source.";
  return `Saved to ${files.join(" and ")}.${retired ? " The shipped version is retired, so agents still holding it get this one." : ""} Run the model comparison before a release (DEVELOPMENT.md, "Live agents").`;
}
