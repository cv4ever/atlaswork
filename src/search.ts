// The Search module: what Ctrl K finds for a query, and in what order. App supplies its actions, draws the hits
// and decides what picking one does.
import { kindOf } from "./model.ts";
import type { Note, Project, Topic } from "./model.ts";

/** `search` looks through everything, `tabs` through the open tabs, `context` for a note to attach to a chat. */
export type SearchMode = "search" | "tabs" | "context";
export type Hit =
  | { kind: "tab"; key: string }
  | { kind: "project"; project: Project }
  | { kind: "resource"; note: Note }
  | { kind: "topic"; topic: Topic }
  | { kind: "page"; key: string };

export const limits = { resources: 40, hits: 50 };

/**
 * `found` is what the person can see (archived records left out); `tabs` the open tab keys and `label` their names;
 * `pages` the page keys and their names. Resources match on title, words and link.
 */
export function search(mode: SearchMode, query: string, found: { projects: Project[]; notes: Note[]; topics: Topic[] },
  { tabs, label, pages }: { tabs: string[]; label: (key: string) => string; pages: Record<string, string> }): Hit[] {
  const q = query.trim().toLocaleLowerCase();
  const has = (text: string) => !q || text.toLocaleLowerCase().includes(q);
  if (mode === "tabs") return tabs.filter((key) => has(label(key))).map((key) => ({ kind: "tab", key }));
  const notes = found.notes.filter((note) => (mode !== "context" || kindOf(note) === "note") && has(`${note.title} ${note.body} ${note.url ?? ""}`))
    .slice(0, limits.resources).map((note): Hit => ({ kind: "resource", note }));
  if (mode === "context") return notes.slice(0, limits.hits);
  return [
    ...found.projects.filter((project) => has(project.title)).map((project): Hit => ({ kind: "project", project })),
    ...notes,
    ...found.topics.filter((topic) => has(topic.name)).map((topic): Hit => ({ kind: "topic", topic })),
    ...Object.entries(pages).filter(([, title]) => has(title)).map(([key]): Hit => ({ kind: "page", key })),
  ].slice(0, limits.hits);
}
