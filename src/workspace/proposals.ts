// Applying and undoing what an agent proposed (D61: the domain it plants and the lead it brings in), a review's
// changes, and taking back a domain just planted (`unplant`).
import { keepsData, shownBlocks } from "../blocks.ts";
import type { Agent, Note, Proposal, ReviewChange, Task, WorkspaceData } from "../model.ts";
import { domainKey, homeKey } from "../place.ts";
import { swap, unchanged, mergeChanges } from "./change.ts";
import type { Change } from "./change.ts";
import { contents } from "./queries.ts";
import { deleteForever } from "./archive.ts";
import { placesOf, deleteAgent, createAgent } from "./agents.ts";
import { pageOf, defaultPageOf, withPutAway } from "./pages.ts";
import { layoutOf } from "./clean.ts";
import { createDomain } from "./domains.ts";
import { sameTask, taskHome } from "./tasks.ts";
import { editProject } from "./projects.ts";

/**
 * Takes back a domain just planted (the toast's Undo): the domain and, when it was hired with it (`agentId`), its own
 * agent. Refused once anything was put in the domain or the agent took other work or talked, so Undo never loses work.
 */
export function unplant(data: WorkspaceData, name: string, agentId?: string): Change {
  if (!data.domains.some((domain) => domain.name === name)) throw new Error(`${name} is already gone.`);
  const held = contents(data, { kind: "domain", id: name });
  if (held.projects.length || held.notes.length || held.tasks.length || held.memories.length)
    throw new Error(`Something is already in ${name}. Delete it from its dialog instead.`);
  const removed = deleteForever(data, { kind: "domain", id: name });
  if (!agentId) return removed;
  const places = placesOf(data, agentId);
  const talked = data.threads.some((thread) => thread.id === `agent:${agentId}` && thread.messages.length);
  if (places.projectIds.length || places.teamIds.length || places.domains.some((domain) => domain !== name) || talked) return removed;
  const fired = deleteAgent(removed.data, agentId);
  const deletedThreadIds = [...removed.changes.deletedThreadIds ?? [], ...fired.changes.deletedThreadIds ?? []];
  return { data: fired.data, changes: { ...removed.changes, ...fired.changes, deletedThreadIds } };
}

/** Where a review change stands: still as found, done, or changed by someone since. */
function stateOf(data: WorkspaceData, change: ReviewChange) {
  if (change.kind === "page") {
    const shown = pageOf(data, change.place);
    if (!shown) return "drifted";
    return layoutOf(shown) === layoutOf(change.to) ? "after" : layoutOf(shown) === layoutOf(change.from ?? defaultPageOf(change.place)) ? "before" : "drifted";
  }
  if (change.kind === "archive" || change.kind === "rehome") {
    const project = data.projects.find((item) => item.id === change.projectId);
    if (!project) return "drifted";
    if (change.kind === "archive") return project.archived ? "after" : "before";
    return project.area === change.to ? "after" : project.area === change.from ? "before" : "drifted";
  }
  const task = data.tasks.find((item) => item.id === change.taskId);
  if (!task) return "drifted";
  if (change.kind === "complete") return task.done ? "after" : "before";
  if (change.kind === "move") {
    const at = (home: { domain: string; projectId: string }) => task.domain === home.domain && task.projectId === home.projectId;
    return task.done ? "drifted" : at(change.to) ? "after" : at(change.from) ? "before" : "drifted";
  }
  // A change that also sets a time (D75) is done only at that time, and as found only at the time it had.
  const timed = change.at !== undefined;
  if (task.done) return "drifted";
  if (task.due === change.to && (!timed || task.at === change.at)) return "after";
  return task.due === change.from && (!timed || task.at === change.fromAt) ? "before" : "drifted";
}

/** A task with `at` set, or without one when it's undefined, so an undone time leaves no empty field behind. */
const timedAt = ({ at: _old, ...task }: Task, at: string | undefined): Task => at === undefined ? task : { ...task, at };

