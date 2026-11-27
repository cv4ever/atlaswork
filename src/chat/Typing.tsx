// The typing indicator at the foot of the transcript (agents-design D81): who is replying, the steps the reply already
// took ticked and small, and the one it's on beside the dots, each with its tool's icon (Google Calendar's own mark).
import { Check } from "lucide-react";
import { usePortraitSrc } from "../crewStyle.ts";
import type { Agent } from "../model.ts";
import type { Step } from "../room/types.ts";
import { SourceIcon } from "./SourceIcon.tsx";
import { sourceKind } from "./sources.ts";

const StepIcon = ({ step }: { step: Step }) => {
  const kind = sourceKind(step.tool);
  return kind ? <SourceIcon kind={kind} /> : null;
};

export function Typing({ agent, room, steps }: { agent: Agent; room: boolean; steps?: Step[] }) {
  const portraitSrc = usePortraitSrc();
  const current = steps?.at(-1);
  return (
    <div className={`chat-message agent typing${room ? " gutter" : ""}`} aria-label={current ? `${agent.name}: ${current.text}` : `${agent.name} is writing`}>
      {room && <div className="message-speaker"><img src={portraitSrc(agent)} alt="" />{agent.name}</div>}
      {steps && steps.length > 1 && (
        <ol className="typing-done" aria-label="Done so far">
          {steps.slice(0, -1).map((step, index) => <li key={index}><Check size={12} aria-hidden="true" /><StepIcon step={step} />{step.text}</li>)}
        </ol>
      )}
      <p><i /><i /><i />{current && <span className="typing-step" role="status"><StepIcon step={current} />{current.text}…</span>}</p>
    </div>
  );
}
