// The task dialog: a task's title, home, due day, where in it and how long (agents-design D75), and done when editing.
// Every element answers one question (page-design.md, "Every element is a question"): the home is one chip that unfolds
// the domains and their projects, with the homes used last beside it; the day is a week of tiles that show how full
// each is; when is four cards, Any time and the parts of the day, a part unfolding its free start times; how long is a
// segmented track, with your usual length and part in this home picked (`taskHabits.ts`) and, from an hour, Break it
// down. A new task's title can name its day, time and length (`taskWords.ts`).
import { useState } from "react";
import { CalendarDays, ChevronDown, CircleDashed, Clock, FolderOpen, Hourglass, Moon, Sun, Sunrise, Trash2, Users } from "lucide-react";
import * as crews from "../agents.ts";
import { nearestThread } from "../agents.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import { defaultPages, shownBlocks } from "../blocks.ts";
import { DayTiles } from "../DayTiles.tsx";
import Dialog from "../Dialog.tsx";
import { addDays, formatDate } from "../dates.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { useMentions } from "../MentionPicker.tsx";
import type { Project, Task, Topic } from "../model.ts";
import { domainKey, parseHome } from "../place.ts";
import { Tip } from "../Popups.tsx";
import { dueDay, dueWords } from "../pageGrid/due.ts";
import { busySpans, clockOf, dayParts, freeSlots, isPart, lengthOf, lineFrom, minuteNow, minuteOf, partOf, taskLengths } from "../today/day.ts";
import type { DayPart } from "../today/day.ts";
import type { DraftOf } from "../workspace/drafts.ts";
import { habitsOf } from "../taskHabits.ts";
import { readTaskWords } from "./taskWords.ts";
import { Emblem } from "../Emblem.tsx";

type TaskForm = DraftOf<"task">;
type WordField = "due" | "at" | "length";

export function TaskDialog() {
  const task = useUi((state) => state.editingTask);
  return task ? <TaskFormDialog task={task} /> : null;
}

const longDay = (day: string) => formatDate(new Date(`${day}T12:00:00`), { weekday: "short", day: "numeric", month: "short" });
const lengthWords = (minutes: number) => minutes < 60 ? `${minutes} min` : minutes === 90 ? "1½ h" : `${minutes / 60} h`;
/** A stretch in words: "45 min", "2 h", "3 h 30". */
const hoursWords = (minutes: number) => minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;
const partHours: Record<DayPart, string> = { morning: "until 12:00", afternoon: "12:00 to 19:00", evening: "after 19:00" };
const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;
/** The day's planning hours end at 22:00, where Today stops placing steps. */
const dayEnd = 22 * 60;

