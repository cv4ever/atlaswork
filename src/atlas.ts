// The AgentEngine seam: replies, labels and one shared model state (who answers, their menu and, on request, its
// models and prices), assembled by createAgentEngine from the live, dev or offline adapter. The engine selects the
// Agent's Workspace once per reply, builds the request from it (agentRequest.ts), opens the linked folders of its
// projects (folders.ts, D47) and binds the model's draft against it; adapters only carry the request, run the file
// tools they're handed and bring back text, draft and usage. offlineEngine explains when no model is connected.
// Provider-specific setup stays in the adapters; the account's own provider is saved through the engine, so every
// reader sees the change.
import type { Snapshot, ToolCall } from "../supabase/functions/agent/logic.ts";
import type { WarningKind } from "../supabase/functions/agent/warnings.ts";
import { computerFolders, draftsOf, memoriesOf, projectPlaces, snapshotOf } from "./agentRequest.ts";
import type { AgentReply, AgentRequest, Elsewhere } from "./agentRequest.ts";
import { sees, scopeOf } from "./agents.ts";
import { agentWorkspace } from "./agentWorkspace.ts";
import { imageForAgent } from "./images.ts";
import { agentTools, canUse, toneOf } from "./model.ts";
import type { Agent, ToolId, ToolUse, Usage, WorkspaceData } from "./model.ts";
import type { AgentWorkspace } from "./agentWorkspace.ts";
import type { FolderSource } from "./folders.ts";
import type { ComponentType } from "react";
import type { Effort } from "../supabase/functions/agent/responses.ts";
import type { OwnChoice, OwnModelStatus } from "./ownModel.ts";

const toolOff = (agent: Agent, tool: ToolId) =>
  inVoice(agent, `I can't ${agentTools[tool].does} right now.`, [`Turn on “${agentTools[tool].label}” in my Permissions if you want me to.`]);

/**
 * What an adapter brings back: the model's words, its unchecked draft (the agent function's `{command, args}`), what
 * it shows beside that draft (`shown`, D64: the function returns the two apart), memories (`Remembering`), what it
 * read (`used`, D81, checked by the adapter), the scams code found (`warnings`, D79) and tokens. With `Elsewhere`'s
 * fields the function landed it itself (D73, D76): nothing else comes back.
 */
export type DraftReply = Elsewhere & {
  text: string; draft?: unknown; shown?: unknown; memories?: unknown; used?: ToolUse[]; warnings?: WarningKind[]; usage?: Usage;
};
/**
 * How the UI labels whoever answers an agent. `offline` means no model can answer (signed out with nothing connected):
 * replies and routines wait. `maxRequest` is the longest message the engine takes, in characters; unset means no
 * limit. `manage` links to where the person sees and limits what it costs them (OpenAI's "Using ChatGPT plan" mark
 * with Manage usage).
 */
export type EngineInfo = { badge: string; offline?: boolean; maxRequest?: number; manage?: { label: string; href: string } };
/**
 * A model on this device that answers every agent instead of the account's provider (the dev ChatGPT bridge), offered
 * as one more provider in Settings → AI model. `active` is this device's choice; `Setup` draws its own controls
 * (connect, model, sign out) and calls `onUse` once it's ready to answer.
 */
export type LocalModel = { label: string; active(): boolean; setActive(on: boolean): void; Setup: ComponentType<{ onUse: () => void }> };
/**
 * The models an agent may answer on instead of the provider's default (agents-design D44): `source` is the catalogue
 * they come from (`sourceOf` in provider.ts, "chatgpt", or "echo" in the browser checks), `label` its name, `current`
 * the default every agent uses. `efforts` is set when the provider takes a thinking effort (`current` the account's,
 * null for the model's own). `list` fetches the catalogue (OpenRouter's has its own picker); `test` sends one tiny
 * request on an agent's model and effort and resolves with the answer and its time, or rejects with the reason.
 * `prices`, where the catalogue lists them, are dollars per million tokens in and out, which price its replies (D45).
 */
export type ModelMenu = { source: string; label: string; current: string; efforts?: { current: Effort | null };
  list(): Promise<{ id: string; name: string }[]>; test(choice: { id?: string; effort?: Effort }): Promise<{ text: string; ms: number }>;
  prices?(): Promise<Record<string, { input: number; output: number }>> };
/**
 * Who answers every agent (Settings → AI model): nothing yet (signed out), Atlaswork's hosted model, the account's own
 * provider, or a model on this device (`device` names it). `own` is the account's saved provider, kept while another
 * answers, so Settings can offer it again.
 */
export type Provider = { using: "none" | "hosted" | "own" | "device"; own: OwnModelStatus; device?: string };
/** The menu's models and prices, loaded only when a reader asks (`models.loadCatalogue`); a failed list is empty. */
export type Catalogue = Readonly<
  | { status: "loading" }
  | { status: "ready"; models: { id: string; name: string }[]; prices?: Record<string, { input: number; output: number }> }
