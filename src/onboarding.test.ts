import test from "node:test";
import assert from "node:assert/strict";
import { applyOnboarding, onboardingStart, suggestedDomains, untouched } from "./onboarding.ts";
import { readyMade, startFrom, stewardFor, stewardForOwn, suggestedAgents } from "./suggestedAgents.ts";
import { starterWorkspace } from "./starter.ts";
import { createAgent, createDomain, createTask, normalize, placesOf, saveDraft, unplant } from "./workspace.ts";
import type { WorkspaceData } from "./model.ts";
import { atlasAgent } from "./model.ts";
import { domainKey } from "./place.ts";

const pick = (name: string) => suggestedAgents.find((agent) => agent.name === name)!;

test("onboarding creates picked areas and agents once: existing domains stay, taken names are skipped, domain agents take their domain", () => {
  const data = createDomain(starterWorkspace(), { name: "health", emoji: "💊", hue: "", intention: "Mine already." }).data;
  const shared = { id: "s1", name: "vital", portrait: "coach", role: "Copy", instructions: "", writeMode: "full" as const };
  const { data: next, changes } = applyOnboarding(data, { domains: ["Health", "Finance"], own: [], agents: [pick("Vital"), pick("Chef"), pick("Ledger"), pick("Quill")], shared: [shared] }, "2026-11-07");
  assert.deepEqual(next.domains.map((domain) => domain.name), ["Everyday", "health", "Finance"], "the domain already there is kept under its own spelling");
  assert.deepEqual(next.domains.find((domain) => domain.name === "Finance")!.intention, suggestedDomains.find((item) => item.name === "Finance")!.intention);
  assert.deepEqual(next.agents.filter((agent) => agent.id !== "atlas").map((agent) => agent.name), ["Vital", "Chef", "Ledger", "Quill"], "the community duplicate of Vital is left out");
  const [vital, chef, ledger, quill] = next.agents.filter((agent) => agent.id !== "atlas");
  assert.deepEqual(placesOf(next, vital.id).domains, ["health"], "a domain agent looks after the matching existing domain");
  assert.deepEqual(placesOf(next, ledger.id).domains, ["Finance"]);
  assert.deepEqual(placesOf(next, chef.id).domains, [], "a second agent for the same domain starts on the bench instead of taking it over");
  assert.deepEqual(placesOf(next, quill.id).domains, [], "a general agent starts on the bench");
  assert.deepEqual(vital.routines?.map((routine) => routine.kind), ["improve"], "every new agent gets a weekly improvement, no check-in");
  assert.equal(changes.domains, next.domains, "the changeset carries the whole domain list, agent assignments included");
  assert.equal(changes.agents?.length, 4);
  assert.ok(!untouched(next));
  assert.ok(untouched(starterWorkspace()));
});

test("a domain you named yourself is created when picked, and its steward looks after it and suggests improvements weekly", () => {
  const faith = { name: "Faith", emoji: "🌙", hue: "#7c68c4", intention: "Mass on Sundays, reading." };
  const garage = { name: "Garage", emoji: "🛠️", hue: "#8d9a3e", intention: "" };
  const steward = stewardForOwn(faith, 0);
  const { data } = applyOnboarding(starterWorkspace(), { domains: ["Faith"], own: [faith, garage], agents: [steward, pick("Vital")], shared: [] }, "2026-11-07");
  assert.deepEqual(data.domains.map((domain) => domain.name), ["Everyday", "Faith"], "an unpicked domain of your own is left out");
  assert.equal(data.domains[1].intention, "Mass on Sundays, reading.");
  const agent = data.agents.find((item) => item.name === steward.name)!;
  assert.deepEqual(placesOf(data, agent.id).domains, ["Faith"]);
  assert.match(agent.instructions, /Faith, which is about: Mass on Sundays, reading\. Turn/, "its house rules carry what the domain is for");
  assert.deepEqual(agent.routines?.[0].repeat, { every: "week", days: [1], weeks: 1 }, "its weekly improvement falls on Monday");
  assert.deepEqual(data.agents.find((item) => item.name === "Vital")!.routines?.[0].repeat, { every: "week", days: [2], weeks: 1 }, "the next agent's on Tuesday");
  assert.notEqual(stewardForOwn(garage, 1).name, steward.name, "two domains of your own get stewards with different names");
  assert.ok(!suggestedAgents.some((item) => item.portrait === steward.portrait), "the steward doesn't wear a suggested agent's face");
});

