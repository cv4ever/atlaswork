// The room dialog: start a room with a title and the agents in it.
import { MessagesSquare, Users } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import * as crews from "../agents.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import Dialog from "../Dialog.tsx";
import { usePortraitSrc } from "../crewStyle.ts";

export function RoomDialog() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const draft = useUi((state) => state.roomDraft);
  const data = useView((view) => view.data);
  if (!draft) return null;
  const toggle = (id: string) => actions.setUi({ roomDraft: { ...draft,
    memberIds: draft.memberIds.includes(id) ? draft.memberIds.filter((member) => member !== id) : [...draft.memberIds, id] } });
  const picked = draft.memberIds.map((id) => crews.agentById(data, id)!).filter(Boolean);
  const close = () => actions.setUi({ roomDraft: null });
  return (
    <Dialog title="Start a room" onClose={close}>
      <form className="task-form room-form" onSubmit={(event) => { event.preventDefault(); if (picked.length) actions.startRoom(draft.title, draft.memberIds); }}>
        <div className="agent-preview room-preview" aria-hidden="true">
          {picked.length ? <AvatarStack agents={picked} size={52} /> : <span className="room-empty"><Users size={26} /></span>}
          <div><strong>{draft.title.trim() || picked.map((agent) => agent.name).join(", ") || "A new room"}</strong>
            <p>{picked.length ? `${picked[0].name} answers first; @name to ask someone else.` : "Pick who's in. The first one you pick answers first."}</p></div>
        </div>
        <label>
          Name (optional)
          <input maxLength={40} placeholder="Weekend plans, Q3 budget…" value={draft.title} onChange={(event) => actions.setUi({ roomDraft: { ...draft, title: event.target.value } })} />
        </label>
        {data.teams.length > 0 && (
          <div className="room-teams">
            <span>Start from a team</span>
            {data.teams.map((team) => (
              <button type="button" key={team.id} className="assignment-chip team"
                onClick={() => actions.setUi({ roomDraft: { title: draft.title || team.name,
                  memberIds: crews.teamMembers(data, team).map((agent) => agent.id) } })}>
                <Users size={12} />{team.name}
              </button>
            ))}
          </div>
        )}
        <fieldset className="member-choices">
          <legend>Who's in</legend>
          {data.agents.filter((agent) => !agent.archived).map((agent) => {
            const order = draft.memberIds.indexOf(agent.id);
            return (
              <label key={agent.id} className="member-choice">
                <input type="checkbox" checked={order >= 0} onChange={() => toggle(agent.id)} />
                <span><img src={portraitSrc(agent)} alt="" /><span><strong>{agent.name}</strong><small>{agent.role}</small></span>
                  {order >= 0 && <i>{order === 0 ? "first" : order + 1}</i>}</span>
              </label>
            );
          })}
        </fieldset>
        <div className="form-actions">
          <button type="button" className="quiet-button" onClick={close}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!picked.length}>
            <MessagesSquare size={16} />{picked.length > 1 ? `Start room with ${picked.length}` : picked.length ? `Chat with ${picked[0].name}` : "Start room"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
