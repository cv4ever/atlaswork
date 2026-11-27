import test from "node:test";
import assert from "node:assert/strict";
import type { Topic, WorkspaceData } from "./model.ts";
import { addPeople } from "./workspace/resources.ts";
import { aboutLine, mentions, mentionsOf, nextOf, plainNames, renamed, typedMention } from "./people.ts";

const person = (id: string, name: string, domain = "Family"): Topic =>
  ({ id, name, emoji: "", description: "", person: { relation: "", domain, hue: "", dates: [] } });
const data = (topics: Topic[], more: Partial<WorkspaceData> = {}) => ({ domains: [], projects: [], notes: [], tasks: [], agents: [], threads: [], ...more, topics }) as unknown as WorkspaceData;

test("a date comes round each year, 29 February on the 28th outside leap years, with the years it marks when known", () => {
  const birthday = { id: "b", label: "Birthday", date: "1992-12-03" };
  assert.deepEqual(nextOf(birthday, "2026-11-21"), { date: birthday, day: "2026-12-03", days: 12, years: 34 });
  assert.equal(nextOf(birthday, "2026-12-04")?.day, "2027-12-03", "after this year's, next year's");
  assert.equal(nextOf(birthday, "2026-12-03")?.days, 0, "today counts");
  assert.equal(nextOf({ id: "l", label: "Birthday", date: "2000-02-29" }, "2026-01-10")?.day, "2026-02-28");
  assert.equal(nextOf({ id: "l", label: "Birthday", date: "2000-02-29" }, "2028-01-10")?.day, "2028-02-29");
  assert.equal(nextOf({ id: "y", label: "Anniversary", date: "--06-14" }, "2026-11-21")?.years, undefined, "no year, no age");
  assert.equal(nextOf({ id: "x", label: "?", date: "soon" }, "2026-11-21"), undefined);
  assert.equal(aboutLine({ relation: "Sister", domain: "Family", hue: "", dates: [birthday] }, "2026-11-21"),
    "Sister; in Family; Birthday, turns 34 on 2026-12-03 (in 12 days)");
});

test("a plain name counts only when nothing else in the workspace shares it; @Name always does", () => {
  const sofia = person("s", "Sofia"), kin = person("k", "Kin"), al = person("a", "Al"), ana = person("n", "Ana Costa");
  const plain = plainNames(data([sofia, kin, al, ana], { agents: [{ name: "Kin" }] as WorkspaceData["agents"] }));
  assert.deepEqual([...plain].sort(), ["n", "s"], "Kin is an agent's name too, Al is too short");
  assert.ok(mentions("Call Sofia on Sunday", sofia, plain));
  assert.ok(mentions("Ask @kin about it", kin, plain), "@ ignores case");
  assert.ok(!mentions("Kin will remind me", kin, plain));
  assert.ok(!mentions("Sofiatown trip", sofia, plain), "whole words only");
  assert.ok(!mentions("mail sofia@example.com", sofia, plain), "not an e-mail address");
  assert.ok(mentions("Dinner with @Ana Costa.", ana, plain));
});

test("mentions are found across tasks, notes, projects and chats, never in the person's own topic", () => {
  const sofia = person("s", "Sofia");
  const found = mentionsOf(data([sofia], {
    tasks: [{ id: "t", domain: "Family", projectId: "", title: "Call @Sofia", done: false, due: "", updatedAt: "2026-11-20" }],
    notes: [{ id: "own", domain: "", projectId: "", topicId: "s", title: "Sofia's sizes", body: "", updatedAt: "2026-11-21" },
      { id: "n", domain: "Family", projectId: "", title: "Gift ideas", body: "Rui: a corkscrew.\nSofia: the ceramics class.", updatedAt: "2026-11-15" }],
    threads: [{ id: "agent:kin", read: 0, attachedNoteId: null, messages: [{ id: "m", role: "agent", text: "Sofia is free Sunday.", at: "2026-11-19" }] }],
  }), sofia, (home) => home.domain, () => "Chat with Kin");
  assert.deepEqual(found.map((item) => [item.kind, item.text]), [["task", "Call @Sofia"], ["message", "Sofia is free Sunday."], ["note", "Sofia: the ceramics class."]]);
});

test("renaming rewrites @mentions only, and typing @ offers people", () => {
  assert.equal(renamed("Ask @Sofia and @sofia, not Sofia", "Sofia", "Sofia M"), "Ask @Sofia M and @Sofia M, not Sofia");
  assert.deepEqual(typedMention("Remind @Mã", 10), { query: "Mã", at: 7 });
  assert.deepEqual(typedMention("@", 1), { query: "", at: 0 });
  assert.equal(typedMention("mail me@ex", 10), undefined, "not inside a word");
});

test("people picked from contacts join once: a name already in the Library, or picked twice, is skipped", () => {
  const before = data([person("s", "Sofia")]);
  const change = addPeople(before, [{ name: " sofia " }, { name: "Rui", photo: "data:image/webp;base64,x" }, { name: "rui" }, { name: "" }], "Family", ["#a", "#b"]);
  assert.deepEqual(change.added, ["Rui"]);
  const rui = change.data.topics.find((topic) => topic.name === "Rui")!;
  assert.deepEqual(rui.person, { relation: "", domain: "Family", hue: "#a", dates: [], photo: "data:image/webp;base64,x" });
  assert.deepEqual(addPeople(change.data, [{ name: "Rui" }], "Family", ["#a"]).added, [], "importing again adds nobody");
});
