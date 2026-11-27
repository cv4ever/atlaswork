import test from "node:test";
import assert from "node:assert/strict";
import { seedWorkspace } from "../demo.ts";
import { initialSession } from "../session.ts";
import { discover } from "./discover.ts";

const idle = { thinking: {}, errors: {}, progress: {}, proposalErrors: {}, jobs: [] };
const everyday = { domain: "Everyday", projectId: "", context: "Everyday|" };

test("the chat list files Atlas first, then rooms and teams, then each domain in its order", () => {
  const data = seedWorkspace();
  const { chats } = discover(data, initialSession, everyday, idle);
  const groups = [...new Set(chats.map((chat) => chat.group))];
  assert.equal(groups[0], "Everywhere");
  const domains = data.domains.map((domain) => domain.name).filter((name) => groups.includes(name));
  assert.deepEqual(groups.filter((group) => domains.includes(group)), domains);
  assert.ok(groups.indexOf("Teams") < groups.indexOf(domains[0]));
});

test("a team chat welcomes with its members joined by 'and', the lead answering first", () => {
  const data = seedWorkspace();
  const session = { ...initialSession, view: "chats" as const, chatPick: { thread: "team:home-front", context: "" } };
  const { current, welcome } = discover(data, session, everyday, idle);
  assert.equal(current.id, "team:home-front");
  assert.equal(welcome, "Hearth and Ledger are here. Hearth answers first; @name to ask someone else.");
});

test("a chat picked beside your work holds only in the place it was picked", () => {
  const data = seedWorkspace();
  const session = { ...initialSession, chatPick: { thread: "agent:kin", context: "Family|" } };
  assert.equal(discover(data, session, { domain: "Family", projectId: "", context: "Family|" }, idle).current.id, "agent:kin");
  assert.notEqual(discover(data, session, everyday, idle).current.id, "agent:kin");
});
