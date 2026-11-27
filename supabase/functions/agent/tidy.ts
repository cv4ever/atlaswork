// Tidying a computer's files (agents-design D79): the rules the browser's `tidy_files` command (src/commands/files.ts),
// the agent function and a computer's helper share. A tidy names files a search in that reply found on one of the
// account's computers, each going into a folder straight in Documents, under a clearer name, or both, with why. Apply
// and Undo are jobs for that computer (src/tidying.ts); these shape what goes there and back. No Deno or browser APIs,
// so tests cover it.
import type { TidyAsk, TidyJob, TidyOutcome } from "../../../src/tidying.ts";
import type { Snapshot } from "./contract.ts";
import { isRecord } from "./validate.ts";

/** At most this many files in one tidy, and how many of them a proactive agent moves on its own; the rest wait for your OK. */
export const tidyLimits = { moves: 20, onTheirOwn: 10, name: 80 };

/** One file a tidy moves or renames: its path as the search found it (its listed folder's name first) and where it goes. */
export type FileMove = { file: string; folder?: string; name?: string; why: string };

const isText = (value: unknown, most: number): value is string => typeof value === "string" && value.length > 0 && value.length <= most;
const isMove = (value: unknown): value is FileMove => isRecord(value) && isText(value.file, 400) && isText(value.why, 200)
  && (value.folder === undefined || plainName(value.folder) === value.folder) && (value.name === undefined || plainName(value.name) === value.name)
  && (value.folder !== undefined || value.name !== undefined);

/** Your Apply or Undo from a page, or null. */
export const tidyAskOf = (value: unknown): TidyAsk | null => isRecord(value) && isText(value.thread, 200) && isText(value.message, 200)
  && isText(value.proposal, 200) && (value.action === "apply" || value.action === "undo")
  ? { thread: value.thread, message: value.message, proposal: value.proposal, action: value.action } : null;

/** The tidy ask a request body carries (`{"tidy": …}`), or null for any other body. */
export function tidyAskIn(text: string): TidyAsk | null {
  if (!text.startsWith('{"tidy":')) return null;
  try {
    const body = JSON.parse(text) as unknown;
    return isRecord(body) ? tidyAskOf(body.tidy) : null;
  } catch {
    return null;
  }
}

/** A tidy job's request as stored (its JSON text), or null: Apply carries its moves, Undo none. */
export function tidyJobOf(text: string): TidyJob | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (!isRecord(value) || !isText(value.proposal, 200) || typeof value.undo !== "boolean") return null;
  if (value.undo) return value.moves === undefined ? { proposal: value.proposal, undo: true } : null;
  return Array.isArray(value.moves) && value.moves.length > 0 && value.moves.length <= tidyLimits.moves && value.moves.every(isMove)
    ? { proposal: value.proposal, undo: false, moves: value.moves.map(({ file, folder, name, why }) => ({ file, ...folder && { folder }, ...name && { name }, why })) }
    : null;
}

/** What a computer reports for a tidy job, or null: each file and why it stayed, if it did; or why it ran none. */
export function tidyOutcomeOf(value: unknown): TidyOutcome | null {
  if (isRecord(value) && isText(value.failed, 600)) return { failed: value.failed };
  return isRecord(value) && Array.isArray(value.results) && value.results.length <= tidyLimits.moves
    && value.results.every((result) => isRecord(result) && isText(result.file, 400) && (result.failed === undefined || isText(result.failed, 300)))
    ? { results: value.results.map(({ file, failed }) => ({ file, ...failed && { failed } })) } : null;
}

/**
 * The browser offers `tidy_files` to any agent with Tidy files on; it stays only when the computer the reply may search
 * has tidying on (`tidies`), so the service never asks a computer for what it hasn't turned on (R12).
 */
export function withTidy(snapshot: Snapshot, tidies: boolean): Snapshot {
  return tidies || !snapshot.commands.some((command) => command.name === "tidy_files") ? snapshot
    : { ...snapshot, commands: snapshot.commands.filter((command) => command.name !== "tidy_files") };
}

/**
 * On the computer, a tidy names only files a search in this reply found: before each leg the helper narrows
 * `tidy_files` to them, and the loop's check refuses any other path, so the model hears which and can fix it. The
 * same list is `found`, whose folders are where `remember_where` may say a thing is (D80).
 */
export function withFound(snapshot: Snapshot, found: readonly string[]): Snapshot {
  const paths = [...new Set(found)];
  return { ...snapshot, found: paths, commands: snapshot.commands.map((command) => command.name !== "tidy_files" || !command.args.moves ? command
    : { ...command, args: { ...command.args, moves: { ...command.args.moves, oneOf: paths } } }) };
}

const reserved = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;
/**
 * A name Windows takes for one file or folder, trimmed: none of `<>:"/\|?*` or control characters, not ending in a dot
 * or space, not a device name such as CON, and at most `max` characters. Undefined otherwise.
 */
export function plainName(value: unknown, max = tidyLimits.name): string | undefined {
  const name = typeof value === "string" ? value.trim() : "";
  // deno-lint-ignore no-control-regex
  return name && name.length <= max && !/[<>:"/\\|?*\u0000-\u001f]/.test(name) && !/[. ]$/.test(name) && !reserved.test(name) ? name : undefined;
}

/** A path as Windows shows it. */
export const windowsPath = (path: string) => path.replaceAll("/", "\\");
/** A found path's last part, and its extension with the dot ("" without one). */
export const fileNameOf = (path: string) => path.split(/[/\\]/).at(-1) ?? path;
export const extensionOf = (path: string) => /(\.[^.\\/]+)$/.exec(fileNameOf(path))?.[1] ?? "";

/** Where a move puts the file, as the card says it: `Documents\Bank\Letter 2026.pdf`, or its new name where it is. */
export function tidyTarget(move: FileMove): string {
  const name = move.name ? `${move.name}${extensionOf(move.file)}` : fileNameOf(move.file);
  return move.folder ? `Documents\\${move.folder}\\${name}` : windowsPath(move.file.split("/").slice(0, -1).concat(name).join("/"));
}
