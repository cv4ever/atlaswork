// The View: everything the screen derives from the Workbench snapshot, the Room's activity and the UI store's clock,
// each part memoized on exactly the inputs it reads. Components subscribe to one part each (`useView` in
// appContext.tsx), so a part keeps its identity until its own inputs change: opening chat doesn't redraw the page, and a
// saved scroll position redraws nothing (docs/adr/0002). No React dependency.
import type { AgentEngine, EngineInfo } from "./atlas.ts";
import { briefOf, domainBriefOf, isSpeaking } from "./brief.ts";
import type { Brief, BriefState } from "./brief.ts";
import type { Activity, Conversations, Discovery, RosterRow, ThreadSummary } from "./conversations.ts";
import { kindOf } from "./model.ts";
import { hueOf, portraitSrc, profileAvatar, projectInk } from "./look.ts";
import { toolLabels } from "./session.ts";
import { daypartAt, pinnedDay } from "./dates.ts";
import type { plantStages } from "./look.ts";
import { pagePlacesOf, pageBlocksOf, peopleHorizonOf, todayAsksOf, todayFocusOf, todayHorizonOf, todayRitualsOf, todayRowOf, todayTasksOf } from "./today/derive.ts";
import type { HorizonDate, PagePlace, TodayAsk, TodayBrief, TodayRituals, TodayTasks } from "./today/derive.ts";
import { busySpans, crewStepsOf, freeSlots, minuteNow, placeSteps, proposalStepsOf, quietAgentsOf, todayDayOf } from "./today/day.ts";
import type { DayStep, TodayDay } from "./today/day.ts";
import { waitingIdeas } from "./routines.ts";
import type { WaitingIdea } from "./routines.ts";
import type { Agent, Domain, Note, Project, Task, Thread, Topic, WorkspaceData } from "./model.ts";
import type { Sitting } from "./sittings.ts";
import type { Session } from "./session.ts";
import { paceOf, stageOf } from "./pace.ts";
import type { Pace } from "./pace.ts";
import { domainKey, homeKey, parseTab } from "./place.ts";
import type { Ui, UiState } from "./ui.ts";
import type { Workbench, WorkbenchSnapshot } from "./workbench.ts";
import * as workspace from "./workspace.ts";
import type { Screen, Visible } from "./workspace.ts";

/** One agent's row in the sidebar roster (the Room's `RosterRow`), with the ring colour of the domain it looks after. */
export type RosterEntry = RosterRow & { hue?: string };
/** One conversation as the strip, the chat list, and the Chats page show it; the Room says how it reads, the UI adds its colour. */
export type ChatEntry = ThreadSummary & { hue?: string };

/** Caches the last result of `fn` for the inputs it's called with; the same inputs return the same object. */
function memo<K extends readonly unknown[], R>(fn: (...key: K) => R) {
  let last: K | undefined;
  let value: R;
  return (...key: K): R => {
    if (last && key.every((item, index) => Object.is(item, last![index]))) return value;
    last = key;
    return value = fn(...key);
  };
}

/** `?daypart=` pins the greeting and canvas for checks; `?today=` (`pinnedDay`) pins the day. */
const pinnedDaypart = ["morning", "day", "evening", "night"].find((part) => part === new URLSearchParams(location.search).get("daypart"));
/** The day routines run for: `?today=` at noon (clear of timezone edges), else now. Call it in handlers and effects, never while rendering. */
export const todayDate = () => pinnedDay ? new Date(`${pinnedDay}T12:00:00`) : new Date();
/** The same, for drawing: from the View's minute clock instead of the wall clock. */
export const routineDate = (now: number) => pinnedDay ? new Date(`${pinnedDay}T12:00:00`) : new Date(now);
/** A local date as YYYY-MM-DD. */
export const dayOf = (at: number) => new Date(at).toLocaleDateString("en-CA");
/** A tab's title: a page's label, a resource's or project's title, a domain's "Overview". */
export const tabTitle = (key: string, noteById: Record<string, Note>, projectById: Record<string, Project>) => {
  const tab = parseTab(key);
  return toolLabels[key] || (tab.kind === "resource" ? noteById[tab.id]?.title : tab.kind === "project" ? projectById[tab.id]?.title
    : tab.kind === "domain" ? "Overview" : undefined) || "Untitled";
};