test("picking nothing changes nothing", () => {
  const data = starterWorkspace();
  assert.deepEqual(applyOnboarding(data, { domains: [], own: [], agents: [], shared: [] }, "2026-11-07"), { data, changes: {} });
});

test("loading brings agents still on an earlier default up to date, and leaves rules the person wrote", () => {
  const base = starterWorkspace();
  const quill = { id: "q", name: "Quill", portrait: "quill", role: "Editorial specialist", writeMode: "propose" as const,
    instructions: "Rewrites until the sentence stops apologizing.", routines: [] };
  const mine = { ...quill, id: "m", name: "Scout", role: "Researcher", instructions: "Only primary sources." };
  const loaded = { ...base, agents: [{ ...base.agents[0], instructions: "Calm, brief, practical. Help me find the next step." }, quill, mine] };
  const { data, changes } = normalize(loaded);
  const now = pick("Quill");
  assert.deepEqual(data.agents.map((agent) => [agent.instructions, agent.role]),
    [[atlasAgent.instructions, atlasAgent.role], [now.instructions, now.role], ["Only primary sources.", "Researcher"]]);
  assert.deepEqual(changes.agents?.map((agent) => agent.id), [atlasAgent.id, "q"], "only the updated agents are saved");
  assert.equal(normalize(data).changes.agents, undefined, "once updated, nothing changes on the next load");
});

test("the crew takes turns: weekly improvements fall Monday to Friday in pick order, then round again", () => {
  const names = ["Vital", "Kin", "Ledger", "Compass", "Chef", "Hearth"];
  const { data } = applyOnboarding(starterWorkspace(), { domains: ["Health", "Family", "Finance", "Career", "Home"], own: [], agents: names.map(pick), shared: [] }, "2026-11-07");
  const days = names.map((name) => data.agents.find((agent) => agent.name === name)?.routines?.[0].repeat);
  assert.deepEqual(days.map((repeat) => repeat && "days" in repeat ? repeat.days : null), [[1], [2], [3], [4], [5], [1]]);
});

test("every domain the flow offers has a steward besides Atlas, who looks after Everyday himself", () => {
  for (const domain of suggestedDomains.map((item) => item.name)) assert.ok(stewardFor(domain), `${domain} has a suggested agent`);
  assert.equal(stewardFor("Everyday"), undefined);
});

test("running setup again: a domain keeps its steward, unticked ones are archived, and a re-picked one comes back", () => {
  const first = applyOnboarding(starterWorkspace(), { domains: ["Health", "Family"], own: [], agents: [pick("Vital"), pick("Kin")], shared: [] }, "2026-11-07").data;
  const start = onboardingStart(first);
  const kin = first.agents.find((agent) => agent.name === "Kin")!;
  assert.deepEqual([start.kept.map((domain) => domain.name), start.crew.map((agent) => [agent.name, agent.home]), start.stewarded],
    [["Everyday", "Health", "Family"], [["Vital", "Health"], ["Kin", "Family"]], ["Health", "Family"]]);
  const mine = createAgent(first, { id: "doc", name: "Doc", portrait: "mentor", role: "", instructions: "", writeMode: "propose" }, { domains: ["Health"], projectIds: [], teamIds: [] }).data;
  const { data: again, changes } = applyOnboarding(mine, { domains: ["Health", "Pets"], own: [], agents: [pick("Chef"), pick("Rover")], shared: [],
    archive: { domains: ["Family", "Everyday"], agentIds: [kin.id, "atlas"] } }, "2026-11-14");
  assert.equal(again.domains.find((domain) => domain.name === "Health")!.agentId, "doc", "a steward you chose stays");
  assert.deepEqual(placesOf(again, again.agents.find((agent) => agent.name === "Chef")!.id).domains, [], "a new agent for a looked-after domain starts on the bench");
  assert.equal(again.domains.find((domain) => domain.name === "Pets")!.agentId, again.agents.find((agent) => agent.name === "Rover")!.id);
  assert.ok(again.domains.find((domain) => domain.name === "Family")!.archived && again.agents.find((agent) => agent.id === kin.id)!.archived, "unticked: archived, not deleted");
  assert.ok(!again.domains.find((domain) => domain.name === "Everyday")!.archived && !again.agents.find((agent) => agent.id === "atlas")!.archived, "Everyday and Atlas always stay");
  assert.deepEqual(changes.agents?.map((agent) => agent.name).sort(), ["Chef", "Kin", "Rover"], "one changeset carries the archived agent and the new ones");
  const back = applyOnboarding(again, { domains: ["Family"], own: [], agents: [], shared: [] }, "2026-11-15").data;
  assert.deepEqual(back.domains.filter((domain) => domain.name === "Family").map((domain) => domain.archived), [false], "picking an archived domain restores it");
  assert.deepEqual(onboardingStart(starterWorkspace()), { kept: [{ name: "Everyday", emoji: "☀️", hue: "", intention: "The ordinary, good stuff." }], crew: [], stewarded: [] });
});

