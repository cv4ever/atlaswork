// The first morning (agents-design D35): pick a domain (or plant a new one), then one of its agent's project ideas
// (D62) or a project of your own; either opens the project dialog filled in, as the domain page's ideas do, and Start
// builds it there. Atlas guides the domain picker; inside a domain its own agent speaks. Returning to Today starts again
// at the domain picker. Templates and the workspace edit live in starterProjects.ts. Later folds the guide into a reminder.
import { useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { ArrowLeft, Check, Plus } from "lucide-react";
import { agentById, stewardOf } from "./agents.ts";
import { morph } from "./morph.ts";
import { widgetIcons } from "./dataBlocks/parts.tsx";
import { atlasId } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { widgetKinds } from "./blocks.ts";
import type { Domain, WorkspaceData } from "./model.ts";
import type { Widget } from "./blocks.ts";
import { suggestedDomains } from "./onboarding.ts";
import { ideasFor } from "./starterProjects.ts";
import type { StarterProject } from "./starterProjects.ts";
import { useTyped } from "./useTyped.ts";
import { Tip } from "./Popups.tsx";
import { Emblem } from "./Emblem.tsx";

/** Tilts the card under the pointer toward it (the first-run flow's trick). */
function tilt(event: MouseEvent<HTMLElement>) {
  const card = (event.target as HTMLElement).closest<HTMLElement>(".area-pick, .starter-pick");
  for (const other of event.currentTarget.querySelectorAll<HTMLElement>("[data-tilted]")) if (other !== card) { other.style.cssText = ""; delete other.dataset.tilted; }
  if (!card) return;
  const box = card.getBoundingClientRect();
  card.dataset.tilted = "";
  card.style.setProperty("--rx", `${(-((event.clientY - box.top) / box.height - 0.5) * 10).toFixed(1)}deg`);
  card.style.setProperty("--ry", `${(((event.clientX - box.left) / box.width - 0.5) * 10).toFixed(1)}deg`);
}

/**
 * The blocks that make a starter's page its own, named on its card: a checklist, a tracker, a habit, a goal or
 * milestones. Every page has a finish line, next step, tasks and what's kept, so naming those says nothing.
 */
const telling: Widget[] = ["checklist", "tracker", "habit", "goal", "milestones"];

export default function FirstMorning({ data, name, start, onStart, onPlant, onLater }: {
  data: WorkspaceData; name: string;
  /** A domain to open on, its ideas showing (Ready's "Start … first project"); otherwise the domain picker. */
  start?: string;
  /** Opens the project dialog in `domain`, filled in from `starter` when an idea was picked. */
  onStart: (domain: string, starter?: StarterProject) => void;
  /** Opens the domain dialog (D51: it plants the domain with an agent of its own). */
  onPlant: () => void;
  onLater: () => void;
}) {
  const portraitSrc = usePortraitSrc();
  const [domain, setDomain] = useState<Domain | null>(() => (start && data.domains.find((item) => item.name === start && !item.archived)) || null);
  const go = (next: Domain | null) => morph(() => setDomain(next));
  const domains = data.domains.filter((item) => !item.archived);
  // While the domain dialog is open from here, the names there were; a domain planted then opens its ideas at once,
  // so its new agent offers the first project (a cancelled dialog leaves the picker as it was).
  const [planting, setPlanting] = useState<string[] | null>(null);
  const planted = planting && domains.find((item) => !planting.includes(item.name));
  if (planted) { setPlanting(null); setDomain(planted); }
  const names = new Set(domains.map((item) => item.name.toLocaleLowerCase()));
  const common = suggestedDomains.filter((item) => !names.has(item.name.toLocaleLowerCase())).slice(0, 2).map((item) => item.name);
  const hasProject = (item: Domain) => data.projects.some((project) => project.area === item.name && !project.archived);
  const who = name.trim();
  const atlas = agentById(data, atlasId)!;
  // Inside a domain, the agent who looks after it speaks; Atlas where nobody does.
  const speaker = domain ? stewardOf(data, domain.name) ?? atlas : atlas;

  const line = !domain
    ? [`Where shall we start${who ? `, ${who}` : ""}?`, "Pick a domain, or plant a new one, and its agent will set up the first project with you. Two minutes, and there's something real on the page."]
    : speaker === atlas
      ? [`${domain.emoji} ${domain.name}.`, "Pick one and I'll fill in its page and first steps, or start one of your own."]
      : [`Hi${who ? ` ${who}` : ""}, I'm ${speaker.name}.`, `I look after ${domain.name}. Pick one and I'll fill in its page and first steps, or start one of your own.`];
  const typed = useTyped(line[1]);

  return (
    <section className="first-morning" aria-label={`First morning with ${speaker.name}`} onMouseMove={tilt}>
      <div className="guide-head">
        {/* Atlas's portrait keeps its transition name so it travels from the first-run dialog; a domain's agent pops in. */}
        <span className="guide-face" key={speaker.id}>
          <img className={speaker === atlas ? "atlas-guide" : undefined} src={portraitSrc(speaker)} alt={speaker.name} />
        </span>
        <div className="guide-bubble" key={line[0]}><strong>{line[0]}</strong><p>{typed}<span className="guide-caret" aria-hidden="true" hidden={typed.length >= line[1].length} /></p></div>
      </div>
      {!domain ? (
        <div className="area-picks first-morning-picks">
          {domains.map((item, index) => (
            <button key={item.name} type="button" className="area-pick" aria-pressed={hasProject(item)} style={{ "--hue": item.hue || "var(--skin-accent)", "--i": index } as CSSProperties}
              onClick={() => go(item)}>
              <span className="area-pick-emoji" aria-hidden="true"><Emblem emoji={item.emoji} /></span>
              <strong>{item.name}</strong><small>{hasProject(item) ? "Has a project. Add another?" : item.intention || "Your own"}</small>
              <span className="pick-check" aria-hidden="true"><Check size={14} strokeWidth={3} /></span>
            </button>
          ))}
          <button type="button" className="area-pick area-own" style={{ "--i": domains.length } as CSSProperties}
            onClick={() => { setPlanting(domains.map((item) => item.name)); onPlant(); }}>
            <span className="area-pick-emoji" aria-hidden="true"><Plus size={18} /></span>
            <strong>New domain</strong><small>{common.length ? `${common.join(", ")}, or one of your own` : "Another part of your life"}</small>
          </button>
        </div>
      ) : (
        <div className="starter-picks">
          {ideasFor(data, domain.name).map((starter, index) => {
            const own = starter.blocks.filter((block) => telling.includes(block.type));
            return (
              <Tip key={starter.title} label={starter.tip}><button type="button" className="starter-pick" style={{ "--hue": `var(--${starter.color === "pine" ? "skin-accent" : starter.color})`, "--i": index } as CSSProperties}
              onClick={() => onStart(domain.name, starter)}>
              <strong>{starter.title}</strong><small>{starter.line}</small>
              {own.length > 0 && <span className="starter-blocks">
                {own.map((block, blockIndex) => {
                  const Icon = widgetIcons[block.type];
                  return <em key={blockIndex}><Icon size={14} />{block.title ?? widgetKinds[block.type].label}</em>;
                })}
              </span>}
                            </button></Tip>
            );
          })}
          <button type="button" className="starter-pick starter-pick-new" style={{ "--i": 3 } as CSSProperties} onClick={() => onStart(domain.name)}>
            <span className="starter-pick-plus" aria-hidden="true"><Plus size={18} /></span>
            <strong>Something else</strong><small>Name your own project. The rest comes filled in.</small>
          </button>
        </div>
      )}
      <div className="first-morning-foot">
        {domain && <button type="button" className="text-button" onClick={() => go(null)}><ArrowLeft size={16} />Other domains</button>}
        <button type="button" className="text-button first-morning-later" onClick={onLater}>Later</button>
      </div>
    </section>
  );
}
