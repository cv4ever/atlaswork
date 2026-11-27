// Commands about the crew: a new agent drafted (D57), an agent's own house rules and routines (D69), and a question
// for another agent (D50).
import { agentOptions, optionsText } from "../agentDrafts.ts";
import { agentTools, atlasId, defaultDomain, routineKinds } from "../model.ts";
import type { Agent, AgentProposal, Routine, RoutineKind, ToolId } from "../model.ts";
import { longWeekdays, newRoutine, repeatLabel } from "../routines.ts";
import { lower } from "./request.ts";
import type { Source } from "./request.ts";
import { texts, records, pending } from "./define.ts";
import type { CommandDef } from "./define.ts";

/** An agent's house rules and routines, as show_my_setup answers (D69). */
const setupText = (agent: Agent) => `Your house rules: “${agent.instructions || "none yet"}”. Your routines: ${(agent.routines ?? [])
  .map((routine) => `${routineKinds[routine.kind].label}, ${repeatLabel(routine)} at ${routine.time}${routine.paused ? " (paused)" : ""}`).join("; ") || "none"}.`;

/** The days a routine runs on from words: every day, weekdays, or weekday names; undefined when it names none. */
function daysOf(text: string): number[] | undefined {
  const said = lower(text);
  if (/month/.test(said)) return undefined;
  if (/every ?day|daily/.test(said)) return [0, 1, 2, 3, 4, 5, 6];
  if (/weekday/.test(said)) return [1, 2, 3, 4, 5];
  const days = longWeekdays.flatMap((name, index) => said.includes(lower(name).slice(0, 3)) ? [index] : []);
  return days.length ? days : undefined;
}

/**
 * An agent's routines as its draft names them (D69): each keeps the id, set-up day and settings of the agent's
 * routine of that kind it replaces, so receipts and results stay; a new kind starts today with the usual answers.
 */
function routinesFrom(agent: Agent, items: Record<string, string>[]): Routine[] {
  const left = [...agent.routines ?? []];
  const since = new Date().toISOString();
  return items.flatMap(({ kind, days, time }) => {
    if (!Object.hasOwn(routineKinds, kind)) return [];
    const at = left.findIndex((routine) => routine.kind === kind);
    const base = at >= 0 ? left.splice(at, 1)[0] : newRoutine(kind as RoutineKind, since);
    const on = daysOf(days ?? "");
    const clock = time?.trim().match(/^(\d{1,2}):(\d{2})$/);
    return [{ ...base, ...on && { repeat: { every: "week" as const, days: on, weeks: base.repeat.every === "week" ? base.repeat.weeks : 1 } },
      ...clock && Number(clock[1]) < 24 && Number(clock[2]) < 60 && { time: `${clock[1].padStart(2, "0")}:${clock[2]}` } }];
  });
}

/**
 * Who an agent may ask (D50): every other active agent. Atlas sees everything already (D4), so he asks nobody (measured
 * 2026-11-14: he asked Vital what Vital had just said in the same chat). An agent answering a question asks nobody
 * either, so a question never travels further than one hop. With nobody to ask, `ask_agent` has no choices and isn't offered.
 */
export const othersOf = (source: Pick<Source, "agent" | "data" | "asked">): Agent[] => source.asked || source.agent.id === atlasId ? []
  : source.data.agents.filter((agent) => !agent.archived && agent.id !== source.agent.id);

