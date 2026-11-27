// The chat's message box and what sits around it: why the last message failed or why nobody can answer, a room's "To"
// row, starter questions for a new conversation, the model line (agents-design D82), the attached note and the
// paperclip that offers one, dictation, the context meter, the length count, Hand off (agents-design D73) and Send. It
// owns the words being typed (`useComposerDraft`) and who a room message goes to.
import { useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, RefObject } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowUp, FileText, Hourglass, Mic, Paperclip, Search, X } from "lucide-react";
import type { ContextUse } from "../agents.ts";
import type { EngineInfo } from "../atlas.ts";
import { canDictate, useDictation } from "../dictation.ts";
import { linkedFolders } from "../folders.ts";
import { canUse } from "../model.ts";
import { inChat } from "../chatModel.ts";
import type { ChatModel } from "../chatModel.ts";
import { answersOn, useModelState } from "../modelMenu.ts";
import type { ModelSource } from "../modelMenu.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { locale } from "../dates.ts";
import type { Agent, Need, Note, Thread } from "../model.ts";
import { Picker, Tip } from "../Popups.tsx";
import type { ChatEntry } from "../view.ts";
import { background as handedOff, needsOwnModel } from "../../supabase/functions/agent/caps.ts";
import { ContextMeter, percentOf } from "./ContextMeter.tsx";
import { limited } from "./format.ts";
import { useComposerDraft } from "./useComposerDraft.ts";
import { ModelLine } from "./ModelLine.tsx";
import { VendorMark } from "./VendorMark.tsx";

/** Who a room message goes to: whoever answers first, everyone in order, or one member. */
type Recipient = "first" | "all" | string;

/** What to ask a new conversation, from what its agent can use. */
const starters: [Need | null, (agent: Agent) => string][] = [
  [null, () => "How's it going?"], ["add-tasks", () => "Turn my notes into next steps"], ["calendar", () => "Put my tasks on my calendar"],
  ["email", () => "Draft an email about this week"], ["arrange-pages", () => "Put tasks first on my pages"],
  ["web", (agent) => `Search the web for ${agent.role ? `${agent.role.toLocaleLowerCase()} tips` : "ideas"}`],
];

