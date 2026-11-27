// Preview and Save for every record dialog (`saveDraft`), applying only what the dialog changed to the current
// record, and an owner's routines (`setRoutines`).
import { agentTools, canUse } from "../model.ts";
import type { Agent, Domain, Places, Project, Routine, Task, Team, ToolId, WorkspaceData } from "../model.ts";
import { homeKey } from "../place.ts";
import { ownerOf } from "../routines.ts";
import type { RoutineOwner } from "../routines.ts";
import { changed, unchanged } from "./change.ts";
import type { Change } from "./change.ts";
import { editAgent, createAgent, createTeam, editTeam } from "./agents.ts";
import type { AgentPatch } from "./agents.ts";
import { editDomain, createDomain, keeperFor } from "./domains.ts";
import type { KeeperOptions, DomainDraft } from "./domains.ts";
import { editProject, createProject, withFinish } from "./projects.ts";
import { createTask, editTask } from "./tasks.ts";

/** Replaces one owner's routines, whichever record keeps them. Refusals throw like the record's own edit. */
export function setRoutines(data: WorkspaceData, owner: RoutineOwner, routines: Routine[]): Change {
  const before = ownerOf(data, owner).routines;
  const changed = owner.kind === "agent" ? editAgent(data, owner.id, { routines })
    : owner.kind === "domain" ? editDomain(data, owner.id, { routines })
    : editProject(data, owner.id, { routines });
  // A removed routine's results go with it (D68).
  const gone = new Set(before.filter((routine) => !routines.some((item) => item.id === routine.id)).map((routine) => routine.id));
  const dropped = changed.data.runs.filter((run) => gone.has(run.routineId));
  if (!dropped.length) return changed;
  return { ...changed, data: { ...changed.data, runs: changed.data.runs.filter((run) => !gone.has(run.routineId)) },
    changes: { ...changed.changes, deletedRunIds: dropped.map((run) => run.id) } };
}

/**
 * A record dialog's state: the record as the dialog opened it (none when it's new) and as it is now. A Task carries its
 * home key, an Agent the places it works.
 */
export type RecordDraft =
  | { kind: "domain"; original?: Domain; domain: Domain; keeper?: KeeperOptions }
  /**
   * `finish`: a finish date the dialog set ("" clears it), applied at Save to the page as it is then (`withFinish`).
   * `hire`: a suggested agent a fill picked to lead a new project (D63), added to the crew in the same Save.
   */
  | { kind: "project"; original?: Project; project: Project; finish?: { date: string; today: string }; hire?: Agent }
  /** `newDomain`: a domain planted with the agent in the same Save (an agent Atlas drafted, agents-design D57). */
  | { kind: "agent"; original?: { agent: Agent; places: Places }; agent: Agent; places: Places; newDomain?: DomainDraft }
  | { kind: "team"; original?: Team; team: Team }
  /** `length` 0 is the default half hour (D75). */
  | { kind: "task"; original?: Task; title: string; due: string; at: string; length: number; done: boolean; home: string };

/** One kind's dialog state, which `saveDraft` gets with its `kind` added. */
export type DraftOf<K extends RecordDraft["kind"]> = Omit<Extract<RecordDraft, { kind: K }>, "kind">;

/**
 * Preview and Save for every record dialog. A new record is created; an existing one gets only what the dialog changed,
 * applied to the current record, so an edit made elsewhere while the dialog was open survives. Refusals throw.
 */
export function saveDraft(data: WorkspaceData, draft: RecordDraft): Change & { moved?: boolean } {
  switch (draft.kind) {
    case "domain": {
      const { original, domain, keeper } = draft;
      if (original) return editDomain(data, original.name, changed(original, domain, ["name", "emoji", "hue", "intention", "agentId", "routines"]));
      if (!keeper) return createDomain(data, domain);
      const { agent, isNew } = keeperFor(data, domain, keeper);
      const hired = isNew ? createAgent(data, agent) : unchanged(data);
      const planted = createDomain(hired.data, { ...domain, agentId: agent.id });
      return { data: planted.data, changes: { ...hired.changes, ...planted.changes } };
    }
    case "project": {
      const { original, project, finish, hire } = draft;
      if (hire && !original && project.agentId === hire.id && !data.agents.some((agent) => agent.id === hire.id)) {
        const joined = createAgent(data, hire);
        const saved = saveDraft(joined.data, { ...draft, hire: undefined });
        return { ...saved, changes: { ...joined.changes, ...saved.changes } };
      }
      if (!original) return createProject(data, finish ? { ...project, widgets: withFinish(project.widgets, finish.date, finish.today) } : project);
      const current = data.projects.find((item) => item.id === original.id);
      return editProject(data, original.id, { ...changed(original, project, ["title", "description", "area", "color", "agentId", "teamId", "routines"]),
        ...finish && { widgets: withFinish(current?.widgets, finish.date, finish.today) } });
    }
    case "team": {
      const { original, team } = draft;
      return !original ? createTeam(data, team) : editTeam(data, original.id, changed(original, team, ["name", "purpose", "memberIds"]));
    }
    case "task": {
      const { original, home, title, due, at, length, done } = draft;
      if (!original) return createTask(data, { title, due, done, ...at && { at }, ...length && { length } }, home);
      return editTask(data, original.id, { ...changed({ ...original, at: original.at ?? "", length: original.length ?? 0 }, { ...original, title, due, at, length, done },
        ["title", "due", "at", "length", "done"]), ...home !== homeKey(original) && { home } });
    }
    case "agent": {
      const { original, agent, places, newDomain } = draft;
      if (newDomain) {
        const planted = createDomain(data, newDomain);
        const saved = saveDraft(planted.data, { ...draft, newDomain: undefined });
        return { ...saved, changes: { ...planted.changes, ...saved.changes } };
      }
      if (!original) return createAgent(data, agent, places);
      const patch: AgentPatch = changed(original.agent, agent, ["name", "portrait", "role", "instructions", "writeMode", "warmth", "detail", "routines", "model", "effort", "mayAsk"]);
      const tools = (Object.keys(agentTools) as ToolId[]).filter((id) => canUse(agent, id) !== canUse(original.agent, id));
      if (tools.length) patch.tools = Object.fromEntries(tools.map((id) => [id, canUse(agent, id)]));
      const keys = ["domains", "projectIds", "teamIds"] as const;
      const add = Object.fromEntries(keys.map((key) => [key, places[key].filter((id) => !original.places[key].includes(id))]));
      const remove = Object.fromEntries(keys.map((key) => [key, original.places[key].filter((id) => !places[key].includes(id))]));
      return editAgent(data, original.agent.id, patch, { add, remove });
    }
  }
}
