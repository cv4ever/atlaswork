// The model comparison's fixed requests (compare.ts, README "Live agents"), in their own module so the admin page
// (/dev/admin/) can list the cases that cover an agent and run just those. Data only: no Node APIs.
import type { RoutineKind } from "../../src/model.ts";
import type { RoutineOwner } from "../../src/routines.ts";

/**
 * Page cases, checked on the blocks the browser resolves: `first`, `has` and `lacks` name a block id or widget, optionally `@view`.
 * Persona cases check what an agent's house rules promise: `asks` wants a question back, `avoids` words the reply must not
 * use, `mentionsAny` at least one of its words, `maxWords` a length cap, `dated` a due date on some proposed task.
 * `count` caps how many tasks a proposal holds, `weekday` is the day of the week (0 Sunday) every due date falls on.
 * A review's `complete` and `reschedule` name a word one of its ticked or moved titles holds; `quiet` wants the
 * routine's "NOTHING NEW". Memory cases (D49): `remembers` a word what the reply remembered holds, `replaces` that it
 * corrected the memory it was shown, `forgets` that it remembered nothing. `command: "any"` accepts a proposal or none.
 * Asking cases (D50): `to` is the agent an `ask_agent` names; any ask that promises a follow-up without `then` misses.
 * Agent drafts (D57): `start` is who a `propose_agent` starts from (a crew agent, a suggested agent, or "new"), and
 * `planted` wants a new domain planted with it.
 * Projects (D61): `projects` is how many new projects the draft makes at least (a propose_project makes one), and
 * `together` words whose tasks must all land in one project, new or existing. `rehome` wants a whole project whose
 * place holds `project` moved to a domain whose name holds `to` (an existing one, or the one it plants). `led` is who
 * a propose_project names to lead it.
 * Fills (D63): `fill` checks what a dialog's fill set: words the title or name holds (any one), the domain, a finish
 * date, "none", or a date holding "-03-15", at least so many steps, the lead or keeper ("new" for a new agent), routines
 * it adds, words the purpose holds (any one), house rules for a new keeper, and that it named what it assumed.
 */
export type Expect = { command?: "propose_tasks" | "propose_project" | "sort_capture" | "complete_tasks" | "reschedule_tasks" | "move_tasks" | "arrange_page" | "review_changes" | "ask_agent" | "propose_agent" | "fill_project" | "fill_domain" | "offer_choices" | "show_widgets" | "any";
  place?: string; includes?: string; titles?: string[];
  first?: string; has?: string[]; lacks?: string[]; mentions?: string[]; mentionsAny?: string[]; avoids?: string[]; asks?: boolean; maxWords?: number; dated?: boolean;
  count?: number; weekday?: number; complete?: string; reschedule?: string; quiet?: boolean; remembers?: string; replaces?: boolean; forgets?: boolean; to?: string;
  start?: string; planted?: boolean; projects?: number; together?: string[]; rehome?: { project: string; to: string };
  noted?: string; led?: string;
  fill?: { named?: string[]; domain?: string; finish?: "date" | "none" | `-${string}`; steps?: number; lead?: string; keeper?: string; routines?: string[]; purpose?: string[]; rules?: boolean; assumed?: boolean } };
/**
 * `pages` turns on Arrange pages for that case's agent. `suggested` names an onboarding agent the demo cast lacks; it
 * joins the workspace looking after `home`, a project id or a domain name. `files` links the Tax papers folder below
 * to Tax return 2025 (agents-design D47), and the loop's pauses are answered by the browser's own file tools.
 * `history` is the session so far (D28): your messages, and agents' (`agent` names another agent than the case's).
 * `routine` runs that kind of routine for `owner` instead of a message, by its runner, as the Room asks it (D43).
 * `memories` are what earlier sessions remembered (D49): `place` a domain, a project id, or "" for what's about you.
 * `askedBy` makes `request` a question that agent asked for you, worded as the Room words it (D50).
 * `capture` is a note in Everyday attached to the request, as Sort with Atlas attaches one (D53).
 * `form` asks from a dialog's Describe it (D63): `request` is the person's words, put to the agent with the form as a new
 * project opens in `area` (a month out, the domain's agent on it) or as `project` (an id) is, or as a new domain or
 * `domain` (a name) is.
 * `without` names a demo agent the case's workspace lacks, so a ready-made agent of that name is one to bring in (D61).
 */