export function Composer({ composer, engine, models, recentOf, thread, current, thinking, error, failure, draft, onDraft, compose, wroteOnScreen,
  attached, suggestedNote, onAttach, onChooseNote, onDetach, usage, sessionStart, allowance, onModel, onChatModel, onKeepModel, onSend, onHandOff }: {
  /** The message box, which the find bar returns to. */
  composer: RefObject<HTMLTextAreaElement | null>;
  engine: EngineInfo;
  /** The model state the model line reads (D82); absent, the box shows no model line. */
  models?: ModelSource;
  /** The models replies used lately on a catalogue, for the picker's Recent rows (D82). */
  recentOf?: (source: string) => string[];
  thread: Thread;
  current: ChatEntry;
  /** Who is writing a reply right now. */
  thinking: Agent | null;
  error: string;
  /** Why your latest message failed: the note under it says so, so the box doesn't say it twice. */
  failure?: string;
  draft: string;
  onDraft: (text: string) => void;
  /** Focuses the message box, caret at the end, once per value (Ask about this). */
  compose?: number;
  /** Something you wrote is on screen, so starter questions stay away. */
  wroteOnScreen: boolean;
  attached?: Note;
  /** The note you're on (`on`) or last touched, offered first in the paperclip's menu. */
  suggestedNote?: { note: Note; on: boolean };
  onAttach?: (noteId: string) => void;
  onChooseNote: () => void;
  onDetach: () => void;
  /** Each member's measured context window and tokens in this thread (D28). */
  usage?: { agent: Agent; use: ContextUse }[];
  sessionStart: number;
  /** Today's live replies on Atlaswork's model (D48), for the allowance chip; absent on any other model. */
  allowance?: { used: number; cap: number; resets: string; near: boolean };
  /** Opens Settings → AI model, from the allowance chip and from a refusal a model of your own would lift. */
  onModel?: () => void;
  /** This chat's model and thinking for one agent (D82). */
  onChatModel?: (agentId: string, choice: ChatModel) => unknown;
  /** Makes this chat's model and thinking that agent's own. */
  onKeepModel?: (agentId: string) => void;
  onSend: (text: string) => void;
  /** Hands the message off (D73): the agent works on it in the background. Absent where nothing runs on the server. */
  onHandOff?: (text: string) => void;
}) {
  const { text, type, saveDraft } = useComposerDraft(composer, draft, onDraft, compose);
  // Speak instead of typing (agents-design D53's microphone, here too): words land after what's already in the box.
  const spokenAfter = useRef("");
  const dictation = useDictation((heard) => type(spokenAfter.current + heard));
  const listening = dictation.state === "listening";
  const speak = () => { spokenAfter.current = text.trim() ? `${text.trimEnd()} ` : ""; dictation.start(); };
  const room = current.kind !== "agent";
  const readOnly = current.readOnly;
  const [to, setTo] = useState<{ thread: string; value: Recipient }>({ thread: thread.id, value: "first" });
  const recipient = to.thread === thread.id && (to.value === "first" || to.value === "all" || current.agents.some((agent) => agent.id === to.value)) ? to.value : "first";
  const target = recipient === "all" ? "everyone" : current.agents.find((agent) => agent.id === recipient)?.name;
  /** How full a member's context window is, for the hairline under its "To" chip. */
  const fill = (agent?: Agent) => {
    const use = usage?.find((seat) => seat.agent.id === agent?.id)?.use;
    return use ? `${percentOf(use)}%` : undefined;
  };
  // The model line is about whoever "To" names; in a room answered first or by everyone, the first member (D82).
  const lineAgent = current.agents.find((agent) => agent.id === recipient) ?? current.agents[0];
  // Loads this device's folder links, so Send can ask again for the ones a restart closed (`reopen` below).
  useSyncExternalStore(linkedFolders.subscribe, linkedFolders.getSnapshot);
  // Live engines read a limited length; the count shows near it, and Send waits until the message fits.
  const max = engine.maxRequest;
  const over = !!max && text.trim().length > max;
  function send(background = false) {
    if (!text.trim() || thinking || readOnly || over || engine.offline) return;
    dictation.stop();
    // Save first, so a message the room refuses stays in the box and one it takes is cleared by the send.
    saveDraft(text);
    // Addressing is plain @mentions (D8), added for whoever "To" names unless the message already names them.
    const named = (agent: Agent) => text.toLocaleLowerCase().includes(`@${agent.name.toLocaleLowerCase()}`);
    const add = recipient === "first" ? [] : current.agents.filter((agent) => (recipient === "all" || agent.id === recipient) && !named(agent));
    (background && onHandOff ? onHandOff : onSend)(`${add.map((agent) => `@${agent.name} `).join("")}${text.trim()}`);
    // Still inside the click, so the browser may ask again for folders a restart closed (agents-design D47).
    linkedFolders.reopen();
    composer.current?.focus();
  }
  // Starters suggest a first message: they show only while nothing you wrote is on screen and the box is empty.
  const unstarted = !wroteOnScreen && !text.trim();

  return (
    <form aria-busy={!!thinking} className="agent-composer" onSubmit={(event) => { event.preventDefault(); send(); }}>
      {error && error !== failure && (limited(error) && engine.manage
        ? <p className="inline-error" role="alert"><b>Usage limit reached.</b> <a href={engine.manage.href} target="_blank" rel="noreferrer">{engine.manage.label}</a> {error}</p>
        : needsOwnModel(error) && onModel
        ? <p className="inline-error" role="alert">{error} <button type="button" className="text-button" onClick={onModel}>Connect your own model</button></p>
        : <p className="inline-error" role="alert">{error}</p>)}
      {/* With no model nobody can answer, so the box says so up front and Send waits, rather than failing each message. */}
      {engine.offline && !readOnly && <p className="inline-error" role="status">No AI model is connected, so nobody can answer yet.{" "}
        {onModel && <button type="button" className="text-button" onClick={onModel}>Connect a model</button>}</p>}
      {readOnly ? (
        <p className="composer-readonly">{current.label} is resting in the Archive. Restore them to keep talking.</p>
      ) : <>
        {room && <SendTo agents={current.agents} thread={thread} recipient={recipient} models={models} fill={fill}
          onTo={(value) => setTo({ thread: thread.id, value })} />}
        {!room && unstarted && current.agents[0] && (
          <div className="mention-chips starter-chips" aria-label="Try asking">
            {starters.filter(([tool]) => !tool || canUse(current.agents[0], tool)).map(([, ask]) => ask(current.agents[0])).map((prompt) => (
              <button type="button" key={prompt} disabled={!!thinking || engine.offline} onClick={() => onSend(prompt)}>{prompt}</button>
            ))}
          </div>
        )}
        <div className="composer-box">
          {models && lineAgent && onChatModel && onKeepModel && (
            <ModelLine agent={lineAgent} thread={thread} engine={models} recentOf={recentOf} disabled={!!thinking} onModel={onModel}
              onChoose={(choice) => onChatModel(lineAgent.id, choice)} onKeep={() => onKeepModel(lineAgent.id)} />
          )}
          {/* The note they read, once attached; until then the paperclip offers the one you're on (`NoteOffer`). */}
          {attached && (
            <div className="composer-note">
              <span className="context-chip context-note attached">
                <Tip label="Change the note they work from"><button type="button" onClick={onChooseNote}><Paperclip size={14} />{attached.title || "Untitled note"}</button></Tip>
                <Tip label="Detach note"><button type="button" aria-label="Detach note" onClick={onDetach}><X size={12} /></button></Tip>
              </span>
            </div>
          )}
          <textarea ref={composer} aria-label={`Message ${current.label}`} value={text}
            placeholder={!room ? `Message ${current.label}…` : target ? `Message ${target}…` : `Message the room… ${current.agents[0]?.name ?? "the first"} answers, @name to ask someone`}
            onChange={(event) => { dictation.stop(); type(event.target.value); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }} />
          <div className="composer-tools">
            {!attached && suggestedNote
              ? <NoteOffer suggested={suggestedNote} onAttach={(id) => onAttach?.(id)} onChooseNote={onChooseNote} />
              : <Tip label={attached ? "Choose another note" : "Attach a note"}><button type="button" className="icon-button" aria-label={attached ? "Choose another note" : "Attach a note"} onClick={onChooseNote}><Paperclip size={16} /></button></Tip>}
            {canDictate && (
              <Tip label={listening ? "Stop listening" : "Speak"}><button type="button" className="icon-button capture-mic" aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak"}
              onClick={listening ? dictation.stop : speak}><Mic size={16} /></button></Tip>
            )}
            {dictation.state !== "idle" && (() => {
              const said = dictation.state === "blocked" ? "The microphone is blocked for this site" : dictation.state === "failed" ? "The speech service didn't answer" : "Listening…";
              return <span role={dictation.state === "blocked" || dictation.state === "failed" ? "alert" : undefined} title={said}>{said}</span>;
            })()}
            <ContextMeter usage={usage ?? []} thread={thread} sessionStart={sessionStart} engine={engine} allowance={allowance} onModel={onModel}
              writeMode={current.agents.every((agent) => agent.writeMode === "propose") ? "Asks first, you decide" : "Proactive, with undo"} />
            {!!max && text.trim().length > max * 0.9 && (
              <span className="composer-count" data-over={over || undefined} role="status"
                title={over ? `Live agents read up to ${max.toLocaleString(locale)} characters at a time` : undefined}>
                {text.trim().length.toLocaleString(locale)} / {max.toLocaleString(locale)}
              </span>
            )}
            {onHandOff && recipient !== "all" && (
              <Tip label={`Hand off: ${target ?? current.agents[0]?.name ?? "they"} works on it in the background and tells you when it's done. Counts as ${handedOff.replies} replies`}>
                <button type="button" className="icon-button" aria-label="Hand off" disabled={!text.trim() || !!thinking || over || engine.offline} onClick={() => send(true)}>
                  <Hourglass size={16} />
                </button></Tip>
            )}
            <Tip label={engine.offline ? "Connect a model to send" : "Send message"}><button className="send-button" type="submit" disabled={!text.trim() || !!thinking || over || engine.offline} aria-label="Send message">
            <ArrowUp size={18} />
                          </button></Tip>
          </div>
        </div>
      </>}
    </form>
  );
}

