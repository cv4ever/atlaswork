// What a computer may ask the agent function about a job it holds (agents-design D77). Its helper runs the agent loop
// on the computer, so the function answers one step at a time: a model call, an image described (D58), a calendar
// read (D74), a progress line (D76), and at the end the landing or the failure, which the function lands in the
// stored workspace as away.ts does. A tidy job (D79) ends with what the app did instead. The computer is known by its
// token; these only shape and bound what it sends.
// No Deno APIs, so tests cover it.
import type { Answered, Snapshot } from "./contract.ts";
import { background as handedOff } from "./caps.ts";
import type { Message, ToolCall, Turn } from "./logic.ts";
import { cleanTurns, isImage, isRecord, isTurns } from "./validate.ts";
import { computerOf } from "./tools.ts";
import { computerPath } from "./searches.ts";
import { warningsOf } from "./warnings.ts";
import { tidyOutcomeOf } from "./tidy.ts";
import { searchLimits } from "./searches.ts";
import type { TidyOutcome } from "../../../src/tidying.ts";
import { isToolUse } from "../../../src/model.ts";
import type { ToolUse, Usage } from "../../../src/model.ts";

export type ComputerAsk = { job: string } & (
  | { model: { messages: Message[]; tools?: unknown[] } }
  | { see: { messages: Message[] } }
  | { outside: ToolCall }
  | { progress: string }
  | { land: Answered }
  | { fail: string }
  | { tidied: TidyOutcome }
  | { search: string }
  | { move: Move });

/**
 * A job moving to another of the account's computers (D84): the one a file the model asked for is on, by name, the
 * turns so far with that call still unanswered, what it read, what its searches found (as the model saw them) and how
 * long it ran here.
 */
export type Move = { to: string; turns: Turn[]; used: ToolUse[]; found: string[]; ran: number };

/** The largest request a computer sends: a whole conversation with one image in it. */
export const askBytes = 3_000_000;
/** Calls one job may ask for: its rounds and lookups, an image described per file read, and some retries. */
export const callsPerJob = handedOff.rounds + handedOff.lookups + 16;

/**
 * The computer a reply or hand-off searches on (agents-design D78), from the account's computers with search on, oldest
 * first: none unless its agent may read files (`tools` has `search_computer`); with this device's folders none, since a
 * reply's files are in one place (D77); else one holding a folder of the reply that searches, else the oldest that
 * asked for work in the last `searchLimits.seen`, so a search doesn't wait for one that's off. `others` names the other
 * computers with search on, asked at once (D84); `off` says every one is off, so a search answers so without waiting.
 */
export function searchedComputer(snapshot: Pick<Snapshot, "tools" | "folders">, searching: { id: string; name: string; last_seen?: string | null }[],
  now = Date.now()): Snapshot["search"] {
  if (!snapshot.tools.includes("search_computer")) return undefined;
  const folders = snapshot.folders ?? [];
  if (folders.length && !folders[0].computer) return undefined;
  const on = (computer: { last_seen?: string | null }) => !!computer.last_seen && now - Date.parse(computer.last_seen) <= searchLimits.seen;
  // A computer holding one of the reply's folders runs it anyway (D84), so its search goes first, even while it's off.
  const holding = searching.find((computer) => folders.some((folder) => folder.computer?.id === computer.id));
  const found = holding ?? searching.find(on) ?? searching[0];
  if (!found) return undefined;
  const others = searching.filter((computer) => computer.id !== found.id).map((computer) => computer.name);
  return { id: found.id, name: found.name, ...others.length && { others }, ...!holding && !on(found) && { off: true as const } };
}

