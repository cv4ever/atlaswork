// One page on a twelve-column grid (D32): Today's, a project's, or a domain overview's blocks. The record widgets
// (tasks, projects, resources) are src/pageGrid/, with the task rows every list draws; data blocks are Widgets.tsx.
// Moved out of App.tsx so a page redraws only when what it shows changes (docs/adr/0002).
import type { CSSProperties } from "react";
import { LayoutGrid } from "lucide-react";
import { useApp, useView } from "./appContext.ts";
import type { Block } from "./blocks.ts";
import { projectInk } from "./look.ts";
import { domainHueName } from "./model.ts";
import { ProjectsWidget } from "./pageGrid/ProjectsWidget.tsx";
import { ResourcesWidget } from "./pageGrid/ResourcesWidget.tsx";
import { TasksWidget } from "./pageGrid/TasksWidget.tsx";
import type { ShownDomain } from "./view.ts";
import { DataBlock } from "./Widgets.tsx";

/** One page on a twelve-column grid (D32). `domain` draws a domain overview; otherwise the open project, or Today. */
export default function PageGrid({ blocks, domain }: { blocks: Block[]; domain?: ShownDomain }) {
  const { actions } = useApp();
  const today = useView((view) => view.today);
  const screen = useView((view) => view.screen);
  const projectPace = useView((view) => view.projectPace);
  const overviewProject = screen.projectPage;
  const draw = (block: Block) => block.type === "tasks" ? <TasksWidget block={block} domain={domain} />
    : block.type === "projects" ? <ProjectsWidget block={block} domain={domain} />
    : block.type === "resources" ? <ResourcesWidget block={block} domain={domain} />
    : <DataBlock block={block} today={today} notes={screen.pinnable} pace={domain ? undefined : projectPace}
      onOpenNote={(note) => actions.openResource(note, false, [note.id])} onEditNote={(id, body) => actions.changeNote(id, { body })}
      onChange={actions.changeBlock} />;
  return (
    // data-hue: a widget kind whose own colour is the domain's hue steps aside (widgets.css, page-design).
    <div className="page-grid" data-hue={domainHueName(domain?.hue)} style={{ "--hue": domain?.hue ?? (overviewProject ? projectInk(overviewProject) : undefined) } as CSSProperties}>
      {blocks.map((block) => <div key={block.id} className={`page-block width-${block.width ?? "full"}`}>{draw(block)}</div>)}
      {!blocks.length && (
        <div className="empty-state page-block width-full">
          <LayoutGrid size={26} />
          <h2>A little breathing room.</h2>
          <p>Add a widget whenever you need one.</p>
          <button className="secondary-button" onClick={() => actions.setUi({ modal: "widgets" })}>Choose widgets</button>
        </div>
      )}
    </div>
  );
}
