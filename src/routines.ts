// Routines: when they come round, who runs them, and what their runner is asked. Pure functions over workspace data;
// conversations.ts sends the request to the agents' engine, so a routine answers like any live reply.
import { agentById, crewOf, nearestOwner, nearestThread, scopeOf, sees, stewardOf } from "./agents.ts";
import { agentTools, atlasId, canUse, kindOf, routineKinds } from "./model.ts";
import { formatDate, locale } from "./dates.ts";
import type { Agent, Note, Routine, RoutineKind, RoutineResult, Thread, WorkspaceData } from "./model.ts";
import type { Change } from "./workspace.ts";
import { datesToPlan, peopleOf } from "./people.ts";

/** The time chips. Picking one stores its time; any other time is exact. */
export const dayparts = [["Morning", "08:00"], ["Midday", "12:30"], ["Evening", "18:00"]] as const;
export const longWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekOrdinals = ["First", "Second", "Third", "Fourth"];
const everyDay = [0, 1, 2, 3, 4, 5, 6];

/**
 * A routine with the usual answers for its kind: check-ins every morning, reports Friday evening, reviews the first
 * Monday, improvements Monday mornings.
 */
export function newRoutine(kind: RoutineKind, since: string): Routine {
  const id = crypto.randomUUID();
  if (kind === "report") return { id, kind, time: "18:00", repeat: { every: "week", days: [5], weeks: 1 }, since };
  if (kind === "review") return { id, kind, time: "08:00", repeat: { every: "month", week: 1, weekday: 1 }, since, quietDays: 60 };
  if (kind === "improve") return { id, kind, time: "08:00", repeat: { every: "week", days: [1], weeks: 1 }, since };
  return { id, kind, time: "08:00", repeat: { every: "week", days: everyDay, weeks: 1 }, since };
}

/** The weekday (1 Monday to 5 Friday) the `index`th agent's weekly improvement falls on, so the crew takes turns. */
export const turnDay = (index: number) => (index % 5) + 1;
const weeklyOn = (routine: Routine, day: number): Routine => ({ ...routine, repeat: { every: "week", days: [day], weeks: 1 } });

/**
 * What an agent does on its own until you change it (agents-design D68): Atlas checks in every morning, for every note
 * nobody else checks in on, and reviews everything on Mondays; every other agent suggests improvements once a week, on
 * the weekday its `turn` gives it.
 */
export function defaultRoutines(agentId: string, turn: number, since: string): Routine[] {
  if (agentId === atlasId) return [newRoutine("check-in", since), weeklyOn(newRoutine("review", since), 1)];
  return [weeklyOn(newRoutine("improve", since), turnDay(turn))];
}

/** Routines set up before this day may still be the default every agent used to get. */
const oldDefaultsEnd = "2026-11-20";
/**
 * The agent with today's default routines when it still has the one it used to get, a check-in at 08:00 every
 * morning or on one weekday, set up before D68; anything the person changed stays. Atlas keeps his check-in and gains
 * the Monday review. Returns the same object when nothing changes.
 */
export function withCurrentRoutines(agent: Agent, turn: number, since: string): Agent {
  const [only, ...rest] = agent.routines ?? [];
  const old = !!only && !rest.length && only.kind === "check-in" && only.time === "08:00" && !only.paused
    && only.repeat.every === "week" && only.repeat.weeks === 1 && (only.repeat.days.length === 1 || only.repeat.days.length === 7)
    && (!only.since || only.since < oldDefaultsEnd);
  if (!old) return agent;
  const [checkIn, ...added] = defaultRoutines(agent.id, turn, since);
  return { ...agent, routines: agent.id === atlasId ? [{ ...only, repeat: checkIn.repeat }, ...added] : [checkIn, ...added] };
}

