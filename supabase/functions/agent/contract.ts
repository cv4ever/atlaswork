// What the browser and the function exchange: the request snapshot, the commands it offers (one per agent ability),
// drafts, the conversation's turns and the provider's completions, and what the loop answered for landing (away.ts,
// and a computer's helper, D77). src/agentRequest.ts and src/commands.ts build these.
import type { Effort } from "./responses.ts";
import type { ToolUse, Usage as ReplyUsage } from "../../../src/model.ts";
import type { WarningKind } from "./warnings.ts";

/**
 * One argument of a proposal command. `oneOf` lists every accepted value (matched ignoring case; `show` puts them in the
 * schema the model sees when there are at most `limits.choices`, since a longer list such as an agent's places would
 * repeat in every tool that takes one: the prompt lists those once). A `list` keeps up to `max` distinct values and
 * drops those in `except`. With `fields`, each list item is an object: its first field names it (distinctness and
 * `except` apply to it), the others are checked on their own (`date` takes YYYY-MM-DD; an `optional` field may be
 * left out, and a wrong one is dropped with a note).
 * A plain-text argument keeps up to `max` characters (200 unless set, at most 4,000); an `optional` one may be left out,
 * and an optional one outside its `oneOf` is dropped with a note, so one wrong choice never sinks the rest of a fill.
 * With `min`, its length must fall between `min` and `max` or the model is told to write it again (house rules, D57).
 */
export type Arg = { description: string; oneOf?: string[]; show?: boolean; except?: string[]; list?: { max: number }; fields?: Record<string, Field>;
  optional?: boolean; max?: number; min?: number };
export type Field = { description: string; oneOf?: string[]; show?: boolean; date?: boolean; optional?: boolean };

/**
 * A change the browser lets this agent propose (src/commands.ts). The function only checks its arguments. `lookup` is
 * reference the model reads only when it needs it (a page's blocks before arranging it), so it stays out of every turn.
 * With `after`, the command itself is offered only once that read tool was called in this reply: its own lookup, a
 * built-in one such as list_tasks, or `search_computer` (a tidy, D79). A large command (propose_agent, agents-design
 * D57) then costs its prompt line and one short lookup on every other turn. With `shows`, the command only puts
 * something in the reply (answers to tap, the person's own widgets, D64) and changes nothing, so it doesn't use up the
 * reply's one proposal: a reply holds at most one proposal and one show.
 */
export type Command = { name: string; description: string; progress: string; prompt: string; args: Record<string, Arg>; lookup?: Lookup; after?: string; shows?: boolean };

/** A read-only tool without arguments whose answer the browser already wrote. */
export type Lookup = { name: string; description: string; progress: string; result: string };

/** What the browser sends: only text its permissions allow (src/live.ts builds it from the Agent's Workspace). */
export type Snapshot = {
  agent: { name: string; role: string; instructions: string; warmth: string; detail: string };
  /** The person's house rules for every agent (agents-design D46), read before the agent's own. Older browsers send none. */
  everyAgent?: string;
  /** The person's profile: what to call them and their own line about themselves. Absent when both are empty. */
  person?: { name: string; about: string };
  /** Lookup tools the agent's Workbench permissions allow: `read_notes`, `list_tasks`. */
  tools: string[];
  /** Changes the agent may propose. Older browsers send none. */
  commands: Command[];
  /** Where the agent works: "Domain" or "Domain / Project". */
  places: string[];
  /** What the data blocks on the pages where the agent works say today, one line per page (D36). Older browsers send none. */
  pages?: string[];
  notes: { title: string; body: string; place: string }[];
  attachedNote?: { title: string; body: string; place: string };
  tasks: { title: string; due: string; place: string }[];
  history: { role: "user" | "assistant"; text: string }[];
  request: string;
  /** The person's local date, YYYY-MM-DD. */
  today: string;
  /** The person's time zone, which calendar times are read on (D74). Older browsers send none. */
  zone?: string;
  /** The Google Calendar ids this agent reads (agents-design D83); absent, every calendar the person shows. */
  calendars?: string[];
  /**
   * The agent's own model instead of the account's (agents-design D44): `source` names the catalogue it came from
   * (provider.ts `sourceOf`, or "chatgpt" for the dev plan bridge), so it applies only while that provider answers.
   */
  model?: { source: string; id: string };
  /** How hard the agent's model thinks, instead of the account's setting (D44); providers without effort ignore it. */
  effort?: Effort;
  /**
   * Folders linked to projects where the agent works, on the person's device (agents-design D47): each path starts
   * with the folder's name. The browser reads them when the loop pauses on a file tool. Older browsers send none.
   * Folders on the account's computers (D77) are named without their files, which their computer lists; since D84 a
   * reply's may be on several computers, never mixed with this device's.
   */
  folders?: Folder[];
  /**
   * The account's computer a job runs on once the function moved it there (D84): at its first file tool, and again
   * whenever it reads a file on another computer. `found` is what this job's searches found so far, each path as the
   * model saw it after a computer's name ("Laptop: Papers/carta.docx"), so the computer it moves to opens what was
   * found there. Only the agent function sets it, on the job's stored request; one a browser sends is dropped.
   */
  at?: { id: string; name: string; found?: string[] };
  /**
   * The account's computer whose search list `search_computer` looks in (agents-design D78), where the reply goes to
   * search, and `others`, the account's other computers with search on, which it asks at once through the function
   * (D84); `off` when none of them is on, so a search answers so on the server instead of waiting. Only the agent
   * function sets it, from the account's computers with search on, for a reply or hand-off whose agent may read files
   * (`tools` has `search_computer`); one a browser sends is dropped.
   */
  search?: { id: string; name: string; others?: string[]; off?: true };
  /**
   * The paths this job's searches found so far (D78), set by its helper before each leg (`withFound` in tidy.ts): the
   * ones on that computer as found, the others after their computer's name (D84). A tidy may move only those, and
   * `remember_where` (D80) only names their folders. Never parsed from a request.
   */
  found?: string[];
  /**
   * Image notes the agent may look at (agents-design D58), by the name `read_image` takes. The browser sends the image
   * when the loop pauses on it, and the function has it described before the model reads on. Older browsers send none.
   */
  images?: string[];
  /**
   * A reply resumed after the browser ran file tools (D47): the model's turns since `request`, ending with their
   * results. Without `resume` the leg is admitted like a new reply: the browser could write anything here, as it can
   * in `request`.
   */
  turns?: Turn[];
  /** The paused leg's signed, one-use token (resume.ts): with it, the resumed leg isn't counted as another reply. */
  resume?: string;
  /**
   * What the agent remembers where it works (agents-design D49), newest first: `place` is one of `places`, "@Name" for
   * one of `people` (D71), or "" for what's about the person. `listening` when the person wrote `request` (not a
   * routine), so the agent may remember from it, in `places`, about `people` or about them. Older browsers send none.
   */
  memory?: { items: Recalled[]; listening: boolean };
  /**
   * People in the person's life the agent reads about (agents-design D71): `name` as remember takes it ("@Sofia"),
   * `about` who they are, their domain and their next date. Older browsers send none.
   */
  people?: { name: string; about: string }[];
  /**
   * The other agents in the workspace (agents-design D50), one line each: name, role and where they look, so the
   * agent can name or ask the right one. Absent when another agent asked this question, and from older browsers.
   */
  crew?: string[];
  /**
   * Where the reply goes when the browser has gone before it arrives (agents-design D72): the chat, the person's message
   * it answers, the answering agent's id and the device's time zone (for quiet hours). The function then lands it in
   * the account's workspace itself. Only a chat reply to the person sends it; older browsers send none. With
   * `background` (D73) the person handed the work off: the function answers the page at once, works with a larger
   * budget (`caps.background`) and always lands the result, or the failure, itself.
   */
  land?: Land;
};

