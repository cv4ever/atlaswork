// The agent dialog's name badge: the face (arrows step through the free ones, the drawer shows all), name, role, a
// tone preview of how they'd answer, and how far a new agent is set up or how many changes wait to be saved.
import { ChevronLeft, ChevronRight, Dices } from "lucide-react";
import { atlasId } from "../model.ts";
import type { Agent, WorkspaceData } from "../model.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { freeName, portraits } from "../look.ts";
import { Tip } from "../Popups.tsx";

export function AgentBadge({ draft, original, data, taken, sample, roles, status, onChange }: {
  draft: Agent;
  /** The saved agent, when editing one. */
  original?: Agent;
  data: WorkspaceData;
  /** Someone else goes by this name. */
  taken: boolean;
  /** How “how's it going?” could sound in their tone. */
  sample: string;
  /** Roles the field suggests. */
  roles: string[];
  /** A new agent's setup progress, or the line under an edited one. */
  status: { total: number; done: number; next?: string } | string;
  onChange: (patch: Partial<Agent>) => void;
}) {
  const portraitSrc = usePortraitSrc();
  const faces = new Map(data.agents.filter((agent) => agent.id !== draft.id).map((agent) => [agent.portrait, agent.name]));
  const allFaces = [...(draft.id === atlasId ? ["atlas"] : []), ...portraits];
  const freeFaces = allFaces.filter((portrait) => !faces.has(portrait) || portrait === draft.portrait);
  const stepFace = (by: number) => onChange({ portrait: freeFaces[(freeFaces.indexOf(draft.portrait) + by + freeFaces.length) % freeFaces.length] });
  return (
    <aside className="agent-badge">
      <div className="badge-face">
        <Tip label="Previous free face"><button type="button" className="icon-button" aria-label="Previous free face" onClick={() => stepFace(-1)}>
          <ChevronLeft size={18} /></button></Tip>
        <img key={draft.portrait} src={portraitSrc(draft)} alt="" />
        <Tip label="Next free face"><button type="button" className="icon-button" aria-label="Next free face" onClick={() => stepFace(1)}>
          <ChevronRight size={18} /></button></Tip>
      </div>
      <span className="badge-name">
        <input required maxLength={30} aria-label="Name" placeholder="Their name" value={draft.name} aria-invalid={taken}
          onFocus={(event) => { if (!original) event.currentTarget.select(); }}
          onChange={(event) => onChange({ name: event.target.value })} />
        {!original && (
          <Tip label="Suggest another name"><button type="button" className="icon-button" aria-label="Suggest another name"
            onClick={() => onChange({ name: freeName(data, draft.name) })}><Dices size={16} /></button></Tip>
        )}
      </span>
      {taken && <small className="field-error">Someone already goes by that name. Names stay unique so @mentions are clear.</small>}
      <input className="badge-role" list="agent-roles" maxLength={40} aria-label="Role" placeholder="What do they do?" value={draft.role}
        onChange={(event) => onChange({ role: event.target.value })} />
      <datalist id="agent-roles">{roles.map((role) => <option key={role} value={role} />)}</datalist>
      <details className="face-drawer">
        <summary>All faces <small>{portraits.filter((portrait) => !faces.has(portrait)).length} of {portraits.length} free</small></summary>
        <div className="portrait-choices" role="radiogroup" aria-label="Face">
          {[...freeFaces, ...allFaces.filter((portrait) => !freeFaces.includes(portrait))].map((portrait) => {
            const owner = faces.get(portrait);
            return (
              <Tip key={portrait} label={owner ? `${owner} wears this one` : portrait}><label className={`portrait-choice ${owner ? "taken" : ""}`}>
                <input type="radio" name="agent-portrait" aria-label={owner ? `${portrait}, worn by ${owner}` : portrait}
                  checked={draft.portrait === portrait} onChange={() => onChange({ portrait })} />
                <img src={portraitSrc({ portrait })} alt="" loading="lazy" />
              </label></Tip>
            );
          })}
        </div>
      </details>
      <figure className="badge-speech">
        <figcaption>Tone preview: how “how's it going?” could sound</figcaption>
        <blockquote key={sample}>{sample}</blockquote>
      </figure>
      {typeof status === "string" ? <small className="badge-meta">{status}</small> : (
        <div className="agent-progress">
          <progress max={status.total} value={status.done} aria-label="Set up" />
          <small>{status.done} of {status.total} · {status.next ? `next: ${status.next}` : "ready to welcome"}</small>
        </div>
      )}
    </aside>
  );
}