export type Case = { agent: string; request: string; pages?: boolean; suggested?: string; home?: string; files?: boolean;
  history?: { you?: string; agent?: string; said?: string }[]; routine?: { kind: RoutineKind; owner: RoutineOwner };
  memories?: { text: string; place: string }[]; askedBy?: string; capture?: string; without?: string;
  form?: { kind: "project"; area?: string; project?: string } | { kind: "domain"; domain?: string }; expect: Expect };
/** The demo seed, whose dates count from today. `command` absent means the right reply proposes nothing. */
export const cases: Case[] = [
  { agent: "ledger", request: "Turn my savings rhythm note into tasks.", expect: { command: "propose_tasks", place: "Finance / 2026 savings plan", includes: "review" } },
  { agent: "ledger", request: "I cancelled the video service yesterday.", expect: { command: "complete_tasks", titles: ["Cancel the video service"] } },
  { agent: "ledger", request: "What's due in Finance this week?", expect: { mentions: ["Inês", "pharmacy", "video"] } },
  { agent: "ledger", request: "Which subscription costs the most?", expect: { mentions: ["video"] } },
  { agent: "ledger", request: "Add a task to check when the news subscription renews, under Subscription cleanup.", expect: { command: "propose_tasks", place: "Finance / Subscription cleanup", includes: "news" } },
  { agent: "vital", request: "The blood work is booked, tick it off.", expect: { command: "complete_tasks", titles: ["Book blood work"] } },
  { agent: "vital", request: "What should I bring up at my check-up?", expect: { mentions: ["knee", "headache", "vitamin D"] } },
  { agent: "vital", request: "Turn my training plan into tasks.", expect: { command: "propose_tasks", place: "Health / Strength foundation", includes: "slot" } },
  { agent: "vital", request: "What's overdue in Health?", expect: { mentions: ["blood work"] } },
  { agent: "kin", request: "Gift ideas for Rui?", expect: { mentions: ["corkscrew"] } },
  { agent: "kin", request: "Make tasks from my visit plan.", expect: { command: "propose_tasks", place: "Family / Summer family visit", includes: "long" } },
  { agent: "kin", request: "I called Sofia about Sunday dinner.", expect: { command: "complete_tasks", titles: ["Call Sofia about Sunday dinner"] } },
  { agent: "compass", request: "Where should I start on the portfolio?", expect: { mentions: ["opening project summary"] } },
  { agent: "compass", request: "Turn the portfolio outline into tasks.", expect: { command: "propose_tasks", place: "Career / Portfolio refresh", includes: "case stud" } },
  { agent: "compass", request: "I just sent the offer to three people. Mark it.", expect: { command: "complete_tasks", titles: ["Send the offer to three people"] } },
  { agent: "atlas", request: "What's due today?", expect: { mentions: ["big shop", "3km", "Sofia"] } },
  { agent: "atlas", request: "Add the kitchen chair and hallway bulb fixes from my small fixes note.", expect: { command: "propose_tasks", place: "Everyday", includes: "chair" } },
  { agent: "atlas", request: "Is there a task about the dentist?", expect: { mentions: ["dentist cleaning"], forgets: true } },
  { agent: "atlas", request: "Remind me to book a haircut.", expect: { command: "propose_tasks", includes: "haircut" } },
  { agent: "atlas", request: "Tick off 'Water the plants'.", expect: {} },
  { agent: "vital", pages: true, request: "On the Health page, put the tasks board first and drop the projects.", expect: { command: "arrange_page", place: "Health", first: "health-board", lacks: ["health-projects"] } },
  { agent: "vital", pages: true, request: "Show the First 10K tasks with the next step large instead of grouped by when.", expect: { command: "arrange_page", place: "Health / First 10K", has: ["tasks"], lacks: ["tasks@when"] } },
  { agent: "atlas", request: "Add a list of the other Health projects to the Strength foundation page.", expect: { command: "arrange_page", place: "Health / Strength foundation", has: ["projects"] } },
  // Pages that fit a place's goal (D32, 2026-11-18): a health check-up is a definition of done, a first sale an amount to reach.
  { agent: "vital", pages: true, request: "Set up the Annual check-up page with widgets that fit its goal.", expect: { command: "arrange_page", place: "Health / Annual check-up", has: ["checklist"] } },
  { agent: "spark", pages: true, request: "Set up the First paid experiment page with widgets that fit its goal.", expect: { command: "arrange_page", place: "Career / First paid experiment", has: ["goal"] } },
  { agent: "vital", pages: true, request: "Turn my training plan into tasks.", expect: { command: "propose_tasks", place: "Health / Strength foundation", includes: "slot" } },
  // Persona: what each demo agent's house rules promise.
  { agent: "vital", request: "My knee has ached after every run this week. What's wrong with it?", expect: { command: "any", mentionsAny: ["doctor", "physio", "professional", "gp"] } },
  { agent: "ledger", request: "Add a monthly transfer to the emergency fund.", expect: { command: "any", asks: true } },
  { agent: "kin", request: "Remind me to call my brother Rui this weekend.", expect: { command: "propose_tasks", includes: "rui", dated: true } },
  { agent: "compass", request: "I want to grow in my career.", expect: { asks: true } },
  { agent: "quill", request: "Tighten this line: 'I just wanted to quickly reach out to see if you might maybe be interested in having a call at some point.'", expect: { avoids: ["just wanted", "maybe", "quickly"] } },
  { agent: "scout", request: "Should the learning system live in Notion or Obsidian?", expect: { command: "any", mentionsAny: ["depend", "uncertain", "unclear", "unknown", "not sure", "assum"] } },
  { agent: "hearth", request: "The bathroom tap drips and the bedroom window sticks.", expect: { command: "propose_tasks", includes: "tap" } },
  { agent: "muse", request: "Rate my photo walk idea out of ten: shooting only doors in Alfama.", expect: { command: "any", avoids: ["/10", "out of 10", "out of ten"] } },
  { agent: "forge", request: "Plan the contact form for the launch page.", expect: { command: "propose_tasks", includes: "form" } },
  { agent: "spark", request: "Write a one-line pitch for the interface audit offer.", expect: { mentionsAny: ["you", "your"] } },
  { agent: "atlas", request: "I feel overwhelmed this week.", expect: { command: "any", maxWords: 90,
    mentionsAny: ["receipt", "inês", "summary", "blood", "shop", "sofia", "laundry", "run", "lamp"] } },
  // Persona: the onboarding agents the demo cast lacks, each looking after the place its work fits.
  { agent: "", suggested: "Chef", home: "demo-cooking", request: "Plan this week's dinners.", expect: { command: "any", mentionsAny: ["allerg", "dislike"] } },
  { agent: "", suggested: "Helm", home: "demo-paid-offer", request: "Should I raise the price of the interface audit offer?", expect: { command: "any", mentionsAny: ["option", "o1", "prove", "wrong"] } },
  { agent: "", suggested: "Gardener", home: "home-office", request: "Add a task to water the new monstera by the desk.", expect: { command: "any", asks: true } },
  { agent: "", suggested: "Scholar", home: "demo-learning", request: "Break the Learning How to Learn course into study sessions.", expect: { command: "propose_tasks" } },
  { agent: "", suggested: "Creator", home: "demo-photo-walks", request: "I want to make a video about the Alfama doors walk.", expect: { command: "any", mentionsAny: ["script"] } },
  { agent: "", suggested: "Coach", home: "demo-10k", request: "My shin hurts after yesterday's run. What should this week look like?", expect: { command: "any", mentionsAny: ["rest"] } },
  { agent: "", suggested: "Guide", home: "demo-sleep", request: "I want to start meditating for an hour every day.", expect: { command: "any", mentionsAny: ["minute"] } },
  { agent: "", suggested: "Traveler", home: "demo-family-visit", request: "We're visiting family in Porto from 12 to 19 December. Add the bookings we need.", expect: { command: "propose_tasks", dated: true } },
  { agent: "", suggested: "Planner", home: "Everyday", request: "What matters most this week?", expect: { command: "any",
    mentionsAny: ["laundry", "shop", "desk", "lamp", "route", "soup", "batter"] } },
  { agent: "", suggested: "Iris", home: "demo-portfolio", request: "Critique my portfolio outline.", expect: { command: "any", avoids: ["redesign the"], maxWords: 120 } },
  { agent: "", suggested: "Counsel", home: "demo-relaunch", request: "My lease says either party may end it with 60 days' written notice. Can I move out at the end of January?", expect: { command: "any", mentionsAny: ["lawyer", "legal advice"] } },
  { agent: "", suggested: "Mentor", home: "demo-paid-offer", request: "Should I take the full-time job offer or keep freelancing?", expect: { command: "any", asks: true, avoids: ["you should take", "i'd take", "i would take"] } },
  // The requests a brief types for you (agents-design D40), word for word, and a plain request to move late steps.
  { agent: "spark", request: "We're behind on Studio relaunch: 1 of 4 steps done with 80% of the time gone. Help me plan a catch-up.", expect: { command: "reschedule_tasks", dated: true } },
  { agent: "hearth", request: "Move the overdue steps in Tax return 2025 to today.", expect: { command: "reschedule_tasks", includes: "inês" } },
  { agent: "vital", request: "Strength foundation has been quiet for 16 days. Help me pick one step for this week.", expect: { command: "any", mentionsAny: ["gym", "slot", "warm-up"] } },
  { agent: "hearth", request: "Help me plan the first week of Home office corner.", expect: { command: "any", mentionsAny: ["desk", "lamp", "cable"] } },
  { agent: "vital", request: "Suggest the first three steps for Lights out by eleven.", expect: { command: "propose_tasks", place: "Health / Lights out by eleven" } },
  // Linked folders (D47): Ledger looks after Finance, so it reads the Tax papers folder linked to Tax return 2025.
  { agent: "ledger", files: true, request: "Where do my tax notes say the receipts are kept?", expect: { mentions: ["blue box"] } },
  { agent: "ledger", files: true, request: "When is my home insurance renewal due?", expect: { mentionsAny: ["1 march", "2027-03-01", "march 1"] } },
  // The photo (D58): models with a seeing model read the total off it; the CLI rows, which have none, miss this case.
  { agent: "ledger", files: true, request: "What does the photo of the pharmacy receipt say?", expect: { mentionsAny: ["6,90", "6.90", "ibuprof"] } },
  { agent: "ledger", files: true, request: "Turn the to-do list in my tax notes file into tasks.", expect: { command: "propose_tasks", includes: "accountant" } },
  { agent: "ledger", files: true, request: "Summarise what's in my Tax papers folder.", expect: { mentionsAny: ["receipt", "insurance"], avoids: ["wire", "transfer €"], forgets: true } },
  // Multi-turn (D28): what the session already said changes the right answer.
  { agent: "ledger", history: [{ you: "Add a task to compare two energy suppliers." }, { said: "I suggest a task “Compare two energy suppliers” in Finance. Want a due date on it?" }],
    request: "Yes, make it next Friday.", expect: { command: "propose_tasks", includes: "energy", dated: true } },
  { agent: "kin", history: [{ you: "Remind me to call Sofia about Sunday dinner." }, { said: "There's already an open task for that: Call Sofia about Sunday dinner, due today." }],
    request: "Oh right. I just called her, so tick it off.", expect: { command: "complete_tasks", titles: ["Call Sofia about Sunday dinner"] } },
  { agent: "vital", history: [{ you: "What's overdue in Health?" }, { said: "Book blood work is overdue; it was due two days ago." }],
    request: "I did that yesterday.", expect: { command: "complete_tasks", titles: ["Book blood work"] } },
  { agent: "vital", history: [{ you: "Turn my training plan into tasks." },
    { said: "I suggest three tasks in Strength foundation: book a gym slot, learn the warm-up, log the first session. Nothing changes until you approve." }],
    request: "Too many. Just the first one.", expect: { command: "propose_tasks", includes: "slot", count: 1 } },
  { agent: "kin", history: [{ you: "I'm planning the summer family visit." }, { said: "Good: the visit plan note has the dates and who's hosting. What do you want to sort first?" }],
    request: "Add booking the train to it.", expect: { command: "propose_tasks", place: "Family / Summer family visit", includes: "train" } },
  { agent: "atlas", history: [{ you: "@Vital what should I bring to my check-up?" }, { agent: "vital", said: "Bring up the knee, the headaches and your vitamin D." }],
    request: "What did Vital say about the knee?", expect: { mentions: ["knee"] } },
  // The task the earlier turn added is in the seed, so thanks needs no second proposal.
  { agent: "ledger", history: [{ you: "Remind me to cancel the video service." }, { said: "I added 1 task: Cancel the video service, due in two days. Undo if it isn't right." }],
    request: "Thanks!", expect: { maxWords: 40 } },
  // Routines (D43): the request the Room sends, run by the routine's runner.
  { agent: "", routine: { kind: "review", owner: { kind: "domain", id: "Health" } }, request: "", expect: { command: "review_changes", complete: "blood work" } },
  { agent: "", routine: { kind: "review", owner: { kind: "domain", id: "Career" } }, request: "", expect: { command: "review_changes", reschedule: "opening project summary" } },
  { agent: "", routine: { kind: "report", owner: { kind: "domain", id: "Finance" } }, request: "", expect: { mentions: ["Inês"] } },
  { agent: "", routine: { kind: "check-in", owner: { kind: "project", id: "demo-family-visit" } }, request: "", expect: { command: "propose_tasks", place: "Family / Summer family visit" } },
  { agent: "", routine: { kind: "check-in", owner: { kind: "project", id: "demo-checkup" } }, request: "", expect: { quiet: true } },
  // Memory (D49): what an earlier session remembered changes this one; only the person's own words are remembered.
  { agent: "ledger", memories: [{ text: "Wants every new task due on a Monday.", place: "" }], request: "Add a task to renew my passport.",
    expect: { command: "propose_tasks", includes: "passport", dated: true, weekday: 1 } },
  { agent: "vital", request: "From now on I only run in the mornings, never after work.", expect: { command: "any", remembers: "morning" } },
  { agent: "vital", memories: [{ text: "Runs three times a week.", place: "Health" }], request: "Actually, I run four times a week now.",
    expect: { command: "any", remembers: "four", replaces: true } },
  // Asking Vital (D50) is a fine answer here too; what matters is that Health's memory stays out of Ledger's reply.
  { agent: "ledger", memories: [{ text: "Has a bad left knee.", place: "Health" }], request: "What do you know about my health?", expect: { command: "any", avoids: ["knee"], forgets: true } },
  // Asking each other (D50): ask the agent whose places hold the answer; answer a question from your own, asking nobody.
  { agent: "ledger", request: "When is my dentist cleaning?", expect: { command: "ask_agent", to: "Vital" } },
  { agent: "compass", request: "Is my blood work booked yet?", expect: { command: "ask_agent", to: "Vital" } },
  { agent: "vital", askedBy: "Ledger", request: "When is the dentist cleaning due?", expect: { mentions: ["dentist"], forgets: true } },
  // Agent drafts (D57): Atlas starts from a crew agent whose work it is, then a suggested agent, then new; a vague goal gets one question.
  // Kin already keeps birthdays, so naming Kin is a right answer too; a draft, if any, must start from Kin.
  { agent: "atlas", request: "I'd like an agent to keep track of my family's birthdays and gift ideas.", expect: { command: "any", mentions: ["Kin"], start: "Kin" } },
  // Kin, who already keeps the family's school run, may rightly take homework (crew first), so the suggested-agent case is one no demo agent covers.
  { agent: "atlas", request: "I'd like an agent to practise Spanish with me for ten minutes a day.", expect: { command: "propose_agent", start: "Polyglot" } },
  { agent: "atlas", request: "I'd like an agent to help me look after my beehives: hive checks, honey harvests, what each season needs.", expect: { command: "propose_agent", start: "new", planted: true } },
  { agent: "atlas", request: "I need a new agent.", expect: { asks: true } },
  // Projects (D61), from Carlos's use cases of 2026-11-17: a brain dump whose items share an outcome gets a project for
  // them; a project asked for without its deadline or scope gets a question first, and once answered, the project.
  { agent: "atlas", capture: "ao criar um domain, deve sempre ser o default um agente sugerido\n\nerro de design na sidebar do atlaswork\n\nverificar e optimizar as descrições dos produtos no mql5.com\n\nadicionar feature no atlaswork, no 'capture' adicionar um braindump, que o atlas depois arruma e organiza, sugere novas tasks, projetos, etc.\n\ncriar uma pagina no atlaswork, para gerir as configurações dos agentes. página só deve estar visivel em dev, e deve mostrar tudo o que os agentes carregam.",
    request: "Sort this capture for me: what to do as tasks where they belong, with the days I named, and notes for what's worth keeping.",
    expect: { command: "sort_capture", projects: 1, together: ["sidebar", "braindump", "brain dump", "brain-dump"] } },
  { agent: "", suggested: "Scholar", home: "Family", request: "help me create a new project. the goal of this project is to help my daughter Ines with her school assignment for the Poruguese class",
    expect: { asks: true } },
  { agent: "", suggested: "Scholar", home: "Family", history: [{ you: "help me create a new project. the goal of this project is to help my daughter Ines with her school assignment for the Poruguese class" },
    { said: "Happy to. What is the assignment, and when is it due?" }],
    request: "A two-page essay on a poem by Sophia de Mello Breyner, due next Friday.", expect: { command: "propose_project", projects: 1, dated: true } },
  { agent: "vital", request: "Move Refill vitamin D into the Annual check-up project.", expect: { command: "move_tasks", mentionsAny: ["check-up", "checkup"] } },
  // Someone else's request passed on (2026-11-20, Carlos's example): a client wants an app built. Atlas answers in
  // English though the request quotes Portuguese, asks whether he takes it on and by when with answers to tap, then
  // makes the project with the request itself kept in a note and nothing remembered twice. In a
  // domain he plants with it when Carlos says client work is a regular thing (D61).
  { agent: "atlas", request: "one of the workers of 'ceramicapreferivel' asked for a mobile app for android. he said: '[06:31, 11/20/2026] Paulo: Preciso de uma APP que faça as seguintes funções , basicamente um logbook de eventos na fábrica com separadores das diferentes secções onde eu registo (preferencialmente por voz depois transcrito e resumido por ia) as avarias e as soluções . [06:32, 11/20/2026] Paulo: Por explempo ; Secção produção Data xxx.  Evento xxxx Avaria xxx Solução xxxx'",
    expect: { command: "offer_choices", asks: true, avoids: [" não ", " você", " uma ", " para "] } },
  { agent: "atlas", history: [{ you: "one of the workers of 'ceramicapreferivel' asked for a mobile app for android. he said: '[06:31, 11/20/2026] Paulo: Preciso de uma APP que faça as seguintes funções , basicamente um logbook de eventos na fábrica com separadores das diferentes secções onde eu registo (preferencialmente por voz depois transcrito e resumido por ia) as avarias e as soluções . [06:32, 11/20/2026] Paulo: Por explempo ; Secção produção Data xxx.  Evento xxxx Avaria xxx Solução xxxx'" },
    { said: "Before I set it up: are you taking this on as a paid job, and when does Paulo need it?" }],
    request: "Paid job. He wants it working by the end of January.",
    expect: { command: "propose_project", projects: 1, dated: true, mentionsAny: ["paulo", "cerâmica", "ceramica"], noted: "preciso", forgets: true, led: "forge" } },
  { agent: "atlas", history: [{ you: "one of the workers of 'ceramicapreferivel' asked for a mobile app for android. he said: '[06:31, 11/20/2026] Paulo: Preciso de uma APP que faça as seguintes funções , basicamente um logbook de eventos na fábrica com separadores das diferentes secções onde eu registo (preferencialmente por voz depois transcrito e resumido por ia) as avarias e as soluções . [06:32, 11/20/2026] Paulo: Por explempo ; Secção produção Data xxx.  Evento xxxx Avaria xxx Solução xxxx'" },
    { said: "Before I set it up: are you taking this on as a paid job, and when does Paulo need it?" }],
    request: "Paid job, working by the end of January. I take on client work like this regularly, so it deserves a domain of its own.",
    expect: { command: "propose_project", projects: 1, dated: true, planted: true, led: "forge" } },
  // Whole projects move (D61): to a domain that fits, into one Atlas plants for them, or a domain planted on its own.
  { agent: "atlas", request: "Can you put the Weeknight cooking rhythm project in a more appropriate domain? Health fits it better.",
    expect: { command: "move_tasks", rehome: { project: "cooking", to: "health" } } },
  { agent: "atlas", history: [{ you: "Can you put the Studio relaunch project in a more appropriate domain?" },
    { said: "Career is the closest domain you have. I can't create domains or move projects from here." }],
    request: "cria um domínio Trabalho e move o projeto para lá", expect: { command: "move_tasks", planted: true, rehome: { project: "studio", to: "trabalho" } } },
  { agent: "atlas", request: "Create a Garden domain for the vegetable patch and the fruit trees.", expect: { command: "move_tasks", planted: true } },
  // Describe it (D63): a dialog's words fill its form, never a question; vague or dictated words still fill it, saying what was assumed.
  { agent: "vital", form: { kind: "project", area: "Health" }, request: "I want to run my first 10k at the Lisbon race on the 15th of March",
    expect: { command: "fill_project", fill: { named: ["10k", "10 k", "lisbon"], finish: "-03-15", steps: 2 } } },
  { agent: "vital", form: { kind: "project", area: "Health" }, request: "get fitter", expect: { command: "fill_project", fill: { steps: 1, assumed: true } } },
  { agent: "atlas", form: { kind: "project", area: "Everyday" }, request: "uh so I need to like sort out the garage before my parents come at christmas, throw stuff out, maybe sell the old bike",
    expect: { command: "fill_project", fill: { named: ["garage"], finish: "-12-", steps: 2 } } },
  { agent: "kin", form: { kind: "project", area: "Family" }, request: "Quero organizar a festa de anos da Sofia no dia 12 de dezembro, com jantar em casa",
    expect: { command: "fill_project", fill: { finish: "-12-12", steps: 2 } } },
  { agent: "vital", form: { kind: "project", project: "demo-10k" }, request: "push it back two weeks and add a weekly long run",
    expect: { command: "fill_project", fill: { finish: "date", steps: 1 } } },
  { agent: "atlas", form: { kind: "domain" }, request: "I've started learning piano and want to practise most days",
    expect: { command: "fill_domain", fill: { named: ["music", "piano"], keeper: "new", rules: true } } },
  { agent: "atlas", form: { kind: "domain" }, request: "something for my little side business selling art prints online",
    expect: { command: "fill_domain", fill: { named: ["print", "shop", "business", "art", "studio"] } } },
  { agent: "atlas", form: { kind: "domain", domain: "Health" }, request: "make it about sleep and energy too, and give me a weekly report",
    expect: { command: "fill_domain", fill: { purpose: ["sleep"], routines: ["report"] } } },
  // A suggested agent whose work fits joins a new domain or leads a new project, whatever it's called (2026-11-18: Atlas
  // planted Schoolwork for Inês's assignments but kept the dialog's default keeper, where Tutor fit).
  { agent: "atlas", form: { kind: "domain" }, request: "i need to help my daugter ines do a school assignemnt. i usually also help my other children with such assignments",
    expect: { command: "fill_domain", fill: { named: ["school", "homework", "study"], keeper: "tutor" } } },
  { agent: "atlas", form: { kind: "project", area: "Everyday" }, request: "I want to build a small app to track my habits and ship it by the end of January",
    expect: { command: "fill_project", fill: { named: ["habit", "app"], finish: "-01-31", lead: "forge" } } },
  // Richer replies (D64): a question with a few likely answers offers them to tap; "how is it going" shows the widget itself;
  // a side-by-side comparison may come as a small table.
  { agent: "vital", request: "I want to start one new healthy habit. Help me pick it.", expect: { command: "offer_choices", asks: true } },
  { agent: "vital", request: "How is my sleep going?", expect: { command: "show_widgets", mentionsAny: ["sleep"] } },
  { agent: "ledger", request: "Compare my emergency fund and this year's savings side by side.", expect: { command: "any", mentionsAny: ["|"] } },
  // Routines by default (D68): Atlas's one morning check-in reads every place nobody else checks in on and files tasks
  // where they belong; a weekly improvement numbers up to three suggestions (the runner turns them into answers to tap)
  // and changes nothing.
  { agent: "", routine: { kind: "check-in", owner: { kind: "agent", id: "atlas" } }, request: "", expect: { command: "propose_tasks" } },
  { agent: "", routine: { kind: "improve", owner: { kind: "agent", id: "vital" } }, request: "", expect: { mentionsAny: ["1."] } },
  // Paulo's app with no Forge in the crew (D61): Atlas brings him in to lead it rather than leaving it to the keeper.
  { agent: "atlas", without: "Forge", history: [{ you: "one of the workers of 'ceramicapreferivel' asked for a mobile app for android. he said: '[06:31, 11/20/2026] Paulo: Preciso de uma APP que faça as seguintes funções , basicamente um logbook de eventos na fábrica com separadores das diferentes secções onde eu registo (preferencialmente por voz depois transcrito e resumido por ia) as avarias e as soluções . [06:32, 11/20/2026] Paulo: Por explempo ; Secção produção Data xxx.  Evento xxxx Avaria xxx Solução xxxx'" },
    { said: "Before I set it up: are you taking this on as a paid job, and when does Paulo need it?" }],
    request: "Paid job, working by the end of January. I take on client work like this regularly, so it deserves a domain of its own.",
    expect: { command: "propose_project", projects: 1, planted: true, led: "forge" } },
];

/** A case's name in the baseline: its numbers shift as cases are added, its words don't. */
export const keyOf = (item: Case) => [item.suggested ?? item.agent, item.without && `without ${item.without}`, item.pages && "pages", item.files && "files", item.askedBy && `asked by ${item.askedBy}`,
  item.routine && `${item.routine.kind} for ${item.routine.owner.id}`, item.form && `${item.form.kind} form${"project" in item.form && item.form.project ? ` for ${item.form.project}` : "domain" in item.form && item.form.domain ? ` for ${item.form.domain}` : ""}`,
  ...(item.history ?? []).map((turn) => turn.you ?? turn.said), item.request].filter(Boolean).join(" | ");
