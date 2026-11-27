// The Session: this device's navigation (global views, each domain's tabs), layout, look, Today's cards and the
// roster's view, with the defaults a new device starts from. Workbench owns its changes (workbench.ts, tabs.ts).
import { domainKey } from "./place.ts";
import type { CrewStyle } from "./look.ts";
import { recordWidgets } from "./blocks.ts";
import type { EmblemFamily } from "./emblemFamilies.ts";

/** Global pages that live outside every domain's tab set. */
export const viewLabels = { today: "Today", library: "Library", agents: "Agents", logbook: "Logbook", routines: "Routines", chats: "Chats", domains: "Domains", archive: "Archive" } as const;
export type View = keyof typeof viewLabels;

/** Labels for global views, domain-scoped tool tabs, and popups. */
export const toolLabels: Record<string, string> = {
  today: "Today", library: "Library", agents: "Agents", logbook: "Logbook", routines: "Routines", chats: "Chats", domains: "Domains", archive: "Archive",
  projects: "Projects", tasks: "Tasks", resources: "Resources", settings: "Settings", profile: "Profile",
};
export type DomainSection = "overview" | "tasks" | "resources";

/** One domain's open tabs and remembered section. The selected domain's set lives directly in Session. */
export type TabSet = { tabs: string[]; active: string; pinned: string[]; section: DomainSection };

/** A domain's first tab set: its overview, pinned. */
export const seededTabs = (domain: string): TabSet =>
  ({ tabs: [domainKey(domain)], active: domainKey(domain), pinned: [domainKey(domain)], section: "overview" });
export type Session = TabSet & {
  /** Settings' Mode: light, dark, or following the device ("Auto"). In code and CSS (`data-theme`) this is the theme. */
  theme: "system" | "light" | "dark";
  /** Settings' Theme (src/dialogs/themes.ts): the palette, title face and corners; `data-palette` on the root. */
  palette: "garden" | "linen" | "tide" | "terracotta" | "dusk" | "frost" | "meadow" | "midnight" | "espresso" | "graphite" | "violet" | "paper";
  density: "comfortable" | "compact";
  canvas: "contours" | "linen" | "waves" | "tiles" | "blossoms" | "grid" | "daisies" | "stars" | "beans" | "terrazzo" | "doodles" | "aurora" | "plain";
  sidebarStyle: "paper" | "sage" | "sunrise" | "glass" | "ink";
  /** The chat rail's surface (agents-design D13): a drawn vine, deep-green ink, a seed tray, the open chat's colour, or plain. */
  railStyle: "vine" | "ink" | "tray" | "hue" | "plain";
  /** Settings' Emblems (src/emblemFamilies.ts): how domain and topic emoji are drawn; "theme" takes the theme's family. */
  emblems: "theme" | EmblemFamily;
  /** Settings' Crew style (look.ts `crewStyles`): the pack every portrait and Atlas are drawn in on this device. */
  crewStyle: CrewStyle;
  followDaypart: boolean;
  sidebarCollapsed: boolean;
  /** The desktop top bar folded to one slim row, its domains as bars (Carlos's pick of 2026-11-26). */
  headerFolded: boolean;
  /** Which sidebar tab shows: workspace navigation or the agent roster. */
  sidebarMode: "workspace" | "agents";
  /** How the sidebar roster filters, sorts, and what each row shows. */
  roster: RosterView;
  sidebarWidth: number;
  agentOpen: boolean;
  agentWidth: number;
  statusVisible: boolean;
  /** Per place, the brief key (D40) last shown on this device, so a line types in only the first time. */
  briefs: Record<string, { seen?: string }>;
  widgets: (typeof recordWidgets)[number][];
  /** How each of Today's widgets draws (D39); a kind left out uses its default view. */
  todayViews: Partial<Record<(typeof recordWidgets)[number], string>>;
  /** A thread you picked in the chat strip, kept only while you stay in the same place (`context`). */
  chatPick: { thread: string; context: string } | null;
  chatDraft: string;
  /** Chats open as tabs on the Chats page (D27); pinned ones lead and can't be closed. */
  chatTabs: { open: string[]; pinned: string[] };
  /** Whether the Details rail sits beside the conversation on the Chats page; older devices may still hold "history". */
  chatRail: "details" | "";
  scroll: Record<string, number>;
  filters: Record<string, string>;
  profileName: string;
  profileBio: string;
  /** Your own picture as a small WebP data URL, kept even while your initial shows; "" for none. */
  profilePhoto: string;
  /** The colour behind your initial when you chose your initial; "" shows your photo if you have one. */
  profileHue: string;
  /** A crew face you chose as your picture (a `portraits` name or "atlas"); "" for none. A colour still wins. */
  profilePortrait: string;
  /** Name of the selected domain; the records live in `WorkspaceData.domains`. */
  domain: string;
  domainTabs: Record<string, TabSet>;
  /** A global page shown instead of the selected domain's tabs; null shows the tabs. */
  view: View | null;
  /** The Topic the Library has open, "" for every topic. */
  libraryTopic: string;
  /** Whether the first-run flow was finished or skipped on this device; it shows again only over an untouched workspace. */
  onboarded: boolean;
  /** Atlas's starter guide on Today (D35): shown, or set aside for a smaller reminder on this device. */
  firstMorning: "pending" | "later";
  /** First observed content on this device (ISO), or "" until a project, resource, task, topic or user message exists. */
  firstContentAt: string;
  /** The Routines page's offer to run routines while you're away (agents-design D54), answered "Not now" on this device. */
  awayOfferDismissed: boolean;
  /** Today's own cards you turned off in Customize; the day itself always shows. */
  todayHidden: TodayCard[];
  /** The one task you starred on Today, for that day only. */
  todayFocus: { id: string; day: string } | null;
  /** Next steps you answered Not now on Today (agents-design D75), by step key, for that day only. */
  todaySkipped: { day: string; keys: string[] };
};

