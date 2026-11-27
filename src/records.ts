// A workspace as records, one key per record (`task:<id>`, `domains`, …): how the browser's IndexedDB store, the
// account's server store (cloud.ts) and the server's routine runner (supabase/functions/routines) read and write it.
// Pure, with no browser dependency, so the Edge Function imports it too.
//
// Chats are written two ways. This browser's IndexedDB has one writer, so a thread is one record with its messages. The
// account has several (the page, the agent function, routines), so each message there is written as its own record
// (`message:<thread>:<id>`, agents-design D76) and `thread:<id>` keeps the rest: a reply landing on the server and a
// message you write meanwhile both survive. Reads are whole threads either way: the account's `load_workspace` puts
// each thread's messages back in it, so `workspaceOf` reads one shape, and so does an app from before D76.
import type { Agent, BriefMark, ChatMessage, Domain, EveryAgent, Memory, Note, Project, RoutineResult, Task, Team, Thread, Topic, WorkspaceData } from "./model.ts";
import { mergeRoutineRuns } from "./routines.ts";
import type { Changes } from "./workspace.ts";

/** One chat message in the account (D76): its thread, and `n`, its place in the thread when it was written. */
export type MessageRecord = { thread: string; n: number; message: ChatMessage };
/** What a save writes: records by key, and the keys it deletes. */
export type Records = { puts: [string, unknown][]; deletes: string[] };

/** The records the agent function says it wrote (D76: a reply's stream, a tidy's Apply, D79), when they're plain keys and values. */
export function recordsIn(value: unknown): Records | undefined {
  if (!value || typeof value !== "object" || !("puts" in value) || !("deletes" in value)) return undefined;
  const { puts, deletes } = value;
  return Array.isArray(puts) && puts.every((put) => Array.isArray(put) && put.length === 2 && typeof put[0] === "string")
    && Array.isArray(deletes) && deletes.every((key) => typeof key === "string") ? { puts, deletes } : undefined;
}

/**
 * `data` with records the account wrote elsewhere laid over it, without saving them again (agents-design D76: what the
 * agent function landed for a page still reading). Each record replaces its own; a message joins its thread where it
 * was written (`n`), after messages written there earlier; deletes take theirs away. A note keeps the file this device
 * holds for it, and the account's routine receipts merge with this page's.
 */
export function withRecords(data: WorkspaceData, { puts, deletes }: Records): WorkspaceData {
  if (!puts.length && !deletes.length) return data;
  const put = workspaceOf([["initialized", true], ...puts])!;
  const keys = new Set(puts.map(([key]) => key));
  const gone = new Set(deletes);
  /** `current` with `landed` laid over it by id (`keep` decides what the replaced record keeps), less `kind`'s deletes. */
  const merge = <T extends { id: string }>(kind: string, current: T[], landed: T[], keep = (_was: T, now: T) => now) => {
    if (!landed.length && !deletes.some((key) => key.startsWith(`${kind}:`))) return current;
    const byId = new Map(landed.map((item) => [item.id, item]));
    const known = new Set(current.map((item) => item.id));
    return [...current.filter((item) => !gone.has(`${kind}:${item.id}`)).map((item) => byId.has(item.id) ? keep(item, byId.get(item.id)!) : item),
      ...landed.filter((item) => !known.has(item.id))];
  };
  let threads = merge("thread", data.threads, put.threads, (was, meta) => ({ ...meta, messages: was.messages }))
    .map((thread) => thread.messages ? thread : { ...thread, messages: [] });
  for (const [key, value] of puts) {
    if (!key.startsWith("message:")) continue;
    const { thread: threadId, n, message }: MessageRecord = value as MessageRecord;
    threads = threads.map((thread) => {
      if (thread.id !== threadId) return thread;
      const index = thread.messages.findIndex((other) => other.id === message.id);
      if (index >= 0) return { ...thread, messages: thread.messages.with(index, message) };
      let place = Math.min(n, thread.messages.length);
      while (place < thread.messages.length && (thread.messages[place].at ?? "") <= (message.at ?? "")) place++;
      return { ...thread, messages: thread.messages.toSpliced(place, 0, message) };
    });
  }
  const unsaid = deletes.filter((key) => key.startsWith("message:"));
  if (unsaid.length) threads = threads.map((thread) => ({ ...thread, messages: thread.messages.filter((message) => !gone.has(`message:${thread.id}:${message.id}`)) }));
  return {
    ...data, threads,
    projects: merge("project", data.projects, put.projects),
    notes: merge("note", data.notes, put.notes, (was, now) => was.file && !now.file ? { ...now, file: was.file } : now),
    tasks: merge("task", data.tasks, put.tasks),
    agents: merge("agent", data.agents, put.agents),
    teams: merge("team", data.teams, put.teams),
    topics: merge("topic", data.topics, put.topics),
    memories: merge("memory", data.memories, put.memories),
    runs: merge("run", data.runs, put.runs),
    domains: keys.has("domains") ? put.domains : data.domains,
    routineRuns: keys.has("routineRuns") ? mergeRoutineRuns(data.routineRuns, put.routineRuns) : data.routineRuns,
    ...keys.has("everyAgent") && { everyAgent: put.everyAgent },
    briefs: { ...Object.fromEntries(Object.entries(data.briefs).filter(([place]) => !gone.has(`brief:${encodeURIComponent(place)}`))), ...put.briefs },
  };
}

