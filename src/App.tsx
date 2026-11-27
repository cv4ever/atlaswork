// The app's composition: it creates the Workbench, the Room, the UI store, the View and the Actions once, keeps URL
// history, the minute clock, keyboard shortcuts and the look in step, and lays the screen out in the shell. Pages,
// popups, the chat panel and the status bar are their own components, each subscribed to the part of the View or the
// UI store it draws, so a click redraws what changed and nothing else (docs/adr/0002).
import { Suspense, lazy, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, FileText } from "lucide-react";
import { AppContext, useApp, useView } from "./appContext.ts";
import { createAppServices } from "./appServices.ts";
import { useOutbox, useShortcuts } from "./appEffects.ts";
import AppDialogs from "./AppDialogs.tsx";
import type { AgentEngine } from "./atlas.ts";
import { defaultQuiet, reconcilePerson, seenEveryMs } from "./away.ts";
import type { Away } from "./away.ts";
import { ChatPanel, ChatsPage } from "./ChatViews.tsx";
import { browseShared, mySharedAgents } from "./community.ts";
import { calendarOffered, connections, takeConnectedReturn } from "./connections.ts";
import { isAnswering } from "./jobs.ts";
import { createTidyAsk } from "./tidying.ts";
import { account, backend } from "./account.ts";
import { ArchivePage, DomainsPage, LibraryPage, ProjectsPage } from "./DirectoryPages.tsx";
import DomainPage from "./DomainPage.tsx";
import { takeLaunchIntent } from "./launch.ts";
import type { Outboxed } from "./outbox.ts";
import { atlasId, failingRoutines, kindOf } from "./model.ts";
import { viewLabels } from "./session.ts";
import { plainOf } from "./markdown.ts";
import type { Agent } from "./model.ts";
import OverviewPage from "./OverviewPage.tsx";
import { dueDay } from "./pageGrid/due.ts";
import { byPressure } from "./pace.ts";
import { domainKey, parseTab } from "./place.ts";
import { ResourcePeek, ResourceTabs } from "./ResourceTabs.tsx";
import { skin } from "./skin.ts";
import StatusBar from "./StatusBar.tsx";
import { sessionStore } from "./storage.ts";
import { tabTitle, todayDate } from "./view.ts";
import { setReloadGuard, takeUpdated, updates } from "./update.ts";
import WorkbenchShell from "./WorkbenchShell.tsx";
import { lateByDomain } from "./workspace.ts";
import type { WorkspaceStore } from "./workspace.ts";

// Pages few sessions open, loaded when first opened rather than at startup.
const AgentsPage = lazy(() => import("./AgentsPage.tsx"));
const RoutinesPage = lazy(() => import("./RoutinesPage.tsx"));

/** The page on screen: a global view, the open project or resource (OverviewPage, ResourceTabs), or the selected domain's tab. */
const PageArea = memo(function PageArea() {
  const { actions, workbench } = useApp();
  const main = useRef<HTMLElement>(null);
  const view = useView((shown) => shown.session.view);
  const active = useView((shown) => shown.session.active);
  const domain = useView((shown) => shown.session.domain);
  const project = useView((shown) => shown.screen.projectPage);
  const note = useView((shown) => shown.screen.note);
  const areaDomain = useView((shown) => shown.areaDomain);
  const pageKey = view ?? active;
  // A new page draws at once: no transitions inside it while it lays out (skin.holdTransitions), then its scroll returns.
  // On phones it then settles up into place, never on the first page and never under reduced motion.
  const arrived = useRef(false);
  useLayoutEffect(() => {
    if (!main.current) return;
    skin.holdTransitions(main.current);
    main.current.scrollTop = workbench.getSnapshot().session.scroll[pageKey] ?? 0;
    if (arrived.current && matchMedia("(max-width: 760px)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      main.current.animate([{ opacity: 0.3, translate: "0 12px" }, { opacity: 1, translate: "0 0" }],
        { duration: parseFloat(token("--motion-settle")), easing: token("--ease-settle") });
    }
    arrived.current = true;
  }, [pageKey, workbench]);
  const page = view === "today" || project || note ? null : view === "agents" ? <AgentsPage />
    : view === "logbook" ? <ChatsPage fixed="logbook" />
    : view === "routines" ? <RoutinesPage /> : view === "chats" ? <ChatsPage /> : view === "domains" ? <DomainsPage />
    : view === "library" ? <LibraryPage /> : view === "archive" ? <ArchivePage /> : active === "projects" ? <ProjectsPage />
    : areaDomain ? <DomainPage domain={areaDomain} /> : (
      <div className="empty-state">
        <FileText size={28} />
        <h2>This item isn't here.</h2>
        <button className="secondary-button" onClick={() => actions.openTab(domainKey(domain))}>Back to {domain}</button>
      </div>
    );
  return (
    <main ref={main} id="workspace-content" className="workspace-content" role={view ? "region" : "tabpanel"}
      aria-label={view ? viewLabels[view] : undefined} tabIndex={-1}
      onScroll={(event) => skin.rememberScroll(event.currentTarget, (top) => workbench.rememberScroll(pageKey, top))}>
      <OverviewPage />
      <Suspense fallback={null}>{page}</Suspense>
      <ResourceTabs />
    </main>
  );
});

