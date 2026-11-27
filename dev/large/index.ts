// Dev and speed builds only (src/main.tsx loads it behind `import.meta.env.DEV` or `--mode speed`, so production bundles
// drop it; check:bundle verifies). `?fresh=large` starts from the demo seed plus a year of someone's records: about
// 2,000 resources, 500 tasks, 60 projects, 30 topics and a few hundred chat messages, the same on every run, so
// scripts/check-speed.mjs can time the screens at the size real workspaces reach (README, "Speed check").
import { seedWorkspace } from "../../src/demo.ts";
import type { ChatMessage, Note, Project, Task, Thread, Topic, WorkspaceData } from "../../src/model.ts";
import type { WorkspaceStore } from "../../src/workspace.ts";

/** A seeded generator, so every run builds the same workspace. */
function random(seed: number) {
  let state = seed;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (below: number) => Math.floor(next() * below);
  const pick = <T>(items: readonly T[]) => items[int(items.length)];
  return { next, int, pick, chance: (p: number) => next() < p };
}

const domains = {
  Everyday: { steward: "hearth", subjects: ["kitchen", "hallway", "garden", "bike", "pantry", "wardrobe", "balcony", "laundry", "neighbourhood", "bookshelf", "car", "storage"] },
  Health: { steward: "vital", subjects: ["sleep", "strength", "running", "stretching", "breakfast", "posture", "hydration", "check-ups", "swimming", "cycling", "breathing", "walking"] },
  Family: { steward: "kin", subjects: ["Sunday dinner", "photo albums", "birthdays", "school run", "holidays", "grandparents", "board games", "letters", "recipes", "family trip", "the cousins", "anniversaries"] },
  Finance: { steward: "ledger", subjects: ["budget", "savings", "taxes", "insurance", "pension", "subscriptions", "receipts", "invoices", "mortgage", "bank fees", "donations", "emergency fund"] },
  Career: { steward: "compass", subjects: ["portfolio", "newsletter", "client calls", "pricing", "workshop", "reading list", "conference talk", "mentoring", "side project", "case studies", "proposals", "studio site"] },
} as const;
const domainNames = Object.keys(domains) as (keyof typeof domains)[];
const teams = ["home-front", "wellbeing-crew", "career-studio", "launch-squad", "research-pod"];
const crew = ["hearth", "vital", "kin", "ledger", "compass", "spark", "muse", "scout", "quill", "forge"];
const colors = ["pine", "ochre", "sage", "clay"];
const verbs = ["Plan", "Sort out", "Finish", "Review", "Start", "Book", "Write up", "Compare", "Clean up", "Try", "Draft", "Ask about"];
const goals = ["A calm rhythm for", "Get on top of", "One good month of", "A fresh start on", "Make room for", "Finally settle"];
const openers = [
  "Notes from this week.", "What I keep coming back to.", "Worth remembering next time.", "A rough first pass.",
  "Collected from a few conversations.", "Things that worked and things that didn't.", "Ideas, not decisions yet.",
];
const sentences = [
  "Small steps beat a perfect plan that never starts.", "The second attempt went faster because the first one was written down.",
  "Check the numbers again before deciding anything.", "Mornings work better than evenings for this.",
  "It took less time than I feared once I started.", "Ask someone who has done it before.", "Keep the list short enough to finish.",
  "The cheaper option was good enough.", "Waiting a week made the choice obvious.", "Write the first draft badly, then fix it.",
  "Put it in the calendar or it will not happen.", "Most of the effort was deciding, not doing.",
];
const quotes = [
  ["Well begun is half done.", "Aristotle"], ["What gets measured gets managed.", "Peter Drucker"],
  ["Simplicity is the ultimate sophistication.", "Leonardo da Vinci"], ["Little by little, one travels far.", "J. R. R. Tolkien"],
  ["The best time to plant a tree was twenty years ago.", "Proverb"], ["Done is better than perfect.", "Sheryl Sandberg"],
];
const topicSubjects = ["Woodworking", "Italian", "Bread baking", "Chess", "Birdwatching", "Watercolour", "Typography", "Stoicism",
  "Coffee", "Gardening", "Astronomy", "Jazz", "Running form", "Negotiation", "Public speaking", "Sketching", "Fermentation",
  "Home repair", "Climbing", "Poetry", "History of Lisbon", "Cycling routes", "Tea", "Mushrooms", "Calligraphy", "Film photography",
  "Sourdough", "Knots", "Japanese", "Interior design"];
