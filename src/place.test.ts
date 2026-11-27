import test from "node:test";
import assert from "node:assert/strict";
import { initialSession } from "./session.ts";
import type { Note } from "./model.ts";
import type { Session } from "./session.ts";
import { domainKey, here, homeKey, parseHome, parseTab, placeName, tabKey } from "./place.ts";
import type { Place, Tab } from "./place.ts";
import { normalize } from "./workspace.ts";

test("every Home and tab key reads back as what made it, and a Project's two keys stay apart", () => {
  const homes: [Place, string][] = [[{ kind: "domain", name: "Work: Q3" }, homeKey({ domain: "Work: Q3" })],
    [{ kind: "project", id: "tax" }, homeKey({ domain: "Finance", projectId: "tax" })],
    [{ kind: "topic", id: "t1" }, homeKey({ domain: "", topicId: "t1" })]];
  for (const [place, key] of homes) assert.deepEqual(parseHome(key), place, key);
  const tabs: Tab[] = [{ kind: "domain", name: "Work: Q3" }, { kind: "project", id: "tax" }, { kind: "resource", id: "n1" }, { kind: "page", key: "projects" }];
  for (const tab of tabs) assert.deepEqual(parseTab(tabKey(tab)), tab);
  assert.equal(domainKey("Health"), tabKey({ kind: "domain", name: "Health" }), "a Domain has one key everywhere");
  assert.notEqual(homeKey({ domain: "Finance", projectId: "tax" }), tabKey({ kind: "project", id: "tax" }));
});

test("here: chat keeps the selected Domain and takes a Resource's home Project; Capture takes its whole Home or the open Topic", () => {
  const data = normalize(null).data;
  data.domains.push({ ...data.domains[0], name: "Finance" });
  data.projects = [{ id: "tax", title: "Taxes", area: "Finance", description: "", color: "" }];
  data.topics = [{ id: "t1", name: "Recipes", emoji: "🍲", description: "" }, { id: "old", name: "Old", emoji: "", description: "", archived: true }];
  const note = (id: string, home: Partial<Note>): Note => ({ id, title: id, body: "", domain: "", projectId: "", linkedProjectIds: [], updatedAt: "", ...home });
  data.notes = [note("inTopic", { topicId: "t1" }), note("inFinance", { domain: "Finance" }), note("inTax", { domain: "Finance", projectId: "tax" })];
  const at = (patch: Partial<Session>) => {
    const { topic, ...where } = here(data, { ...initialSession, domain: "Health", view: null, ...patch });
    return topic ? { ...where, topic: topic.id } : where;
  };
  const health = domainKey("Health");
  assert.deepEqual(at({ active: health }), { domain: "Health", projectId: "", home: health });
  assert.deepEqual(at({ active: tabKey({ kind: "project", id: "tax" }) }), { domain: "Health", projectId: "tax", home: "tax" });
  assert.deepEqual(at({ active: tabKey({ kind: "resource", id: "inTopic" }) }), { domain: "Health", projectId: "", home: "topic:t1" });
  assert.deepEqual(at({ active: tabKey({ kind: "resource", id: "inFinance" }) }), { domain: "Health", projectId: "", home: domainKey("Finance") });
  assert.deepEqual(at({ active: tabKey({ kind: "resource", id: "inTax" }) }), { domain: "Health", projectId: "tax", home: "tax" });
  assert.deepEqual(at({ active: tabKey({ kind: "project", id: "tax" }), view: "today" }), { domain: "Health", projectId: "", home: health }, "a global page has no Project");
  assert.deepEqual(at({ active: tabKey({ kind: "project", id: "gone" }) }), { domain: "Health", projectId: "", home: health }, "a deleted Project falls back to the Domain");
  assert.deepEqual(at({ view: "library", libraryTopic: "t1" }), { domain: "Health", projectId: "", home: "topic:t1", topic: "t1" });
  assert.deepEqual(at({ view: "library", libraryTopic: "old" }), { domain: "Health", projectId: "", home: health }, "an archived Topic isn't open");
  assert.deepEqual(at({ active: health, libraryTopic: "t1" }), { domain: "Health", projectId: "", home: health }, "the Topic counts only in the Library");
  assert.deepEqual([domainKey("Finance"), "tax", "topic:t1", "gone", "topic:gone"].map((key) => placeName(data, key)),
    ["Finance", "Taxes", "🍲 Recipes", "a project", "a topic"]);
});