const day = (date: Date, offset = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
const timed = (date: Date, time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
};
const monday = (date: Date) => day(date, -((date.getDay() + 6) % 7));
/** Every-N-weeks counts from the week it was set up; older routines count from a known Monday. */
const anchor = (routine: Routine) => monday(routine.since ? new Date(routine.since) : new Date(2024, 0, 1));

/** Whether the routine falls on `date`'s day, whatever the time. */
export function occursOn(routine: Routine, date: Date) {
  const { repeat } = routine;
  if (repeat.every === "week") {
    if (!repeat.days.includes(date.getDay())) return false;
    // Rounding absorbs daylight-saving hours between the two Mondays.
    const weeks = Math.round((monday(date).getTime() - anchor(routine).getTime()) / (7 * 864e5));
    return ((weeks % repeat.weeks) + repeat.weeks) % repeat.weeks === 0;
  }
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  if ("day" in repeat) return date.getDate() === (repeat.day < 0 ? last : Math.min(repeat.day, last));
  if (date.getDay() !== repeat.weekday) return false;
  return repeat.week < 0 ? date.getDate() + 7 > last : Math.ceil(date.getDate() / 7) === repeat.week;
}

/** The latest time it came due at or before `now`, looking back two months; null for none. */
export function lastDue(routine: Routine, now: Date) {
  for (let back = 0; back <= 62; back++) {
    const due = timed(day(now, -back), routine.time);
    if (due <= now && occursOn(routine, due)) return due;
  }
  return null;
}

/** The next `count` times it comes due after `now`. */
export function nextDue(routine: Routine, now: Date, count = 1) {
  const runs: Date[] = [];
  for (let ahead = 0; ahead <= 160 && runs.length < count; ahead++) {
    const due = timed(day(now, ahead), routine.time);
    if (due > now && occursOn(routine, due)) runs.push(due);
  }
  return runs;
}

/** When it should run now: its latest due time, unless paused, set up after that, or already run for it. Missed runs collapse into this one. */
export function dueNow(routine: Routine, now: Date, ran?: string) {
  const due = !routine.paused && lastDue(routine, now);
  if (!due || (ran && new Date(ran) >= due) || (routine.since && new Date(routine.since) > due)) return null;
  return due;
}

/** Times it comes due from `from` up to `to`, both inclusive. */
export function runsBetween(routine: Routine, from: Date, to: Date) {
  const runs: Date[] = [];
  for (let date = day(from); date <= to; date = day(date, 1)) {
    const due = timed(date, routine.time);
    if (due >= from && due <= to && occursOn(routine, due)) runs.push(due);
  }
  return runs;
}

const timeFormat = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
const ordinal = (n: number) => `${n}${({ one: "st", two: "nd", few: "rd" } as Record<string, string>)[new Intl.PluralRules("en", { type: "ordinal" }).select(n)] ?? "th"}`;
export const timeLabel = (time: string) => timeFormat.format(timed(new Date(), time));
const sameDays = (a: number[], b: number[]) => a.length === b.length && b.every((item) => a.includes(item));

/** How often, in a phrase: "Every day", "Mon and Thu, every 2 weeks", "First Monday of the month". */
export function repeatLabel({ repeat }: Routine) {
  if (repeat.every === "week") {
    const days = [1, 2, 3, 4, 5, 6, 0].filter((item) => repeat.days.includes(item)).map((item) => longWeekdays[item].slice(0, 3));
    const base = sameDays(repeat.days, everyDay) ? "Every day" : sameDays(repeat.days, [1, 2, 3, 4, 5]) ? "Weekdays"
      : !days.length ? "No days picked" : days.length === 1 ? `${longWeekdays[repeat.days[0]]}s` : `${days.slice(0, -1).join(", ")} and ${days.at(-1)}`;
    return repeat.weeks > 1 && days.length ? `${base}, every ${repeat.weeks} weeks` : base;
  }
  if ("day" in repeat) return repeat.day < 0 ? "Last day of the month" : `The ${ordinal(repeat.day)} of each month`;
  return `${repeat.week < 0 ? "Last" : weekOrdinals[repeat.week - 1]} ${longWeekdays[repeat.weekday]} of the month`;
}

/** "Tomorrow, 08:00", "Fri 24 Oct, 18:00": when, specifically, with no counting on your fingers. */
export function whenLabel(due: Date, now: Date) {
  const days = Math.round((day(due).getTime() - day(now).getTime()) / 864e5);
  const date = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday"
    : formatDate(due, { weekday: "short", day: "numeric", month: "short" });
  return `${date}, ${timeFormat.format(due)}`;
}
/** "in 3 days", "in 5 hours". */
export function fromNow(due: Date, now: Date) {
  const days = Math.round((day(due).getTime() - day(now).getTime()) / 864e5);
  if (days > 0) return `in ${days} ${days === 1 ? "day" : "days"}`;
  const hours = Math.max(1, Math.round((due.getTime() - now.getTime()) / 36e5));
  return due <= now ? "due now" : `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/** Whose routine it is: an agent's own, or a domain's or project's. */
export type RoutineOwner = { kind: "agent" | "domain" | "project"; id: string };
export type PlacedRoutine = { routine: Routine; owner: RoutineOwner };
export type AdmittedRoutine = PlacedRoutine & { runner: Agent; due: Date };

/** Every routine that can run: agents', then domains', then projects'. Archived agents, domains, and projects rest. */
export function routinesOf(data: WorkspaceData): PlacedRoutine[] {
  const live = new Set(data.domains.filter((domain) => !domain.archived).map((domain) => domain.name));
  const placed = (kind: RoutineOwner["kind"], id: string, routines: Routine[] = []) => routines.map((routine) => ({ routine, owner: { kind, id } }));
  return [
    ...data.agents.filter((agent) => !agent.archived).flatMap((agent) => placed("agent", agent.id, agent.routines)),
    ...data.domains.filter((domain) => !domain.archived).flatMap((domain) => placed("domain", domain.name, domain.routines)),
    ...data.projects.filter((project) => !project.archived && live.has(project.area)).flatMap((project) => placed("project", project.id, project.routines)),
  ];
}
/** An owner as one string ("project:beds"), for keys and form values; `ownerFromKey` reads it back. */
export const ownerKey = (owner: RoutineOwner) => `${owner.kind}:${owner.id}`;
export const ownerFromKey = (key: string): RoutineOwner => ({ kind: key.slice(0, key.indexOf(":")) as RoutineOwner["kind"], id: key.slice(key.indexOf(":") + 1) });
/** Every owner with routines, in `routinesOf` order, each once. */
export function ownersOf(data: WorkspaceData): RoutineOwner[] {
  const seen = new Set<string>();
  return routinesOf(data).map(({ owner }) => owner).filter((owner) => !seen.has(ownerKey(owner)) && seen.add(ownerKey(owner)));
}

/** The records behind an owner: the agent, or the project and the domain it sits in. One lookup for every question below. */
function recordsOf(data: WorkspaceData, owner: RoutineOwner) {
  if (owner.kind === "agent") return { agent: agentById(data, owner.id) };
  const project = owner.kind === "project" ? data.projects.find((item) => item.id === owner.id) : undefined;
  return { project, domain: data.domains.find((item) => item.name === (project?.area ?? owner.id)) };
}

/** One owner as a page shows it: its routines, who runs them, and the project and domain it sits in (none for an agent). */
export function ownerOf(data: WorkspaceData, owner: RoutineOwner) {
  const { agent, project, domain } = recordsOf(data, owner);
  return { routines: (agent ?? project ?? domain)?.routines ?? [], runner: runnerOf(data, owner), label: ownerLabel(data, owner), project, domain };
}

/** Who runs it: the agent itself, or the place's nearest owner (first crew member, the domain's agent, then Atlas). */
export function runnerOf(data: WorkspaceData, owner: RoutineOwner): Agent {
  const { agent, project } = recordsOf(data, owner);
  if (owner.kind === "agent") return agent!;
  return (project && crewOf(data, project)[0]) || stewardOf(data, project?.area ?? owner.id) || agentById(data, atlasId)!;
}

/** Where it posts: the agent's own thread, or wherever chat opens for that place. */
export function threadFor(data: WorkspaceData, owner: RoutineOwner) {
  if (owner.kind === "agent") return `agent:${owner.id}`;
  const { project } = recordsOf(data, owner);
  return project ? nearestThread(data, project.area, project.id) : nearestThread(data, owner.id);
}

/** The name of whose routine it is. */
export function ownerLabel(data: WorkspaceData, owner: RoutineOwner) {
  const { agent, project } = recordsOf(data, owner);
  return owner.kind === "agent" ? agent?.name ?? "Agent" : owner.kind === "project" ? project?.title ?? "Project" : owner.id;
}

/** The tools the runner lacks for it, by label; empty when it can run. */
const missingTools = (agent: Agent, kind: RoutineKind) =>
  routineKinds[kind].needs.filter((tool) => !canUse(agent, tool)).map((tool) => agentTools[tool].label);

/** How many results each routine keeps (D68): enough for the strip of recent runs and a few to look back on. */
export const keptRuns = 10;
/**
 * Records how a run went (D68) and drops that routine's results beyond the newest `keptRuns`. A second record of the
 * same run (another device, or the routines function) replaces the first.
 */
export function recordRun(data: WorkspaceData, result: Omit<RoutineResult, "id">): Change {
  const recorded: RoutineResult = { id: `${result.routineId}@${result.due}`, ...result };
  const others = data.runs.filter((item) => item.id !== recorded.id);
  const mine = [...others.filter((item) => item.routineId === result.routineId), recorded].sort((a, b) => a.due.localeCompare(b.due));
  const dropped = new Set(mine.slice(0, Math.max(0, mine.length - keptRuns)).map((item) => item.id));
  const runs = [...others, recorded].filter((item) => !dropped.has(item.id)).sort((a, b) => a.due.localeCompare(b.due));
  return { data: { ...data, runs }, changes: {
    ...dropped.has(recorded.id) ? {} : { runs: [recorded] },
    ...dropped.size ? { deletedRunIds: [...dropped].filter((id) => id !== recorded.id) } : {},
  } };
}
/** A routine's kept results, newest first. */
export const resultsOf = (data: WorkspaceData, routineId: string) => data.runs.filter((item) => item.routineId === routineId).reverse();
/** How long past its time a run may finish before it counts as missed by the server while you were away (D69). */
export const lateAfterMs = 60 * 60_000;
/**
 * Runs in the last week that finished more than an hour after their time (D69). With routines running while you're
 * away, the server runs each within 15 minutes, so one this late means it didn't, and the app ran it when you opened it.
 */
export const lateRuns = (runs: RoutineResult[], now: Date) => runs.filter((run) => now.getTime() - Date.parse(run.at) < 7 * 864e5
  && Date.parse(run.at) - Date.parse(run.due) > lateAfterMs);

/** When a routine last ran: its receipt, or the newest message it posted when the receipt is missing. -Infinity if never. */
export function lastRunOf(data: WorkspaceData, routineId: string) {
  let last = data.routineRuns[routineId] ? Date.parse(data.routineRuns[routineId]) : -Infinity;
  for (const thread of data.threads) {
    for (const message of thread.messages) {
      if (message.routine?.id === routineId) last = Math.max(last, Date.parse(message.routine.due));
    }
  }
  return last;
}

/**
 * Whether a routine can run (D25): who runs it, the tools it lacks by label, whether it may run at all (`permitted`)
 * and on schedule (`enabled`), the due time it would run for now, and the instant Run now would run it for.
 */
export type Readiness = { runner: Agent; missing: string[]; permitted: boolean; enabled: boolean; due: Date | null; manualDue: Date | null };
/** Shared scheduled/manual eligibility. Posted messages also count as receipts when the run record is missing. */
export function readinessOf(data: WorkspaceData, { routine, owner }: PlacedRoutine, now: Date): Readiness {
  const runner = runnerOf(data, owner);
  const missing = missingTools(runner, routine.kind);
  const project = owner.kind === "project" ? data.projects.find((item) => item.id === owner.id) : undefined;
  const domain = owner.kind === "agent" ? undefined : data.domains.find((item) => item.name === (project?.area ?? owner.id));
  const live = !runner.archived && (owner.kind === "agent"
    || !!domain && !domain.archived && (owner.kind === "domain" || !!project && !project.archived));
  const permitted = live && !missing.length;
  const enabled = permitted && !routine.paused;
  const last = lastRunOf(data, routine.id);
  const fresh = (due: Date | null) => due && due.getTime() > last ? due : null;
  return {
    runner, missing, permitted, enabled,
    due: fresh(enabled ? dueNow(routine, now) : null),
    // Run now ignores pause and cadence, not tools, archived owners or an existing receipt for this instant.
    manualDue: fresh(permitted ? now : null),
  };
}

/** What a routine's runner says when a run finds nothing worth posting. */
const quiet = "NOTHING NEW";
/**
 * Whether a routine's reply is the runner saying it found nothing: `NOTHING NEW`, or a short line that says so in other
 * words, bold or not. On Workers AI, 4 of 6 quiet check-ins on 2026-11-19 answered “**No new tasks to add**.” or
 * “Nothing new to propose.”, which then posted as messages (agents-design D69).
 */
export const isQuiet = (text: string) => {
  const plain = text.replace(/[*_`#>]/g, "").trim().replace(/[.!]+$/, "").toLocaleLowerCase();
  return plain === "nothing new" || plain.split(/\s+/).length <= 8 && /^(nothing (new|to (add|propose|change|do))|no (new|changes|updates)\b)/.test(plain);
};

/** The command a routine answers with when it answers with a change at all; the others answer in words. */
const commandOf: Partial<Record<RoutineKind, string>> = { "check-in": "propose_tasks", review: "review_changes" };
/** Whether `kind` answers with a proposal or `NOTHING NEW`, never prose (check-ins and reviews). */
export const proposesOnly = (kind: RoutineKind) => kind in commandOf;
/**
 * The request asked once more when such a routine answered in prose (D69): in several check-ins on Workers AI on
 * 2026-11-19 the model listed the tasks as text, or wrote the call's JSON into the reply, instead of calling the command.
 */
export const proseNudge = (request: string, kind: RoutineKind) =>
  `${request} Your last answer wrote the changes as text, which the person can't apply. Make them one ${request.includes("plan_day") ? "propose_tasks or plan_day"
    : commandOf[kind]} call now, or answer exactly ${quiet}.`;

/** A note's or task's place. */
type Placed = Pick<Note, "domain" | "projectId">;
/**
 * Who checks in on a place's notes (D68): its nearest owner when that agent has a check-in on, else Atlas, so one
 * morning check-in covers every place whose own agent doesn't keep one.
 */
function checkerOf(data: WorkspaceData, home: Placed) {
  const nearest = nearestOwner(data, home);
  return nearest.routines?.some((routine) => routine.kind === "check-in" && !routine.paused) ? nearest.id : atlasId;
}
/**
 * Where a routine looks (shared with the check for news, D67): a domain's or project's routine that place; an agent's
 * report, review and improvement everything it looks after; its check-in only the places it checks in on
 * (`checkerOf`), named in `names`, so two agents never propose the same note twice. Null when that leaves nowhere to look.
 */
export function coveredBy(data: WorkspaceData, { routine, owner }: PlacedRoutine): { covered: (item: Placed) => boolean; names?: string } | null {
  const project = owner.kind === "project" ? data.projects.find((item) => item.id === owner.id) : undefined;
  const own = (item: Placed) => project ? item.projectId === project.id : item.domain === owner.id;
  if (owner.kind !== "agent") return { covered: own, names: project ? `${project.area} / ${project.title}` : owner.id };
  if (routine.kind !== "check-in") {
    const scope = scopeOf(data, owner.id);
    return { covered: (item) => sees(scope, item) };
  }
  const liveDomains = new Set(data.domains.filter((domain) => !domain.archived).map((domain) => domain.name));
  const homes = [...[...liveDomains].map((domain) => ({ domain, projectId: "", name: domain })),
    ...data.projects.filter((item) => !item.archived && liveDomains.has(item.area)).map((item) => ({ domain: item.area, projectId: item.id, name: `${item.area} / ${item.title}` }))];
  const mine = homes.filter((home) => checkerOf(data, home) === owner.id);
  return mine.length ? { covered: (item) => mine.some((home) => home.domain === item.domain && home.projectId === item.projectId), names: mine.map((home) => home.name).join("; ") } : null;
}

/** `today` (YYYY-MM-DD) less `days`. */
const daysBefore = (today: string, days: number) => {
  const [year, month, date] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date - days)).toISOString().slice(0, 10);
};
const listed = (items: string[], most = 3) => items.slice(0, most).map((item) => `“${item}”`).join(", ") + (items.length > most ? ` and ${items.length - most} more` : "");