/**
 * Today's own cards, in page order (docs/page-design.md, "Today"); the day (its line, tray and parts) isn't one, it
 * always shows.
 */
export const todayCards = {
  crew: { label: "Your crew today", hint: "Atlas's line, next steps for your yes, and your chat" },
  rituals: { label: "Little rituals", hint: "habits from every page, ticked in the tray" },
  ahead: { label: "Coming up", hint: "the next seven days and the next date" },
  shelf: { label: "From your shelf", hint: "one kept quote a day" },
} as const;
export type TodayCard = keyof typeof todayCards;

/** Roster display choices. Atlas leads, the selected domain's crew follows; `others` keeps everyone else unfolded. */
export type RosterView = {
  others: boolean;
  sort: "attention" | "recent" | "name";
  rows: "detailed" | "compact";
  status: boolean;
  preview: boolean;
  time: boolean;
  badges: boolean;
};
export const initialRosterView: RosterView = { others: true, sort: "attention", rows: "detailed", status: true, preview: true, time: true, badges: true };
export const initialSession: Session = {
  ...seededTabs("Everyday"),
  theme: "system",
  palette: "garden",
  density: "comfortable",
  canvas: "contours",
  sidebarStyle: "paper",
  railStyle: "vine",
  emblems: "theme",
  crewStyle: "storybook",
  followDaypart: true,
  sidebarCollapsed: false,
  headerFolded: false,
  sidebarMode: "workspace",
  roster: initialRosterView,
  sidebarWidth: 236,
  agentOpen: false,
  agentWidth: 360,
  statusVisible: true,
  briefs: {},
  widgets: ["projects", "resources"],
  todayViews: {},
  chatPick: null,
  chatDraft: "",
  chatTabs: { open: [], pinned: [] },
  chatRail: "",
  scroll: {},
  filters: {},
  profileName: "",
  profileBio: "",
  profilePhoto: "",
  profileHue: "",
  profilePortrait: "",
  domain: "Everyday",
  domainTabs: {},
  view: "today",
  libraryTopic: "",
  onboarded: false,
  firstMorning: "pending",
  firstContentAt: "",
  awayOfferDismissed: false,
  todayHidden: [],
  todayFocus: null,
  todaySkipped: { day: "", keys: [] },
};
