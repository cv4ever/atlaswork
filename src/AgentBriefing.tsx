// The agent dialog's Briefing tab (agents-design D46): what the model reads before your message, built by the same
// functions a live reply uses (`snapshotOf`, `promptParts`, `toolsFor`), so it can't drift from what's sent. It answers
// four questions in order: how much of it is filled in, who wrote how much of it, is each part right (one row per
// source, built like the Schedule tab's routine rows, with where to change it), and what they can do and when. It
// follows the dialog's unsaved draft, and this device's linked folders (D47) from their last listing.
import { useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { Bookmark, Check, ChevronDown, Copy, Lock, MapPin, PenLine, Plus, ShieldCheck, Sprout, UserRound, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { limits, promptParts, toolProgress, toolsFor } from "../supabase/functions/agent/logic.ts";
import type { PromptSource } from "../supabase/functions/agent/logic.ts";
import { computerFolders, projectPlaces, snapshotOf } from "./agentRequest.ts";
import { agentWorkspace } from "./agentWorkspace.ts";
import { linkedFolders } from "./folders.ts";
import { atlasId, routineKinds } from "./model.ts";
import { locale } from "./dates.ts";
import type { Agent, WorkspaceData } from "./model.ts";
import * as routines from "./routines.ts";
import { routineIcons } from "./RoutineViews.tsx";
import { Tip } from "./Popups.tsx";

/** Where an edit goes: a tab of this dialog, or a Settings tab. */
export type BriefingLink = "profile" | "permissions" | "schedule" | "every" | "you";
type Source = { label: string; Icon: LucideIcon; edit?: BriefingLink; where?: string; empty?: (agents: number) => string; add?: string; note?: string };
// Sources in the order the rows show them: what you can change first, what Atlaswork fixes last.
const sources: [PromptSource, Source][] = [
  ["agent", { label: "Their profile", Icon: UserRound, edit: "profile", where: "Profile" }],
  ["every", { label: "Rules for every agent", Icon: Users, edit: "every", where: "Settings → Every agent", add: "Add rules",
    empty: (agents) => `None yet. All ${agents} agents would read them first.` }],
  ["you", { label: "About you", Icon: Sprout, edit: "you", where: "Settings → Profile", add: "Add your name",
    empty: () => "Not filled in, so they don't know what to call you." }],
  ["memory", { label: "What they remember", Icon: Bookmark, note: "From your messages",
    empty: () => "Nothing yet. Tell them something lasting in chat and they'll keep it." }],
  ["tools", { label: "Permissions", Icon: ShieldCheck, edit: "permissions", where: "Permissions" }],
  ["workspace", { label: "Where they look", Icon: MapPin, note: "Rebuilt each message" }],
  ["atlaswork", { label: "Atlaswork's ground rules", Icon: Lock, note: "The same for every agent" }],
];
type ToolDef = { function: { name: string; description: string } };
const number = new Intl.NumberFormat(locale);

export default function AgentBriefing({ agent, data, person, today, onEdit, onForget }: {
  agent: Agent; data: WorkspaceData; person: { name: string; about: string };
  /** YYYY-MM-DD, as a reply sends it. */
  today: string;
  onEdit: (link: BriefingLink) => void;
  /** Forgets one memory for good (agents-design D49); absent where nothing can be changed. */
  onForget?: (id: string) => void;
}) {
  // The profile is what people come here to check; the rest opens on demand.
  const [open, setOpen] = useState<PromptSource | null>("agent");
  const [copied, setCopied] = useState(false);
  useSyncExternalStore(linkedFolders.subscribe, linkedFolders.getSnapshot);
  const request = { agent, data, person, request: "" }, selected = agentWorkspace(request);
  // As a chat reply sees them: a computer's folders (D77) by name, else this device's links (D47) as last listed.
  const places = projectPlaces(request, selected), remote = computerFolders(data, places);
  const snapshot = snapshotOf(request, today, selected, remote.length ? remote : linkedFolders.listed(places));
  const parts = promptParts(snapshot);
  const text = parts.map((part) => part.text).join("\n");
  const name = agent.name.trim() || "they";
  const agents = data.agents.filter((item) => !item.archived).length;
  const rows = sources.map(([from, source]) => {
    const lines = parts.filter((part) => part.from === from).map((part) => part.text);
    const chars = lines.reduce((sum, line) => sum + line.length, 0);
    return { from, source, lines, chars, share: Math.round((chars / text.length) * 100) };
  });
  const yours = rows.filter((row) => row.source.edit).reduce((sum, row) => sum + row.share, 0);
  // Filled in: what a person can still add, counted from what's already there so it never starts at zero.
  const steps: [string, boolean, BriefingLink][] = [["a role", !!agent.role.trim(), "profile"], ["house rules", !!agent.instructions.trim(), "profile"],
    ["somewhere to look", agent.id === atlasId || snapshot.places.length > 0, "profile"], ["rules for every agent", !!snapshot.everyAgent, "every"],
    ["your name", !!snapshot.person?.name, "you"]];
  const done = steps.filter(([, ok]) => ok).length;
  const next = steps.find(([, ok]) => !ok);
  const tools = (toolsFor(snapshot) as ToolDef[]).map(({ function: tool }) => ({ ...tool, label: toolProgress(snapshot, tool.name) ?? tool.name }));
  const runs = routines.routinesOf(data).filter(({ owner }) => routines.runnerOf(data, owner).id === agent.id)
    .map((placed) => ({ placed, ask: routines.routineRequest(data, placed) }));
  // Measured, never estimated (D28): what their latest reply actually read, when the provider said.
  const last = data.threads.flatMap((thread) => thread.messages)
    .filter((message) => message.role === "agent" && (message.agentId ?? atlasId) === agent.id && message.usage)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0]?.usage;
  const copy = () => void navigator.clipboard.writeText(text).then(() => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  });

  return <>
    <section className="agent-section" aria-labelledby="agent-briefing">
      <h3 id="agent-briefing">What {name} reads before you say a word
        <Tip label={copied ? "Copied" : "Copy all of it"}><button type="button" className="icon-button briefing-copy" onClick={copy} aria-label={copied ? "Copied" : "Copy all of it"}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></Tip></h3>
      <div className="briefing-progress">
        <progress max={steps.length} value={done} aria-label="Filled in" />
        <small>{done} of {steps.length} filled in{next
          ? <> · next: <button type="button" className="text-button" onClick={() => onEdit(next[2])}>{next[0]}</button></>
          : ", nothing missing"}</small>
      </div>
      <p className="briefing-mix-head"><strong>{number.format(text.length)} characters</strong>, you shape {yours}% of them</p>
      <div className="briefing-mix" role="img" aria-label={rows.filter((row) => row.chars).map((row) => `${row.source.label} ${row.share}%`).join(", ")}>
        {rows.filter((row) => row.chars).map((row, at) => (
          <i key={row.from} data-from={row.from} title={`${row.source.label}: ${row.share}%`} style={{ "--share": row.chars, "--at": at } as CSSProperties} />
        ))}
      </div>
      <ul className="briefing-legend">
        {rows.filter((row) => row.chars).map((row) => <li key={row.from} data-from={row.from}><i aria-hidden="true" />{row.source.label} <b>{row.share}%</b></li>)}
      </ul>
    </section>

    <div className="briefing-rows">
      {rows.map(({ from, source, lines, chars }) => {
        const { Icon } = source;
        const expanded = open === from && lines.length > 0;
        return (
          <article key={from} className="briefing-row" data-from={from} data-empty={!lines.length || undefined}>
            <div className="briefing-head">
              <span className="briefing-seal" aria-hidden="true"><Icon size={16} /></span>
              <button type="button" className="briefing-summary" aria-expanded={lines.length ? expanded : undefined} disabled={!lines.length}
                aria-controls={`briefing-${from}`} onClick={() => setOpen(expanded ? null : from)}>
                <strong>{source.label}</strong>
                <span>{from === "memory" && lines.length ? `${selected.memories.length} ${selected.memories.length === 1 ? "memory" : "memories"}, ${number.format(chars)} characters`
                  : lines.length ? `${lines.length} ${lines.length === 1 ? "line" : "lines"}, ${number.format(chars)} characters`
                  : source.empty?.(agents)}</span>
              </button>
              {source.note ? <span className="briefing-note">{source.note}</span>
                : !lines.length && source.add ? <button type="button" className="briefing-add" onClick={() => onEdit(source.edit!)}><Plus size={14} />{source.add}</button>
                : <Tip label={`Change in ${source.where}`}><button type="button" className="icon-button" onClick={() => onEdit(source.edit!)} aria-label={`Change in ${source.where}`}><PenLine size={16} /></button></Tip>}
            </div>
            {expanded && (from === "memory" ? (
              <ul className="briefing-text briefing-memories" id={`briefing-${from}`}>
                {selected.memories.map((memory) => (
                  <li key={memory.id}>
                    <p>{memory.text}<small>{memory.topicId ? `About ${selected.memoryPlace(memory).slice(1)}` : memory.domain ? selected.nameOf(memory) : "About you"}</small></p>
                    {onForget && <Tip label="Forget"><button type="button" className="icon-button" onClick={() => onForget(memory.id)}
                      aria-label={`Forget “${memory.text}”`}><X size={14} /></button></Tip>}
                  </li>
                ))}
              </ul>
            ) : <div className="briefing-text" id={`briefing-${from}`}>{lines.map((line, index) => <p key={index}>{line}</p>)}</div>)}
          </article>
        );
      })}
    </div>

    <section className="agent-section" aria-labelledby="briefing-tools">
      <h3 id="briefing-tools">What they can do <small>{tools.length} {tools.length === 1 ? "tool" : "tools"}</small>
        <Tip label="Change in Permissions"><button type="button" className="icon-button briefing-copy" onClick={() => onEdit("permissions")} aria-label="Change in Permissions"><PenLine size={16} /></button></Tip></h3>
      {tools.length ? <ul className="briefing-tools">{tools.map((tool) => <li key={tool.name} title={tool.description}>{tool.label}</li>)}</ul>
        : <p className="agent-hint">Nothing: every tool is off, so they can only talk.</p>}
    </section>

    {runs.length > 0 && (
      <section className="agent-section" aria-labelledby="briefing-routines">
        <h3 id="briefing-routines">What their routines say <small>{runs.length}</small>
          <Tip label="Change in Schedule"><button type="button" className="icon-button briefing-copy" onClick={() => onEdit("schedule")} aria-label="Change in Schedule"><PenLine size={16} /></button></Tip></h3>
        <ul className="briefing-routines">
          {runs.map(({ placed, ask }) => {
            const RoutineIcon = routineIcons[placed.routine.kind];
            return (
              <li key={placed.routine.id} className={placed.routine.kind} data-paused={placed.routine.paused || undefined}>
                <details>
                  <summary><RoutineIcon size={15} /><strong>{routineKinds[placed.routine.kind].label}</strong> for {routines.ownerLabel(data, placed.owner)}
                    <small>{placed.routine.paused ? "Paused" : `${routines.repeatLabel(placed.routine)}, ${routines.timeLabel(placed.routine.time)}`}</small>
                    <ChevronDown size={14} className="briefing-chevron" aria-hidden="true" /></summary>
                  <p>{ask ?? "Nowhere to look right now, so it stays quiet without asking the model."}</p>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
    )}

    <p className="agent-hint briefing-after">Then up to {limits.history} messages from this session, about 6,000 characters, and yours.
      {last && ` Their last reply read ${number.format(last.input)} tokens in all.`}</p>
  </>;
}
