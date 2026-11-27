// Conversations and what replies remembered (agents-design D49).
import { byId } from "../model.ts";
import type { Memory, Remembered, Thread, WorkspaceData } from "../model.ts";
import { upsert, swap, unchanged } from "./change.ts";
import type { Change } from "./change.ts";

export function saveThread(data: WorkspaceData, thread: Thread): Change {
  return { data: { ...data, threads: upsert(data.threads, thread) }, changes: { threads: [thread] } };
}

/**
 * Memories a reply saved (agents-design D49). One that replaces an earlier memory takes its id, so a place keeps one
 * version of it; `remembered` says what each replaced, for Undo.
 */
export function remember(data: WorkspaceData, memories: Memory[]): Change & { remembered: Remembered[] } {
  const current = byId(data.memories);
  const remembered = memories.map((memory) => ({ memory, ...current.has(memory.id) && { replaced: current.get(memory.id)! } }));
  return { data: { ...data, memories: [...swap(data.memories, memories), ...memories.filter((memory) => !current.has(memory.id))] },
    changes: { memories }, remembered };
}

/** Takes back what a reply remembered: the memory it replaced comes back, or it's forgotten. Refused once it changed since. */
export function unremember(data: WorkspaceData, { memory, replaced }: Remembered): Change {
  const now = data.memories.find((item) => item.id === memory.id);
  if (JSON.stringify(now) !== JSON.stringify(memory))
    throw new Error("That memory changed since. Forget it from the agent's Briefing instead.");
  return replaced ? { data: { ...data, memories: swap(data.memories, [replaced]) }, changes: { memories: [replaced] } } : forgetMemory(data, memory.id);
}

/** Forgets a memory for good. */
export function forgetMemory(data: WorkspaceData, id: string): Change {
  if (!data.memories.some((memory) => memory.id === id)) return unchanged(data);
  return { data: { ...data, memories: data.memories.filter((memory) => memory.id !== id) }, changes: { deletedMemoryIds: [id] } };
}

/** Removes a conversation you started; agent, team, and project threads come back empty when reopened. */
export function deleteThread(data: WorkspaceData, id: string): Change {
  return { data: { ...data, threads: data.threads.filter((thread) => thread.id !== id) }, changes: { deletedThreadIds: [id] } };
}
