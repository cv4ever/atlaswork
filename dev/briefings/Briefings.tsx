// Dev only: every agent in this workspace side by side with what each model call carries (agents-design D46). The
// Agents page shows it as a third tab on the dev server; production builds drop it (`import.meta.env.DEV` in
// src/AgentsPage.tsx, `scripts/check-bundle.mjs`). It builds each briefing with the functions a live reply uses
// (`snapshotOf`, `promptParts`, `toolsFor`), so it can't drift from what's sent, and counts four characters a token, as
// the admin page does. Configure opens the agent dialog; the admin page (/dev/admin/) edits what every agent shares.
import { Fragment, useState } from "react";
import { gatesOf, promptParts, toolsFor } from "../../supabase/functions/agent/logic.ts";
import type { PromptSource } from "../../supabase/functions/agent/logic.ts";
import { snapshotOf } from "../../src/agentRequest.ts";
import { agentWorkspace } from "../../src/agentWorkspace.ts";
import { agentTools, canUse, routineKinds } from "../../src/model.ts";
import { portraitSrc } from "../../src/look.ts";
import { locale } from "../../src/dates.ts";
import type { Agent, ToolId, WorkspaceData } from "../../src/model.ts";
import * as routines from "../../src/routines.ts";
import "./briefings.css";

const sources: [PromptSource, string][] = [["agent", "Profile"], ["every", "Every agent"], ["you", "You"], ["memory", "Memory"],
  ["tools", "Commands"], ["workspace", "Workspace"], ["atlaswork", "Ground rules"]];
const tokens = (text: string) => Math.ceil(text.length / 4);
const number = new Intl.NumberFormat(locale);
type ToolDef = { function: { name: string; description: string } };

export default function Briefings({ data, person, today, onEdit }: {
  data: WorkspaceData;
  person: { name: string; about: string };
  /** YYYY-MM-DD, as a reply sends it. */
  today: string;
  onEdit: (agent: Agent) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = data.agents.filter((agent) => !agent.archived).map((agent) => {
    const request = { agent, data, person, request: "" };
    const snapshot = snapshotOf(request, today, agentWorkspace(request));
    const parts = promptParts(snapshot);
    // A command with `after` (D57, D61) is offered only once its read tool ran, so a first call carries that tool alone.
    const gated = gatesOf(snapshot);
    const tools = (toolsFor(snapshot) as ToolDef[]).map(({ function: tool }) => ({ ...tool, size: tokens(JSON.stringify(tool)), later: gated.has(tool.name) }));
    const bySource = new Map(sources.map(([source]) => [source, parts.filter((part) => part.from === source).reduce((sum, part) => sum + tokens(part.text), 0)]));
    const prompt = tokens(parts.map((part) => part.text).join("\n"));
    const toolSize = tools.filter((tool) => !tool.later).reduce((sum, tool) => sum + tool.size, 0);
    const runs = routines.routinesOf(data).filter(({ owner }) => routines.runnerOf(data, owner).id === agent.id);
    return { agent, snapshot, parts, tools, bySource, prompt, toolSize, runs };
  });
  const heaviest = Math.max(1, ...rows.map((row) => row.prompt + row.toolSize));
  return (
    <div className="briefings">
      <p className="briefings-note">Dev only. What every agent reads before your message, measured on this workspace, at about four characters a token.
        Shared wording lives on the <a href="/dev/admin/">admin page</a>.</p>
      <table className="briefings-table">
        <thead>
          <tr><th scope="col">Agent</th><th scope="col">Calls carry</th>{sources.map(([source, label]) => <th key={source} scope="col" className="briefings-num">{label}</th>)}
            <th scope="col" className="briefings-num">Tools</th><th scope="col">Can</th></tr>
        </thead>
        <tbody>
          {rows.map(({ agent, snapshot, parts, tools, bySource, prompt, toolSize, runs }) => {
            const shown = open === agent.id;
            const on = (Object.keys(agentTools) as ToolId[]).filter((id) => canUse(agent, id));
            return (
              <Fragment key={agent.id}>
                <tr className="briefings-row" data-open={shown || undefined}>
                  <th scope="row">
                    <button type="button" className="briefings-who" onClick={() => setOpen(shown ? null : agent.id)} aria-expanded={shown}>
                      <img src={portraitSrc(agent)} alt="" /><span><strong>{agent.name}</strong><small>{agent.role || "No role"}</small></span>
                    </button>
                  </th>
                  <td>
                    <span className="briefings-total">{number.format(prompt + toolSize)}</span>
                    <span className="briefings-bar" aria-hidden="true"><i style={{ inlineSize: `${(prompt / heaviest) * 100}%` }} /><b style={{ inlineSize: `${(toolSize / heaviest) * 100}%` }} /></span>
                  </td>
                  {sources.map(([source]) => <td key={source} className="briefings-num">{bySource.get(source) ? number.format(bySource.get(source)!) : "·"}</td>)}
                  <td className="briefings-num" title={tools.some((tool) => tool.later) ? `Offered after their lookup: ${tools.filter((tool) => tool.later).map((tool) => `${tool.name} (${number.format(tool.size)})`).join(", ")}` : undefined}>
                    {number.format(toolSize)}<small>{tools.filter((tool) => !tool.later).length}{tools.some((tool) => tool.later) ? ` +${tools.filter((tool) => tool.later).length} later` : ""}</small></td>
                  <td className="briefings-can" title={snapshot.commands.map((command) => command.name).join(", ")}>{snapshot.commands.length ? `${snapshot.commands.length} commands` : "Read only"}</td>
                </tr>
                {shown && (
                  <tr className="briefings-detail">
                    <td colSpan={sources.length + 4}>
                      <div className="briefings-meta">
                        <span>{snapshot.places.length ? `Places: ${snapshot.places.join("; ")}` : "No places"}</span>
                        <span>{agent.writeMode === "full" ? "Proactive" : "Asks first"}</span>
                        <span>Model: {agent.model ? `${agent.model.id} (${agent.model.source})` : "the provider's default"}{agent.effort ? `, thinking ${agent.effort}` : ""}</span>
                        <span>Tools on: {on.map((id) => agentTools[id].label).join(", ") || "none"}</span>
                        <span>Routines: {runs.map(({ routine }) => routineKinds[routine.kind].label).join(", ") || "none"}</span>
                        <span>Commands: {snapshot.commands.map((command) => command.name).join(", ") || "none"}</span>
                        <button type="button" className="quiet-button" onClick={() => onEdit(agent)}>Configure</button>
                      </div>
                      <div className="briefings-columns">
                        <ol className="briefings-prompt">{parts.map((part, index) => (
                          <li key={index} data-from={part.from}><span>{sources.find(([source]) => source === part.from)?.[1]} · {number.format(tokens(part.text))}</span>{part.text}</li>
                        ))}</ol>
                        <ul className="briefings-tools">{tools.map((tool) => (
                          <li key={tool.name}><strong>{tool.name}{tool.later ? " (after its lookup)" : ""}</strong><span>{number.format(tool.size)}</span><small>{tool.description}</small></li>
                        ))}</ul>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
