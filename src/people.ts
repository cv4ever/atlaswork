// People (agents-design D71): Library topics with a person part. Their dates come round each year, @Name mentions in
// notes, tasks, projects and chats link to them (a plain name too, when nothing else in the workspace shares it), and
// renaming a person rewrites their @mentions. Pure; people.test.ts covers it.
import { addDays, daysBetween } from "./dates.ts";
import { domainHues } from "./model.ts";
import type { Person, PersonDate, Topic, WorkspaceData } from "./model.ts";

/** The colours a person's face can take, by name. */
export const personHues = (["Clay", "Marigold", "Sage", "Lagoon", "Sky", "Iris", "Plum", "Rose"] as const).map((name) => [name, domainHues[name]] as const);

export type PersonTopic = Topic & { person: Person };
export const isPerson = (topic: Topic | undefined): topic is PersonTopic => !!topic?.person;

/** Live people, by name. */
export const peopleOf = (topics: Topic[]): PersonTopic[] =>
  topics.filter((topic): topic is PersonTopic => isPerson(topic) && !topic.archived).sort((a, b) => a.name.localeCompare(b.name));

/** A new person's part: no relationship yet, the domain they belong to, a colour. */
export const newPerson = (domain: string, hue: string): Person => ({ relation: "", domain, hue, dates: [] });

/** Their initials for the face: "Ana Costa" is AC, "Mãe" is M. */
export const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => [...word][0]?.toLocaleUpperCase() ?? "").join("") || "?";

/** When a date next comes round: the day (YYYY-MM-DD), how many days off, and the years it marks when the year is known. */
export type NextDate = { date: PersonDate; day: string; days: number; years?: number };

/** A month and day in `year`; 29 February falls on the 28th outside leap years. */
function dayIn(year: number, monthDay: string) {
  const [month, day] = monthDay.split("-").map(Number);
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(month === 2 && day === 29 && !leap ? 28 : day).padStart(2, "0")}`;
}

/** The next time `date` comes round on or after `today`; nothing for a date that isn't one. */
export function nextOf(date: PersonDate, today: string): NextDate | undefined {
  const match = /^(\d{4}|-)-(\d{2})-(\d{2})$/.exec(date.date);
  if (!match) return undefined;
  const monthDay = `${match[2]}-${match[3]}`;
  const year = Number(today.slice(0, 4));
  const day = dayIn(year, monthDay) >= today ? dayIn(year, monthDay) : dayIn(year + 1, monthDay);
  const born = match[1] === "-" ? undefined : Number(match[1]);
  const years = born !== undefined && born < Number(day.slice(0, 4)) ? Number(day.slice(0, 4)) - born : undefined;
  return { date, day, days: daysBetween(today, day), ...years !== undefined && { years } };
}

/** A person's dates in the order they next come round. */
export const datesAhead = (person: Person, today: string) =>
  person.dates.flatMap((date) => nextOf(date, today) ?? []).sort((a, b) => a.days - b.days);

/** "today", "tomorrow", "in 12 days", "in 5 weeks", "in 3 months". */
export function inWords(days: number) {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 21) return `in ${days} days`;
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30.4)} months`;
}

/** "Birthday, turns 34" for a birthday whose year is known; else the label. */
export const nextLabel = (next: NextDate) => next.years && /birthday/i.test(next.date.label) ? `${next.date.label}, turns ${next.years}` : next.date.label;

/** How many days ahead an agent's weekly improvement looks for a person's date nobody has planned for yet. */
export const planAhead = 21;

/**
 * The dates of `people` within `planAhead` days that nothing plans for yet (D71): no task names both the person and
 * the date ("Sofia's birthday gift"), open or finished in the six weeks before it (the gift already bought). `open` is
 * their other open tasks ("Call Sofia about Sunday dinner"), for the agent to judge whether one prepares for it. Soonest first.
 */
export function datesToPlan(data: WorkspaceData, people: PersonTopic[], today: string) {
  const plain = plainNames(data);
  const naming = (person: PersonTopic) => data.tasks.filter((task) => mentions(task.title, person, plain));
  const planned = (person: PersonTopic, next: NextDate) => naming(person).some((task) => task.title.toLocaleLowerCase()
    .includes(next.date.label.toLocaleLowerCase()) && (!task.done || (task.updatedAt ?? "").slice(0, 10) >= addDays(next.day, -42)));
  return people.flatMap((person) => datesAhead(person.person, today).filter((next) => next.days <= planAhead && !planned(person, next))
    .map((next) => ({ person, next, open: naming(person).filter((task) => !task.done).map((task) => task.title) })))
    .sort((a, b) => a.next.days - b.next.days);
}

