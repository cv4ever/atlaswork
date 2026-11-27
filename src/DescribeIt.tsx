// Describe it (agents-design D63): the line at the top of the project and domain dialogs where you type or say what
// you want, and the agent whose face starts it fills the form below. What it assumed sits under the line, each choice
// a link to the field it went into, with Undo, which takes back only what the fill changed. Nothing is saved until
// you save the dialog.
import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle, Mic, Square, Undo2 } from "lucide-react";
import { canDictate, useDictation } from "./dictation.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import type { Agent } from "./model.ts";
import { countUsage } from "./usage.ts";
import { Tip } from "./Popups.tsx";

/** What one fill did: whether the form changed, the agent's words, its choices (each opening its field) and how to take it back. */
export type FillResult = { filled: boolean; said: string; assumed?: { what: string; open?: () => void }[]; undo?: () => void };

export function DescribeIt({ agent, placeholder, ask }: {
  agent: Agent; placeholder: string; ask: (words: string, signal: AbortSignal) => Promise<FillResult> }) {
  const portraitSrc = usePortraitSrc();
  const [words, setWords] = useState("");
  const [result, setResult] = useState<(Partial<FillResult> & { busy?: true }) | null>(null);
  const spokenAfter = useRef("");
  const running = useRef<AbortController | null>(null);
  const dictation = useDictation((heard) => setWords(spokenAfter.current + heard));
  const listening = dictation.state === "listening";
  const busy = !!result?.busy;
  // Closing the dialog mid-fill stops the reply, so a late answer never lands in a form that's gone.
  useEffect(() => () => running.current?.abort(), []);
  const speak = () => {
    spokenAfter.current = words.trim() ? `${words.trimEnd()} ` : "";
    countUsage("describe_dictated");
    dictation.start();
  };
  const send = () => {
    const text = words.trim();
    if (!text || busy) return;
    dictation.stop();
    countUsage("describe_sent");
    const controller = new AbortController();
    running.current = controller;
    setResult({ busy: true });
    ask(text, controller.signal).then((done) => {
      if (controller.signal.aborted) return;
      setResult(done);
      if (!done.filled) return;
      countUsage("describe_filled");
      setWords("");
    }, (cause: unknown) => {
      if (controller.signal.aborted) return;
      setResult({ filled: false, said: cause instanceof Error ? cause.message : `${agent.name} couldn't answer. Try again.` });
    }).finally(() => { if (running.current === controller) running.current = null; });
  };
  // Stop (D63): the reply is cut off and nothing lands; the words stay to change and send again.
  const stop = () => {
    running.current?.abort();
    countUsage("describe_stopped");
    setResult({ filled: false, said: "Stopped. Nothing was filled in." });
  };
  const trouble = dictation.state === "blocked" ? "The microphone is blocked. Allow it for this site in the browser’s settings."
    : dictation.state === "failed" ? "The browser’s speech service didn’t answer. Try again, or type it." : "";
  return (
    <div className="describe-it" data-busy={busy || undefined} aria-busy={busy || undefined}>
      <div className="describe-row">
        <span className="describe-face"><img src={portraitSrc(agent)} alt="" title={agent.name} /></span>
        <textarea rows={1} maxLength={600} value={words} disabled={busy} aria-label={`Tell ${agent.name} what you want`}
          placeholder={listening ? "Listening…" : placeholder}
          onChange={(event) => { dictation.stop(); setWords(event.target.value); }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            send();
          }} />
        {canDictate && (
          <Tip label={listening ? "Stop listening" : "Speak"}><button type="button" className="icon-button describe-mic" aria-pressed={listening} disabled={busy} aria-label={listening ? "Stop listening" : "Speak"}
          onClick={listening ? dictation.stop : speak}><Mic size={16} /></button></Tip>
        )}
        <Tip label={busy ? "Stop" : `${agent.name} fills it in`}><button type="button" className="icon-button describe-send" disabled={!busy && !words.trim()}
          aria-label={busy ? `Stop ${agent.name}` : `${agent.name} fills it in`} onClick={busy ? stop : send}>
          {busy ? <><LoaderCircle size={18} className="describe-spin" aria-hidden="true" /><Square size={12} className="describe-stop" fill="currentColor" aria-hidden="true" /></>
            : <ArrowUp size={16} />}</button></Tip>
      </div>
      {trouble && <p className="describe-said" role="alert">{trouble}</p>}
      {result && (busy || result.said || result.assumed?.length) && (
        <p className="describe-said" role="status" data-failed={result.filled === false || undefined}>
          {busy ? <span>{agent.name} is filling it in…</span> : result.assumed?.length ? <>
            <span>Assumed:</span>
            {result.assumed.map((choice, index) => choice.open
              ? <Tip key={index} label="Show it"><button type="button" className="text-button describe-assumed" onClick={choice.open}>{choice.what}</button></Tip>
              : <span key={index} className="describe-assumed">{choice.what}</span>)}
          </> : <span>{result.said}</span>}
          {result.undo && (
            <Tip label="Take back what the fill changed; your own edits stay"><button type="button" className="text-button describe-undo" onClick={() => { result.undo!(); countUsage("describe_undone"); setResult(null); }}>
            <Undo2 size={14} aria-hidden="true" />Undo</button></Tip>
          )}
        </p>
      )}
    </div>
  );
}
