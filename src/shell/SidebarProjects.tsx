// The sidebar's Projects tab: the selected domain's projects (the masthead above names the domain), New project, and
// Next up, the domain's next open tasks ticked in place, shown only while the projects leave it its whole height.
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Circle, FolderOpen, Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { tabKey } from "../place.ts";
import { Tip } from "../Popups.tsx";

/** A sidebar entry for a page: selected while it's open; `late` or `flag` say what needs you there. `short` labels it
 *  where room is tight, the tooltip keeping the full title. */
export function NavItem({ id, title, short, Icon, active, onNavigate, color, late = 0, flag = "" }: {
  id: string; title: string; short?: string; Icon: LucideIcon; active: string; onNavigate: (key: string) => void; color?: string; late?: number; flag?: string;
}) {
  const said = flag || (late ? `${late} late` : "");
  return (
    <Tip label={said ? `${title}, ${said}` : title}><button aria-current={active === id ? "page" : undefined}
      className={`nav-item ${active === id ? "selected" : ""}`} onClick={() => onNavigate(id)}>
        <Icon size={18} />
        {color && <span className={`project-dot ${color}`} aria-hidden="true" />}<span>{short ?? title}</span>
        {said && <span className="nav-late">{said}</span>}
      </button></Tip>
  );
}

export function SidebarProjects({ projects, nextUp, active, onNavigate, onNewProject, onToggleTask }: {
  /** The selected domain's live projects, most pressing first, with their late steps. */
  projects: { id: string; title: string; color: string; late: number }[];
  /** The domain's open tasks: how many, and the next three by day (late first) with words for the day. */
  nextUp: { open: number; tasks: { id: string; title: string; when: string; late: boolean; today: boolean }[] };
  active: string;
  onNavigate: (key: string) => void;
  onNewProject: () => void;
  onToggleTask: (id: string) => void;
}) {
  const projectsPanel = useRef<HTMLDivElement>(null);
  const [nextFits, setNextFits] = useState(true);
  useEffect(() => {
    const panel = projectsPanel.current;
    const nav = panel?.querySelector<HTMLElement>(".nav-projects");
    if (!panel || !nav) return;
    const observer = new ResizeObserver(() => {
      const next = panel.querySelector<HTMLElement>(".sidebar-next");
      if (!next) return;
      const end = (nav.lastElementChild ?? nav).getBoundingClientRect().bottom + nav.scrollTop + 4;
      setNextFits(end - panel.getBoundingClientRect().top + next.offsetHeight <= panel.clientHeight);
    });
    observer.observe(panel);
    for (const child of nav.children) observer.observe(child);
    return () => observer.disconnect();
  }, [projects.length, nextUp.open]);
  return (
    <div ref={projectsPanel} id="sidebar-workspace" className="sidebar-panel" role="tabpanel" aria-labelledby="sidebar-tab-workspace">
      <nav className="nav-projects">
        {projects.map((project) => <NavItem key={project.id} id={tabKey({ kind: "project", id: project.id })} title={project.title} Icon={FolderOpen}
          active={active} onNavigate={onNavigate} color={project.color} late={project.late} />)}
        <button className="nav-item nav-add" onClick={onNewProject}><Plus size={16} /><span>New project</span></button>
      </nav>
      {/* What to do next here, ticked in place. It keeps its height while it steps aside, so the fit can be measured. */}
      {nextUp.open > 0 && (
        <section className="sidebar-next" data-room={nextFits} inert={!nextFits} aria-labelledby="sidebar-next-title">
          <div className="sidebar-next-head">
            <span id="sidebar-next-title">Next up</span><span className="sidebar-next-count">{nextUp.open}</span>
            <button className="sidebar-next-all" onClick={() => onNavigate("tasks")}>All {nextUp.open}<ChevronRight size={14} /></button>
          </div>
          {nextUp.tasks.map((task) => (
            <div key={task.id} className="sidebar-task">
              <Tip label="Mark done"><button className="sidebar-task-tick" aria-label={`Mark “${task.title}” done`} onClick={() => onToggleTask(task.id)}>
                <Circle size={16} /></button></Tip>
              <Tip label={task.title}><button className="sidebar-task-title" onClick={() => onNavigate("tasks")}>{task.title}</button></Tip>
              {task.when && <span className="sidebar-task-day" data-late={task.late || undefined} data-today={task.today || undefined}>{task.when}</span>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
