// Record and Session types, session defaults, daypart boundaries and chat day grouping (model.test.ts).
import type { Effort } from "../supabase/functions/agent/responses.ts";
import type { FileMove } from "../supabase/functions/agent/tidy.ts";
import type { WarningKind } from "../supabase/functions/agent/warnings.ts";
import type { Block } from "./blocks.ts";
import type { ChatModel } from "./chatModel.ts";

/** A specific outcome, always rooted in one domain (`area` is the domain name). */
export type Project = {
  id: string;
  title: string;
  area: string;
  description: string;
  color: string;
  archived?: boolean;
  /** Routines that look after this project, run by its nearest owner. */
  routines?: Routine[];
  /** The agent assigned to it, if any. It answers first in the project's room. */
  agentId?: string;
  /** A team working on it, if any. Its members answer after the assigned agent (see `crewOf`). */
  teamId?: string;
  /** Its page, top to bottom. Absent means `defaultPages.project`. */
  widgets?: Block[];
  /** When it was made (ISO). Projects from before the welcome brief (D40) have none, so they never get one. */
  createdAt?: string;
  /** The starter template it was built from (`StarterProject.title`), for its welcome tip. */
  starter?: string;
  /**
   * A folder linked to it on one of the account's computers (agents-design D77), so every device knows it: the
   * computer's own id for it, which computer, the name its paths start with and where it is there. Never its files.
   */
  folder?: ComputerFolder;
};

/** A folder on one of the account's computers: only that computer's desktop app knows how to open it (by `id`). */
export type ComputerFolder = { id: string; computer: { id: string; name: string }; name: string; path: string };

/**
 * A resource: a note, link, file, image, video, or quote. It has one home: a domain (`projectId` ""), one of its
 * projects, or a topic (`topicId`, with `domain` and `projectId` ""). It can also be linked into other projects.
 * `body` holds your own words about it on every kind.
 */
export type Note = {
  id: string;
  domain: string;
  projectId: string;
  title: string;
  body: string;
  updatedAt: string;
  /** Absent means "note". */
  kind?: ResourceKind;
  /** Links and videos; images may point at one instead of a file. */
  url?: string;
  /** Files, images, and videos you dropped in, kept as they are. */
  file?: File;
  /** Where a quote came from. */
  source?: string;
  topicId?: string;
  /** Projects it's linked into besides its home. */
  linkedProjectIds?: string[];
  archived?: boolean;
  /** Captured away from the desk (shared to the app or spoken) and not sorted yet: its domain's brief offers Sort (D53). */
  unsorted?: boolean;
};
export const resourceKinds = ["note", "link", "file", "image", "video", "quote"] as const;
export type ResourceKind = (typeof resourceKinds)[number];
export const kindOf = (note: Note): ResourceKind => note.kind ?? "note";
export const kindLabels: Record<ResourceKind, string> = { note: "Note", link: "Link", file: "File", image: "Image", video: "Video", quote: "Quote" };

/** A resource's title, or "Untitled link" and the like when it has none. */
export const noteTitle = (note: Note) => note.title || `Untitled ${kindLabels[kindOf(note)].toLowerCase()}`;

/** PARA's Resources bucket: a subject you keep material on, outside any domain or project; with `person`, someone in your life (D71). */
export type Topic = { id: string; name: string; emoji: string; description: string; archived?: boolean; person?: Person };
/**
 * What makes a topic a person (agents-design D71): who they are to you, the domain whose agents read about them ("" for
 * Atlas alone), the colour behind their initial, a small photo (a WebP data URL) and the dates that come round each year.
 */
