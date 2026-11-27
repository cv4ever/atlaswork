// The team dialog: a team's name and members; the first member leads.
import { Trash2, Users } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import * as crews from "../agents.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import Dialog from "../Dialog.tsx";
import { usePortraitSrc } from "../crewStyle.ts";
import type { Agent } from "../model.ts";
import type { TeamDraft } from "../workspace.ts";

export function TeamDialog() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const form = useUi((state) => state.teamForm);
  const data = useView((view) => view.data);
  if (!form) return null;
  const { original, team: draft } = form;
  const change = (patch: Partial<TeamDraft>) => actions.setUi({ teamForm: { original, team: { ...draft, ...patch } } });
  const toggle = (id: string) => change({ memberIds: draft.memberIds.includes(id)
    ? draft.memberIds.filter((member) => member !== id) : [...draft.memberIds, id] });
  const members = draft.memberIds.map((id) => crews.agentById(data, id)).filter((agent): agent is Agent => !!agent);
  const name = draft.name.trim();
  const taken = data.teams.some((team) => team.id !== draft.id && team.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const close = () => actions.setUi({ teamForm: null });
  return (
    <Dialog title={original ? `Edit ${original.name}` : "A new team"} onClose={close}>
      <form className="task-form room-form" onSubmit={(event) => { event.preventDefault(); if (name && !taken && members.length) actions.saveTeamDraft(form); }}>
        <div className="agent-preview room-preview" aria-hidden="true">
          {members.length ? <AvatarStack agents={members} size={52} /> : <span className="room-empty"><Users size={26} /></span>}
          <div><strong>{name || "A new team"}</strong>
            <p>{draft.purpose.trim() || (members.length ? `${members[0].name} leads.` : "Pick a few agents. The first one leads.")}</p></div>
        </div>
        <label>
          Name
          <input required maxLength={40} placeholder="Home front, Launch squad…" value={draft.name} aria-invalid={taken}
            onChange={(event) => change({ name: event.target.value })} />
          {taken && <small className="field-error">There's already a team by that name.</small>}
        </label>
        <label>
          What it's for
          <textarea rows={2} maxLength={160} placeholder="Keep the household running and spend on it deliberately." value={draft.purpose}
            onChange={(event) => change({ purpose: event.target.value })} />
        </label>
        <fieldset className="member-choices">
          <legend>Members</legend>
          {data.agents.filter((agent) => !agent.archived).map((agent) => {
            const order = draft.memberIds.indexOf(agent.id);
            return (
              <label key={agent.id} className="member-choice">
                <input type="checkbox" checked={order >= 0} onChange={() => toggle(agent.id)} />
                <span><img src={portraitSrc(agent)} alt="" /><span><strong>{agent.name}</strong><small>{agent.role}</small></span>
                  {order >= 0 && <i>{order === 0 ? "lead" : order + 1}</i>}</span>
              </label>
            );
          })}
        </fieldset>
        {members.length > 1 && (
          <label>
            Lead
            <select value={draft.memberIds[0]} onChange={(event) =>
              change({ memberIds: [event.target.value, ...draft.memberIds.filter((id) => id !== event.target.value)] })}>
              {members.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </label>
        )}
        <div className="form-actions">
          {original && <button type="button" className="quiet-button domain-remove" onClick={() => actions.deleteTeam(original)}><Trash2 size={14} />Disband</button>}
          <button type="button" className="quiet-button" onClick={close}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!name || taken || !members.length}>{original ? "Save" : "Form the team"}</button>
        </div>
      </form>
    </Dialog>
  );
}
