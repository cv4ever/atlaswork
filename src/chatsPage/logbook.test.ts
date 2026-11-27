import test from "node:test";
import assert from "node:assert/strict";
import type { Proposal } from "../model.ts";
import type { Sitting } from "../sittings.ts";
import { groupLogbook, matchSittings, outcomeOf, shows } from "./logbook.ts";

const sitting = (key: string, threadId: string, text: string, extra: Partial<Sitting> = {}) => ({ key, threadId, text, at: "2026-11-21T10:00:00Z", ...extra }) as Sitting;
const entries = new Map([["t1", { id: "t1", label: "Vital", detail: "Health" }], ["t2", { id: "t2", label: "Kin", detail: "Family" }]]);
const sittings = [sitting("a", "t1", "running plan"), sitting("b", "t2", "birthday video"), sitting("c", "gone", "video")];
const proposal = (status: Proposal["status"], extra: Partial<Proposal> = {}) =>
  ({ proposal: { status, items: [{}, {}], ...extra } as Proposal });

test("a chat's name matches all of it, other words match what was said, and gone chats never show", () => {
  assert.deepEqual(matchSittings(sittings, entries, "health", "").matches.map((item) => item.key), ["a"]);
  assert.deepEqual(matchSittings(sittings, entries, "video", "").matches.map((item) => item.key), ["b"]);
  assert.deepEqual(matchSittings(sittings, entries, "", "t2").matches.map((item) => item.key), ["b"]);
});

test("a conversation says what came of it: what waits on you before what was done, and talk says nothing", () => {
  assert.deepEqual(outcomeOf({}, [proposal("applied"), proposal("pending", { items: [], changes: [{}] as Proposal["changes"] })]),
    { tone: "waiting", text: "1 change to review" });
  assert.deepEqual(outcomeOf({}, [proposal("applied"), proposal("applied", { items: [], changes: [{}, {}] as Proposal["changes"] })]),
    { tone: "done", text: "Added 2 tasks, made 2 changes" });
  assert.deepEqual(outcomeOf({}, [proposal("rejected")]), { tone: "declined", text: "Turned down" });
  assert.deepEqual(outcomeOf({}, [{ ask: { status: "pending" } as never }]), { tone: "waiting", text: "A question to pass on" });
  assert.deepEqual(outcomeOf({}, [{}]), { tone: "talk", text: "" });
  assert.deepEqual(outcomeOf({ request: { status: "pending", name: "Sage" } }, []), { tone: "waiting", text: "Sage: agent draft to review" });
});

test("what waits on you leads in a group of its own, and Decided keeps applied and turned-down ones", () => {
  const now = Date.parse("2026-11-21T12:00:00Z");
  const items = [
    { sitting: sitting("a", "t1", ""), outcome: outcomeOf({}, [proposal("applied")]) },
    { sitting: sitting("w", "t1", ""), outcome: outcomeOf({}, [proposal("pending")]) },
    { sitting: sitting("t", "t1", ""), outcome: outcomeOf({}, []) },
  ];
  assert.deepEqual(groupLogbook(items, now).map((group) => [group.label, group.items.map((item) => item.sitting.key)]),
    [["Waiting on you", ["w"]], ["Today", ["a", "t"]]]);
  assert.deepEqual(items.filter((item) => shows("decided", item.outcome)).map((item) => item.sitting.key), ["a"]);
  assert.deepEqual(items.filter((item) => shows("waiting", item.outcome)).map((item) => item.sitting.key), ["w"]);
});
