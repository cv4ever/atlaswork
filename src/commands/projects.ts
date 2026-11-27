// Commands that shape projects and pages: a new project (D61), a page arranged with its widgets (D33), and a
// review's changes (moves, filing, archiving quiet projects).
import type { Arg } from "../../supabase/functions/agent/logic.ts";
import { atlasId } from "../model.ts";
import { quietestColour } from "../look.ts";
import { blockWidths, recordWidgets, shownBlocks, viewOf, widgetKind, widgetKinds } from "../blocks.ts";
import type { Project } from "../model.ts";
import type { Block, BlockWidth, Widget } from "../blocks.ts";
import { homeKey } from "../place.ts";
import { agentFrom, cleanBlocks, layoutOf, pageOf } from "../workspace.ts";
import { lower, leadsLine, crewOf, hireableFor, domainsOf, placesText, plantFor, namedProjects, named, quietProjects, looseTasks, openTitles, openTasks } from "./request.ts";
import { records, isDay, pending, texts } from "./define.ts";
import type { CommandDef } from "./define.ts";

/**
 * A project page that counts down to its deadline (D61), laid out as a starter's (D35): the finish line beside what's
 * next, then the tasks beside what's kept. The countdown starts today, so its pace and brief (D38, D40) have a clock.
 */
const finishPage = (id: string, date: string, today: string): Block[] => [
  { id: `${id}-finish`, type: "countdown", title: "Done by", date, since: today, width: "narrow" },
  { id: `${id}-next`, type: "tasks", view: "next", title: "Next up", width: "wide" },
  { id: `${id}-tasks`, type: "tasks", width: "wide" },
  { id: `${id}-kept`, type: "resources", view: "recent", width: "narrow" },
];
const titleArg = { description: "Its title, a few words; place it in blocks as new: and this title." };

/**
 * The data widgets arrange_page may set up (D33): their settings come from the place's goal, while the numbers stay
 * the person's to log, so a tracker starts empty and a goal at zero. Checklists and milestones get their rows from `items`.
 */
const setupArgs = {
  trackers: { description: "New trackers: a number logged over time (weight, sleep hours, signups).", list: { max: 4 }, optional: true, fields: {
    title: titleArg, unit: { description: "Its unit (kg, h, km, €).", optional: true },
    target: { description: "A line to beat, as a plain number, when the goal sets one.", optional: true },
    better: { description: "down when less is better (weight to lose, spending); otherwise up.", oneOf: ["up", "down"], show: true, optional: true } } },
  goals: { description: "New goals: an amount to reach (savings, revenue, pages written).", list: { max: 3 }, optional: true, fields: {
    title: titleArg, target: { description: "Where it ends, as a plain number." }, unit: { description: "Its unit (€, km, pages).", optional: true },
    by: { description: "The day to reach it by, YYYY-MM-DD.", date: true, optional: true } } },
  countdowns: { description: "New countdowns to a date (a race, a launch, an exam).", list: { max: 3 }, optional: true, fields: {
    title: titleArg, date: { description: "The day, YYYY-MM-DD.", date: true } } },
  habits: { description: "New habits: something done on most days (stretch, write, no sugar).", list: { max: 4 }, optional: true, fields: { title: titleArg } },
  checklists: { description: "New checklists: named things to tick off once (a definition of done, what to pack).", list: { max: 3 }, optional: true, fields: { title: titleArg } },
  milestones: { description: "New milestones: dated steps to a finish line.", list: { max: 2 }, optional: true, fields: { title: titleArg } },
  items: { description: "The rows of new checklists and milestones, in order.", list: { max: 20 }, optional: true, fields: {
    text: { description: "The thing or step, a few words." }, widget: { description: "The title of its new checklist or milestones." },
    date: { description: "A milestone step's day, YYYY-MM-DD; milestone steps need one.", date: true, optional: true } } },
} satisfies Record<string, Arg>;

