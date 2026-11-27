// The projects widget: a domain's projects on its overview, the rest of the domain on a project's page, every live
// project on Today (the six most pressing). By pace (each a plant in a pot, a bar and its verdict; a stalled one
// offers "Add a step"), as plant tiles, or as each project's next task.
import { Fragment } from "react";
import type { CSSProperties } from "react";
import { ArrowRight, FolderOpen, Plus } from "lucide-react";
import { useApp, useView } from "../appContext.ts";
import { viewOf } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { projectInk } from "../look.ts";
import { domainKey, tabKey } from "../place.ts";
import Plant from "../Plant.tsx";
import type { ShownDomain } from "../view.ts";
import { BlockHeading } from "./BlockHeading.tsx";
import { dueWords } from "./due.ts";
import { pacedProjects } from "./paced.ts";
import type { PacedProject } from "./paced.ts";
import { TaskRows } from "./TaskRows.tsx";

export function ProjectsWidget({ block, domain }: { block: Block; domain?: ShownDomain }) {
  const { actions } = useApp();
  const today = useView((view) => view.today);
  const live = useView((view) => view.visible);
  const overviewProject = useView((view) => view.screen.projectPage);
  const neighbours = domain ? domain.projects
    : overviewProject ? live.domainProjects.filter((project) => project.id !== overviewProject.id) : live.projects;
  const view = viewOf(block);
  const title = domain ? "Projects" : overviewProject ? `Elsewhere in ${overviewProject.area}` : "Things taking shape";
  const action = domain
    ? <span><button className="text-button" onClick={() => actions.openTab("projects")}>Garden view</button>{" · "}
      <button className="text-button" onClick={() => actions.newProject()}><Plus size={14} />New project</button></span>
    : <button className="text-button" onClick={() => actions.openTab(overviewProject ? domainKey(overviewProject.area) : "domains")}>
        {overviewProject ? "Domain overview" : "All domains"} <ArrowRight size={14} /></button>;
  // A domain page opens with its agent's ideas (D62), so its empty list points there rather than repeating them.
  const empty = !neighbours.length && <p className="domain-fallow">Fallow for now.{" "}
    {domain ? "Pick one of the ideas above, or name your own." : "A project will take root here."}</p>;
  const paced = pacedProjects(neighbours, live.tasks, today);
  const openProject = (id: string) => actions.openTab(tabKey({ kind: "project", id }));
  // Today shows the most pressing few; a domain or project page lists them all.
  const shown = domain || overviewProject ? paced : paced.slice(0, 6);
  const more = shown.length < paced.length && <p className="widget-caption">The {shown.length} most pressing of {paced.length}.</p>;
  if (view === "tiles")
    return (
      <section className="widget projects-widget tiles-view">
        <BlockHeading block={block} fallback={title} Icon={FolderOpen} action={action} />
        <div className="project-tiles">
          {shown.map(({ project, pace, next, done }) => (
            <button key={project.id} onClick={() => openProject(project.id)} style={{ "--hue": projectInk(project) } as CSSProperties}>
              <span className="project-tile-plant" aria-hidden="true"><Plant stage={pace.stage} /></span>
              <strong>{project.title}</strong>
              <small>{pace.stage.label} · {done ? "done" : next?.due ? `next ${dueWords(next.due, today)}` : pace.total ? "nothing due" : "no tasks yet"}</small>
              <span className="progress-track"><span style={{ transform: `scaleX(${pace.total ? pace.done / pace.total : 0})` }} /></span>
            </button>
          ))}
        </div>
        {more}
        {empty}
      </section>
    );
  if (view === "steps")
    return (
      <section className="widget projects-widget steps-view">
        <BlockHeading block={block} fallback={title} Icon={FolderOpen} action={action} />
        {paced.filter((entry) => entry.next).map(({ project, pace, next }) => (
          <div key={project.id} className="task-group" style={{ "--hue": projectInk(project) } as CSSProperties}>
            <h3><button className="text-button" onClick={() => openProject(project.id)}>{project.title}</button><small>{pace.done} of {pace.total}</small></h3>
            <TaskRows tasks={[next!]} limit={1} large />
          </div>
        ))}
        {paced.some((entry) => !entry.next) && <p className="widget-caption">
          {paced.filter((entry) => !entry.next).map(({ project, done }, index, rest) => <Fragment key={project.id}>
            {index > 0 && (index === rest.length - 1 ? " and " : ", ")}
            <button className="text-button" onClick={() => openProject(project.id)}>{project.title}</button>{done ? " is done 🌻" : " has no next step"}
          </Fragment>)}
        </p>}
        {empty}
      </section>
    );
  const behind = paced.filter((entry) => entry.pace.behind).length;
  return (
    <section className="widget projects-widget pace-view">
      <BlockHeading block={block} fallback={title} Icon={FolderOpen} action={behind ? <><span className="count-chip" data-late>{behind} behind</span>{action}</> : action} />
      <ul className="project-progress">{shown.map((entry) => <PaceRow key={entry.project.id} entry={entry} onOpen={openProject} />)}</ul>
      {more}
      {empty}
    </section>
  );
}

/** One project by pace; one with nothing left to do and not finished has stalled: it says so, and offers its next step. */
function PaceRow({ entry: { project, pace, daysLeft, done, next }, onOpen }: { entry: PacedProject; onOpen: (id: string) => void }) {
  const { actions } = useApp();
  const when = done ? " · Done" : !next ? <> · <b data-behind>no next step</b></>
    : daysLeft === undefined ? " · no finish date"
    : daysLeft >= 0 ? <> · {daysLeft} days left · {pace.behind ? <b data-behind>Behind</b> : "On track"}</> : ` · ${-daysLeft} days past the finish`;
  return (
    <li data-stalled={!done && !next || undefined}><button onClick={() => onOpen(project.id)} style={{ "--hue": projectInk(project) } as CSSProperties}>
      <span className="project-pot" aria-hidden="true" title={pace.stage.label}><Plant stage={pace.stage} /></span>
      <span><strong>{project.title}</strong><small>{pace.total ? `${pace.done} of ${pace.total}` : "No tasks yet"}{when}</small></span>
      <span className="progress-track"><span style={{ transform: `scaleX(${pace.total ? pace.done / pace.total : 0})` }} /></span>
    </button>
    {!done && !next && <button className="secondary-button project-next" onClick={() => actions.newTask(project.id)}><Plus size={14} />Add a step</button>}</li>
  );
}
