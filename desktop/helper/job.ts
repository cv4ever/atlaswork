// One job on this computer (agents-design D77): the agent function's own loop (runAgent) runs here, with the file
// tools answered from this computer's linked folders, never a path the job names, `search_computer` from its search
// index and the account's other computers' (D84, through the agent function), `open_file` through the app (D78), and
// every model call, image and calendar read asked of the agent function (supabase/functions/agent/computer.ts), which
// also lands the answer. No pauses and no 150 s limit: the whole job runs here, under a hand-off's budget (D73, D76).
// A file tool for a file or folder on another of the account's computers moves the job there (D84), with its turns.
import { background as handedOff } from "../../supabase/functions/agent/caps.ts";
import { AgentError, limits, parseSnapshot, runAgent, usedOf } from "../../supabase/functions/agent/logic.ts";
import type { Completion, Message, Snapshot, ToolCall, Turn } from "../../supabase/functions/agent/logic.ts";
import type { Answered } from "../../supabase/functions/agent/contract.ts";
import { requestText } from "../../supabase/functions/agent/jobs.ts";
import { computerPath, searchText } from "../../supabase/functions/agent/searches.ts";
import type { Part } from "../../supabase/functions/agent/searches.ts";
import { computerFor } from "../../supabase/functions/agent/computer.ts";
import type { Move } from "../../supabase/functions/agent/computer.ts";
import { withFound } from "../../supabase/functions/agent/tidy.ts";
import { computerOf } from "../../supabase/functions/agent/tools.ts";
import { fileTools, scanFolder } from "../../src/fileTools.ts";
import type { FileLike, OpenFolder, PdfText } from "../../src/fileTools.ts";
import type { ToolUse } from "../../src/model.ts";
import type { TidyOutcome } from "../../src/tidying.ts";
import { folderOnDisk } from "./disk.ts";
import type { Search, SearchFolder } from "./search.ts";

/** What the agent function does for a job this computer holds. */
export type Server = {
  model(job: string, messages: Message[], tools: unknown[] | undefined): Promise<Completion & { source?: string }>;
  see(job: string, messages: Message[]): Promise<Completion>;
  outside(job: string, call: ToolCall): Promise<{ text: string; used?: ToolUse }>;
  progress(job: string, step: string): Promise<unknown>;
  land(job: string, answered: Answered): Promise<unknown>;
  fail(job: string, reason: string): Promise<unknown>;
  /** What the app did with a tidy job (D79). */
  tidied(job: string, outcome: TidyOutcome): Promise<unknown>;
  /** The account's other computers' parts of a search (D84): each answers from its own index, or is named off or late. */
  search(job: string, query: string): Promise<Part[]>;
  /** Hands the job to another of the account's computers (D84), which claims it and goes on; refused with why. */
  move(job: string, move: Move): Promise<unknown>;
};
/**
 * A job as `computer_poll` hands it over: a chat reply or a hand-off, what was asked, and what the server's run
 * left when it moved the job here for a folder's files (D77); or a tidy's Apply or Undo (D79).
 */
export type Claimed = { id: string; kind?: string; request: unknown; turns?: Turn[] | null; used?: ToolUse[] | null; ms?: number | null };
/** A folder linked on this computer: the id the workspace names it by, its name, and where it is. */
export type LocalFolder = { id: string; name: string; path: string };
/**
 * What's on this computer for a job: its linked folders, while its search is on its search list and index (D78), and
 * while the app runs it, this start's window key and the way to ask the app to show a file.
 */
export type Local = {
  folders: LocalFolder[];
  search?: { folders: SearchFolder[]; find(query: string, folders: SearchFolder[]): Search };
  show?: { key: string; open(path: string): void };
};
/** How the helper reads a PDF, a Word or Excel file, and shrinks an image (files.ts; tests pass their own). */
export type Readers = { pdf(file: FileLike): Promise<PdfText>; image(file: FileLike): Promise<string>; office?(file: FileLike): Promise<string> };

/** How often a job's progress line is written at most, as on the server (jobs.ts). */
const progressMs = 2_000;