/**
 * What a routine asks its runner, as a chat request: where to look (`coveredBy`) and what to do there, through the
 * same tools as a chat reply. Null when there's nowhere to look: the run is quiet without a model call. Check-ins and
 * reviews may find nothing; then the runner answers `quiet` and nothing is posted.
 */
export function routineRequest(data: WorkspaceData, placed: PlacedRoutine, today = new Date().toLocaleDateString("en-CA")): string | null {
  const { routine, owner } = placed;
  const project = owner.kind === "project" ? data.projects.find((item) => item.id === owner.id) : undefined;
  const lead = `This is your scheduled ${routineKinds[routine.kind].label.toLocaleLowerCase()}, not a message from the person; they'll read your answer in this chat later.`;
  const liveDomains = new Set(data.domains.filter((domain) => !domain.archived).map((domain) => domain.name));
  const liveProjects = new Set(data.projects.filter((item) => !item.archived && liveDomains.has(item.area)).map((item) => item.id));
  const notesIn = (covered: (item: Placed) => boolean) => data.notes.filter((note) => !note.archived && kindOf(note) === "note"
    && liveDomains.has(note.domain) && (!note.projectId || liveProjects.has(note.projectId)) && covered(note));
  const looks = coveredBy(data, placed);
  if (!looks) return null;
  const { covered } = looks;
  if (routine.kind === "check-in") {
    // Named, because a model reading every note it can see proposed from notes another check-in covers (2026-11-14).
    const titles = notesIn(covered).slice(0, 12).map((note) => `“${note.title || "Untitled"}”`);
    // One place keeps the wording measured before D68; a check-in across several (Atlas's) may file up to eight, each where it belongs.
    const many = !!looks.names?.includes(";");
    const notes = `${lead} Read the notes in ${looks.names}${titles.length ? ` (${titles.join(", ")}), and only those,` : ""} for things that should become tasks and aren't open tasks yet, and propose ${many ? "up to eight with propose_tasks, each in the place it belongs" : "up to three with propose_tasks in the place they belong"}.`;
    return notes + dayPlanAsk(data, placed, today) + ` Answer with that proposal or exactly ${quiet}; never list task ideas in prose instead.`;
  }
  const where = owner.kind === "agent" ? "everything you look after" : project ? `${project.area} / ${project.title}` : owner.id;
  if (routine.kind === "report") return `${lead} Report on ${where}: what's open, what's late, and where you'd start, in two or three sentences. If nothing is open, say so in one.`;
  if (routine.kind === "improve") return improveRequest(data, placed, { lead, where, today, covered: (item) => liveDomains.has(item.domain) && (!item.projectId || liveProjects.has(item.projectId)) && covered(item) });
  // Ticked checklist lines that name an open task, spelled out: a model left one to read_notes and moved the task
  // to a new day instead of ticking it off (2026-11-14). Only for a runner that may read notes.
  const open = data.tasks.filter((task) =>
    !task.done && liveDomains.has(task.domain) && (!task.projectId || liveProjects.has(task.projectId)) && covered(task));
  const ticked = canUse(runnerOf(data, owner), "read-notes") ? notesIn(covered).flatMap((note) => [...note.body.matchAll(/^\s*[-*]\s*\[x\]\s*(.+)$/gim)]
    .flatMap(([, line]) => open.filter((task) => task.title.toLocaleLowerCase() === line.trim().toLocaleLowerCase()).map((task) => `“${task.title}” (in “${note.title || "Untitled"}”)`))) : [];
  return `${lead} Review ${where}: tick off open tasks the notes mark done, give overdue tasks new days (today or soon, never past a finish line), ${project ? "" : "file tasks sitting in a domain into the project of theirs they're plainly a step of, "}and archive projects that review_changes lists as quiet, all in one review_changes call.`
    + (ticked.length ? ` Notes tick these open tasks off, so complete them rather than move them: ${[...new Set(ticked)].join("; ")}.` : "")
    + ` If nothing needs changing, answer exactly: ${quiet}`;
}