test("a domain planted in the dialog gets its own agent: the crew's for that name, else its suggestion, else a keeper of its own", () => {
  const since = "2026-11-16T00:00:00.000Z";
  const plant = (data: WorkspaceData, name: string, intention = "") =>
    saveDraft(data, { kind: "domain", domain: { name, emoji: "🌱", hue: "", intention }, keeper: { since } });
  const withVital = applyOnboarding(starterWorkspace(), { domains: [], own: [], agents: [pick("Vital")], shared: [] }, since).data;
  const health = plant(withVital, "health");
  assert.equal(health.data.domains.at(-1)!.agentId, withVital.agents.find((agent) => agent.name === "Vital")!.id, "the crew's Vital looks after a Health of any spelling");
  assert.equal(health.changes.agents, undefined, "nobody new joins");
  const pets = plant(starterWorkspace(), "Pets").data;
  assert.equal(pets.domains.at(-1)!.agentId, pets.agents.find((agent) => agent.name === "Rover")!.id, "a suggested domain brings its suggested agent");
  const garage = plant(starterWorkspace(), "Garage", "Tools and the car.");
  const keeper = garage.data.agents.find((agent) => agent.id === garage.data.domains.at(-1)!.agentId)!;
  assert.ok(keeper.id !== "atlas" && !suggestedAgents.some((item) => item.name === keeper.name || item.portrait === keeper.portrait), "a keeper of its own, not Atlas or a suggestion");
  assert.match(keeper.instructions, /Garage, which is about: Tools and the car/);
  assert.deepEqual(keeper.routines?.map((routine) => [routine.kind, routine.repeat]), [["improve", { every: "week", days: [1], weeks: 1 }]], "it suggests improvements on Mondays");
  assert.deepEqual(garage.changes.agents, [keeper], "one changeset hires it with the domain");
  const nobody = saveDraft(starterWorkspace(), { kind: "domain", domain: { name: "Garage", emoji: "🌱", hue: "", intention: "" } }).data;
  assert.equal(nobody.domains.at(-1)!.agentId, undefined, "picking nobody leaves it to Atlas");
});

test("a new domain can always hire someone new: the next suggestion for it, else a keeper of its own, even when its crew agent is suggested first", () => {
  const since = "2026-11-17T00:00:00.000Z";
  const plant = (data: WorkspaceData, fresh?: boolean) =>
    saveDraft(data, { kind: "domain", domain: { name: "Learning", emoji: "📚", hue: "", intention: "" }, keeper: { since, fresh } });
  const withScholar = applyOnboarding(starterWorkspace(), { domains: [], own: [], agents: [pick("Scholar")], shared: [] }, since).data;
  const scholar = withScholar.agents.find((agent) => agent.name === "Scholar")!;
  assert.equal(plant(withScholar).data.domains.at(-1)!.agentId, scholar.id, "the crew's Scholar is still the default");
  const polyglot = plant(withScholar, true);
  assert.deepEqual(polyglot.changes.agents?.map((agent) => agent.name), ["Polyglot"], "a fresh pick hires the next agent suggested for Learning");
  const both = applyOnboarding(withScholar, { domains: [], own: [], agents: [pick("Polyglot")], shared: [] }, since).data;
  const own = plant(both, true).changes.agents![0];
  assert.ok(!suggestedAgents.some((item) => item.name === own.name), "with both in the crew, a keeper of its own");
});