>;
/**
 * Model metadata belongs to the engine, not to each mounted reader (D44). A failed load is never a default. While a
 * reload runs, the menu and catalogue are gone at once, but `last` says who answered until then, so Settings can keep
 * showing it (dimmed) instead of flashing empty; a new reader after everyone left gets no `last`.
 */
export type ModelState = Readonly<
  | { status: "loading"; last?: Provider }
  | { status: "ready"; provider: Provider; menu: ModelMenu | null; catalogue?: Catalogue }
  | { status: "error"; message: string }
>;
/**
 * What a provider supplies before `createAgentEngine` owns its model state. Setup stays in the adapter; successful
 * changes announce themselves through `subscribe`, including changed defaults while the same provider stays active.
 */
export type AgentAdapter = {
  /**
   * `snapshot` builds the request the agent function takes, from the reply's one selection; adapters that need no model
   * skip it. `files` answers the file and image tools the function pauses on (D47, D58), when the request lists folders or images.
   */
  reply(request: AgentRequest, snapshot: () => Snapshot, files?: (call: ToolCall) => Promise<string>): Promise<DraftReply>;
  /** Who answers: every agent answers through the same engine, so it's the same for all of them. */
  about(): EngineInfo;
  /** Reports changes to the active provider, its defaults or what `about` says. */
  subscribe?(listener: () => void): () => void;
  /** A device-local provider for Settings → AI model. */
  localModel?: LocalModel;
  /** Loads who answers and their model menu together; absent means nothing is connected. Null menu: no choice. */
  load?(): Promise<{ provider: Provider; menu: ModelMenu | null }>;
  /** The account's own provider, where there is an account: save or remove it, or test the saved one. Rejects with the reason. */
  own?: { save(choice: OwnChoice): Promise<unknown>; remove(): Promise<unknown>; test(): Promise<{ text: string; ms: number }> };
};

/**
 * What answers every agent. Replies may fail with a message shown to the person; proposals return pending for the
 * caller to apply according to write mode. Callers and tests read the same shared model snapshot. Saving or removing
 * the account's own provider resolves once the snapshot shows the result.
 */
export type AgentEngine = Omit<AgentAdapter, "load" | "reply"> & {
  /** Asks the adapter and returns its draft bound to send-time identities, as a Proposal or a Handoff. */
  reply(request: AgentRequest): Promise<AgentReply>;
  models: {
    getSnapshot(): ModelState;
    subscribe(listener: () => void): () => void;
    reload(): void;
    /** Loads the current menu's models and prices into the snapshot, once per load; a later load drops them. */
    loadCatalogue(): void;
  };
};

const noProvider: Provider = { using: "none", own: null };

/**
 * One model state for the active provider, shared by Settings, Profile, Details and Spend. Only the newest load may
 * publish; invalidation hides the old menu immediately. Listen and load only while someone reads it; after the last
 * reader leaves, discard the snapshot so a later reader cannot see defaults changed while nobody was listening.
 */
