// What the agent function is doing for this account (agents-design D76), read from the jobs themselves
// (`public.agent_jobs`: state, the step it's on, why it failed), never from the workspace, which a phone only reloads
// when the app comes back into view (launch plan R3). The chat says what each reply or hand-off is doing, the faces of
// agents at work show it, and when a job ends the page reloads the workspace for what it landed. No browser APIs, since
// agents.ts (which the Edge Functions import) asks it whether a job is open.

export type JobState = "waiting" | "running" | "done" | "failed";
/**
 * One job as the account may read it: whose answer (`agentId`), where it lands, where it may run or waits (`runsOn`:
 * `server`, `device:…` while a reply waits for the files of the device that asked, `computer:<id>` once it reads a
 * folder on one of the account's computers, D77). A `tidy` (D79) is your Apply or Undo of a tidy on the agent's
 * message it names, waiting for the computer its files are on.
 */
export type Job = {
  id: string; kind: "reply" | "handoff" | "tidy"; agentId: string; threadId: string; messageId: string; runsOn: string; state: JobState;
  progress?: string; error?: string; runs: number; createdAt: string; endedAt?: string;
};

/** The account's newest 30 jobs, with only the columns it may read. */
export const jobsQuery = "agent_jobs?select=id,kind,agent_id,thread_id,message_id,runs_on,state,progress,error,runs,created_at,ended_at&order=created_at.desc&limit=30";
/** How often the page asks while a job is open. */
export const watchMs = 4_000;
/** How often a page in view asks while none is, so work another device asked for shows without coming back to the app. */
export const idleMs = 15_000;

const states: Record<string, true> = { waiting: true, running: true, done: true, failed: true };
const text = (value: unknown) => typeof value === "string" ? value : undefined;

/** Rows as PostgREST returns them, kept only when they're whole. */
export function jobsOf(rows: Record<string, unknown>[]): Job[] {
  return rows.flatMap((row): Job[] => {
    const id = text(row.id), agentId = text(row.agent_id), threadId = text(row.thread_id), messageId = text(row.message_id);
    const state = text(row.state), createdAt = text(row.created_at);
    if (!id || !agentId || !threadId || !messageId || !state || !states[state] || !createdAt) return [];
    const progress = text(row.progress), error = text(row.error), endedAt = text(row.ended_at);
    return [{ id, kind: row.kind === "handoff" || row.kind === "tidy" ? row.kind : "reply", agentId, threadId, messageId, runsOn: text(row.runs_on) ?? "server",
      state: state as JobState, runs: typeof row.runs === "number" ? row.runs : 0, createdAt,
      ...progress && { progress }, ...error && { error }, ...endedAt && { endedAt } }];
  });
}

export const isOpen = (job: Job) => job.state === "waiting" || job.state === "running";
/** An open reply or hand-off: its agent is at work on it. A tidy (D79) waits for a computer, not for the agent. */
export const isAnswering = (job: Job) => job.kind !== "tidy" && isOpen(job);

/**
 * What a job waits for when it can't go on here: the files on the device that asked (D47), or the computer its folder
 * is on (D77), by the name `computers` gives it (the projects' folders name their computers).
 */
export function waitsFor(job: Job, computers: ReadonlyMap<string, string> = new Map()): string | undefined {
  if (job.state !== "waiting" || job.runsOn === "server") return undefined;
  return job.runsOn.startsWith("device:") ? "the device that asked" : computers.get(job.runsOn.slice("computer:".length)) ?? "your computer";
}

/** The account's computer a job runs on now (D77, D84), by its id. */
const computerOf = (job: Job) => job.runsOn.startsWith("computer:") ? job.runsOn.slice("computer:".length) : undefined;

/**
 * What the chat says about a message the agent function is answering, from its job: the step it's on, and the
 * computer it's on (D84) when the step doesn't say; what it waits for, and when that's a computer that's off (`off`,
 * ids), that it waits for it to be switched on; or how it ended while the page loads what it landed. Without a job,
 * by what was asked: a hand-off or a reply.
 */
export function jobLine(job: Job | undefined, name: string, background: boolean, computers?: ReadonlyMap<string, string>,
  off: ReadonlySet<string> = new Set()): string {
  const where = job && waitsFor(job, computers);
  const on = job && computerOf(job);
  if (where) return `${name} is waiting for ${where}${on && off.has(on) ? " to be switched on" : ""}…`;
  if (job?.state === "done") return `${name} finished. Loading the answer…`;
  if (job?.state === "failed") return job.error ?? `${name} couldn't finish.`;
  const there = on && computers?.get(on);
  if (job?.progress) return `${job.progress}${there && !/\bcomputers?\b/i.test(job.progress) ? ` on ${there}` : ""}…`;
  return background ? `${name} is working on it in the background…` : `${name} is finishing your answer…`;
}

/** The jobs and asking again for them. */
export type JobWatch = { getSnapshot(): Job[]; subscribe(listener: () => void): () => void; refresh(): Promise<void> };

/**
 * Watches the account's jobs through `read` (the account's rows under row-level security, `Backend.read` in cloud.ts):
 * a look on `refresh` (the page opening, coming back into view, a message waiting), then every `watchMs` while one is
 * open, else every `idleMs` while `awake` (the page is in view). The first look is where it starts; after it, each job
 * that appeared or ended goes to `onNews`.
 */
export function createJobWatch(read: (path: string) => Promise<Record<string, unknown>[]>, onNews: (jobs: Job[]) => void,
  awake: () => boolean = () => true): JobWatch {
  const none: Job[] = [];
  let jobs: Job[] | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let looking: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  async function look() {
    let next: Job[];
    try { next = jobsOf(await read(jobsQuery)); } catch { return; } // offline: the next look tries again
    const before = jobs && new Map(jobs.map((job) => [job.id, job]));
    const news = before ? next.filter((job) => {
      const was = before.get(job.id);
      return !was || isOpen(was) && !isOpen(job);
    }) : [];
    if (JSON.stringify(next) !== JSON.stringify(jobs)) {
      jobs = next;
      for (const listener of listeners) listener();
    }
    if (news.length) onNews(news);
  }
  function refresh(): Promise<void> {
    clearTimeout(timer);
    looking ??= look().finally(() => {
      looking = undefined;
      const wait = jobs?.some(isOpen) ? watchMs : awake() ? idleMs : undefined;
      if (wait) timer = setTimeout(() => void refresh(), wait);
    });
    return looking;
  }
  return {
    getSnapshot: () => jobs ?? none,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    refresh,
  };
}
