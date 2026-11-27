// Mock data. Unplug it by dropping `withDemoSeed` in main.tsx.
import { atlasAgent, defaultDomain, domainHues } from "./model.ts";
import { addDays, pinnedDay } from "./dates.ts";
import { domainKey, parseHome } from "./place.ts";
import { suggestedAgents } from "./suggestedAgents.ts";
import type { Agent, ChatMessage, Note, Project, Task, Team, Thread, Topic, WorkspaceData } from "./model.ts";
import type { Block } from "./blocks.ts";
import type { WorkspaceStore } from "./workspace.ts";

export function seedWorkspace(): WorkspaceData {
  // A few places keep their own routines, run by whoever looks after them.
  const domains = [
    defaultDomain,
    { name: "Health", emoji: "🌿", hue: domainHues.Sage, intention: "Rested, strong, and kind to my body.",
      routines: [{ id: "demo-r-health", kind: "review" as const, time: "08:00", repeat: { every: "week" as const, days: [1], weeks: 1 }, since: "", quietDays: 60 }] },
    { name: "Family", emoji: "🏡", hue: domainHues.Clay, intention: "Present for the people at my table." },
    { name: "Finance", emoji: "🪙", hue: domainHues.Marigold, intention: "Calm money, no surprises.",
      routines: [{ id: "demo-r-finance", kind: "report" as const, time: "18:00", repeat: { every: "month" as const, day: -1 }, since: "" }] },
    { name: "Career", emoji: "🧭", hue: domainHues.Lagoon, intention: "Work that teaches me something.",
      routines: [{ id: "demo-r-career", kind: "review" as const, time: "18:00", repeat: { every: "week" as const, days: [5], weeks: 2 }, since: "", quietDays: 30 }] },
  ];
  const empty = {
    domains, projects: [], notes: [], tasks: [], topics: [], agents: [], teams: [], threads: [], routineRuns: {}, briefs: {}, memories: [], runs: [],
  };
  const seeded = withDemoResources(withDemoWorld(withDemoAgents(empty)));
  const pages = demoPages();
  return { ...seeded, domains: seeded.domains.map((domain) => ({ ...domain, widgets: pages[domainKey(domain.name)] })),
    projects: seeded.projects.map((project) => ({ ...project, widgets: pages[project.id] })) };
}

/**
 * Every place arranged for what it's about (D32): Health tracks sleep and a habit, the 10K counts down to race day and
 * charts weekly distance, Finance watches an emergency fund and monthly spend. Places not listed keep the default page.
 */
function demoPages(): Record<string, Block[]> {
  const B = (id: string, type: Block["type"], extra: Partial<Block> = {}): Block => ({ id, type, ...extra });
  /** Values logged every `step` days, the last one today. */
  const series = (step: number, values: number[]) => values.map((value, index) => ({ date: dayFrom(-(values.length - 1 - index) * step), value }));
  const done = (...daysAgo: number[]) => daysAgo.map((days) => dayFrom(-days)).sort();
  return {
    "area:Everyday": [
      B("everyday-week", "tasks", { title: "This week at home", view: "when" }),
      B("everyday-cooked", "habit", { title: "Cooked at home", width: "half", days: done(1, 2, 4, 5, 7, 8, 9, 11, 12) }),
      B("everyday-projects", "projects", { width: "half" }),
      B("everyday-kept", "resources", { view: "recent" }),
    ],
    "area:Health": [
      B("health-sleep", "tracker", { title: "Sleep", unit: "h", target: 7.5, width: "half",
        entries: series(1, [6.4, 7.1, 6.8, 7.6, 7.9, 6.2, 7.4, 7.7, 8, 7.2, 6.9, 7.8]) }),
      B("health-lights", "habit", { title: "Lights out by eleven", view: "month", width: "half", days: done(1, 2, 3, 5, 6, 8, 9, 10, 12, 15, 16, 17, 19, 20, 22, 23) }),
      B("health-board", "tasks", { view: "when", width: "wide" }),
      B("health-checkup", "countdown", { title: "Annual check-up", date: dayFrom(23), since: dayFrom(-40), width: "narrow" }),
      B("health-projects", "projects", {}),
    ],
    "demo-10k": [
      B("10k-race", "countdown", { title: "Race day", date: dayFrom(143), since: dayFrom(-60), view: "calendar", width: "narrow" }),
      B("10k-distance", "tracker", { title: "Weekly distance", unit: "km", target: 25, view: "picks", width: "wide",
        entries: series(7, [8, 11, 12.5, 10, 14, 16, 15.5, 18, 19.5]) }),
      B("10k-longest", "goal", { title: "Longest run", unit: "km", current: 7, target: 10, width: "narrow" }),
      B("10k-week", "tasks", { view: "when", width: "wide" }),
      B("10k-plan", "note", { noteId: "demo-10k-plan", width: "half" }),
      B("10k-kept", "resources", { view: "recent", width: "half" }),
    ],
    "demo-strength": [
      B("strength-sessions", "habit", { title: "Training sessions", width: "half", days: done(2, 5, 9, 12) }),
      B("strength-squat", "tracker", { title: "Squat", unit: "kg", view: "latest", width: "half", entries: series(7, [40, 45, 50, 55, 57.5, 60]) }),
      B("strength-tasks", "tasks", { width: "wide" }),
      B("strength-log", "note", { noteId: "demo-training-log", view: "paper", width: "narrow" }),
    ],
    "area:Finance": [
      B("finance-fund", "goal", { title: "Emergency fund", unit: "€", current: 3200, target: 6000, width: "narrow" }),
      B("finance-spend", "tracker", { title: "Monthly spend", unit: "€", target: 1700, better: "down", width: "wide",
        entries: series(30, [1840, 1720, 1910, 1650, 1580, 1620]) }),
      B("finance-board", "tasks", { view: "when" }),
      B("finance-check", "note", { noteId: "demo-money-check", view: "paper", width: "half" }),
      B("finance-projects", "projects", { width: "half" }),
    ],
    "demo-subscriptions": [
      B("subs-total", "tracker", { title: "Subscriptions a month", unit: "€", target: 30, better: "down", view: "latest", width: "narrow", entries: series(30, [42.96, 42.96, 42.96, 28.97]) }),
      B("subs-list", "note", { noteId: "demo-subs", width: "wide" }),
      B("subs-tasks", "tasks"),
    ],
    "demo-savings": [
      B("savings-goal", "goal", { title: "Saved this year", unit: "€", current: 2150, target: 4800, view: "flags", width: "wide" }),
      B("savings-rhythm", "note", { noteId: "demo-savings-note", view: "paper", width: "narrow" }),
      B("savings-tasks", "tasks", { view: "when" }),
    ],
    "area:Family": [
      B("family-birthday", "countdown", { title: "Mãe's birthday", date: dayFrom(58), since: dayFrom(-30), width: "narrow" }),
      B("family-calls", "habit", { title: "Called someone", width: "wide", days: done(0, 2, 3, 6) }),
      B("family-projects", "projects", { view: "tiles" }),
      B("family-week", "tasks", { view: "when" }),
    ],
    "area:Career": [
      B("career-projects", "projects", { width: "wide" }),
      B("career-launch", "countdown", { title: "Studio relaunch", date: dayFrom(9), since: dayFrom(-35), width: "narrow" }),
      B("career-board", "tasks", { view: "when" }),
      B("career-kept", "resources"),
    ],
    "demo-relaunch": [
      B("relaunch-launch", "countdown", { title: "Launch day", date: dayFrom(9), since: dayFrom(-35), width: "narrow" }),
      B("relaunch-week", "tasks", { view: "when", width: "wide" }),
      B("relaunch-intro", "note", { noteId: "demo-relaunch-intro", width: "half" }),
      B("relaunch-kept", "resources", { view: "recent", width: "half" }),
    ],
    "demo-portfolio": [
      B("portfolio-outline", "note", { noteId: "demo-portfolio-note", width: "half" }),
      B("portfolio-board", "tasks", { view: "when", width: "half" }),
      B("portfolio-kept", "resources"),
    ],
  };
}

