// Request validation: a snapshot (or a model test) as the browser may send it, every field checked against `limits`,
// commands and turns cleaned to exactly the shape the loop reads. Anything else is refused.
import type { Effort } from "./responses.ts";
import { limits } from "./texts.ts";
import { builtinTools, lookupTools } from "./tools.ts";
import type { Turn, ToolCall, Arg, Field, Command, Lookup, Snapshot, Folder, Recalled, Land } from "./contract.ts";

const isText = (value: unknown, max = limits.text): value is string => typeof value === "string" && value.length <= max;
const isList = (value: unknown): value is unknown[] => Array.isArray(value) && value.length <= limits.items;
export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNote = (value: unknown) => isRecord(value) && isText(value.title) && isText(value.body) && isText(value.place);
/** A time zone this runtime knows (Europe/Lisbon). */
const isZone = (value: unknown) => isText(value, 64) && (() => { try { new Intl.DateTimeFormat("en", { timeZone: value as string }); return true; } catch { return false; } })();
/** Where a reply lands without the browser (D72, D73): ids as the workspace makes them, and a zone this runtime knows. */
const isLand = (value: unknown) => isRecord(value) && [value.thread, value.message, value.agent].every((id) => isText(id, 100) && id !== "")
  && (value.background === undefined || value.background === true) && isZone(value.zone)
  && (value.here === undefined || isRecord(value.here) && typeof value.here.computer === "string" && uuid.test(value.here.computer)
    && typeof value.here.key === "string" && /^[0-9a-f]{64}$/.test(value.here.key));
const isTexts = (value: unknown) => isList(value) && value.every((item) => isText(item, 1000));
const isField = (value: unknown) => isRecord(value) && isText(value.description, 400) && (value.oneOf === undefined || isTexts(value.oneOf))
  && [value.show, value.date, value.optional].every((flag) => flag === undefined || typeof flag === "boolean");
const isArg = (value: unknown) => isRecord(value) && isText(value.description, 400)
  && (value.oneOf === undefined || isTexts(value.oneOf)) && (value.except === undefined || isTexts(value.except))
  && [value.show, value.optional].every((flag) => flag === undefined || typeof flag === "boolean")
  && (value.max === undefined || Number.isInteger(value.max) && (value.max as number) >= 1 && (value.max as number) <= 4000)
  && (value.min === undefined || Number.isInteger(value.min) && (value.min as number) >= 1 && (value.min as number) <= ((value.max as number | undefined) ?? 200))
  && (value.list === undefined || isRecord(value.list) && Number.isInteger(value.list.max) && (value.list.max as number) >= 1 && (value.list.max as number) <= 20)
  && (value.fields === undefined || value.list !== undefined && isRecord(value.fields) && Object.keys(value.fields).length >= 1
    && Object.keys(value.fields).length <= 4 && Object.entries(value.fields).every(([key, field]) => /^[a-z_]{1,30}$/.test(key) && isField(field)));
const isName = (value: unknown): value is string => typeof value === "string" && /^[a-z_]{1,40}$/.test(value) && !builtinTools.has(value);
const isLookup = (value: unknown) => isRecord(value) && isName(value.name) && isText(value.description, 400) && isText(value.progress, 60) && isText(value.result);

// A command's prompt line holds up to 1,500 characters: sort_capture's reached 999 of the old 1,000 (agents-design D61).
const isCommand = (value: unknown) => isRecord(value) && isName(value.name) && isText(value.description, 4000) && isText(value.progress, 60) && isText(value.prompt, 1500)
  && isRecord(value.args) && Object.keys(value.args).length <= 16 && Object.entries(value.args).every(([key, arg]) => /^[a-z_]{1,30}$/.test(key) && isArg(arg))
  && (value.lookup === undefined || isLookup(value.lookup))
  && (value.after === undefined || isRecord(value.lookup) && value.after === value.lookup.name || lookupTools.has(value.after as string)
    || value.after === "search_computer")
  && (value.shows === undefined || value.shows === true);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isFolder = (value: unknown) => isRecord(value) && isText(value.place, 400) && isText(value.name, 200) && isList(value.files) && value.files.every((file) => isText(file, 400))
  && (value.computer === undefined && value.id === undefined
    || typeof value.id === "string" && uuid.test(value.id) && isRecord(value.computer) && typeof value.computer.id === "string" && uuid.test(value.computer.id)
      && isText(value.computer.name, 80) && value.files.length === 0);
