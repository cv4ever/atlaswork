// What the admin page's Agents and Tools sections draw, built by the functions a live reply uses, so nothing here can
// drift from what the model is told: the catalogue (Atlas, every suggestion, the steward for a domain you name), and
// for any of them with unsaved changes, the agent a workspace would hold and its exact system prompt (`snapshotOf`,
// `promptParts`, `toolsFor`). Every workspace is built in memory; nothing reads or writes this browser's own. It also
// builds the request a "Try it" message sends, and finds the model comparison's cases (dev/compare/cases.ts) per agent.
import { cases } from "../compare/cases.ts";
import { gatesOf, groundRules, lineTemplates, promptParts, toolProgress, toolsFor, toolTexts } from "../../supabase/functions/agent/logic.ts";
import type { Folder, GroundRule, LineTemplate, PromptPart, Snapshot } from "../../supabase/functions/agent/logic.ts";
import { snapshotOf } from "../../src/agentRequest.ts";
import { agentWorkspace } from "../../src/agentWorkspace.ts";
import { seedWorkspace } from "../../src/demo.ts";
import { agentTools, atlasAgent, atlasId } from "../../src/model.ts";
import type { Agent, CalendarLevel, ToolId, WorkspaceData } from "../../src/model.ts";
import { applyOnboarding, suggestedDomains } from "../../src/onboarding.ts";
import * as routines from "../../src/routines.ts";
import { starterWorkspace } from "../../src/starter.ts";
import { stewardForOwn, suggestedAgents } from "../../src/suggestedAgents.ts";
import type { AgentSuggestion } from "../../src/suggestedAgents.ts";
import { normalize } from "../../src/workspace.ts";

/** What the admin page edits; the rest of a suggestion (name, face, domain, check-in day) is fixed here. */
export type Draft = Pick<AgentSuggestion, "role" | "instructions" | "writeMode" | "warmth" | "why" | "says">;
export type Entry = {
  /** The agent's name, or "own" for the steward of a domain you name. */
  key: string;
  kind: "atlas" | "suggested" | "template";
  suggestion: AgentSuggestion;
};
/** The domain a person names in the template's preview. */
const ownDomain = { name: "Allotment", emoji: "🥕", hue: "", intention: "Growing vegetables on the plot behind the house" };

/** Atlas isn't offered on a card, so he has no hook or line of his own; his role, house rules, write mode and tone are edited like anyone's. */
const atlasEntry: Entry = { key: "Atlas", kind: "atlas", suggestion: { ...atlasAgent, why: "", says: "" } };
const template: Entry = { key: "own", kind: "template", suggestion: stewardForOwn(ownDomain, 0) };

/** The catalogue in the order onboarding offers it: Atlas, each suggested domain's agents, general ones, work ones, then the template. */
export function catalogue(): { title: string; entries: Entry[] }[] {
  const entry = (suggestion: AgentSuggestion): Entry => ({ key: suggestion.name, kind: "suggested", suggestion });
  const domains = suggestedDomains.map((domain) => ({ title: `${domain.emoji} ${domain.name}`, entries: suggestedAgents.filter((agent) => agent.domain === domain.name).map(entry) }));
  return [
    { title: "Lead", entries: [atlasEntry] },
    ...domains.filter((group) => group.entries.length),
    { title: "For everything", entries: suggestedAgents.filter((agent) => !agent.domain && !agent.work).map(entry) },
    { title: "For work", entries: suggestedAgents.filter((agent) => agent.work).map(entry) },
    { title: "For a domain you name", entries: [template] },
  ];
}

export const draftOf = ({ suggestion }: Entry): Draft => {
  const { role, instructions, writeMode, warmth, why, says } = suggestion;
  return { role, instructions, writeMode, warmth, why, says };
};
const draftKeys = ["role", "instructions", "writeMode", "warmth", "why", "says"] as const;
export const sameDraft = (a: Draft, b: Draft) => draftKeys.every((key) => a[key] === b[key]);

/** The workspace an agent is previewed in: the demo, or what a new person has once onboarding added them. */
export type Seed = "demo" | "new";
/** This computer's date, or `?today=YYYY-MM-DD` as the app takes it. */
export const today = new URLSearchParams(location.search).get("today")
  ?? new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

/**
 * The agent as `seed` would hold it with `draft` applied, and that workspace. The demo cast keeps its own places and
 * routines; anyone else joins the way onboarding adds them (steward of their domain when it has none, else on the bench).
 */