export function createAgentEngine(adapter: AgentAdapter, folders?: FolderSource): AgentEngine {
  const { load, own, ...engine } = adapter;
  const loading: ModelState = { status: "loading" };
  let state: ModelState = load ? loading : { status: "ready", provider: noProvider, menu: null };
  let revision = 0;
  let stop: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: ModelState) => {
    if (state === next) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const reload = async () => {
    if (!load) return;
    const current = ++revision;
    publish(state.status === "ready" ? { status: "loading", last: state.provider } : state.status === "loading" ? state : loading);
    try {
      const loaded = await load();
      if (current === revision) publish({ status: "ready", ...loaded });
    } catch (cause) {
      if (current === revision) publish({ status: "error", message: cause instanceof Error ? cause.message : "Couldn't load the model. Try again." });
    }
  };
  /** A change the account just saved shows to whoever reads now; nobody reading means the next reader loads it. */
  const changed = async (work: Promise<unknown>) => {
    await work;
    if (listeners.size) await reload();
  };
  return {
    ...engine,
    async reply(request) {
      let selected: AgentWorkspace | undefined;
      const select = () => selected ??= agentWorkspace(request);
      // A folder on one of the account's computers (D77) goes with a chat reply or a hand-off, whose job moves there for
      // its files; then this device's links wait. Handed-off work (D73) runs where no folder of this device can be read.
      const remote = request.land ? computerFolders(request.data, projectPlaces(request, select())) : [];
      const places = folders && !remote.length && !request.land?.background ? projectPlaces(request, select()) : [];
      const open = places.length ? await folders!.forReply(places) : undefined;
      // An image note is looked at here (D58); anything else read_image names is a linked folder's file.
      const pictures = select().images;
      const run = open?.folders.length || pictures.size ? async (call: ToolCall) => {
        if (call.function.name === "read_image") {
          let name: unknown;
          try { name = JSON.parse(call.function.arguments || "{}").name; } catch { /* answered below */ }
          const note = typeof name === "string" ? pictures.get(name) : undefined;
          if (note?.file) return imageForAgent(note.file);
        }
        return open?.folders.length ? open.run(call) : "No image by that name. Use one exactly as listed.";
      } : undefined;
      const { text, draft, shown, memories, used, warnings, usage, background, landed, failed, onItsWay } = await engine.reply(request,
        () => snapshotOf(request, new Date().toLocaleDateString("en-CA"), select(), remote.length ? remote : open?.folders), run);
      // Landed by the function (D73, D76): the page takes in its records, or waits for them, and binds nothing.
      if (background || landed || onItsWay) return { text: "", ...background && { background }, ...landed && { landed }, ...failed && { failed }, ...onItsWay && { onItsWay } };
      const remembered = memoriesOf(request, memories, select());
      return { text, ...draftsOf(request, [draft, shown], select()), ...remembered.length > 0 && { memories: remembered }, ...used?.length && { used },
        ...warnings?.length && { warnings }, ...usage && { usage } };
    },
    ...own && { own: { save: (choice: OwnChoice) => changed(own.save(choice)), remove: () => changed(own.remove()), test: () => own.test() } },
    models: {
      getSnapshot: () => state,
      reload: () => void reload(),
      loadCatalogue() {
        if (state.status !== "ready" || !state.menu || state.catalogue) return;
        const { menu } = state, current = revision;
        publish({ ...state, catalogue: { status: "loading" } });
        void Promise.all([menu.list().catch(() => []), menu.prices?.().catch(() => undefined)]).then(([models, prices]) => {
          if (current === revision && state.status === "ready") publish({ ...state, catalogue: { status: "ready", models, ...prices && { prices } } });
        });
      },
      subscribe(listener) {
        listeners.add(listener);
        if (listeners.size === 1 && load) {
          stop = adapter.subscribe?.(() => void reload());
          void reload();
        }
        return () => {
          listeners.delete(listener);
          if (!listeners.size) {
            stop?.();
            revision++;
            if (load) state = loading;
          }
        };
      },
    },
  };
}

const openers = ["", "Right. ", "", "Happy to help! ", "Hi there! "];
const closers = ["", "", "", " Hope that helps.", " You've got this 🌱"];
/**
 * Says `core` in the agent's voice. Warmth adds a greeting and a send-off; detail is how many of `more` follow
 * (0 none, 2 the usual, 3 all), so default agents sound as they always did.
 */
export function inVoice(agent: Pick<Agent, "warmth" | "detail">, core: string, more: string[] = [], sendOff = true) {
  const warmth = agent.warmth ?? 2;
  return openers[warmth] + [core, ...more.slice(0, agent.detail ?? 2)].join(" ") + (sendOff ? closers[warmth] : "");
}

/**
 * How the agent's Personality settings sound, for the preview beside the sliders: a fixed line about its open tasks
 * in its voice (its own warmth and detail, else every agent's). Not a reply; replies come from the model.
 */
export function tonePreview(own: Agent, data: WorkspaceData) {
  const agent = { ...own, ...toneOf(own, data.everyAgent) };
  const scope = scopeOf(data, agent.id);
  const open = data.tasks.filter((task) => !task.done && sees(scope, task));
  const where = scope.all ? "your workspace" : [...scope.domains, ...data.projects.filter((p) => scope.projects.has(p.id) && !scope.domains.has(p.area)).map((p) => p.title)].join(", ");
  const lead = agent.role ? `As ${agent.role.toLocaleLowerCase()}: ` : "";
  if (!where) return inVoice(agent, `${lead}I'm not assigned anywhere yet.`, ["Attach a note, or put me on a domain or project, and I'll get to work."]);
  if (!canUse(agent, "see-tasks")) return toolOff(agent, "see-tasks");
  return open.length
    ? inVoice(agent, `${lead}there ${open.length === 1 ? "is 1 open task" : `are ${open.length} open tasks`} in ${where}.`,
      [`I'd start with “${open[0].title}”.`, "Ask for next steps and I'll pull more from your notes.",
        ...open.length > 1 ? [`After that: ${open.slice(1, 4).map((task) => `“${task.title}”`).join(", ")}.`] : []])
    : inVoice(agent, `${lead}nothing open in ${where}.`, ["A good moment to write down what's next."]);
}

/**
 * The engine when no model can answer: signed out with nothing connected on this device. Every reply says how to
 * connect one, and routines wait (`offline`).
 */
export const offlineEngine: AgentAdapter = {
  about: () => ({ badge: "Not connected", offline: true }),
  reply: () => Promise.reject(new Error("No AI model is connected. Sign in from Settings → Account, or pick a provider in Settings → AI model.")),
};