/** A reply's folders are this device's (D47) or on the account's computers (D77, several since D84), never both. */
const onePlace = (folders: Folder[]) => new Set(folders.map((folder) => !!folder.computer)).size <= 1;
/** Where a moved job runs (D84): a computer, and at most 100 found paths as the model saw them. */
const isAt = (value: unknown) => isRecord(value) && typeof value.id === "string" && uuid.test(value.id) && isText(value.name, 80) && value.name !== ""
  && (value.found === undefined || Array.isArray(value.found) && value.found.length <= 100 && value.found.every((path) => isText(path, 500) && path !== ""));
const isCall = (value: unknown) => isRecord(value) && isText(value.id, 200) && value.type === "function" && isRecord(value.function)
  && isText(value.function.name, 40) && isText(value.function.arguments, 4000);

/** A shrunken image the browser sends back from `read_image` (D58): a base64 JPEG, PNG or WebP data URL. */
export const isImage = (value: unknown): boolean => typeof value === "string" && value.length <= limits.image
  && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);
const isTurn = (value: unknown) => isRecord(value) && (value.role === "assistant"
  ? isText(value.content) && (value.tool_calls === undefined || Array.isArray(value.tool_calls) && value.tool_calls.length <= 8 && value.tool_calls.every(isCall))
    && (value.replay === undefined || Array.isArray(value.replay) && value.replay.length <= 50)
  : value.role === "tool" && isText(value.tool_call_id, 200) && (isText(value.content) || isImage(value.content)));

/** Resumed turns where every tool result answers a call made before it, as providers require; a moved job's too (D84). */
export const isTurns = (value: unknown): value is Turn[] => {
  if (!Array.isArray(value) || value.length > limits.turns || !value.every(isTurn)) return false;
  const called = new Set<unknown>();
  for (const turn of value as Record<string, unknown>[]) {
    if (turn.role === "assistant") for (const call of (turn.tool_calls ?? []) as { id: string }[]) called.add(call.id);
    else if (!called.has(turn.tool_call_id)) return false;
  }
  return true;
};

/** Turns as the boundary rebuilds them, which the resume token's digest is taken over (resume.ts). */
export const cleanTurns = (turns: Turn[]) => (JSON.parse(JSON.stringify(turns)) as Record<string, unknown>[]).map(cleanTurn);
const cleanTurn = (turn: Record<string, unknown>): Turn => turn.role === "tool"
  ? { role: "tool", tool_call_id: turn.tool_call_id as string, content: turn.content as string }
  : { role: "assistant", content: turn.content as string,
    ...turn.tool_calls !== undefined && { tool_calls: (turn.tool_calls as ToolCall[]).map(({ id, function: { name, arguments: args } }) => ({ id, type: "function" as const, function: { name, arguments: args } })) },
    ...turn.replay !== undefined && { replay: turn.replay as unknown[] } };

/** Only the keys a checked object may carry, absent ones left out, so nothing unchecked rides along. */
const pick = <T,>(value: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) as T;
const cleanArg = (arg: Record<string, unknown>): Arg => ({ ...pick<Arg>(arg, ["description", "oneOf", "show", "except", "optional", "max", "min"]),
  ...arg.list !== undefined && { list: { max: (arg.list as Arg["list"])!.max } },
  ...arg.fields !== undefined && { fields: Object.fromEntries(Object.entries(arg.fields as Record<string, Record<string, unknown>>)
    .map(([key, field]) => [key, pick<Field>(field, ["description", "oneOf", "show", "date", "optional"])])) } });