function TaskFormDialog({ task }: { task: TaskForm }) {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const now = useView((view) => view.now);
  const liveDomains = useView((view) => view.visible.domains);
  const liveProjects = useView((view) => view.visible.projects);
  // Fields the title's words set, and fields picked by hand, which the words no longer change.
  const [fromWords, setFromWords] = useState<Set<WordField>>(new Set());
  const [touched, setTouched] = useState<Set<WordField>>(new Set());
  const isNew = !task.original;
  const change = (patch: Partial<TaskForm>) => actions.setUi({ editingTask: { ...task, ...patch } });
  const pick = (field: WordField, patch: Partial<TaskForm>) => { setTouched(new Set(touched).add(field)); change(patch); };
  const close = () => actions.setUi({ editingTask: null });

  // Where it lives: a domain, one of its projects, or a person's topic (kept until another home is picked).
  const place = parseHome(task.home);
  const project = place.kind === "project" ? liveProjects.find((item) => item.id === place.id) : undefined;
  const topic = place.kind === "topic" ? data.topics.find((item) => item.id === place.id) : undefined;
  const area = place.kind === "domain" ? place.name : project?.area ?? "";
  const domain = liveDomains.find((item) => item.name === area);
  // What tasks here usually take: a new task opens with them (`Actions.newTask`) and takes a new home's when it moves.
  const habits = habitsOf(data.tasks, { domain: area, projectId: project?.id ?? "" });
  const partOpen = (part: DayPart) => task.due !== today || dayParts.find((item) => item.part === part)!.to > minuteNow(now);
  // A new task's title can name its day, time and length; a chip picked by hand wins over the words.
  const words = isNew ? readTaskWords(task.title, today) : undefined;
  const setTitle = (title: string) => {
    if (!isNew) return change({ title });
    const read = readTaskWords(title, today);
    // A field the words stop naming goes back to its default: this home's usual, else the plain one.
    const blank = { due: today, at: habits.part && partOpen(habits.part) ? habits.part : "", length: habits.length ?? 0 };
    const from = new Set(fromWords);
    const patch: Partial<TaskForm> = { title };
    for (const field of ["due", "at", "length"] as const) {
      if (touched.has(field)) continue;
      if (read[field] !== undefined) { Object.assign(patch, { [field]: read[field] }); from.add(field); }
      else if (from.has(field)) { Object.assign(patch, { [field]: blank[field] }); from.delete(field); }
    }
    setFromWords(from);
    change(patch);
  };
  const mention = useMentions<HTMLInputElement>(task.title, setTitle);
  const title = words?.found.length && words.title ? words.title : task.title.trim();

  const setHome = (home: string) => {
    if (!isNew) return change({ home });
    const next = parseHome(home);
    const there = next.kind === "project" ? liveProjects.find((item) => item.id === next.id) : undefined;
    const usual = habitsOf(data.tasks, { domain: next.kind === "domain" ? next.name : there?.area ?? "", projectId: there?.id ?? "" });
    const patch: Partial<TaskForm> = { home };
    if (!touched.has("length") && !fromWords.has("length")) patch.length = usual.length ?? 0;
    if (!touched.has("at") && !fromWords.has("at") && minuteOf(task.at) === null) patch.at = usual.part && partOpen(usual.part) ? usual.part : "";
    change(patch);
  };
  const usualWords = [habits.length && task.length === habits.length && !touched.has("length") && lengthWords(habits.length),
    habits.part && task.at === habits.part && !touched.has("at") && `${habits.part}s`].filter(Boolean).join(", ");
  // Break it down (1 h or longer): the agent who answers here gets the request in its chat, and proposes the steps.
  const thread = nearestThread(data, area, project?.id);
  const breaker = thread.startsWith("room:") ? undefined : crews.agentById(data, thread.slice(6));
  const breakDown = () => {
    void actions.updateSession({ chatDraft: `Break “${title}” into 2 to 4 smaller steps of 15 to 45 minutes each${task.due ? `, all done by ${longDay(task.due)}` : ""}, in ${project?.title ?? area}.` });
    close();
    actions.chatWith(thread);
  };

  // The day: a week of day tiles with how full each is, Someday, the project's finish line, or any date.
  const tomorrow = addDays(today, 1);
  const others = data.tasks.filter((item) => !item.done && item.id !== task.original?.id);
  const finish = project && shownBlocks(project.widgets ?? defaultPages.project).find((block) => block.type === "countdown")?.date;

  // How full that day is: what's due there against the hours left until 22:00, this task included.
  const dueThen = task.due ? others.filter((item) => item.due === task.due) : [];
  const length = lengthOf(task);
  const past = !!task.due && task.due < today;
  const fromMinute = past ? dayEnd : task.due === today ? Math.max(lineFrom, minuteNow(now)) : lineFrom;
  const capacity = Math.max(0, dayEnd - fromMinute);
  const planned = dueThen.reduce((sum, item) => sum + lengthOf(item), 0);
  const left = capacity - planned - length;
  const dayLine = !task.due ? "No day: it waits on its page, off Today" : past ? `${dueDay(task.due, today).when}: pick a new day` : [
    longDay(task.due),
    dueThen.length ? `${plural(dueThen.length, "other task")}, ${hoursWords(planned)}` : "Nothing else due",
    !capacity ? "past 22:00, the day is done" : left >= 0 ? `${hoursWords(left)} left after this` : `${hoursWords(-left)} more than the day holds`,
  ].filter(Boolean).join(" · ");

  const dayName = task.due ? dueWords(task.due, today) : "";
  const late = !!task.original && !task.done && !!task.original.due && task.original.due <= today;

  return (
    <Dialog title={isNew ? "A new small step" : "One small step"} onClose={close}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Ctrl+Enter saves from any chip, as Capture's does. */}
      <form className="task-form step-form" onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.requestSubmit(); } }}
        onSubmit={(event) => { event.preventDefault(); if (title) actions.saveTaskForm({ ...task, title }); }}>
        <span className="mention-host">
          <input {...mention.field} className="step-title" required maxLength={120} aria-label="What needs doing?" aria-describedby="step-words"
            placeholder={isNew ? "Call the clinic tomorrow at 16:30…" : "Call the clinic, buy paint…"} value={task.title} onChange={(event) => setTitle(event.target.value)} />
          {mention.list}
        </span>
        {words?.found.length ? <p className="step-line step-words" id="step-words">Read from your words: {words.found.join(" · ")}. Saves as “{title}”.</p> : null}

        <HomeRow home={task.home} project={project} topic={topic} area={area} emoji={topic?.emoji ?? domain?.emoji} onHome={setHome} />

        <div className="step-row">
          <span className="step-label" id="step-day-label"><CalendarDays size={14} aria-hidden="true" />Day</span>
          <div>
            <DayTiles due={task.due} onDue={(due) => pick("due", { due, ...!due && { at: "" } })} label="Day" someday exclude={task.original?.id}
              finish={finish && finish > today ? { day: finish, title: project!.title } : undefined} />
            <p className="step-line">{dayLine}</p>
          </div>
        </div>

        {task.due && !past && <WhenRow task={task} dueThen={dueThen} fromMinute={fromMinute} onAt={(at) => pick("at", { at })} />}

        <div className="step-row">
          <span className="step-label" id="step-length-label"><Hourglass size={14} aria-hidden="true" />How long</span>
          <div className="project-chips step-seg" role="radiogroup" aria-labelledby="step-length-label">
            {taskLengths.map((minutes) => (
              <button key={minutes} type="button" role="radio" className="where-chip" aria-checked={length === minutes}
                onClick={() => pick("length", { length: minutes })}>{lengthWords(minutes)}</button>
            ))}
          </div>
          {(usualWords || (length >= 60 && title)) && (
            <p className="step-line step-length-note">
              {usualWords && <span>Your usual in {project?.title ?? area}: {usualWords}</span>}
              {length >= 60 && title && <button type="button" className="text-button" onClick={breakDown}>
                {breaker ? <img src={portraitSrc(breaker)} alt="" /> : <Users size={14} aria-hidden="true" />}Break it down with {breaker?.name ?? "the crew"}</button>}
            </p>
          )}
        </div>

        {!isNew && (
          <label className="checkbox-label">
            <input type="checkbox" checked={task.done} onChange={(event) => change({ done: event.target.checked })} />
            Done
          </label>
        )}
        <div className="form-actions">
          {task.original && <button type="button" className="quiet-button domain-remove" onClick={() => actions.deleteTask(task.original!)}><Trash2 size={14} />Delete</button>}
          {late && <button type="button" className="quiet-button" onClick={() => actions.saveTaskForm({ ...task, title: task.title.trim() || task.original!.title, due: tomorrow, at: "" })}>Move to tomorrow</button>}
          <button type="button" className="quiet-button" onClick={close}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!title}>{isNew ? (dayName ? `Add for ${dayName}` : "Add it") : "Save"}<kbd>↵</kbd></button>
        </div>
      </form>
    </Dialog>
  );
}

