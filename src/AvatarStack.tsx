import type { CSSProperties } from "react";
import { usePortraitSrc } from "./crewStyle.ts";
import { portraitSrc } from "./look.ts";
import type { CrewStyle } from "./look.ts";
import type { Agent } from "./model.ts";

/**
 * Overlapping portraits: one agent, or a room's crew, in the crew's style; `drawn` draws another style (Settings'
 * Crew style cards). Styles: `src/styles/agents.css`.
 */
export function AvatarStack({ agents, size = 28, drawn }: { agents: Pick<Agent, "id" | "portrait">[]; size?: number; drawn?: CrewStyle }) {
  const crewSrc = usePortraitSrc();
  const src = (agent: Pick<Agent, "portrait">) => drawn ? portraitSrc(agent, drawn) : crewSrc(agent);
  return (
    <span className="avatar-stack" style={{ "--size": `${size}px` } as CSSProperties} aria-hidden="true">
      {agents.slice(0, 3).map((agent) => <img key={agent.id} src={src(agent)} alt="" />)}
    </span>
  );
}
