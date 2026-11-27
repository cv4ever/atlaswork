// What each agent's replies and routine posts cost over a window (agents-design D45): tokens from every measured
// message, and dollars where the provider in use lists a price for the model that answered (spend.test.ts).
import { atlasId } from "./model.ts";
import type { Agent, WorkspaceData } from "./model.ts";

/** Dollars per million tokens in and out, by model id, for the models of one catalogue (`source`). */
export type Prices = { source: string; byModel: Record<string, { input: number; output: number }> };
/**
 * One agent's measured replies since the window opened. `cost` sums the replies `prices` cover, `priced` counts them;
 * the rest (Atlaswork's hosted model, another provider, models it doesn't list) count tokens only.
 */
export type AgentSpend = { agent: Agent; replies: number; input: number; output: number; priced: number; cost: number };

/** Agents with measured replies since `since` (ISO), most tokens first. Messages from before a model was recorded count as unpriced. */
export function spendByAgent(data: WorkspaceData, since: string, prices?: Prices): AgentSpend[] {
  const rows = new Map<string, AgentSpend>();
  for (const thread of data.threads) for (const message of thread.messages) {
    if (message.role !== "agent" || !message.usage || !message.at || message.at < since) continue;
    const agent = data.agents.find((item) => item.id === (message.agentId ?? atlasId));
    if (!agent) continue;
    const row = rows.get(agent.id) ?? { agent, replies: 0, input: 0, output: 0, priced: 0, cost: 0 };
    const { input, output, model } = message.usage;
    row.replies++;
    row.input += input;
    row.output += output;
    const price = prices && model?.source === prices.source ? prices.byModel[model.id] : undefined;
    if (price) {
      row.priced++;
      row.cost += (input * price.input + output * price.output) / 1e6;
    }
    rows.set(agent.id, row);
  }
  return [...rows.values()].sort((a, b) => b.input + b.output - (a.input + a.output));
}