const cleanCommand = (command: Record<string, unknown>): Command => ({ ...pick<Command>(command, ["name", "description", "progress", "prompt", "after", "shows"]),
  args: Object.fromEntries(Object.entries(command.args as Record<string, Record<string, unknown>>).map(([key, arg]) => [key, cleanArg(arg)])),
  ...command.lookup !== undefined && { lookup: pick<Lookup>(command.lookup as Record<string, unknown>, ["name", "description", "progress", "result"]) } });

/** A model id as providers spell them (`anthropic/claude-sonnet-4.5`, `gpt-5:free`); it travels in the request body. */
export const modelId = /^[\w.:/@+-]+$/;
const isModel = (value: unknown): value is { source: string; id: string } =>
  isRecord(value) && isText(value.source, 300) && isText(value.id, 200) && modelId.test(value.id);

/** `efforts` in responses.ts, spelled out here so this file stays free of the Responses adapter. */
const isEffort = (value: unknown): value is Effort => value === "low" || value === "medium" || value === "high";

/**
 * The "Test" request: `{"test":true}` tries the provider's default; with `model` and `effort`, an agent's own
 * (agents-design D44). Null for anything else.
 */
export function parseTest(raw: string): Pick<Snapshot, "model" | "effort"> | null {
  if (raw.length > 1000) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!isRecord(body) || body.test !== true || Object.keys(body).some((key) => !["test", "model", "effort"].includes(key))
    || (body.model !== undefined && !isModel(body.model)) || (body.effort !== undefined && !isEffort(body.effort))) return null;
  return { ...body.model ? { model: { source: body.model.source, id: body.model.id } } : {}, ...body.effort ? { effort: body.effort } : {} };
}

/**
 * The snapshot when `body` has exactly the expected shape and sizes, else null. It's rebuilt from the checked fields,
 * so a field this doesn't check never reaches the loop, the prompt or the model.
 */
