// Capture: a note, link, file or image saved to a place (Resources.tsx's CaptureForm), with Undo on the toast.
import { FolderOpen, Library, Link2, Network, Search } from "lucide-react";
import * as crews from "../agents.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import Dialog from "../Dialog.tsx";
import { atlasId, kindLabels, kindOf, noteTitle } from "../model.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { homeKey, placeName } from "../place.ts";
import { CaptureForm, kindIcons, PlacePill } from "../Resources.tsx";
import type { CaptureTurn } from "../Resources.tsx";

export function CaptureDialog() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const capture = useUi((state) => state.capture);
  const query = useUi((state) => state.query);
  const projectById = useView((view) => view.projectById);
  const liveNotes = useView((view) => view.visible.notes);
  const placeGroups = useView((view) => view.placeGroups);
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  if (!capture) return null;
  const project = projectById[capture.place];
  const close = () => actions.setUi({ capture: null });
  if (capture.link && project) {
    const words = query.trim().toLocaleLowerCase();
    const candidates = liveNotes.filter((note) => note.projectId !== project.id && !note.linkedProjectIds?.includes(project.id)
      && (!words || `${note.title} ${note.body} ${note.url ?? ""}`.toLocaleLowerCase().includes(words))).slice(0, 40);
    return (
      <Dialog title={`Link a resource to ${project.title}`} onClose={close}>
        <div className="dialog-search">
          <Search size={18} />
          <input aria-label="Find a resource" placeholder="Find something you already keep…" value={query} onChange={(event) => actions.setUi({ query: event.target.value })} />
        </div>
        <p className="dialog-description">It stays where it lives and shows up in {project.title} too.</p>
        <div className="search-results">
          {candidates.map((note) => {
            const Icon = kindIcons[kindOf(note)];
            return (
              <div key={note.id} className="search-row">
                <button data-search-result onClick={() => { if (actions.setLinked(note.id, project.id, true)) close(); }}>
                  <span className="search-result-icon"><Icon size={18} /></span>
                  <span><strong>{noteTitle(note)}</strong><small>{kindLabels[kindOf(note)]} in {placeName(data, homeKey(note))}</small></span>
                  <Link2 size={14} />
                </button>
              </div>
            );
          })}
          {!candidates.length && <p className="empty-inline">{words ? "Nothing matches. Try another word." : "Everything you keep is already here."}</p>}
        </div>
        <div className="dialog-footer">
          <button className="text-button" onClick={() => actions.setUi({ capture: { ...capture, link: false } })}>Capture something new instead</button>
          <kbd>Esc to close</kbd>
        </div>
      </Dialog>
    );
  }
  const named = (kind: "project" | "topic" | "domain") => (words: string) => actions.captureAs(kind, words, capture.place);
  const turns: CaptureTurn[] = [
    { icon: FolderOpen, label: "Project", hint: "An outcome with steps, named by your words", named: true, run: named("project") },
    { icon: Library, label: "Topic", hint: "A shelf for what you keep", named: true, run: named("topic") },
    { icon: Network, label: "Domain", hint: "A part of your life", named: true, run: named("domain") },
    ...project ? [{ icon: Link2, label: "Link something you keep", hint: `It shows in ${project.title} too`,
      run: () => actions.setUi({ query: "", capture: { ...capture, link: true } }) }] : [],
  ];
  return (
    <Dialog title="Capture" onClose={close} className="capture-dialog"
      actions={<PlacePill groups={placeGroups} value={capture.place} open={!!capture.places}
        onToggle={() => actions.setUi({ capture: { ...capture, places: !capture.places } })} />}>
      <CaptureForm initial={capture.text} listen={capture.listen} today={today}
        onSave={(drafts) => drafts.length > 1 ? actions.saveFiles(drafts, capture.place) : actions.saveCapture(drafts[0], capture.place)}
        onTask={(title, due) => actions.saveCaptureTask(title, due, capture.place)} turns={turns}
        sort={{ face: portraitSrc(crews.agentById(data, atlasId)!), run: (draft) => actions.sortCapture(draft, capture.place) }}
        place={{ value: capture.place, open: !!capture.places, onChange: (place) => actions.setUi({ capture: { ...capture, place, places: false } }),
          groups: placeGroups, onNewTopic: actions.createTopic }} />
    </Dialog>
  );
}
