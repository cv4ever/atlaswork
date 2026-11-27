// The tools a reply is offered: the built-in lookups, Google Calendar's (D74, run by the function, not the snapshot),
// file tools (D47), searching a computer (D78), read_image, remember (D49), remembering where things are on a computer
// (D80) and each command's schema, gated by what the snapshot holds and what a lookup must come first (`gatesOf`).
import { toolTexts, limits, aboutYou } from "./texts.ts";
import type { Snapshot, Field, Command } from "./contract.ts";

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]) =>
  ({ type: "function", function: { name, description, parameters: { type: "object", properties, required } } });

/** Lookups read the snapshot; everything that changes the workspace is a browser `Command`. */
const toolDefs = {
  read_notes: fn("read_notes", toolTexts.read_notes,
    { query: { type: "string", description: "Words to look for; empty lists every note." } }, ["query"]),
  // Null allowed: the model sends `"due_by": null` for "no date", and Groq rejects a call that breaks the schema.
  list_tasks: fn("list_tasks", toolTexts.list_tasks,
    { due_by: { type: ["string", "null"], description: "YYYY-MM-DD, or null for every open task" } }, []),
  read_pages: fn("read_pages", toolTexts.read_pages, {}, []),
  read_calendar: fn("read_calendar", toolTexts.read_calendar, {
    from: { type: ["string", "null"], description: "First day, YYYY-MM-DD; null for today." },
    to: { type: ["string", "null"], description: "Last day, YYYY-MM-DD; null for a week from the first." } }, []),
  free_time: fn("free_time", toolTexts.free_time, {
    date: { type: "string", description: "The day, YYYY-MM-DD." },
    from: { type: ["string", "null"], description: "Earliest start, HH:MM; null for 08:00." },
    to: { type: ["string", "null"], description: "Latest end, HH:MM; null for 20:00." },
    minutes: { type: ["integer", "null"], description: "Shortest slot worth listing, in minutes; null for 30." } }, ["date"]),
};

/** Lookups the function runs against an outside account rather than the snapshot (D74): offered only once it's connected. */
export const outsideTools = new Set(["read_calendar", "free_time"]);

/** Whether the page lines are too long for every call (`limits.pageFacts`): then the prompt keeps their places and goals, and read_pages has the rest. */
export const foldsPages = (snapshot: Snapshot) => (snapshot.pages ?? []).join("\n").length > limits.pageFacts;

/** Whether a built-in read tool is offered: by the agent's permissions, or read_pages when the pages are folded. */
export const offers = (snapshot: Snapshot, name: string) => name === "read_pages" ? foldsPages(snapshot) : snapshot.tools.includes(name);

/**
 * The commands that wait for a read tool in a reply (`Command.after`, D57), by name, with the tool they wait for. A read
 * tool this agent isn't offered gates nothing. A command after `search_computer` (a tidy, D79) waits for it even where
 * it isn't offered, so it never comes without a search.
 */
export const gatesOf = (snapshot: Snapshot) => new Map(snapshot.commands.flatMap((command) => command.after
  && (command.after === "search_computer" || reads(snapshot, command.after) && (!lookupTools.has(command.after) || offers(snapshot, command.after)))
  ? [[command.name, command.after] as const] : []));

/** File tools (D47): the browser runs them on the linked folders while the loop waits (src/folders.ts), or a computer's helper (D77). */
const fileTools = {
  search_files: fn("search_files", toolTexts.search_files,
    { query: { type: "string", description: "Words to look for." },
      folder: { type: "string", description: "Only this folder, by its name as listed. Leave out to search the folders here." } }, ["query"]),
  read_file: fn("read_file", toolTexts.read_file,
    { path: { type: "string", description: "The file's path as listed or found, starting with its folder's name." } }, ["path"]),
};

/** Searching a computer's search list (D78): its helper answers from its index, so a reply moves there to call it. */
const computerSearchTool = fn("search_computer", toolTexts.search_computer,
  { query: { type: "string", description: "A few words to look for in file names and documents." } }, ["query"]);