/** A tool call's argument by name, when it's text. */
function argOf(call: ToolCall, key: string): string | undefined {
  try {
    const value: unknown = JSON.parse(call.function.arguments || "{}")?.[key];
    return typeof value === "string" ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The computer a job's file tool goes to (D84): a path a search named after a computer ("Laptop: Papers/x.pdf") goes
 * to that one, a path in a folder of the reply, or a folder `search_files` names, to that folder's computer, and
 * `search_computer` or anything else to where the job is (`computerOf`). A computer named only by a search has no id
 * here: the function finds it among the account's computers by its name. Undefined for this device's folders.
 */
export function computerFor(snapshot: Snapshot, call: ToolCall): { id?: string; name: string } | undefined {
  const tool = call.function.name;
  const path = tool === "search_computer" ? undefined : argOf(call, tool === "read_image" ? "name" : tool === "search_files" ? "folder" : "path");
  if (path) {
    const known = [snapshot.at, snapshot.search, ...(snapshot.folders ?? []).map((folder) => folder.computer)]
      .filter((computer): computer is { id: string; name: string } => !!computer);
    const named = computerPath(path, [...known.map((computer) => computer.name), ...snapshot.search?.others ?? []]).computer;
    if (named) return known.find((computer) => computer.name === named) ?? { name: named };
    const folder = snapshot.folders?.find((item) => path === item.name || path.startsWith(`${item.name}/`));
    if (folder?.computer) return folder.computer;
  }
  return tool === "search_computer" ? snapshot.at ?? snapshot.search : computerOf(snapshot);
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isText = (value: unknown, most: number): value is string => typeof value === "string" && value.length <= most;
const isCall = (value: unknown): value is ToolCall => isRecord(value) && isText(value.id, 200) && value.type === "function" && isRecord(value.function)
  && isText(value.function.name, 80) && isText(value.function.arguments, 20_000);
const isMessage = (value: unknown): value is Message => isRecord(value) && (
  (value.role === "system" || value.role === "user") && isText(value.content, askBytes)
    && (value.image === undefined || value.role === "user" && isImage(value.image))
  || value.role === "assistant" && isText(value.content, askBytes)
    && (value.tool_calls === undefined || Array.isArray(value.tool_calls) && value.tool_calls.length <= 16 && value.tool_calls.every(isCall))
    && (value.replay === undefined || Array.isArray(value.replay))
  || value.role === "tool" && isText(value.tool_call_id, 200) && isText(value.content, askBytes));
const isMessages = (value: unknown): value is Message[] => Array.isArray(value) && value.length > 0 && value.length <= 200 && value.every(isMessage);
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;

/**
 * What the helper's loop came to, kept to what a reply may carry; away.ts checks the drafts, memories and where things
 * are (D80) as it lands them.
 */
export function answeredOf(value: unknown): Answered | null {
  if (!isRecord(value) || !isText(value.text, 20_000)) return null;
  const used = Array.isArray(value.used) ? value.used.filter(isToolUse).slice(0, 12) : [];
  const warnings = warningsOf(value.warnings);
  const usage = isRecord(value.usage) ? value.usage : undefined;
  const model = isRecord(usage?.model) && isText(usage.model.source, 300) && isText(usage.model.id, 200)
    ? { source: usage.model.source, id: usage.model.id } : undefined;
  const effort = usage && (usage.effort === null || ["low", "medium", "high"].includes(String(usage.effort))) ? usage.effort as Usage["effort"] : undefined;
  return { text: value.text, draft: value.draft, shown: value.shown, memories: value.memories, ...value.learned !== undefined && { learned: value.learned },
    ...value.limited === true && { limited: true },
    ...used.length && { used }, ...warnings.length && { warnings },
    ...usage && { usage: { input: count(usage.input), output: count(usage.output), ...usage.peak !== undefined && { peak: count(usage.peak) },
      ...model && { model }, ...effort !== undefined && { effort } } } };
}

/** A computer's request, or null when it's malformed or too large. */
export function parseComputerAsk(text: string): ComputerAsk | null {
  if (text.length > askBytes) return null;
  let body: unknown;
  try { body = JSON.parse(text); } catch { return null; }
  if (!isRecord(body) || typeof body.job !== "string" || !uuid.test(body.job)) return null;
  const job = body.job;
  if (isRecord(body.model) && isMessages(body.model.messages) && (body.model.tools === undefined || Array.isArray(body.model.tools) && body.model.tools.length <= 64))
    return { job, model: { messages: body.model.messages, ...body.model.tools !== undefined && { tools: body.model.tools as unknown[] } } };
  if (isRecord(body.see) && isMessages(body.see.messages)) return { job, see: { messages: body.see.messages } };
  if (isCall(body.outside)) return { job, outside: body.outside };
  if (isText(body.progress, 200) && body.progress) return { job, progress: body.progress };
  if ("land" in body) {
    const land = answeredOf(body.land);
    return land ? { job, land } : null;
  }
  if (isText(body.fail, 600) && body.fail) return { job, fail: body.fail };
  if (isText(body.search, searchLimits.query) && body.search.trim()) return { job, search: body.search };
  if (isRecord(body.move) && isText(body.move.to, 80) && body.move.to.trim() && isTurns(body.move.turns) && body.move.turns.length) {
    const { to, turns, used, found, ran } = body.move;
    return { job, move: { to: to.trim(), turns: cleanTurns(turns),
      used: Array.isArray(used) ? used.filter(isToolUse).slice(0, 12).map(({ tool, about, failed, on }) => ({ tool, ...about !== undefined && { about }, ...failed && { failed },
        ...on?.length && { on } })) : [],
      found: Array.isArray(found) ? found.filter((path): path is string => isText(path, 500) && path !== "").slice(0, 100) : [], ran: count(ran) } };
  }
  if ("tidied" in body) {
    const tidied = tidyOutcomeOf(body.tidied);
    return tidied ? { job, tidied } : null;
  }
  return null;
}
