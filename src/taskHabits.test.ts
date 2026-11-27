import assert from "node:assert/strict";
import test from "node:test";
import type { Task } from "./model.ts";
import { habitsOf } from "./taskHabits.ts";

const task = (fields: Partial<Task>): Task => ({ id: crypto.randomUUID(), domain: "Health", projectId: "", title: "x", done: false, due: "", ...fields });

test("a home's usual length and part need three tasks agreeing and half of those that set it", () => {
  const health = [
    task({ length: 45, at: "07:30" }), task({ length: 45, at: "morning", done: true }), task({ length: 45, at: "08:00" }), task({ length: 15, at: "evening" }),
    task({ domain: "Family", length: 90, at: "evening" }),
  ];
  assert.deepEqual(habitsOf(health, { domain: "Health", projectId: "" }), { length: 45, part: "morning" });
  // Two agreeing isn't a habit yet.
  assert.deepEqual(habitsOf(health.slice(1), { domain: "Health", projectId: "" }), { length: undefined, part: undefined });
});

test("a project's habits come from its own tasks only", () => {
  const tasks = [task({ length: 60 }), task({ length: 60 }), task({ length: 60 }), task({ projectId: "run", length: 30 }), task({ projectId: "run", length: 30 }), task({ projectId: "run", length: 30 })];
  assert.equal(habitsOf(tasks, { domain: "Health", projectId: "run" }).length, 30);
});
