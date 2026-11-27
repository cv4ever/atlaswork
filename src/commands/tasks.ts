// Commands that propose tasks (D33): new ones, a capture sorted into places, ticking, rescheduling and moving them.
import { atlasId, canUse } from "../model.ts";
import { records, isDay, pending, texts } from "./define.ts";
import { isClock } from "../dates.ts";
import type { CommandDef } from "./define.ts";
import { openTitles, domainsOf, namedProjects, homeIn, lower, madeFor, openTasks, placesText, plantFor } from "./request.ts";

export const propose_tasks: CommandDef = {
  needs: ["add-tasks"],
  spec: (request) => ({
    description: "Propose up to 8 new tasks in one place, each with an optional due date.",
    progress: "Drafting tasks",
    // "Or a rule you remember": the narrow rule alone beat a remembered "every new task due on a Monday" (2026-11-14).
    prompt: "When you'd suggest new tasks, call propose_tasks instead of only listing them. Give a task a due date only when the person named a day, the work has a deadline, or a rule you remember about the person says when tasks are due. Give it a time only when it has a due date and the person named a time or the thing happens at one (an appointment, a call); Today places it in their day.",
    args: {
      place: { description: "One of your places.", oneOf: [...request.workspace.places.keys()], show: true },
      // Titles already open only reach the function when the agent may see tasks.
      tasks: { description: "The new tasks.", list: { max: 8 }, except: canUse(request.agent, "see-tasks") ? openTitles(request) : [],
        fields: { title: { description: "Short task title." }, due: { description: "Due date, YYYY-MM-DD.", date: true, optional: true },
          at: { description: "Time on its due day, HH:MM (24-hour), only when it happens at a time.", optional: true },
          // Atlas's one check-in reads notes across many places (agents-design D68), so its tasks may land in several.
          ...request.routine?.kind === "check-in" && request.workspace.places.size > 1 && {
            place: { description: "Its place, when it isn't the place above.", oneOf: [...request.workspace.places.keys()], show: true, optional: true } } } },
    },
  }),
  propose: (request, args, id) => {
    const home = typeof args.place === "string" ? request.workspace.places.get(args.place) : undefined;
    const items = records(args.tasks, "title").map(({ title, due, at, place }) => ({ title: typeof title === "string" ? title.trim() : "", due: isDay(due) ? due : "",
      at: isDay(due) && isClock(at) ? at : undefined,
      home: request.routine?.kind === "check-in" && typeof place === "string" ? request.workspace.places.get(place) ?? home : home }))
      .filter((item) => item.title).slice(0, 8);
    if (!home || !items.length) return undefined;
    return { ...pending(id), projectId: items.every((item) => item.home === home) ? home.projectId : "", items: items.map(({ title, due, at, home: there }) => ({
      id: crypto.randomUUID(), ...there!, title, done: false, due, ...(at ? { at } : {}), createdBy: id, agentId: request.agent.id })) };
  },
};

