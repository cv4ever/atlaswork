// What a load turns older saves into: the records normalized, the one Atlas conversation the Session used to hold
// moved into his Thread, routine runs this device used to keep moved into the Workspace, and the presentation left
// for the Session. Pure; workbench.test.ts covers it through load.
import { atlasId } from "../model.ts";
import type { WorkspaceData } from "../model.ts";
import type { Session } from "../session.ts";
import { normalize, saveThread } from "../workspace.ts";
import type { Change } from "../workspace.ts";
import type { SavedSession } from "../workbench.ts";

export function migrated(stored: WorkspaceData | null, saved: SavedSession): { change: Change; presentation: Partial<Session> } {
  const { domains, messages, attachedNoteId, atlasWelcomeRead: _read, checkedIn: _checked, routinesRan, ...presentation } = saved;
  let change = normalize(stored, domains);
  if (messages?.length && !change.data.threads.some((thread) => thread.id === `agent:${atlasId}`)) {
    const kept = messages.filter((message) => message.id !== "atlas-welcome");
    const moved = saveThread(change.data, { id: `agent:${atlasId}`, messages: kept, read: kept.length, attachedNoteId: attachedNoteId ?? null });
    change = { data: moved.data, changes: { ...change.changes, ...moved.changes } };
  }
  if (routinesRan && !Object.keys(change.data.routineRuns).length)
    change = { data: { ...change.data, routineRuns: routinesRan }, changes: { ...change.changes, routineRuns: routinesRan } };
  return { change, presentation };
}
