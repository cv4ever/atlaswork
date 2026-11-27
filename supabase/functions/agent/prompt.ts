// The system prompt, as parts that say where each line comes from (D46: the agent dialog's Briefing shows them), built
// from the ground rules, the line templates and the request.
import { groundRules, lineTemplates, limits, aboutYou } from "./texts.ts";
import type { GroundRule, LineTemplate } from "./texts.ts";
import type { Folder, Snapshot } from "./contract.ts";
import { computerOf, foldsPages, showsHere } from "./tools.ts";

/** "Office PC, Laptop and Old PC". */
const joined = (names: string[]) => names.join(", ").replace(/, ([^,]*)$/, " and $1");
/** The computers a reply's folders are on (D77, D84), each once, in the folders' order. */
const computersOf = (folders: Folder[]) => [...new Set(folders.flatMap((folder) => folder.computer ? [folder.computer.name] : []))];

/** The Personality sliders' labels (src/atlas.ts) as instructions a model can follow. */
const warmthOf: Record<string, string> = { Crisp: "crisp, with no greetings, pleasantries or encouragement", Cool: "cool and matter-of-fact",
  Even: "even and plain", Friendly: "friendly", Warm: "warm and personal" };
const detailOf: Record<string, string> = { "One line": "one sentence", Brief: "two or three short sentences", Balanced: "a short paragraph",
  Thorough: "a full paragraph when the question needs it, a short one when it doesn't" };

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "Saturday 2026-11-07": the day `offset` days after `today` (YYYY-MM-DD). */
const dayOf = (today: string, offset: number) => {
  const day = new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86_400_000);
  return `${weekdays[day.getUTCDay()]} ${day.toISOString().slice(0, 10)}`;
};

/**
 * Where each system-prompt line comes from, so the agent dialog's Briefing can say where to change it (D46): fixed by
 * Atlaswork, the rules for every agent, the agent's own profile, your profile, its permissions, the workspace now, or
 * what it remembers from you (D49).
 */
export type PromptSource = "atlaswork" | "every" | "agent" | "you" | "memory" | "tools" | "workspace";

/** `template` with each `{slot}` replaced by its value; values are inserted as they are, never read as slots. */
const fill = (template: string, values: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (slot, name: string) => name in values ? String(values[name]) : slot);

/** The wording a prompt is built from: what the admin page previews unsaved, the saved values otherwise. */
export type PromptTexts = { rules: Record<GroundRule, string>; templates: Record<LineTemplate, string> };

/** A line of the prompt; `rule`, `template` or `command` names what its wording comes from. */
export type PromptPart = { from: PromptSource; text: string; rule?: GroundRule; template?: LineTemplate; command?: string };

/**
 * The system prompt's lines for `snapshot`, in `texts`' wording (the admin page previews unsaved ones). Every fixed line
 * first, for prefix caching, was tried and dropped (D65): it moved the house rules away from the top, and the date line
 * at the end left "this weekend" undated in 2 of 3 runs.
 */