const SidePanel = memo(function SidePanel() {
  const view = useView((shown) => shown.session.view);
  return view === "chats" ? null : <ChatPanel where="side" />;
});
const Footer = memo(StatusBar);
const Peek = memo(ResourcePeek);

/** Keeps the look, read marks, the Chats page's way back and routines in step with what's on screen. */
function Upkeep() {
  const { actions, conversations, signedIn, away, ui, workbench, jobs } = useApp();
  const profileName = useView((view) => view.session.profileName);
  const profileBio = useView((view) => view.session.profileBio);
  const theme = useView((view) => view.session.theme);
  const palette = useView((view) => view.session.palette);
  const density = useView((view) => view.session.density);
  const canvas = useView((view) => view.session.canvas);
  const sidebarStyle = useView((view) => view.session.sidebarStyle);
  const railStyle = useView((view) => view.session.railStyle);
  const emblems = useView((view) => view.session.emblems);
  const followDaypart = useView((view) => view.session.followDaypart);
  const daypart = useView((view) => view.daypart);
  const domain = useView((view) => view.session.domain);
  const domains = useView((view) => view.data.domains);
  const view = useView((shown) => shown.session.view);
  const active = useView((shown) => shown.session.active);
  const libraryTopic = useView((shown) => shown.session.libraryTopic);
  const agentOpen = useView((shown) => shown.session.agentOpen);
  const threadId = useView((shown) => shown.chat.threadId);
  const thread = useView((shown) => shown.chat.thread);
  const hasContent = useView((shown) => shown.hasBackupContent);
  const firstContentAt = useView((shown) => shown.session.firstContentAt);
  useLayoutEffect(() => {
    const hue = domains.find((item) => item.name === domain)?.hue;
    skin.apply({ palette, theme, density, canvas, sidebarStyle, railStyle, emblems, followDaypart }, daypart, hue);
  }, [palette, theme, density, canvas, sidebarStyle, railStyle, emblems, followDaypart, daypart, domain, domains]);
  // Onboarding's domains and agents aren't content. Older workspaces start the same three-day grace period here.
  useEffect(() => {
    if (!signedIn && hasContent && !firstContentAt) void actions.updateSession({ firstContentAt: new Date().toISOString() });
  }, [signedIn, hasContent, firstContentAt, actions]);
  // Seeing a thread live, in the open panel or on the Chats page, marks it read.
  useEffect(() => {
    if (view === "chats" || agentOpen) conversations.markRead(threadId);
  }, [view, agentOpen, threadId, thread, conversations]);
  useEffect(() => {
    if (view !== "chats") actions.rememberReturn(view ?? active);
  }, [view, active, actions]);
  // The peek belongs to the page it was opened from.
  useEffect(() => actions.setUi({ peek: null }), [view, active, libraryTopic, actions]);
  // Routines that came due while the workspace was closed run when it opens, and again whenever you come back to it.
  useEffect(() => {
    void conversations.runRoutines(todayDate());
    const onShow = () => { if (document.visibilityState === "visible") void conversations.runRoutines(todayDate()); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [conversations]);
  // Jobs (agents-design D76): look on opening and on coming back, so a phone sees work another device asked for.
  useEffect(() => {
    if (!jobs) return;
    void jobs.refresh();
    const onShow = () => { if (document.visibilityState === "visible") void jobs.refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => document.removeEventListener("visibilitychange", onShow);
  }, [jobs]);
  // Away (agents-design D54): say the app is here, in this time zone, on opening, on coming back and every few minutes
  // in view, so the server leaves routines to it. Then settle who you are: the account's name and about win; a device
  // with words the account lacks sends them up. `synced` is what the account holds, null until that's known.
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!away) return;
    let live = true;
    const seen = () => { if (document.visibilityState === "visible") void away.seen().catch(() => undefined); };
    seen();
    void away.load().then((stored) => {
      if (!live) return;
      ui.set({ runAway: stored?.runAway ?? false, quietHours: stored?.quiet ?? defaultQuiet });
      const { profileName: name, profileBio: about } = workbench.getSnapshot().session;
      const person = reconcilePerson(stored, { name, about });
      if (person.push) void away.setPerson(person.name, person.about).catch(() => undefined);
      else if (person.name !== name || person.about !== about) void actions.updateSession({ profileName: person.name, profileBio: person.about });
      synced.current = `${person.name}\n${person.about}`;
    }, () => undefined);
    void away.pushState().then((pushState) => { if (live) ui.set({ pushState }); }, () => undefined);
    const timer = window.setInterval(seen, seenEveryMs);
    document.addEventListener("visibilitychange", seen);
    return () => { live = false; clearInterval(timer); document.removeEventListener("visibilitychange", seen); };
  }, [away, ui, workbench, actions]);
  // Edits to your name or about reach the account once you pause typing.
  useEffect(() => {
    const said = `${profileName}\n${profileBio}`;
    if (!away || synced.current === null || synced.current === said) return;
    const timer = window.setTimeout(() => {
      synced.current = said;
      void away.setPerson(profileName, profileBio).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [away, profileName, profileBio]);
  return null;
}

/** The shell: sidebar, header, tabs and the chat button, around the page, the chat panel and the status bar. */
function Screen() {
  const { actions, workbench, shell, conversations } = useApp();
  const view = useView((shown) => shown.session.view);
  const active = useView((shown) => shown.session.active);
  const tabs = useView((shown) => shown.session.tabs);
  const pinned = useView((shown) => shown.session.pinned);
  const section = useView((shown) => shown.session.section);
  const domain = useView((shown) => shown.session.domain);
  const profileName = useView((shown) => shown.session.profileName);
  const statusVisible = useView((shown) => shown.session.statusVisible);
  const sidebarCollapsed = useView((shown) => shown.session.sidebarCollapsed);
  const headerFolded = useView((shown) => shown.session.headerFolded);
  const sidebarMode = useView((shown) => shown.session.sidebarMode);
  const rosterView = useView((shown) => shown.session.roster);
  const sidebarWidth = useView((shown) => shown.session.sidebarWidth);
  const agentOpen = useView((shown) => shown.session.agentOpen);
  const agentWidth = useView((shown) => shown.session.agentWidth);
  const profilePicture = useView((shown) => shown.profilePicture);
  const domains = useView((shown) => shown.domains);
  const domainProjects = useView((shown) => shown.visible.domainProjects);
  const domainTasks = useView((shown) => shown.visible.domainTasks);
  const today = useView((shown) => shown.today);
  // The sidebar lists the domain's projects most pressing first, each with its late steps, as the Domains page does.
  const sidebarProjects = useMemo(() => byPressure(domainProjects, domainTasks, today)
    .map(({ project, behind }) => ({ id: project.id, title: project.title, color: project.color, late: behind })), [domainProjects, domainTasks, today]);
  // Late tasks per domain: a clay dot on each domain chip, and the open domain's count on the sidebar masthead.
  const dueTasks = useView((shown) => shown.visible.dueTasks);
  const late = useMemo(() => lateByDomain(dueTasks, today), [dueTasks, today]);
  const noteById = useView((shown) => shown.noteById);
  const projectById = useView((shown) => shown.projectById);
  // The sidebar's Next up: the domain's open tasks by day, late first and undated last, with words for the day.
  const nextUp = useMemo(() => {
    const open = domainTasks.filter((task) => !task.done).sort((a, b) => (a.due || "~").localeCompare(b.due || "~"));
    return { open: open.length, tasks: open.slice(0, 3).map((task) => ({ id: task.id, title: task.title,
      ...(task.due ? { ...dueDay(task.due, today), today: task.due === today } : { when: "", late: false, today: false }) })) };
  }, [domainTasks, today]);
  const toggleTask = useCallback((id: string) => {
    const task = domainTasks.find((item) => item.id === id);
    if (task) actions.toggleTask(task);
  }, [domainTasks, actions]);
  const { current, unreadTotal, roster, threadId, entries } = useView((shown) => shown.chat);
  const facesOnPage = useView((shown) => shown.facesOnPage);
  // The newest unread agent message, for the chat bubble's peek; an agent speaking in a brief on the page already said its piece.
  const peek = useMemo(() => {
    let newest: { id: string; thread: string; agent: Agent; text: string; at: string; review: boolean } | undefined;
    for (const entry of entries.values()) {
      const message = entry.latest;
      if (!entry.unread || message?.role !== "agent" || !message.text.trim()) continue;
      const agent = entry.agents.find((member) => member.id === (message.agentId ?? atlasId));
      if (!agent || facesOnPage.has(agent.id)) continue;
      const at = message.at ?? "";
      if (!newest || at > newest.at) newest = { id: message.id, thread: entry.id, agent, text: plainOf(message.text), at, review: message.proposal?.status === "pending" || message.ask?.status === "pending" };
    }
    return newest;
  }, [entries, facesOnPage]);
  // Who is replying right now, anywhere: the bubble shows they're at work while the panel is closed, also on a job
  // the agent function holds for any device (D76).
  const thinker = useSyncExternalStore(conversations.subscribe, () => Object.values(conversations.getSnapshot().thinking).find(Boolean));
  const busy = useSyncExternalStore(conversations.subscribe, () => conversations.getSnapshot().jobs.find(isAnswering)?.agentId);
  const agents = useView((shown) => shown.data.agents);
  const replying = thinker ?? agents.find((agent) => agent.id === busy);
  const now = useView((shown) => shown.now);
  const runs = useView((shown) => shown.data.runs);
  const failing = useMemo(() => failingRoutines(runs).size, [runs]);
  const tabLabel = useCallback((key: string) => tabTitle(key, noteById, projectById), [noteById, projectById]);
  const tabKind = useCallback((key: string) => {
    const tab = parseTab(key), note = tab.kind === "resource" ? noteById[tab.id] : undefined;
    return note && kindOf(note);
  }, [noteById]);
  return (
    <WorkbenchShell
      ref={shell}
      layout={{
        sidebarCollapsed, headerFolded, sidebarMode, roster: rosterView, sidebarWidth,
        // The Chats page hosts the conversation itself; the side panel steps aside without changing your preference.
        agentOpen: agentOpen && view !== "chats", agentWidth,
      }}
      onLayoutChange={actions.updateSession}
      active={view ?? active}
      tabs={tabs}
      tabsHidden={!!view}
      pinned={pinned}
      tabLabel={tabLabel}
      tabKind={tabKind}
      section={section}
      onNavigate={actions.navigate}
      onCloseTab={workbench.closeTab}
      onReorderTabs={workbench.reorderTabs}
      onTogglePin={workbench.togglePin}
      profileName={profileName}
      profilePicture={profilePicture}
      now={now}
      domains={domains}
      projects={sidebarProjects}
      late={late}
      failingRoutines={failing}
      nextUp={nextUp}
      onToggleTask={toggleTask}
      onNewProject={() => actions.newProject()}
      onEditDomain={actions.editDomain}
      currentDomain={domain}
      statusVisible={statusVisible}
      onSelectDomain={actions.switchDomain}
      chatButton={view === "chats" ? undefined : { label: current.label, agents: current.agents.filter((agent) => !facesOnPage.has(agent.id)), unread: unreadTotal, peek, replying }}
      onPeek={actions.chatWith}
      roster={roster}
      chatThread={threadId}
      onOpenChat={actions.openConversation}
      onNewAgent={() => actions.newAgent()}
      onTheme={actions.setTheme}
      onSearch={() => actions.openSearch("search")}
      onCapture={(listen) => actions.openCapture(undefined, false, listen)}
      onNeedsYou={actions.openNeedsYou}
      onFindTabs={() => actions.openSearch("tabs")}
      chat={<SidePanel />}
      footer={<Footer />}
    >
      <PageArea />
      <Peek />
    </WorkbenchShell>
  );
}

/**
 * `portrait` is a picture for the profile; without one it's drawn from the name (`profileAvatar`). `away` is the signed-in
 * account's away settings (agents-design D54); `outbox` its notes waiting for a connection (D56); `readJobs` reads its
 * jobs (D76). Signed in, Apply and Undo of a tidy go through the account's agent function (D79).
 */
export default function App({ store, engine, signedIn = false, portrait, away = null, outbox = null, readJobs }: {
  store: WorkspaceStore; engine: AgentEngine; signedIn?: boolean; portrait?: string; away?: Away | null; outbox?: Outboxed | null;
  readJobs?: (path: string) => Promise<Record<string, unknown>[]>;
}) {
  const [app] = useState(() => createAppServices({
    store, engine, sessions: sessionStore, signedIn, portrait, away, readJobs,
    tidy: signedIn && account ? createTidyAsk((body) => account!.agent(body)) : null,
    // An agent without Google Calendar access may ask for it in a chat (D83), signed in, where a connection can live.
    ...signedIn && calendarOffered && { offers: { calendar: true as const } },
    history: {
      read: () => new URL(location.href),
      write: (url, mode) => window.history[mode === "push" ? "pushState" : "replaceState"](null, "", url),
    },
  }));
  const { workbench, ui, actions, shell } = app;
  const loaded = useSyncExternalStore(app.view.subscribe, () => app.view.get() !== null);
  const loadError = useSyncExternalStore(workbench.subscribe, () => workbench.getSnapshot().loadError);

  useEffect(() => { void workbench.load(); }, [workbench]);
  // Updates (src/update.ts): a waiting version offers Reload while you're here and loads by itself when you leave,
  // unless a save is still on its way; the first start of a new version says so, with what's new.
  useEffect(() => {
    setReloadGuard(() => !workbench.hasUnsavedChanges());
    if (takeUpdated()) {
      const toast = "Atlaswork updated.";
      ui.set({ toast, toastAction: { for: toast, buttons: [{ label: "What's new", run: () => actions.openSettings("about") }] } });
    }
    let offered = false;
    return updates.subscribe(() => {
      if (updates.get().status !== "ready" || offered || document.visibilityState !== "visible") return;
      offered = true;
      const toast = "A new version of Atlaswork is ready.";
      ui.set({ toast, toastAction: { for: toast, buttons: [{ label: "Reload", run: updates.apply }] } });
    });
  }, [workbench, ui, actions]);
  // A home-screen shortcut or a share opened the app (launch.ts): run it once, when the workspace is on screen.
  useEffect(() => {
    if (!loaded) return;
    const intent = takeLaunchIntent();
    if (intent) actions.runLaunch(intent);
  }, [loaded, actions]);
  // Google Calendar (agents-design D74): what the account has connected, for the chat's Add button; coming back from
  // Google's consent page says how it went and opens Settings → Connections.
  useEffect(() => {
    if (signedIn) void connections.load();
    if (!loaded) return;
    const back = takeConnectedReturn(new URL(location.href));
    if (!back) return;
    window.history.replaceState(null, "", back.url);
    ui.set({ toast: back.toast });
    actions.openSettings("connections");
  }, [loaded, signedIn, ui, actions]);
  useOutbox(outbox, actions);
  // Edits made on another device or tab show up when you come back to this one.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void workbench.refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [workbench]);
  // Ask once to keep this browser's data through storage pressure; installed or often-used apps are usually granted.
  useEffect(() => { navigator.storage?.persist?.().then((persisted) => ui.set({ persisted }), () => ui.set({ persisted: false })); }, [ui]);
  useEffect(() => {
    if (!backend) return;
    void browseShared().then((community) => ui.set({ community }));
    if (signedIn) void mySharedAgents().then((sharedIds) => ui.set({ sharedIds }), () => undefined);
  }, [signedIn, ui]);
  useEffect(() => {
    const timer = window.setInterval(() => ui.set({ now: Date.now() }), 60_000);
    return () => clearInterval(timer);
  }, [ui]);
  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      if (reducedMotion.matches) for (const animation of document.getAnimations()) animation.cancel();
    };
    reducedMotion.addEventListener("change", onMotion);
    const onNetwork = () => ui.set({ online: navigator.onLine });
    window.addEventListener("online", onNetwork);
    window.addEventListener("offline", onNetwork);
    const onUnload = (event: BeforeUnloadEvent) => {
      if (workbench.hasUnsavedChanges()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      reducedMotion.removeEventListener("change", onMotion);
      window.removeEventListener("online", onNetwork);
      window.removeEventListener("offline", onNetwork);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [ui, workbench]);
  useShortcuts(workbench, ui, actions, shell);

  if (loadError)
    return (
      <main className="boot-state">
        <BookOpen size={32} />
        <h1>Your workspace couldn't open.</h1>
        <p>{signedIn ? "Your account" : "Browser storage"} returned: {loadError}</p>
        <p>
          {signedIn ? "Check your connection, then try again." : "Allow this site to use local storage, then try again."} No existing
          application data has been changed.
        </p>
        <button className="primary-button" onClick={() => location.reload()}>
          Try again
        </button>
      </main>
    );
  if (!loaded)
    return (
      <main className="boot-state">
        <BookOpen size={32} />
        <h1>A little room for everything.</h1>
        <p>Opening your local workspace…</p>
      </main>
    );
  return (
    <AppContext value={app}>
      <Upkeep />
      <Screen />
      <AppDialogs />
    </AppContext>
  );
}
