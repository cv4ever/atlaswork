// Ctrl K: search, the open-tab finder, and the note picker for a conversation (search.ts finds; this draws).
import { ArrowLeft, ArrowRight, FolderOpen, Library, Pin, Search, X } from "lucide-react";
import { useApp, useUi, useView } from "../appContext.ts";
import Dialog from "../Dialog.tsx";
import { kindLabels, kindOf, noteTitle } from "../model.ts";
import { viewLabels, toolLabels } from "../session.ts";
import { domainKey, homeKey, parseTab, placeName, tabKey } from "../place.ts";
import { captured, kindIcons } from "../Resources.tsx";
import { search } from "../search.ts";
import type { Hit } from "../search.ts";
import { tabTitle } from "../view.ts";
import { morph } from "../morph.ts";
import { Tip } from "../Popups.tsx";
import { backgrounds, sidebars, rails, themes, themeSettings } from "./themes.ts";

/** Search, the open-tab finder, and the note picker for a conversation: results only while it's open. */
export function SearchDialog({ modal }: { modal: "search" | "tabs" | "context" }) {
  const { actions, workbench, shell } = useApp();
  const query = useUi((state) => state.query);
  const live = useView((view) => view.visible);
  const tabs = useView((view) => view.session.tabs);
  const pinned = useView((view) => view.session.pinned);
  const selected = useView((view) => view.session.domain);
  const noteById = useView((view) => view.noteById);
  const projectById = useView((view) => view.projectById);
  const data = useView((view) => view.data);
  const label = useView((view) => view.chat.current.label);
  const screen = useView((view) => view.screen);
  const overviewProject = screen.projectPage;
  const q = query.trim().toLocaleLowerCase();
  const tabLabel = (key: string) => tabTitle(key, noteById, projectById);
  /** A hit as a row: `key` opens it (and names the tab in tabs mode); `hit` says what picking it does. */
  const hitRow = (hit: Hit) => {
    switch (hit.kind) {
      case "tab": return { key: hit.key, title: tabLabel(hit.key), kind: "Open tab", hit };
      case "project": return { key: tabKey({ kind: "project", id: hit.project.id }), title: hit.project.title, kind: hit.project.area, hit };
      case "resource": return { key: tabKey({ kind: "resource", id: hit.note.id }), title: noteTitle(hit.note),
        kind: `${kindLabels[kindOf(hit.note)]} in ${placeName(data, homeKey(hit.note))}`, hit };
      case "topic": return { key: homeKey({ domain: "", topicId: hit.topic.id }), title: hit.topic.person ? hit.topic.name : `${hit.topic.emoji} ${hit.topic.name}`,
        kind: hit.topic.person ? "Person" : "Library topic", hit };
      case "page": return { key: hit.key, title: toolLabels[hit.key], kind: hit.key in viewLabels ? "Page" : selected, hit };
    }
  };
  const navigationResults = search(modal, query, { projects: live.projects, notes: live.notes, topics: live.topics },
    { tabs, label: tabLabel, pages: toolLabels }).map(hitRow);
  // A pasted link captures straight to where you are.
  const pastedLink = modal === "search" && /^https?:\/\/\S+$/i.test(query.trim())
    ? [{ title: `Capture link to ${placeName(data, screen.home)}`, run: () => actions.saveCapture(captured(query), screen.home) }] : [];
  const actionResults = modal === "search" && q ? [...pastedLink, ...[
    { title: "Capture…", run: () => actions.openCapture() },
    { title: "New note", run: () => actions.newNote() },
    { title: "New task", run: () => actions.newTask(screen.projectId) },
    { title: "New project", run: actions.newProject },
    { title: "New topic", run: actions.newTopic },
    ...(overviewProject ? [{ title: `Link a resource to ${overviewProject.title}`, run: () => actions.openCapture(overviewProject.id, true) }] : []),
    ...(["light", "dark"] as const).map((value) => ({ title: `Switch to ${value} mode`, run: () => actions.updateSession({ theme: value }) })),
    ...themes.map((theme) => ({ title: `Use ${theme.name} theme`, run: () => actions.updateSession(themeSettings(theme)) })),
    ...backgrounds.map(([value, label]) => ({ title: `Use ${label.toLocaleLowerCase()} background`, run: () => actions.updateSession({ canvas: value }) })),
    ...sidebars.map((value) => ({ title: `Use ${value} sidebar`, run: () => actions.updateSession({ sidebarStyle: value }) })),
    ...rails.map(([value, label]) => ({ title: `Use ${label.toLocaleLowerCase()} chat rail`, run: () => actions.updateSession({ railStyle: value }) })),
    { title: "Show/hide Atlas", run: () => morph(() => shell.current?.toggleChat()) },
    { title: "Open settings", run: () => actions.openSettings(null) },
    { title: "Run setup again", run: actions.openOnboarding },
    { title: "Export backup", run: actions.exportBackup },
  ].filter((action) => action.title.toLocaleLowerCase().includes(q))].map((action) => ({ ...action, key: `action:${action.title}`, kind: "Actions" })) : [];
  const results: { key: string; title: string; kind: string; run?: () => void; hit?: Hit }[] = [...actionResults, ...navigationResults];
  return (
    <Dialog title={modal === "context" ? `Attach a note for ${label}` : modal === "tabs" ? "Your open tabs" : "Search"} onClose={actions.closeModal}>
      <div className="dialog-search">
        <Search size={18} />
        <input aria-label={modal === "tabs" ? "Search open tabs" : "Search workspace"}
          placeholder={modal === "tabs" ? "Find an open tab…" : "Search notes and projects…"}
          value={query} onChange={(event) => actions.setUi({ query: event.target.value })} />
      </div>
      {modal === "context" && (
        <p className="dialog-description">
          Only this conversation sees it. Agents also see the notes in
          the domains and projects they look after.
        </p>
      )}
      <div className="search-results">
        {results.map((result, index) => (
          <div key={result.key}>
            {(index === 0 || (index === actionResults.length && actionResults.length > 0)) &&
              <h3 className="search-group-heading">{result.run ? "Actions" : "Results"}</h3>}
            <div className="search-row">
              <button data-search-result onClick={() => {
                actions.closeModal();
                const { hit } = result;
                if (result.run) result.run();
                else if (hit?.kind === "resource" && modal === "context") actions.attachNote(hit.note.id);
                else if (hit?.kind === "topic") { actions.setLibraryTopic(hit.topic.id); actions.openTab("library"); }
                else actions.openTab(result.key);
              }}>
                <span className="search-result-icon">
                  {(() => {
                    const { hit } = result, tab = hit?.kind === "tab" ? parseTab(hit.key) : undefined;
                    const note = hit?.kind === "resource" ? hit.note : tab?.kind === "resource" ? noteById[tab.id] : undefined;
                    const Icon = note ? kindIcons[kindOf(note)] : hit?.kind === "topic" ? Library : FolderOpen;
                    return <Icon size={18} />;
                  })()}
                </span>
                <span><strong>{result.title}</strong><small>{result.kind}</small></span>
                <ArrowRight size={14} />
              </button>
              {modal === "tabs" && result.key !== domainKey(selected) && (
                <div className="tab-tools">
                  <Tip label={pinned.includes(result.key) ? "Unpin tab" : "Pin tab"}><button className="icon-button" aria-label={`${pinned.includes(result.key) ? "Unpin" : "Pin"} ${result.title}`} aria-pressed={pinned.includes(result.key)}
                  onClick={() => { void workbench.togglePin(result.key); }}>
                  <Pin size={14} />
                                    </button></Tip>
                  <Tip label="Move tab left"><button className="icon-button" aria-label={`Move ${result.title} left`} disabled={tabs.indexOf(result.key) <= 1}
                    onClick={() => {
                      const order = [...tabs];
                      const i = order.indexOf(result.key);
                      [order[i - 1], order[i]] = [order[i], order[i - 1]];
                      void workbench.reorderTabs(order);
                    }}>
                                    <ArrowLeft size={14} />
                                  </button></Tip>
                  {!pinned.includes(result.key) && (
                    <Tip label="Close tab"><button className="icon-button" aria-label={`Close ${result.title}`} onClick={() => void workbench.closeTab(result.key)}>
                      <X size={14} />
                    </button></Tip>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {!results.length && <p className="empty-inline">Nothing matches yet. Try a different word.</p>}
      </div>
      <div className="dialog-footer">
        {modal === "tabs" ? `${tabs.length} open tabs. Pinned tabs stay until you unpin them.` : "Search stays on this device."}
        <kbd>Esc to close</kbd>
      </div>
    </Dialog>
  );
}