export function promptParts(snapshot: Snapshot, texts: PromptTexts = { rules: groundRules, templates: lineTemplates }): PromptPart[] {
  const { agent, everyAgent, person, attachedNote, notes, tasks, places, today } = snapshot;
  const { rules, templates } = texts;
  const rule = (from: PromptSource, name: GroundRule): PromptPart => ({ from, text: rules[name], rule: name });
  const line = (from: PromptSource, name: LineTemplate, values: Record<string, string | number> = {}): PromptPart => ({ from, text: fill(templates[name], values), template: name });
  const titles = notes.slice(0, limits.titles).map((note) => fill(templates.noteItem, { title: note.title || "Untitled", place: note.place })).join(", ") || "none";
  const pages = snapshot.pages ?? [];
  const unpaged = places.filter((place) => !pages.some((page) => page.startsWith(`${place}:`) || page.startsWith(`${place}, for “`)));
  // A folded page line (D66) keeps its place and a project's goal, which filing goes by (D61); read_pages has the rest.
  const headOf = (page: string) => {
    const place = places.filter((each) => page.startsWith(`${each}:`) || page.startsWith(`${each}, for “`)).sort((a, b) => b.length - a.length)[0];
    if (!place) return page.split(": ")[0];
    const goalEnd = page.startsWith(`${place}, for “`) ? page.indexOf("”", place.length) : -1;
    return goalEnd < 0 ? place : page.slice(0, goalEnd + 1);
  };
  const parts: (PromptPart | false | undefined | "" | 0)[] = [
    line("agent", "intro", { agent: `${agent.name}${agent.role ? `, ${agent.role}` : ""}` }),
    everyAgent && line("every", "everyAgent", { rules: everyAgent }),
    agent.instructions && line("agent", everyAgent ? "instructionsAfterEvery" : "instructions", { instructions: agent.instructions }),
    person?.name && line("you", "name", { name: person.name }),
    person?.about && line("you", "about", { about: person.about }),
    snapshot.memory?.items.length && line("memory", "memories", {
      memories: snapshot.memory.items.map((item) => fill(templates.memoryItem, { id: item.id, text: item.text, place: item.place || aboutYou })).join("\n") }),
    snapshot.memory?.listening && rule("atlaswork", "remember"),
    line("agent", "tone", { warmth: warmthOf[agent.warmth] ?? agent.warmth, detail: detailOf[agent.detail] ?? agent.detail }),
    line("atlaswork", "today", { today: dayOf(today, 0), week: [1, 2, 3, 4, 5, 6, 7].map((offset) => dayOf(today, offset)).join(", ") }),
    rule("atlaswork", "format"),
    ...snapshot.commands.map((command): PromptPart => ({ from: "tools", text: command.prompt, command: command.name })),
    snapshot.commands.length > 0 && rule("atlaswork", "oneProposal"),
    rule("atlaswork", snapshot.commands.length ? "proposeOnly" : "readOnly"),
    rule("atlaswork", "lookUp"),
    // Page lines start with their place (D65), so a place with one isn't listed again.
    !places.length ? line("workspace", "noPlaces") : !pages.length ? line("workspace", "places", { places: places.join("; ") }) : false,
    pages.length && (foldsPages(snapshot) ? line("workspace", "pageHeads", { pages: pages.map(headOf).join("\n") }) : line("workspace", "pages", { pages: pages.join("\n") })),
    pages.length && unpaged.length && line("workspace", "otherPlaces", { places: unpaged.join("; ") }),
    snapshot.crew?.length && line("workspace", "crew", { crew: snapshot.crew.join("; ") }),
    snapshot.people?.length && line("workspace", "people", {
      people: snapshot.people.map((person) => fill(templates.personItem, { name: person.name, about: person.about || "nothing noted yet" })).join("\n") }),
    !snapshot.tools.includes("read_notes") ? rule("tools", "noNotes")
      : notes.length > limits.titles ? line("workspace", "notesAndOlder", { notes: titles, older: notes.length - limits.titles }) : line("workspace", "notes", { notes: titles }),
    !snapshot.tools.includes("list_tasks") ? rule("tools", "noTasks") : tasks.length === 1 ? line("workspace", "openTask") : line("workspace", "openTasks", { count: tasks.length }),
    // Folders on a computer (D77) are listed there: on the server they have names but no files yet, and the computer's
    // helper, which keeps their computer so open_file knows where it is (D78), lists them with their files. Since D84
    // they may be on several computers: each one elsewhere is named with its computer, where a file tool takes the reply.
    snapshot.folders?.[0]?.computer && !snapshot.folders.some((folder) => folder.files.length) ? line("workspace", "computerFolders", {
      computer: computersOf(snapshot.folders).length > 1 ? `computers ${joined(computersOf(snapshot.folders))}` : `computer ${snapshot.folders[0].computer.name}`,
      folders: snapshot.folders.map((folder) => computersOf(snapshot.folders!).length > 1
        ? fill(templates.folderOn, { name: folder.name, place: folder.place, computer: folder.computer!.name })
        : fill(templates.computerFolderItem, { name: folder.name, place: folder.place })).join("; ") })
    : snapshot.folders?.length && line("workspace", "folders", {
      folders: snapshot.folders.map((folder) => folder.computer && !folder.files.length && folder.computer.id !== computerOf(snapshot)?.id
        ? fill(templates.folderOn, { name: folder.name, place: folder.place, computer: folder.computer.name })
        : fill(templates.folderItem, { name: folder.name, place: folder.place, count: folder.files.length })).join("; "),
      files: snapshot.folders.flatMap((folder) => folder.files).slice(0, limits.titles).join(", ") }),
    snapshot.images?.length && line("workspace", "images", { images: snapshot.images.slice(0, limits.titles).map((name) => `“${name}”`).join(", ") }),
    // Computers to search (D78, D84): their lists stay there, so only their names are here; one search asks them all.
    snapshot.search && line("workspace", "computerSearch", { computer: snapshot.search.others?.length
      ? `computers ${joined([snapshot.search.name, ...snapshot.search.others])} (one search asks them all)`
      : `computer ${snapshot.search.name}` }),
    // Without tidy_files (D79: off on that computer or for this agent), it says it can't rather than pretend it will.
    snapshot.search && !snapshot.commands.some((command) => command.name === "tidy_files") && line("workspace", "noTidy", { computer: snapshot.search.name }),
    // Asked in that computer's own window (D78): what a reply found there may be shown on its screen.
    showsHere(snapshot) && line("workspace", "showHere", { computer: computerOf(snapshot)!.name }),
    // A new workspace (D35): nothing to look up yet, so the first value is sorting what the person says into tasks.
    !notes.length && !tasks.length && snapshot.commands.some((command) => command.name === "propose_tasks") && rule("atlaswork", "firstTasks"),
    attachedNote && line("workspace", "attached", { title: attachedNote.title || "Untitled", place: attachedNote.place || "no place", body: attachedNote.body }),
  ];
  return parts.filter((part): part is PromptPart => !!part && !!part.text);
}
export const systemPrompt = (snapshot: Snapshot) => promptParts(snapshot).map((part) => part.text).join("\n");
