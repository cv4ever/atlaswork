// What every Room part acts through: the Workbench and the agents' engine, the Activity store (who is replying where,
// what failed), and the two writes a chat makes. A proposal and its history commit in the same storage transaction,
// so `post` takes the edit that goes with the message.
import { postedThread } from "../proposals.ts";
import type { Landed, Stamp } from "../proposals.ts";
import type { AgentEngine } from "../atlas.ts";
import type { AgentRequest } from "../agentRequest.ts";
import { byId } from "../model.ts";
import type { Agent, Thread, Usage, WorkspaceData } from "../model.ts";
import { here } from "../place.ts";
import * as workspace from "../workspace.ts";
import type { Change } from "../workspace.ts";
import type { Workbench } from "../workbench.ts";
import type { Activity } from "./types.ts";
import { withStep } from "./types.ts";

export type RoomEngine = Pick<AgentEngine, "reply"> & Partial<Pick<AgentEngine, "about">>;

export const threadOf = (data: WorkspaceData, id: string): Thread =>
  byId(data.threads).get(id) ?? { id, messages: [], read: 0, attachedNoteId: null };

export type RoomCore = {
  workbench: Workbench;
  engine: RoomEngine;
  /** The current Workspace; read it after every await, never keep it across one. */
  current(): WorkspaceData;
  activity(): Activity;
  publish(patch: Partial<Activity>): void;
  subscribe(listener: () => void): () => void;
  /** Saves the Thread `update` makes, with `change` (a proposal's edit) in the same write; resolves once it's stored. */
  post(id: string, update: (thread: Thread) => Thread, change?: Change): Promise<void>;
  /**
   * Posts what landed under one stamp; the reply's usage goes on its first message. A new agent draft replaces earlier
   * ones (D57). A reply takes its agent off the `awaiting` of the message it answers, in the same write.
   */
  postLanded(id: string, stamp: Stamp, landed: Landed, usage?: Usage): void;
  /** Shows `agent` replying in `threadId`, with no step said yet. */
  replying(threadId: string, agent: Agent): void;
  /** Nobody is replying in `threadId` any more. */
  settle(threadId: string): void;
  /** Adds a step to the typing indicator for `agent` replying in `threadId`, while it's still the one replying there. */
  progressIn(threadId: string, agent: Agent): (text: string, tool?: string) => void;
  /** You, as a reply sends you (Settings → Profile). */
  person(): { name: string; about: string };
  /** Where chat is: the selected Domain and the open Project or a Resource tab's home Project; no Project on a global view. */
  place(): { domain: string; projectId: string; context: string };
  /** Connections this build offers (agents-design D83), which a chat reply passes on so an agent may ask for one. */
  offers?: AgentRequest["offers"];
};

export function createRoomCore(workbench: Workbench, engine: RoomEngine, offers?: AgentRequest["offers"]): RoomCore {
  let activity: Activity = { thinking: {}, errors: {}, progress: {}, proposalErrors: {}, jobs: [] };
  const listeners = new Set<() => void>();
  const current = () => workbench.getSnapshot().data!;
  const publish = (patch: Partial<Activity>) => {
    activity = { ...activity, ...patch };
    for (const listener of listeners) listener();
  };
  const post: RoomCore["post"] = (id, update, change = { data: current(), changes: {} }) => {
    const saved = workspace.saveThread(change.data, update(threadOf(change.data, id)));
    return workbench.commit({ data: saved.data, changes: { ...change.changes, ...saved.changes } });
  };
  return {
    workbench,
    engine,
    current,
    activity: () => activity,
    publish,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    post,
    postLanded(id, stamp, { messages, change }, usage) {
      post(id, (thread) => postedThread(thread, stamp, messages, usage), change);
    },
    replying(threadId, agent) {
      publish({ thinking: { ...activity.thinking, [threadId]: agent }, progress: { ...activity.progress, [threadId]: undefined } });
    },
    settle(threadId) {
      const { [threadId]: _finished, ...thinking } = activity.thinking;
      const { [threadId]: _step, ...progress } = activity.progress;
      publish({ thinking, progress });
    },
    progressIn: (threadId, agent) => (text, tool) => {
      if (activity.thinking[threadId]?.id !== agent.id) return;
      publish({ progress: { ...activity.progress, [threadId]: withStep(activity.progress[threadId], { text, tool }) } });
    },
    person() {
      const { profileName, profileBio } = workbench.getSnapshot().session;
      return { name: profileName, about: profileBio };
    },
    place() {
      const { domain, projectId } = here(current(), workbench.getSnapshot().session);
      return { domain, projectId, context: `${domain}|${projectId}` };
    },
    offers,
  };
}