/**
 * Atlas's morning check-in also plans the day (agents-design D75): when no note needs a new task, it puts up to three
 * open tasks due by today at times that suit them with plan_day, each with a reason, around the times already held;
 * Today shows them as next steps. A reply keeps one proposal, so new tasks from notes come first. Other agents'
 * check-ins, and an Atlas who may not see tasks, read notes only.
 */
function dayPlanAsk(data: WorkspaceData, { owner }: PlacedRoutine, today: string) {
  if (owner.kind !== "agent" || owner.id !== atlasId || !canUse(runnerOf(data, owner), "see-tasks")) return "";
  const live = new Set(data.domains.filter((domain) => !domain.archived).map((domain) => domain.name));
  const open = data.tasks.filter((task) => !task.done && task.due && task.due <= today && live.has(task.domain));
  const unplaced = open.filter((task) => !(task.due === today && task.at)).map((task) => task.title);
  if (!unplaced.length) return "";
  const held = open.filter((task) => task.due === today && task.at && /^\d\d:\d\d$/.test(task.at)).sort((a, b) => a.at!.localeCompare(b.at!))
    .map((task) => `${task.at} “${task.title}”`);
  return ` If no note needs a new task, plan today, ${today}, instead: call plan_day once with up to three of these open tasks at times that suit them,`
    + ` each with one short reason in your words: ${listed(unplaced, 8)}. Times already held: ${held.length ? held.join(", ") : "none"}.`;
}