/**
 * A workspace from its records, keyed `task:<id>`, `domains` and so on; null when it was never saved. A brief mark is
 * `brief:<place>` with the place URI-encoded, since domain names may hold spaces the server's keys refuse.
 */
export function workspaceOf(rows: [string, unknown][]): WorkspaceData | null {
  const value = (key: string) => rows.find(([name]) => name === key)?.[1];
  if (!value("initialized")) return null;
  const data: WorkspaceData = { domains: (value("domains") as Domain[] | undefined) ?? [], projects: [], notes: [], tasks: [], topics: [], agents: [], teams: [], threads: [],
    routineRuns: (value("routineRuns") as Record<string, string> | undefined) ?? {}, briefs: {}, memories: [], runs: [] };
  const everyAgent = value("everyAgent") as EveryAgent | undefined;
  if (everyAgent) data.everyAgent = everyAgent;
  for (const [key, item] of rows) {
    if (key.startsWith("project:")) data.projects.push(item as Project);
    if (key.startsWith("note:")) data.notes.push(item as Note);
    if (key.startsWith("task:")) data.tasks.push(item as Task);
    if (key.startsWith("agent:")) data.agents.push(item as Agent);
    if (key.startsWith("thread:")) data.threads.push(item as Thread);
    if (key.startsWith("team:")) data.teams.push(item as Team);
    if (key.startsWith("topic:")) data.topics.push(item as Topic);
    if (key.startsWith("brief:")) data.briefs[decodeURIComponent(key.slice(6))] = item as BriefMark;
    if (key.startsWith("memory:")) data.memories.push(item as Memory);
    if (key.startsWith("run:")) data.runs.push(item as RoutineResult);
  }
  // Atlas first, then by name.
  data.agents.sort((a, b) => Number(b.id === "atlas") - Number(a.id === "atlas") || a.name.localeCompare(b.name));
  const projectOrder = value("projectOrder") as string[] | undefined;
  if (projectOrder) {
    // Projects created after the order was saved keep their load order at the end.
    const rank = (id: string) => (projectOrder.indexOf(id) + 1 || projectOrder.length + 1);
    data.projects.sort((a, b) => rank(a.id) - rank(b.id));
  }
  data.notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title));
  data.runs.sort((a, b) => a.due.localeCompare(b.due));
  return data;
}

/** The records a changeset writes and the keys it deletes, each thread whole with its messages (this browser). */
export function recordsOf(changes: Changes): Records {
  return {
    puts: [...rowsOf(changes), ["initialized", true]],
    deletes: [
      ...(changes.deletedTaskIds ?? []).map((id) => `task:${id}`),
      ...(changes.deletedNoteIds ?? []).map((id) => `note:${id}`),
      ...(changes.deletedProjectIds ?? []).map((id) => `project:${id}`),
      ...(changes.deletedAgentIds ?? []).map((id) => `agent:${id}`),
      ...(changes.deletedThreadIds ?? []).map((id) => `thread:${id}`),
      ...(changes.deletedTeamIds ?? []).map((id) => `team:${id}`),
      ...(changes.deletedTopicIds ?? []).map((id) => `topic:${id}`),
      ...(changes.deletedMemoryIds ?? []).map((id) => `memory:${id}`),
      ...(changes.deletedBriefs ?? []).map((place) => `brief:${encodeURIComponent(place)}`),
      ...(changes.deletedRunIds ?? []).map((id) => `run:${id}`),
    ],
  };
}