// The Homebase cast: one specialist per life area, plus a writer and a builder. Role, house rules and warmth come from
// the onboarding suggestion with the same face, so a demo agent behaves like the one a new person picks (D41).
const agent = (id: string, writeMode: Agent["writeMode"] = "full"): Agent => {
  const { name, role, instructions, warmth } = suggestedAgents.find((item) => item.portrait === id)!;
  return { id, name, portrait: id, role, instructions, writeMode, ...warmth !== undefined && { warmth } };
};
const demoAgents: Agent[] = [
  agent("hearth"), agent("vital"), agent("kin", "propose"), agent("ledger", "propose"), agent("compass"),
  agent("spark"), agent("muse"), agent("scout"), agent("quill", "propose"), agent("forge"),
];
const demoTeams: Team[] = [
  { id: "home-front", name: "Home front", purpose: "Keep the household running and spend on it deliberately.", memberIds: ["hearth", "ledger"] },
  { id: "wellbeing-crew", name: "Wellbeing crew", purpose: "Protect energy, training, and the time that makes them possible.", memberIds: ["vital", "kin", "muse"] },
  { id: "career-studio", name: "Career studio", purpose: "Shape how the work is presented and keep direction deliberate.", memberIds: ["compass", "quill", "scout"] },
  { id: "launch-squad", name: "Launch squad", purpose: "Take an offer from positioning to a launch that feels like an invitation.", memberIds: ["spark", "compass", "quill", "forge"] },
  { id: "research-pod", name: "Research pod", purpose: "Turn scattered curiosity into a learning loop that actually finishes things.", memberIds: ["scout", "quill"] },
];
const stewards: Record<string, string> = {
  Health: "vital", Family: "kin", Home: "hearth", Finance: "ledger", Career: "compass", Venture: "spark", Hobbies: "muse", Discovery: "scout",
};

/** The roster: specialists look after their domains, and the default domain's first project gets Home front. */
function withDemoAgents(data: WorkspaceData): WorkspaceData {
  const first = data.projects.find((project) => project.area === data.domains[0]?.name);
  return {
    ...data,
    agents: [...(data.agents.length ? data.agents : [atlasAgent]), ...demoAgents],
    teams: [...data.teams, ...demoTeams],
    domains: data.domains.map((domain) => (stewards[domain.name] ? { ...domain, agentId: stewards[domain.name] } : domain)),
    projects: data.projects.map((project) => (project === first ? { ...project, teamId: "home-front" } : project)),
  };
}

const H = 60, D = 24 * H;
/** A local YYYY-MM-DD `offset` days from today (the pinned day under `?today=`), the shape task due dates use. */
const dayFrom = (offset: number) => {
  if (pinnedDay) return addDays(pinnedDay, offset);
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toLocaleDateString("en-CA");
};
/**
 * A time `minutes` before now; under `?today=` moved by whole days to the pinned day, so a seeded edit reads
 * "12 days ago" and a seeded chat sits on that day whatever the real date (the screenshot regression relies on it).
 */
const ago = (minutes: number) => {
  const shift = pinnedDay ? Math.round((Date.parse(`${pinnedDay}T12:00:00`) - Date.parse(`${new Date().toLocaleDateString("en-CA")}T12:00:00`)) / (D * 60_000)) : 0;
  return new Date(Date.now() + (shift * D - minutes) * 60_000).toISOString();
};
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#efe6d6"/>${body}</svg>`;

const P = (id: string, area: string, title: string, color: string, description: string, crew: Partial<Project> = {}): Project =>
  ({ id, area, title, color, description, ...crew });
/**
 * Every concept at least once: each domain has a few projects in each crew shape (an agent, a team, both, or only the
 * domain's own agent), one finished project rests in the Archive, and loose items sit straight in a domain.
 */