/** Puts every change of a review in its `to` state. */
function settleReview(data: WorkspaceData, changes: ReviewChange[], to: "before" | "after"): Change {
  const after = to === "after";
  const updatedAt = new Date().toISOString();
  // A project moved to another domain takes everything in it along (D61), as the project dialog's move does.
  const rehomed = new Map(changes.flatMap((item) => item.kind === "rehome" ? [[item.projectId, after ? item.to : item.from] as const] : []));
  const tasks = data.tasks.flatMap((task) => {
    const change = changes.find((item) => (item.kind === "complete" || item.kind === "reschedule" || item.kind === "move") && item.taskId === task.id);
    return change?.kind === "complete" ? [{ ...task, done: after, updatedAt }]
      : change?.kind === "reschedule" ? [timedAt({ ...task, due: after ? change.to : change.from, updatedAt },
        change.at === undefined ? task.at : after ? change.at : change.fromAt)]
      : change?.kind === "move" ? [{ ...task, ...after ? change.to : change.from, updatedAt }]
      : rehomed.has(task.projectId) ? [{ ...task, domain: rehomed.get(task.projectId)!, updatedAt }] : [];
  });
  const notes = data.notes.flatMap((note) => rehomed.has(note.projectId) ? [{ ...note, domain: rehomed.get(note.projectId)! }] : []);
  // A page takes the proposal's arrangement; blocks still on it keep what was logged on them meanwhile, and data
  // widgets it leaves out are put away instead of being lost.
  const pageFor = (place: string) => {
    const change = changes.find((item) => item.kind === "page" && item.place === place);
    if (change?.kind !== "page") return undefined;
    const current = pageOf(data, place) ?? [];
    const target = (after ? change.to : change.from) ?? (current.some(keepsData) ? defaultPageOf(place) : null);
    if (!target) return { widgets: undefined };
    const arranged = shownBlocks(target).map((block) => {
      const now = current.find((item) => item.id === block.id && item.type === block.type);
      if (!now) return block;
      const { view: _view, width: _width, removed: _removed, ...kept } = now;
      return { ...kept, ...block.view && { view: block.view }, ...block.width && { width: block.width } };
    });
    return { widgets: withPutAway(current, arranged, new Date().toLocaleDateString("en-CA")) };
  };
  const projects = data.projects.flatMap((project) => {
    const archive = changes.some((item) => item.kind === "archive" && item.projectId === project.id);
    const page = pageFor(project.id);
    const area = rehomed.get(project.id);
    return archive || page || area ? [{ ...project, ...(archive ? { archived: after } : {}), ...page, ...area && { area } }] : [];
  });
  // Domains are saved as one whole list, so a domain page change rewrites it.
  const domains = data.domains.some((domain) => pageFor(domainKey(domain.name)))
    ? data.domains.map((domain) => ({ ...domain, ...pageFor(domainKey(domain.name)) })) : undefined;
  return { data: { ...data, tasks: swap(data.tasks, tasks), notes: swap(data.notes, notes), projects: swap(data.projects, projects),
    ...domains && { domains } },
    changes: { tasks, projects, ...notes.length && { notes }, ...domains && { domains } } };
}

/** A filed note is still as a sort added it: same words, same home, not archived. Edit times differ by design. */
const sameFiled = (a: Note, b: Note) => a.id === b.id && a.title === b.title && a.body === b.body && a.domain === b.domain
  && a.projectId === b.projectId && !a.archived;

/**
 * Plants the domain Atlas plants with a proposal (D61) and its keeper (D51) first, hires the agent who joins to lead
 * its project, then makes its new projects before its tasks, notes or moves land in them, then adds or changes those
 * once. Refuses when its source note or records drifted, a project's domain is gone, or the domain to plant or the
 * name of someone joining was taken since.
 */
export function applyProposal(data: WorkspaceData, proposal: Proposal): Change {
  const made = proposal.projects ?? [];
  const present = made.filter((project) => data.projects.some((item) => item.id === project.id));
  if (present.length && present.length < made.length) throw new Error("This proposal conflicts with existing projects. Request a fresh proposal.");
  if (present.length) return applyRecords(data, proposal);
  const planted = proposal.plant ? plantWith(data, proposal.plant) : unchanged(data);
  if (made.some((project) => !planted.data.domains.some((domain) => domain.name === project.area && !domain.archived)))
    throw new Error("That domain no longer exists. Request a fresh proposal.");
  const lead = proposal.lead;
  if (lead && planted.data.agents.some((item) => item.id !== lead.id && item.name.trim().toLocaleLowerCase() === lead.name.trim().toLocaleLowerCase()))
    throw new Error(`Someone called ${lead.name} joined the crew since. Request a fresh proposal.`);
  const hired = lead && !planted.data.agents.some((item) => item.id === lead.id) ? createAgent(planted.data, lead) : unchanged(planted.data);
  const createdAt = new Date().toISOString();
  const projects = made.map((project) => ({ ...project, createdAt }));
  const applied = applyRecords({ ...hired.data, projects: [...hired.data.projects, ...projects] }, proposal);
  return { data: applied.data, changes: mergeChanges(mergeChanges(planted.changes, hired.changes),
    { ...applied.changes, ...projects.length && { projects: [...projects, ...applied.changes.projects ?? []] } }) };
}

