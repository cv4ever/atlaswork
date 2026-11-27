// Workspace edits and archive-aware queries, as pure functions; each edit returns a `Change`: the next Workspace and
// exactly the records to persist. Callers pass content and a Home key (Place `homeKey`/`domainKey`) to create, or an id
// to edit, move or link; they never assemble ownership fields or Link lists, and a missing destination throws instead
// of falling back to the selected Domain. Moving keeps content, edit times and Blobs; a content edit keeps the Home,
// Links, archive state, the other words and the Blob.
// Record dialogs save through `saveDraft`, which sends only the fields changed since the dialog opened, so an edit made
// meanwhile survives. A record deleted meanwhile is refused, never recreated, and a Domain renamed or removed meanwhile
// is refused under its old name. Tool patches merge permissions; assignment edits touch only the places that changed;
// an archived Agent is restored before it changes where it works; Topics save whole. Routine previews run the same edit
// as Save. workspace.test.ts and agents.test.ts cover these.
// This file is the module's whole interface; each part lives in src/workspace/ by record kind (change.ts is what every
// edit returns, drafts.ts the record dialogs, proposals.ts what agents propose, queries.ts what the screen reads).
export { resave } from "./workspace/change.ts";
export type { Changes, Change, RoutineClaim, WorkspaceStore, Target } from "./workspace/change.ts";
export { layoutOf, cleanBlocks } from "./workspace/clean.ts";
export { normalize } from "./workspace/load.ts";
export { createDomain, keeperFor, agentFrom, weeklyImprovement, editDomain } from "./workspace/domains.ts";
export type { DomainDraft, KeeperOptions } from "./workspace/domains.ts";
export { createProject, editProject, withFinish } from "./workspace/projects.ts";
export type { ProjectDraft } from "./workspace/projects.ts";
export { addPeople, saveTopic, markSorted, createResource, createResources, editResource, moveResource, setResourceLinked } from "./workspace/resources.ts";
export type { ResourceDraft } from "./workspace/resources.ts";
export { createTask, withdrawTask, deleteTask, restoreTask, editTask, moveTasksToDay, placeTasks } from "./workspace/tasks.ts";
export type { TaskDraft } from "./workspace/tasks.ts";
export { saveEveryAgent, createTeam, editTeam, deleteTeam, placesOf, createAgent, editAgent, setAgentArchived, deleteAgent } from "./workspace/agents.ts";
export type { TeamDraft, AgentPatch, PlaceEdits } from "./workspace/agents.ts";
export { saveThread, remember, unremember, forgetMemory, deleteThread } from "./workspace/threads.ts";
export { contents, visible, inDomain, lateByDomain, todayInPlay, todayRhythm, resourcesIn, homeArchived, onScreen } from "./workspace/queries.ts";
export type { Visible, Progress, Screen } from "./workspace/queries.ts";
export { setArchived, deleteForever, archiveProject, deleteResources } from "./workspace/archive.ts";
export { markBrief, pageOf, arrangePage, resetPage, purgeBlock, editBlock, addBlock } from "./workspace/pages.ts";
export { setRoutines, saveDraft } from "./workspace/drafts.ts";
export type { RecordDraft, DraftOf } from "./workspace/drafts.ts";
export { unplant, applyProposal, undoProposal, bringInLead, sendBackLead } from "./workspace/proposals.ts";
