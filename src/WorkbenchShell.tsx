// The Workbench shell: the layout around the page and the chat panel. It receives only layout preferences, navigation
// facts and actions, and rendered content, never the full Session or workspace records. Its handle reveals chat after
// a note is attached and returns to the workspace after navigation. Its parts live in src/shell/: the sidebar's
// Projects (SidebarProjects.tsx) and Agents (Roster.tsx) tabs, the header's domain rail (DomainRail.tsx), the tab strip
// (TabStrip.tsx), the phone's header, bar and sheets (PhoneNav.tsx, usePhoneChrome.ts), the splitters
// (ResizeHandle.tsx) and the chat button (ChatBubble.tsx). Styles live in WorkbenchShell.css, which defines shell
// inset, gap and corner radius together at the top; check expanded, rail and phone states. The chat morph is morph.ts.
import { useImperativeHandle, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Plus, Search, Settings2 } from "lucide-react";
import TodayCalendar from "./TodayCalendar.tsx";
import { needsYou } from "./agents.ts";
import { toolLabels } from "./session.ts";
import { formatDate } from "./dates.ts";
import type { ResourceKind } from "./model.ts";
import type { RosterView } from "./session.ts";
import { morph } from "./morph.ts";
import { domainKey, parseTab } from "./place.ts";
import { Tip } from "./Popups.tsx";
import type { WorkbenchShellHandle } from "./ui.ts";
import type { RosterEntry } from "./view.ts";
import { ChatBubble } from "./shell/ChatBubble.tsx";
import type { ChatButton } from "./shell/ChatBubble.tsx";
import { DomainRail } from "./shell/DomainRail.tsx";
import { phonePages, toolIcons } from "./shell/nav.ts";
import { OpenTabsSheet, PhoneBar, PhoneHeader } from "./shell/PhoneNav.tsx";
import { ResizeHandle } from "./shell/ResizeHandle.tsx";
import { SidebarRoster } from "./shell/Roster.tsx";
import { SidebarModes } from "./shell/SidebarModes.tsx";
import { useCanvasGlow, usePaneWidths, useTabInView } from "./shell/effects.ts";
import { NavItem, SidebarProjects } from "./shell/SidebarProjects.tsx";
import { TabStrip } from "./shell/TabStrip.tsx";
import { ThemeToggle } from "./shell/ThemeToggle.tsx";
import { usePhoneChrome } from "./shell/usePhoneChrome.ts";
import { Emblem } from "./Emblem.tsx";

type ShellLayout = {
  sidebarCollapsed: boolean;
  /** The top bar folded to one slim row: the domains as bars that stand up as chips while pointed at. */
  headerFolded: boolean;
  sidebarMode: "workspace" | "agents";
  roster: RosterView;
  sidebarWidth: number;
  agentOpen: boolean;
  agentWidth: number;
};