const worldProjects = [
  P("home-office", "Everyday", "Home office corner", "pine", "A calm corner where deep work feels natural.", { agentId: "hearth", teamId: "home-front" }),
  P("demo-photo-walks", "Everyday", "Lisbon photo walks", "ochre", "A personal photo series of the city, one walk at a time.", { agentId: "muse" }),
  P("demo-cooking", "Everyday", "Weeknight cooking rhythm", "sage", "Five dinners that cook themselves, so weeknights stay calm."),
  P("demo-lease", "Everyday", "Lease decision", "clay", "A confident yes or no on the Lisbon apartment.", { archived: true }),
  P("demo-strength", "Health", "Strength foundation", "sage", "Training twice a week feels routine, not effortful.", { agentId: "vital" }),
  P("demo-10k", "Health", "First 10K", "ochre", "Cross the finish line in spring, still smiling.", { teamId: "wellbeing-crew" }),
  P("demo-sleep", "Health", "Lights out by eleven", "pine", "Weeknight sleep that doesn't need willpower."),
  P("demo-checkup", "Health", "Annual check-up", "clay", "Blood work, dentist, and eyes done before December."),
  P("demo-family-visit", "Family", "Summer family visit", "clay", "A week together that everyone remembers warmly.", { agentId: "kin", teamId: "wellbeing-crew" }),
  P("demo-photo-book", "Family", "Family photo book", "ochre", "Twenty summers, printed in time for Mãe's birthday.", { agentId: "muse" }),
  P("demo-birthday", "Family", "Birthday dinner for Sofia", "sage", "A small dinner that feels personal, not produced.", { agentId: "kin", archived: true }),
  P("demo-savings", "Finance", "2026 savings plan", "ochre", "A savings rhythm that survives ordinary months.", { agentId: "ledger" }),
  P("demo-taxes", "Finance", "Tax return 2025", "clay", "Filed early, with every receipt where it belongs.", { teamId: "home-front" }),
  P("demo-subscriptions", "Finance", "Subscription cleanup", "sage", "Pay only for what I used last month."),
  P("demo-portfolio", "Career", "Portfolio refresh", "ochre", "The portfolio opens with one clear, confident story.", { teamId: "career-studio" }),
  P("demo-relaunch", "Career", "Studio relaunch", "clay", "The launch feels like an invitation into the work, not an announcement.", { agentId: "spark", teamId: "launch-squad",
    routines: [{ id: "demo-r-relaunch", kind: "report", time: "12:30", repeat: { every: "week", days: [1, 4], weeks: 1 }, since: "" }] }),
  P("demo-paid-offer", "Career", "First paid experiment", "sage", "One small offer sold to three real people.", { agentId: "spark" }),
  P("demo-learning", "Career", "Learning system", "pine", "A monthly loop for learning something worth keeping.", { agentId: "scout", teamId: "research-pod" }),
];
const worldTopics: Topic[] = [
  { id: "topic-photo", name: "Photography", emoji: "📷", description: "Light, composition, and the walks that teach them." },
  { id: "topic-money", name: "Money basics", emoji: "🪙", description: "Plain rules for saving, spending, and not worrying." },
  { id: "topic-cooking", name: "Cooking", emoji: "🍳", description: "Techniques that make any recipe easier." },
  // People (agents-design D71): Kin reads about them; Mãe's birthday matches Family's countdown.
  { id: "person-sofia", name: "Sofia", emoji: "📚", description: "", person: { relation: "Sister", domain: "Family", hue: domainHues.Clay,
    dates: [{ id: "sofia-birthday", label: "Birthday", date: `1992-${dayFrom(12).slice(5)}` }] } },
  { id: "person-mae", name: "Mãe", emoji: "📚", description: "", person: { relation: "Mother", domain: "Family", hue: domainHues.Marigold,
    dates: [{ id: "mae-birthday", label: "Birthday", date: `1958-${dayFrom(58).slice(5)}` }] } },
  { id: "person-rui", name: "Rui", emoji: "📚", description: "", person: { relation: "Brother-in-law", domain: "Family", hue: domainHues.Sage, dates: [] } },
];

/** Where an item lives: a project id, `area:Domain`, or `topic:id`. */
function homeOf(where: string) {
  const place = parseHome(where);
  if (place.kind === "domain") return { domain: place.name, projectId: "" };
  if (place.kind === "topic") return { domain: "", projectId: "", topicId: place.id };
  return { domain: worldProjects.find((project) => project.id === place.id)!.area, projectId: place.id };
}

/**
 * Notes keep their bullets mostly matched by tasks; the few left over are what the daily check-in finds on first
 * load (Hearth and Atlas add theirs, Kin and Ledger ask first).
 */
