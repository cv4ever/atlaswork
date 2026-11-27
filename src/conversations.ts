// The Room module: Thread discovery and every chat transition, in the side panel and on the Chats page. `discover()`
// says how each chat reads, files the chat list, and returns the roster and welcome; App adds only colours. It reads
// the place (Place `here`) and the Picked chat from the Session, creates no records while discovering, and commits
// through the Workbench. What lands from a reply, and Apply, Reject and Undo, come from the Proposal module; the Room
// stamps and commits them, so task changes and proposal history commit together, and a late reply can't recreate a
// deleted Room. workbench.test.ts covers it.
// This file is the module's interface; its parts are src/room/: core.ts (the Activity store and the two writes),
// discover.ts (how chats read, pure), replies.ts (messages, replies and questions between agents), threads.ts (edits
// that ask no agent) and routineRound.ts (a round of routines).
import { createRoomCore } from "./room/core.ts";
import type { RoomEngine } from "./room/core.ts";
import { discover } from "./room/discover.ts";
import * as replies from "./room/replies.ts";
import { runRound } from "./room/routineRound.ts";
import * as threads from "./room/threads.ts";
import type { Conversations } from "./room/types.ts";
import type { Workbench } from "./workbench.ts";
import type { AgentRequest } from "./agentRequest.ts";

export type { Activity, Conversations, Discovery, RosterRow, RoutineRun, ThreadSummary } from "./room/types.ts";

/** Room discovery and transitions share one interface in the side panel and the Chats page. */
export function createConversations(workbench: Workbench, engine: RoomEngine, offers?: AgentRequest["offers"]): Conversations {
  const core = createRoomCore(workbench, engine, offers);
  const session = () => workbench.getSnapshot().session;
  let rounds: Promise<unknown> = Promise.resolve();
  const conversations: Conversations = {
    getSnapshot: core.activity,
    subscribe: core.subscribe,
    followJobs: (jobs) => core.publish({ jobs }),
    discover: () => discover(core.current(), session(), core.place(), core.activity()),
    pickChat(threadId) {
      void workbench.updateSession({ chatPick: { thread: threadId, context: core.place().context } });
    },
    openChat(threadId) {
      const { chatPick, chatTabs: { open, pinned } } = session();
      // shortcut: keeps the 8 most recently opened unpinned tabs; add an overflow menu if more need to stay open.
      const tabs = open.includes(threadId) || pinned.includes(threadId) ? open : [...open, threadId].slice(-8);
      // The page ignores pick context; the context only matters once the chat moves back beside other work.
      void workbench.updateSession({ chatPick: { thread: threadId, context: chatPick?.context ?? "" }, chatTabs: { open: tabs, pinned } });
    },
    closeChat(threadId) {
      const { current: shown, tabs } = conversations.discover();
      const { open, pinned } = session().chatTabs;
      void workbench.updateSession({ chatTabs: { open: open.filter((id) => id !== threadId), pinned } });
      if (threadId !== shown.id) return true;
      const ids = tabs.map((tab) => tab.id);
      const next = ids[ids.indexOf(threadId) + 1] ?? ids[ids.indexOf(threadId) - 1];
      if (next) conversations.openChat(next);
      return !!next;
    },
    togglePinChat(threadId) {
      const { open, pinned } = session().chatTabs;
      void workbench.updateSession({ chatTabs: pinned.includes(threadId)
        ? { open: [...open.filter((id) => id !== threadId), threadId], pinned: pinned.filter((id) => id !== threadId) }
        : { open: open.filter((id) => id !== threadId), pinned: [...pinned, threadId] } });
    },
    startRoom: (title, memberIds) => threads.startRoom(core, title, memberIds),
    attach: (threadId, attachedNoteId) => core.post(threadId, (thread) => ({ ...thread, attachedNoteId })),
    newSession: (threadId) => threads.newSession(core, threadId),
    markRead: (threadId) => threads.markRead(core, threadId),
    send: (threadId, text, from, background) => replies.send(core, threadId, text, from, undefined, background),
    retry: (threadId, messageId) => replies.retry(core, threadId, messageId),
    requestFreshProposal: (threadId, proposalId) => replies.requestFreshProposal(core, threadId, proposalId),
    actOnProposal: (threadId, proposalId, action, amended) => threads.actOnProposal(core, threadId, proposalId, action, amended),
    actOnAsk: (threadId, askId, action, question) => replies.actOnAsk(core, threadId, askId, action, question),
    unremember: (threadId, messageId, memoryId) => threads.unremember(core, threadId, messageId, memoryId),
    learn: (threadId, messageId, memoryId, action) => threads.learn(core, threadId, messageId, memoryId, action),
    pick: (threadId, messageId, option) => threads.pick(core, threadId, messageId, option),
    setChatModel: (threadId, agentId, choice) => threads.setChatModel(core, threadId, agentId, choice),
    keepChatModel: (threadId, agentId) => threads.keepChatModel(core, threadId, agentId),
    runRoutines(now, onlyId) {
      // One round at a time: opening the app and coming back to it can ask together, and the second must see the
      // first one's receipts.
      const next = rounds.then(() => runRound(core, now, onlyId));
      rounds = next.then(() => undefined, () => undefined);
      return next;
    },
  };
  return conversations;
}