type Props = {
  ref?: Ref<WorkbenchShellHandle>;
  layout: ShellLayout;
  onLayoutChange: (patch: Partial<ShellLayout>) => void;
  active: string;
  tabs: string[];
  /** Global views (Today, Agents, …) replace the tab bar entirely. */
  tabsHidden: boolean;
  pinned: string[];
  tabLabel: (key: string) => string;
  /** A resource tab's kind, for its icon. */
  tabKind: (key: string) => ResourceKind | undefined;
  /** Which part of the domain page shows: "overview", "tasks", or "resources". */
  section: string;
  onNavigate: (key: string) => void;
  onCloseTab: (key: string) => void;
  onReorderTabs: (tabs: string[]) => void;
  domains: { name: string; emoji: string; hue: string }[];
  /** The selected domain's live projects, most pressing first, with their late steps. */
  projects: { id: string; title: string; color: string; late: number }[];
  /** Open tasks past their due day, per domain: a dot on each domain chip, the selected one's count on the masthead. */
  late: Record<string, number>;
  /** Routines whose last two runs failed (agents-design D69), flagged on the sidebar's Routines entry. */
  failingRoutines: number;
  /** The domain's open tasks: how many, and the next three by day (late first) with words for the day. */
  nextUp: { open: number; tasks: { id: string; title: string; when: string; late: boolean; today: boolean }[] };
  onToggleTask: (id: string) => void;
  onNewProject: () => void;
  onEditDomain: (name: string) => void;
  currentDomain: string;
  onSelectDomain: (name: string) => void;
  statusVisible: boolean;
  profileName: string;
  profilePicture: string;
  /** The minute clock: Today's date in the sidebar and the roster's times follow it. */
  now: number;
  /** Sets the theme; the dial in the header shows the painted theme and turns ahead of it. */
  onTheme: (theme: "light" | "dark") => void;
  /**
   * Who the chat opens to, and unread messages across every conversation. Absent while the page itself is the chat (Chats, a conversation).
   * `peek`: the newest unread agent message, which the bubble shows once as a speech bubble.
   */
  chatButton?: ChatButton;
  /** Opens a peeked message's conversation in the chat panel. */
  onPeek: (thread: string) => void;
  /** The sidebar's Agents tab: Atlas first, then the crew by latest message. */
  roster: RosterEntry[];
  /** The thread open in the chat panel or as the conversation page, highlighted in the roster. */
  chatThread: string;
  /** Opens a roster row's conversation as the page. */
  onOpenChat: (thread: string) => void;
  onNewAgent: () => void;
  onSearch: () => void;
  /** Opens Capture; `listen` opens it with the microphone on (a long press on the phone's Capture). */
  onCapture: (listen?: boolean) => void;
  /** Opens All chats on what waits on you (holding the phone's Chat). */
  onNeedsYou: () => void;
  /** Pins or unpins an open tab (holding it in the phone's Open tabs sheet). */
  onTogglePin: (key: string) => void;
  onFindTabs: () => void;
  children: ReactNode;
  chat: ReactNode;
  footer: ReactNode;
};