export function placed(entry: Entry, draft: Draft, seed: Seed): { agent: Agent; data: WorkspaceData } {
  const base = normalize(seed === "demo" ? seedWorkspace() : starterWorkspace()).data;
  if (entry.kind === "atlas") {
    const agents = base.agents.map((agent) => agent.id === atlasId
      ? { ...agent, role: draft.role, instructions: draft.instructions, writeMode: draft.writeMode, warmth: draft.warmth } : agent);
    return { agent: agents.find((agent) => agent.id === atlasId)!, data: { ...base, agents } };
  }
  const { role, instructions, writeMode, warmth } = draft;
  const held = base.agents.find((agent) => !agent.archived && agent.name === entry.suggestion.name);
  if (held) {
    const agent = { ...held, role, instructions, writeMode, warmth };
    return { agent, data: { ...base, agents: base.agents.map((item) => item.id === held.id ? agent : item) } };
  }
  const own = entry.kind === "template" ? [ownDomain] : [];
  const data = applyOnboarding(base, { domains: entry.suggestion.domain ? [entry.suggestion.domain] : [], own, agents: [{ ...entry.suggestion, ...draft }], shared: [] }, today).data;
  return { agent: data.agents.find((agent) => agent.name === entry.suggestion.name)!, data };
}

export type Briefing = { parts: PromptPart[]; text: string; snapshot: Snapshot; tools: { name: string; label: string; description: string; parameters: unknown; chars: number; later: boolean }[];
  routines: { id: string; label: string; when: string; ask: string | null }[] };
type ToolDef = { function: { name: string; description: string; parameters: unknown } };

/**
 * The person the preview talks to: what each person fills in themselves (their name and line about themselves, their
 * rules for every agent, what agents remember about them, one per line), so the lines they add can be seen and tried.
 */
export type Sample = { name: string; about: string; everyAgent: string; memories: string };
export const noSample: Sample = { name: "", about: "", everyAgent: "", memories: "" };
/**
 * Unsaved wording, by name: ground rules, line templates, tool descriptions (built-in or a command's) and command
 * prompt lines. One draft for every agent, as the source has.
 */
export type Wording = { rules: Partial<Record<GroundRule, string>>; templates: Partial<Record<LineTemplate, string>>; tools: Record<string, string>; commands: Record<string, string> };
export const noWording: Wording = { rules: {}, templates: {}, tools: {}, commands: {} };
export const wordingCount = (wording: Wording) => Object.keys(wording.rules).length + Object.keys(wording.templates).length + Object.keys(wording.tools).length + Object.keys(wording.commands).length;

/** `data` as the sample person has it: their rules for every agent, and memories about them, which every agent reads. */
function withSample(data: WorkspaceData, sample: Sample): WorkspaceData {
  const memories = sample.memories.split("\n").map((line) => line.trim()).filter(Boolean)
    .map((text, index) => ({ id: `sample-${index}`, domain: "", projectId: "", text, quote: text, agentId: "", at: "2026-01-01T00:00:00.000Z" }));
  return { ...data, ...sample.everyAgent.trim() && { everyAgent: { ...data.everyAgent, rules: sample.everyAgent.trim() } }, memories: [...data.memories, ...memories] };
}

/** The request `agent` sends for `message`, with the sample person and the unsaved commands' prompt lines and descriptions applied. */
function snapshotFor(agent: Agent, data: WorkspaceData, sample: Sample, wording: Wording, message: string, folders: Folder[] = []): Snapshot {
  const request = { agent, data: withSample(data, sample), person: { name: sample.name, about: sample.about }, request: message };
  const snapshot = snapshotOf(request, today, agentWorkspace(request), folders);
  return { ...snapshot, commands: snapshot.commands.map((command) => ({ ...command,
    ...wording.commands[command.name] !== undefined && { prompt: wording.commands[command.name] },
    ...wording.tools[command.name] !== undefined && { description: wording.tools[command.name] } })) };
}

/** What `agent` reads in `data` before the sample person's message: the system prompt in parts, its tools and its routines' requests. */
export function briefingOf(agent: Agent, data: WorkspaceData, { sample = noSample, wording = noWording, folders = [] }: { sample?: Sample; wording?: Wording; folders?: Folder[] } = {}): Briefing {
  const snapshot = snapshotFor(agent, data, sample, wording, "", folders);
  const parts = promptParts(snapshot, { rules: { ...groundRules, ...wording.rules }, templates: { ...lineTemplates, ...wording.templates } });
  return {
    parts, snapshot, text: parts.map((part) => part.text).join("\n"),
    tools: (toolsFor(snapshot, wording.tools) as ToolDef[]).map((def) => ({ ...def.function, label: toolProgress(snapshot, def.function.name) ?? def.function.name, chars: JSON.stringify(def).length,
      later: gatesOf(snapshot).has(def.function.name) })),
    routines: routines.routinesOf(data).filter(({ owner }) => routines.runnerOf(data, owner).id === agent.id).map((each) => ({
      id: each.routine.id, label: routines.ownerLabel(data, each.owner),
      when: each.routine.paused ? "Paused" : `${routines.repeatLabel(each.routine)}, ${routines.timeLabel(each.routine.time)}`,
      ask: routines.routineRequest(data, each),
    })),
  };
}