test("new domains' agents take turns: each weekly improvement lands on the quietest weekday", () => {
  const since = "2026-11-16T00:00:00.000Z";
  let data = starterWorkspace();
  const days = ["Garage", "Faith", "Boat"].map((name) => {
    data = saveDraft(data, { kind: "domain", domain: { name, emoji: "🌱", hue: "", intention: "" }, keeper: { since } }).data;
    const agent = data.agents.find((item) => item.id === data.domains.at(-1)!.agentId)!;
    const repeat = agent.routines![0].repeat;
    return repeat.every === "week" ? repeat.days : null;
  });
  assert.deepEqual(days, [[1], [2], [3]], "Monday, then Tuesday, then Wednesday");
});

test("Undo after planting takes back the domain and the agent hired with it, but never loses work", () => {
  const planted = saveDraft(starterWorkspace(), { kind: "domain", domain: { name: "Garage", emoji: "🌱", hue: "", intention: "" }, keeper: { since: "2026-11-16" } }).data;
  const keeper = planted.domains.at(-1)!.agentId!;
  const undone = unplant(planted, "Garage", keeper);
  assert.deepEqual([undone.data.domains.map((domain) => domain.name), undone.data.agents.some((agent) => agent.id === keeper)], [["Everyday"], false]);
  assert.deepEqual(undone.changes.deletedAgentIds, [keeper]);
  const used = createTask(planted, { title: "Oil change", due: "", done: false }, domainKey("Garage")).data;
  assert.throws(() => unplant(used, "Garage", keeper), /Something is already in Garage/, "a domain with a task in it stays");
  const busy = createDomain(planted, { name: "Boat", emoji: "⛵", hue: "", intention: "", agentId: keeper }).data;
  const kept = unplant(busy, "Garage", keeper).data;
  assert.ok(kept.agents.some((agent) => agent.id === keeper) && !kept.domains.some((domain) => domain.name === "Garage"), "an agent that took other work stays");
});

test("New agent starts from a ready-made one: a free domain of its own, its face unless worn, nobody already here", () => {
  let data = createDomain(starterWorkspace(), { name: "Health", emoji: "💊", hue: "", intention: "" }).data;
  data = createDomain(data, { name: "Finance", emoji: "💶", hue: "", intention: "" }).data;
  data = createAgent(data, { id: "v", name: "Vital", portrait: "ledger", role: "", instructions: "", writeMode: "propose" }, { domains: ["Health"], projectIds: [], teamIds: [] }).data;
  assert.ok(!readyMade(data).some((item) => item.name === "Vital"), "an agent already named Vital isn't offered again");
  const draft = { agent: { id: "new", name: "Remy", portrait: "spark", role: "", instructions: "", writeMode: "full" as const }, places: { domains: ["Health"], projectIds: ["p1"], teamIds: [] } };
  const ledger = startFrom(data, draft, pick("Ledger"));
  assert.deepEqual([ledger.agent.name, ledger.agent.role, ledger.agent.writeMode, ledger.agent.portrait], ["Ledger", "Bookkeeper", "propose", "spark"], "Vital wears Ledger's face, so the draft's free one stays");
  assert.deepEqual(ledger.places, { domains: ["Finance"], projectIds: ["p1"], teamIds: [] }, "Finance is free: Ledger looks after it, and the project it was opened from stays");
  assert.deepEqual(startFrom(data, draft, pick("Chef")).places.domains, [], "Health has Vital, so Chef doesn't take it over");
  assert.equal(startFrom(data, draft, pick("Quill")).agent.portrait, "quill");
});