/** Whether this routine's run would plan the day: Atlas's check-in with open tasks due by today and no place yet (`routineHasNews`). */
export const plansDay = (data: WorkspaceData, placed: PlacedRoutine, today: string) => placed.routine.kind === "check-in" && dayPlanAsk(data, placed, today) !== "";

/**
 * The people a routine's runner reads about (D71) whose dates come up with nothing planned: an agent's, the people of
 * the domains it looks after (Atlas, everyone's); a domain's, its own; a project's, none.
 */
export function datesToPlanFor(data: WorkspaceData, { owner }: PlacedRoutine, today: string) {
  const live = new Set(data.domains.filter((domain) => !domain.archived).map((domain) => domain.name));
  const scope = owner.kind === "agent" ? scopeOf(data, owner.id) : undefined;
  const reads = (domain: string) => owner.kind === "domain" ? domain === owner.id : !!scope && (scope.all || live.has(domain) && scope.domains.has(domain));
  return owner.kind === "project" ? [] : datesToPlan(data, peopleOf(data.topics).filter((person) => reads(person.person.domain)), today);
}

/**
 * A weekly improvement (D68), after the omp agents' self-review: the week's evidence in a few facts, the runner's own
 * routines, and what it suggested last time and whether the person took any of it, so it never repeats a suggestion
 * they passed over. It changes nothing: it numbers up to three suggestions and offers them as answers to tap, and the
 * person's pick reaches it as a chat message, where it makes the proposal.
 */