/**
 * The records a changeset writes in the account, each chat message on its own (D76). With `before`, the workspace the
 * changeset was made from, a thread writes only what changed in it: the thread record when its title, read count or
 * the like did, and each message that isn't the very one `before` held (edits replace what they change, never change
 * it in place), so a writer never puts back an older copy of a message someone else changed. Without it, all of them.
 * A deleted thread's messages go with it on the server (migration `20261122160000_messages_apart.sql`).
 */
export function accountRecordsOf(changes: Changes, before?: WorkspaceData): Records {
  const { threads = [], ...rest } = changes;
  const { puts, deletes } = recordsOf(rest);
  const was = new Map(before?.threads.map((thread) => [thread.id, thread]));
  for (const thread of threads) {
    const previous = was.get(thread.id);
    const { messages, ...meta } = thread;
    if (!previous || !sameMeta(meta, previous)) puts.push([`thread:${thread.id}`, meta]);
    const had = new Map(previous?.messages.map((message) => [message.id, message]));
    messages.forEach((message, n) => {
      if (had.get(message.id) !== message) puts.push([`message:${thread.id}:${message.id}`, { thread: thread.id, n, message } satisfies MessageRecord]);
    });
    const kept = new Set(messages.map((message) => message.id));
    for (const message of previous?.messages ?? []) if (!kept.has(message.id)) deletes.push(`message:${thread.id}:${message.id}`);
  }
  return { puts, deletes };
}

function sameMeta(meta: Omit<Thread, "messages">, thread: Thread) {
  const { messages: _messages, ...other } = thread;
  const fields = new Set([...Object.keys(meta), ...Object.keys(other)]) as Set<keyof typeof meta>;
  return [...fields].every((field) => JSON.stringify(meta[field]) === JSON.stringify(other[field]));
}

/**
 * Every record of a whole workspace, for `replace`: each thread whole (this browser), or in the `account` each chat
 * message on its own (D76).
 */
export function allRecordsOf(data: WorkspaceData, account = false): [string, unknown][] {
  const { domains, projects, notes, tasks, agents, threads, teams, topics, routineRuns, briefs, everyAgent, memories, runs } = data;
  const changes = { domains, projects, notes, tasks, agents, threads, teams, topics, routineRuns, briefs, everyAgent, memories, runs };
  const rows = account ? accountRecordsOf(changes).puts : [...rowsOf(changes), ["initialized", true] as [string, unknown]];
  return [...rows, ["projectOrder", projects.map((project) => project.id)]];
}

function rowsOf(changes: Changes): [string, unknown][] {
  return [
    ...(changes.projects ?? []).map((item) => [`project:${item.id}`, item] as [string, unknown]),
    ...(changes.notes ?? []).map((item) => [`note:${item.id}`, item] as [string, unknown]),
    ...(changes.tasks ?? []).map((item) => [`task:${item.id}`, item] as [string, unknown]),
    ...(changes.agents ?? []).map((item) => [`agent:${item.id}`, item] as [string, unknown]),
    ...(changes.threads ?? []).map((item) => [`thread:${item.id}`, item] as [string, unknown]),
    ...(changes.memories ?? []).map((item) => [`memory:${item.id}`, item] as [string, unknown]),
    ...(changes.runs ?? []).map((item) => [`run:${item.id}`, item] as [string, unknown]),
    ...(changes.teams ?? []).map((item) => [`team:${item.id}`, item] as [string, unknown]),
    ...(changes.topics ?? []).map((item) => [`topic:${item.id}`, item] as [string, unknown]),
    ...(changes.domains ? [["domains", changes.domains] as [string, unknown]] : []),
    ...(changes.routineRuns ? [["routineRuns", changes.routineRuns] as [string, unknown]] : []),
    ...(changes.everyAgent ? [["everyAgent", changes.everyAgent] as [string, unknown]] : []),
    ...Object.entries(changes.briefs ?? {}).map(([place, mark]) => [`brief:${encodeURIComponent(place)}`, mark] as [string, unknown]),
  ];
}
