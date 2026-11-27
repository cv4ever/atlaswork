// The composer's context meter (D28, D29): the fullest member's window as a gauge and a percentage. It opens to everything
// about the chat that isn't a message: every member's window and this conversation's tokens, the model that answers
// (Manage usage, or today's replies on Atlaswork's model), and how the crew writes. All numbers are the provider's counts.
import { ExternalLink } from "lucide-react";
import type { ContextUse } from "../agents.ts";
import type { EngineInfo } from "../atlas.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import type { Agent, Thread } from "../model.ts";
import { Tip } from "../Popups.tsx";
import { caps } from "../../supabase/functions/agent/caps.ts";
import { clock } from "./format.ts";

const kTokens = (value: number) => value >= 9500 ? `${Math.round(value / 1000)}k` : `${(value / 1000).toFixed(1)}k`;
/** How full a member's context window is, in whole percent. */
export const percentOf = (use: ContextUse) => Math.min(100, Math.round((use.last / use.limit) * 100));
function Gauge({ use }: { use: ContextUse }) {
  return <span className="gauge-bar" aria-hidden="true"><i className="seg-session" style={{ width: `${percentOf(use)}%` }} /></span>;
}

export function ContextMeter({ usage, sessionStart, thread, engine, allowance, onModel, writeMode }: { usage: { agent: Agent; use: ContextUse }[];
  sessionStart: number; thread: Thread; engine: EngineInfo; allowance?: { used: number; cap: number; resets: string; near: boolean };
  onModel?: () => void; writeMode: string }) {
  const portraitSrc = usePortraitSrc();
  const measured = usage.some((seat) => seat.use.replies > seat.use.unmeasured);
  const fullest = usage.length ? usage.reduce((top, seat) => percentOf(seat.use) > percentOf(top.use) ? seat : top) : undefined;
  const percent = measured && fullest ? percentOf(fullest.use) : 0;
  const session = usage.reduce((sum, seat) => sum + seat.use.sessionIn + seat.use.sessionOut, 0);
  const total = usage.reduce((sum, seat) => sum + seat.use.totalIn + seat.use.totalOut, 0);
  const replies = usage.reduce((sum, seat) => sum + seat.use.replies, 0);
  const unmeasured = usage.reduce((sum, seat) => sum + seat.use.unmeasured, 0);
  const inSession = thread.messages.length - sessionStart;
  const started = thread.messages[sessionStart]?.at;
  return (
    <>
      <Tip label="Context, model and how they write"><button type="button" className="context-meter" data-crowded={percent >= 80 || undefined} data-near={allowance?.near || undefined} popoverTarget="context-meter" aria-label={measured && fullest ? `Context: ${fullest.agent.name} ${percent}% full, ${kTokens(session)} tokens this conversation` : "Context and model"}>
      <span className="gauge-bar" aria-hidden="true"><i className="seg-session" style={{ width: `${percent}%` }} /></span>
      {measured ? <><b>{percent}%</b> context</> : "Context"}
            </button></Tip>
      <div id="context-meter" popover="auto" className="context-panel" aria-label="Context and model">
        <p className="context-head"><b>Context windows</b>
          <small>{inSession ? `${inSession} ${inSession === 1 ? "message" : "messages"} this conversation${started ? `, since ${clock(started)}` : ""}` : "Fresh conversation"}</small></p>
        {measured ? <>
          {usage.map(({ agent, use }) => (
            <div key={agent.id} className="context-agent" data-crowded={percentOf(use) >= 80 || undefined}>
              <img src={portraitSrc(agent)} alt="" /><b>{agent.name}</b><span>{percentOf(use)}%</span>
              <Gauge use={use} />
              <small>Last reply read {kTokens(use.last)} of {kTokens(use.limit)} ·{" "}
                {kTokens(use.sessionIn)} in, {kTokens(use.sessionOut)} out this conversation</small>
            </div>
          ))}
          <p className="context-foot">{kTokens(total)} tokens across {replies} {replies === 1 ? "reply" : "replies"} in this chat, as the provider counted them.
            {unmeasured ? ` ${unmeasured} older ${unmeasured === 1 ? "reply wasn't" : "replies weren't"} measured.` : ""} Windows differ by model; 128k is common.</p>
        </> : <p className="context-foot">No replies measured yet. Each reply's tokens show here once an agent answers.</p>}
        {percent >= 80 && fullest && <p className="context-warn">{fullest.agent.name} is nearly full. Start a new conversation; the Logbook keeps this one.</p>}
        <p className="context-foot context-row">
          <span>{engine.offline ? "No AI model is connected" : `Answers through ${engine.badge}`}</span>
          {engine.manage ? <a href={engine.manage.href} target="_blank" rel="noreferrer"><ExternalLink size={12} /> {engine.manage.label}</a>
            : onModel && <button type="button" className="text-button" onClick={onModel}>{engine.offline ? "Connect a model" : "Change"}</button>}
        </p>
        {allowance && <p className="context-foot context-row" data-near={allowance.near || undefined}
          title={`${allowance.cap} live replies a day for every agent together. A model of your own answers up to ${caps.ownReplies} a day, billed by your provider.`}>
          <span>{allowance.used} of {allowance.cap} replies today, reset {allowance.resets}</span>
        </p>}
        <p className="context-foot">{writeMode}</p>
      </div>
    </>
  );
}