/** Lives in: the home as one chip that unfolds the domains and that domain's projects, the two homes used last beside it. */
function HomeRow({ home, project, topic, area, emoji, onHome }: {
  home: string; project?: Project; topic?: Topic; area: string; emoji?: string; onHome: (home: string) => void }) {
  const data = useView((view) => view.data);
  const liveDomains = useView((view) => view.visible.domains);
  const liveProjects = useView((view) => view.visible.projects);
  const [open, setOpen] = useState(false);
  const words = topic ? topic.name : project ? `${project.area} › ${project.title}` : `${area}, no project`;
  const emojiOf = (name: string) => liveDomains.find((item) => item.name === name)?.emoji;
  // The two homes tasks were added or edited in last, besides this one.
  const recent = [...new Set(data.tasks.filter((item) => item.updatedAt).sort((a, b) => b.updatedAt!.localeCompare(a.updatedAt!))
    .map((item) => item.projectId || domainKey(item.domain)))]
    .flatMap((key) => {
      const place = parseHome(key);
      const there = place.kind === "project" ? liveProjects.find((item) => item.id === place.id) : undefined;
      const name = place.kind === "domain" && liveDomains.some((item) => item.name === place.name) ? place.name : "";
      return key === home || !(there || name) ? [] : [{ key, emoji: emojiOf(there?.area ?? name), label: there?.title ?? name }];
    }).slice(0, 2);
  return (
    <div className="step-row">
      <span className="step-label" id="step-home-label"><FolderOpen size={14} aria-hidden="true" />Lives in</span>
      <div>
        <div className="project-chips">
          <button type="button" className="where-chip project-fact" aria-expanded={open} aria-controls="step-home" aria-labelledby="step-home-label step-home-words"
            onClick={() => setOpen(!open)}>
            <span aria-hidden="true"><Emblem emoji={emoji} /></span><span id="step-home-words">{words}</span><ChevronDown size={14} aria-hidden="true" />
          </button>
          {!open && recent.map((item) => (
            <Tip key={item.key} label="Used lately"><button type="button" className="where-chip step-recent" onClick={() => onHome(item.key)}>
              <span aria-hidden="true"><Emblem emoji={item.emoji} /></span>{item.label}</button></Tip>
          ))}
        </div>
        {open && (
          <div className="project-panel step-home" id="step-home">
            <div className="project-chips" role="radiogroup" aria-label="Domain">
              {liveDomains.map((item) => (
                <button key={item.name} type="button" role="radio" className="where-chip" aria-checked={!topic && area === item.name}
                  onClick={() => onHome(domainKey(item.name))}><span aria-hidden="true"><Emblem emoji={item.emoji} /></span>{item.name}</button>
              ))}
            </div>
            {area && (
              <div className="project-chips" role="radiogroup" aria-label={`Project in ${area}`}>
                <button type="button" role="radio" className="where-chip" aria-checked={home === domainKey(area)}
                  onClick={() => onHome(domainKey(area))}>No project</button>
                {liveProjects.filter((item) => item.area === area).map((item) => (
                  <button key={item.id} type="button" role="radio" className="where-chip" aria-checked={project?.id === item.id}
                    onClick={() => { onHome(item.id); setOpen(false); }}>{item.title}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
const partIcons: Record<DayPart, typeof Sun> = { morning: Sunrise, afternoon: Sun, evening: Moon };

/** Other time's choices: every quarter hour of the part from now on, each saying whether this task's stretch there is taken. */
const quarters = (from: number, to: number) => Array.from({ length: Math.max(0, Math.ceil((to - from) / 15)) }, (_, index) => from + index * 15);

/**
 * When (Carlos's pick W2, 2026-11-22): four cards, Any time and the parts of the day, each saying how much of it is
 * free for this task, so a part is the whole answer. A picked part unfolds its free start times this task's length fits
 * (busy calendar events included on today), spread across it, and Other time, for anyone who wants an exact time.
 */
function WhenRow({ task, dueThen, fromMinute, onAt }: { task: TaskForm; dueThen: Task[]; fromMinute: number; onAt: (at: string) => void }) {
  const today = useView((view) => view.today);
  const events = useUi((state) => state.dayEvents);
  const length = lengthOf(task);
  const start = minuteOf(task.at);
  const part = start !== null ? partOf(task.at) : isPart(task.at) ? task.at : null;
  const spans = busySpans(dueThen, task.due, task.due === today && events.day === today ? events.events : []);
  const halves = new Set(freeSlots(spans, fromMinute));
  const fits = (minute: number) => minute + length <= dayEnd
    && Array.from({ length: Math.ceil(length / 30) }, (_, index) => minute + index * 30).every((half) => halves.has(half));
  const cards = dayParts.map((item) => {
    const free = [...halves].filter((half) => half >= item.from && half < item.to).length * 30;
    const starts = [...halves].filter((half) => half >= item.from && half < item.to && fits(half));
    const gone = Math.min(item.to, dayEnd) <= fromMinute;
    return { ...item, free, starts, gone, full: !gone && !starts.length };
  });
  const picked = cards.find((item) => item.part === part);
  // Five starts spread across the part, rather than its first five half hours; a time not among them shows on Other time.
  const offered = picked && (picked.starts.length <= 5 ? picked.starts
    : [...new Set(Array.from({ length: 5 }, (_, index) => picked.starts[Math.round((index * (picked.starts.length - 1)) / 4)]))]);
  const otherTime = start !== null && !offered?.includes(start);
  const inPart = picked ? dueThen.filter((item) => partOf(item.at) === picked.part).length : 0;
  return (
    <div className="step-row">
      <span className="step-label" id="step-when-label"><Clock size={14} aria-hidden="true" />When</span>
      <div>
        <div className="step-parts" role="radiogroup" aria-labelledby="step-when-label">
          <button type="button" role="radio" className="step-part" aria-checked={!task.at} onClick={() => onAt("")}>
            <CircleDashed size={20} aria-hidden="true" /><strong>Any time</strong><small>no set time</small>
          </button>
          {cards.map((item) => {
            const Icon = partIcons[item.part];
            return (
              <Tip key={item.part} label={partHours[item.part]}><button type="button" role="radio" className="step-part" aria-checked={part === item.part}
                disabled={(item.gone || item.full) && part !== item.part} onClick={() => onAt(item.part)}>
                <Icon size={20} aria-hidden="true" /><strong>{item.label}</strong>
                <small>{item.gone ? "Gone" : item.full ? "Full" : `${hoursWords(item.free)} free`}</small>
              </button></Tip>
            );
          })}
        </div>
        {picked ? (
          <div className="project-panel step-times">
            <p className="step-line">{start !== null ? <><strong>{task.at} to {clockOf(Math.min(24 * 60 - 1, start + length))}</strong> · tap it again for any time in the {picked.label.toLowerCase()}</>
              : <>Any time in the {picked.label.toLowerCase()} ({partHours[picked.part]}{inPart ? `, ${plural(inPart, "task")} there` : ""}), or an exact time:</>}</p>
            <div className="project-chips step-free" role="radiogroup" aria-label={`Times in the ${picked.label.toLowerCase()}`}>
              {offered!.map((minute) => (
                <Tip key={minute} label={`Free ${clockOf(minute)} to ${clockOf(minute + length)}`}><button type="button" role="radio" className="where-chip"
                  aria-checked={start === minute} onClick={() => onAt(start === minute ? picked.part : clockOf(minute))}>{clockOf(minute)}</button></Tip>
              ))}
              <label className="where-chip capture-pick-day step-other" data-picked={otherTime || undefined}>
                <Clock size={14} aria-hidden="true" />{otherTime ? task.at : "Other time"}
                <select aria-label={`Other time in the ${picked.label.toLowerCase()}`} value={otherTime ? task.at : ""} onChange={(event) => event.target.value && onAt(event.target.value)}>
                  <option value="" disabled>Other time</option>
                  {quarters(Math.max(picked.from, Math.ceil(fromMinute / 15) * 15), Math.min(picked.to, dayEnd)).map((minute) => (
                    <option key={minute} value={clockOf(minute)}>{clockOf(minute)}{spans.some(([from, to]) => from < minute + length && to > minute) ? " · taken" : ""}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ) : <p className="step-line">{task.due === today ? "In Today's tray until you place it" : "In that day's tray until you place it"}</p>}
      </div>
    </div>
  );
}