// Capture's Sort with Atlas (agents-design D53): the attached capture becomes tasks and notes across your places at
// once, in new projects when several belong together and no project holds them yet (D61).
export const sort_capture: CommandDef = {
  needs: ["add-tasks"],
  when: (request) => !!request.workspace.attached,
  spec: (request) => {
    const places = [...request.workspace.places.keys()];
    const place = { description: "Where it belongs: one of your places (for a new project, its domain). Everyday when nothing fits better.", oneOf: places, show: true };
    // Seen 2026-11-17: a model listed new projects, then filed their things elsewhere; nothing lands in a project unless named here.
    const project = { description: "The exact title of the new project from projects it goes in. A new project only gets what names it here.", optional: true };
    const atlas = request.agent.id === atlasId;
    return {
      description: "Sort the attached capture in one go: each thing to do becomes a task in the place it belongs, each idea, fact or reference worth keeping becomes a note there, and things that belong together with no project yet get a new project. The person reviews it, then applies or undoes it.",
      progress: "Sorting your capture",
      prompt: "When the person asks you to sort a capture, call sort_capture once with everything in it, never propose_tasks. Things to do belong in projects: an existing project whose own goal they serve (a similar name isn't enough), else a new project in projects shared by everything with that outcome, named for what they share (a fix and two features for one app: one project named for the app, not one per feature), naming its title in each one's project. Only a one-off with no larger outcome goes straight in the domain it is about (money in Finance, family in Family); Everyday only when nothing fits."
        + (atlas ? " When several things belong to an area no domain covers, suggest it in domains and put them in the nearest place meanwhile." : "")
        + " One task per thing to do, a short title in their words; a due date only for a day they named or a real deadline (a reminder is a task due that day). A note only for a thought worth keeping that isn't a task, close to their words. Leave out open tasks. Reply in one short line: what you left out and why, or that everything has a place.",
      args: {
        projects: { description: "New projects, each holding two or more things with one outcome (one app, one trip); never one per thing.", list: { max: 3 }, optional: true,
          fields: { title: { description: "The project's name, a few words." }, domain: { description: "Its domain: one of yours.", oneOf: domainsOf(request), show: true },
            goal: { description: "What it's for, one sentence.", optional: true } } },
        tasks: { description: "The things to do.", list: { max: 20 }, optional: true, except: canUse(request.agent, "see-tasks") ? openTitles(request) : [],
          fields: { title: { description: "Short task title." }, place, project, due: { description: "Due date, YYYY-MM-DD.", date: true, optional: true } } },
        notes: { description: "The thoughts worth keeping.", list: { max: 10 }, optional: true,
          fields: { title: { description: "Short note title." }, place, project, body: { description: "The note's words, if more than the title.", optional: true } } },
        ...atlas && { domains: { description: "Domains to suggest planting; the person decides.", list: { max: 2 }, optional: true,
          except: request.data.domains.map((domain) => domain.name),
          fields: { name: { description: "The domain's name." }, emoji: { description: "One emoji.", optional: true }, purpose: { description: "What it's for, one short line.", optional: true } } } },
      },
    };
  },
  propose: (request, args, id) => {
    // A new project may hold one thing: dropping those (tried 2026-11-17) left 3 of 5 sorts of Carlos's brain dump with
    // its Atlaswork features loose in Career when the model made one project per feature (D61).
    const projects = namedProjects(request, args.projects, 3);
    const at = new Date().toISOString();
    const items = records(args.tasks, "title").flatMap(({ title, place, project, due }) => {
      const home = homeIn(request, projects, place, project);
      return home && title?.trim() ? [{ id: crypto.randomUUID(), ...home, title: title.trim(), done: false, due: isDay(due) ? due : "", createdBy: id, agentId: request.agent.id }] : [];
    }).slice(0, 20);
    const notes = records(args.notes, "title").flatMap(({ title, place, project, body }) => {
      const home = homeIn(request, projects, place, project);
      return home && title?.trim() ? [{ id: crypto.randomUUID(), ...home, title: title.trim(), body: body?.trim() ?? "", linkedProjectIds: [], updatedAt: at }] : [];
    }).slice(0, 10);
    const taken = new Set(request.data.domains.map((domain) => lower(domain.name)));
    const domains = request.agent.id !== atlasId ? [] : records(args.domains, "name").flatMap(({ name, emoji, purpose }) => name?.trim() && !taken.has(lower(name))
      ? [{ name: name.trim().slice(0, 40), emoji: emoji?.trim() || "🌱", intention: purpose?.trim() ?? "" }] : []).slice(0, 2);
    if (!items.length && !notes.length) return undefined;
    const made = madeFor(projects, [...items, ...notes]);
    return { ...pending(id), projectId: "", items, ...notes.length ? { notes } : {}, ...made.length ? { projects: made } : {}, ...domains.length ? { domains } : {} };
  },
};
export const complete_tasks: CommandDef = {
  needs: ["see-tasks", "add-tasks"],
  spec: (request) => ({
    description: "Propose ticking off open tasks by their exact titles.",
    progress: "Finding tasks to tick off",
    prompt: "When the person says they did, finished or cancelled something, call list_tasks and complete_tasks for the matching open task; don't add a new task for it. If no open task matches, say so.",
    // Offered once list_tasks ran, which the prompt line asks for first anyway.
    after: "list_tasks",
    args: { titles: { description: "Exact titles of open tasks.", list: { max: 20 }, oneOf: openTitles(request) } },
  }),
  propose: (request, args, id) => {
    const open = openTasks(request);
    const tasks = texts(args.titles).flatMap((title) => open.find((task) => task.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) ?? []);
    return tasks.length ? { ...pending(id), projectId: "", items: [],
      changes: [...new Set(tasks)].map((task) => ({ kind: "complete" as const, taskId: task.id, title: task.title })) } : undefined;
  },
};
export const reschedule_tasks: CommandDef = {
  needs: ["see-tasks", "add-tasks"],
  spec: (request) => ({
    description: "Propose new due dates for open tasks, by their exact titles.",
    progress: "Finding new days",
    prompt: "When the person asks to plan the week, catch up, pick a step or move tasks, call list_tasks, then reschedule_tasks with the new day for each task that should move. Move late tasks to today or soon, never push a task later than its finish line, and leave tasks whose day already works.",
    after: "list_tasks",
    args: { tasks: { description: "Open tasks and their new due dates.", list: { max: 10 }, fields: {
      title: { description: "Exact title of an open task.", oneOf: openTitles(request) },
      due: { description: "New due date, YYYY-MM-DD.", date: true } } } },
  }),
  propose: (request, args, id) => {
    const open = openTasks(request);
    const moves = records(args.tasks, "title").flatMap(({ title, due }) => {
      const task = typeof title === "string" ? open.find((item) => item.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) : undefined;
      return task && isDay(due) && due !== task.due ? [{ task, due }] : [];
    }).filter((move, index, all) => all.findIndex((other) => other.task.id === move.task.id) === index);
    if (!moves.length) return undefined;
    // One project's steps belong to that project's brief (D40); a mix belongs to no single place.
    const projects = new Set(moves.map(({ task }) => task.projectId));
    return { ...pending(id), projectId: projects.size === 1 ? [...projects][0] : "", items: [],
      changes: moves.map(({ task, due }) => ({ kind: "reschedule" as const, taskId: task.id, title: task.title, from: task.due, to: due })) };
  },
};

