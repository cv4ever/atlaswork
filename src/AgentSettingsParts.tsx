// The controls the agent dialog and Settings → Every agent share (agents-design D46): the Personality sliders, which
// show a value an agent inherits and offer to follow it again, and the tool switches in their two sections.
import { useId } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Bookmark, FileText, FolderInput, FolderOpen, Globe, LayoutGrid, ListChecks, Mail, MessagesSquare, Plus } from "lucide-react";
import { detailLabels, warmthLabels } from "./agentRequest.ts";
import { agentTools, domainHues } from "./model.ts";
import type { ToolId } from "./model.ts";

export const toolIcons: Record<ToolId, ReactNode> = {
  "read-notes": <FileText size={16} />, "see-tasks": <ListChecks size={16} />, "read-files": <FolderOpen size={16} />, "tidy-files": <FolderInput size={16} />,
  "add-tasks": <Plus size={16} />, "arrange-pages": <LayoutGrid size={16} />,
  remember: <Bookmark size={16} />, "ask-agents": <MessagesSquare size={16} />,
  web: <Globe size={16} />, email: <Mail size={16} />,
};

/** Warmth runs cool to warm through the domain hues, so the scale changes with the palette. */
const warmthScale = `linear-gradient(to right, ${domainHues.Sky}, ${domainHues.Sage} 35%, ${domainHues.Marigold} 70%, ${domainHues.Clay})`;

type Tone = { warmth: number; detail: number };
/**
 * Warmth and detail. `own` is what's set here (absent: `fallback` applies, marked with `follow.tag`); a set value
 * offers `follow.reset`, which clears it.
 */
export function PersonalitySliders({ own, fallback, follow, onChange }: { own: Partial<Tone>; fallback: Tone; follow: { tag: string; reset: string };
  onChange: (patch: { warmth?: number; detail?: number }) => void }) {
  const id = useId();
  const sliders = [
    { key: "warmth" as const, label: "Warmth", labels: warmthLabels, ends: ["🧊", "☀️"] },
    { key: "detail" as const, label: "Detail", labels: detailLabels, ends: ["✏️", "📚"] },
  ];
  return sliders.map(({ key, label, labels, ends }) => {
    const value = own[key] ?? fallback[key];
    return (
      <div key={key} className={`agent-slider ${key === "warmth" ? "warmth" : ""}`}>
        <span className="slider-head">
          <label htmlFor={`${id}-${key}`}>{label} <b>{labels[value]}</b></label>
          {own[key] === undefined ? <small className="slider-source">{follow.tag}</small>
            : <button type="button" className="text-button" onClick={() => onChange({ [key]: undefined })}>{follow.reset}</button>}
        </span>
        <span className="slider-row"><span aria-hidden="true">{ends[0]}</span>
          <input id={`${id}-${key}`} type="range" min={0} max={labels.length - 1} step={1} value={value} aria-valuetext={labels[value]}
            style={{ "--fill": `${(value / (labels.length - 1)) * 100}%`, ...(key === "warmth" && { "--warmth-scale": warmthScale }) } as CSSProperties}
            onChange={(event) => onChange({ [key]: Number(event.target.value) })} />
          <span aria-hidden="true">{ends[1]}</span></span>
      </div>
    );
  });
}

const tools = Object.entries(agentTools) as [ToolId, (typeof agentTools)[ToolId]][];
/**
 * The tool switches, workspace tools first, then the outside ones with what they never do. `flagged` marks tools Atlas
 * switched on in a draft he wrote (agents-design D57), each with his reason.
 */
export function ToolSections({ isOn, disabled, onChange, flagged }: {
  isOn: (id: ToolId) => boolean; disabled?: boolean; onChange: (id: ToolId, on: boolean) => void;
  flagged?: { ids: ToolId[]; why?: string } }) {
  return ([[false, "In your workspace", ""], [true, "Outside", "These only prepare something you open yourself. Nothing leaves this browser on its own."]] as const)
    .map(([outside, title, note]) => (
      <section key={title} className="agent-section" aria-labelledby={`agent-tools-${outside}`}>
        <h3 id={`agent-tools-${outside}`}>{title} <small>{tools.filter(([id, tool]) => tool.outside === outside && isOn(id)).length} of {tools.filter(([, tool]) => tool.outside === outside).length} on</small></h3>
        {note && <p className="agent-hint">{note}</p>}
        {tools.filter(([, tool]) => tool.outside === outside).map(([id, tool]) => (
          <label key={id} className="switch-row">
            <input type="checkbox" role="switch" checked={isOn(id)} disabled={disabled} onChange={(event) => onChange(id, event.target.checked)} />
            <span className="switch" aria-hidden="true" />
            <span className="tool-icon" aria-hidden="true">{toolIcons[id]}</span>
            <span><strong>{tool.label}</strong><small>{tool.hint}</small>
              {flagged?.ids.includes(id) && isOn(id) && <small className="atlas-flag">Atlas turned this on{flagged.why ? `: ${flagged.why}` : "."}</small>}</span>
          </label>
        ))}
      </section>
    ));
}