export function parseSnapshot(raw: string): Snapshot | null {
  if (raw.length > limits.body) return null;
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return null; }
  if (!isRecord(body)) return null;
  const { agent, everyAgent, person, tools, commands = [], places, pages = [], notes, attachedNote, tasks, history, request, today, zone, calendars, model, effort, folders, images,
    turns, resume, memory, crew, people, land, search, at } = body;
  const ok = isRecord(agent) && ["name", "role", "instructions", "warmth", "detail"].every((key) => isText(agent[key]))
    && (everyAgent === undefined || isText(everyAgent, limits.everyAgent))
    && (person === undefined || isRecord(person) && isText(person.name, 60) && isText(person.about, 240))
    && isList(tools) && tools.every((tool) => isText(tool, 40))
    && Array.isArray(commands) && commands.length <= limits.commands && commands.every(isCommand)
    && ((names) => new Set(names).size === names.length)(commands.flatMap((command) => [command.name, ...command.lookup ? [command.lookup.name] : []]))
    && isList(places) && places.every((place) => isText(place, 400))
    && isList(pages) && pages.length <= 40 && pages.every((page) => isText(page, 600))
    && isList(notes) && notes.every(isNote) && (attachedNote === undefined || isNote(attachedNote))
    && isList(tasks) && tasks.every((task) => isRecord(task) && isText(task.title, limits.title) && isText(task.due, 10) && isText(task.place, 400))
    && Array.isArray(history) && history.length <= limits.history
    && history.every((item) => isRecord(item) && (item.role === "user" || item.role === "assistant") && isText(item.text))
    && isText(request, limits.request) && request.trim() !== "" && isText(today, 10) && /^\d{4}-\d{2}-\d{2}$/.test(today) && (zone === undefined || isZone(zone))
    && (calendars === undefined || Array.isArray(calendars) && calendars.length <= 20 && calendars.every((id) => isText(id, 300) && id !== ""))
    && (model === undefined || isModel(model)) && (effort === undefined || isEffort(effort))
    && (folders === undefined || Array.isArray(folders) && folders.length <= limits.folders && folders.every(isFolder) && onePlace(folders as Folder[])
      && (folders as Folder[]).reduce((sum, folder) => sum + folder.files.length, 0) <= limits.items)
    && (images === undefined || Array.isArray(images) && images.length <= limits.images && images.every((name) => isText(name, 400)))
    && (turns === undefined || isTurns(turns)) && (resume === undefined || turns !== undefined && isText(resume, 2000))
    && (memory === undefined || isRecord(memory) && typeof memory.listening === "boolean" && Array.isArray(memory.items) && memory.items.length <= limits.memories
      && memory.items.every((item) => isRecord(item) && isText(item.id, 10) && isText(item.text, limits.memory) && isText(item.place, 400)))
    && (crew === undefined || Array.isArray(crew) && crew.length <= limits.crew && crew.every((line) => isText(line, 300)))
    && (people === undefined || Array.isArray(people) && people.length <= limits.people
      && people.every((item) => isRecord(item) && isText(item.name, 61) && item.name.startsWith("@") && isText(item.about, 400)))
    && (land === undefined || isLand(land))
    && (search === undefined || isRecord(search) && typeof search.id === "string" && uuid.test(search.id) && isText(search.name, 80) && search.name !== ""
      && (search.others === undefined || isList(search.others) && search.others.length <= 10 && search.others.every((name) => isText(name, 80) && name !== ""))
      && (search.off === undefined || search.off === true))
    && (at === undefined || isAt(at));
  if (!ok) return null;
  const note = (item: Record<string, unknown>) => ({ title: item.title, body: item.body, place: item.place }) as Snapshot["notes"][number];
  return {
    agent: { name: agent.name, role: agent.role, instructions: agent.instructions, warmth: agent.warmth, detail: agent.detail } as Snapshot["agent"],
    ...everyAgent !== undefined && { everyAgent },
    ...person !== undefined && { person: { name: person.name, about: person.about } as Snapshot["person"] },
    tools: tools as string[], commands: (commands as Record<string, unknown>[]).map(cleanCommand), places: places as string[], pages: pages as string[],
    notes: (notes as Record<string, unknown>[]).map(note),
    ...attachedNote !== undefined && { attachedNote: note(attachedNote as Record<string, unknown>) },
    tasks: (tasks as Record<string, unknown>[]).map((task) => ({ title: task.title, due: task.due, place: task.place }) as Snapshot["tasks"][number]),
    history: (history as Record<string, unknown>[]).map((item) => ({ role: item.role, text: item.text }) as Snapshot["history"][number]),
    request: request as string, today: today as string, ...zone !== undefined && { zone: zone as string },
    ...calendars !== undefined && { calendars: calendars as string[] },
    ...model !== undefined && { model: { source: model.source, id: model.id } as Snapshot["model"] },
    ...effort !== undefined && { effort },
    ...folders !== undefined && { folders: (folders as Folder[]).map(({ place, name, files, id, computer }) =>
      ({ place, name, files, ...computer && { id, computer: { id: computer.id, name: computer.name } } })) },
    ...images !== undefined && { images: images as string[] },
    ...turns !== undefined && { turns: (turns as Record<string, unknown>[]).map(cleanTurn) },
    ...resume !== undefined && { resume: resume as string },
    ...memory !== undefined && { memory: { listening: memory.listening as boolean,
      items: (memory.items as Record<string, unknown>[]).map(({ id, text, place }) => ({ id, text, place }) as Recalled) } },
    ...crew !== undefined && { crew: crew as string[] },
    ...people !== undefined && { people: (people as Record<string, unknown>[]).map(({ name, about }) => ({ name, about }) as NonNullable<Snapshot["people"]>[number]) },
    ...land !== undefined && { land: (({ thread, message, agent: id, zone, background, here }: Land) => ({ thread, message, agent: id, zone, ...background && { background },
      ...here && { here: { computer: here.computer, key: here.key } } }))(land as Land) },
    ...search !== undefined && { search: { id: search.id as string, name: search.name as string,
      ...Array.isArray(search.others) && search.others.length > 0 && { others: search.others as string[] }, ...search.off === true && { off: true as const } } },
    ...at !== undefined && { at: (({ id, name, found }: NonNullable<Snapshot["at"]>) => ({ id, name, ...found?.length && { found } }))(at as NonNullable<Snapshot["at"]>) },
  };
}