/**
 * Hires a planted domain's new keeper, or checks the crew one is still here, then plants the domain (D61, D51). The
 * domain already planted by this proposal (same name and keeper) is left as it is, so applying twice plants once.
 */
function plantWith(data: WorkspaceData, { domain, agent }: NonNullable<Proposal["plant"]>): Change {
  const lower = (text: string) => text.trim().toLocaleLowerCase();
  const same = data.domains.find((item) => lower(item.name) === lower(domain.name));
  if (same?.name === domain.name && same.agentId === domain.agentId) return unchanged(data);
  if (same) throw new Error(`There is a domain called ${domain.name} now. Request a fresh proposal.`);
  if (agent ? data.agents.some((item) => item.id === agent.id || lower(item.name) === lower(agent.name))
    : !data.agents.some((item) => item.id === domain.agentId && !item.archived))
    throw new Error(`The crew changed since Atlas chose who looks after ${domain.name}. Request a fresh proposal.`);
  const hired = agent ? createAgent(data, agent) : unchanged(data);
  const planted = createDomain(hired.data, domain);
  return { data: planted.data, changes: { ...hired.changes, ...planted.changes } };
}
function applyRecords(data: WorkspaceData, proposal: Proposal): Change {
  if (proposal.changes) {
    const states = proposal.changes.map((change) => stateOf(data, change));
    if (states.every((state) => state === "after")) return unchanged(data);
    if (states.some((state) => state === "drifted"))
      throw new Error("Something here changed after the review. Run it again for a fresh look.");
    return settleReview(data, proposal.changes, "after");
  }
  const filed = proposal.notes ?? [];
  const existing = proposal.items.map((item) => data.tasks.find((task) => task.id === item.id));
  const existingNotes = filed.map((item) => data.notes.find((note) => note.id === item.id));
  if (existing.every((task, i) => task && sameTask(task, proposal.items[i]))
    && existingNotes.every((note, i) => note && sameFiled(note, filed[i]))) return unchanged(data);
  if (existing.some(Boolean) || existingNotes.some(Boolean))
    throw new Error("This proposal conflicts with existing tasks. Request a fresh proposal.");
  // A live agent may propose tasks no note asked for (`noteId` ""); then only their home must still exist as proposed.
  const note = data.notes.find((item) => item.id === proposal.noteId);
  if (!proposal.noteId) {
    if ([...proposal.items, ...filed].some((item) => taskHome(data, homeKey(item)).domain !== item.domain))
      throw new Error("That project moved to another domain. Request a fresh proposal.");
  } else if (!note || note.body !== proposal.sourceBody || note.title !== proposal.sourceTitle || note.projectId !== proposal.projectId
    || proposal.items.some((item) => item.domain !== note.domain))
    throw new Error("The source note changed after this proposal. Request a fresh proposal so you can review the current next steps.");
  const at = new Date().toISOString();
  const tasks = proposal.items.map((item) => ({ ...item, updatedAt: at }));
  const notes = filed.map((item) => ({ ...item, updatedAt: at }));
  return { data: { ...data, tasks: [...data.tasks, ...tasks], notes: [...notes, ...data.notes] },
    changes: { tasks, ...notes.length ? { notes } : {} } };
}

/**
 * Removes a proposal's tasks and notes (or reverses a review's changes) only while every one is untouched, then the
 * projects it made (D61), only while each is as made and holds nothing else, then the agent who joined to lead one
 * while they have no other place and haven't talked, then the domain it planted and the keeper hired with it
 * (`unplant`, D51).
 */
