// Who gets a live reply, on which models and under which daily cap (launch plan D15, D16). Every call to the usage
// database goes through here; index.ts adds HTTP and identity. No Deno APIs here.
import { background, caps, refusals } from "./caps.ts";
import { ownProvider, sourceOf } from "./provider.ts";
import type { Snapshot } from "./logic.ts";
import type { OwnModel, Provider } from "./provider.ts";

/** Calls a usage function in Postgres with the service role (index.ts: PostgREST; tests: a fake). */
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export type Admitted = { providers: Provider[]; own?: OwnModel };
export type Refused = { status: number; error: string };

/** What the function says when the account's database can't be reached. */
export const unavailable: Refused = { status: 503, error: "Live agents are unavailable right now. Try again in a moment." };

/** `ours` are the hosted providers in fallback order; a connected own model replaces them and pays its own way. */
export function createAdmission(rpc: Rpc, ours: Provider[]) {
  return {
    /**
     * Starts a reply, the profile's "Test" of the customer's own model, which counts like one, or work handed off to
     * the background (D73), which counts as `background.replies`.
     */
    async admit(user: string, kind: "reply" | "test" | "background"): Promise<Admitted | Refused> {
      try {
        const own = await rpc("model_key_for", { p_user: user }) as OwnModel | null;
        if (kind === "test" && !own) return { status: 400, error: "Connect a model first." };
        // Own models skip the plan, the shared budget and its per-user share; only a looser cap (ownReplies) guards our function.
        const cap = own ? caps.ownReplies : caps.replies;
        const count = kind === "background" ? background.replies : 1;
        const verdict = await rpc("begin_agent_reply", { p_user: user, p_replies: cap, p_neurons: caps.neurons, p_own: !!own, p_user_neurons: caps.userNeurons,
          ...count > 1 && { p_count: count } });
        if (verdict === "plan") return { status: 403, error: refusals.plan };
        if (verdict === "user" && count > 1) return { status: 429, error: refusals.background(count) };
        if (verdict === "user") return { status: 429, error: refusals.replies(cap) };
        if (verdict === "share") return { status: 429, error: refusals.share };
        if (verdict === "budget") return { status: 429, error: "Live agents have used today's shared budget. They reset at 00:00 UTC." };
        if (verdict !== "ok") return unavailable;
        return own ? { providers: [ownProvider(own)], own } : { providers: ours };
      } catch (cause) {
        console.error(`admission: ${String(cause)}`);
        return unavailable;
      }
    },
    /**
     * Continues a reply that paused for file tools (D47) without counting another: claims the resume token's nonce
     * once, so a replayed token is refused, and answers on the same providers as the reply it continues.
     */
    async resume(user: string, nonce: string): Promise<Admitted | Refused> {
      try {
        if (await rpc("claim_agent_resume", { p_user: user, p_nonce: nonce }) !== true) return { status: 409, error: "This reply already continued. Ask again." };
        const own = await rpc("model_key_for", { p_user: user }) as OwnModel | null;
        return own ? { providers: [ownProvider(own)], own } : { providers: ours };
      } catch (cause) {
        console.error(`admission: ${String(cause)}`);
        return unavailable;
      }
    },
    /**
     * Lets a long job's next run go on (D76) without counting another reply: its one admission covered the job. It
     * still stops when the plan ended or the shared budget or the account's share is used up, as a reply would.
     */
    async carry(user: string): Promise<Admitted | Refused> {
      try {
        const own = await rpc("model_key_for", { p_user: user }) as OwnModel | null;
        const verdict = await rpc("may_continue_agent", { p_user: user, p_neurons: caps.neurons, p_own: !!own, p_user_neurons: caps.userNeurons });
        if (verdict === "plan") return { status: 403, error: refusals.plan };
        if (verdict === "share") return { status: 429, error: refusals.share };
        if (verdict === "budget") return { status: 429, error: "Live agents have used today's shared budget. They reset at 00:00 UTC." };
        if (verdict !== "ok") return unavailable;
        return own ? { providers: [ownProvider(own)], own } : { providers: ours };
      } catch (cause) {
        console.error(`admission: ${String(cause)}`);
        return unavailable;
      }
    },
    /**
     * Counts what a reply spent, including one that failed part-way: Neurons, and the tokens it read (the cached part
     * apart) and wrote (D66, D67), and whether a fallback stood in for our first provider (`stoodIn`). Never throws.
     */
    record: (user: string, neurons: number, spent: { input: number; cached: number; output: number } = { input: 0, cached: 0, output: 0 }, stoodIn = false) =>
      rpc("record_agent_neurons", { p_user: user, p_neurons: Math.ceil(neurons), p_input: spent.input, p_cached: spent.cached, p_output: spent.output, p_stood_in: stoodIn })
        .then(() => undefined, (cause) => console.error(String(cause))),
  };
}

/**
 * Who answers one agent (agents-design D44): on the account's own provider, the agent's own model when it comes from
 * that provider's catalogue, and its own thinking effort when set; otherwise the account's. Our hosted model offers
 * no choice, so it's the admitted providers.
 */
export function providersFor(admitted: Admitted, choice: Pick<Snapshot, "model" | "effort">): Provider[] {
  const { own } = admitted;
  if (!own) return admitted.providers;
  return [ownProvider({ ...own, model: choice.model?.source === sourceOf(own) ? choice.model.id : own.model, effort: choice.effort ?? own.effort })];
}
/** The catalogue a reply's model came from, for what the browser records (agents-design D45): ours, or the account's own. */
export const sourceFor = (admitted: Admitted) => admitted.own ? sourceOf(admitted.own) : "atlaswork";
/** Whether a call on our hosted providers was answered by a fallback (Groq) because the first (Workers AI) refused. */
export const standsIn = (admitted: Admitted, model: string | undefined) => !admitted.own && !!model && model !== admitted.providers[0]?.model;