// A day's plan (agents-design D75): up to three open tasks at times on one day, each with the agent's reason in its own
// words. Today shows each as a next step, dashed on the day line, until you apply it; the morning check-in asks for one.
export const plan_day: CommandDef = {
  needs: ["see-tasks", "add-tasks"],
  spec: (request) => ({
    description: "Propose times on one day for up to three open tasks, by their exact titles, each with one reason.",
    progress: "Planning your day",
    prompt: "When the person asks what to do today, or to plan their day, morning or afternoon, call plan_day with up to three open tasks at times that suit them"
      + " (an errand while shops are open, a call when people answer, focused work early), never at a time another task or event already holds,"
      + " each with one short reason in your own words: why this one, why then. Nothing changes until they apply it.",
    args: {
      day: { description: "The day, YYYY-MM-DD.", date: true },
      steps: { description: "The tasks to put in that day.", list: { max: 3 }, fields: {
        title: { description: "Exact title of an open task.", oneOf: openTitles(request) },
        at: { description: "Start time that day, HH:MM (24-hour)." },
        why: { description: "One short sentence: why this task, why at that time." } } },
    },
  }),
  propose: (request, args, id) => {
    if (!isDay(args.day)) return undefined;
    const day = args.day;
    const open = openTasks(request);
    const steps = records(args.steps, "title").flatMap(({ title, at, why }) => {
      const task = typeof title === "string" ? open.find((item) => item.title.toLocaleLowerCase() === title.trim().toLocaleLowerCase()) : undefined;
      return task && isClock(at) && !(task.due === day && task.at === at) ? [{ task, at, why: typeof why === "string" ? why.trim().slice(0, 200) : "" }] : [];
    }).filter((step, index, all) => all.findIndex((other) => other.task.id === step.task.id) === index).slice(0, 3);
    if (!steps.length) return undefined;
    const projects = new Set(steps.map(({ task }) => task.projectId));
    return { ...pending(id), projectId: projects.size === 1 ? [...projects][0] : "", items: [],
      changes: steps.map(({ task, at, why }) => ({ kind: "reschedule" as const, taskId: task.id, title: task.title, from: task.due, to: day, at,
        ...task.at !== undefined && { fromAt: task.at }, ...why && { why } })) };
  },
};