function worldNotes(): Note[] {
  const note = (id: string, where: string, title: string, body: string, minutesAgo: number, extra: Partial<Note> = {}): Note =>
    ({ id, ...homeOf(where), title, body, updatedAt: ago(minutesAgo), ...extra });
  const file = (name: string, type: string, text: string) => new File([text], name, { type });
  return [
    note("room-plan", "home-office", "Room plan", "Desk faces the window, shelves stay shallow, the reading chair stays out of the work zone.\n\n- Measure the desk wall\n- Compare two warm desk lamps\n- Route the cables behind the shelf\n- Find a rug that softens the echo", 20),
    note("sample-note", "home-office", "Lighting after sunset", "The ceiling light is too blue after 19:00. One warm lamp at desk height and the room reads as evening, not office.", 3 * H),
    note("demo-flat-fixes", "area:Everyday", "Small fixes around the flat", "Saturday-morning jobs, none longer than twenty minutes.\n\n- Tighten the wobbly kitchen chair\n- Replace the hallway bulb\n- Oil the balcony door", 5 * H),
    note("demo-routes", "demo-photo-walks", "Route ideas", "Alfama at dusk, Ajuda on quiet Sundays, the river from Cais do Sodré to Belém when the light is flat.\n\n- Pick one route for Sunday\n- Charge both batteries the night before", 2 * D),
    note("demo-route-sketch", "demo-photo-walks", "Alfama route sketch", "Start at the Sé, climb to the miradouro, come down through the stairs before the light goes.", 2 * D + 2 * H,
      { kind: "image", file: file("alfama-route.svg", "image/svg+xml", svg(`<path d="M70 360 C 170 300 200 160 320 150 S 470 260 570 70" fill="none" stroke="#2f7a62" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22"/><circle cx="70" cy="360" r="18" fill="#c2705a"/><circle cx="570" cy="70" r="18" fill="#d29a2b"/><circle cx="320" cy="150" r="12" fill="#2f7a62"/>`)) }),
    note("demo-dinners", "demo-cooking", "Five dinners that always work", "Monday shakshuka. Tuesday lentil soup, double batch. Wednesday sheet-pan chicken and potatoes. Thursday leftovers. Friday pasta with whatever is green.", 4 * D),
    note("demo-lease-notes", "demo-lease", "Lease comparison notes", "The quieter street wins on everything but price. Signed on the 8th.", 40 * D,
      { kind: "file", file: file("lease-comparison.txt", "text/plain", "Graça: 1,150/month, 2 bedrooms, loud tram\nCampo de Ourique: 1,240/month, 2 bedrooms, quiet street, balcony\n\nDecision: Campo de Ourique.") }),
    note("demo-strength-note", "demo-strength", "Training plan", "What makes it stick: short sessions, fixed slots.\n\n- Pick two training slots for next week\n- Book the Friday gym session\n- Write down three warm-up moves", 6 * H),
    note("demo-training-log", "demo-strength", "Training log, week 3", "Energy better on morning sessions. Squat felt easy at 60kg, stay there one more week. Skipped Thursday: work ran late, not motivation.", D + 2 * H),
    note("demo-10k-plan", "demo-10k", "Ten-week plan", "Three runs a week: one easy, one with intervals, one long and slow. Long run grows by a kilometre a week.",
      3 * D, { kind: "file", file: file("10k-plan.csv", "text/csv", "week,easy,intervals,long\n1,3km,4x400m,5km\n2,3km,5x400m,6km\n3,4km,6x400m,7km\n4,4km,3x800m,7km") }),
    note("demo-sleep-link", "demo-sleep", "Sleep hygiene basics", "Same wake time every day matters more than the bedtime.", 5 * D,
      { kind: "link", url: "https://www.sleepfoundation.org/sleep-hygiene" }),
    note("demo-symptoms", "area:Health", "Things to mention at the check-up", "Left knee after long runs. Afternoon headaches on screen-heavy days. Ask whether vitamin D is still needed.", 8 * D),
    note("demo-checkup-list", "demo-checkup", "Check-up list", "Called the clinic on Tuesday.\n\n- [x] Book blood work\n- Dentist cleaning", 20 * H),
    note("demo-family-visit-note", "demo-family-visit", "Visit plan", "Keep it relaxed, one big plan per day at most.\n\n- Confirm possible dates with everyone\n- Shortlist two places to stay\n- Plan one long lunch together", 9 * H),
    note("demo-photo-book-note", "demo-photo-book", "Photo book outline", "One spread per summer, oldest first. Captions in Mãe's words where we have them.\n\n- Scan the 2004 to 2010 albums\n- Ask Rui for the Algarve photos\n- Pick a print service", 3 * D),
    note("demo-cover", "demo-photo-book", "Cover idea", "The beach towel photo from 2007, cropped square.", 3 * D + H,
      { kind: "image", file: file("photo-book-cover.svg", "image/svg+xml", svg(`<rect x="0" y="250" width="640" height="170" fill="#d29a2b"/><circle cx="500" cy="110" r="60" fill="#c2705a"/><rect x="120" y="270" width="200" height="60" rx="10" fill="#2f8b9a"/><rect x="340" y="290" width="160" height="50" rx="10" fill="#a0588e"/>`)) }),
    note("demo-gathering", "area:Family", "Start with purpose", "Priya Parker", 20 * D,
      { kind: "quote", body: "The purpose of your gathering is more than an inclination, a theme, or a type of event.", source: "Priya Parker, The Art of Gathering", linkedProjectIds: ["demo-birthday", "demo-relaunch"] }),
    note("demo-gifts", "area:Family", "Gift ideas", "Sofia: the ceramics class she mentioned twice. Mãe: the photo book. Rui: a good corkscrew, he keeps borrowing mine.", 6 * D),
    note("demo-birthday-note", "demo-birthday", "Dinner notes", "Corner table at Taberna, six people, three friends each brought one memory in a card. Keep the format for next year.", 30 * D),
    note("demo-savings-note", "demo-savings", "Savings rhythm", "Automate the boring part, review the interesting part.\n\n- Move 10% on payday\n- Open a separate buffer account\n- Review the plan with Inês in December", 2 * D),
    note("demo-receipts", "demo-taxes", "Receipts 2025", "Exported from the bank, still missing the July pharmacy receipts.", D,
      { kind: "file", file: file("receipts-2025.csv", "text/csv", "date,vendor,category,amount\n2025-01-14,Farmácia Central,health,23.40\n2025-03-02,Worten,equipment,189.00\n2025-05-21,Coursera,education,49.00") }),
    note("demo-subs", "demo-subscriptions", "What I pay for", "Music 10.99, cloud storage 2.99, meditation app 6.99, video service 13.99, news 8.00. Video unused since August.", 5 * D),
    note("demo-money-check", "area:Finance", "Monthly money check", "Ten minutes on the first Sunday: balances, one surprise, one thing to change.", 12 * D),
    note("demo-emergency", "topic:topic-money", "Emergency fund basics", "Three to six months of essentials, kept boring and reachable.", 9 * D,
      { kind: "link", url: "https://www.investopedia.com/terms/e/emergency_fund.asp", linkedProjectIds: ["demo-savings"] }),
    note("demo-franklin", "topic:topic-money", "Little expenses", "", 15 * D,
      { kind: "quote", body: "Beware of little expenses; a small leak will sink a great ship.", source: "Benjamin Franklin, Poor Richard's Almanack", linkedProjectIds: ["demo-subscriptions"] }),
    note("demo-portfolio-note", "demo-portfolio", "Portfolio outline", "Lead with the work, not the résumé.\n\n- Rewrite the opening project summary\n- Pick three case studies\n- Ask two people for a read", 2 * D + 4 * H),
    note("demo-positioning", "demo-portfolio", "Positioning angles", "Three candidate stories. The quiet-craft one leads: small teams, careful interfaces, things that last.", 12 * D),
    note("demo-relaunch-intro", "demo-relaunch", "Relaunch introduction", "The studio is back, smaller and more deliberate. Here is the work we're proudest of, and an invitation to start something together.", 3 * H),
    note("demo-launch-sequence", "demo-relaunch", "Launch sequence draft", "Three quiet emails, then the page goes live. The first gives context, the second tells one useful project story, the third makes the offer.", D + 5 * H),
    note("demo-voice", "demo-relaunch", "Tone of voice dimensions", "Somewhere between casual and formal, never funny on purpose.", 6 * D,
      { kind: "link", url: "https://www.nngroup.com/articles/tone-of-voice-dimensions/" }),
    note("demo-offer", "demo-paid-offer", "Offer sketch", "Fixed scope, one week, one clear deliverable: an interface audit with a prioritised fix list.", 4 * D),
    note("demo-weekly-review", "area:Career", "Weekly review", "Keep: morning work blocks and one deliberate social plan each week. Close: apartment paperwork and the relaunch sequence.", D + 8 * H),
    note("demo-learning-link", "topic:topic-pkm", "Learning How to Learn", "Focused and diffuse thinking, spaced repetition, and beating procrastination. Base for the monthly loop.", 20 * D,
      { kind: "link", url: "https://www.coursera.org/learn/learning-how-to-learn", linkedProjectIds: ["demo-learning"] }),
    note("demo-deep-work", "topic:topic-pkm", "What matters", "", 25 * D,
      { kind: "quote", body: "Clarity about what matters provides clarity about what does not.", source: "Cal Newport, Deep Work", linkedProjectIds: ["demo-learning", "demo-portfolio"] }),
    note("demo-loop", "demo-learning", "Learning loop sketch", "Explore for two weeks, take notes as I go, ship one small artifact in the last week. October: colour theory.", 2 * D),
    note("demo-sfah", "topic:topic-cooking", "Salt, Fat, Acid, Heat", "Four elements, and most bland food is missing one of them. Usually acid.", 18 * D,
      { kind: "link", url: "https://www.saltfatacidheat.com/", linkedProjectIds: ["demo-cooking"] }),
    note("demo-golden-hour", "topic:topic-photo", "Golden hour", "Shoot the hour after sunrise and before sunset; Lisbon's pale stone turns warm.", 10 * D,
      { kind: "link", url: "https://en.wikipedia.org/wiki/Golden_hour_(photography)", linkedProjectIds: ["demo-photo-walks"] }),
  ];
}