export type Person = { relation: string; domain: string; hue: string; photo?: string; dates: PersonDate[] };
/** A date about a person: `date` is YYYY-MM-DD, or --MM-DD when the year isn't known. It comes round every year. */
export type PersonDate = { id: string; label: string; date: string };
export type Task = {
  id: string;
  domain: string;
  projectId: string;
  title: string;
  done: boolean;
  due: string;
  /**
   * Where in its due day it sits (agents-design D75): a time ("16:30") or a part of the day ("morning", "afternoon",
   * "evening"); absent, it's anytime that day. Today reads it only on the day the task is due.
   */
  at?: string;
  /** How long it takes in minutes (D75); absent, half an hour. Today keeps that stretch free of suggestions. */
  length?: number;
  createdBy?: string;
  /** The agent that added it, shown as a small portrait on the task. */
  agentId?: string;
  /** When it was last added or edited (ISO). Tasks from before this have none. */
  updatedAt?: string;
};
export type WorkspaceData = {
  /** Ordered: the first domain is the default. */
  domains: Domain[];
  projects: Project[];
  notes: Note[];
  tasks: Task[];
  topics: Topic[];
  /** Atlas first; he can't be archived or deleted. */
  agents: Agent[];
  teams: Team[];
  threads: Thread[];
  /** Each routine's last due time (ISO) that ran, on any device, so a missed stretch runs once, not once per miss. */
  routineRuns: Record<string, string>;
  /** Per place (project id or domain key): the brief you dismissed and whether its welcome is done (D40), on every device. */
  briefs: Record<string, BriefMark>;
  /** What every agent shares (agents-design D46); absent until first set. */
  everyAgent?: EveryAgent;
  /** What agents remember from what you said (D49), about places and about you. */
  memories: Memory[];
  /** How each routine's last runs went (agents-design D68), up to `keptRuns` per routine, newest last. */
  runs: RoutineResult[];
};

/**
 * One routine run's outcome (agents-design D68): it posted something, its runner had nothing new, it ended before asking
 * because nothing changed since the last run (D67), or it failed (`reason`). `due` is the time it ran for (ISO), `at`
 * when it finished. The id is `<routineId>@<due>`, so two devices recording the same run write one record. `replies`
 * counts the model calls it made (each one of the day's live replies) and `tokens` what they read and wrote (D69).
 */
export type RoutineResult = { id: string; routineId: string; due: string; at: string; outcome: "posted" | "quiet" | "no-news" | "failed"; reason?: string;
  replies?: number; tokens?: number };

/** Routines whose last two runs both failed (agents-design D69): what the sidebar and the runner's presence flag. `runs` in due order. */
export function failingRoutines(runs: RoutineResult[]): Set<string> {
  const last = new Map<string, RoutineResult[]>();
  for (const run of runs) last.set(run.routineId, [...last.get(run.routineId) ?? [], run].slice(-2));
  return new Set([...last].filter(([, two]) => two.length === 2 && two.every((run) => run.outcome === "failed")).map(([id]) => id));
}

/**
 * Something an agent learned from what you said (agents-design D49): about a place, a domain (`projectId` "") or one
 * of its projects, or about you (`domain` ""), or about a person (`topicId`, D71, with `domain` ""). Whoever looks
 * after the place reads it; every agent reads yours; a person's go to whoever looks after their domain.
 * `quote` is the words of yours it came from, `agentId` who remembered it, `at` when (ISO). One learned from a search
 * on one of the account's computers (agents-design D80) says where something is on it, names that `computer` and has
 * no quote: you kept it rather than said it.
 */
export type Memory = { id: string; domain: string; projectId: string; text: string; quote: string; agentId: string; at: string; topicId?: string;
  computer?: { id: string; name: string } };

/** A memory a reply saved, and the one it replaced, so Undo can put that back; `undone` once you took it back. */
export type Remembered = { memory: Memory; replaced?: Memory; undone?: boolean };

/**
 * Where something is on a computer, as a reply that searched it offered to remember (agents-design D80): `offered`
 * until you keep it or say not this, and no agent reads it before; kept, it's a Memory (replacing `replaced`) with Undo.
 * `gone` once its computer was removed, which forgets it and leaves only the computer's name (`remove_computer`).
 */
export type Learned = { memory: Memory; state: "offered" | "kept" | "declined" | "undone" | "gone"; replaced?: Memory };

/**
 * Settings → Every agent (D46): house rules every agent reads before its own, the personality an agent without its
 * own follows, and the tool switches a new agent starts with (differences from `toolDefault`, like `Agent.tools`).
 */
export type EveryAgent = { rules: string; warmth?: number; detail?: number; tools?: Partial<Record<ToolId, boolean>> };

/** An agent's warmth and detail: its own, else every agent's, else Even and Balanced. */
export const toneOf = (agent: Pick<Agent, "warmth" | "detail">, every?: EveryAgent) =>
  ({ warmth: agent.warmth ?? every?.warmth ?? 2, detail: agent.detail ?? every?.detail ?? 2 });