/**
 * About how many tokens a reply's first call sends: the system prompt and the tools offered on it, at four characters a
 * token, the rough rate for English. A command with `after` (D57) joins only once its read tool ran, so it's counted
 * apart as `later`. The provider's count differs a little; the comparison between two drafts holds.
 */
export const tokensOf = (chars: number) => Math.round(chars / 4);
export function budgetOf(briefing: Briefing) {
  const prompt = briefing.text.length, tools = briefing.tools.filter((tool) => !tool.later).reduce((sum, tool) => sum + tool.chars, 0);
  const later = briefing.tools.filter((tool) => tool.later).reduce((sum, tool) => sum + tool.chars, 0);
  return { prompt: tokensOf(prompt), tools: tokensOf(tools), later: tokensOf(later), total: tokensOf(prompt + tools) };
}

/** A linked folder for the Tools section, so the file tools show: they're offered only when a folder is linked (D47). */
const folder: Folder = { place: "Health", name: "health-records", files: ["blood-test-2026.pdf", "sleep-log.md"] };

/**
 * Each permission and the model tools only it gives, measured: Vital in the demo with every permission on, then with
 * each one off (some tools need two, as add_to_calendar needs See tasks). Google Calendar isn't a switch but a rung
 * per agent (D83), measured the same way: Events + Add, then off. Atlas lists every tool with its spec, and the prompt
 * line his commands add.
 */
export function permissionTools() {
  const entry: Entry = { key: "Vital", kind: "suggested", suggestion: suggestedAgents.find((agent) => agent.name === "Vital")! };
  const { agent: vital, data } = placed(entry, draftOf(entry), "demo");
  const ids = Object.keys(agentTools) as ToolId[];
  const every = Object.fromEntries(ids.map((id) => [id, true]));
  const calendar = (level: CalendarLevel) => ({ calendar: { level, away: true } });
  const namesWith = (tools: Partial<Record<ToolId, boolean>>, access: Agent["access"] = calendar("add")) =>
    new Set(briefingOf({ ...vital, tools, access }, data, { folders: tools["read-files"] ? [folder] : [] }).tools.map((tool) => tool.name));
  const full = namesWith(every);
  const offCalendar = namesWith(every, calendar("off"));
  const atlas = data.agents.find((agent) => agent.id === atlasId)!;
  const all = briefingOf(atlas, data, { folders: [folder] });
  return {
    permissions: [
      ...ids.map((id) => {
        const without = namesWith({ ...every, [id]: false });
        return { id, ...agentTools[id], gives: [...full].filter((name) => !without.has(name)) };
      }),
      { id: "access.calendar", label: "Google Calendar", outside: true, gives: [...full].filter((name) => !offCalendar.has(name)),
        hint: "A rung per agent in Settings → Connections (D83): Free time gives free_time, Events adds read_calendar, Events + Add adds add_to_calendar. Atlas starts at Events + Add." },
    ],
    tools: all.tools.map((tool) => ({ ...tool, prompt: all.snapshot.commands.find((command) => command.name === tool.name)?.prompt })),
  };
}

/**
 * The request a reply sends for `message` from the sample person, with `draft` applied in `seed` and the unsaved
 * command prompt lines: what Try it sends the dev bridge. Unsaved ground rules can't go with it: the bridge builds the
 * prompt from logic.ts as saved.
 */
export function requestFor(entry: Entry, draft: Draft, seed: Seed, sample: Sample, wording: Wording, message: string): Snapshot {
  const { agent, data } = placed(entry, draft, seed);
  return snapshotFor(agent, data, sample, wording, message);
}

/**
 * The saved wording of everything `Wording` can draft: ground rules, line templates, and each command's prompt line
 * and description as Atlas (who has every command) is offered them in the demo, with the built-in tools' descriptions.
 */
export function savedWording(): Wording {
  const data = normalize(seedWorkspace()).data;
  const { commands } = briefingOf(data.agents.find((agent) => agent.id === atlasId)!, data, { folders: [folder] }).snapshot;
  return { rules: groundRules, templates: lineTemplates, commands: Object.fromEntries(commands.map((command) => [command.name, command.prompt])),
    tools: { ...toolTexts, ...Object.fromEntries(commands.map((command) => [command.name, command.description])) } };
}

/**
 * The comparison's cases that run `entry`'s agent, numbered from 1 as `--cases=` takes them: by the demo agent's id,
 * the suggestion it adds, or the routine's runner in the demo. The template has none: its rules are written per domain.
 */
export function casesFor(entry: Entry) {
  if (entry.kind === "template") return [];
  const demo = normalize(seedWorkspace()).data;
  const nameOf = (id: string) => demo.agents.find((agent) => agent.id === id)?.name;
  return cases.map((item, index) => ({ number: index + 1, item }))
    .filter(({ item }) => (item.suggested ?? (item.routine ? routines.runnerOf(demo, item.routine.owner).name : nameOf(item.agent))) === entry.suggestion.name);
}