// Atlas drafts an agent from your goal (agents-design D57): a crew agent's new rules, a suggested agent, or a new one.
// Review opens the agent dialog filled in; nothing joins or changes until you Save there.
export const propose_agent: CommandDef = {
  needs: [],
  when: (request) => request.agent.id === atlasId,
  spec: (request) => {
    const { crew, suggestions, faces, quiet } = agentOptions(request.data);
    // Everyday is Atlas's own (D51): a drafted agent looks after another domain, or a new one.
    const domains = request.data.domains.filter((domain) => !domain.archived && domain.name !== defaultDomain.name).map((domain) => domain.name);
    const tools = Object.keys(agentTools);
    return {
      // Gated (D57): offered only after list_agent_options, so the rest of Atlas's turns pay for the lookup and this line alone.
      description: "Propose an agent for a goal the person described: new house rules for an agent in the crew, a suggested agent, or a new one; the person reviews it before anything changes."
        + " Prefer a crew agent whose work it already is (rules that add the goal to theirs), then a suggested agent that fits, then new."
        + " Rules: the work, what a good answer or proposal looks like, and the one line it never crosses."
        + " A daily check-in only when the goal needs the notes read every morning. Tools that start off and proactive only when the goal needs them, with why."
        + " To refine a draft, call it again with all of it. Name quiet agents in archive to offer archiving them.",
      progress: "Drafting an agent",
      prompt: "When the person describes a goal an agent could look after, or asks for a new agent, call list_agent_options, then propose_agent. A request that names no goal (“make me an agent”) is too vague: ask what it should help with and call nothing. Otherwise draft and say what you assumed.",
      after: "list_agent_options",
      args: {
        start: { description: "Who it starts from: a crew agent's or suggested agent's name from list_agent_options, or new.", oneOf: [...crew.map((agent) => agent.name), ...suggestions.map((agent) => agent.name), "new"] },
        name: { description: "A new agent's name, one nobody here goes by. Leave out to keep a crew or suggested agent's.", max: 30, optional: true },
        role: { description: "What they do, a few words (“Homework helper”).", max: 40, optional: true },
        rules: { description: "Their whole house rules, written for the model: 135 to 230 characters, about 25 to 35 words.", min: 135, max: 230 },
        domain: { description: "An existing domain they look after. For a domain that doesn't exist yet, use new_domain instead.", oneOf: domains, show: true, optional: true },
        new_domain: { description: "A new domain to plant with them, when no existing domain is about the goal.", list: { max: 1 }, optional: true, fields: {
          name: { description: "The domain's name." }, emoji: { description: "One emoji.", optional: true }, purpose: { description: "What it's for, one short line.", optional: true } } },
        face: { description: "A free face from list_agent_options.", oneOf: faces, optional: true },
        warmth: { description: "0 crisp to 4 warm.", oneOf: ["0", "1", "2", "3", "4"], show: true, optional: true },
        detail: { description: "0 one line to 3 thorough.", oneOf: ["0", "1", "2", "3"], show: true, optional: true },
        mode: { description: "Asks first (the default), or proactive: changes things itself, with Undo.", oneOf: ["asks first", "proactive"], show: true, optional: true },
        tools_on: { description: "Tools to switch on that start off.", list: { max: tools.length }, oneOf: tools, show: true, optional: true },
        tools_off: { description: "Tools to switch off, named as in tools_on.", list: { max: tools.length }, oneOf: tools, optional: true },
        why: { description: "Why they need tools that start off, or proactive.", max: 200, optional: true },
        check_in: { description: "Daily when the goal needs a new agent to read the notes every morning; otherwise weekly, its weekly improvement alone.", oneOf: ["weekly", "daily"], show: true, optional: true },
        archive: { description: "Quiet agents from list_agent_options to offer to archive.", list: { max: 3 }, oneOf: quiet.map(({ agent }) => agent.name), optional: true },
        test: { description: "One request in the person's words that tests the line the agent never crosses, which they try in the dialog before saving (“Just give me the answers to sheet 4”).", max: 200 },
      },
      lookup: { name: "list_agent_options", description: "List your crew, the suggested agents, free faces and quiet agents. Call it when the person wants an agent for a goal; then propose_agent is offered.",
        progress: "Looking at the crew", result: optionsText(request.data) },
    };
  },
  propose: (request, args, id) => {
    const { crew, suggestions, quiet } = agentOptions(request.data);
    const named = <T extends { name: string }>(list: T[], name: unknown) => typeof name === "string" ? list.find((item) => item.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase()) : undefined;
    const member = named(crew, args.start);
    const suggestion = member ? undefined : named(suggestions, args.start);
    const instructions = typeof args.rules === "string" ? args.rules.trim() : "";
    if (!instructions || !member && !suggestion && args.start !== "new") return undefined;
    const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
    const level = (value: unknown) => typeof value === "string" && /^\d$/.test(value) ? Number(value) : undefined;
    const switched = (value: unknown, on: boolean) => texts(value).filter((tool): tool is ToolId => tool in agentTools).map((tool) => [tool, on]);
    const planted = records(args.new_domain, "name")[0];
    const draft: AgentProposal = {
      ...member ? { agentId: member.id } : suggestion ? { from: suggestion.name } : {},
      ...!member && text(args.name) && { name: text(args.name) }, ...text(args.role) && { role: text(args.role) }, instructions,
      ...text(args.face) && { portrait: text(args.face) }, ...level(args.warmth) !== undefined && { warmth: level(args.warmth) },
      ...level(args.detail) !== undefined && { detail: level(args.detail) }, ...typeof args.mode === "string" && { writeMode: args.mode === "proactive" ? "full" as const : "propose" as const },
      ...[...texts(args.tools_on), ...texts(args.tools_off)].length
        && { tools: Object.fromEntries([...switched(args.tools_on, true), ...switched(args.tools_off, false)]) },
      ...text(args.why) && { why: text(args.why) }, ...text(args.domain) && { domain: text(args.domain) },
      ...planted?.name?.trim() && { newDomain: { name: planted.name.trim(), emoji: planted.emoji?.trim() || "🌱", intention: planted.purpose?.trim() ?? "" } },
      ...!member && { checkIn: args.check_in === "daily" ? "daily" : "weekly" },
      ...texts(args.archive).length && { quiet: texts(args.archive).flatMap((name) => named(quiet.map(({ agent }) => agent), name)?.id ?? []) },
      ...text(args.test) && { test: text(args.test) },
    };
    return { ...pending(id), projectId: "", items: [], agent: draft };
  },
};