/** A live Domain as the screen draws it: its accent and its live projects. */
export type ShownDomain = Domain & { hue: string; projects: Project[] };
/** `rider` rides the lane's edge: a project's growth stage (drawn by Plant.tsx), or a domain's emblem. */
export type Progress = { id: string; label: string; hue: string; rider: (typeof plantStages)[number] | string; done: number; total: number };
/** The conversations as the screen draws them: `discover()` coloured by Domain. */
export type ChatView = {
  threadId: string;
  thread: Thread;
  current: ChatEntry;
  entries: Map<string, ChatEntry>;
  chats: ChatEntry[];
  strip: ChatEntry[];
  tabs: ChatEntry[];
  sittings: Sitting[];
  unreadTotal: number;
  roster: RosterEntry[];
  welcome: string;
};
type PlaceGroup = { label: string; options: { value: string; label: string }[] };
export type View = {
  data: WorkspaceData;
  session: Session;
  now: number;
  today: string;
  daypart: string;
  greeting: string;
  /** Today winds down: from evening until midnight it reviews the day and looks at tomorrow (docs/page-design.md, "Today"). */
  evening: boolean;
  visible: Visible;
  noteById: Record<string, Note>;
  projectById: Record<string, Project>;
  screen: Screen;
  domains: ShownDomain[];
  chat: ChatView;
  /** The open project's tasks, or every live task elsewhere. */
  projectTasks: Task[];
  projectPace: Pace | undefined;
  projectBrief: Brief | null;
  /** The Domain whose page is on screen. */
  areaDomain: ShownDomain | undefined;
  domainBrief: Brief | null;
  /** Agents in the open chat panel; their briefs hush (D40). */
  inPanel: Set<string>;
  todayBriefs: TodayBrief[][];
  /** Questions routines left for your OK, which Today groups into one row (D50). */
  todayAsks: TodayAsk[];
  /** Weekly improvements waiting for your pick (agents-design D69), on Today only. */
  todayIdeas: WaitingIdea[];
  todayTasks: TodayTasks;
  /** Your starred task, while it's today's and open. */
  todayFocus: Task | undefined;
  /** Where today's tasks sit: the tray and the parts of the day (agents-design D75). */
  todayDay: TodayDay;
  /** The crew's next steps for today, each at a free half hour while there is one (D75); empty off Today. */
  todaySteps: DayStep[];
  /** The half hours still free after those steps, for Atlas's plan and Other time. */
  todayFree: number[];
  /** Crew agents with nothing to say today. */
  todayQuiet: Agent[];
  pagePlaces: PagePlace[];
  todayRituals: TodayRituals;
  todayHorizon: HorizonDate[];
  todayQuotes: Note[];
  briefState: (place: string) => BriefState;
  facesOnPage: Set<string>;
  firstMorning: "" | "pending" | "later";
  profilePicture: string;
  topicGroup: PlaceGroup;
  placeGroups: PlaceGroup[];
  progress: Progress | undefined;
  hasBackupContent: boolean;
  /** Who answers every agent (`AgentEngine.about`); a new value whenever the engine's own settings change, so what reads it redraws. */
  about: EngineInfo;
};

export type ViewStore = {
  /** The screen's View: the same object until the Workbench snapshot, the Room's activity, the clock or the engine change. Null before the Workspace loads. */
  get(): View | null;
  subscribe(listener: () => void): () => void;
};

/**
 * Agents whose face the page already shows in a brief (a project's or domain's bubble, Today's cards): the header's
 * chat button and Today's chat row leave them out, so each face shows once on screen (D40).
 */
function facesOf(project: Project | undefined, pBrief: Brief | null, area: ShownDomain | undefined, dBrief: Brief | null,
  view: Session["view"], section: string, stateOf: (place: string) => BriefState, panel: Set<string>, briefs: TodayBrief[][], all: boolean) {
  const hushed = (brief: Brief | null) => !!brief && panel.has(brief.agent.id);
  const domainSpeaks = !project && view === null && area && dBrief && section === "overview"
    && isSpeaking(dBrief, stateOf(domainKey(area.name)), hushed(dBrief));
  return new Set([
    ...project && pBrief && isSpeaking(pBrief, stateOf(project.id), hushed(pBrief)) ? [pBrief.agent.id] : [],
    ...domainSpeaks ? [dBrief.agent.id] : [],
    ...(all ? briefs : briefs.slice(0, 3)).map((entries) => entries[0].brief.agent.id),
  ]);
}