function worldTasks(): Task[] {
  const task = (id: string, where: string, title: string, due: number | null, extra: Partial<Task> = {}): Task =>
    ({ id, ...homeOf(where), title, done: false, due: due === null ? "" : dayFrom(due), ...extra });
  const done = { done: true };
  // Tasks an agent added earlier carry its portrait.
  const by = (agentId: string, rest: Partial<Task> = {}) => ({ createdBy: `demo-${agentId}`, agentId, ...rest });
  return [
    task("sample-task-0", "home-office", "Measure the desk wall", 1, by("hearth")),
    task("sample-task-1", "home-office", "Compare two warm desk lamps", 3),
    task("sample-task-2", "home-office", "Route the cables behind the shelf", null, done),
    task("demo-t-route", "demo-photo-walks", "Pick one route for Sunday", 0, by("muse")),
    task("demo-t-batteries", "demo-photo-walks", "Charge both batteries the night before", 4),
    task("demo-t-shop", "demo-cooking", "Big shop for the five dinners", 0, { at: "18:00", length: 60 }),
    task("demo-t-freeze", "demo-cooking", "Freeze half the lentil soup", 1),
    task("demo-t-laundry", "area:Everyday", "Laundry and sheets", -1),
    task("demo-t-lease", "demo-lease", "Ask the final questions", null, done),
    task("demo-t-slots", "demo-strength", "Pick two training slots for next week", null, done),
    task("demo-t-gym", "demo-strength", "Book the Friday gym session", 2, by("vital")),
    task("demo-t-run1", "demo-10k", "Easy 3km run", 0, { at: "07:30", length: 45 }),
    task("demo-t-shoes", "demo-10k", "Get fitted for running shoes", 6, by("vital")),
    task("demo-t-race", "demo-10k", "Sign up for the April race", 14),
    task("demo-t-screens", "demo-sleep", "Phone charges in the kitchen", null, done),
    task("demo-t-alarm", "demo-sleep", "Same wake time on Saturday", 4),
    task("demo-t-blood", "demo-checkup", "Book blood work", -2),
    task("demo-t-dentist", "demo-checkup", "Dentist cleaning", 9),
    task("demo-t-vitd", "area:Health", "Refill vitamin D", 0, { at: "morning" }),
    task("demo-t-dates", "demo-family-visit", "Confirm possible dates with everyone", 3, by("kin")),
    task("demo-t-stay", "demo-family-visit", "Shortlist two places to stay", 10),
    task("demo-t-scan", "demo-photo-book", "Scan the 2004 to 2010 albums", 5),
    task("demo-t-rui", "demo-photo-book", "Ask Rui for the Algarve photos", null, done),
    task("demo-t-sofia", "area:Family", "Call Sofia about Sunday dinner", 0, { at: "20:30" }),
    task("demo-t-table", "demo-birthday", "Book the corner table", null, done),
    task("demo-t-memories", "demo-birthday", "Collect one memory from each friend", null, { done: true, ...by("kin") }),
    task("demo-t-payday", "demo-savings", "Move 10% on payday", 8, by("ledger")),
    task("demo-t-buffer", "demo-savings", "Open a separate buffer account", null),
    task("demo-t-ines", "demo-taxes", "Reply to Inês about July receipts", -1),
    task("demo-t-pharmacy", "demo-taxes", "Find the July pharmacy receipts", 2, by("hearth")),
    task("demo-t-video", "demo-subscriptions", "Cancel the video service", 2, by("ledger")),
    task("demo-t-annual", "demo-subscriptions", "Switch cloud storage to yearly", null, done),
    task("demo-t-summary", "demo-portfolio", "Rewrite the opening project summary", -2, by("compass")),
    task("demo-t-cases", "demo-portfolio", "Pick three case studies", null, done),
    task("demo-t-read", "demo-portfolio", "Ask two people for a read", 5),
    task("demo-t-copy", "demo-relaunch", "Send the introduction to Quill", 0, { at: "afternoon" }),
    task("demo-t-a11y", "demo-relaunch", "Audit the launch page for accessibility", 2, by("forge")),
    task("demo-t-week", "demo-relaunch", "Choose launch week with Maya", 4),
    task("demo-t-onepager", "demo-relaunch", "Write the positioning one-pager", null, { done: true, ...by("spark") }),
    task("demo-t-offer", "demo-paid-offer", "Send the offer to three people", 3, by("spark")),
    task("demo-t-topic", "demo-learning", "Pick this month's topic", null, done),
    task("demo-t-artifact", "demo-learning", "Ship the colour theory cheat sheet", 12, by("scout")),
  ];
}