/**
 * The folders `snapshot` asks for that are linked on this computer, by the id the workspace names each by and never by
 * a path, listed afresh; others stay out, besides those on another of the account's computers (D84), which stay named
 * with their computer and without files. Each keeps the name the model was told on the server, which its paths start with.
 */
async function openFolders(snapshot: Snapshot, local: LocalFolder[], here: string | undefined) {
  const opened: OpenFolder[] = [];
  const listed: NonNullable<Snapshot["folders"]> = [];
  /** Where each opened folder is on disk, by the name the model was told. */
  const paths = new Map<string, string>();
  let room = limits.items;
  for (const asked of snapshot.folders ?? []) {
    if (asked.computer && asked.computer.id !== here) {
      listed.push({ place: asked.place, name: asked.name, files: [], id: asked.id, computer: asked.computer });
      continue;
    }
    const linked = asked.id && local.find((folder) => folder.id === asked.id);
    if (!linked || room <= 0) continue;
    const handle = folderOnDisk(linked.path, asked.name);
    const files = (await scanFolder(handle).catch(() => ({ files: [] }))).files.filter((path) => path.length <= 400).slice(0, room);
    room -= files.length;
    opened.push({ name: asked.name, handle, files, allowed: async () => true });
    // With its id and computer, so `open_file` is offered here as on the server (D78); its files are listed now.
    listed.push({ place: asked.place, name: asked.name, files, id: asked.id, computer: asked.computer });
    paths.set(asked.name, linked.path);
  }
  return { opened, listed, paths };
}

/**
 * `search_computer` answered from this computer's index (D78) and, through the agent function, the account's other
 * computers with search on (`others`, D84), asked at once: the files found, as paths the model can then open with
 * `read_file` and `read_image` here, since their folders now list them; or why there are none. With other computers,
 * every path starts with its computer's name, and what they found goes into `elsewhere` as the model saw it.
 * `searched` hears which computers answered, for the reply's sources.
 */
function searchOf(local: Local, folders: (SearchFolder & { open: OpenFolder })[], computer: string, others: readonly string[],
  ask: (query: string) => Promise<Part[]>, elsewhere: Set<string>, searched: (names: string[]) => void) {
  return async (call: ToolCall): Promise<string> => {
    let query = "";
    try { query = String(JSON.parse(call.function.arguments || "{}").query ?? ""); } catch { return "Arguments were not valid JSON."; }
    if (!local.search && !others.length) return `Search is off on ${computer}, so nothing there can be searched; say so.`;
    // The others search while this one does; one that can't be reached is named, as one too slow is.
    const asked = others.length ? ask(query).catch((): Part[] => others.map((name) => ({ computer: name, missing: "late" }))) : Promise.resolve([]);
    const here: Part[] = [];
    if (local.search) {
      const result = local.search.find(query, folders);
      for (const hit of result.found) {
        const open = folders.find((folder) => folder.name === hit.folder)?.open;
        if (open && !open.files.includes(hit.path)) open.files.push(hit.path);
      }
      here.push({ computer, hits: result.found.map(({ path, changed, line }) => ({ path, changed, line })), all: result.all, files: result.files, reading: result.reading });
    }
    const parts = [...here, ...await asked];
    for (const part of parts) if (part.computer !== computer && "hits" in part) for (const hit of part.hits) elsewhere.add(`${part.computer}: ${hit.path}`);
    searched(parts.flatMap((part) => "hits" in part ? [part.computer] : []));
    return searchText(query, parts, computer);
  };
}

/**
 * A call as this computer runs it (D84): a path a search named "Office PC: Documents/x" loses this computer's name,
 * wherever the arguments carry it (a file to read or show, a tidy's moves, where a thing is), so the tools here and the
 * loop's checks see the path as found.
 */
export function localCall(call: ToolCall, computer: string): ToolCall {
  let args: unknown;
  try { args = JSON.parse(call.function.arguments || "{}"); } catch { return call; }
  let named = false;
  const strip = (value: unknown): unknown => {
    if (typeof value === "string") {
      const { computer: on, path } = computerPath(value, [computer]);
      named ||= !!on;
      return path;
    }
    return Array.isArray(value) ? value.map(strip)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, strip(item)])) : value;
  };
  const local = strip(args);
  return named ? { ...call, function: { ...call.function, arguments: JSON.stringify(local) } } : call;
}

