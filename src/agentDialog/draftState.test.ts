import test from "node:test";
import assert from "node:assert/strict";
import { canUse } from "../model.ts";
import type { Agent, Places } from "../model.ts";
import { editCount, setupSteps } from "./draftState.ts";

const agent = { id: "a", name: "Vital", portrait: "vital", role: "Coach", instructions: "Be brief.", writeMode: "propose" } as Agent;
const nowhere: Places = { domains: [], projectIds: [], teamIds: [] };

test("an edit counts each changed field, tool and place once, and ignores spaces", () => {
  assert.equal(editCount(agent, { ...agent, name: " Vital " }, nowhere, nowhere), 0);
  assert.equal(editCount(agent, { ...agent, role: "Trainer", writeMode: "full" }, nowhere, nowhere), 2);
  assert.equal(editCount(agent, agent, { ...nowhere, domains: ["Health", "Family"] }, { ...nowhere, domains: ["Health", "Home"] }), 2);
  assert.equal(editCount(agent, { ...agent, tools: { web: !canUse(agent, "web") } }, nowhere, nowhere), 1);
});

test("a new agent's setup names the next thing to settle", () => {
  assert.deepEqual(setupSteps("", false, "", false), { total: 5, done: 2, next: "a name" });
  assert.deepEqual(setupSteps("Vital", true, "Coach", true).next, "a name", "a taken name isn't settled");
  assert.deepEqual(setupSteps("Vital", false, "Coach", true), { total: 5, done: 5, next: undefined });
});