/** Resource homes for pickers: each domain and its projects, then the Library's topics, people by their name (D71). */
function placeGroupsOf(shownDomains: Domain[], projects: Project[], topics: Topic[]) {
  const topicGroup = { label: "Library topics", options: topics.map((topic) => ({ value: homeKey({ domain: "", topicId: topic.id }),
    label: topic.person ? topic.name : `${topic.emoji} ${topic.name}` })) };
  const placeGroups = [...shownDomains.map((domain) => ({ label: `${domain.emoji} ${domain.name}`, options: [
    { value: domainKey(domain.name), label: `${domain.name}, no project` },
    ...projects.filter((project) => project.area === domain.name).map((project) => ({ value: project.id, label: project.title })),
  ] })), topicGroup];
  return { topicGroup, placeGroups };
}

/**
 * Today's next steps (agents-design D75): chat and routine proposals for today, then the crew's own for tasks no
 * proposal already places, each in a free stretch its task's length fits, around timed tasks and busy calendar events.
 */
function stepsOf(data: WorkspaceData, briefs: TodayBrief[][], tasks: Task[], projects: Project[], shown: ShownDomain[],
  inPlay: Task[], day: string, minute: number, skipped: Session["todaySkipped"], events: UiState["dayEvents"]) {
  const hues = new Map(shown.map((domain) => [domain.name, domain.hue]));
  const proposed = proposalStepsOf(data.threads, data.agents, tasks, hues, day);
  const planned = new Set(proposed.flatMap((step) => step.task ? [step.task.id] : []));
  const crew = crewStepsOf(briefs, tasks, projects, hues, day).filter((step) => !planned.has(step.task!.id));
  const free = freeSlots(busySpans(inPlay, day, events.day === day ? events.events : []), minute);
  return placeSteps([...proposed, ...crew], free, day, skipped.day === day ? skipped.keys : [], minute);
}

/** What the View was last built from (`createView`'s `get`), so the same inputs return the same View. */
type ViewCache = { snapshot: WorkbenchSnapshot; activity: Activity; now: number; allBriefs: boolean; events: UiState["dayEvents"]; tick: number; view: View };

