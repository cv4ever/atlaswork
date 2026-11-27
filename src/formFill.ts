// Describe it and an agent fills the form (agents-design D63): what the project and domain dialogs ask an agent when
// you tell it what you want, how its fill lands in the form, which fields it changed and how Undo takes them back. A
// project an agent proposes in chat opens the same dialog to review (`reviewForm`), and Start there applies the
// proposal as you left it (`amendedProposal`). Nothing is saved here: the dialog's Start, Plant or Save makes it.
import { atlasId, routineKinds } from "./model.ts";
import type { Agent, Proposal, Routine, RoutineKind, Task, WorkspaceData } from "./model.ts";
import type { ProjectColour } from "./look.ts";
import { newRoutine } from "./routines.ts";
import { stepDue } from "./starterProjects.ts";
import { withFinish } from "./workspace.ts";
import type { DraftOf, KeeperOptions } from "./workspace.ts";

/** Which dialog asks: `editing` when it opened on a record that exists. */
export type FormKind = { kind: "project" | "domain"; editing: boolean };
/** A first step the project starts with; `due` "" lands it on the next days at Save (`addSteps`). */
export type Step = { title: string; due: string };
/** The fields a fill may change, as the dialogs name them; an assumption points at one so its chip opens. */
export const projectFields = ["title", "goal", "domain", "finish", "lead", "colour", "steps", "routines"] as const;
export const domainFields = ["name", "emoji", "purpose", "colour", "keeper", "routines"] as const;
export type ProjectField = (typeof projectFields)[number];
export type DomainField = (typeof domainFields)[number];
/** Something the agent chose that you didn't say ("done by 14 March"), and the field it went into. */
export type Assumption<F extends string = string> = { what: string; field?: F };
/**
 * What an agent filled in a project form. Absent fields stay as the form has them; `agentId` null is nobody in
 * particular, `finish` "" no date. `hire`: a suggested agent brought in to lead (its id is `agentId`), who joins the
 * crew when the project is saved.
 */
export type ProjectFill = {
  kind: "project"; title?: string; description?: string; area?: string; finish?: string; color?: ProjectColour; agentId?: string | null; hire?: Agent;
  steps: Step[]; routines: RoutineKind[]; assumed: Assumption<ProjectField>[];
};
/**
 * What Atlas filled in a domain form. `steward`: an agent's id (Atlas's for himself), or "new" for a new agent of its
 * own: `keeper.start` names the suggested agent to hire (Tutor), else `keeper` words one for the domain.
 */
export type DomainFill = {
  kind: "domain"; name?: string; emoji?: string; intention?: string; hue?: string; steward?: string; keeper?: { start?: string; role?: string; instructions?: string };
  routines: RoutineKind[]; assumed: Assumption<DomainField>[];
};
export type Fill = ProjectFill | DomainFill;
/** The fields the last fill changed, for the dialog to light up; `at` tells one fill from the next. */
export type Filled = { at: number; fields: string[] };
/** A project proposal under review in the dialog (D63): its chat and its id. */
export type ReviewMark = { thread: string; proposal: string };

/** The project dialog's state as a fill reads and writes it (`ProjectForm` in ui.ts, kept apart so the server-side routines function never reaches the UI's types). */
type ProjectFormLike = DraftOf<"project"> & { starter?: { tasks: string[] }; steps?: Step[]; filled?: Filled; review?: ReviewMark };
type DomainFormLike = DraftOf<"domain"> & { filled?: Filled };

const kinds = (list: { kind: RoutineKind }[] = []) => list.map((routine) => routineKinds[routine.kind].label.toLocaleLowerCase()).join(", ") || "none";
const agentName = (data: WorkspaceData, id?: string) => (id && data.agents.find((agent) => agent.id === id)?.name) || undefined;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The request for a project form: the person's words, then the form as it stands, so a fill changes only what they asked. */
export function projectRequest(form: ProjectFormLike, finish: string, data: WorkspaceData, words: string) {
  const { project } = form;
  const steps = form.steps?.map((step) => step.title) ?? (form.original ? [] : form.starter?.tasks ?? []);
  const now = [`Title: ${project.title.trim() || "(empty)"}`, `Goal: ${project.description.trim() || "(empty)"}`, `Domain: ${project.area}`,
    `Done by: ${finish || "no date"}`, `Leads it: ${form.hire && form.hire.id === project.agentId ? `${form.hire.name}, new` : agentName(data, project.agentId) ?? "nobody in particular"}`, `Routines: ${kinds(project.routines)}`,
    ...steps.length ? [`${form.original ? "Steps to add" : "First steps"}: ${steps.join("; ")}`] : []];
  return `${form.original ? `I'm editing my project “${form.original.title}”` : "I'm starting a new project"} in the form on screen. In my words: “${words.trim()}”\nThe form now: ${now.join(". ")}.\nFill it in with fill_project.`;
}

