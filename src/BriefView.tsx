// A place's brief on screen (agents-design D40; what it says comes from brief.ts): the first morning's guide head
// with the agent's face, a title, one line and one action, or a new project's welcome with its tips. `BriefNote` is the
// dismissed brief, a speech icon whose words are its tooltip, or a hushed one while the chat panel already shows that
// agent. `onState` takes a patch: `seen` stays on this device (Session.briefs), the rest is the place's BriefMark in
// the workspace, so every device agrees.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { MessageSquareText, X } from "lucide-react";
import type { Brief, BriefAction, BriefState } from "./brief.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { useTyped } from "./useTyped.ts";
import { Tip } from "./Popups.tsx";

/** The bubble, keyed by the brief so a new one types in. A welcome closes with Got it; any other with Not now. */
export function BriefBubble({ brief, state, onState, onAct }: {
  brief: Brief; state: BriefState; onState: (patch: BriefState) => void; onAct: (action: BriefAction) => void }) {
  const welcome = brief.kind === "welcome";
  return <Bubble key={brief.key} brief={brief} fresh={brief.key !== state.seen} onSeen={() => onState({ seen: brief.key })}
    onDismiss={() => onState(welcome ? { welcomed: true } : { dismissed: brief.key })}
    onAct={(action) => { if (welcome) onState({ welcomed: true }); onAct(action); }} />;
}

/**
 * A brief that isn't a bubble: a speech icon among the page's actions, the words as its tooltip. Dismissed, pressing
 * it brings the bubble back; hushed (its agent is in the open chat), it only says what the bubble would.
 */
export function BriefNote({ brief, hushed = false, onState }: { brief: Brief; hushed?: boolean; onState: (patch: BriefState) => void }) {
  const words = `${brief.agent.name}: ${brief.title}. ${brief.line}`;
  if (hushed) return <span className="icon-button brief-note" role="img" title={words} aria-label={words}><MessageSquareText size={18} /></span>;
  return (
    <Tip label={words}><button className="icon-button brief-note" aria-label={`Show ${brief.agent.name}'s note: ${brief.title}`} onClick={() => onState({ dismissed: undefined })}>
    <MessageSquareText size={18} />
        </button></Tip>
  );
}

/**
 * One polite live region for the whole page, made once and kept, so a screen reader hears a new brief's agent and
 * title once. A region added together with its words is often not read, hence the frame between.
 */
let region: HTMLElement | undefined;
function announce(text: string) {
  if (!region) {
    region = document.body.appendChild(Object.assign(document.createElement("div"), { className: "sr-only" }));
    region.setAttribute("aria-live", "polite");
  }
  const target = region;
  target.textContent = "";
  requestAnimationFrame(() => { target.textContent = text; });
}

/** The face and the bubble; the line types in, the bubble pops, and a screen reader hears it, only the first time this brief shows. */
function Bubble({ brief, fresh, onSeen, onDismiss, onAct }: {
  brief: Brief; fresh: boolean; onSeen: () => void; onDismiss: () => void; onAct: (action: BriefAction) => void }) {
  const portraitSrc = usePortraitSrc();
  const [animate] = useState(fresh);
  const typed = useTyped(brief.line, animate);
  // Shown once is seen: the next visit shows the same line whole and says nothing. Mounts once per key.
  useEffect(() => {
    if (!fresh) return;
    onSeen();
    announce(`${brief.agent.name}: ${brief.title}. ${brief.line}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount: each brief key mounts its own Bubble
  }, []);
  const welcome = !!brief.tips;
  const action = <button className="secondary-button brief-action" onClick={() => onAct(brief.action)}>{brief.action.label}</button>;
  return (
    <section className={`guide-head project-brief${animate ? " is-fresh" : ""}${welcome ? " is-welcome" : ""}`} aria-label={`${brief.agent.name} on this page`}>
      <span className="guide-face"><img src={portraitSrc(brief.agent)} alt="" /></span>
      <div className="guide-bubble">
        <div>
          <strong>{brief.title}</strong>
          <p aria-label={brief.line}>{typed}<span className="guide-caret" aria-hidden="true" hidden={typed.length >= brief.line.length} /></p>
          {welcome && (
            <ol className="brief-tips" hidden={typed.length < brief.line.length}>
              {brief.tips!.map((tip, i) => <li key={tip} style={{ "--i": i } as CSSProperties}>{tip}</li>)}
            </ol>
          )}
        </div>
        {welcome ? (
          <div className="brief-actions">{action}<button className="text-button" onClick={onDismiss}>Got it</button></div>
        ) : (
          <>{action}<Tip label="Not now"><button className="icon-button brief-dismiss" aria-label="Not now" onClick={onDismiss}><X size={14} /></button></Tip></>
        )}
      </div>
    </section>
  );
}