/** What you did about a place's brief: the key you said Not now to, and Got it (or its action) on its welcome. */
export type BriefMark = { dismissed?: string; welcomed?: boolean };

/** The command and permissions behind bound targets, retained so Apply can recheck current access without retargeting. */
export type CommandOrigin = {
  agentId: string;
  command: string;
  needs: Need[];
  attachedNoteId?: string;
  /** Calendar handoffs retain the identities used to make the file. */
  taskIds?: string[];
};
export type Proposal = {
  id: string;
  projectId: string;
  noteId: string;
  sourceTitle: string;
  sourceBody: string;
  items: Task[];
  /** Notes a sorted capture files (agents-design D53), each in its own home; Undo takes them back while untouched. */
  notes?: Note[];
  /**
   * Projects the proposal makes (agents-design D61), each in a domain the agent looks after; its tasks, notes and moves
   * may land in them. Apply makes them first; Undo removes them while untouched and holding nothing else.
   */
  projects?: Project[];
  /** Domains Atlas suggests planting while sorting a capture (D61). Never applied: each opens the domain dialog filled in. */
  domains?: Pick<Domain, "name" | "emoji" | "intention">[];
  /**
   * A domain Atlas plants with the project he proposes (D61), with its keeper (D51): `agent` when that keeper joins the
   * crew with it, `keeper` how the card names them. Apply hires and plants before making the project; Undo takes them
   * back with it while nothing else landed. Always waits for your OK, since someone joins.
   */
  plant?: { domain: Domain; agent?: Agent; keeper: Pick<Agent, "name" | "portrait"> };
  /**
   * A suggested agent (D41) who joins the crew to lead the project the proposal makes (D61): Forge for an app. The
   * project's `agentId` names them. Apply hires them before making the project; Undo lets them go with it while they
   * have no other place and haven't talked. Always waits for your OK, since someone joins.
   */
  lead?: Agent;
  status: "pending" | "applied" | "rejected" | "undone";
  /** A review's edits to existing tasks and projects; `items` stays empty then. */
  changes?: ReviewChange[];
  /** Missing only on older stored proposals; they need a fresh proposal before Apply, but keep Undo and history. */
  origin?: CommandOrigin;
  /** An agent Atlas drafted (agents-design D57); `items` stays empty. Review opens the agent dialog filled in, and Save there applies it. */
  agent?: AgentProposal;
  /** Rejected because a newer draft in the same chat took its place (D57). */
  replaced?: true;
  /**
   * Files to tidy on one of the account's computers (agents-design D79), the one the reply searched; `items` stays
   * empty. Each move came from a search in that reply. Applying asks that computer to make the moves, as a job; `done`
   * is what it did, one per move. Undo asks it to put them back (`undoing` until it has), and `undone` is what came
   * back. `failed` is why the computer couldn't run the last ask at all, and `asked` when you last asked (ISO), so a
   * card still waiting a day later, past its job's life, offers Try again.
   */
  files?: {
    computer: { id: string; name: string };
    moves: FileMove[];
    done?: FileResult[];
    undoing?: true;
    undone?: FileResult[];
    failed?: string;
    asked?: string;
  };
};

/** One file a computer moved (or put back, D79), by its path as found, or why it stayed where it was. */
export type FileResult = { file: string; failed?: string };

/**
 * An agent Atlas drafts from your goal (agents-design D57): a change to one already in the crew (`agentId`), one of
 * the suggested agents (`from`), or a new one. Only the fields Atlas set are here; the rest come from the crew agent,
 * the suggestion or a new agent's defaults when the dialog opens.
 */
export type AgentProposal = {
  agentId?: string;
  from?: string;
  name?: string;
  portrait?: string;
  role?: string;
  instructions?: string;
  writeMode?: Agent["writeMode"];
  warmth?: number;
  detail?: number;
  /** Tools switched from what every agent starts with. */
  tools?: Partial<Record<ToolId, boolean>>;
  /** Why it needs more than every agent starts with: tools that start off, or Proactive. */
  why?: string;
  /** The live domain it looks after, or the one `newDomain` plants with it. */
  domain?: string;
  newDomain?: Pick<Domain, "name" | "emoji" | "intention">;
  /** How often it checks in; absent for a crew agent, whose routines stay. */
  checkIn?: "weekly" | "daily";
  /** A crew agent's routines as it suggests them, all of them (its own changes, agents-design D69); absent keeps theirs. */
  routines?: Routine[];
  /** Agents quiet for 30 days or more, which Atlas offers to archive beside the draft (by id). */
  quiet?: string[];
  /** A request in your words that tests the line the agent never crosses: Try it in the dialog runs it before Save. */
  test?: string;
};

