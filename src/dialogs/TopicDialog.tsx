// The topic dialog: name a Library topic, new or renamed, or a person (agents-design D71): a topic with a face, who they
// are to you, their domain and their dates. A topic can become a person and back without losing what it holds.
import { Archive, Trash2 } from "lucide-react";
import { useApp, useUi, useView } from "../appContext.ts";
import Dialog from "../Dialog.tsx";
import { LookPicker } from "../LookPicker.tsx";
import { domainHues } from "../model.ts";
import { newPerson } from "../people.ts";
import { PersonFields } from "./PersonFields.tsx";

export function TopicDialog() {
  const { actions } = useApp();
  const draft = useUi((state) => state.topicDraft);
  const topics = useView((view) => view.data.topics);
  const firstDomain = useView((view) => view.visible.domains.find((domain) => domain.name === "Family")?.name ?? view.visible.domains[0]?.name ?? "");
  if (!draft) return null;
  const original = topics.find((topic) => topic.id === draft.id);
  const change = (patch: Partial<typeof draft>) => actions.setUi({ topicDraft: { ...draft, ...patch } });
  const name = draft.name.trim();
  const taken = topics.some((topic) => topic.id !== draft.id && topic.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const close = () => actions.setUi({ topicDraft: null });
  const person = draft.person;
  return (
    <Dialog title={original ? `Edit ${original.name}` : person ? "Someone in your life" : "A new topic"} onClose={close}>
      <form className="task-form" onSubmit={(event) => { event.preventDefault(); if (name && !taken) actions.saveTopicDraft(draft); }}>
        <div className="kind-chips topic-kind" role="group" aria-label="What it is">
          <button type="button" aria-pressed={!person} onClick={() => change({ person: undefined })}>A topic</button>
          <button type="button" aria-pressed={!!person} onClick={() => person || change({ person: newPerson(firstDomain, domainHues.Clay) })}>A person</button>
        </div>
        <div className="look-field">
          <label htmlFor="topic-name">Name</label>
          <span className="look-row">
            {!person && <LookPicker id="topic-look" className="look-button" emoji={draft.emoji} onEmoji={(emoji) => change({ emoji })} />}
            <input id="topic-name" required maxLength={40} placeholder={person ? "Sofia, Mãe, Dr Almeida…" : "Typography, Sleep science, Woodworking…"}
              value={draft.name} aria-invalid={taken} onChange={(event) => change({ name: event.target.value })} />
          </span>
          {taken && <small className="field-error">There's already a topic or person by that name.</small>}
        </div>
        {person ? <PersonFields name={draft.name} person={person} onChange={(next) => change({ person: next })} /> : (
          <label>
            What it's about
            <textarea rows={2} maxLength={120} placeholder="What you keep here, and why." value={draft.description}
              onChange={(event) => change({ description: event.target.value })} />
          </label>
        )}
        <div className="form-actions">
          {original && <>
            <button type="button" className="quiet-button domain-remove" onClick={() => actions.deleteForever({ kind: "topic", id: original.id }, original.name)}>
              <Trash2 size={14} />Delete</button>
            <button type="button" className="quiet-button" onClick={() => actions.confirmArchive({ kind: "topic", id: original.id }, original.name)}>
              <Archive size={14} />Archive</button>
          </>}
          <button type="button" className="quiet-button" onClick={close}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!name || taken}>{original ? "Save" : person ? "Add to People" : "Add to the Library"}</button>
        </div>
      </form>
    </Dialog>
  );
}
