// New routine: whose it is (an agent, a domain or a project) and its kind.
import { routineKinds } from "../model.ts";
import type { Domain, Project, RoutineKind, WorkspaceData } from "../model.ts";
import * as routines from "../routines.ts";
import { routineIcons } from "../RoutineViews.tsx";
import { kinds } from "./listing.ts";

export function NewRoutine({ data, liveDomains, domains, owner, onOwner, onAdd }: {
  data: WorkspaceData;
  liveDomains: Domain[];
  /** Live domains with their live projects. */
  domains: (Domain & { projects: Project[] })[];
  /** Whose routine Add makes, as an owner key; the page remembers the last one picked. */
  owner: string;
  onOwner: (owner: string) => void;
  onAdd: (kind: RoutineKind) => void;
}) {
  return (
    <div className="routine-new" role="group" aria-label="New routine">
      <label>For
        <select value={owner} onChange={(event) => onOwner(event.target.value)}>
          <optgroup label="Agents">{data.agents.filter((agent) => !agent.archived).map((agent) =>
            <option key={agent.id} value={routines.ownerKey({ kind: "agent", id: agent.id })}>{agent.name}</option>)}</optgroup>
          <optgroup label="Domains">{liveDomains.map((domain) =>
            <option key={domain.name} value={routines.ownerKey({ kind: "domain", id: domain.name })}>{domain.emoji} {domain.name}</option>)}</optgroup>
          {domains.filter((domain) => domain.projects.length).map((domain) => (
            <optgroup key={domain.name} label={`Projects in ${domain.name}`}>
              {domain.projects.map((project) => <option key={project.id} value={routines.ownerKey({ kind: "project", id: project.id })}>{project.title}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <small>run by {routines.runnerOf(data, routines.ownerFromKey(owner)).name}</small>
      {kinds.map((kind) => {
        const Icon = routineIcons[kind];
        return <button key={kind} type="button" className={`routine-chip ${kind}`} onClick={() => onAdd(kind)}><Icon size={14} />{routineKinds[kind].label}</button>;
      })}
    </div>
  );
}