/** One edit a review or an agent suggests, with what it was before so it can be undone. */
export type ReviewChange =
  /**
   * A task's new day. `at` also puts it at a time that day, with `fromAt` the time it had and `why` the agent's reason
   * in its own words (`plan_day`, agents-design D75); Today shows each such change as a next step.
   */
  | { kind: "reschedule"; taskId: string; title: string; from: string; to: string; at?: string; fromAt?: string; why?: string }
  | { kind: "complete"; taskId: string; title: string }
  | { kind: "archive"; projectId: string; title: string; quietDays: number }
  /** A page's blocks (`place`: `area:Name` or a project id); `from` null means it followed its default. */
  | { kind: "page"; place: string; title: string; from: Block[] | null; to: Block[] }
  /** An open task moved to another place (D61). */
  | { kind: "move"; taskId: string; title: string; from: { domain: string; projectId: string }; to: { domain: string; projectId: string } }
  /** A whole project, with everything in it, moved to another domain (D61). */
  | { kind: "rehome"; projectId: string; title: string; from: string; to: string };

/** What a routine does when it runs, and the tools its runner needs. */
export const routineKinds = {
  "check-in": { label: "Check-in", does: "Turns new things in your notes into tasks.", needs: ["read-notes", "add-tasks"] },
  report: { label: "Status report", does: "Says what's open, and where to start.", needs: ["see-tasks"] },
  review: { label: "Review", does: "Moves overdue tasks to today, ticks off what your notes mark done, files loose tasks into their projects, and archives quiet projects.", needs: ["see-tasks"] },
  improve: { label: "Weekly improvement", does: "Looks back at the week and suggests up to three changes, each with why. Nothing changes until you pick one.", needs: ["see-tasks"] },
} as const satisfies Record<string, { label: string; does: string; needs: readonly ToolId[] }>;
export type RoutineKind = keyof typeof routineKinds;

/**
 * How often a routine comes round. Weekly covers every day (all seven) and weekdays; `weeks` repeats every N weeks.
 * Monthly falls on a date (`day`, -1 the last; short months use their last day) or an nth weekday (`week` 1–4, -1 the last).
 */
export type Repeat =
  | { every: "week"; days: number[]; weeks: number }
  | { every: "month"; day: number }
  | { every: "month"; week: number; weekday: number };

/** Something an agent does on its own on a schedule. It runs once its time has passed, the next time the app is open. */
export type Routine = {
  id: string;
  kind: RoutineKind;
  /** Local HH:MM. */
  time: string;
  repeat: Repeat;
  /** When it was set up (ISO); earlier times never run. Empty for routines that always were. */
  since: string;
  /** Reviews archive projects with nothing new for this many days; absent means 60. */
  quietDays?: number;
  paused?: boolean;
};

/**
 * A question one agent asks another for you (agents-design D50). `to` is the asked agent's id. It waits for your OK
 * (`pending`) unless you always let this pair talk (`Agent.mayAsk`); `sent` once the question went, `declined` if you said no.
 * `then` is what the asker does with the answer when its own places are needed too: it follows up once after the answer.
 */
export type Ask = { id: string; to: string; question: string; then?: string; status: "pending" | "sent" | "declined"; origin: CommandOrigin };

/**
 * What an agent shows in a reply beyond words (agents-design D64): answers you tap (`picked` is the one you tapped),
 * and widgets (by their page's Home key and block id) or open tasks from its places, drawn live from your records so
 * you can log, tick or finish them in the chat. The agent only points at them; it never writes their numbers.
 * `calendar` is the Google Calendar rung the agent asked you for (D83), which the card under the reply grants.
 */