/**
 * Kinds a reply may show on this computer's screen (D78): documents and images, besides folders, never a program,
 * script, shortcut or web page. The app keeps the same list (`SHOWN_TYPES`, desktop/src-tauri) and checks again; this
 * list decides, never the model.
 */
const shownTypes = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods", "odp", "rtf", "txt", "md", "csv",
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "tif", "tiff", "avif", "svg"]);

/**
 * `open_file` (D78): for a request asked in this computer's own window, carrying this start's window key, asks the app
 * to show a file this reply found or listed, or a folder holding one, once a reply; otherwise says why not. `folders`
 * are the ones open in this job, by the name the model knows, with where each is on disk.
 */
function showOf(snapshot: Snapshot, local: Local, folders: { name: string; path: string; open: OpenFolder }[], computer: string) {
  let shown = false;
  return (call: ToolCall): string => {
    const here = snapshot.land?.here;
    if (!local.show || !here || here.key !== local.show.key)
      return `Files open only on ${computer}'s screen, for a request asked in its own window; say where the file is instead.`;
    if (shown) return "A file was opened in this reply already; say where any other one is.";
    let path = "";
    try { path = String(JSON.parse(call.function.arguments || "{}").path ?? ""); } catch { return "Arguments were not valid JSON."; }
    // Names are unique in a job: a search-list folder named like a linked one is "(searched)".
    const folder = folders.find((item) => path === item.name || path.startsWith(`${item.name}/`));
    const rest = folder ? path.slice(folder.name.length + 1) : "";
    const found = folders.flatMap((item) => item.open.files);
    const isFile = found.includes(path), isFolder = !!folder && found.some((file) => file.startsWith(`${path}/`));
    if (!folder || rest.split("/").some((part) => part === "." || part === "..") || !isFile && !isFolder)
      return `${path} isn't a file or folder this reply found; search first and use its path exactly as found.`;
    const kind = /\.([^./]+)$/.exec(path)?.[1]?.toLowerCase();
    if (isFile && !(kind && shownTypes.has(kind))) return `${path} isn't a document, an image or a folder, so it can't be opened; say where it is.`;
    shown = true;
    local.show.open(rest ? `${folder.path.replace(/[\\/]+$/, "")}\\${rest.replaceAll("/", "\\")}` : folder.path);
    return `${path} is opening on ${computer}'s screen.`;
  };
}

/** The calls the model made last that have no result yet: the file tools the run before this one moved the job here for. */
function unanswered(turns: Turn[]): ToolCall[] {
  const last = turns.findLastIndex((turn) => turn.role === "assistant");
  const answered = new Set(turns.slice(last + 1).flatMap((turn) => turn.role === "tool" ? [turn.tool_call_id] : []));
  const asked = last < 0 ? undefined : turns[last];
  return asked?.role === "assistant" ? (asked.tool_calls ?? []).filter((call) => !answered.has(call.id)) : [];
}

/** A file tool this computer can't answer: the account's computer the job moves to for it (D84). */
type Elsewhere = { move: string };

/**
 * Runs a job this computer claimed to its end and has the agent function land it: the answer, or why it failed on
 * your message for Retry; or, at a file on another of the account's computers, hands it there (D84). Never throws;
 * returns what happened, for the log, never what was asked or answered.
 */