function improveRequest(data: WorkspaceData, placed: PlacedRoutine,
  { lead, where, today, covered }: { lead: string; where: string; today: string; covered: (item: Placed) => boolean }) {
  const { owner } = placed;
  const dates = datesToPlanFor(data, placed, today);
  const weekAgo = daysBefore(today, 7);
  const tasks = data.tasks.filter(covered);
  const done = tasks.filter((task) => task.done && (task.updatedAt ?? "") >= weekAgo);
  const late = tasks.filter((task) => !task.done && task.due && task.due < today).sort((a, b) => a.due.localeCompare(b.due));
  const stalled = data.projects.filter((project) => !project.archived && covered({ domain: project.area, projectId: project.id })
    && !tasks.some((task) => task.projectId === project.id && !task.done));
  const runner = runnerOf(data, owner);
  const own = owner.kind === "agent" ? (runner.routines ?? []) : [];
  const facts = [`In the last 7 days ${done.length} ${done.length === 1 ? "task was" : "tasks were"} done`,
    late.length ? `${late.length} open ${late.length === 1 ? "task is" : "tasks are"} late (oldest ${listed(late.map((task) => `${task.title}, due ${task.due}`))})` : "nothing is late",
    stalled.length ? `${listed(stalled.map((project) => project.title))} ${stalled.length === 1 ? "has" : "have"} no open step` : "",
    own.length ? `your routines: ${own.map((routine) => `${routineKinds[routine.kind].label}, ${repeatLabel(routine)} at ${routine.time}${routine.paused ? " (paused)" : ""}`).join("; ")}` : "",
    // People's dates coming up with no task for them yet, and their other open tasks to judge by (agents-design D71).
    dates.length ? `coming up with nothing planned: ${dates.slice(0, 3).map(({ person, next, open }) =>
      `@${person.name}'s ${next.date.label.toLocaleLowerCase()} on ${next.day}, in ${next.days} ${next.days === 1 ? "day" : "days"}`
      + (open.length ? ` (open tasks naming them: ${listed(open, 2)})` : "")).join("; ")}` : "",
  ].filter(Boolean).join("; ");
  const thread = data.threads.find((item) => item.id === threadFor(data, owner));
  const lastAt = thread?.messages.findLastIndex((message) => message.routine?.kind === "improve") ?? -1;
  const last = lastAt >= 0 ? thread!.messages[lastAt] : undefined;
  const answered = last && (last.display?.picked ?? thread!.messages.slice(lastAt + 1).find((message) => message.role === "user")?.text);
  // What came of the pick (D69): the first proposal the agent made after it, and what the person did with it.
  const made = last && answered ? thread!.messages.slice(lastAt + 1).find((message) => message.role === "agent" && message.proposal)?.proposal : undefined;
  const fate = !made ? "" : made.status === "applied" ? " The change you proposed after it was applied, so start with one line on whether this week's evidence shows it helped; if it didn't, suggest undoing or adjusting it."
    : made.status === "pending" ? " The change you proposed after it still waits for the person; don't suggest it again."
    : ` The person ${made.status === "undone" ? "undid" : "rejected"} the change you proposed after it; don't suggest it again.`;
  const before = last ? ` Last time you suggested: “${last.text.slice(0, 400)}”. ${answered ? `The person answered “${answered.slice(0, 80)}”.${fate}` : "The person took none of it, so suggest none of it again unless this week gives new evidence."}` : "";
  return `${lead} Look back at the last week in ${where}. ${facts}.${before}`
    + " Suggest at most three changes that would help most next week, best first, numbered, each in one or two sentences with the evidence from the week:"
    + " next steps for a project that stalled, a better day or a smaller size for tasks that keep slipping, a routine to add, move or drop, a change to your house rules, or how a page is arranged."
    + (dates.length ? " For the soonest date coming up with nothing planned, unless an open task naming them already prepares for it, one suggestion is a task to prepare for it (a gift, a call, a plan), named with the person's @name and due a few days before." : "")
    + " Change nothing yourself, and end by asking which to do."
    + ` If nothing would clearly help, answer exactly: ${quiet}`;
}

