import test from "node:test";
import assert from "node:assert/strict";
import { suggestedDomains } from "./onboarding.ts";
import { anyDomainStarters, buildStarter, ideasFor, isBuilt, starterDomainPages, starterProjects } from "./starterProjects.ts";
import { starterWorkspace } from "./starter.ts";
import { createDomain } from "./workspace.ts";

test("every offered domain has starters with an outcome, a finish line and first steps, whose question points at the right block", () => {
  for (const domain of ["Everyday", ...suggestedDomains.map((item) => item.name)]) {
    const starters = starterProjects[domain];
    assert.ok(starters?.length >= 2, `${domain} offers at least two`);
    for (const starter of starters) {
      assert.ok(starter.blocks.some((block) => block.type === "tasks") && starter.tasks.length >= 2, `${starter.title} has tasks`);
      assert.ok(starter.blocks.some((block) => block.type === "countdown"), `${starter.title} has a deadline (PARA: a project ends)`);
      assert.ok(starter.ask, `${starter.title} asks one question`);
      const block = starter.blocks[starter.ask!.block];
      if (starter.ask!.field === "date") assert.equal(block.type, "countdown", starter.title);
      if (starter.ask!.field === "target") assert.ok(block.type === "tracker" || block.type === "goal", starter.title);
    }
  }
});

test("every starter page fills its twelve-column rows, so no row shows a hole beside a lone block", () => {
  const span: Record<string, number> = { full: 12, wide: 8, half: 6, narrow: 4 };
  // The grid as styles.css lays it out: blocks wrap when they don't fit, and a half block that starts a row and
  // can't share it with the next block takes the whole row.
  const rows = (blocks: { width?: string }[]) => {
    const widths = blocks.map((block) => span[block.width ?? "full"]);
    const laid: number[] = [];
    let used = 0;
    widths.forEach((width, index) => {
      if (used + width > 12) { laid.push(used); used = 0; }
      const next = widths[index + 1];
      if (width === 6 && used === 0 && (next === undefined || next > 6)) width = 12;
      used += width;
    });
    return [...laid, used];
  };
  const pages = [...[...Object.values(starterProjects).flat(), ...anyDomainStarters].map((starter) => [starter.title, starter.blocks] as const),
    ...Object.entries(starterDomainPages).map(([domain, blocks]) => [`${domain} page`, blocks] as const)];
  for (const [name, blocks] of pages) assert.deepEqual(rows(blocks).filter((row) => row !== 12), [], `${name}: rows ${rows(blocks).join(", ")}`);
});

test("buildStarter makes the project, its page and tasks in one change; the answer fills its block, a name titles the project", () => {
  const data = createDomain(starterWorkspace(), { name: "Fitness", emoji: "🏃", hue: "", intention: "" }).data;
  const race = starterProjects.Fitness[0];
  const built = buildStarter(data, "Fitness", race, "2027-04-18", "2026-11-07");
  const project = built.data.projects.find((item) => item.id === built.id)!;
  assert.equal(project.title, "Run the race");
  assert.deepEqual(project.widgets!.map((block) => block.type), ["countdown", "tasks", "milestones", "tracker", "tasks", "resources"]);
  assert.deepEqual([project.widgets![0].date, project.widgets![0].since], ["2027-04-18", "2026-11-07"]);
  assert.deepEqual(project.widgets![2].steps!.map((step) => [step.title, step.date]).filter((_, index) => index === 0 || index === 4),
    [["Registered", "2026-11-23"], ["Race", "2027-04-18"]], "the plan is dated from today to race day");
  assert.ok(!("plan" in project.widgets![2]), "the plan itself isn't saved");
  assert.deepEqual(built.data.tasks.filter((task) => task.projectId === built.id).map((task) => [task.title, task.due]),
    race.tasks.map((title, index) => [title, ["2026-11-09", "2026-11-13", "2026-11-19"][index]]), "first steps land on the next days");
  const soon = buildStarter(data, "Fitness", race, "2026-11-10", "2026-11-07");
  assert.deepEqual(soon.data.tasks.filter((task) => task.projectId === soon.id).map((task) => task.due), ["2026-11-09", "2026-11-10", "2026-11-10"], "never past the finish line");
  assert.deepEqual(built.changes, { projects: [project], tasks: built.data.tasks.filter((task) => task.projectId === built.id) });
  assert.ok(isBuilt(built.data, "Fitness", race) && !isBuilt(built.data, "Fitness", starterProjects.Fitness[1]));

  const named = buildStarter(built.data, "Everyday", starterProjects.Everyday[0], "", "2026-11-07");
  assert.equal(named.data.projects.find((item) => item.id === named.id)!.title, "Paperwork in one place", "a skipped question changes nothing");
  const role = buildStarter(built.data, "Fitness", { ...starterProjects.Fitness[1], ask: { prompt: "", kind: "text", block: 0, field: "title" } }, " Deadlift ", "2026-11-07");
  assert.equal(role.data.projects.find((item) => item.id === role.id)!.title, "Hit a strength target: Deadlift");
  assert.ok(isBuilt(role.data, "Fitness", starterProjects.Fitness[1]), "a named build still counts as built");
  const bad = buildStarter(built.data, "Fitness", starterProjects.Fitness[1], "lots", "2026-11-07");
  assert.equal(bad.data.projects.find((item) => item.id === bad.id)!.widgets![2].target, undefined, "a non-number leaves the target alone");
});

test("every domain page has two or three ideas: its own starters not built yet, topped up with ones that fit any domain", () => {
  let data = createDomain(starterWorkspace(), { name: "Faith", emoji: "🌙", hue: "", intention: "" }).data;
  data = createDomain(data, { name: "Pets", emoji: "🐾", hue: "", intention: "" }).data;
  assert.deepEqual(ideasFor(data, "Faith"), anyDomainStarters, "a domain you named gets the shapes that fit any domain");
  assert.deepEqual(ideasFor(data, "Pets"), [...starterProjects.Pets, anyDomainStarters[0]]);
  for (const starter of starterProjects.Pets) data = buildStarter(data, "Pets", starter, "", "2026-11-18").data;
  assert.deepEqual(ideasFor(data, "Pets"), anyDomainStarters, "built ones step aside, and at least two stay");
  for (const domain of ["Everyday", ...suggestedDomains.map((item) => item.name)])
    assert.ok(ideasFor(starterWorkspace(), domain).length >= 2, `${domain} has at least two ideas`);
});

test("a starter opened in the project dialog keeps the dialog's id, finish date and edits, and counts as built under a new name", () => {
  const data = createDomain(starterWorkspace(), { name: "Health", emoji: "🌿", hue: "", intention: "" }).data;
  const sleep = starterProjects.Health[1];
  const built = buildStarter(data, "Health", sleep, "8", "2026-11-18", { id: "p1", finish: "2026-12-18", project: { title: "Sleep by Christmas", color: "ochre" } });
  const project = built.data.projects.find((item) => item.id === "p1")!;
  assert.deepEqual([project.title, project.color, project.starter, project.description], ["Sleep by Christmas", "ochre", sleep.title, sleep.line]);
  assert.deepEqual([project.widgets![0].date, project.widgets![2].target], ["2026-12-18", 8], "the finish line and the answered target");
  assert.deepEqual(built.data.tasks.filter((task) => task.projectId === "p1").map((task) => task.due), ["2026-11-20", "2026-11-24", "2026-11-30"]);
  assert.ok(isBuilt(built.data, "Health", sleep), "a renamed build still counts as built");
});
