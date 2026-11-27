// A new agent starts here (D57): say what you need and Atlas drafts someone, pick a ready-made agent, or start blank.
import { useState } from "react";
import { usePortraitSrc } from "../crewStyle.ts";
import Dialog from "../Dialog.tsx";
import type { Domain, Project, WorkspaceData } from "../model.ts";
import ReadyMadeAgents from "../ReadyMadeAgents.tsx";
import { startFrom } from "../suggestedAgents.ts";
import type { AgentDraft } from "../ui.ts";

export function DescribeAgent({ draft, data, domains, onDraft, onAskAtlas, onClose }: {
  draft: AgentDraft;
  data: WorkspaceData;
  domains: (Domain & { projects: Project[] })[];
  onDraft: (draft: AgentDraft) => void;
  /** Hands what you need to Atlas, who drafts the agent in his chat. */
  onAskAtlas?: (goal: string) => void;
  onClose: () => void;
}) {
  const portraitSrc = usePortraitSrc();
  const [goal, setGoal] = useState("");
  return (
    <Dialog className="agent-describe-dialog" title="A new agent" onClose={onClose}>
      <form className="agent-describe" onSubmit={(event) => { event.preventDefault(); if (goal.trim()) onAskAtlas?.(goal); }}>
        <label className="agent-describe-ask" htmlFor="agent-goal"><img src={portraitSrc({ portrait: "atlas" })} alt="" />What do you need help with?</label>
        <textarea id="agent-goal" rows={4} maxLength={600} value={goal} onChange={(event) => setGoal(event.target.value)}
          placeholder="Helping my kids with homework: explaining what they're stuck on, and what's due when." />
        <p className="agent-hint">Atlas suggests someone: an agent you already have, a ready-made one, or a new one. Nobody joins until you save them.</p>
        <div className="form-actions">
          <button type="button" className="text-button" onClick={() => onDraft({ ...draft, describe: undefined })}>Start blank</button>
          <button className="primary-button" type="submit" disabled={!goal.trim() || !onAskAtlas}>Ask Atlas</button>
        </div>
      </form>
      <ReadyMadeAgents data={data} domains={domains}
        onPick={(suggestion) => onDraft({ ...draft, describe: undefined, ...startFrom(data, draft, suggestion) })} />
    </Dialog>
  );
}