/** One line about a person for their agents: who they are, their domain, and their next date with its day. */
export function aboutLine(person: Person, today: string) {
  const next = datesAhead(person, today)[0];
  return [person.relation.trim(), person.domain && `in ${person.domain}`, next && `${nextLabel(next)} on ${next.day} (${inWords(next.days)})`]
    .filter(Boolean).join("; ");
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `name` as a whole word, after an @ unless `plain`; never inside an e-mail address or another word. */
const nameAt = (name: string, plain: boolean) => new RegExp(`(?<![\\p{L}\\p{N}@.])${plain ? "@?" : "@"}${escape(name.trim())}(?![\\p{L}\\p{N}@])`, "iu");

/**
 * The people whose plain name counts as a mention (Q1 of D71): a name of three or more letters that no other person,
 * agent, domain, project or topic shares. Others need their @.
 */
export function plainNames(data: Pick<WorkspaceData, "topics" | "agents" | "domains" | "projects">) {
  const count = new Map<string, number>();
  const names = [...data.topics.map((topic) => topic.name), ...data.agents.map((agent) => agent.name), ...data.domains.map((domain) => domain.name),
    ...data.projects.map((project) => project.title)].map((name) => name.trim().toLocaleLowerCase());
  for (const name of names) count.set(name, (count.get(name) ?? 0) + 1);
  return new Set(peopleOf(data.topics).filter((person) => [...person.name.trim()].length >= 3 && count.get(person.name.trim().toLocaleLowerCase()) === 1)
    .map((person) => person.id));
}

/** Whether `text` mentions `person`: @Name always, the plain name when it's in `plain`. */
export const mentions = (text: string, person: Topic, plain: Set<string>) => !!person.name.trim() && nameAt(person.name, plain.has(person.id)).test(text);

/** The line of `text` that names `person`, cut to about `max` characters around the name. */
export function snippetOf(text: string, person: Topic, plain: Set<string>, max = 140) {
  const line = text.split(/\n+/).find((each) => mentions(each, person, plain)) ?? text;
  const flat = line.replace(/^[\s#>*-]+/, "").replace(/\*\*|__|`/g, "").trim();
  if (flat.length <= max) return flat;
  const at = flat.search(nameAt(person.name, plain.has(person.id)));
  const start = Math.max(0, Math.min(at - Math.round(max / 3), flat.length - max));
  return `${start > 0 ? "…" : ""}${flat.slice(start, start + max).trim()}${start + max < flat.length ? "…" : ""}`;
}

/** Where a person is named: a task, a note, a project or a chat message, newest first. */
export type Mention = { kind: "task" | "note" | "project" | "message"; id: string; text: string; title?: string; where: string; at?: string;
  domain?: string; projectId?: string; threadId?: string; due?: string; done?: boolean; archived?: boolean };

/**
 * Everything outside the person's own topic that names them (D71's Mentioned elsewhere): open and done tasks, notes and
 * links you kept, projects, and chat messages; archived ones say so. `whereOf` names a place, `threadName` a chat.
 */
export function mentionsOf(data: WorkspaceData, person: Topic, whereOf: (home: { domain: string; projectId: string }) => string,
  threadName: (threadId: string) => string, plain = plainNames(data)): Mention[] {
  const names = (text: string) => mentions(text, person, plain);
  const tasks = data.tasks.filter((task) => names(task.title)).map((task): Mention => ({ kind: "task", id: task.id, text: snippetOf(task.title, person, plain),
    where: whereOf(task), at: task.updatedAt, domain: task.domain, projectId: task.projectId, due: task.due, done: task.done }));
  const notes = data.notes.filter((note) => note.topicId !== person.id && names(`${note.title}\n${note.body}`)).map((note): Mention => ({
    kind: "note", id: note.id, title: note.title, text: snippetOf(names(note.body) ? note.body : note.title, person, plain),
    where: note.topicId ? data.topics.find((topic) => topic.id === note.topicId)?.name ?? "Library" : whereOf(note), at: note.updatedAt, archived: note.archived }));
  const projects = data.projects.filter((project) => names(`${project.title}\n${project.description}`)).map((project): Mention => ({
    kind: "project", id: project.id, text: snippetOf(names(project.title) ? project.title : project.description, person, plain),
    title: project.title, where: project.area, archived: project.archived }));
  const messages = data.threads.flatMap((thread) => thread.messages.filter((message) => names(message.text)).map((message): Mention => ({
    kind: "message", id: message.id, text: snippetOf(message.text, person, plain), where: threadName(thread.id), at: message.at, threadId: thread.id })));
  // Records without a time go last, in the order they were found.
  return [...tasks, ...notes, ...projects, ...messages].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/** `text` with every @mention of `from` now naming `to`. */
export const renamed = (text: string, from: string, to: string) =>
  from.trim() && from.trim() !== to.trim() ? text.replace(new RegExp(nameAt(from, false).source, "giu"), `@${to.trim()}`) : text;

/** The @query being typed just before the caret, at the start or after a space: its text and where its @ is. */
export function typedMention(text: string, caret: number): { query: string; at: number } | undefined {
  const match = /(^|[\s(])@([\p{L}\p{N}'-]*(?: [\p{L}\p{N}'-]*)?)$/u.exec(text.slice(0, caret));
  return match && match[2].length <= 30 ? { query: match[2], at: caret - match[2].length - 1 } : undefined;
}

/** People to offer for `query`: names starting with it first, then names containing it; at most five. */
export function peopleFor(people: PersonTopic[], query: string) {
  const lower = query.trim().toLocaleLowerCase();
  const starts = people.filter((person) => person.name.toLocaleLowerCase().startsWith(lower));
  return [...starts, ...people.filter((person) => !starts.includes(person) && person.name.toLocaleLowerCase().includes(lower))].slice(0, 5);
}
