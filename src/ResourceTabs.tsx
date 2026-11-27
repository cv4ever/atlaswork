// Resources open as tabs and in the peek: the same editor, with where the thing lives under it.
import { lazy, Suspense, useEffect } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Trash2, X } from "lucide-react";
import { useApp, useUi, useView } from "./appContext.ts";
import { kindLabels, kindOf } from "./model.ts";
import type { Note } from "./model.ts";
import { homeKey, parseTab, tabKey } from "./place.ts";
import { kindIcons, PlacePicker, ResourceViewer } from "./Resources.tsx";
import { OpenTabsButton } from "./OpenTabs.tsx";
import { Tip } from "./Popups.tsx";

const NoteEditor = lazy(() => import("./NoteEditor.tsx"));

/** Where a resource lives: its home (a picker that moves it) and the projects it's linked into. */
function PlacesRow({ note }: { note: Note }) {
  const { actions } = useApp();
  const projectById = useView((view) => view.projectById);
  const liveDomains = useView((view) => view.visible.domains);
  const liveProjects = useView((view) => view.visible.projects);
  const placeGroups = useView((view) => view.placeGroups);
  const linked = (note.linkedProjectIds ?? []).map((id) => projectById[id]).filter(Boolean);
  return (
    <div className="resource-places">
      <span className="place-label">Home</span>
      <PlacePicker label="Move to" value={homeKey(note)} onChange={(key) => actions.moveResource(note.id, key)} groups={placeGroups} onNewTopic={actions.createTopic} />
      <span className="place-label">Linked to</span>
      <div className="linked-chips">
        {linked.map((project) => (
          <span key={project.id} className="assignment-chip">
            <span className={`project-dot ${project.color}`} />{project.title}{project.archived && " (archived)"}
            <Tip label="Unlink"><button aria-label={`Unlink from ${project.title}`} onClick={() => actions.setLinked(note.id, project.id, false)}><X size={12} /></button></Tip>
          </span>
        ))}
        <select aria-label="Link to a project" className="link-add" value="" onChange={(event) => event.target.value && actions.setLinked(note.id, event.target.value, true)}>
          <option value="">＋ Link to a project…</option>
          {liveDomains.map((domain) => (
            <optgroup key={domain.name} label={`${domain.emoji} ${domain.name}`}>
              {liveProjects.filter((project) => project.area === domain.name && project.id !== note.projectId && !note.linkedProjectIds?.includes(project.id))
                .map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <Tip label="Delete forever"><button className="quiet-button place-delete" onClick={() => actions.deleteForever({ kind: "note", id: note.id }, `“${note.title || kindLabels[kindOf(note)]}”`)}><Trash2 size={14} />Delete</button></Tip>
    </div>
  );
}

/** The same editor in a tab and in the peek: the thing itself, where it lives, then your words. */
function ResourceEditor({ note, onScreen }: { note: Note; onScreen: boolean }) {
  const { actions } = useApp();
  const kind = kindOf(note);
  const askLabel = useView((view) => view.chat.current.label);
  return (
    <NoteEditor note={note} kind={kind === "note" ? "Personal note" : kindLabels[kind]} onChange={actions.changeNote}
      onAttach={kind === "note" ? actions.attachNote : undefined} onAsk={kind === "note" ? actions.askAbout : undefined}
      askLabel={askLabel} onArchive={actions.archiveNote} titleEnd={onScreen && <OpenTabsButton />}>
      {onScreen && <>{kind !== "note" && <ResourceViewer note={note} onChange={actions.changeNote} />}<PlacesRow note={note} /></>}
    </NoteEditor>
  );
}

/** Editors stay mounted for open tabs; closing a tab releases its editor. The viewer mounts only on screen. */
export function ResourceTabs() {
  const tabs = useView((view) => view.session.tabs);
  const pageKey = useView((view) => view.session.view ?? view.session.active);
  const noteById = useView((view) => view.noteById);
  return tabs.map((key) => {
    const tab = parseTab(key), note = tab.kind === "resource" ? noteById[tab.id] : undefined;
    return note ? (
      <div key={key} hidden={key !== pageKey}>
        <Suspense fallback={<div className="view-loading">Opening…</div>}>
          <ResourceEditor note={note} onScreen={key === pageKey} />
        </Suspense>
      </div>
    ) : null;
  });
}

export function ResourcePeek() {
  const { actions } = useApp();
  const peek = useUi((state) => state.peek);
  const noteById = useView((view) => view.noteById);
  const note = peek && noteById[peek.id] && !noteById[peek.id].archived ? noteById[peek.id] : undefined;
  // ↑/↓ (or j/k) step through the grid it was opened from, Enter opens it as a tab, Escape closes it.
  useEffect(() => {
    if (!peek) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
      const target = event.target as HTMLElement;
      if (event.key === "Escape") {
        event.preventDefault();
        return actions.setUi({ peek: null });
      }
      if (target.closest("input, textarea, select, [contenteditable='true']") || event.ctrlKey || event.metaKey || event.altKey) return;
      const step = { ArrowDown: 1, j: 1, ArrowUp: -1, k: -1 }[event.key];
      if (step) {
        event.preventDefault();
        const next = peek.order[peek.order.indexOf(peek.id) + step];
        if (next) actions.setUi({ peek: { ...peek, id: next } });
      } else if (event.key === "Enter" && !target.closest(".resource-peek button, .resource-peek a")) {
        event.preventDefault();
        actions.setUi({ peek: null });
        actions.openTab(tabKey({ kind: "resource", id: peek.id }));
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [peek, actions]);
  if (!peek || !note) return null;
  const Icon = kindIcons[kindOf(note)];
  const at = peek.order.indexOf(note.id);
  return (
    <aside className="resource-peek" aria-label={`Peek: ${note.title || kindLabels[kindOf(note)]}`}>
      <div className="peek-bar">
        <span><Icon size={16} />{kindLabels[kindOf(note)]}
          {peek.order.length > 1 && <small>{at + 1} of {peek.order.length}</small>}</span>
        <Tip label="Previous (↑)"><button className="icon-button" aria-label="Previous resource" disabled={at <= 0}
          onClick={() => actions.setUi({ peek: { ...peek, id: peek.order[at - 1] } })}><ChevronLeft size={16} /></button></Tip>
        <Tip label="Next (↓)"><button className="icon-button" aria-label="Next resource" disabled={at >= peek.order.length - 1}
          onClick={() => actions.setUi({ peek: { ...peek, id: peek.order[at + 1] } })}><ChevronRight size={16} /></button></Tip>
        <Tip label="Open as tab (Enter)"><button className="icon-button" aria-label="Open as tab" onClick={() => actions.openResource(note, true, [])}><Maximize2 size={16} /></button></Tip>
        <Tip label="Close (Esc)"><button className="icon-button" aria-label="Close peek" onClick={() => actions.setUi({ peek: null })}><X size={16} /></button></Tip>
      </div>
      <div className="peek-scroll" key={note.id}>
        <Suspense fallback={<div className="view-loading">Opening…</div>}><ResourceEditor note={note} onScreen /></Suspense>
      </div>
    </aside>
  );
}
