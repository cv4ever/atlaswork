// The shell's global pages: their icons, and how the phone's More sheet groups the ones its bar doesn't hold.
import { Archive, Bot, CalendarClock, CircleCheck, CalendarDays, Layers, Library, MessagesSquare, Network, NotebookText, Settings2, Sprout, UserRound } from "lucide-react";

export const toolIcons = {
  today: CalendarDays, library: Library, agents: Bot, logbook: NotebookText, routines: CalendarClock, chats: MessagesSquare, domains: Network, archive: Archive,
  resources: Layers, projects: Sprout, tasks: CircleCheck, settings: Settings2, profile: UserRound,
};

/**
 * The phone bar's More sheet: everything the phone bar (Today, Projects, Capture, Chat) and the header's domain seeds
 * don't hold, in two groups: the places your things live, then the crew. Settings and the theme dial share its foot.
 */
export const phonePageGroups = [["Places", ["domains", "library", "archive"]], ["Crew", ["agents", "routines"]]] as const;
export type PhonePage = (typeof phonePageGroups)[number][1][number] | "settings";
export const phonePages: readonly string[] = [...phonePageGroups.flatMap(([, keys]) => keys), "settings"];
