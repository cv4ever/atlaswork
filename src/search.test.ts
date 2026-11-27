import test from "node:test";
import assert from "node:assert/strict";
import type { Note, Project, Topic } from "./model.ts";
import { limits, search } from "./search.ts";
import type { Hit } from "./search.ts";

const project: Project = { id: "tax", title: "Taxes 2026", area: "Finance", description: "", color: "" };
const note = (id: string, words: Partial<Note> = {}): Note => ({ id, title: id, body: "", domain: "Finance", projectId: "", linkedProjectIds: [], updatedAt: "", ...words });
const topic: Topic = { id: "t1", name: "Tax law", emoji: "📚", description: "" };
const pages = { today: "Today", tasks: "Tasks" };
const open = { tabs: ["area:Finance", "project:tax", "note:receipt"], label: (key: string) => ({ "project:tax": "Taxes 2026", "note:receipt": "Receipt" })[key] ?? "Overview", pages };
const names = (hits: Hit[]) => hits.map((hit) => hit.kind === "project" ? `project:${hit.project.id}` : hit.kind === "resource" ? `resource:${hit.note.id}`
  : hit.kind === "topic" ? `topic:${hit.topic.id}` : `${hit.kind}:${hit.key}`);

test("search finds projects, then resources by title, words or link, then topics and pages; tabs and context look narrower", () => {
  const found = { projects: [project], notes: [note("receipt", { body: "tax refund" }), note("bookmark", { url: "https://tax.example" }),
    note("photo", { kind: "image", title: "Tax form" }), note("garden")], topics: [topic] };
  assert.deepEqual(names(search("search", " TAX ", found, open)), ["project:tax", "resource:receipt", "resource:bookmark", "resource:photo", "topic:t1"]);
  assert.deepEqual(names(search("search", "", found, open)).slice(-2), ["page:today", "page:tasks"], "an empty query lists everything");
  assert.deepEqual(names(search("context", "tax", found, open)), ["resource:receipt", "resource:bookmark"], "only notes can join a chat");
  assert.deepEqual(names(search("tabs", "tax", found, open)), ["tab:project:tax"], "tabs match their names");
});

test("search lists at most 40 resources and 50 hits", () => {
  const notes = Array.from({ length: 60 }, (_, i) => note(`n${i}`));
  const projects = Array.from({ length: 60 }, (_, i) => ({ ...project, id: `p${i}` }));
  assert.equal(search("search", "", { projects: [], notes, topics: [] }, open).length, limits.resources + Object.keys(pages).length);
  assert.equal(search("search", "", { projects, notes, topics: [topic] }, open).length, limits.hits);
});