export type Display = { choices?: string[]; picked?: string; blocks?: { place: string; id: string }[]; taskIds?: string[]; calendar?: CalendarLevel };
export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  text: string;
  proposal?: Proposal;
  /** Who spoke, for agent messages. Messages from before agents default to Atlas. */
  agentId?: string;
  /** The user message this reply answered. Older replies resolve the nearest preceding user message. */
  replyTo?: string;
  /** Where the person was when they wrote it: a domain or project title. */
  from?: string;
  /**
   * Your message only: the agents it asked who haven't answered it yet (D28). Set when it's sent, and each reply
   * takes its agent off, so whoever is left after a failed reply or a reload shows as "didn't answer".
   */
  awaiting?: string[];
  /** Your message only: why the last reply to it failed, as the engine said it, until every agent it asked has answered (D28). */
  failure?: string;
  /**
   * Your message only: when you last handed it off (agents-design D73; ISO). The agent function works on it in the
   * background and lands the answer, or why it failed, in the account's workspace; the page doesn't wait for it.
   */
  background?: string;
  /** Set when a routine posted it rather than a reply: which one, and the time it was due (ISO). */
  routine?: { id: string; kind: RoutineKind; due: string; request?: string };
  /** Things the agent prepared for you to open: a search, an email draft, a calendar file. */
  links?: MessageLink[];
  /** Answers to tap and live widgets or tasks the agent put in its reply (agents-design D64). */
  display?: Display;
  /** A question this agent wants to ask another agent for you (D50). */
  ask?: Ask;
  /** The Ask this message answers: the asked agent speaking in the asker's chat (D50). */
  answers?: string;
  /** The Ask whose answer this follows up: the asker finishing the job with its own places (D50). */
  followsUp?: string;
  /** What the agent remembered from your message (agents-design D49), each with Undo. */
  remembered?: Remembered[];
  /** Where things are on a computer that the reply offered to remember (D80), each with Keep and Not this. */
  learned?: Learned[];
  /** When it was said (ISO). Messages from before timestamps have none. */
  at?: string;
  /** Tokens the model read and wrote for this reply, as the provider reported them (D28). */
  usage?: Usage;
  /** What the reply looked at to answer, in the order it did (agents-design D81): its sources line above the words. */
  used?: ToolUse[];
  /**
   * Scams code found in what the reply read or wrote (agents-design D79), by kind: the chat shows each one's fixed words
   * above the reply, which the agent can't change.
   */
  warnings?: WarningKind[];
};

/**
 * Tokens a reply read (`input`, summed over its model calls: instructions, notes, tasks, history, tool results) and
 * wrote; `peak` is its largest single call, how full the model's context window got. `model` is the one that answered
 * and the catalogue it's from (`Agent.model`'s shape; "atlaswork" for ours), which prices it (agents-design D45).
 * `effort` is the Thinking it was asked for (D82): null for the account's setting, absent on replies from before.
 */
export type Usage = { input: number; output: number; peak?: number; model?: { source: string; id: string }; effort?: Effort | null };

/**
 * One read a reply made (agents-design D81): the tool (`read_calendar`, `search_files`…) and what it was about, as the
 * agent function reported it: the words searched, the file or image opened, a day (YYYY-MM-DD) or days
 * (`2026-11-24/2026-11-30`). `failed` when an outside account couldn't be read: its grant was revoked
 * (`disconnected`, so the chat offers Reconnect) or it didn't answer (`unanswered`). `on` names the account's
 * computers it read on (D84): the one a file was read on, or those a search found in.
 */
export type ToolUse = { tool: string; about?: string; failed?: "disconnected" | "unanswered"; on?: string[] };

/** Whether `value` is a ToolUse a page may keep: short plain strings, so a stray stream can't bloat the chat. */
export const isToolUse = (value: unknown): value is ToolUse => !!value && typeof value === "object"
  && "tool" in value && typeof value.tool === "string" && /^[a-z_]{1,40}$/.test(value.tool)
  && (!("about" in value) || typeof value.about === "string" && value.about.length <= 120)
  && (!("failed" in value) || value.failed === "disconnected" || value.failed === "unanswered")
  && (!("on" in value) || Array.isArray(value.on) && value.on.length <= 10 && value.on.every((name) => typeof name === "string" && name !== "" && name.length <= 80));

/**
 * `download` names the file for data: links. A calendar file also carries its `events` (D74), so a connected Google
 * Calendar can take them in one tap; each event's `key` (the task's id) keeps a second tap from adding it twice.
 */
export type MessageLink = { label: string; href: string; download?: string; events?: { key: string; title: string; date: string }[] };

