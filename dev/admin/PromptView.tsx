// The Agents section's right-hand column: the exact system prompt and tools (catalogue.ts), Try it and Cases
// (AgentTrials.tsx), and about how many tokens a call sends. Every line says where it comes from and how to change it:
// a ground rule, a line template (the wording around what the request fills in), a command's prompt line or a tool's
// description is edited in place and saved to its source file (server.ts, source.ts), one draft for every agent; a
// profile line jumps to its field; a line the person fills in opens the sample person. Lines a draft changes, and
// lines the last release doesn't have yet, are marked, and the token count shows the draft against what's saved.
import { useDeferredValue, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowLeft, Check, Copy, PenLine, Save, UserRound, X } from "lucide-react";
import { limits, slotsOf, templateSlots } from "../../supabase/functions/agent/logic.ts";
import type { LineTemplate, PromptPart } from "../../supabase/functions/agent/logic.ts";
import { post } from "./api.ts";
import { Cases, TryIt } from "./AgentTrials.tsx";
import { briefingOf, budgetOf, noWording, placed, sameDraft, savedWording, tokensOf, wordingCount } from "./catalogue.ts";
import type { Draft, Entry, Sample, Seed, Wording } from "./catalogue.ts";
import { lineLimit } from "./limits.ts";
import type { Changes, LineKind, Saved } from "./server.ts";

export const sourceLabels = { agent: "Their profile", every: "Rules for every agent", you: "About you", memory: "What they remember",
  tools: "Permissions", workspace: "Where they look", atlaswork: "Atlaswork's ground rules" } as const;
type Source = keyof typeof sourceLabels;
/** The right-hand column: which view, the workspace the prompt is built in, and the person it talks to. */
export type Look = { view: "prompt" | "try" | "cases"; seed: Seed; sample: Sample };
/** A profile field a line comes from, by the id its control carries in the middle column. */
export type ProfileField = "field-role" | "field-instructions" | "personality";
type Kind = Exclude<LineKind, "limit">;
const fieldOfKind = { rule: "rules", template: "templates", tool: "tools", command: "commands" } as const;
const kindWords: Record<Kind, (name: string) => string> = {
  rule: (name) => `Ground rule ${name}, in the agent function's texts.ts: every agent who gets this line reads it.`,
  template: (name) => `Template ${name}, in the agent function's texts.ts: the words around what each request fills in, for every agent.`,
  command: (name) => `${name}'s prompt line, in its file in src/commands/: every agent who has this command reads it.`,
  tool: (name) => `What the ${name} tool says it does, sent with every call that offers it.`,
};
/** Templates whose lines are lists, with the template of one item. */
const itemOf: Partial<Record<LineTemplate, LineTemplate>> = { notes: "noteItem", notesAndOlder: "noteItem", memories: "memoryItem", folders: "folderItem",
  computerFolders: "computerFolderItem" };
const number = new Intl.NumberFormat("en");

/** Which editable wording a part is, as `<kind>:<name>`, or nothing. */
const lineKey = (part: PromptPart) => part.rule ? `rule:${part.rule}` : part.template ? `template:${part.template}` : part.command ? `command:${part.command}` : "";
/** The profile field an agent line wraps. */
const fieldOf = (part: PromptPart): ProfileField | undefined => part.from !== "agent" ? undefined
  : part.template === "tone" ? "personality" : part.template === "intro" ? "field-role" : "field-instructions";
const split = (key: string) => key.split(":") as [Kind, string];

