// Commands that fill the dialog a request came from (D63): every field optional, so the agent changes only what the
// person asked and keeps the rest.
import { limits } from "../../supabase/functions/agent/logic.ts";
import { domainHues, routineKinds } from "../model.ts";
import { projectColours } from "../look.ts";
import { domainFields, projectFields } from "../formFill.ts";
import type { DomainFill, ProjectFill } from "../formFill.ts";
import { agentFrom } from "../workspace.ts";
import { records, textOf, filled, isDay, routinesOf } from "./define.ts";
import type { CommandDef } from "./define.ts";
import { hireableFor, leadsLine, liveDomains, crewOf, named, lower, hireLine } from "./request.ts";

// A dialog's fill (D63): every field optional, so the agent changes only what the person asked and keeps the rest.
const fillPrompt = (name: string) => `The person has a form open and told you what they want in it. Call ${name} once and never ask a question: where they didn't say, choose what fits and list each choice in assumed, in a few words (“done by 20 December”) with the field it went into; when they said little, most of the form is your choice, so name the main ones. What stays as the form has it is no assumption: leave it out of the call too. Then say in one short line what you filled in.`;
const routinesArg = { description: "Routines to add: check-in (turns new things in notes into tasks), report (says what's open each week), review (moves overdue tasks, files loose ones, archives quiet projects), improve (suggests up to three changes each week).",
  list: { max: 3 }, oneOf: Object.keys(routineKinds), show: true, optional: true };
const assumedArg = (fields: readonly string[]) => ({ description: "What you chose that they didn't say.", list: { max: 4 }, optional: true,
  fields: { what: { description: "The choice, a few words." }, field: { description: "The field it went into.", oneOf: [...fields], optional: true } } });
const assumptionsOf = <F extends string>(value: unknown, fields: readonly F[]) => records(value, "what").flatMap(({ what, field }) => what?.trim()
  ? [{ what: what.trim().slice(0, 120), ...fields.includes(field as F) && { field: field as F } }] : []).slice(0, 4);