/** A PARA area: an ongoing part of life. Projects reference it by `name` through `Project.area`. `widgets` absent means `defaultPages.domain`. */
export type Domain = {
  name: string; emoji: string; hue: string; intention: string; archived?: boolean; agentId?: string; routines?: Routine[]; widgets?: Block[];
};

/**
 * Someone you can talk to. What it can see comes from where it's assigned (see `scopeOf`), never from a field here.
 * `portrait` names a file in /public/agents, or "atlas".
 */
export type Agent = {
  id: string;
  name: string;
  portrait: string;
  role: string;
  instructions: string;
  /** "full" is proactive: it changes things itself, with undo. "propose" asks permission first. */
  writeMode: "full" | "propose";
  /** 0 crisp … 4 warm; absent follows every agent's (`toneOf`). */
  warmth?: number;
  /** 0 one line … 3 thorough; absent follows every agent's (`toneOf`). */
  detail?: number;
  /** Tools switched away from their default; see `canUse`. */
  tools?: Partial<Record<ToolId, boolean>>;
  /** Agents they may ask without your OK each time (agents-design D50): ids you added with "Always let … ask …". */
  mayAsk?: string[];
  /** What they do on their own, where they look. */
  routines?: Routine[];
  /**
   * The model they answer on instead of the provider's default (agents-design D44). It applies only while Settings →
   * AI model uses the provider it came from (`source`); otherwise they answer on that provider's default.
   */
  model?: { source: string; id: string };
  /** How hard their model thinks instead of the account's setting (D44), on providers that take it. */
  effort?: Effort;
  archived?: boolean;
  /** Where they worked when archived, so restoring can put them back. */
  restore?: Places;
  /** What they may do with each connection (agents-design D83), set in Settings → Connections; see `calendarAccess`. */
  access?: { calendar?: CalendarAccess };
};

/**
 * What an agent can use. Workspace tools start on, except those marked `off`; outside tools start off. Outside tools
 * prepare something you open or tap yourself (a search link, a mail draft): nothing leaves on its own. Connections
 * such as Google Calendar aren't tools: each agent's access to them is `Agent.access` (agents-design D83).
 */
export const agentTools = {
  "read-notes": { label: "Read notes", does: "read notes", hint: "Notes in the places they look. Off: only notes you attach.", outside: false },
  "see-tasks": { label: "See tasks", does: "see tasks", hint: "Open tasks where they look, so they can say what's next and review them.", outside: false },
  "read-files": { label: "Read files", does: "read files", hint: "Files in folders linked to projects where they look, and on a computer whose search you turned on. Never changes them.", outside: false },
  "tidy-files": { label: "Tidy files", does: "tidy files", hint: "Moves and renames files into folders in Documents, on a computer where you let agents tidy. Proactive: up to 10 at a time, with Undo. Starts off.", outside: false, off: true },
  "add-tasks": { label: "Add tasks", does: "add tasks", hint: "Suggests new tasks, 3 at a time. With See tasks, also ticks off and moves them.", outside: false },
  "arrange-pages": { label: "Arrange pages", does: "arrange pages", hint: "Suggests what a domain or project page shows. Starts off.", outside: false, off: true },
  remember: { label: "Remember", does: "remember things", hint: "Keeps lasting things you tell them, with Undo. Off: they still read what's remembered where they look.", outside: false },
  "ask-agents": { label: "Ask other agents", does: "ask other agents", hint: "Asks another agent when the answer is in their places. Nothing is sent until you approve, unless you always let them.", outside: false },
  web: { label: "Web search", does: "search the web", hint: "Answers “search for…” with a search link. Doesn't browse by itself.", outside: true },
  email: { label: "Email drafts", does: "draft emails", hint: "Writes a draft that opens in your mail app. Never sends.", outside: true },
} as const;
export type ToolId = keyof typeof agentTools;
/** What a command or a stored proposal needs: a tool, or "calendar" for handing over calendar events (`calendarAccess` at Events + Add). */
export type Need = ToolId | "calendar";

/** Whether a tool is on for an agent that never switched it. */
export const toolDefault = (tool: ToolId) => !(agentTools[tool].outside || "off" in agentTools[tool]);

/**
 * Google Calendar's rungs, each including the one before (agents-design D83): free and busy times only (`free_time`),
 * events with their titles (`read_calendar`), and handing over dated tasks with an Add to Google Calendar button.
 */
