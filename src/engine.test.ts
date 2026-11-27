import test from "node:test";
import assert from "node:assert/strict";
import { createAgentEngine, offlineEngine } from "./atlas.ts";
import type { AgentEngine, ModelMenu, ModelState, Provider } from "./atlas.ts";
import type { OwnChoice, OwnModelStatus } from "./ownModel.ts";

const hosted: Provider = { using: "hosted", own: null };
const menu = (source: string, prices?: Record<string, { input: number; output: number }>): ModelMenu => ({ source, label: source, current: `${source}-default`,
  list: async () => [{ id: `${source}-model`, name: source }], test: async () => ({ text: "OK", ms: 1 }), ...prices && { prices: async () => prices } });
const loaded = (next: ModelMenu | null, provider = hosted) => ({ provider, menu: next });

function pendingEngine() {
  const changes = new Set<() => void>();
  const requests: PromiseWithResolvers<{ provider: Provider; menu: ModelMenu | null }>[] = [];
  const engine = createAgentEngine({ ...offlineEngine,
    subscribe(listener) { changes.add(listener); return () => { changes.delete(listener); }; },
    load() {
      const request = Promise.withResolvers<{ provider: Provider; menu: ModelMenu | null }>();
      requests.push(request);
      return request.promise;
    },
  });
  return { engine, requests, change: () => { for (const listener of changes) listener(); } };
}

/** Called while loading with a reader already mounted; resolves through the same notification seam as the UI. */
function settled(engine: AgentEngine, done: (state: ModelState) => boolean = (state) => state.status !== "loading") {
  const next = Promise.withResolvers<ModelState>();
  const off = engine.models.subscribe(() => {
    const state = engine.models.getSnapshot();
    if (done(state)) { off(); next.resolve(state); }
  });
  return next.promise;
}

test("model readers share changes and only the latest provider load may replace the snapshot", async (t) => {
  const { engine, requests, change } = pendingEngine();
  const profile: ModelState[] = [], details: ModelState[] = [];
  t.after(engine.models.subscribe(() => profile.push(engine.models.getSnapshot())));
  t.after(engine.models.subscribe(() => details.push(engine.models.getSnapshot())));
  const initial = settled(engine);
  const first = menu("first");
  requests[0].resolve(loaded(first));
  assert.deepEqual(await initial, { status: "ready", provider: hosted, menu: first });
  assert.strictEqual(profile.at(-1), details.at(-1), "both readers receive the same snapshot");

  change();
  assert.deepEqual(engine.models.getSnapshot(), { status: "loading", last: hosted },
    "a changed provider hides the previous menu immediately; only who answered until now stays, for Settings");
  change();
  change();
  const latest = settled(engine);
  const current = menu("current");
  requests[3].resolve(loaded(current));
  const published = await latest;
  assert.deepEqual(published, { status: "ready", provider: hosted, menu: current });

  requests[1].resolve(loaded(menu("stale")));
  requests[2].reject(new Error("An earlier provider is unavailable"));
  await Promise.allSettled([requests[1].promise, requests[2].promise]);
  assert.strictEqual(engine.models.getSnapshot(), published, "neither an old success nor an old failure may overwrite the current provider");
  assert.strictEqual(profile.at(-1), details.at(-1));
});

test("a failed model load stays distinct from no model choice, and manual retry can recover", async (t) => {
  const { engine, requests } = pendingEngine();
  t.after(engine.models.subscribe(() => {}));
  const failed = settled(engine);
  requests[0].reject(new Error("The account is offline"));
  assert.deepEqual(await failed, { status: "error", message: "The account is offline" });

  engine.models.reload();
  assert.deepEqual(engine.models.getSnapshot(), { status: "loading" });
  const recovered = settled(engine);
  requests[1].resolve(loaded(null));
  assert.deepEqual(await recovered, { status: "ready", provider: hosted, menu: null }, "a provider with no choice is a successful load, not a masked failure");
});

test("a remounted reader cannot reuse metadata or an unfinished load from before it stopped listening", async (t) => {
  const { engine, requests, change } = pendingEngine();
  const off = engine.models.subscribe(() => {});
  const initial = settled(engine);
  requests[0].resolve(loaded(menu("before")));
  await initial;
  change();
  off();
  requests[1].resolve(loaded(menu("outdated")));
  await requests[1].promise;

  t.after(engine.models.subscribe(() => {}));
  assert.deepEqual(engine.models.getSnapshot(), { status: "loading" }, "the reader waits for current defaults rather than reusing the idle snapshot");
  const remounted = settled(engine);
  const after = menu("after");
  requests[2].resolve(loaded(after));
  assert.deepEqual(await remounted, { status: "ready", provider: hosted, menu: after });
});

test("models and prices load only when asked, once per load, and a newer provider drops the older list", async (t) => {
  const { engine, requests, change } = pendingEngine();
  t.after(engine.models.subscribe(() => {}));
  const ready = settled(engine);
  requests[0].resolve(loaded(menu("router", { "router-model": { input: 1, output: 2 } })));
  const first = await ready;
  assert.equal(first.status === "ready" && first.catalogue, undefined, "nothing is listed until a reader asks");

  const listed = settled(engine, (state) => state.status === "ready" && state.catalogue?.status === "ready");
  engine.models.loadCatalogue();
  engine.models.loadCatalogue();
  const withList = await listed;
  assert.deepEqual(withList.status === "ready" && withList.catalogue,
    { status: "ready", models: [{ id: "router-model", name: "router" }], prices: { "router-model": { input: 1, output: 2 } } });

  // A list asked of one provider never lands on the next.
  const slow = Promise.withResolvers<{ id: string; name: string }[]>();
  change();
  const next = settled(engine);
  requests[1].resolve(loaded({ ...menu("key"), list: () => slow.promise }));
  await next;
  engine.models.loadCatalogue();
  change();
  slow.resolve([{ id: "late", name: "late" }]);
  await slow.promise;
  assert.deepEqual(engine.models.getSnapshot(), { status: "loading", last: hosted });
});

test("saving or removing the account's own provider resolves once readers see the result", async (t) => {
  let saved: OwnModelStatus = null;
  const choices: OwnChoice[] = [];
  const status = (choice: OwnChoice): OwnModelStatus => ({ provider: choice.provider, base_url: choice.baseUrl, model: choice.model, hint: "…1234", effort: choice.effort });
  const engine = createAgentEngine({ ...offlineEngine,
    load: async () => saved ? loaded(menu(saved.provider), { using: "own", own: saved }) : loaded(null),
    own: {
      save: async (choice) => { choices.push(choice); saved = status(choice); },
      remove: async () => { saved = null; },
      test: async () => ({ text: "OK", ms: 1 }),
    },
  });
  t.after(engine.models.subscribe(() => {}));
  await settled(engine);
  const choice: OwnChoice = { provider: "openrouter", model: "openai/gpt-oss-120b", key: "sk-or-new", baseUrl: null, effort: "low" };
  await engine.own!.save(choice);
  const after = engine.models.getSnapshot();
  assert.deepEqual(after.status === "ready" && after.provider, { using: "own", own: status(choice) });
  assert.equal(after.status === "ready" && after.menu?.source, "openrouter", "an agent's Model offers the new provider's models");
  await engine.own!.remove();
  const removed = engine.models.getSnapshot();
  assert.deepEqual(removed.status === "ready" && removed.provider, hosted);
  assert.deepEqual(choices, [choice]);
});