// Describe it (agents-design D63): the project and domain dialogs ask an agent to fill them from your words. Nothing
// is saved; the dialog shows the fill and you save it there.
export const fill_project: CommandDef = {
  needs: [],
  when: (request) => request.form?.kind === "project",
  spec: (request) => {
    const hireable = hireableFor(request, "lead");
    return {
      description: "Fill in the project form the person has open from what they said: name, goal, domain, finish date, who leads it, steps and routines. Nothing is saved; they review the form and save it."
        + leadsLine(request) + " Or nobody.",
      progress: "Filling in the form",
      // Measured 2026-11-18 on Workers AI: without the date line it kept the form's default a month out for "the 15th of March" and "12 de dezembro".
      // The lead line (2026-11-20): with the crew's names but not their roles, Atlas kept the form's lead for a habit app 6 of 6 times though Forge was in the crew.
      prompt: fillPrompt("fill_project") + " A day they name, in any language (“the 15th of March”, “le 3 mai”, “by Christmas”), is the finish date, the next one to come: the form's date is only a default. Steps: concrete next actions in order, not everything the project will ever need; when it has a finish date, the step that finishes it is due on it."
        + " Lead: whoever does this kind of work, a crew member whose role fits, else a suggested agent who does (an app: a builder), even if the form already has a lead.",
      args: {
        title: { description: "The project's name, a few words.", max: 60, optional: true },
        goal: { description: "What it's for and what done looks like, one or two sentences.", max: 160, optional: true },
        domain: { description: "The domain it belongs in.", oneOf: liveDomains(request), show: true, optional: true },
        finish: { description: "Done by, YYYY-MM-DD: a day they named, else the form's; none for no finish date.", max: 10, optional: true },
        color: { description: "Its colour.", oneOf: [...projectColours], show: true, optional: true },
        lead: { description: hireable.length ? "Who leads it: someone in the crew, a suggested agent to bring in by name, or nobody." : "Who leads it, or nobody.",
          oneOf: [...crewOf(request).map((agent) => agent.name), ...hireable.map((agent) => agent.name), "nobody"], show: true, optional: true },
        steps: { description: request.form?.editing ? "New steps to add, in order." : "Its first steps, in order.", list: { max: 8 }, optional: true,
          fields: { title: { description: "Short task title." }, due: { description: "Due date, YYYY-MM-DD.", date: true, optional: true } } },
        routines: routinesArg,
        assumed: assumedArg(projectFields),
      },
    };
  },
  fill: (request, args) => {
    const suggestion = named(hireableFor(request, "lead"), args.lead);
    // A suggested agent brought in to lead (D63) joins the crew when the project is saved, not before.
    const hire = suggestion && agentFrom(request.data, suggestion);
    const lead = hire ? hire.id : typeof args.lead !== "string" ? undefined : lower(args.lead) === "nobody" ? null : named(crewOf(request), args.lead)?.id;
    const area = named(request.data.domains.filter((domain) => !domain.archived), args.domain)?.name;
    const color = projectColours.find((item) => item === args.color);
    const title = textOf(args.title, 60), description = textOf(args.goal, 160);
    return filled<ProjectFill>({ kind: "project", ...title && { title }, ...description && { description }, ...area && { area },
      ...args.finish === "none" ? { finish: "" } : isDay(args.finish) ? { finish: args.finish } : {}, ...color && { color }, ...lead !== undefined && { agentId: lead },
      ...hire && { hire },
      steps: records(args.steps, "title").flatMap(({ title: step, due }) => step?.trim() ? [{ title: step.trim().slice(0, limits.title), due: isDay(due) ? due : "" }] : []).slice(0, 8),
      routines: routinesOf(args.routines), assumed: assumptionsOf(args.assumed, projectFields) });
  },
};
export const fill_domain: CommandDef = {
  needs: [],
  when: (request) => request.form?.kind === "domain",
  spec: (request) => {
    const editing = !!request.form?.editing;
    const hireable = hireableFor(request);
    return {
      description: "Fill in the domain form the person has open from what they said: the area of their life, its emoji, what it's for, its colour, who looks after it and its routines. Nothing is saved; they review the form and save it."
        + (hireable.length ? ` Suggested agents a new domain can hire by name: ${hireable.map(hireLine).join("; ")}.` : ""),
      progress: "Filling in the form",
      prompt: fillPrompt("fill_domain") + " A domain is an ongoing area of life (Health, Family, Work), never a project with an end; name it in one or two words. What they ask it to cover goes into purpose, named as they named it."
        + (editing ? "" : " Always choose who looks after a new domain: the crew member or suggested agent whose work fits what they described, else new, worded for it."),
      args: {
        name: { description: "The domain's name, one or two words.", max: 40, optional: true },
        emoji: { description: "One emoji.", max: 8, optional: true },
        purpose: { description: "When it's well tended, one short line.", max: 120, optional: true },
        // Ten hues pass `limits.choices`, so the schema has no enum: the names go in the words (a guessed "Blue" seen 2026-11-18).
        colour: { description: `Its colour: one of ${Object.keys(domainHues).join(", ")}.`, oneOf: Object.keys(domainHues), show: true, optional: true },
        looked_after_by: { description: editing ? "Who looks after it." : "Who looks after it: someone in the crew, Atlas, a suggested agent to hire by name, or new for an agent of its own worded for it.",
          oneOf: [...crewOf(request).map((agent) => agent.name), ...hireable.map((agent) => agent.name), ...editing ? [] : ["new"]], show: true, optional: true },
        // A new agent worded for the domain (D63), as propose_agent words one (D57): a role and house rules.
        ...!editing && {
          agent_role: { description: "With new: what they do, a few words (“Piano practice coach”).", max: 40, optional: true },
          agent_rules: { description: "With new: their house rules, imperative like the crew's (“Turn practice notes into one short exercise a day… Never…”): the work, what a good answer looks like, and the one line they never cross; 25 to 40 words.", max: 260, optional: true },
        },
        routines: routinesArg,
        assumed: assumedArg(domainFields),
      },
    };
  },
  fill: (request, args) => {
    const editing = !!request.form?.editing;
    const hire = named(hireableFor(request), args.looked_after_by);
    const by = typeof args.looked_after_by !== "string" ? undefined : hire ? "new"
      : lower(args.looked_after_by) === "new" && !editing ? "new" : named(crewOf(request), args.looked_after_by)?.id;
    const colour = Object.entries(domainHues).find(([name]) => typeof args.colour === "string" && lower(name) === lower(args.colour));
    const name = textOf(args.name, 40), emoji = textOf(args.emoji, 8), intention = textOf(args.purpose, 120);
    // A suggested agent comes with its own role and rules; only a new one of its own is worded by the fill.
    const worded = by === "new" && !hire;
    const role = worded ? textOf(args.agent_role, 40) : undefined, instructions = worded ? textOf(args.agent_rules, 260) : undefined;
    return filled<DomainFill>({ kind: "domain", ...name && { name }, ...emoji && { emoji }, ...intention && { intention },
      ...colour && { hue: colour[1] }, ...by && { steward: by },
      ...(hire || role || instructions) && { keeper: { ...hire && { start: hire.name }, ...role && { role }, ...instructions && { instructions } } },
      routines: routinesOf(args.routines), assumed: assumptionsOf(args.assumed, domainFields) });
  },
};
