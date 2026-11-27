import test from "node:test";
import assert from "node:assert/strict";
import { defaultDomain } from "../model.ts";
import type { OnboardingStart } from "../onboarding.ts";
import { suggestedAgents } from "../suggestedAgents.ts";
import { addOwn, firstPicks, toggleDomain, toggleElsewhere } from "./picks.ts";

const start: OnboardingStart = { kept: [defaultDomain], crew: [], stewarded: [] };
const forDomain = (domain: string) => suggestedAgents.filter((agent) => agent.domain === domain);

test("a fresh first run ticks the starter domain with its steward", () => {
  const picks = firstPicks(start, null);
  assert.deepEqual(picks.domains, ["Health"]);
  assert.deepEqual(picks.agents, [forDomain("Health")[0].name]);
});

test("unpicking a domain drops its agents; picking it again ticks its steward and bursts", () => {
  const off = toggleDomain(start, firstPicks(start, null), "Health");
  assert.deepEqual(off.picks.agents, []);
  assert.equal(off.burst, undefined);
  const on = toggleDomain(start, off.picks, "Health");
  assert.deepEqual(on.picks.agents, [forDomain("Health")[0].name]);
  assert.equal(on.burst, "Health");
  assert.equal(toggleDomain(start, on.picks, defaultDomain.name).picks, on.picks, "Everyday never moves");
});

test("an agent from another domain picks that domain, and unticking the last one there unpicks it", () => {
  const family = forDomain("Family")[0];
  const ticked = toggleElsewhere(start, firstPicks(start, null), family);
  assert.ok(ticked.picks.domains.includes("Family"));
  assert.equal(ticked.burst, family.name);
  assert.ok(!toggleElsewhere(start, ticked.picks, family).picks.domains.includes("Family"));
});

test("a domain you name comes with its own steward; Everyday is refused and a listed name ticks that domain", () => {
  const picks = firstPicks(start, null);
  const added = addOwn(start, picks, { emoji: "🎻", name: " Music ", about: "Practice" });
  assert.deepEqual(added.picks.own.map((domain) => [domain.name, domain.intention]), [["Music", "Practice"]]);
  assert.ok(added.picks.domains.includes("Music"));
  assert.equal(added.picks.agents.length, picks.agents.length + 1);
  assert.equal(addOwn(start, picks, { emoji: "✨", name: "everyday", about: "" }).picks, picks);
  assert.ok(addOwn(start, picks, { emoji: "✨", name: "family", about: "" }).picks.domains.includes("Family"));
});