/**
 * The answers to tap under a weekly improvement (D68): “Do 1” for each numbered suggestion its reply makes, then “Not
 * now”. The runner adds them, not the model: on Workers AI the model wrote offer_choices out as text in 3 of 3 runs.
 */
export function improveChoices(text: string): string[] | undefined {
  const numbers = [...new Set([...text.matchAll(/^\s*\**([1-3])[.)]\**\s/gm)].map(([, number]) => Number(number)))].sort();
  return numbers.length ? [...numbers.map((number) => `Do ${number}`), "Not now"] : undefined;
}
/** A weekly improvement still waiting for your pick (D69): whose, in which chat, and its first suggestion's words. */
export type WaitingIdea = { thread: string; agent: Agent; count: number; first: string };
/**
 * The weekly improvements whose answers nobody tapped and nobody wrote after (as `ChoiceChips` shows them open),
 * newest first, one per chat.
 */
export function waitingIdeas(threads: Thread[], agents: Agent[]): WaitingIdea[] {
  return threads.flatMap((thread) => {
    const at = thread.messages.findLastIndex((message) => message.routine?.kind === "improve" && !!message.display?.choices?.length);
    const message = thread.messages[at];
    if (!message || message.display!.picked || thread.messages.slice(at + 1).some((later) => later.role === "user")) return [];
    const agent = agents.find((item) => item.id === (message.agentId ?? atlasId) && !item.archived);
    // The first suggestion's headline: its bold words when it has them, else its first sentence.
    const line = message.text.match(/^\s*\**1[.)]\**\s+(.+)$/m)?.[1] ?? "";
    const first = (line.match(/^\*\*(.+?)\*\*/)?.[1] ?? line.match(/^[^.!?]+[.!?]?/)?.[0] ?? "").replace(/[*_]/g, "").trim();
    return agent ? [{ thread: thread.id, agent, count: message.display!.choices!.filter((choice) => choice !== "Not now").length, first, at: message.at ?? "" }] : [];
  }).sort((a, b) => b.at.localeCompare(a.at)).map(({ at: _at, ...idea }) => idea);
}

/** Ordinary writes preserve every newer receipt; only a deliberate whole-Workspace restore may reset them. */
export function mergeRoutineRuns(stored: WorkspaceData["routineRuns"], incoming: WorkspaceData["routineRuns"]) {
  const merged = { ...stored };
  for (const [id, due] of Object.entries(incoming)) {
    const previous = Date.parse(merged[id] ?? "");
    if (!Number.isFinite(previous) || Date.parse(due) > previous) merged[id] = due;
  }
  return merged;
}