/** Conversations of every kind, spread over weeks so Chats shows each day group; a few end unread. */
function worldThreads(): Thread[] {
  let n = 0;
  const you = (text: string, minutesAgo: number, from: string): ChatMessage => ({ id: `demo-m${n++}`, role: "user", text, from, at: ago(minutesAgo) });
  const agent = (agentId: string, text: string, minutesAgo: number): ChatMessage => ({ id: `demo-m${n++}`, role: "agent", agentId, text, at: ago(minutesAgo) });
  const thread = (id: string, messages: ChatMessage[], unread = 0, extra: Partial<Thread> = {}): Thread =>
    ({ id, messages, read: messages.length - unread, attachedNoteId: null, ...extra });
  return [
    thread("agent:atlas", [
      you("I have too many things open. What should this week be about?", 3 * D + 2 * H, "Everyday"),
      agent("atlas", "Three things carry weight: the relaunch copy, the tax receipts, and your Friday training slot. The rest can wait without getting worse.", 3 * D + 2 * H - 1),
      you("Ok. What's overdue?", 3 * D + 2 * H - 3, "Everyday"),
      agent("atlas", "Two things: the portfolio's opening summary and your reply to Inês about July receipts. Both take under an hour.", 3 * D + 2 * H - 4),
      // The morning check-in's day plan (agents-design D75): each change a next step on Today, with Atlas's reason.
      { ...agent("atlas", "Nothing new in your notes this morning. Here is a shape for today; each one waits for your yes on Today.", 6 * H),
        routine: { id: "", kind: "check-in", due: ago(6 * H + 1) },
        proposal: { id: "demo-p-day-plan", projectId: "", noteId: "", sourceTitle: "", sourceBody: "", status: "pending", items: [],
          origin: { agentId: "atlas", command: "plan_day", needs: ["see-tasks", "add-tasks", "read-notes"] },
          changes: [
            { kind: "reschedule", taskId: "demo-t-blood", title: "Book blood work", from: dayFrom(-2), to: dayFrom(0), at: "17:30",
              why: "Two days late and the last open step of the check-up; the clinic books online, ten minutes before the shop." },
            { kind: "reschedule", taskId: "demo-t-ines", title: "Reply to Inês about July receipts", from: dayFrom(-1), to: dayFrom(0), at: "19:30",
              why: "The receipts are already in Tax return 2025; a short reply after dinner closes it." },
            { kind: "reschedule", taskId: "demo-t-route", title: "Pick one route for Sunday", from: dayFrom(0), to: dayFrom(0), at: "21:00",
              why: "Choosing tonight leaves tomorrow free to charge the batteries before Sunday's walk." }] } },
      agent("atlas", "Morning. The lamp shortlist is still waiting on a pick. Want it on Saturday, next to the wall measurement?", 40),
      you("Can the Home office corner page put what's left to do first, with the lamp shortlist beside it?", 25, "Home office corner"),
      // Atlas can always arrange pages (D4, D32): a page proposal waits to be applied and undone.
      { ...agent("atlas", "I suggest a board of what's left across most of the page, your kept things as a short list beside it, and a countdown to the desk delivery. Nothing changes until you approve.", 24),
        proposal: { id: "demo-p-office-page", projectId: "home-office", noteId: "", sourceTitle: "", sourceBody: "", status: "pending", items: [],
          origin: { agentId: "atlas", command: "arrange_page", needs: ["arrange-pages"] },
          changes: [{ kind: "page", place: "home-office", title: "Everyday / Home office corner", from: null, to: [
            { id: "tasks", type: "tasks", view: "when", width: "wide" }, { id: "resources", type: "resources", view: "recent", width: "narrow" },
            { id: "office-desk", type: "countdown", title: "Desk delivery", date: dayFrom(12), since: dayFrom(-5), width: "narrow" }] }] } },
    ], 3),
    thread("agent:vital", [
      you("Energy was low after Tuesday's session. Should I change anything?", D + 3 * H, "Strength foundation"),
      agent("vital", "Keep the slot, drop the volume: two sets instead of three this week, and eat something an hour before.", D + 3 * H - 1),
      you("That works. Is Friday still on?", D + 3 * H - 5, "Strength foundation"),
      agent("vital", "Friday 17:00 is on your list. I'd keep it even if the week gets loud.", D + 3 * H - 6),
      // A weekly improvement (agents-design D68, D69) waiting for a pick: its answers show under it and on Today.
      { ...agent("vital", "1. **Move Friday's session to 07:30.** Two of the last three Friday evenings slipped; the mornings you kept every time.\n"
        + "2. **Book the blood work today.** It's the only late step of the check-up, and the clinic needs a week's notice.\n"
        + "3. **Read the check-up list on Mondays only.** You opened it once in three weeks, so a weekly look is enough.\n\nWhich would you like me to do?", 3 * H),
        routine: { id: "", kind: "improve", due: ago(3 * H + 1) }, display: { choices: ["Do 1", "Do 2", "Do 3", "Not now"] } },
    ], 1),
    thread("agent:ledger", [
      you("Which subscriptions did I actually use last month?", 5 * D, "Subscription cleanup"),
      agent("ledger", "Music and cloud storage every week, the meditation app twice, the video service not since August. Cancelling that one saves 13.99 a month.", 5 * D - 1),
      you("Cancel the video one, keep the rest.", 5 * D - 4, "Subscription cleanup"),
      agent("ledger", "I can't cancel it for you, but it's on your list for this week.", 5 * D - 5),
    ]),
    thread("room:demo-relaunch", [
      you("Where are we on the launch page?", 2 * H, "Studio relaunch"),
      agent("spark", "Structure is agreed: the story, three projects, one invitation. Waiting on copy.", 2 * H - 1),
      agent("quill", "The introduction is in the project notes. It stopped apologizing around draft four.", 2 * H - 2),
      you("@Forge can the page be live by Friday?", 90, "Studio relaunch"),
      agent("forge", "Yes, if the copy lands by Wednesday. The accessibility pass takes a morning.", 89),
      agent("compass", "Worth the morning. Launching calm matters more than launching this week.", 88),
    ], 2),
    thread("team:career-studio", [
      you("Which story should open the portfolio?", 12 * D, "Portfolio refresh"),
      agent("compass", "The quiet-craft one. It's the work you want more of.", 12 * D - 1),
      agent("quill", "Agreed. Open on the problem, not the job title.", 12 * D - 2),
      agent("scout", "Two of your case studies already share that thread. I can pull quotes from both clients.", 12 * D - 3),
    ]),
    thread("chat:demo-weekend", [
      you("Help me plan a weekend that's half chores, half nothing.", 2 * D, "Everyday"),
      agent("hearth", "Saturday morning: laundry, the desk wall, the hallway bulb. Done by noon.", 2 * D - 1),
      agent("muse", "Then Sunday is yours. The Alfama route is best before ten.", 2 * D - 2),
      agent("kin", "Sofia is free Sunday evening if you want company for dinner.", 2 * D - 3),
    ], 0, { title: "Weekend reset", memberIds: ["hearth", "muse", "kin"] }),
    thread("agent:kin", [
      you("A small dinner for Sofia's birthday, nothing produced. Ideas?", 34 * D, "Birthday dinner for Sofia"),
      agent("kin", "The corner table at Taberna, and ask three friends for one memory each, written in a card.", 34 * D - 1),
      you("Perfect. Booking it.", 34 * D - 3, "Birthday dinner for Sofia"),
    ]),
    thread("agent:scout", [
      you("I want to learn things and actually keep them.", 45 * D, "Learning system"),
      agent("scout", "One topic a month, notes as you go, and one small artifact at the end. The artifact is what makes it stick.", 45 * D - 1),
    ]),
  ];
}

