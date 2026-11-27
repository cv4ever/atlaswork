// Settings → AI model → Spend by agent (agents-design D45): each agent's last 30 days of measured replies, priced
// where the provider in use lists prices for the model that answered.
import { formatNumber } from "./dates.ts";
import type { WorkspaceData } from "./model.ts";
import { useCatalogue, useModelState } from "./modelMenu.ts";
import type { ModelSource } from "./modelMenu.ts";
import { spendByAgent } from "./spend.ts";

const days = 30;
const tokens = (count: number) => formatNumber(count, { notation: "compact", maximumFractionDigits: 1 });
const dollars = (amount: number) => formatNumber(amount, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumSignificantDigits: 2 });

export function AgentSpend({ data, engine, now }: { data: WorkspaceData; engine: ModelSource; now: number }) {
  const state = useModelState(engine);
  const menu = state.status === "ready" ? state.menu : null;
  // Prices come with the provider's model state, so a newer provider never prices with an older one's list.
  const byModel = useCatalogue(engine, state, !!menu?.prices)?.prices;
  const prices = menu && byModel ? { source: menu.source, byModel } : undefined;
  const rows = spendByAgent(data, new Date(now - days * 864e5).toISOString(), prices);
  if (!rows.length) return null;
  return (
    <section className="settings-group agent-spend" aria-labelledby="agent-spend-title">
      <h4 id="agent-spend-title">Spend by agent <small>last {days} days</small></h4>
      {state.status === "loading" && <p className="own-model-note" role="status">Loading the current provider's model…</p>}
      {state.status === "error" && <p className="field-error" role="alert">{state.message}{" "}
        <button type="button" className="text-button" onClick={engine.models.reload}>Retry</button></p>}
      <table>
        <thead><tr><th scope="col">Agent</th><th scope="col">Replies</th><th scope="col">Tokens in</th><th scope="col">Out</th><th scope="col">Cost</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agent.id}>
              <th scope="row">{row.agent.name}</th>
              <td>{row.replies}</td>
              <td>{tokens(row.input)}</td>
              <td>{tokens(row.output)}</td>
              <td title={row.priced < row.replies ? `${row.priced} of ${row.replies} replies priced` : undefined}>
                {row.priced ? `${dollars(row.cost)}${row.priced < row.replies ? "+" : ""}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="own-model-note">{prices ? `Costs use ${menu!.label}'s list prices for replies on its models; a + means some replies had no price.`
        : "Costs show where the provider lists prices (OpenRouter). Atlaswork's model is part of your plan; a ChatGPT plan counts against its own limits."}</p>
    </section>
  );
}
