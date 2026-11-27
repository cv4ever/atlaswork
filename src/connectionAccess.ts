// What Settings → Connections says about each agent's Google Calendar access beyond its rung (agents-design D83): when
// it last read the calendar, and a first setup to suggest right after you connect. Pure, so connectionAccess.test.ts
// covers it; src/settings/ConnectionsSection.tsx draws it.
import { atlasId, calendarAccess } from "./model.ts";
import type { CalendarLevel, WorkspaceData } from "./model.ts";
import { placesOf } from "./workspace.ts";

/**
 * When each agent last read Google Calendar (ISO), from the sources its replies keep (D81): a read that failed doesn't
 * count, and an agent that never read it has no entry.
 */
export function calendarReads(data: WorkspaceData): Map<string, string> {
  const last = new Map<string, string>();
  for (const thread of data.threads) for (const message of thread.messages) {
    if (message.role !== "agent" || !message.at
      || !message.used?.some((use) => (use.tool === "read_calendar" || use.tool === "free_time") && !use.failed)) continue;
    const id = message.agentId ?? atlasId;
    if ((last.get(id) ?? "") < message.at) last.set(id, message.at);
  }
  return last;
}

/** A rung to suggest for one agent, with why in a few words. */
export type Suggestion = { agentId: string; level: Exclude<CalendarLevel, "off">; why: string };

const close = /family|home|house|kids|partner|friends|social|people/i;

/**
 * A first setup once you connect (D83), while no agent but Atlas has any access: an agent that looks after people at
 * home reads your events, so it knows the family's plans; any other agent that looks after a domain sees your free
 * time, to fit its tasks around your day. Agents looking after nothing stay off.
 */
export function suggestedAccess(data: WorkspaceData): Suggestion[] {
  const crew = data.agents.filter((agent) => !agent.archived && agent.id !== atlasId);
  if (crew.some((agent) => calendarAccess(agent).level !== "off")) return [];
  return crew.flatMap((agent): Suggestion[] => {
    const domains = placesOf(data, agent.id).domains;
    if (!domains.length) return [];
    const home = domains.find((domain) => close.test(domain)) ?? (close.test(agent.role) ? domains[0] : undefined);
    return [home ? { agentId: agent.id, level: "events", why: `Looks after ${home}: sees the plans in your calendar` }
      : { agentId: agent.id, level: "free", why: `Looks after ${domains.join(" and ")}: fits its tasks around your day` }];
  });
}