// An agent changes how it works (agents-design D69): its own house rules and routines, after you picked one of its
// weekly improvements or asked it to work differently. Review opens its dialog filled in; nothing changes until Save.
export const propose_my_setup: CommandDef = {
  needs: [],
  when: (request) => request.agent.id !== atlasId && !request.routine && !request.asked && !request.form,
  spec: (request) => ({
    // Gated, as propose_agent: offered only after show_my_setup, so other turns pay for the lookup's line alone.
    description: "Propose changes to how you work: your whole house rules rewritten, all your routines as they should be, or both. The person reviews them in your settings before anything changes.",
    progress: "Drafting changes to how I work",
    prompt: "When the person picks one of your suggestions about your own rules or routines, or asks you to work differently, call show_my_setup, then propose_my_setup.",
    after: "show_my_setup",
    args: {
      rules: { description: "Your whole house rules as they should be, written for the model: 135 to 230 characters. Leave out to keep yours.", min: 135, max: 230, optional: true },
      routines: { description: "All your routines as they should be, the ones you keep included. Leave out to keep yours.", list: { max: 4 }, optional: true, fields: {
        kind: { description: "What it does.", oneOf: Object.keys(routineKinds), show: true },
        days: { description: "Every day, weekdays, or the weekdays it runs on (Monday, Thursday)." },
        time: { description: "When, HH:MM on a 24-hour clock.", optional: true } } },
      why: { description: "What you change and why, in one sentence.", max: 200 },
    },
    lookup: { name: "show_my_setup", description: "Show your house rules and routines. Call it before you propose changes to how you work; then propose_my_setup is offered.",
      progress: "Looking at how I work", result: setupText(request.agent) },
  }),
  propose: (request, args, id) => {
    const instructions = typeof args.rules === "string" ? args.rules.trim() : "";
    const routines = args.routines === undefined ? undefined : routinesFrom(request.agent, records(args.routines, "kind"));
    if (!instructions && !routines) return undefined;
    const why = typeof args.why === "string" ? args.why.trim() : "";
    return { ...pending(id), projectId: "", items: [], agent: { agentId: request.agent.id, ...instructions && { instructions }, ...routines && { routines }, ...why && { why } } };
  },
};
export const ask_agent: CommandDef = {
  needs: ["ask-agents"],
  spec: (request) => ({
    // Kept whole: trimmed to its first sentence, Ledger stopped asking Vital in 3 of 3 (2026-11-18).
    description: "Ask another agent one question for the person, when the answer is in their places. The person approves before it's sent, and that agent answers them here.",
    progress: "Writing a question",
    // Measured 2026-11-14 on the ChatGPT plan: the first wording let Ledger say it couldn't find the dentist date
    // (Vital's) instead of asking, and Atlas ask Vital what Vital had just said in the same chat.
    // The second wording said when to promise a follow-up; models then promised one without filling then (3 of 9).
    // "By domain" and "also when your own lookup found nothing" (2026-11-18): Ledger read its notes, found nothing and
    // said so instead of asking Vital in 7 of 8 runs; the lookUp rule's "if nothing matches, say so" won.
    prompt: "Your notes and tasks cover only your places. When the person asks about something that belongs in another agent's places (the other agents here say where each looks, by domain: a doctor's visit is Health's, a cousin's wedding Family's), call ask_agent with one short question that stands on its own instead of saying you can't find it, also when your own lookup found nothing, and say whom you're asking; never guess their answer. Once the person approves, that agent answers them here directly. Fill then only when finishing the job needs your own places too; you follow up only then, so without it never say you'll follow up or report back. Never ask about what this conversation already says, or what you can see or look up yourself.",
    args: {
      to: { description: "The agent to ask.", oneOf: othersOf(request).map((agent) => agent.name), show: true },
      question: { description: "The question, with what they need to know to answer it.", max: 500 },
      then: { description: "Only when you need their answer to finish with your own places: what you'll do with it, e.g. “check it against the budget”. Leave out when their answer is enough.", max: 200, optional: true },
    },
  }),
  ask: (request, args) => {
    const name = typeof args.to === "string" ? args.to.trim().toLocaleLowerCase() : "";
    const to = othersOf(request).find((agent) => agent.name.toLocaleLowerCase() === name);
    const question = typeof args.question === "string" ? args.question.trim().slice(0, 500) : "";
    const then = typeof args.then === "string" ? args.then.trim().slice(0, 200) : "";
    return to && question ? { to: to.id, question, ...then ? { then } : {} } : undefined;
  },
};