export function undoProposal(data: WorkspaceData, proposal: Proposal): Change {
  const undone = undoRecords(data, proposal);
  const made = (proposal.projects ?? []).flatMap((project) => undone.data.projects.find((item) => item.id === project.id) ?? []);
  let next = undone;
  for (const project of made) {
    const original = proposal.projects!.find((item) => item.id === project.id)!;
    if (project.title !== original.title || project.area !== original.area || project.description !== original.description || project.archived
      || JSON.stringify(project.widgets ?? null) !== JSON.stringify(original.widgets ?? null))
      throw new Error(`${project.title} has been edited. Undo is unavailable to protect your changes; edit the project directly instead.`);
    const { notes, tasks, memories } = contents(next.data, { kind: "project", id: project.id });
    const room = next.data.threads.find((thread) => thread.id === `room:${project.id}`);
    if (notes.length || tasks.length || memories.length || room?.messages.length || next.data.notes.some((note) => note.linkedProjectIds?.includes(project.id)))
      throw new Error(`Something new is in ${project.title} since. Undo is unavailable to protect your work; archive the project instead.`);
    const gone = deleteForever(next.data, { kind: "project", id: project.id });
    next = { data: gone.data, changes: mergeChanges(next.changes, gone.changes) };
  }
  if (proposal.lead) {
    const gone = letGoIfIdle(next.data, proposal.lead.id);
    next = { data: gone.data, changes: mergeChanges(next.changes, gone.changes) };
  }
  if (!proposal.plant) return next;
  const unplanted = unplant(next.data, proposal.plant.domain.name, proposal.plant.agent?.id);
  return { data: unplanted.data, changes: mergeChanges(next.changes, unplanted.changes) };
}

/** Removes an agent who joined for something just taken back, while they have no place and haven't talked; else nothing. */
function letGoIfIdle(data: WorkspaceData, id: string): Change {
  const idle = data.agents.some((agent) => agent.id === id) && !Object.values(placesOf(data, id)).some((ids) => ids.length)
    && !data.threads.some((thread) => thread.id === `agent:${id}` && thread.messages.length);
  return idle ? deleteAgent(data, id) : unchanged(data);
}

/** A ready-made agent (D41) who joins the crew to lead a project, from its crew menu (agents-design D61). */
export function bringInLead(data: WorkspaceData, projectId: string, agent: Agent): Change {
  const joined = createAgent(data, agent);
  const led = editProject(joined.data, projectId, { agentId: agent.id });
  return { data: led.data, changes: mergeChanges(joined.changes, led.changes) };
}

/**
 * Takes back `bringInLead`: the project goes back to `before` while the newcomer still leads it, and they leave while
 * they have no other place and haven't talked.
 */
export function sendBackLead(data: WorkspaceData, projectId: string, agentId: string, before: string | undefined): Change {
  const back = data.projects.some((project) => project.id === projectId && project.agentId === agentId)
    ? editProject(data, projectId, { agentId: before }) : unchanged(data);
  const gone = letGoIfIdle(back.data, agentId);
  return { data: gone.data, changes: mergeChanges(back.changes, gone.changes) };
}

function undoRecords(data: WorkspaceData, proposal: Proposal): Change {
  if (proposal.changes) {
    const states = proposal.changes.map((change) => stateOf(data, change));
    if (states.every((state) => state === "before")) return unchanged(data);
    if (!states.every((state) => state === "after"))
      throw new Error("Some of this has been edited since. Undo is unavailable to protect your changes; edit those directly instead.");
    return settleReview(data, proposal.changes, "before");
  }
  const filed = proposal.notes ?? [];
  const current = proposal.items.map((item) => data.tasks.find((task) => task.id === item.id));
  const currentNotes = filed.map((item) => data.notes.find((note) => note.id === item.id));
  if (current.every((task) => !task) && currentNotes.every((note) => !note)) return unchanged(data);
  if (!current.every((task, i) => task && sameTask(task, proposal.items[i])))
    throw new Error("One of these tasks has been edited. Undo is unavailable to protect your changes; edit the tasks directly instead.");
  if (!currentNotes.every((note, i) => note && sameFiled(note, filed[i])))
    throw new Error("One of these notes has been edited. Undo is unavailable to protect your changes; edit the notes directly instead.");
  const ids = new Set(proposal.items.map((item) => item.id));
  const noteIds = new Set(filed.map((item) => item.id));
  return {
    data: { ...data, tasks: data.tasks.filter((task) => !ids.has(task.id)), notes: data.notes.filter((note) => !noteIds.has(note.id)) },
    changes: { deletedTaskIds: [...ids], ...noteIds.size ? { deletedNoteIds: [...noteIds] } : {} },
  };
}