/** Records from before the demo had real content: replaced, not kept. */
const lorem = /^(Lorem ipsum|Dolor sit amet|Consectetur adipiscing|Sed do eiusmod)/;
/** Adds demo records that are missing by id, and swaps in demo versions of placeholder ones. */
function merge<T extends { id: string }>(mine: T[], demo: T[]) {
  const byId = new Map(demo.map((item) => [item.id, item]));
  const placeholder = (item: T) => "title" in item && typeof item.title === "string" && lorem.test(item.title);
  const kept = mine.map((item) => (placeholder(item) && byId.get(item.id)) || item);
  return [...kept, ...demo.filter((item) => !mine.some((other) => other.id === item.id))];
}
/** Adds the demo world's missing records, and replaces placeholder ones. Items land only where their home exists. */
function withDemoWorld(data: WorkspaceData): WorkspaceData {
  const domains = new Set(data.domains.map((domain) => domain.name));
  const projects = merge(data.projects, worldProjects.filter((project) => domains.has(project.area)));
  const topics = merge(data.topics, [...demoTopics, ...worldTopics]);
  const fits = (item: { domain: string; projectId: string; topicId?: string }) => item.topicId
    ? topics.some((topic) => topic.id === item.topicId)
    : item.projectId ? projects.some((project) => project.id === item.projectId) : domains.has(item.domain);
  const teams = merge(data.teams, demoTeams);
  return {
    ...data, projects, topics, teams,
    notes: merge(data.notes, worldNotes().filter(fits)
      .map((note) => ({ ...note, linkedProjectIds: note.linkedProjectIds?.filter((id) => projects.some((project) => project.id === id)) }))),
    tasks: merge(data.tasks, worldTasks().filter(fits)),
    threads: merge(data.threads, worldThreads().filter((thread) =>
      !thread.id.startsWith("room:") || projects.some((project) => `room:${project.id}` === thread.id))),
  };
}
/** The world's own topics: once any is present, the world has landed, even if you later clear its projects. */
const landed = (data: WorkspaceData) => data.topics.some((topic) => worldTopics.some((item) => item.id === topic.id));

