// Today, or the open project's page. Today is the day itself (docs/page-design.md, "Today"; agents-design D75): the
// greeting, then the day line with the tray and Morning, Afternoon and Evening beside your crew's rail (Atlas's line and
// each agent's next step for your yes), Coming up across the page, Today's widgets and one kept quote to close. From the
// evening the tray moves what's left to tomorrow. Each part reads only what it shows (docs/adr/0002) and is its own
// file in src/today/.
import { useApp, useView } from "./appContext.ts";
import { shownBlocks } from "./blocks.ts";
import type { TodayCard } from "./session.ts";
import PageGrid from "./PageGrid.tsx";
import ProjectMasthead from "./ProjectMasthead.tsx";
import { TodayDayLine, TodayHead } from "./today/TodayHead.tsx";
import { BackupNudge, PlanNotice, FirstMorningRow } from "./today/Notices.tsx";
import { TodayParts, TodayTray } from "./today/TodayHours.tsx";
import { TodayCrew } from "./today/TodayCrew.tsx";
import { TodayAhead } from "./today/TodayAhead.tsx";
import { TodayShelf } from "./today/TodayShelf.tsx";

function ProjectHead() {
  const { actions } = useApp();
  const project = useView((view) => view.screen.projectPage)!;
  const data = useView((view) => view.data);
  const tasks = useView((view) => view.projectTasks);
  const today = useView((view) => view.today);
  const brief = useView((view) => view.projectBrief);
  const inPanel = useView((view) => view.inPanel);
  const briefState = useView((view) => view.briefState);
  return (
    <ProjectMasthead project={project} data={data} tasks={tasks} today={today}
      onEdit={() => actions.editProject(project)}
      onCustomize={() => actions.setUi({ modal: "widgets" })}
      onAssign={(patch) => actions.assignProject(project, patch)}
      onBringIn={(suggestion) => actions.bringInLead(project, suggestion)}
      onNewAgent={actions.newAgent}
      onChat={actions.chatWith}
      onFolder={(folder) => actions.setProjectFolder(project, folder)}
      brief={brief}
      hushed={!!brief && inPanel.has(brief.agent.id)}
      briefState={briefState(project.id)}
      onBriefState={(state) => actions.setBriefState(project.id, state)}
      onBriefAction={actions.actOnBrief} />
  );
}

/** The overview page stays mounted under every global view, hidden unless it's Today or a project is open. */
export default function OverviewPage() {
  const view = useView((shown) => shown.session.view);
  const project = useView((shown) => shown.screen.projectPage);
  const pageBlocks = useView((shown) => shown.screen.page.blocks);
  const todayBlocks = useView((shown) => shown.screen.todayBlocks);
  const hidden = useView((shown) => shown.session.todayHidden);
  const shows = (card: TodayCard) => !hidden.includes(card);
  return (
    <div className={`overview-page${project ? "" : " today-page"}`} hidden={view ? view !== "today" : !project}>
      {project ? <ProjectHead /> : <TodayHead />}
      {!project && <BackupNudge />}
      {!project && <PlanNotice />}
      {!project && <FirstMorningRow />}
      {!project && <>
        <div className="today-day" data-crew={shows("crew") || undefined}>
          <div className="today-hours">
            <TodayDayLine />
            <TodayTray />
            <TodayParts />
          </div>
          {shows("crew") && <div className="today-side"><TodayCrew /></div>}
        </div>
        {shows("ahead") && <div className="today-side today-coming"><TodayAhead /></div>}
        {todayBlocks.length > 0 && <h2 className="today-group-title">Keep going</h2>}
      </>}
      {/* Today's widgets share the row two by two; a project's page keeps the widths it was arranged with. */}
      <PageGrid blocks={project ? shownBlocks(pageBlocks) : todayBlocks.map((block) => ({ ...block, width: "half" as const }))} />
      {!project && shows("shelf") && <TodayShelf />}
    </div>
  );
}