/** A plain number from a model's text ("78", "1,500"), or undefined. */
const amount = (text: string | undefined) => {
  const value = text && /\d/.test(text) ? Number(text.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(value) ? value : undefined;
};

/** The widgets an arrange_page draft sets up, by lowercased title; a repeated title, a past date or a goal without a target makes none. */
function setUpWidgets(args: Record<string, unknown>, today: string) {
  const made = new Map<string, Block>();
  const add = (type: Widget, title: string | undefined, settings: Partial<Block>) => {
    const name = title?.trim().slice(0, 60);
    if (!name || made.has(lower(name))) return;
    made.set(lower(name), cleanBlocks([{ id: `${type}-${crypto.randomUUID().slice(0, 8)}`, type, title: name, width: widgetKind(type).width, ...settings }])[0]);
  };
  const rows = records(args.items, "text").filter((row) => row.text?.trim());
  const rowsOf = (title: string | undefined) => rows.filter((row) => lower(row.widget ?? "") === lower(title ?? ""));
  const unit = (text: string | undefined) => text?.trim() ? { unit: text.trim().slice(0, 12) } : {};
  for (const { title, unit: per, target, better } of records(args.trackers, "title")) {
    const line = amount(target);
    add("tracker", title, { ...unit(per), ...line !== undefined && { target: line }, ...better === "down" && { better: "down" as const } });
  }
  for (const { title, target, unit: per, by } of records(args.goals, "title")) {
    const end = amount(target);
    if (end !== undefined && end > 0) add("goal", title, { current: 0, target: end, ...unit(per), ...isDay(by) && by > today && { date: by } });
  }
  for (const { title, date } of records(args.countdowns, "title")) if (isDay(date) && date > today) add("countdown", title, { date, since: today });
  for (const { title } of records(args.habits, "title")) add("habit", title, {});
  for (const { title } of records(args.checklists, "title")) add("checklist", title, { items: rowsOf(title).map((row) => ({ text: row.text.trim(), done: false })) });
  for (const { title } of records(args.milestones, "title")) {
    add("milestones", title, { steps: rowsOf(title).filter((row) => isDay(row.date)).map((row) => ({ title: row.text.trim(), date: row.date, done: false })) });
  }
  return made;
}

// Agents make projects (agents-design D61): a project in one of the agent's domains with its first tasks and notes,
// and a finish line when it has a deadline.
export const propose_project: CommandDef = {
  needs: ["add-tasks"],
  // Projects start in a conversation with you, never from a routine run.
  when: (request) => !request.routine,
  spec: (request) => ({
    // Gated (D61, as D57's propose_agent): offered only after plan_project, so the rest of the turns pay for the lookup alone.
    description: "Propose a new project in one of your domains: its name, who leads it, its goal, its deadline when it has one, up to 8 first tasks with optional due dates and up to 3 notes worth keeping." + leadsLine(request) + " Or keeper for the domain's own agent.",
    progress: "Drafting a project",
    // Measured 2026-11-17 on the ChatGPT plan: "if you don't know enough" let it plan Inês's assignment with neither its
    // brief nor its deadline, and a deadline the person gave sat in the goal with no task due. The asking rule stays in
    // this line: moved into the description, which arrives only after plan_project, Scholar proposed at once in 3 of 3
    // (2026-11-18). The answers to tap (2026-11-20): asked "paid or a favour, and by when?", Atlas offered none in 3 of 3.
    prompt: "When the person wants a project, or a goal that takes several steps that no project of yours holds yet, call plan_project, then propose_project; steps for a project you already have go there with propose_tasks. Unless the person said both what done looks like and by when, first ask up to two short questions in one message, offering their likely answers to tap with offer_choices, and propose nothing. Then propose: concrete first steps in order, not everything the project will ever need, the deadline in finish and the step that finishes it due on it; say in a few words what you assumed.",
    after: "plan_project",
    args: {
      title: { description: "The project's name, a few words.", max: 60 },
      // Seen 2026-11-20: Paulo's Android app went to Juniper, the new Work domain's keeper, where Forge builds apps.
      // Optional, Atlas left the lead out of a project in a domain he planted 12 of 12 times, even asked in the prompt
      // line; required, he named Forge 6 of 6 (agents-design D61). It sits right after the title: after the goal, Atlas
      // still left it out of his first call in a domain he planted 2 of 2 times, and the refusal cost a call.
      lead: { description: "Who does the work: a crew member whose role fits; when none does and a suggested agent does (an app: a builder), that agent, who joins to lead it; else keeper.",
        oneOf: [...crewOf(request).map((agent) => agent.name), ...hireableFor(request, "lead").map((agent) => agent.name), "keeper"], show: true },
      domain: { description: "The domain it belongs in: one of yours.", oneOf: domainsOf(request), show: true, ...request.agent.id === atlasId && { optional: true } },
      // Atlas only (D61): a domain planted with the project, its own agent with it (D51), all on one Apply.
      ...request.agent.id === atlasId && { new_domain: { description: "Instead of domain, when no domain but Everyday is about it (Everyday is daily life, never work for someone): a domain to plant with it, named for the area (Work, Clients), not the project. Its own agent comes with it to look after the area; who does the project's work is still lead.",
        list: { max: 1 }, optional: true, except: request.data.domains.map((domain) => domain.name), fields: {
          name: { description: "The domain's name." }, emoji: { description: "One emoji.", optional: true }, purpose: { description: "What it's for, one short line.", optional: true } } } },
      goal: { description: "What it's for and what done looks like, one or two sentences.", max: 300 },
      finish: { description: "The deadline, YYYY-MM-DD, when there is one; its page counts down to it.", max: 10, optional: true },
      tasks: { description: "Its first tasks, in order.", list: { max: 8 },
        fields: { title: { description: "Short task title." }, due: { description: "Due date, YYYY-MM-DD.", date: true, optional: true } } },
      // Seen 2026-11-20: a client's request passed on kept only "Paulo's example entry"; the request itself was lost.
      notes: { description: "Things worth keeping in it: someone's request the person passed on, quoted whole with who said it and when; what the person told you; questions still open; sources, constraints.", list: { max: 3 }, optional: true,
        fields: { title: { description: "Short note title." }, body: { description: "The note's words, if more than the title.", optional: true } } },
    },
    lookup: { name: "plan_project", description: "List your domains and the projects already in them, with what each is for. Call it when the person wants a new project or a goal with several steps; then propose_project is offered.",
      progress: "Looking at your projects", result: placesText(request) },
  }),
  propose: (request, args, id) => {
    const plant = request.agent.id === atlasId ? plantFor(request, args.new_domain) : undefined;
    const title = typeof args.title === "string" ? args.title.trim().slice(0, 80) : "";
    const sown: Project | undefined = plant && title ? { id: crypto.randomUUID(), title, area: plant.domain.name,
      description: typeof args.goal === "string" ? args.goal.trim() : "", color: quietestColour(request.data.projects, plant.domain.name) } : undefined;
    // A domain to plant that is here already is that domain.
    const here = request.data.domains.find((domain) => lower(domain.name) === lower(records(args.new_domain, "name")[0]?.name ?? ""))?.name;
    const [found] = sown ? [{ home: { domain: sown.area, projectId: sown.id }, project: sown }]
      : [...namedProjects(request, [{ title: args.title, domain: args.domain ?? here, goal: args.goal }], 1).values()];
    if (!found) return undefined;
    const at = new Date().toISOString();
    const items = records(args.tasks, "title").flatMap(({ title, due }) => title?.trim()
      ? [{ id: crypto.randomUUID(), ...found.home, title: title.trim(), done: false, due: isDay(due) ? due : "", createdBy: id, agentId: request.agent.id }] : []).slice(0, 8);
    const notes = records(args.notes, "title").flatMap(({ title, body }) => title?.trim()
      ? [{ id: crypto.randomUUID(), ...found.home, title: title.trim(), body: body?.trim() ?? "", linkedProjectIds: [], updatedAt: at }] : []).slice(0, 3);
    // A project of that name already there (asked twice) takes the tasks instead of being made again. A new one isn't
    // a place until Apply, so its proposal waits in the domain's brief (D40), like a sorted capture's.
    if (!found.project && !items.length && !notes.length) return undefined;
    // Who leads a new project: a crew member, or a suggested agent who joins with it; the keeper planted with it when
    // that's who was named.
    const suggestion = found.project && named(hireableFor(request, "lead"), args.lead);
    const hire = suggestion && (plant?.agent && lower(plant.agent.name) === lower(suggestion.name) ? undefined : agentFrom(request.data, suggestion));
    const lead = hire?.id ?? (plant?.agent && suggestion ? plant.agent.id : named(crewOf(request), args.lead)?.id);
    const led = found.project && (lead ? { ...found.project, agentId: lead } : found.project);
    const project = led && (isDay(args.finish) ? { ...led, widgets: finishPage(led.id, args.finish, new Date().toLocaleDateString("en-CA")) } : led);
    return { ...pending(id), projectId: project ? "" : found.home.projectId, items, ...notes.length ? { notes } : {}, ...project ? { projects: [project] } : {},
      ...sown && { plant }, ...hire && { lead: hire } };
  },
};

export const arrange_page: CommandDef = {
  needs: ["arrange-pages"],
  spec: (request) => {
    const places = request.workspace.places;
    // A lookup result is capped at `limits.text`; pages past the budget go unlisted.
    let budget = 12_000;
    const shown = [...places].map(([name, home]) => {
      // What the place is for, so the agent picks widgets that serve it: a project's goal or a domain's intention.
      const goal = (home.projectId ? request.data.projects.find((project) => project.id === home.projectId)?.description
        : request.data.domains.find((domain) => domain.name === home.domain)?.intention)?.trim();
      return `${name}${goal ? ` (goal: ${goal})` : ""}: ${shownBlocks(pageOf(request.data, homeKey(home)) ?? [])
        .map((block) => `${block.id} (${block.type}${block.title ? ` “${block.title}”` : ""}, ${viewOf(block)}, ${block.width ?? "full"})`).join("; ") || "empty"}`;
    }).filter((line) => (budget -= line.length + 1) > 0);
    return {
      description: "Propose how one domain or project page is arranged: its whole list of blocks, top to bottom."
        + " Keep a block by its id, or add tasks, projects or resources as new:tasks, new:projects or new:resources; view and width change how it draws."
        + " Set up new trackers, goals, countdowns, habits, checklists or milestones in their own lists and place each as new: and its title."
        + " A block left out is removed; a data widget left out is put away with what it logged.",
      progress: "Arranging the page",
      prompt: "When the person asks to change what a domain or project page shows or how it looks, or for a page that fits a place, call list_pages, then arrange_page with that page's full new list in order."
        + " Choose widgets that serve the place's goal: a tracker for a number that changes (weight, signups), a habit for something done most days, a goal for an amount to reach, a countdown or milestones for dates, a checklist for a definition of done."
        + " Fill their settings from the goal and what the person said; leave out numbers you'd have to guess, since the person logs their own. Then say in a short line per widget why it fits, naming only what your proposal holds.",
      // Offered only after list_pages, which it needs for the block ids and goals anyway (D57).
      after: "list_pages",
      args: {
        place: { description: "The page's place.", oneOf: [...places.keys()], show: true },
        blocks: { description: "The page's blocks in order, top first.", list: { max: 12 }, fields: {
          block: { description: "A block id from list_pages; new:tasks, new:projects or new:resources; or new: and the title of a widget set up below." },
          view: { description: "One of the views list_pages gives for the block's kind.", oneOf: [...new Set(Object.values(widgetKinds).flatMap((kind) => Object.keys(kind.views)))], show: true, optional: true },
          width: { description: "How wide it is.", oneOf: Object.keys(blockWidths), show: true, optional: true } } },
        ...setupArgs,
      },
      lookup: {
        name: "list_pages",
        description: "List each page you can arrange with its place's goal and blocks, and the views each kind of block offers. Call it before arrange_page.",
        progress: "Looking at the pages",
        result: `Views: ${Object.entries(widgetKinds).map(([type, kind]) => `${type} ${Object.keys(kind.views).join("/")}`).join("; ")}.\n`
          + `Pages (block id (type “title”, view, width)):\n${shown.join("\n") || "none"}`,
      },
    };
  },
  propose: (request, args, id) => {
    const home = typeof args.place === "string" ? request.workspace.places.get(args.place) : undefined;
    if (!home) return undefined;
    const place = homeKey(home);
    const shown = shownBlocks(pageOf(request.data, place) ?? []);
    const setUp = setUpWidgets(args, new Date().toLocaleDateString("en-CA"));
    const to: Block[] = [];
    const look = (base: Block, view: string | undefined, width: string | undefined) =>
      ({ ...base, ...view && view in widgetKinds[base.type].views && { view }, ...width && width in blockWidths && { width: width as BlockWidth } });
    const ids = new Set([...request.data.domains, ...request.data.projects].flatMap((item) => item.widgets ?? []).map((block) => lower(block.id)));
    for (const entry of records(args.blocks, "block")) {
      // A widget set up in this proposal: by its title, models sometimes leaving out new:; by its list's name
      // ("new:goals", seen 2026-11-18), the first not yet placed; or by a name holding its title or held by it
      // ("Annual check-up checklist" for "Annual check-up", seen the same day). Record kinds and block ids come first.
      const titled = lower(String(entry.block ?? "").replace(/^\s*new:/i, ""));
      const open = [...setUp.values()].filter((made) => !to.some((block) => block.id === made.id));
      const made = !titled || (recordWidgets as readonly string[]).includes(titled) || ids.has(titled) ? undefined
        : setUp.get(titled) ?? open.find((block) => titled === (block.type === "milestones" ? block.type : `${block.type}s`))
          ?? (titled in widgetKinds ? undefined : open.find((block) => titled.includes(lower(block.title!)) || lower(block.title!).includes(titled)));
      if (made) {
        if (!to.some((block) => block.id === made.id)) to.push(look(made, entry.view, entry.width));
        continue;
      }
      // An older function sends tokens such as tasks@when#wide; its fields arrive inside the block name.
      const [, added, asked, inView, inWidth] = String(entry.block ?? "").trim().match(/^(new:)?([\w-]+)(?:@(\w+))?(?:#(\w+))?$/) ?? [];
      if (!asked) continue;
      // Models also borrow a block id from another page (seen 2026-11-06); that means a block of the same kind here.
      const elsewhere = [...request.data.domains, ...request.data.projects].flatMap((item) => item.widgets ?? []).find((block) => block.id === asked);
      const name = shown.some((block) => block.id === asked) || !elsewhere ? asked : elsewhere.type;
      const fresh = (recordWidgets as readonly string[]).includes(name) ? { id: `${name}-${crypto.randomUUID().slice(0, 8)}`, type: name as Widget } : undefined;
      // Models often name a widget instead of a block id (seen 2026-11-06): that means its first unused block, or a new
      // one when the page has none of that kind; a repeat adds nothing.
      const ofType = shown.filter((block) => block.type === name);
      const base = added ? fresh : shown.find((block) => block.id === name)
        ?? (ofType.length ? ofType.find((block) => !to.some((item) => item.id === block.id)) : fresh);
      if (!base || to.some((block) => block.id === base.id)) continue;
      to.push(look(base, entry.view ?? inView, entry.width ?? inWidth));
    }
    // A widget set up but not placed still goes on the page, after the rest.
    to.push(...[...setUp.values()].filter((made) => !to.some((block) => block.id === made.id)).slice(0, Math.max(0, 12 - to.length)));
    if (!to.length || layoutOf(to) === layoutOf(shown)) return undefined;
    const record = home.projectId ? request.data.projects.find((project) => project.id === home.projectId)
      : request.data.domains.find((domain) => domain.name === home.domain);
    return { ...pending(id), projectId: home.projectId, items: [],
      changes: [{ kind: "page", place, title: request.workspace.nameOf(home), from: record?.widgets ?? null, to }] };
  },
};
export const review_changes: CommandDef = {
  needs: ["see-tasks"],
  spec: (request) => {
    const quiet = quietProjects(request);
    const { loose, projects } = looseTasks(request);
    return {
      description: "Propose a review in one go: tick off done tasks, give overdue tasks new days, file loose tasks into the project they serve, and archive quiet projects.",
      progress: "Reviewing",
      prompt: "When you're asked for a review, call list_tasks (and read_notes when you can), then review_changes once with everything worth changing. Archive only projects listed as quiet in review_changes.",
      // Offered once list_tasks ran, which a review starts with anyway.
      after: "list_tasks",
      args: {
        complete: { description: "Exact titles of open tasks that are done.", list: { max: 20 }, oneOf: openTitles(request), optional: true },
        reschedule: { description: "Overdue open tasks and their new due dates.", list: { max: 10 }, optional: true, fields: {
          title: { description: "Exact title of an open task.", oneOf: openTitles(request) },
          due: { description: "New due date, YYYY-MM-DD.", date: true } } },
        ...loose.length > 0 && { file: { description: "Open tasks sitting in a domain that are plainly a step of one of its projects, and that project. Leave a one-off where it is.", list: { max: 10 }, optional: true, fields: {
          title: { description: "Exact title of a loose task.", oneOf: loose.map((task) => task.title) },
          project: { description: "The project it serves.", oneOf: projects, show: true } } } },
        archive: { description: `Quiet projects to archive: ${quiet.map(({ project, days }) => `${project.title} (untouched ${days} days)`).join("; ") || "none right now"}.`.slice(0, 400),
          list: { max: 5 }, oneOf: quiet.map(({ project }) => project.title), show: true, optional: true },
      },
    };
  },
  propose: (request, args, id) => {
    const open = openTasks(request);
    const find = (title: unknown) => typeof title === "string" ? open.find((task) => task.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) : undefined;
    const done = [...new Set(texts(args.complete).flatMap((title) => find(title) ?? []))];
    const moves = records(args.reschedule, "title").flatMap(({ title, due }) => {
      const task = find(title);
      return task && isDay(due) && due !== task.due && !done.includes(task) ? [{ task, due }] : [];
    }).filter((move, index, all) => all.findIndex((other) => other.task.id === move.task.id) === index);
    const { loose } = looseTasks(request);
    // A loose task goes only to a project of its own domain, so filing never moves work between areas of life.
    const filed = records(args.file, "title").flatMap(({ title, project }) => {
      const task = loose.find((item) => typeof title === "string" && lower(item.title) === lower(title));
      const to = typeof project === "string" ? request.workspace.places.get(project) : undefined;
      return task && to?.projectId && to.domain === task.domain && !done.includes(task) ? [{ task, to }] : [];
    }).filter((move, index, all) => all.findIndex((other) => other.task.id === move.task.id) === index);
    const quiet = quietProjects(request);
    const archived = texts(args.archive)
      .flatMap((title) => quiet.find(({ project }) => project.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) ?? []);
    const changes = [
      ...done.map((task) => ({ kind: "complete" as const, taskId: task.id, title: task.title })),
      ...moves.map(({ task, due }) => ({ kind: "reschedule" as const, taskId: task.id, title: task.title, from: task.due, to: due })),
      ...filed.map(({ task, to }) => ({ kind: "move" as const, taskId: task.id, title: task.title,
        from: { domain: task.domain, projectId: "" }, to: { domain: to.domain, projectId: to.projectId } })),
      ...archived.map(({ project, days }) => ({ kind: "archive" as const, projectId: project.id, title: project.title, quietDays: days })),
    ];
    return changes.length ? { ...pending(id), projectId: "", items: [], changes } : undefined;
  },
};