const topicEmoji = ["🪵", "🇮🇹", "🍞", "♟️", "🐦", "🎨", "🔤", "🏛️", "☕", "🌱", "🔭", "🎷", "👟", "🤝", "🎤", "✏️", "🫙", "🔧",
  "🧗", "📜", "🏰", "🚲", "🍵", "🍄", "🖋️", "🎞️", "🥖", "🪢", "🇯🇵", "🛋️"];
const asks = ["What should I do first here?", "Can you summarise where this stands?", "Anything overdue I'm missing?",
  "Is this still worth doing?", "Help me plan the next two weeks.", "What did we decide last time?", "Which of these matters most?"];
const answers = ["Start with the smallest open task: it unblocks the rest.", "Two things are overdue, both under an hour. I'd do them today.",
  "It still fits your intention for this domain, but the deadline can move a week without harm.",
  "Last time you chose the cheaper option and a check-in on Friday.", "Three tasks are open; the first one carries the most weight.",
  "Nothing urgent. The next step is a short note on what done looks like."];

const ago = (now: number, minutes: number) => new Date(now - minutes * 60_000).toISOString();
const dayFrom = (now: number, offset: number) => { const date = new Date(now); date.setDate(date.getDate() + offset); return date.toLocaleDateString("en-CA"); };