export async function runJob(job: Claimed, server: Server, local: Local, readers: Readers, now = Date.now): Promise<string> {
  const snapshot = parseSnapshot(requestText(job.request));
  if (!snapshot?.land) {
    await server.fail(job.id, "Its request couldn't be read on this computer. Ask again.").catch(() => undefined);
    return "unreadable request";
  }
  const name = snapshot.agent.name;
  const here = computerOf(snapshot);
  const computer = here?.name ?? "this computer";
  // The account's other computers a search asks (D84): every one with search on but this one.
  const others = snapshot.search ? [snapshot.search.name, ...snapshot.search.others ?? []].filter((other) => other !== computer) : [];
  const started = now();
  let written = -Infinity, writing: Promise<unknown> = Promise.resolve();
  const progress = (step: string) => {
    if (now() - written < progressMs) return;
    written = now();
    writing = writing.then(() => server.progress(job.id, step)).catch(() => undefined);
  };
  let source = "", answeredBy = "";
  const model = async (messages: Message[], tools: unknown[] | undefined) => {
    const completion = await server.model(job.id, messages, tools);
    source = completion.source ?? source;
    answeredBy = completion.model ?? answeredBy;
    return completion;
  };
  try {
    const { opened, listed, paths } = await openFolders(snapshot, local.folders, here?.id);
    const asked: Snapshot = { ...snapshot, folders: listed.length ? listed : undefined };
    // The search list opens as folders whose files are only what a search found in this job; a name a linked folder
    // already has gets "(searched)", so a path opens one folder only.
    const taken = new Set(opened.map((folder) => folder.name));
    const searched = (local.search?.folders ?? []).map((folder) => {
      const name = taken.has(folder.name) ? `${folder.name} (searched)` : folder.name;
      return { name, path: folder.path, open: { name, handle: folderOnDisk(folder.path, name), files: [] as string[], allowed: async () => true } };
    });
    // What this job's searches found before it moved here (D84): this computer's open here, the others' stay named.
    const elsewhere = new Set<string>();
    for (const path of snapshot.at?.found ?? []) {
      const split = computerPath(path, [computer]);
      const open = split.computer ? searched.find((folder) => split.path.startsWith(`${folder.name}/`))?.open : undefined;
      if (!split.computer) elsewhere.add(path);
      else if (open && !open.files.includes(split.path)) open.files.push(split.path);
    }
    /** What this job's searches found, as the model saw them: after their computer's name once others were asked. */
    const found = () => [...searched.flatMap((folder) => folder.open.files.map((path) => others.length ? `${computer}: ${path}` : path)), ...elsewhere];
    const read = fileTools([...opened, ...searched.map((folder) => folder.open)], readers.pdf, readers.image,
      (folder) => `The folder ${folder.name} isn't on this computer right now; say so.`, readers.office);
    // Which computers each read and search was made on (D84), by what it was about, for the reply's sources.
    const made = new Map<string, string[]>();
    const keyOf = (use: ToolUse) => `${use.tool}\n${use.about ?? ""}`;
    const placed = (list: ToolUse[]) => list.map((use) => use.on || !made.has(keyOf(use)) ? use : { ...use, on: made.get(keyOf(use)) });
    const search = (asked: ToolCall, call: ToolCall) => searchOf(local, searched, computer, others, (query) => server.search(job.id, query), elsewhere,
      (names) => { if (names.length) made.set(keyOf(usedOf(asked)), names); })(call);
    const show = showOf(snapshot, local, [...opened.map((open) => ({ name: open.name, path: paths.get(open.name)!, open })), ...searched], computer);
    const away = listed.filter((folder) => folder.computer && folder.computer.id !== here?.id);
    const files = async (asked: ToolCall): Promise<string | Elsewhere> => {
      const call = localCall(asked, computer);
      if (call.function.name === "search_computer") return await search(asked, call);
      // A file or folder on another of the account's computers (D84): the job moves there, unless it's to be shown.
      const target = computerFor({ ...snapshot, folders: listed }, call);
      if (target && target.name !== computer) {
        if (call.function.name !== "open_file") return { move: target.name };
        return `That is on ${target.name}, and files open only on ${computer}'s screen, for a request asked in its window; say where it is instead.`;
      }
      if (call.function.name === "open_file") return show(call);
      if (here) made.set(keyOf(usedOf(asked)), [computer]);
      const result = await read(call);
      let folder: unknown;
      try { folder = JSON.parse(call.function.arguments || "{}").folder; } catch { /* the tools said so */ }
      // Searching here leaves out folders on other computers; the model hears which, and how to look there.
      return call.function.name === "search_files" && !folder && away.length
        ? `${result}\nNot searched here: ${away.map((item) => `${item.name} (on ${item.computer!.name})`).join(", ")}; search_files with one of their names to look there.`
        : result;
    };
    // The loop reads the wall clock for its deadline (run.ts), whatever `now` the progress lines use.
    // A chat reply keeps a reply's rounds and lookups, a hand-off its own (D76); neither has the server's 150 s limit.
    const caps = job.kind === "reply" ? { rounds: limits.rounds, lookups: limits.lookups } : { rounds: handedOff.rounds, lookups: handedOff.lookups };
    const budget = { ...caps, deadline: Date.now() + Math.max(0, handedOff.ms - (job.ms ?? 0)) };
    let used: ToolUse[] = job.used ?? [];
    /**
     * Answers `calls` after `turns`; the first a file on another computer needs moves the job there with the rest
     * still unanswered, which that computer answers first. A computer the account no longer has is named instead.
     */
    const answer = async (calls: ToolCall[], turns: Turn[]): Promise<{ turns: Turn[] } | { moved: string }> => {
      const answered = await Promise.all(calls.map(async (call) => ({ call, result: await files(call) })));
      const results = answered.flatMap(({ call, result }) => typeof result === "string" ? [{ role: "tool" as const, tool_call_id: call.id, content: result }] : []);
      const to = answered.map(({ result }) => result).find((result): result is Elsewhere => typeof result !== "string");
      if (!to) return { turns: [...turns, ...results] };
      try {
        await writing;
        await server.move(job.id, { to: to.move, turns: [...turns, ...results], used: placed(used), found: found(), ran: now() - started });
        return { moved: to.move };
      } catch (cause) {
        if (!(cause instanceof AgentError)) throw cause;
        const why = `${cause.message} Say so.`;
        return { turns: [...turns, ...results, ...answered.flatMap(({ call, result }) => typeof result === "string" ? [] : [{ role: "tool" as const, tool_call_id: call.id, content: why }])] };
      }
    };
    let turns: Turn[] = job.turns ?? [];
    // The run before this one stopped at a file tool for this computer: it's answered here first, then the loop goes on.
    const waiting = unanswered(turns);
    if (waiting.length) {
      const first = await answer(waiting, turns);
      if ("moved" in first) return `moved to ${first.moved}`;
      turns = first.turns;
    }
    const spent = { input: 0, output: 0, peak: 0 };
    // Each leg runs until the loop asks for files, which this computer reads at once; the file tools cap the legs. A
    // tidy (D79) may name only files this job's searches found so far.
    for (let leg = 0; leg <= limits.fileReads + 1; leg++) {
      const reply = await runAgent(withFound(turns.length ? { ...asked, turns } : asked, found()), model, progress,
        (messages) => server.see(job.id, messages), { budget, outside: (call) => server.outside(job.id, call) });
      spent.input += reply.usage?.input ?? 0;
      spent.output += reply.usage?.output ?? 0;
      spent.peak = Math.max(spent.peak, reply.usage?.peak ?? 0);
      used = [...used, ...reply.used ?? []].slice(0, 12);
      if (!("pending" in reply)) {
        await writing;
        await server.land(job.id, {
          text: reply.text, draft: reply.draft, shown: reply.shown, memories: reply.memories, ...reply.learned && { learned: reply.learned },
          ...reply.limited && { limited: true },
          ...used.length && { used: placed(used) }, ...reply.warnings && { warnings: reply.warnings },
          usage: { ...spent, ...answeredBy && { model: { source, id: answeredBy } }, effort: snapshot.effort ?? null },
        });
        return `done in ${Math.round((now() - started) / 1000)} s`;
      }
      const next = await answer(reply.pending, reply.turns);
      if ("moved" in next) return `moved to ${next.moved} after ${Math.round((now() - started) / 1000)} s`;
      turns = next.turns;
    }
    throw new AgentError("It asked for files more often than a reply may.");
  } catch (cause) {
    await writing;
    const why = `${name} couldn't answer: ${cause instanceof AgentError ? cause.message : "something went wrong on this computer."} Try again in a moment.`;
    await server.fail(job.id, why).catch(() => undefined);
    return `failed: ${cause instanceof AgentError ? cause.message : cause instanceof Error ? cause.name : "unexpected"}`;
  }
}