export default function WorkbenchShell({
  ref, layout, onLayoutChange, active, tabs, tabsHidden, pinned, tabLabel, tabKind, onNavigate,
  onCloseTab, onReorderTabs, onTogglePin, profileName, profilePicture, now, onTheme,
  onSearch, onCapture, onNeedsYou, onFindTabs, children, chat, footer, domains, projects, late, failingRoutines, nextUp, onToggleTask, onNewProject,
  onEditDomain, currentDomain, onSelectDomain, statusVisible, chatButton, onPeek, roster, chatThread, onOpenChat, onNewAgent,
}: Props) {
  const [mobileAgent, setMobileAgent] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  usePhoneChrome(shell, active, mobileAgent);
  const chatVisible = layout.agentOpen && mobileAgent;
  const domain = domains.find((item) => item.name === currentDomain);
  const rosterUnread = roster.reduce((sum, entry) => sum + entry.unread, 0);
  const lateTasks = late[currentDomain] ?? 0;
  const todayLong = formatDate(new Date(now), { weekday: "long", month: "long", day: "numeric" });

  useImperativeHandle(ref, () => ({
    showChat() {
      onLayoutChange({ agentOpen: true });
      if (matchMedia("(max-width: 760px)").matches) setMobileAgent(true);
    },
    toggleChat() {
      if (matchMedia("(max-width: 760px)").matches) {
        onLayoutChange({ agentOpen: true });
        setMobileAgent((value) => !value);
      } else onLayoutChange({ agentOpen: !layout.agentOpen });
    },
    showWorkspace() {
      setMobileAgent(false);
    },
  }), [onLayoutChange, layout.agentOpen]);
  usePaneWidths(layout.sidebarWidth, layout.agentWidth);
  useTabInView(shell, active);
  useCanvasGlow(glow);

  // The phone bar's ink pill slides to the selected slot (0 Today, 1 Projects, 3 Chat, 4 More; 2 is Capture; -1 none,
  // as on a domain's own page, which its seed in the header marks).
  const kind = parseTab(active).kind;
  const phonePlace = (key: "today" | "projects") => !chatVisible && (active === key || (key === "projects" && kind === "project"));
  const phoneAt = chatVisible || !chatButton ? 3 : phonePlace("today") ? 0 : phonePlace("projects") ? 1 : phonePages.includes(active) ? 4 : -1;
  return (
    <div ref={shell} className="workbench"
      data-sidebar-collapsed={layout.sidebarCollapsed} data-agent-open={layout.agentOpen} data-status={statusVisible}
      data-mobile-agent={chatVisible} data-header-folded={layout.headerFolded}>
      <a className="skip-link" href="#workspace-content">Skip to workspace</a>
      <div ref={glow} className="canvas-glow" aria-hidden="true" />
      <PhoneHeader profileName={profileName} profilePicture={profilePicture} domains={domains} currentDomain={currentDomain} active={active}
        here={!tabsHidden && !chatVisible} onNavigate={onNavigate} onSearch={onSearch} />
      <aside className="sidebar" aria-label="Main navigation">
        {/* The selected domain (picked in the top bar) titles the sidebar for both tabs on one line; it opens the domain
            page. Its projects are listed right under it, so it doesn't count them. */}
        <div className="sidebar-masthead" style={{ "--hue": domain?.hue } as CSSProperties}>
          <Tip key={currentDomain} label={`${currentDomain} overview`}><button className="sidebar-domain" aria-current={active === domainKey(currentDomain) ? "page" : undefined}
            onClick={() => onNavigate(domainKey(currentDomain))}>
            <span className="sidebar-domain-emblem" aria-hidden="true"><Emblem emoji={domain?.emoji} /></span>
            <span className="sidebar-domain-text"><strong>{currentDomain}</strong></span>
          </button></Tip>
          {/* The late count sits on the emblem's corner as a clay badge, so the name keeps the line; it links to the
              domain's Tasks, where late tasks lead. */}
          {lateTasks > 0 && <Tip label={`${lateTasks} late: open ${currentDomain}'s tasks`}><button className="sidebar-late" key={lateTasks}
            aria-label={`${lateTasks} late, open ${currentDomain}'s tasks`} onClick={() => onNavigate("tasks")}>
            {lateTasks}</button></Tip>}
          <button className="icon-button sidebar-collapse"
            aria-label={layout.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => onLayoutChange({ sidebarCollapsed: !layout.sidebarCollapsed })}>
            {layout.sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <SidebarModes mode={layout.sidebarMode} unread={rosterUnread} onMode={(sidebarMode) => onLayoutChange({ sidebarMode })} />
        {layout.sidebarMode === "workspace"
          ? <SidebarProjects projects={projects} nextUp={nextUp} active={active} onNavigate={onNavigate} onNewProject={onNewProject}
            onToggleTask={onToggleTask} />
          : <SidebarRoster roster={roster} view={layout.roster} onView={(patch) => onLayoutChange({ roster: { ...layout.roster, ...patch } })} now={now}
            domain={{ name: currentDomain, emoji: domain?.emoji }} isOpen={(thread) => (layout.agentOpen || active === "conversation") && chatThread === thread}
            onOpenChat={onOpenChat} onEditDomain={onEditDomain} onNewAgent={onNewAgent} />}
        <div className="sidebar-bottom">
          {/* What lives outside the domain, side by side on one row: Library and Archive, or on the Agents tab the
              Agents page (everyone, and teams) and the agents' Routines, always in view rather than in a popover. */}
          <div className="sidebar-places">
            {(layout.sidebarMode === "agents" ? ["agents", "routines"] as const : ["library", "archive"] as const).map((key) =>
              <NavItem key={key} id={key} title={key === "agents" ? "Agents and teams" : toolLabels[key]} short={key === "agents" ? "Agents" : undefined}
                Icon={toolIcons[key]} active={active} onNavigate={onNavigate}
                flag={key === "routines" && failingRoutines ? `${failingRoutines} failing` : ""} />)}
          </div>
          {/* You, at the foot as in most workspace apps: your picture opens your profile, the gear Settings. */}
          <div className="sidebar-me">
            <Tip label="Profile"><button className={`profile ${active === "profile" ? "selected" : ""}`} aria-label="Profile"
              aria-current={active === "profile" ? "page" : undefined} onClick={() => onNavigate("profile")}>
              <img src={profilePicture} alt="" /><div><strong>{profileName || "You"}</strong></div>
            </button></Tip>
            <Tip label="Settings"><button className={`icon-button sidebar-settings ${active === "settings" ? "selected" : ""}`} aria-label="Settings"
              aria-current={active === "settings" ? "page" : undefined} onClick={() => onNavigate("settings")}>
              <Settings2 size={18} />
            </button></Tip>
          </div>
        </div>
      </aside>
      {!layout.sidebarCollapsed && <ResizeHandle kind="sidebar" value={layout.sidebarWidth}
        onCommit={(sidebarWidth) => onLayoutChange({ sidebarWidth })} />}
      <section className="workspace-center" aria-label="Workspace">
        {/* Folded, the bar is one slim row: Today a date pill, the domains bars, Search and Capture icons; the theme
            dial leaves it, as the status bar has one. Its last button folds and unfolds it. */}
        <header className="app-header" data-folded={layout.headerFolded}>
          {/* Today leads the domain bar: the day above every domain. The calendar's navigation label is its tooltip. */}
          <Tip label="Open Today"><button className="today-button" aria-current={active === "today" ? "page" : undefined}
            aria-label={`Open Today, ${todayLong}`} onClick={() => onNavigate("today")}>
            <TodayCalendar date={new Date(now)} />
          </button></Tip>
          <DomainRail domains={domains} late={late} currentDomain={currentDomain} active={active} onSelectDomain={onSelectDomain}
            onEditDomain={onEditDomain} onNavigate={onNavigate} />
          <div className="header-actions">
            <button className="header-search" aria-label="Search" aria-keyshortcuts="Control+K" onClick={onSearch}>
              <Search size={18} /></button>
            <Tip label="Capture a link, file, thought or voice note (C)"><button className="primary-button create-button" aria-label="Capture"
              onClick={() => onCapture()} aria-keyshortcuts="C"><Plus size={18} /><span>Capture</span></button></Tip>
          </div>
          <ThemeToggle onTheme={onTheme} />
          <Tip label={layout.headerFolded ? "Unfold the top bar" : "Fold the top bar"}><button className="icon-button header-fold"
            aria-label={layout.headerFolded ? "Unfold the top bar" : "Fold the top bar"} aria-expanded={!layout.headerFolded}
            onClick={() => onLayoutChange({ headerFolded: !layout.headerFolded })}>
            {layout.headerFolded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}</button></Tip>
        </header>
        <div className="workspace-page-panel">
        {/* The strip appears once a second tab opens: one tab alone is the page you're on, which its heading names. */}
        {!tabsHidden && tabs.length > 1 && <TabStrip tabs={tabs} active={active} pinned={pinned} currentDomain={currentDomain}
          tabLabel={tabLabel} tabKind={tabKind}
          onNavigate={onNavigate} onCloseTab={onCloseTab} onReorderTabs={onReorderTabs} onFindTabs={onFindTabs} />}
        {children}
        </div>
        {!layout.agentOpen && chatButton && <ChatBubble chat={chatButton} onOpen={() => morph(() => onLayoutChange({ agentOpen: true }))} onPeek={onPeek} />}
      </section>
      {layout.agentOpen && <ResizeHandle kind="agent" value={layout.agentWidth}
        onCommit={(agentWidth) => onLayoutChange({ agentWidth })} />}
      {chat}
      {footer}
      <PhoneBar at={phoneAt} active={active} here={{ today: phonePlace("today"), projects: phonePlace("projects") }}
        needs={chatVisible ? 0 : roster.filter((entry) => needsYou(entry.presence)).length} unread={chatVisible ? 0 : chatButton?.unread ?? 0}
        onNavigate={onNavigate} onCapture={onCapture} onNeedsYou={onNeedsYou} onTheme={onTheme}
        onChat={() => { if (chatButton) morph(() => { onLayoutChange({ agentOpen: true }); setMobileAgent(!chatVisible); }); }} />
      <OpenTabsSheet tabs={tabs} active={active} pinned={pinned} tabLabel={tabLabel} tabKind={tabKind} onNavigate={onNavigate}
        onTogglePin={onTogglePin} onCloseTab={onCloseTab} />
    </div>
  );
}
