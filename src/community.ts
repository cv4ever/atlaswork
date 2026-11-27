// Agents shared with the community (agents-design D34): browse without an account through the public table, share and
// unshare your own through the account. Only configuration travels: name, face, role, instructions, write mode, tools.
import { account, backend } from "./account.ts";
import { agentTools } from "./model.ts";
import { portraits } from "./look.ts";
import type { Agent, ToolId } from "./model.ts";

/** One shared configuration, as the table stores it. */
export type SharedAgent = {
  id: string; name: string; portrait: string; role: string; instructions: string;
  write_mode: Agent["writeMode"]; tools: Partial<Record<ToolId, boolean>>;
};

/** The newest shared agents; an empty list when this build has no backend or the request fails. */
export async function browseShared(limit = 24): Promise<SharedAgent[]> {
  if (!backend) return [];
  try {
    const response = await fetch(`${backend.url}/rest/v1/shared_agents?select=id,name,portrait,role,instructions,write_mode,tools&order=created_at.desc&limit=${limit}`,
      { headers: { apikey: backend.key } });
    if (!response.ok) return [];
    const rows = await response.json() as SharedAgent[];
    // Only this build's faces and tools apply; anything else from the table is dropped, not trusted.
    return rows.filter((row) => portraits.includes(row.portrait) && (row.write_mode === "full" || row.write_mode === "propose"))
      .map((row) => ({ ...row, tools: Object.fromEntries(Object.entries(row.tools ?? {}).filter(([id, on]) => id in agentTools && typeof on === "boolean")) }));
  } catch { return []; }
}

/** What becomes a workspace Agent: the shared fields with a fresh id. Nothing from the sharer's workspace comes along. */
export const agentFromShared = (shared: SharedAgent): Omit<Agent, "archived" | "restore"> => ({
  id: crypto.randomUUID(), name: shared.name, portrait: shared.portrait, role: shared.role, instructions: shared.instructions,
  writeMode: shared.write_mode, ...(Object.keys(shared.tools).length && { tools: shared.tools }),
});

export const shareAgent = (agent: Agent) => account!.rpc("share_agent", {
  source_agent: agent.id, name: agent.name.slice(0, 40), portrait: agent.portrait, role: agent.role.slice(0, 80),
  instructions: agent.instructions.slice(0, 2000), write_mode: agent.writeMode, tools: agent.tools ?? {} });
export const unshareAgent = (agent: Agent) => account!.rpc("unshare_agent", { source_agent: agent.id });
/** The ids of the signed-in account's shared agents. */
export const mySharedAgents = () => account!.rpc("my_shared_agents", {}) as Promise<string[]>;