// Agents file tasks again (D61): open tasks to another of the agent's places, or into a project made with them; whole
// projects to another of its domains; and Atlas plants a domain for them, or on its own when that's all you asked.
export const move_tasks: CommandDef = {
  needs: ["see-tasks", "add-tasks"],
  // Tasks are optional since projects move too, so an agent with no places is left out here.
  when: (request) => !request.routine && request.workspace.places.size > 0,
  spec: (request) => {
    const own = domainsOf(request);
    const projects = [...request.workspace.places].filter(([, home]) => home.projectId && own.includes(home.domain)).map(([place]) => place);
    return {
      description: "Propose moving open tasks, by their exact titles, to another of your places, or into a new project made with them: give it in new_project and its title in each task's project. Whole projects move with everything in them in projects.",
      progress: "Moving tasks",
      prompt: `When the person asks to move, regroup or file tasks or whole projects somewhere else (into a project, another domain, a new project or domain for them), call plan_moves (and list_tasks for tasks), then move_tasks once with each and where it goes.${request.agent.id === atlasId ? " To plant a domain, with or without moves, give it in new_domain." : ""}`,
      // Gated (D61): offered only after plan_moves, so the rest of the turns pay for the lookup alone.
      after: "plan_moves",
      lookup: { name: "plan_moves", description: "List your domains and the projects in them, with what each is for. Call it when the person wants tasks or projects moved or regrouped, or a new domain; then move_tasks is offered.",
        progress: "Looking at where tasks could go", result: placesText(request) },
      args: {
        tasks: { description: "Open tasks and where each goes.", list: { max: 20 }, optional: true, fields: {
          title: { description: "Exact title of an open task.", oneOf: openTitles(request) },
          place: { description: "Where it goes: one of your places (for the new project, its domain).", oneOf: [...request.workspace.places.keys()], show: true },
          project: { description: "The new project's title, when it goes there.", optional: true } } },
        new_project: { description: "A project to make for these tasks, when none of yours fits.", list: { max: 1 }, optional: true, fields: {
          title: { description: "The project's name, a few words." }, domain: { description: "Its domain: one of yours.", oneOf: domainsOf(request), show: true },
          goal: { description: "What it's for, one sentence.", optional: true } } },
        ...projects.length > 0 && { projects: { description: "Whole projects to move to another domain, with everything in them.", list: { max: 5 }, optional: true, fields: {
          project: { description: "The project, as Domain / Project.", oneOf: projects },
          domain: { description: "The domain it goes to: one of yours. Leave out to move it to new_domain.", oneOf: own, show: true, optional: true } } } },
        ...request.agent.id === atlasId && { new_domain: { description: "A domain to plant, named for the area (Work, Clients); its own agent comes with it. Projects with no domain go there.", list: { max: 1 }, optional: true,
          except: request.data.domains.map((domain) => domain.name), fields: {
            name: { description: "The domain's name." }, emoji: { description: "One emoji.", optional: true }, purpose: { description: "What it's for, one short line.", optional: true } } } },
      },
    };
  },
  propose: (request, args, id) => {
    const open = openTasks(request);
    const projects = namedProjects(request, args.new_project, 1);
    const moves = records(args.tasks, "title").flatMap(({ title, place, project }) => {
      const task = typeof title === "string" ? open.find((item) => lower(item.title) === lower(title)) : undefined;
      const to = homeIn(request, projects, place, project);
      return task && to && (task.domain !== to.domain || task.projectId !== to.projectId) ? [{ task, to }] : [];
    }).filter((move, index, all) => all.findIndex((other) => other.task.id === move.task.id) === index);
    const plant = request.agent.id === atlasId ? plantFor(request, args.new_domain) : undefined;
    const own = domainsOf(request);
    // A domain to plant that is here already is that domain.
    const here = own.find((domain) => lower(domain) === lower(records(args.new_domain, "name")[0]?.name ?? ""));
    const rehomes = records(args.projects, "project").flatMap(({ project, domain }) => {
      const home = typeof project === "string" ? request.workspace.places.get(project) : undefined;
      const found = home?.projectId ? request.data.projects.find((item) => item.id === home.projectId) : undefined;
      const to = typeof domain === "string" && own.includes(domain) ? domain : plant?.domain.name ?? here;
      return found && to && own.includes(found.area) && found.area !== to
        ? [{ kind: "rehome" as const, projectId: found.id, title: found.title, from: found.area, to }] : [];
    }).filter((move, index, all) => all.findIndex((other) => other.projectId === move.projectId) === index);
    if (!moves.length && !rehomes.length && !plant) return undefined;
    const made = madeFor(projects, moves.map(({ to }) => to));
    const targets = new Set(moves.map(({ to }) => made.some((project) => project.id === to.projectId) ? "" : to.projectId));
    return { ...pending(id), projectId: targets.size === 1 && !rehomes.length ? [...targets][0] : "", items: [], ...made.length ? { projects: made } : {},
      changes: [...rehomes, ...moves.map(({ task, to }) => ({ kind: "move" as const, taskId: task.id, title: task.title,
        from: { domain: task.domain, projectId: task.projectId }, to: { domain: to.domain, projectId: to.projectId } }))], ...plant && { plant } };
  },
};