/**
 * The paperclip while a note is on offer (agents-design D29): a dot says so, and its menu leads with that note, the one
 * you're on or the one you last changed, then Find a note for any other. One click more than a line in the box, which
 * cost every chat a row.
 */
function NoteOffer({ suggested, onAttach, onChooseNote }: {
  suggested: { note: Note; on: boolean }; onAttach: (id: string) => void; onChooseNote: () => void;
}) {
  const title = suggested.note.title || "Untitled note";
  return (
    <Picker className="chat-list note-offer" label="Attach a note" align="start" tip={`Attach a note: “${title}” is offered`}
      trigger={<button type="button" className="icon-button note-offer-button" aria-label={`Attach a note, “${title}” offered`}><Paperclip size={16} /><span className="note-offer-dot" /></button>}>
      <Menu.Group render={<section />}>
        <Menu.GroupLabel className="chat-list-group">{suggested.on ? "The note you're on" : "The note you last changed"}</Menu.GroupLabel>
        <Menu.Item label={title} onClick={() => onAttach(suggested.note.id)}>
          <FileText size={16} aria-hidden="true" /><span><strong>{title}</strong><small>They read it with every message</small></span>
        </Menu.Item>
      </Menu.Group>
      <Menu.Item className="chat-list-all" label="Find a note" onClick={onChooseNote}>
        <Search size={16} aria-hidden="true" /><span><strong>Find a note…</strong></span>
      </Menu.Item>
    </Picker>
  );
}

