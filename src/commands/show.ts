// Commands that show something in the reply and change nothing (D64): answers to tap, the person's widgets and tasks.
import { calendarAccess, calendarLevels, canUse } from "../model.ts";
import type { CalendarLevel } from "../model.ts";
import { texts, records } from "./define.ts";
import type { CommandDef } from "./define.ts";
import { widgetsHere, openTasks, openTitles, lower } from "./request.ts";

// Richer replies (agents-design D64): answers the person taps instead of typing, and their own widgets and tasks
// drawn live in the reply. Both only point; the person logs, ticks and answers.
export const offer_choices: CommandDef = {
  needs: [],
  // Answers to tap need the person there: never in a routine's run (nobody taps) or another agent's question (D50).
  // A weekly improvement's choices come from its numbered suggestions instead (`improveChoices`, D68).
  when: (request) => !request.routine && !request.asked,
  spec: () => ({
    shows: true,
    description: "Offer the person 2 to 5 short answers to the question your reply ends with. Each shows as a button that sends it as their answer; they can still type their own.",
    progress: "Offering choices",
    prompt: "When you need the person to choose or to clarify before you can help (which option, how much, which day), end your reply with the question and call offer_choices with 2 to 5 short answers, a few words each, the one you'd suggest first. They show under your reply as buttons at once; it isn't a proposal. Skip it for a question only they can answer in their own words.",
    args: { options: { description: "The answers, a few words each, the suggested one first.", list: { max: 5 } } },
  }),
  show: (_request, args) => {
    const options = [...new Set(texts(args.options).map((option) => option.trim().slice(0, 80)).filter(Boolean))].slice(0, 5);
    return options.length >= 2 ? { choices: options } : undefined;
  },
};
export const show_widgets: CommandDef = {
  needs: [],
  // Widgets only point at the person's own records, so a routine's report may show them; another agent's question can't.
  when: (request) => !request.asked && (widgetsHere(request).length > 0 || canUse(request.agent, "see-tasks") && openTasks(request).length > 0),
  spec: (request) => {
    const here = widgetsHere(request);
    const tasks = canUse(request.agent, "see-tasks") ? openTitles(request) : [];
    return {
      shows: true,
      description: "Show the person live widgets or open tasks from your places inside your reply, where they can log a value, tick a habit or finish a task without leaving the chat.",
      progress: "Bringing it here",
      prompt: "When the person asks how something on their pages is going (a tracker, habit, goal, countdown, checklist or milestones) or what's open or late, answer in a sentence or two and call show_widgets with what holds the answer, so they can act on it here. In a report, show the widget or tasks your main point is about. They show under your reply at once; it isn't a proposal, so say “here's your…”, never “I suggest”. You may also make one proposal in the same reply.",
      args: {
        ...here.length > 0 && { widgets: { description: "Widgets from the pages where you work, by the title the page lines give them, and their place.", list: { max: 3 }, optional: true, fields: {
          title: { description: "The widget's title.", oneOf: [...new Set(here.map((item) => item.title))] },
          place: { description: "Its place.", oneOf: [...new Set(here.map((item) => item.name))], show: true, optional: true } } } },
        ...tasks.length > 0 && { tasks: { description: "Exact titles of open tasks to show.", list: { max: 8 }, oneOf: tasks, optional: true } },
      },
    };
  },
  show: (request, args) => {
    const here = widgetsHere(request);
    const blocks = records(args.widgets, "title").flatMap(({ title, place }) => {
      const named = here.filter((item) => lower(item.title) === lower(title ?? ""));
      const found = named.find((item) => lower(item.name) === lower(place ?? "")) ?? named[0];
      return found ? [{ place: found.place, id: found.block.id }] : [];
    }).filter((item, index, all) => all.findIndex((other) => other.place === item.place && other.id === item.id) === index).slice(0, 3);
    const open = canUse(request.agent, "see-tasks") ? openTasks(request) : [];
    const taskIds = [...new Set(texts(args.tasks).flatMap((title) => open.find((task) => lower(task.title) === lower(title))?.id ?? []))].slice(0, 8);
    return blocks.length || taskIds.length ? { ...blocks.length ? { blocks } : {}, ...taskIds.length ? { taskIds } : {} } : undefined;
  },
};

/** What each rung lets the agent do, as the model is told when it asks for one (D83). */
const rungs: Record<Exclude<CalendarLevel, "off">, string> = {
  free: "free: see when they're busy or free, no titles (to say when something fits)",
  events: "events: read their events' titles and times (to say what's on)",
  add: "add: read events and hand them dates with an Add to Google Calendar button (to put tasks in it)",
};
// An agent without enough Google Calendar access asks for it (agents-design D83): a card under its reply, where one
// tap gives it that rung, in a chat you're in and in builds that offer the calendar. It asks; you grant.
export const ask_calendar_access: CommandDef = {
  needs: [],
  when: (request) => !!request.offers?.calendar && !request.routine && !request.asked && !request.form && calendarAccess(request.agent).level !== "add",
  spec: (request) => {
    const above = calendarLevels.slice(calendarLevels.indexOf(calendarAccess(request.agent).level) + 1) as Exclude<CalendarLevel, "off">[];
    return {
      shows: true,
      description: "Ask the person to let you use their Google Calendar at a rung you don't have yet. It shows a card under your reply where they allow it in one tap.",
      progress: "Asking for your calendar",
      prompt: `When the person asks something only their Google Calendar answers (what's on, when they're free, putting tasks in it) and your tools can't do it, say in one sentence that you can't see their calendar yet, and call ask_calendar_access with the least you need. Rungs: ${above.map((level) => rungs[level]).join("; ")}. Never guess what's on their calendar.`,
      args: { level: { description: "The rung you need.", oneOf: above } },
    };
  },
  show: (request, args) => {
    const level = calendarLevels.find((item) => item !== "off" && item === args.level);
    return level && calendarLevels.indexOf(level) > calendarLevels.indexOf(calendarAccess(request.agent).level) ? { calendar: level } : undefined;
  },
};