/** Showing a file (D78): the computer's helper asks its desktop app to open what the reply found, in its own app. */
const openTool = fn("open_file", toolTexts.open_file,
  { path: { type: "string", description: "The file's path as found, or the folder holding it, starting with its folder's name." } }, ["path"]);

/** Image reading (D58): the browser sends the image while the loop waits, and the function has it described. */
const imageTool = fn("read_image", toolTexts.read_image,
  { name: { type: "string", description: "The image note's name as listed, or the file's path starting with its folder's name." } }, ["name"]);

/**
 * Remembering (agents-design D49) is no proposal: it lands beside one, with Undo, so it neither takes the reply's one
 * draft nor waits for it. Offered only while the person wrote the request and no file was read in this reply.
 */
const rememberTool = (snapshot: Snapshot) => fn("remember", toolTexts.remember,
  { text: { type: "string", description: `A short third-person sentence, at most ${limits.memory} characters, e.g. “Works from home on Fridays.”` },
    place: { type: "string", ...enumOf([...snapshot.places, ...snapshot.people?.map((person) => person.name) ?? [], aboutYou]),
      description: `One of your places, @name for someone in your people list, or ${aboutYou} when it's about the person.` },
    quote: { type: "string", description: "The person's own words in their latest message that say it, copied exactly." },
    replaces: { type: "string", description: "The id of a memory this corrects, e.g. m2; leave out for something new." } },
  ["text", "place", "quote"]);
/** The folders holding what this job's searches found on its computer (D80): where `remember_where` may say a thing is. */
export const foldersFound = (snapshot: Snapshot) => [...new Set((snapshot.found ?? []).map((path) => path.split("/").slice(0, -1).join("/")).filter(Boolean))];
/**
 * Remembering where something is on a computer (D80): offered with `search_computer` while the person wrote the request
 * and Remember is on, and only once a search ran (run.ts). The model names the thing and a folder its search found;
 * the landing writes the sentence, and the person keeps it or not.
 */
const whereTool = (snapshot: Snapshot) => fn("remember_where", toolTexts.remember_where,
  { what: { type: "string", description: `What it is, in at most ${limits.what} characters, e.g. “Banco Lusitano letters”.` },
    folder: { type: "string", ...enumOf(foldersFound(snapshot)), description: "The folder holding what a search_computer result found, as its path started." },
    place: { type: "string", ...enumOf([...snapshot.places, ...snapshot.people?.map((person) => person.name) ?? [], aboutYou]),
      description: `One of your places, @name for someone in your people list, or ${aboutYou} when it's about the person.` },
    replaces: { type: "string", description: "The id of a memory this corrects, e.g. m2, when it says the thing was somewhere else; leave out otherwise." } },
  ["what", "folder", "place"]);
export const lookupTools = new Set(Object.keys(toolDefs));
export const progressOf: Record<string, string> = { read_notes: "Reading notes", list_tasks: "Checking open tasks", read_pages: "Looking at the pages", search_files: "Searching your files",
  read_file: "Reading a file", read_image: "Looking at an image", remember: "Remembering", read_calendar: "Checking your calendar", free_time: "Finding free time",
  search_computer: "Searching your computer", open_file: "Opening a file", remember_where: "Remembering where it is" };
export const builtinTools = new Set([...lookupTools, ...Object.keys(fileTools), "search_computer", "open_file", "read_image", "remember", "remember_where"]);
export const lookupsOf = (snapshot: Snapshot) => snapshot.commands.flatMap((command) => command.lookup ?? []);

/**
 * What a tool is doing while it runs ("Drafting tasks"): the typing indicator's words, and the tool's name in the agent
 * dialog's Briefing. A search that asks several computers (D84) says so.
 */
export const toolProgress = (snapshot: Snapshot, name: string) => name === "search_computer" && snapshot.search?.others?.length ? "Searching your computers"
  : progressOf[name] ?? lookupsOf(snapshot).find((lookup) => lookup.name === name)?.progress
  ?? snapshot.commands.find((command) => command.name === name)?.progress;

