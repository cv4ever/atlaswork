import test from "node:test";
import assert from "node:assert/strict";
import type { Project, Task } from "../model.ts";
import { pacedProjects } from "./paced.ts";

const project = (id: string): Project => ({ id, area: "Health", title: id, color: "sage", description: "" });
const task = (id: string, projectId: string, due: string, done = false): Task => ({ id, title: id, due, done, domain: "Health", projectId });

test("projects list unfinished before finished, each with its next open task soonest due first", () => {
  const tasks = [task("a1", "a", "", true), task("b2", "b", "2026-12-01"), task("b1", "b", "2026-11-25"), task("c1", "c", "")];
  const paced = pacedProjects([project("a"), project("b"), project("c")], tasks, "2026-11-21");
  assert.equal(paced.at(-1)?.project.id, "a");
  assert.equal(paced.at(-1)?.done, true);
  assert.equal(paced.find((entry) => entry.project.id === "b")?.next?.id, "b1");
  assert.equal(paced.find((entry) => entry.project.id === "c")?.daysLeft, undefined);
});
