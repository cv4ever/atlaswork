// The agent dialog's Profile tab: where they look (places as chips, a domain Atlas would plant, Add a place), their
// personality, house rules and model.
import type { CSSProperties, ReactNode } from "react";
import { Plus, Users, X } from "lucide-react";
import type { AtlasMark } from "../agentDrafts.ts";
import * as crews from "../agents.ts";
import { PersonalitySliders } from "../AgentSettingsParts.tsx";
import { toneOf } from "../model.ts";
import type { Agent, Domain, Places, Project, WorkspaceData } from "../model.ts";
import type { ModelSource } from "../modelMenu.ts";
import { Tip } from "../Popups.tsx";
import type { DomainDraft } from "../workspace.ts";
import { AgentModel } from "./AgentModel.tsx";
import { Emblem } from "../Emblem.tsx";

/** One place the agent works, as a removable chip; `from` is who held it, `alone` a team they're the only member of. */
export type PlaceChip = { key: keyof Places; id: string; hue?: string; icon: ReactNode; label: string; from?: Agent; alone: boolean };

/** The places in `places` that are live, in the order domains, projects, teams; archived ones stay in `places` untouched. */
export function placeChips(data: WorkspaceData, agentId: string, places: Places, domains: Domain[], liveProjects: Project[]): PlaceChip[] {
  const holder = (id: string | undefined) => (id && id !== agentId ? crews.agentById(data, id) : undefined);
  return [
    ...domains.filter((domain) => places.domains.includes(domain.name)).map((domain) => ({ key: "domains" as const, id: domain.name,
      hue: domain.hue, icon: <span aria-hidden="true"><Emblem emoji={domain.emoji} /></span>, label: domain.name, from: holder(domain.agentId), alone: false })),
    ...liveProjects.filter((project) => places.projectIds.includes(project.id)).map((project) => ({ key: "projectIds" as const, id: project.id,
      hue: domains.find((domain) => domain.name === project.area)?.hue, icon: <i className={`project-dot ${project.color}`} />,
      label: project.title, from: holder(project.agentId), alone: false })),
    ...data.teams.filter((team) => places.teamIds.includes(team.id)).map((team) => ({ key: "teamIds" as const, id: team.id,
      hue: undefined, icon: <Users size={12} />, label: team.memberIds[0] === agentId ? `${team.name} · lead` : team.name, from: undefined,
      alone: team.memberIds.length === 1 && team.memberIds[0] === agentId })),
  ];
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export function ProfileTab({ draft, data, domains, places, chips, newDomain, atlas, reach, isAtlas, archived, editing, engine, onChange, onPlaces, onPlant }: {
  draft: Agent;
  data: WorkspaceData;
  domains: (Domain & { projects: Project[] })[];
  places: Places;
  chips: PlaceChip[];
  /** A domain Atlas plants with the agent (D57). */
  newDomain?: DomainDraft;
  atlas?: AtlasMark;
  /** What they can reach: projects, resources and open tasks. */
  reach: string;
  isAtlas: boolean;
  archived: boolean;
  /** Whether a saved agent with house rules is being edited, which opens the rules. */
  editing: boolean;
  engine?: ModelSource;
  onChange: (patch: Partial<Agent>) => void;
  onPlaces: (key: keyof Places, items: string[]) => void;
  /** Renames (or with nothing, drops) the domain Atlas would plant, moving the agent's place along. */
  onPlant: (next?: DomainDraft) => void;
}) {
  const placeable = !isAtlas && !archived;
  const holder = (id: string | undefined) => (id && id !== draft.id ? crews.agentById(data, id) : undefined);
  const takeOver = (id: string | undefined) => { const now = holder(id); return now ? ` · from ${now.name}` : ""; };
  const addPlace = (value: string) => {
    const [key, id] = [value.slice(0, value.indexOf(":")) as keyof Places, value.slice(value.indexOf(":") + 1)];
    if (id) onPlaces(key, [...places[key], id]);
  };
  return <>
    <section className="agent-section" aria-labelledby="agent-where">
      <h3 id="agent-where">Where they look <small>{placeable && !chips.length && !newDomain ? "Nowhere yet" : reach}</small></h3>
      {isAtlas && <p className="agent-hint">Everywhere. Atlas answers wherever nobody else is assigned.</p>}
      {archived && <p className="agent-hint">Archived. Restore them from Archive to put them back to work.</p>}
      {placeable && (
        <div className="place-chips">
          {chips.map((chip) => (
            <span key={`${chip.key}:${chip.id}`} className="assignment-chip place-chip" style={{ "--hue": chip.hue } as CSSProperties}>
              {chip.icon}{chip.label}{chip.from && <small>from {chip.from.name}</small>}
              <Tip label={chip.alone ? "The only member. Disband the team instead." : `Remove ${chip.label}`}>
                <button type="button" aria-label={`Remove ${chip.label}`} disabled={chip.alone}
                  onClick={() => onPlaces(chip.key, places[chip.key].filter((item) => item !== chip.id))}><X size={12} /></button>
              </Tip>
            </span>
          ))}
          {newDomain && (
            <span className="assignment-chip place-chip new-domain-chip" style={{ "--hue": newDomain.hue } as CSSProperties}>
              <span aria-hidden="true"><Emblem emoji={newDomain.emoji} /></span>
              <input aria-label="New domain's name" maxLength={40} size={Math.max(6, newDomain.name.length)} value={newDomain.name}
                onChange={(event) => onPlant({ ...newDomain, name: event.target.value })} />
              <small>new domain</small>
              <Tip label={`Don't plant ${newDomain.name}`}><button type="button" aria-label={`Don't plant ${newDomain.name}`} onClick={() => onPlant(undefined)}>
                <X size={12} /></button></Tip>
            </span>
          )}
          <label className="place-add">
            <Plus size={14} />
            <select value="" aria-label="Add a place" onChange={(event) => addPlace(event.target.value)}>
              <option value="">{chips.length || newDomain ? "Add a place" : "Pick a place"}</option>
              {domains.some((domain) => !places.domains.includes(domain.name)) && (
                <optgroup label="Look after a domain">
                  {domains.filter((domain) => !places.domains.includes(domain.name)).map((domain) => (
                    <option key={domain.name} value={`domains:${domain.name}`}>{domain.emoji} {domain.name}{takeOver(domain.agentId) || " · nobody yet"}</option>
                  ))}
                </optgroup>
              )}
              {domains.map((domain) => {
                const open = domain.projects.filter((project) => !places.projectIds.includes(project.id));
                return open.length > 0 && (
                  <optgroup key={domain.name} label={`Projects in ${domain.name}`}>
                    {open.map((project) => <option key={project.id} value={`projectIds:${project.id}`}>{project.title}{takeOver(project.agentId)}</option>)}
                  </optgroup>
                );
              })}
              {data.teams.some((team) => !places.teamIds.includes(team.id)) && (
                <optgroup label="Join a team">
                  {data.teams.filter((team) => !places.teamIds.includes(team.id)).map((team) => (
                    <option key={team.id} value={`teamIds:${team.id}`}>{team.name} · {count(team.memberIds.length, "member")}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        </div>
      )}
    </section>
    <section className="agent-section" aria-labelledby="agent-personality">
      <h3 id="agent-personality">Personality</h3>
      <PersonalitySliders own={{ warmth: draft.warmth, detail: draft.detail }} fallback={toneOf({}, data.everyAgent)}
        follow={{ tag: "Same as every agent", reset: "Follow every agent" }} onChange={onChange} />
    </section>
    <details className="agent-section agent-rules" open={editing || !!atlas || undefined}>
      <summary>House rules <small>optional · {draft.instructions.length} / 400</small></summary>
      <textarea rows={3} maxLength={400} aria-label="House rules" value={draft.instructions} className={atlas?.was ? "atlas-drafted" : undefined}
        placeholder="Anything sliders can't say: “Prices in euros.” “Never book anything for me.”"
        onChange={(event) => onChange({ instructions: event.target.value })} />
      {atlas?.was && <p className="agent-hint">{atlas.by?.name ?? "Atlas"} rewrote these. Before: “{atlas.was}”</p>}
    </details>
    <AgentModel name={draft.name.trim()} value={draft.model} effort={draft.effort} engine={engine} onChange={onChange} />
  </>;
}