/** The request for a domain form, as `projectRequest`. */
export function domainRequest(form: DraftOf<"domain">, data: WorkspaceData, words: string) {
  const { domain } = form;
  // A keeper nobody chose yet is the dialog's default: say so, so the fill picks one whose work fits instead of keeping it.
  const steward = !form.keeper ? agentName(data, domain.agentId) ?? "Atlas" : form.keeper.start ? `${form.keeper.start}, a new agent`
    : form.keeper.role ? `a new ${form.keeper.role}` : "nobody chosen yet (a general keeper of its own unless you pick)";
  const now = [`Name: ${domain.name.trim() || "(empty)"}`, `Emoji: ${domain.emoji}`, `What it's for: ${domain.intention.trim() || "(empty)"}`,
    `Looked after by: ${steward}`, `Routines: ${kinds(domain.routines)}`];
  return `${form.original ? `I'm editing my domain ${form.original.name}` : "I'm planting a new domain"} in the form on screen. In my words: “${words.trim()}”\nThe form now: ${now.join(". ")}.\nFill it in with fill_domain.`;
}

/** Routines of the kinds a fill asks for that the record doesn't run yet, each with its kind's usual time. */
const withRoutines = (record: { routines?: Routine[] }, wanted: RoutineKind[], since: string) => {
  const have = new Set(record.routines?.map((routine) => routine.kind));
  const added = [...new Set(wanted)].filter((kind) => !have.has(kind)).map((kind) => newRoutine(kind, since));
  return added.length ? { routines: [...record.routines ?? [], ...added] } : {};
};

/** Which of a project form's fields differ between two of its states, by the names the dialog and fills use. */
function projectChanges(before: ProjectFormLike, after: ProjectFormLike): ProjectField[] {
  const a = before.project, b = after.project;
  const pairs: [ProjectField, unknown, unknown][] = [["title", a.title, b.title], ["goal", a.description, b.description], ["domain", a.area, b.area],
    ["finish", before.finish?.date, after.finish?.date], ["lead", a.agentId, b.agentId], ["colour", a.color, b.color],
    ["steps", before.steps, after.steps], ["routines", a.routines, b.routines]];
  return pairs.filter(([, from, to]) => !same(from, to)).map(([field]) => field);
}

/**
 * The project form with the fill in it, marking what changed; its steps replace any the form had (a starter's too). A
 * lead brought in waits on the form (`hire`) until Save; a chat proposal under review keeps its own crew.
 */
export function filledProject<T extends ProjectFormLike>(form: T, fill: ProjectFill, today: string, since: string, at = Date.now()): T {
  const { project } = form;
  const hire = form.review ? undefined : fill.hire;
  const agentId = fill.hire && !hire ? undefined : fill.agentId;
  const next: T = {
    ...form,
    project: { ...project, ...fill.title ? { title: fill.title } : {}, ...fill.description ? { description: fill.description } : {},
      ...fill.area ? { area: fill.area } : {}, ...fill.color ? { color: fill.color } : {},
      ...agentId !== undefined ? { agentId: agentId ?? undefined } : {}, ...withRoutines(project, fill.routines, since) },
    ...fill.finish !== undefined ? { finish: { date: fill.finish, today } } : {},
    ...fill.steps.length ? { steps: fill.steps } : {},
    ...hire ? { hire } : agentId !== undefined ? { hire: undefined } : {},
  };
  return { ...next, filled: { at, fields: projectChanges(form, next) } };
}

/**
 * The domain form with the fill in it, marking what changed. A new domain's "new" steward hires one of its own
 * (`keeperFor` with `fresh`, worded by the fill's role and rules); naming an agent puts them on it instead. An
 * existing domain only changes hands among the crew.
 */