/**
 * A room's "To" row: whoever answers first, everyone, or one member, each face with its context hairline and the mark
 * of the model it answers on in this chat (D82).
 */
function SendTo({ agents, thread, recipient, models, fill, onTo }: { agents: Agent[]; thread: Thread; recipient: Recipient; models?: ModelSource;
  fill: (agent?: Agent) => string | undefined; onTo: (value: Recipient) => void }) {
  const portraitSrc = usePortraitSrc();
  const modelState = useModelState(models);
  const face = (agent: Agent) => {
    const on = answersOn(inChat(agent, thread), modelState);
    return <><img src={portraitSrc(agent)} alt="" />{on && <span className="mention-model"><VendorMark vendor={on.vendor} size={9} /></span>}{agent.name}</>;
  };
  const [first, ...others] = agents;
  return (
    <div className="mention-chips" role="group" aria-label="Send to">
      <span className="mention-label">To</span>
      <Tip label={`Whoever answers first replies, unless you @name someone${fill(first) ? ` · context ${fill(first)}` : ""}`}><button type="button" aria-pressed={recipient === "first"} onClick={() => onTo("first")} style={{ "--fill": fill(first) } as CSSProperties}>
        {first && face(first)}<small>first</small>
      </button></Tip>
      {others.length > 0 && <Tip label="Everyone replies, in this order"><button type="button" aria-pressed={recipient === "all"} onClick={() => onTo("all")}>Everyone</button></Tip>}
      {others.map((agent) => (
        <Tip key={agent.id} label={`Only ${agent.name} replies${fill(agent) ? ` · context ${fill(agent)}` : ""}`}><button type="button" aria-pressed={recipient === agent.id} onClick={() => onTo(agent.id)} style={{ "--fill": fill(agent) } as CSSProperties}>
          {face(agent)}
        </button></Tip>
      ))}
    </div>
  );
}