const moodboard = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 420"><rect width="640" height="420" fill="#efe6d6"/>
<rect x="40" y="40" width="250" height="340" rx="18" fill="#c2705a"/><circle cx="455" cy="140" r="92" fill="#d29a2b"/>
<rect x="330" y="260" width="270" height="120" rx="18" fill="#6c9a68"/><rect x="80" y="300" width="170" height="16" rx="8" fill="#efe6d6" opacity=".7"/>
<circle cx="165" cy="150" r="54" fill="#efe6d6" opacity=".35"/></svg>`;
const lamps = "Warm desk lamps, shortlist\n\nLamp A: 2700K, dimmable, clamp mount, 79\nLamp B: 3000K, touch dimmer, weighted base, 64\n\nLeaning A: the clamp frees the desk.";
const demoTopics: Topic[] = [
  { id: "topic-pkm", name: "Personal knowledge", emoji: "📚", description: "How to keep, find, and use what I learn." },
  { id: "topic-workspace", name: "Workspace design", emoji: "🎨", description: "Light, desks, and rooms that make focus easy." },
  { id: "topic-training", name: "Training science", emoji: "🏃", description: "What actually builds strength and keeps it." },
];

/**
 * One example of every resource kind: some homed in topics and linked into projects, some homed in a project.
 * Project-homed ones land only if their project exists.
 */
function withDemoResources(data: WorkspaceData): WorkspaceData {
  const has = new Set(data.projects.map((project) => project.id));
  const linked = (...ids: string[]) => ids.filter((id) => has.has(id));
  const topic = (topicId: string) => ({ domain: "", projectId: "", topicId });
  const resources: Note[] = [
    { id: "demo-para-link", ...topic("topic-pkm"), kind: "link", url: "https://fortelabs.com/blog/para/", title: "The PARA Method",
      body: "Organize by actionability: Projects, Areas, Resources, Archives. Move material as it stops being active.",
      linkedProjectIds: linked("home-office", "demo-portfolio"), updatedAt: ago(30) },
    { id: "demo-para-video", ...topic("topic-pkm"), kind: "video", url: "https://www.youtube.com/watch?v=EHw4nyxxknA",
      title: "Tiago Forte explains The PARA Method", body: "Watch for the bit on moving project material into Resources when it ends.",
      linkedProjectIds: linked("home-office"), updatedAt: ago(90) },
    { id: "demo-quote", ...topic("topic-pkm"), kind: "quote", title: "Organize for action", source: "Tiago Forte, The PARA Method",
      body: "Organize information based on how actionable it is, not on what kind of information it is.",
      linkedProjectIds: linked("demo-portfolio"), updatedAt: ago(240) },
    { id: "demo-strength-link", ...topic("topic-training"), kind: "link", title: "Strength exercises",
      url: "https://www.nhs.uk/live-well/exercise/strength-and-flexibility-exercises/strength-exercises/",
      body: "Two sessions a week is the floor. Bodyweight first.", linkedProjectIds: linked("demo-strength"), updatedAt: ago(600) },
    ...has.has("home-office") ? [
      { id: "demo-moodboard", domain: data.projects.find((project) => project.id === "home-office")!.area, projectId: "home-office",
        kind: "image" as const, title: "Desk moodboard", file: new File([moodboard], "desk-moodboard.svg", { type: "image/svg+xml" }),
        body: "Clay, marigold, sage. Warm light, nothing cold.", linkedProjectIds: [], updatedAt: ago(15) },
      { id: "demo-lamps", domain: data.projects.find((project) => project.id === "home-office")!.area, projectId: "home-office",
        kind: "file" as const, title: "Desk lamp shortlist", file: new File([lamps], "desk-lamps.txt", { type: "text/plain" }),
        body: "", linkedProjectIds: [], updatedAt: ago(45) },
    ] : [],
  ];
  return { ...data, topics: merge(data.topics, demoTopics), notes: [...data.notes, ...resources] };
}

/** The first starter roster, replaced once by the Homebase cast. */
const firstRoster = new Set(["juniper", "kaya", "remy", "mei", "idris"]);
function withoutFirstRoster(data: WorkspaceData) {
  const threads = data.threads.filter((thread) =>
    firstRoster.has(thread.id.slice(6)) || thread.messages.some((message) => firstRoster.has(message.agentId ?? "")));
  const stale = new Set(threads.map((thread) => thread.id));
  return {
    data: {
      ...data,
      agents: data.agents.filter((item) => !firstRoster.has(item.id)),
      domains: data.domains.map((domain) => (firstRoster.has(domain.agentId ?? "") ? { ...domain, agentId: undefined } : domain)),
      projects: data.projects.map(({ crew: _crew, ...project }: Project & { crew?: string[] }) => project),
      threads: data.threads.filter((thread) => !stale.has(thread.id)),
    },
    deletedAgentIds: data.agents.filter((item) => firstRoster.has(item.id)).map((item) => item.id),
    deletedThreadIds: [...stale],
  };
}

/**
 * Fills a never-saved store with the demo workspace once. A store from before agents, or one still holding the
 * first starter roster, gets the Homebase cast and its teams once. A store from before topics gets the example
 * topics and resources once. A store from before the demo world gets its projects, notes, tasks, and chats once,
 * and its placeholder records replaced.
 */
export function withDemoSeed(store: WorkspaceStore): WorkspaceStore {
  return {
    save: (changes, before) => store.save(changes, before),
    replace: (data) => store.replace(data),
    claimRoutine: (id, due) => store.claimRoutine(id, due),
    async load() {
      const data = await store.load();
      if (!data) {
        const seeded = seedWorkspace();
        await store.save(seeded);
        return seeded;
      }
      let next = data;
      const changes: Parameters<WorkspaceStore["save"]>[0] = {};
      const firstOnly = data.agents.some((item) => firstRoster.has(item.id));
      if (!data.agents.some((item) => item.id === "hearth") && (!data.agents.length || firstOnly)) {
        const cleared = withoutFirstRoster(data);
        next = withDemoAgents(cleared.data);
        Object.assign(changes, next, { deletedAgentIds: cleared.deletedAgentIds, deletedThreadIds: cleared.deletedThreadIds });
      }
      if (!next.topics.length && next.notes.every((note) => !note.kind || note.kind === "note")) {
        next = withDemoResources(next);
        Object.assign(changes, { topics: next.topics, notes: next.notes.filter((note) => note.kind) });
      }
      if (!landed(next)) {
        const before = next;
        next = withDemoWorld(next);
        const fresh = <T>(after: T[], was: T[]) => after.filter((item) => !was.includes(item));
        for (const key of ["projects", "notes", "tasks", "topics", "teams", "threads"] as const)
          Object.assign(changes, { [key]: [...(changes[key] ?? []), ...fresh<unknown>(next[key], before[key])] });
      }
      if (Object.keys(changes).length) await store.save(changes);
      return next;
    },
  };
}
