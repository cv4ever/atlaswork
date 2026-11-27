// The keep sheet: before a project is archived, which of its resources to keep in Library topics.
import { Archive } from "lucide-react";
import { useApp, useUi, useView } from "../appContext.ts";
import Dialog from "../Dialog.tsx";
import { kindOf, noteTitle } from "../model.ts";
import { kindIcons, PlacePicker } from "../Resources.tsx";

export function KeepSheet() {
  const { actions } = useApp();
  const sheet = useUi((state) => state.keepSheet);
  const projectById = useView((view) => view.projectById);
  const notes = useView((view) => view.data.notes);
  const topicGroup = useView((view) => view.topicGroup);
  const project = sheet && projectById[sheet.projectId];
  if (!sheet || !project) return null;
  const homed = notes.filter((note) => note.projectId === project.id && !note.archived);
  const kept = Object.keys(sheet.keep).length;
  const toggle = (id: string, on: boolean) => {
    const rest = Object.fromEntries(Object.entries(sheet.keep).filter(([key]) => key !== id));
    actions.setUi({ keepSheet: { ...sheet, keep: on ? { ...rest, [id]: sheet.last } : rest } });
  };
  const pick = (id: string, place: string) => actions.setUi({ keepSheet: { ...sheet, keep: { ...sheet.keep, [id]: place }, last: place } });
  const close = () => actions.setUi({ keepSheet: null });
  return (
    <Dialog title={`Archive “${project.title}”?`} onClose={close}>
      <div className="dialog-body keep-sheet">
        <p className="dialog-description">Tick what's worth keeping: it moves to a Library topic and stays easy to find. Everything else rests with the project in the Archive.</p>
        {homed.map((note) => {
          const Icon = kindIcons[kindOf(note)];
          const title = noteTitle(note);
          const elsewhere = (note.linkedProjectIds ?? []).map((id) => projectById[id]).filter((item) => item && !item.archived).map((item) => item.title);
          return (
            <div key={note.id} className="keep-row" data-kept={note.id in sheet.keep}>
              <label>
                <input type="checkbox" checked={note.id in sheet.keep} onChange={(event) => toggle(note.id, event.target.checked)} />
                <Icon size={16} />
                <span><strong>{title}</strong>{elsewhere.length > 0 && <small>Stays visible in {elsewhere.join(", ")}</small>}</span>
              </label>
              {note.id in sheet.keep && <PlacePicker label={`Topic for ${title}`} value={sheet.keep[note.id]}
                onChange={(place) => pick(note.id, place)} groups={[topicGroup]} onNewTopic={actions.createTopic} />}
            </div>
          );
        })}
      </div>
      <div className="dialog-footer">
        <button className="quiet-button" onClick={close}>Keep working on it</button>
        <button className="primary-button" disabled={Object.values(sheet.keep).some((place) => !place)}
          onClick={() => actions.finishKeepSheet(project.id, sheet.keep)}>
          <Archive size={16} />{kept ? `Keep ${kept} and archive` : "Archive"}
        </button>
      </div>
    </Dialog>
  );
}