export const calendarLevels = ["off", "free", "events", "add"] as const;
export type CalendarLevel = (typeof calendarLevels)[number];
/**
 * One agent's access to Google Calendar. `away`: also in its routines and work you hand off (D54, D73), not only replies
 * while you're here. `calendars`: the calendar ids it reads; absent, every calendar you show in Google Calendar.
 */
export type CalendarAccess = { level: CalendarLevel; away: boolean; calendars?: string[] };
/** Atlas starts with all of it, as he had before connections had access (D4); everyone else starts off. */
export const calendarAccess = (agent: Pick<Agent, "id" | "access">): CalendarAccess =>
  agent.access?.calendar ?? (agent.id === atlasId ? { level: "add", away: true } : { level: "off", away: false });

/**
 * Atlas can always use every tool (D4), so a person with only Atlas has every ability; others follow their switches.
 * Connections follow each agent's access, Atlas's included (D83).
 */
export const canUse = (agent: Pick<Agent, "id" | "tools" | "access">, need: Need) => need === "calendar" ? calendarAccess(agent).level === "add"
  : agent.id === atlasId || (agent.tools?.[need] ?? toolDefault(need));

/** Where an agent works: the domains it looks after, the projects it's assigned to, and the teams it's on. */
export type Places = { domains: string[]; projectIds: string[]; teamIds: string[] };

/** A reusable group of agents. The first member leads; a team can work on many projects and has its own room. */
export type Team = {
  id: string;
  name: string;
  purpose: string;
  memberIds: string[];
};

/**
 * One conversation: `agent:<id>` with one agent, `room:<projectId>` with a project's crew, `team:<id>` with a team,
 * or `chat:<id>`, a room you started with agents you picked (`title`, `memberIds`).
 */
export type Thread = {
  id: string;
  messages: ChatMessage[];
  /** How many messages you've seen; later agent messages count as unread. */
  read: number;
  attachedNoteId: string | null;
  title?: string;
  memberIds?: string[];
  /** Message indexes where you started a new session (D28); a session also starts on each new local day. */
  sessionStarts?: number[];
  /** The model and thinking each agent answers on in this chat, chosen in the message box (agents-design D82, `chatModel.ts`). */
  models?: Record<string, ChatModel>;
};

/**
 * Caches what `build` derives from a workspace list, once per list. Edits never change a list in place, they replace it
 * (`swap` in workspace.ts), so a list's identity is its version and the result stays right until the list is replaced.
 * For lookups that would otherwise scan every record on every redraw (docs/adr/0002).
 */
export function perList<T, R>(build: (list: readonly T[]) => R): (list: readonly T[]) => R {
  const cache = new WeakMap<readonly T[], R>();
  return (list) => {
    if (!cache.has(list)) cache.set(list, build(list));
    return cache.get(list)!;
  };
}
const ids = perList((list: readonly { id: string }[]) => {
  const map = new Map<string, { id: string }>();
  for (const item of list) if (!map.has(item.id)) map.set(item.id, item);
  return map;
});

/** A list's records by id, the first one for a repeated id as `find` gives (`perList`). */
// The index holds the list's own records, so they are the list's element type.
export const byId = <T extends { id: string }>(list: readonly T[]) => ids(list) as unknown as ReadonlyMap<string, T>;
export const atlasId = "atlas";
export const atlasAgent: Agent = {
  id: atlasId, name: "Atlas", portrait: "atlas", role: "Your thinking partner",
  instructions: "Look across everything and help me find the next step: check open and overdue tasks before advising, and when several things compete, pick one and say why.", writeMode: "full",
};

export const domainHues: Record<string, string> = {
  Clay: "#c2705a", Marigold: "#d29a2b", Moss: "#8d9a3e", Sage: "#6c9a68", Pine: "#2f7a62",
  Lagoon: "#2f8b9a", Sky: "#5482c9", Iris: "#7c68c4", Plum: "#a0588e", Rose: "#d1667c",
};
/** A domain hue's name ("Marigold"), or undefined for the skin's accent or any other colour. */
export const domainHueName = (hue?: string) => Object.keys(domainHues).find((name) => domainHues[name] === hue);

/** The first domain is the default: it can't be removed. An empty hue means the skin's own accent. */
export const defaultDomain: Domain = { name: "Everyday", emoji: "☀️", hue: "", intention: "The ordinary, good stuff." };