export function createView(workbench: Workbench, conversations: Conversations, ui: Ui, engine: AgentEngine, portrait?: string): ViewStore {
  let engineTick = 0;
  const listeners = new Set<() => void>();
  let stop: (() => void) | undefined;
  const notify = () => { for (const listener of listeners) listener(); };

  const today = memo((now: number) => pinnedDay || dayOf(now));
  const daypart = memo((now: number) => pinnedDaypart ?? daypartAt(new Date(now).getHours()));
  // Everything visible, then the selected domain's slices: a domain switch keeps every other list, and what's built on them.
  const everywhere = memo((domains: Domain[], projects: Project[], notes: Note[], tasks: Task[], topics: Topic[], day: string) =>
    workspace.visible({ domains, projects, notes, tasks, topics }, "", day));
  const visible = memo((live: Visible, domain: string) => workspace.inDomain(live, domain));
  const noteById = memo((notes: Note[]) => Object.fromEntries(notes.map((note) => [note.id, note])));
  const projectById = memo((projects: Project[]) => Object.fromEntries(projects.map((project) => [project.id, project])));
  // onScreen reads the place, the section and Today's widgets from the Session; nothing else may redraw the page.
  let screenSession: Session;
  const screen = memo((data: WorkspaceData, day: string, live: Visible,
    _domain: string, _active: string, _view: Session["view"], _section: string, _topic: string, _widgets: Session["widgets"], _views: Session["todayViews"]) =>
    workspace.onScreen(data, screenSession, day, live));
  const domains = memo((shownDomains: Domain[], projects: Project[]): ShownDomain[] => shownDomains.map((domain) => ({
    ...domain, hue: hueOf(domain), projects: projects.filter((project) => project.area === domain.name),
  })));
  // The Room reads the place, the Picked chat, the Chats page tabs and your name (the welcome) from the Session, and its own activity.
  const discovery = memo((_data: WorkspaceData, _domain: string, _active: string, _view: Session["view"], _topic: string,
    _pick: Session["chatPick"], _tabs: Session["chatTabs"], _name: string, _activity: Activity, _engine: number) => conversations.discover());
  const chat = memo((found: Discovery, shown: ShownDomain[]): ChatView => {
    const domainHue = (name: string) => shown.find((domain) => domain.name === name)?.hue;
    /** The Room says how each chat reads; colour comes from its Domain here. */
    const entries = new Map([...found.entries]
      .map(([id, entry]): [string, ChatEntry] => [id, { ...entry, hue: entry.domain ? domainHue(entry.domain) : undefined }]));
    const threadId = found.current.id;
    return {
      threadId, thread: found.current.thread, current: entries.get(threadId)!, entries,
      chats: found.chats.map((entry) => entries.get(entry.id)!), strip: found.strip.map((entry) => entries.get(entry.id)!),
      tabs: found.tabs.map((entry) => entries.get(entry.id)!), sittings: found.sittings, unreadTotal: found.unreadTotal,
      /** The sidebar roster, in roster order; the shell filters and sorts it by the saved roster view. */
      roster: found.roster.map((row) => ({ ...row, hue: shown.find((domain) => domain.agentId === row.agent.id)?.hue })), welcome: found.welcome,
    };
  });
  const projectTasks = memo((tasks: Task[], project: Project | undefined) => project ? tasks.filter((task) => task.projectId === project.id) : tasks);
  const projectPace = memo((project: Project | undefined, tasks: Task[], day: string) => project ? paceOf(project, tasks, day) : undefined);
  const projectBrief = memo((data: WorkspaceData, project: Project | undefined, tasks: Task[], day: string) =>
    project ? briefOf(data, project, tasks, day, !!data.briefs[project.id]?.welcomed) : null);
  const areaDomain = memo((shown: ShownDomain[], page: Domain | undefined) => shown.find((domain) => domain.name === page?.name));
  const domainBrief = memo((data: WorkspaceData, area: ShownDomain | undefined, tasks: Task[], day: string) =>
    area ? domainBriefOf(data, area, tasks, day) : null);
  /** The agents the open side panel shows, as `\n`-joined ids, so a new Discovery with the same agents keeps the set. */
  const inPanel = memo((open: boolean, view: Session["view"], agents: string) =>
    new Set(open && view !== "chats" && agents ? agents.split("\n") : []));
  // Today's parts (today/derive.ts), each on exactly its inputs.
  const todayRow = memo(todayRowOf);
  const todayTasks = memo(todayTasksOf);
  const todayFocus = memo(todayFocusOf);
  const todayDay = memo(todayDayOf);
  const daySteps = memo(stepsOf);
  const todayQuiet = memo(quietAgentsOf);
  const noSteps = { steps: [] as DayStep[], free: [] as number[] };
  const pagePlaces = memo(pagePlacesOf);
  const pageBlocks = memo(pageBlocksOf);
  const todayRituals = memo(todayRitualsOf);
  const todayHorizon = memo(todayHorizonOf);
  const peopleHorizon = memo(peopleHorizonOf);
  const todayQuotes = memo((notes: Note[]) => notes.filter((note) => kindOf(note) === "quote"));
  const noBriefs: TodayBrief[][] = [];
  const noAsks: TodayAsk[] = [];
  const noIdeas: WaitingIdea[] = [];
  const todayIdeas = memo((threads: Thread[], agents: Agent[]) => waitingIdeas(threads, agents));
  const todayAsks = memo(todayAsksOf);
  /** A place's brief state (project id or domain key): what this device has seen, and the workspace's BriefMark. */
  const briefStates = memo((seen: Session["briefs"], marks: WorkspaceData["briefs"]) => {
    const cache = new Map<string, BriefState>();
    return (place: string): BriefState => {
      let state = cache.get(place);
      if (!state) cache.set(place, state = { ...seen[place], ...marks[place] });
      return state;
    };
  });
  const facesOnPage = memo(facesOf);
  const places = memo(placeGroupsOf);
  const progress = memo((shown: Screen["progress"]): Progress | undefined => shown && {
    id: shown.id, label: shown.label, done: shown.done, total: shown.total,
    hue: shown.project ? projectInk(shown.project) : shown.domain ? hueOf(shown.domain) : "var(--accent)",
    rider: shown.project ? stageOf(shown.done, shown.total) : shown.domain?.emoji ?? "☀️",
  });
  /** Onboarding's domains and agents aren't content; the backup reminder waits for something of yours. */
  const hasBackupContent = memo((data: WorkspaceData) => !!data.projects.length || !!data.notes.length || !!data.tasks.length || !!data.topics.length
    || data.threads.some((thread) => thread.messages.some((message) => message.role === "user")));
  const about = memo((_tick: number) => engine.about());

  const build = (data: WorkspaceData, session: Session, now: number, allBriefs: boolean, events: UiState["dayEvents"]): View => {
    const day = today(now);
    const part = daypart(now);
    const live = visible(everywhere(data.domains, data.projects, data.notes, data.tasks, data.topics, day), session.domain);
    screenSession = session;
    const shown = screen(data, day, live, session.domain, session.active, session.view, session.section, session.libraryTopic,
      session.widgets, session.todayViews);
    const domainList = domains(live.domains, live.projects);
    const talk = chat(discovery(data, session.domain, session.active, session.view, session.libraryTopic, session.chatPick, session.chatTabs,
      session.profileName, conversations.getSnapshot(), engineTick), domainList);
    const overviewProject = shown.projectPage;
    const ownTasks = projectTasks(live.tasks, overviewProject);
    const pBrief = projectBrief(data, overviewProject, ownTasks, day);
    const area = areaDomain(domainList, shown.domainPage);
    const dBrief = domainBrief(data, area, live.domainTasks, day);
    const panel = inPanel(session.agentOpen, session.view, talk.current.agents.map((agent) => agent.id).join("\n"));
    const briefsToday = session.view === "today" ? todayRow(data, live.projects, live.domains, live.tasks, day, panel) : noBriefs;
    const asksToday = session.view === "today" ? todayAsks(data.threads, data.agents) : noAsks;
    const ideasToday = session.view === "today" ? todayIdeas(data.threads, data.agents) : noIdeas;
    const stateOf = briefStates(session.briefs, data.briefs);
    const tasksToday = todayTasks(live.tasks, day);
    const placesToday = pagePlaces(domainList);
    const blocksToday = pageBlocks(placesToday, data.domains, data.projects);
    const { steps, free } = session.view === "today"
      ? daySteps(data, briefsToday, live.tasks, live.projects, domainList, tasksToday.garden, day, minuteNow(now), session.todaySkipped, events) : noSteps;
    return {
      data, session, now, today: day, daypart: part,
      greeting: part === "day" ? "Good afternoon" : part === "night" ? "Good night" : `Good ${part}`,
      // Night after midnight is a new day starting, not one to wrap up.
      evening: part === "evening" || (part === "night" && new Date(now).getHours() >= 17),
      visible: live, noteById: noteById(data.notes), projectById: projectById(data.projects), screen: shown, domains: domainList, chat: talk,
      projectTasks: ownTasks, projectPace: projectPace(overviewProject, ownTasks, day), projectBrief: pBrief,
      areaDomain: area, domainBrief: dBrief, inPanel: panel, todayBriefs: briefsToday, todayAsks: asksToday, todayIdeas: ideasToday, briefState: stateOf,
      todayTasks: tasksToday, todayFocus: todayFocus(tasksToday.open, session.todayFocus, day), todayDay: todayDay(tasksToday.garden, day),
      todaySteps: steps, todayFree: free, todayQuiet: todayQuiet(data.agents, briefsToday, steps), pagePlaces: placesToday,
      todayRituals: todayRituals(blocksToday, day), todayHorizon: todayHorizon(blocksToday, day, peopleHorizon(data.topics, day)),
      todayQuotes: todayQuotes(live.notes),
      facesOnPage: facesOnPage(overviewProject, pBrief, area, dBrief, session.view, session.section, stateOf, panel, briefsToday, allBriefs),
      firstMorning: session.onboarded ? (session.firstMorning === "later" ? "later" : "pending") : "",
      // A colour you picked means your initial; else the crew face you picked, your photo, the dev portrait, or your initial in green.
      profilePicture: session.profileHue ? profileAvatar(session.profileName, session.profileHue)
        : session.profilePortrait ? portraitSrc({ portrait: session.profilePortrait }, session.crewStyle)
        : session.profilePhoto || portrait || profileAvatar(session.profileName),
      ...places(live.domains, live.projects, live.topics),
      progress: progress(shown.progress),
      hasBackupContent: hasBackupContent(data),
      about: about(engineTick),
    };
  };
  let last: ViewCache | undefined;

  return {
    get() {
      const snapshot = workbench.getSnapshot(), activity = conversations.getSnapshot(), { now, allBriefs, dayEvents: events } = ui.get();
      if (!snapshot.data) return null;
      if (last && last.snapshot === snapshot && last.activity === activity && last.tick === engineTick && last.now === now && last.allBriefs === allBriefs
        && last.events === events) return last.view;
      const view = build(snapshot.data, snapshot.session, now, allBriefs, events);
      last = { snapshot, activity, now, allBriefs, events, tick: engineTick, view };
      return view;
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const off = [workbench.subscribe(notify), conversations.subscribe(notify), ui.subscribe(notify),
          engine.subscribe?.(() => { engineTick++; notify(); })];
        stop = () => { for (const each of off) each?.(); };
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) stop?.();
      };
    },
  };
}
