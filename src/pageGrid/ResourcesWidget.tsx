// The resources widget: what's kept straight in a domain, in the open project, or on Today what you touched last.
// Behind kind-count chips, by age, or over a strip that saves a pasted link or a dropped file straight away.
import { Link2, Plus } from "lucide-react";
import { useApp, useView } from "../appContext.ts";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { kindLabels, kindOf, noteTitle } from "../model.ts";
import type { Note } from "../model.ts";
import { relativeDay } from "../dataBlocks/parts.tsx";
import { domainKey } from "../place.ts";
import { Tip } from "../Popups.tsx";
import { ResourceThumb, captured } from "../Resources.tsx";
import type { ShownDomain } from "../view.ts";
import * as workspace from "../workspace.ts";
import { BlockHeading } from "./BlockHeading.tsx";
import { daysUntil, dueDay } from "./due.ts";
import { DropStrip, KindsList } from "./lists.tsx";

/** Newest edit first. */
const newest = (a: Note, b: Note) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

export function ResourcesWidget({ block, domain }: { block: Block; domain?: ShownDomain }) {
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const live = useView((view) => view.visible);
  const screen = useView((view) => view.screen);
  const overviewProject = screen.projectPage;
  const resources = domain ? live.domainNotes.filter((note) => !note.projectId)
    : overviewProject ? workspace.resourcesIn(data, overviewProject.id) : live.notes;
  const view = viewOf(block);
  const title = block.title || (domain ? `Kept in ${domain.name}` : overviewProject ? "Resources" : "Recently touched");
  const capture = () => domain ? actions.openCapture(domainKey(domain.name))
    : overviewProject ? actions.openCapture(overviewProject.id) : actions.openCapture();
  const add = <Tip label="Add a resource"><button className="icon-button heading-add" aria-label="Add a resource" onClick={capture}><Plus size={16} /></button></Tip>;
  const openNote = (note: Note) => actions.openResource(note, false, resources.map((item) => item.id));
  // Today's list is what you touched last, newest first, kept to six so it sits beside the projects.
  const onToday = !domain && !overviewProject;
  const limit = onToday ? 6 : 10;
  const empty = domain ? "Nothing kept straight in this domain. Project material lives in its project."
    : "Nothing here yet. Paste a link, drop a file, or link something you already keep.";
  const row = (note: Note, age: boolean) => {
    const edited = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString("en-CA") : "";
    const ago = !edited ? "" : edited === today ? <b>edited today</b>
      : daysUntil(edited, today) > -14 ? relativeDay(daysUntil(edited, today)) : dueDay(edited, today).when;
    return <li key={note.id} data-kind={kindOf(note)}><button onClick={() => openNote(note)}>
      <ResourceThumb note={note} /><span>{noteTitle(note)}</span>
      {age ? <small>{ago}</small> : <small>{kindLabels[kindOf(note)]}</small>}
    </button></li>;
  };
  if (view === "recent")
    return (
      <section className="widget resources-widget list-view">
        <BlockHeading block={block} fallback={title} Icon={Link2} action={<><span className="count-chip">{resources.length} kept</span>{add}</>} />
        <ul className="resource-list">{[...resources].sort(newest).slice(0, limit).map((note) => row(note, true))}</ul>
        {!resources.length && <p className="empty-inline">{empty}</p>}
      </section>
    );
  if (view === "drop")
    return (
      <section className="widget resources-widget list-view">
        <BlockHeading block={block} fallback={title} Icon={Link2} action={<span className="count-chip">{resources.length} kept</span>} />
        <ul className="resource-list">{resources.slice(0, 4).map((note) => row(note, true))}</ul>
        {resources.length > 4 && <button className="text-button" onClick={() => actions.openTab(domain ? domainKey(domain.name) : "library")}>
          {resources.length - 4} more</button>}
        <DropStrip onOpen={capture} onCapture={(text, file) => actions.saveCapture(captured(text, file), domain ? domainKey(domain.name)
          : overviewProject ? overviewProject.id : screen.home)} />
      </section>
    );
  return <KindsList title={title} heading={(action) => <BlockHeading block={block} fallback={title} Icon={Link2} action={action} />}
    items={onToday ? [...resources].sort(newest) : resources} limit={limit} add={add} empty={empty} row={(note) => row(note, false)} />;
}