/** The demo world plus a year of generated records. Due dates and times count from `now`, like the demo's. */
export function largeWorkspace(now = Date.now()): WorkspaceData {
  const r = random(20261111);
  const base = seedWorkspace();
  const projects: Project[] = Array.from({ length: 60 }, (_, n) => {
    const area = domainNames[n % domainNames.length];
    const subject = domains[area].subjects[Math.floor(n / domainNames.length) % domains[area].subjects.length];
    return {
      id: `large-p${n}`, area, title: `${r.pick(goals)} ${subject}`, color: r.pick(colors),
      description: r.pick(sentences), archived: n % 10 === 9 || undefined,
      agentId: r.chance(0.5) ? r.pick(crew) : undefined, teamId: r.chance(0.3) ? r.pick(teams) : undefined,
    };
  });
  const topics: Topic[] = topicSubjects.map((name, n) => ({ id: `large-topic${n}`, name, emoji: topicEmoji[n], description: r.pick(sentences) }));
  const live = projects.filter((project) => !project.archived);
  /** A home: mostly a live project, then a domain, then a topic. */
  const home = () => {
    const roll = r.next();
    if (roll < 0.6) { const project = r.pick(live); return { domain: project.area, projectId: project.id }; }
    if (roll < 0.85) return { domain: r.pick(domainNames), projectId: "" };
    return { domain: "", projectId: "", topicId: r.pick(topics).id };
  };
  const paragraph = () => Array.from({ length: 2 + r.int(5) }, () => r.pick(sentences)).join(" ");
  const notes: Note[] = Array.from({ length: 2000 }, (_, n) => {
    const where = home();
    const subject = where.domain ? r.pick(domains[where.domain as keyof typeof domains].subjects) : "reading";
    const updatedAt = ago(now, 30 + r.int(365 * 24 * 60));
    const roll = r.next();
    const linked = where.projectId && r.chance(0.1) ? { linkedProjectIds: [r.pick(live).id].filter((id) => id !== where.projectId) } : {};
    const archived = r.chance(0.05) || undefined;
    if (roll < 0.15) return { id: `large-n${n}`, ...where, kind: "link", title: `Guide to ${subject}`, url: `https://example.com/${subject.replace(/\W+/g, "-")}/${n}`, body: r.pick(sentences), updatedAt, archived, ...linked };
    if (roll < 0.25) { const [text, source] = r.pick(quotes); return { id: `large-n${n}`, ...where, kind: "quote", title: text, source, body: r.pick(sentences), updatedAt, archived }; }
    const bullets = r.chance(0.3) ? `\n\n${Array.from({ length: 2 + r.int(4) }, () => `- ${r.pick(verbs)} the ${r.pick(domains[r.pick(domainNames)].subjects)}`).join("\n")}` : "";
    return { id: `large-n${n}`, ...where, title: `${r.pick(["Notes on", "Thinking about", "Ideas for", "Log:", "Plan for"])} ${subject} ${n}`,
      body: `${r.pick(openers)}\n\n${paragraph()}\n\n${paragraph()}${bullets}`, updatedAt, archived, ...linked };
  });
  const tasks: Task[] = Array.from({ length: 500 }, (_, n) => {
    const where = r.chance(0.7) ? (({ area, id }) => ({ domain: area, projectId: id }))(r.pick(live)) : { domain: r.pick(domainNames), projectId: "" };
    const agentId = r.chance(0.15) ? r.pick(crew) : undefined;
    return { id: `large-t${n}`, ...where, title: `${r.pick(verbs)} the ${r.pick(domains[where.domain as keyof typeof domains].subjects)}`,
      done: r.chance(0.4), due: r.chance(0.3) ? "" : dayFrom(now, r.int(90) - 30), ...(agentId ? { agentId, createdBy: `demo-${agentId}` } : {}),
      updatedAt: ago(now, r.int(60 * 24 * 60)) };
  });
  // Long histories: older sessions before every demo conversation, and rooms for a dozen generated projects.
  let m = 0;
  const history = (speakers: string[], from: string, count: number, startMinutesAgo: number): ChatMessage[] =>
    Array.from({ length: count }, (_, n) => {
      const at = ago(now, startMinutesAgo - n * (45 + r.int(600)));
      return n % 2 === 0 ? { id: `large-m${m++}`, role: "user", text: r.pick(asks), from, at }
        : { id: `large-m${m++}`, role: "agent", agentId: r.pick(speakers), text: `${r.pick(answers)} ${r.pick(sentences)}`, at };
    });
  const older = base.threads.map((thread): Thread => {
    const speakers = thread.memberIds ?? [...new Set(thread.messages.flatMap((message) => message.agentId ? [message.agentId] : []))];
    const past = history(speakers.length ? speakers : ["atlas"], "Everyday", 20, 120 * 24 * 60);
    return { ...thread, messages: [...past, ...thread.messages], read: thread.read + past.length };
  });
  const rooms = live.slice(0, 12).map((project): Thread => {
    const messages = history([project.agentId ?? domains[project.area as keyof typeof domains].steward], project.title, 16, 60 * 24 * 60);
    return { id: `room:${project.id}`, messages, read: messages.length - (r.chance(0.3) ? 1 : 0), attachedNoteId: null };
  });
  return { ...base, projects: [...base.projects, ...projects], notes: [...base.notes, ...notes], tasks: [...base.tasks, ...tasks],
    topics: [...base.topics, ...topics], threads: [...older, ...rooms] };
}

/** Fills a never-saved store with the large workspace once; a store with data loads as it is. */
export function withLargeSeed(store: WorkspaceStore): WorkspaceStore {
  return {
    save: (changes, before) => store.save(changes, before),
    replace: (data) => store.replace(data),
    claimRoutine: (id, due) => store.claimRoutine(id, due),
    async load() {
      const data = await store.load();
      if (data) return data;
      const seeded = largeWorkspace();
      await store.save(seeded);
      return seeded;
    },
  };
}