/**
 * Where a chat reply lands. `here` says it was asked in one of the account's computers' own desktop window (D78): the
 * computer and that window's key for this start of the app, which its helper and app check before showing a file there.
 */
export type Land = { thread: string; message: string; agent: string; zone: string; background?: true; here?: { computer: string; key: string } };

/** A memory as the agent reads it; `id` is short (m1, m2), for `remember`'s `replaces`. */
export type Recalled = { id: string; text: string; place: string };

/** What `remember` saved: the browser binds `place` and `replaces` to records, and checks them again. */
export type Remembering = { text: string; place: string; quote: string; replaces?: string };
/**
 * What `remember_where` offered (D80): what it is in a few words and the folder a search found it in, for `place`; the
 * landing writes the sentence with the computer the job ran on, and the person keeps it or not.
 */
export type Learning = { what: string; folder: string; place: string; replaces?: string };
/**
 * A folder a reply may read: its place, its name (which its paths start with) and its files. A folder on one of the
 * account's computers (D77) carries the computer's id for it and which computer, and no files: it's listed there, and
 * the first file tool moves the job to that computer.
 */
export type Folder = { place: string; name: string; files: string[]; id?: string; computer?: { id: string; name: string } };

/** A command and its checked arguments, which the browser turns into a Workbench Proposal; the model never writes records. */
export type Draft = { command: string; args: Record<string, string | string[] | Record<string, string>[]> };
export type Message =
  // `image` (a data URL) goes with the text to a model that sees, when an image is described (D58); no other call sends one.
  | { role: "system" | "user"; content: string; image?: string }
  // `replay` is what a provider wants back verbatim on the next call (Responses reasoning and call items); others ignore it.
  | { role: "assistant"; content: string; tool_calls?: ToolCall[]; replay?: unknown[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type Turn = Extract<Message, { role: "assistant" | "tool" }>;
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

/** Tokens a call read and wrote, as the provider reported them; `cached` is the part of `input` read from its prefix cache. */
export type Usage = { input: number; output: number; cached?: number };

/** The parts of a model call the loop reads. `model` is the one that answered, which `complete` fills in. */
export type Completion = { text: string; toolCalls: ToolCall[]; finish: string; neurons: number; usage?: Usage; replay?: unknown[]; model?: string };
export type Model = (messages: Message[], tools: unknown[] | undefined) => Promise<Completion>;

/**
 * What the loop answered: words, its unchecked drafts and memories, where things are on a computer (D80), what it read
 * (D81), the scams code found in what it read and wrote (D79), the tokens it used, and whether its budget ran out.
 */
export type Answered = { text: string; draft?: unknown; shown?: unknown; memories?: unknown; learned?: unknown; used?: ToolUse[]; warnings?: WarningKind[]; usage?: ReplyUsage; limited?: boolean };