export function filledDomain<T extends DomainFormLike>(form: T, fill: DomainFill, since: string, at = Date.now()): T {
  const { domain } = form;
  const look = { ...domain, ...fill.name ? { name: fill.name } : {}, ...fill.emoji ? { emoji: fill.emoji } : {},
    ...fill.intention ? { intention: fill.intention } : {}, ...fill.hue !== undefined ? { hue: fill.hue } : {}, ...withRoutines(domain, fill.routines, since) };
  const keeper: KeeperOptions = { since, fresh: true, ...fill.keeper?.start && { start: fill.keeper.start },
    ...fill.keeper?.role && { role: fill.keeper.role }, ...fill.keeper?.instructions && { instructions: fill.keeper.instructions } };
  const { agentId: _agentId, ...unkept } = look;
  const next: T = !fill.steward || fill.steward === "new" && form.original ? { ...form, domain: look }
    : fill.steward === "new" ? { ...form, domain: unkept, keeper }
    : { ...form, domain: { ...look, agentId: fill.steward === atlasId ? undefined : fill.steward }, keeper: undefined };
  const fields = domainFields.filter((field) => field === "keeper" ? !same([form.keeper, domain.agentId], [next.keeper, next.domain.agentId])
    : !same(...{ name: [domain.name, next.domain.name], emoji: [domain.emoji, next.domain.emoji], purpose: [domain.intention, next.domain.intention],
      colour: [domain.hue, next.domain.hue], routines: [domain.routines, next.domain.routines] }[field] as [unknown, unknown]));
  return { ...next, filled: { at, fields } };
}

/** Puts back, one key at a time, what a fill changed from `before` to `after`, keeping any you've changed since. */
function revert<T extends object>(current: T, before: T, after: T, skip: (keyof T)[] = []): T {
  const out: T = { ...current };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof T>) {
    if (skip.includes(key) || same(before[key], after[key]) || !same(current[key], after[key])) continue;
    if (before[key] === undefined) delete out[key];
    else out[key] = before[key];
  }
  return out;
}

/** Undo for a project fill: only the fields it filled, and only where they still hold what it filled. */
export function unfilledProject<T extends ProjectFormLike>(current: T, before: T, after: T): T {
  const { filled: _filled, ...rest } = revert(current, before, after, ["project", "filled"]);
  return { ...rest, project: revert(current.project, before.project, after.project) } as T;
}

/** Undo for a domain fill, as `unfilledProject`. */
export function unfilledDomain<T extends DomainFormLike>(current: T, before: T, after: T): T {
  const { filled: _filled, ...rest } = revert(current, before, after, ["domain", "filled"]);
  return { ...rest, domain: revert(current.domain, before.domain, after.domain) } as T;
}

/**
 * A project an agent proposed (D61), as the project dialog opens it to review (D63): its name, goal, domain, colour
 * and page (with any finish line), its tasks as the steps, and the agent joining to lead it waiting on the form as a
 * fill's would. Notes stay with the proposal and land with it.
 */
export function reviewForm(proposal: Proposal, thread: string) {
  const [project] = proposal.projects!;
  return { project, steps: proposal.items.map((task) => ({ title: task.title, due: task.due })), review: { thread, proposal: proposal.id },
    ...proposal.lead && { hire: proposal.lead } };
}

/**
 * Whether a proposal makes one project to review in the dialog: a `propose_project` that made a new one, in a domain
 * already here (the dialog can't pick one still to plant, D61).
 */
export const reviewable = (proposal: Proposal) => proposal.status === "pending" && proposal.origin?.command === "propose_project" && proposal.projects?.length === 1 && !proposal.plant;

/**
 * The proposal as you left it in the dialog: the project as edited (a finish date moved on its page), the steps as
 * tasks in it (one you kept keeps its identity; one without a day lands on the next days) and its notes moved along.
 * The agent joining to lead it comes only while still picked. Apply checks it as it checks any proposal, so a domain
 * the agent doesn't look after is refused there.
 */
export function amendedProposal(proposal: Proposal, form: ProjectFormLike, today: string): Proposal {
  const base = proposal.projects![0];
  const { title, description, area, color, agentId, teamId, routines } = form.project;
  const project = { ...base, title: title.trim(), description: description.trim(), area, color, agentId, teamId, routines,
    widgets: form.finish ? withFinish(base.widgets, form.finish.date, form.finish.today) : base.widgets };
  const finish = form.finish?.date ?? base.widgets?.find((block) => block.type === "countdown")?.date;
  const items = (form.steps ?? []).map((step, index): Task => {
    const kept = proposal.items.find((task) => task.title === step.title);
    return { ...kept ?? { id: crypto.randomUUID(), done: false, createdBy: proposal.id, ...proposal.origin && { agentId: proposal.origin.agentId } },
      title: step.title, due: step.due || stepDue(index, today, finish), domain: area, projectId: project.id } as Task;
  });
  const { lead: _lead, ...rest } = proposal;
  const lead = form.hire && form.hire.id === agentId ? form.hire : undefined;
  return { ...rest, projects: [project], items, ...lead && { lead },
    ...proposal.notes && { notes: proposal.notes.map((note) => ({ ...note, domain: area, projectId: project.id })) } };
}