export function PromptView({ entry, draft, saved, look, onLook, wording, onWording, changes, onSaved, onField }: {
  entry: Entry; draft: Draft; saved: Draft; look: Look; onLook: (look: Look) => void;
  wording: Wording; onWording: (wording: Wording) => void; changes: Changes | null; onSaved: () => void; onField: (field: ProfileField) => void;
}) {
  const { view, seed, sample } = look;
  // Typing redraws the form at once and the prompt a beat later.
  const shown = useDeferredValue(draft);
  const words = useDeferredValue(wording);
  const [hidden, setHidden] = useState<Source[]>([]);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState("");
  const [sampleOpen, setSampleOpen] = useState(false);
  const [status, setStatus] = useState<{ key: string; text: string; error?: boolean } | null>(null);
  const now = placed(entry, shown, seed);
  const briefing = briefingOf(now.agent, now.data, { sample, wording: words });
  // The same agent with nothing unsaved: lines the drafts change are marked, and the token count says what they cost.
  const was = placed(entry, saved, seed);
  const savedBriefing = sameDraft(shown, saved) && !wordingCount(words) ? briefing : briefingOf(was.agent, was.data, { sample });
  const before = new Set(sameDraft(shown, saved) ? briefing.parts.map((part) => part.text)
    : briefingOf(was.agent, was.data, { sample, wording: words }).parts.map((part) => part.text));
  const budget = budgetOf(briefing), savedBudget = budgetOf(savedBriefing);
  const stored = savedWording();
  const savedText = (key: string) => { const [kind, name] = split(key); return (stored[fieldOfKind[kind]] as Record<string, string>)[name]; };
  const draftOfLine = (key: string) => { const [kind, name] = split(key); return (wording[fieldOfKind[kind]] as Record<string, string>)[name]; };
  const setLine = (key: string, text: string | undefined) => {
    const [kind, name] = split(key), field = fieldOfKind[kind];
    const { [name]: _old, ...rest } = wording[field] as Record<string, string>;
    onWording({ ...wording, [field]: text === undefined || text === savedText(key) ? rest : { ...rest, [name]: text } });
  };
  const unreleased = (key: string) => changes?.lines.some((line) => `${line.kind}:${line.name}` === key);
  const pending = wordingCount(wording);

  const saveLine = async (key: string) => {
    const [kind, name] = split(key);
    const text = draftOfLine(key) ?? savedText(key);
    // This agent's tokens per call with only this line changed, against what's saved.
    const only = { ...noWording, [fieldOfKind[kind]]: { [name]: text } };
    const after = budgetOf(briefingOf(was.agent, was.data, { sample, wording: only })).total;
    try {
      const result = await post<Saved>("/api/admin/line", { kind, name, text });
      setLine(key, undefined);
      setEditing("");
      setStatus({ key, text: !result.files.length ? "Nothing changed in the source."
        : `Saved to ${result.files[0]}: ${entry.suggestion.name} here goes from about ${number.format(savedBudget.total)} to ${number.format(after)} tokens per call. Every agent reads it from the next release.${result.files[0].endsWith("logic.ts") ? " The dev server restarts to pick it up." : ""}` });
      onSaved();
    } catch (cause) {
      setStatus({ key, text: cause instanceof Error ? cause.message : "Saving failed.", error: true });
    }
  };
  /** The editor for the wording `key` (and, for a list, its item template), with Save, Done and Discard. */
  const editor = (key: string, rows: number) => {
    const [kind, name] = split(key);
    const item = kind === "template" ? itemOf[name as LineTemplate] : undefined;
    const field = (fieldKey: string, label: string) => (
      <textarea aria-label={label} value={draftOfLine(fieldKey) ?? savedText(fieldKey)} maxLength={lineLimit} rows={rows}
        onChange={(event) => setLine(fieldKey, kind === "template" ? event.target.value : event.target.value.replace(/\s*\n\s*/g, " "))} />
    );
    const unsaved = [key, ...item ? [`template:${item}`] : []].filter((each) => draftOfLine(each) !== undefined);
    // Per template: slots it may use (`templateSlots`), ones the draft leaves out (no longer sent) and unknown ones (refused).
    const slotNotes = kind !== "template" ? [] : [name as LineTemplate, ...item ? [item] : []].map((template) => {
      const used = slotsOf(draftOfLine(`template:${template}`) ?? savedText(`template:${template}`));
      return { template, allowed: templateSlots[template], left: templateSlots[template].filter((slot) => !used.includes(slot)), unknown: used.filter((slot) => !templateSlots[template].includes(slot)) };
    });
    const unknown = slotNotes.flatMap((note) => note.unknown);
    const braces = (slots: string[]) => slots.map((slot) => `{${slot}}`).join(", ");
    return (
      <div className="admin-line-edit">
        {field(key, `Wording of ${name}`)}
        {item && <label className="admin-field"><span>Each item <small>{item}</small></span>{field(`template:${item}`, `Wording of ${item}`)}</label>}
        <small>{kindWords[kind](name)}{slotNotes.map((note) => ` ${note.template} can use ${braces(note.allowed) || "no slots"}.`).join("")}</small>
        {slotNotes.filter((note) => note.left.length).map((note) => (
          <small key={note.template} className="admin-status">{note.template} leaves out {braces(note.left)}, so the model no longer gets {note.left.length === 1 ? "it" : "them"}.</small>))}
        {unknown.length > 0 && <small className="admin-status" data-error>{braces(unknown)} isn&rsquo;t filled in by the code; the model would read it as written.</small>}
        <div className="admin-actions">
          <button type="button" className="primary-button" disabled={!unsaved.length || unknown.length > 0}
            onClick={() => void (async () => { for (const each of unsaved) await saveLine(each); })()}><Save size={16} aria-hidden="true" />Save to source</button>
          <button type="button" className="quiet-button" onClick={() => setEditing("")}>Done</button>
          <button type="button" className="quiet-button" disabled={!unsaved.length} onClick={() => { for (const each of unsaved) setLine(each, undefined); }}><X size={14} aria-hidden="true" />Discard</button>
        </div>
      </div>
    );
  };

  const sources = (Object.keys(sourceLabels) as Source[]).map((from) => ({ from, chars: briefing.parts.filter((part) => part.from === from).reduce((sum, part) => sum + part.text.length, 0) }))
    .filter((source) => source.chars);
  const copy = () => void navigator.clipboard.writeText(briefing.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); });
  const toggle = (from: Source) => setHidden((now) => now.includes(from) ? now.filter((item) => item !== from) : [...now, from]);
  const setSample = (patch: Partial<Sample>) => onLook({ ...look, sample: { ...sample, ...patch } });
  const delta = budget.total - savedBudget.total;
  return (
    <section className="admin-prompt" aria-label="What the model gets">
      <header className="admin-prompt-head">
        <div className="segmented-control admin-views" role="radiogroup" aria-label="Show">
          {([["prompt", "System prompt"], ["try", "Try it"], ["cases", "Cases"]] as const).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={view === value} onClick={() => onLook({ ...look, view: value })}>{label}</button>
          ))}
        </div>
        {view !== "cases" && <>
          <div className="segmented-control" role="radiogroup" aria-label="Workspace">
            {([["demo", "Demo workspace"], ["new", "New person"]] as const).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={seed === value} onClick={() => onLook({ ...look, seed: value })}>{label}</button>
            ))}
          </div>
          <button type="button" className="secondary-button" aria-expanded={sampleOpen} onClick={() => setSampleOpen(!sampleOpen)}>
            <UserRound size={16} aria-hidden="true" />{sample.name.trim() || "Sample person"}</button>
        </>}
        {view === "prompt" && <button type="button" className="icon-button" onClick={copy} aria-label={copied ? "Copied" : "Copy the prompt"} title={copied ? "Copied" : "Copy the prompt"}>
          {copied ? <Check size={16} /> : <Copy size={16} />}</button>}
      </header>
      {view !== "cases" && sampleOpen && (
        <fieldset className="admin-sample">
          <legend>The person they talk to</legend>
          <p className="admin-lede">What each person fills in themselves, so you can see and try the lines it adds. Kept in this tab only.</p>
          <label className="admin-field"><span>Name</span><input value={sample.name} maxLength={40} placeholder="None" onChange={(event) => setSample({ name: event.target.value })} /></label>
          <label className="admin-field"><span>About them <small>Settings → Profile</small></span>
            <textarea rows={2} value={sample.about} maxLength={300} placeholder="Works from home; two kids; training for a 10K." onChange={(event) => setSample({ about: event.target.value })} /></label>
          <label className="admin-field"><span>Rules for every agent <small>{sample.everyAgent.trim().length} / {limits.everyAgent}</small></span>
            <textarea rows={2} value={sample.everyAgent} maxLength={limits.everyAgent} placeholder="Answer in Portuguese. Never schedule anything on Sundays." onChange={(event) => setSample({ everyAgent: event.target.value })} /></label>
          <label className="admin-field"><span>What agents remember about them <small>one per line</small></span>
            <textarea rows={3} value={sample.memories} placeholder={"Prefers mornings for exercise.\nVegetarian."} onChange={(event) => setSample({ memories: event.target.value })} /></label>
        </fieldset>
      )}
      {pending > 0 && (
        <p className="admin-pending" role="status">
          {pending === 1 ? "1 piece of wording is" : `${pending} pieces of wording are`} unsaved, shared by every agent.
          {(Object.keys(wording.rules).length > 0 || Object.keys(wording.templates).length > 0) && " Try it and Cases read the saved ground rules and templates until you save."}
          <button type="button" className="text-button" onClick={() => onWording(noWording)}>Discard all</button>
        </p>
      )}
      {view === "try" && <TryIt entry={entry} draft={shown} dirty={!sameDraft(shown, saved)} seed={seed} sample={sample} wording={words} />}
      {view === "cases" && <Cases entry={entry} draft={shown} dirty={!sameDraft(shown, saved)} />}
      {view === "prompt" && <>
        <p className="admin-prompt-sum">About <strong>{number.format(budget.total)}</strong> tokens on a reply&rsquo;s first call: <strong>{number.format(budget.prompt)}</strong> of system prompt
          ({briefing.parts.length} lines) and <strong>{number.format(budget.tools)}</strong> of tool descriptions ({briefing.tools.filter((tool) => !tool.later).length} tools)
          {delta !== 0 && <>, <b className="admin-delta" data-down={delta < 0 || undefined}>{delta > 0 ? "+" : "−"}{number.format(Math.abs(delta))}</b> against what&rsquo;s saved</>}.
          {budget.later > 0 && <>{" "}{briefing.tools.filter((tool) => tool.later).length} more tools ({number.format(budget.later)}) join once their lookup ran.</>}
          {" "}A reply that calls tools sends it again each round, with up to {limits.history} messages of the session; Cases shows what whole replies read.
          {" "}Built for {seed === "demo" ? "the demo" : "a new person's workspace"} on {now.data.domains.filter((domain) => !domain.archived).length} domains; hover a line to change it.</p>
        <div className="briefing-mix" role="img" aria-label={sources.map((source) => `${sourceLabels[source.from]} ${Math.round((source.chars / briefing.text.length) * 100)}%`).join(", ")}>
          {sources.map((source, at) => <i key={source.from} data-from={source.from} style={{ "--share": source.chars, "--at": at } as CSSProperties} />)}
        </div>
        <ul className="admin-sources" aria-label="Show lines from">
          {sources.map((source) => (
            <li key={source.from} data-from={source.from}>
              <button type="button" aria-pressed={!hidden.includes(source.from)} onClick={() => toggle(source.from)}>
                <i aria-hidden="true" />{sourceLabels[source.from]} <b>{number.format(tokensOf(source.chars))}</b></button>
            </li>
          ))}
        </ul>
        <ol className="admin-lines">
          {briefing.parts.map((part, index) => {
            if (hidden.includes(part.from)) return null;
            const key = lineKey(part), field = fieldOf(part);
            const item = part.template && itemOf[part.template];
            const unsaved = !!key && (draftOfLine(key) !== undefined || (!!item && draftOfLine(`template:${item}`) !== undefined));
            const marks = [!before.has(part.text) && "Your draft", unsaved && "Unsaved", key && (unreleased(key) || (item && unreleased(`template:${item}`))) && "Not released"].filter(Boolean) as string[];
            return (
              <li key={index} data-from={part.from} data-changed={!before.has(part.text) || unsaved || undefined} data-editing={editing === key && key ? true : undefined}>
                <i aria-hidden="true" title={sourceLabels[part.from]} />
                {editing === key && key ? editor(key, Math.min(8, Math.ceil(part.text.length / 70) + 1)) : <p>{part.text}</p>}
                <span className="admin-line-side">
                  {marks.map((mark) => <small key={mark} data-mark={mark}>{mark}</small>)}
                  <small className="admin-line-tokens" title="About this many tokens">{number.format(tokensOf(part.text.length))}</small>
                  {key && editing !== key && <button type="button" className="icon-button" onClick={() => { setStatus(null); setEditing(key); }}
                    aria-label="Edit this wording" title={part.template ? "Edit the words around what's filled in" : "Edit this wording"}><PenLine size={16} /></button>}
                  {field && <button type="button" className="icon-button" onClick={() => onField(field)} aria-label="Change in their profile" title="Change in their profile"><ArrowLeft size={16} /></button>}
                  {(part.from === "you" || part.from === "every" || part.from === "memory") && <button type="button" className="icon-button" onClick={() => setSampleOpen(true)}
                    aria-label="Change the sample person" title="Each person writes this; change the sample person"><UserRound size={16} /></button>}
                </span>
                {status?.key === key && key && <p className="admin-status admin-line-status" role="status" data-error={status.error || undefined}>{status.text}</p>}
              </li>
            );
          })}
        </ol>
        <h3 className="admin-sub">What they can do <small>{briefing.tools.length} tools, about {number.format(budget.tools)} tokens</small></h3>
        <ol className="admin-lines admin-tools">
          {briefing.tools.map((tool) => {
            const key = `tool:${tool.name}`, editable = savedText(key) !== undefined, unsaved = draftOfLine(key) !== undefined;
            const marks = [unsaved && "Unsaved", editable && unreleased(key) && "Not released"].filter(Boolean) as string[];
            return (
              <li key={tool.name} data-from="tools" data-changed={unsaved || undefined} data-editing={editing === key || undefined}>
                <i aria-hidden="true" title={tool.label} />
                {editing === key ? editor(key, 3) : <p><code>{tool.name}</code> {tool.description}</p>}
                <span className="admin-line-side">
                  {marks.map((mark) => <small key={mark} data-mark={mark}>{mark}</small>)}
                  <small className="admin-line-tokens" title="About this many tokens, its parameters included">{number.format(tokensOf(tool.chars))}</small>
                  {editable && editing !== key && <button type="button" className="icon-button" onClick={() => { setStatus(null); setEditing(key); }}
                    aria-label={`Edit what ${tool.name} says it does`} title="Edit what it says it does"><PenLine size={16} /></button>}
                </span>
                {status?.key === key && <p className="admin-status admin-line-status" role="status" data-error={status.error || undefined}>{status.text}</p>}
              </li>
            );
          })}
        </ol>
        {briefing.routines.length > 0 && <>
          <h3 className="admin-sub">What their routines ask <small>{briefing.routines.length}</small></h3>
          <ul className="admin-routines">
            {briefing.routines.map((routine) => (
              <li key={routine.id}><strong>{routine.label}</strong> <small>{routine.when}</small>
                <p>{routine.ask ?? "Nowhere to look right now, so it stays quiet without asking the model."}</p></li>
            ))}
          </ul>
        </>}
      </>}
    </section>
  );
}