/** Whether a tool only reads: those count against `limits.lookups` and stay offered after a proposal. */
export const reads = (snapshot: Snapshot, name: string) => lookupTools.has(name) || lookupsOf(snapshot).some((lookup) => lookup.name === name);

/** Files in linked folders `read_image` opens (D58), as the browser decodes them. */
export const imageFile = /\.(jpe?g|png|webp|gif|bmp|avif)$/i;

/** Whether the agent has any image to look at: an image note, an image file in a linked folder, or a computer to search. */
const sees = (snapshot: Snapshot) => !!snapshot.images?.length || !!snapshot.search
  || !!snapshot.folders?.some((folder) => folder.files.some((file) => imageFile.test(file)));

/** The computer a reply's files are on (D77, D78): where the function moved it (D84), else its folders', else the one it may search. */
export const computerOf = (snapshot: Snapshot) => snapshot.at ?? snapshot.folders?.[0]?.computer ?? snapshot.search;

/**
 * Whether the person asked in that computer's own desktop window (D78), where `open_file` may show what the reply
 * found. The window's key, not this, is what the computer checks: a request that only says so opens nothing.
 */
export const showsHere = (snapshot: Snapshot) => !!snapshot.land?.here && snapshot.land.here.computer === computerOf(snapshot)?.id;

/**
 * Whether the browser or a computer runs this tool, so the loop pauses on it: a file tool while folders are linked or
 * a computer may be searched, `search_computer` then, `open_file` at that computer, or `read_image`. They count against
 * `limits.fileReads`. With every computer that searches off (D84), a search answers here instead of waiting for one.
 */
export const inBrowser = (snapshot: Snapshot, name: string) => name === "read_image" ? sees(snapshot)
  : name === "search_computer" ? !!snapshot.search && !snapshot.search.off
  : name === "open_file" ? showsHere(snapshot)
  : name === "read_file" ? !!snapshot.folders?.length || !!snapshot.search && !snapshot.search.off
  : !!snapshot.folders?.length && name in fileTools;

/** Accepted values as a schema `enum`, when there are few enough to spell out in every tool that takes them (`limits.choices`). */
function enumOf(values: string[] | undefined) {
  return values?.length && values.length <= limits.choices ? { enum: values } : {};
}
const stringOf = ({ show, oneOf, description }: Field) => ({ type: "string", ...show ? enumOf(oneOf) : {}, description });
const schemaOf = ({ name, description, args }: Command) => fn(name, description, Object.fromEntries(Object.entries(args).map(([key, arg]) => {
  const item = arg.fields ? { type: "object", properties: Object.fromEntries(Object.entries(arg.fields).map(([field, spec]) => [field, stringOf(spec)])),
    required: Object.entries(arg.fields).filter(([, spec]) => !spec.optional).map(([field]) => field) } : { type: "string", ...arg.show ? enumOf(arg.oneOf) : {} };
  return [key, arg.list ? { type: "array", items: item, maxItems: arg.list.max, description: arg.description } : { ...item, description: arg.description }];
})), Object.entries(args).filter(([, arg]) => !arg.optional).map(([key]) => key));

/** The tools `snapshot` offers the model; `descriptions` replaces their words by name (the admin page's unsaved ones). */
export const toolsFor = (snapshot: Snapshot, descriptions: Record<string, string> = {}) => [
  ...Object.entries(toolDefs).filter(([name]) => offers(snapshot, name)).map(([, def]) => def),
  ...snapshot.folders?.length ? Object.values(fileTools) : snapshot.search ? [fileTools.read_file] : [], ...snapshot.search ? [computerSearchTool] : [],
  ...showsHere(snapshot) ? [openTool] : [],
  ...sees(snapshot) ? [imageTool] : [], ...snapshot.memory?.listening ? [rememberTool(snapshot)] : [],
  ...snapshot.memory?.listening && snapshot.search ? [whereTool(snapshot)] : [],
  ...lookupsOf(snapshot).map((lookup) => fn(lookup.name, lookup.description, {}, [])), ...snapshot.commands.map(schemaOf),
].map((def) => descriptions[def.function.name] === undefined ? def : { ...def, function: { ...def.function, description: descriptions[def.function.name] } });
