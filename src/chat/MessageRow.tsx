// One message in the transcript: who said it and when, the app's scam warnings (D79, fixed words the agent can't
// change), what the reply read (SourcesLine.tsx, D81), its words (Markdown replies load their renderer when first
// shown), Copy, the model that wrote it and a line where that model changed (D82), a note when the agents it asked
// didn't answer, the links it hands over, what it remembered (D49) and where things are on a computer it offered to
// remember (D80), and the cards under it (ChatCards.tsx, ChatDisplay.tsx). Where it sits among its neighbours (a new
// day, a fresh start, a run of one voice) comes from the transcript.
import { Fragment, Suspense, lazy, useState } from "react";
import { Bookmark, CalendarPlus, Check, CircleAlert, Copy, ExternalLink, FolderSearch, Mail, Monitor, RotateCcw, ShieldAlert, X } from "lucide-react";
import type { EngineInfo } from "../atlas.ts";
import { AgentDraftCard, AskCard, CardBoundary, ProposalCard } from "../ChatCards.tsx";
import { ChoiceChips, ShownItems } from "../ChatDisplay.tsx";
import { hasMarks } from "../markdown.ts";
import { routineKinds } from "../model.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { locale } from "../dates.ts";
import type { Agent, ChatMessage, Domain, Learned, Memory, Proposal, Thread, Usage } from "../model.ts";
import { Tip } from "../Popups.tsx";
import { routineIcons } from "../RoutineViews.tsx";
import { needsOwnModel } from "../../supabase/functions/agent/caps.ts";
import { warningWords } from "../../supabase/functions/agent/warnings.ts";
import type { WarningKind } from "../../supabase/functions/agent/warnings.ts";
import { clock, limited } from "./format.ts";
import { Marked } from "./Marked.tsx";
import { CalendarAdd } from "./CalendarAdd.tsx";
import { CalendarAsk } from "./CalendarAsk.tsx";
import { Sources } from "./SourcesLine.tsx";
import { chatModelOf, modelName, vendorOf } from "../chatModel.ts";
import type { ChatModel } from "../chatModel.ts";
import { effortLabels } from "../ownModel.ts";
import type { Effort } from "../../supabase/functions/agent/responses.ts";
import { ThinkingGlyph } from "./ThinkingGlyph.tsx";
import { VendorMark } from "./VendorMark.tsx";

/**
 * The app's scam warnings above a reply (agents-design D79), in its own fixed words by kind, never the model's, and
 * never folded away: the one place the chat shows text open without a tap. A kind this build doesn't know shows nothing.
 */
function Warnings({ kinds }: { kinds: WarningKind[] }) {
  const shown = kinds.filter((kind) => kind in warningWords);
  if (!shown.length) return null;
  return (
    <ul className="message-warnings" aria-label="Scam warnings">
      {shown.map((kind) => {
        const [head, ...rest] = warningWords[kind].split(": ");
        return <li key={kind}><ShieldAlert size={16} aria-hidden="true" /><span><strong>{head}:</strong> {rest.join(": ")}</span></li>;
      })}
    </ul>
  );
}

/** Where a thing is, as a learned pill shows it (D80, D84): its words, and apart from them the computer it's on. */
function whereOf(memory: Memory): { said: string; on?: string } {
  const on = memory.computer?.name;
  return on && memory.text.endsWith(` on ${on}`) ? { said: memory.text.slice(0, -(on.length + 4)), on } : { said: memory.text };
}

/**
 * Where things are on a computer that a reply offered to remember (D80): Keep and Not this while offered, Undo once
 * kept, and the computer apart from the words (D84), so a narrow pill cuts the words, never where. Without `onLearn`
 * (read-only) nothing can be decided.
 */
function LearnedPills({ learned, onLearn }: { learned: Learned[]; onLearn?: (memoryId: string, action: "keep" | "decline" | "undo") => void }) {
  return (
    <ul className="message-memories" aria-label="Where things are">
      {learned.map(({ memory, state }) => {
        const { said, on } = whereOf(memory);
        return (
          <li key={memory.id} data-state={state} data-undone={state === "declined" || state === "undone" || state === "gone" || undefined}>
            {state === "offered" ? <FolderSearch size={12} aria-hidden="true" /> : <Bookmark size={12} aria-hidden="true" />}
            {state === "gone" ? <span title={`Forgotten when you removed ${memory.computer?.name ?? "its computer"} from your account`}>
              {memory.computer?.name ?? "Computer"} removed</span>
            : <><span title={state === "offered" ? `Keep where this is? Agents read it only once you keep it. ${memory.text}`
              : state === "kept" ? `Remembered: ${memory.text}` : `${state === "declined" ? "Not kept" : "Forgotten"}: ${memory.text}`}>
              {state === "declined" ? "Not kept" : state === "undone" ? "Forgotten" : said}</span>
              {on && (state === "offered" || state === "kept") && <small className="memory-on"><Monitor size={12} aria-hidden="true" />{on}</small>}</>}
            {state === "offered" && onLearn && <div className="memory-choices">
              <button type="button" className="memory-keep" onClick={() => onLearn(memory.id, "keep")}
                aria-label={`Keep “${memory.text}”`}><Check size={12} aria-hidden="true" />Keep</button>
              <button type="button" className="memory-skip" onClick={() => onLearn(memory.id, "decline")}
                aria-label={`Not this: “${memory.text}”`}><X size={12} aria-hidden="true" />Not this</button>
            </div>}
            {state === "kept" && onLearn && <Tip label="Undo: forget it"><button type="button" onClick={() => onLearn(memory.id, "undo")}
              aria-label={`Forget “${memory.text}”`}><RotateCcw size={12} /></button></Tip>}
          </li>
        );
      })}
    </ul>
  );
}

// Markdown replies (D64) load their renderer the first time one shows; until then the words show plain.
const RichText = lazy(() => import("../RichText.tsx"));

/** A routine's badge on what it posted: its icon and kind. */
export function RoutineBadge({ kind }: { kind: keyof typeof routineKinds }) {
  const Icon = routineIcons[kind];
  return <span><Icon size={12} />{routineKinds[kind].label}</span>;
}

/** The model and Thinking a reply was written on, as a mark and words (D82). */
function ModelUsed({ model, effort }: { model: NonNullable<Usage["model"]>; effort?: Effort | null }) {
  return (
    <span className="message-model">
      <VendorMark vendor={vendorOf(model.id)} size={12} />{modelName(model.id)}
      {effort && <>{" ·"}<ThinkingGlyph effort={effort} size={12} />{effortLabels[effort]}</>}
    </span>
  );
}

/**
 * Where this agent's reply runs on another model or Thinking than its last one here (D82): what changed to. Thinking
 * counts only where both replies recorded it.
 */
function switchedFrom(thread: Thread, index: number) {
  const message = thread.messages[index];
  const model = message.role === "agent" ? message.usage?.model : undefined;
  if (!model) return false;
  const before = thread.messages.slice(0, index).findLast((item) => item.role === "agent" && item.agentId === message.agentId && item.usage?.model)?.usage;
  if (!before?.model) return false;
  return before.model.id !== model.id || before.model.source !== model.source
    || (before.effort !== undefined && message.usage!.effort !== undefined && before.effort !== message.usage!.effort);
}

/** Where a message sits among the ones drawn before it. */
export type RowPlace = {
  /** Its day label, shown when it starts a new day (`newDay`). */
  day: string;
  newDay: boolean;
  /** It opens a fresh conversation the person chose, so a divider goes above it. */
  opens: boolean;
  /** Back-to-back with the same voice on the same day: the repeated name drops. */
  grouped: boolean;
  /** Another voice than the chat's own agent: its face sits in the margin. */
  gutter: boolean;
};

/** What the cards under a message do; every action is absent while the chat is read-only. */
export type CardActions = {
  onOpenNote: (id: string) => void;
  /** Opens a live project by id, or undefined when it's gone or archived: a started project's card offers Open. */
  openProject: (id: string) => (() => void) | undefined;
  /** `review` opens an agent Atlas drafted in the agent dialog (agents-design D57). */
  onProposal: (proposal: Proposal, action: "apply" | "reject" | "undo" | "review") => void;
  /** Archives a quiet agent Atlas named beside his draft (D57), after the usual confirmation. */
  onArchiveAgent?: (id: string) => void;
  /** A task's or note's place by name, so a proposal spanning places says where each one goes. */
  placeOf: (home: { domain: string; projectId: string }) => string;
  /** Opens the domain dialog filled in with a domain Atlas suggests while sorting (D61); absent when read-only. */
  onPlant?: (domain: Pick<Domain, "name" | "emoji" | "intention">) => void;
  /** Whether a domain of that name is already planted, so its suggestion says so. */
  planted: (name: string) => boolean;
  proposalErrors: Record<string, string | undefined>;
  onRequestFreshProposal: (proposal: Proposal) => void;
  /** Your answer to a question one agent wants to ask another (agents-design D50); `question` is your edit of it. */
  onAsk: (askId: string, action: "send" | "always" | "decline", question?: string) => void;
  /** Undo on a memory the reply saved (agents-design D49). */
  onUnremember: (messageId: string, memoryId: string) => void;
  /** Keep, Not this or Undo on where something is on a computer, as the reply offered to remember it (agents-design D80). */
  onLearn: (messageId: string, memoryId: string, action: "keep" | "decline" | "undo") => void;
  /** Taps one of the answers an agent offered (agents-design D64): it's sent as your message. */
  onChoose: (messageId: string, option: string) => void;
  /** Asks the agents who didn't answer your latest message to answer it now (D28). */
  onRetry: (messageId: string) => void;
  /** Opens Settings → AI model, from a refusal a model of your own would lift. */
  onModel?: () => void;
  /** This chat's model and thinking for one agent (D82): a failed reply can try again on its usual or the default. */
  onChatModel?: (agentId: string, choice: ChatModel) => Promise<unknown>;
  /** Opens Settings → Connections, from a calendar a reply found disconnected (agents-design D81). */
  onConnections?: () => void;
};

export function MessageRow({ thread, index, place, speaker, needle, readOnly, busy, chipsOpen, silent, retry, engine, today, left, actions }: {
  thread: Thread;
  index: number;
  place: RowPlace;
  /** An agent by id, Atlas when none is given. */
  speaker: (id?: string) => Agent | undefined;
  /** The find bar's query, lowercased: hits are marked and Markdown shows plain. */
  needle: string;
  readOnly: boolean;
  /** Someone is replying: cards wait. */
  busy: boolean;
  /** The agent's offered answers stay tappable until you write again. */
  chipsOpen: boolean;
  /** Agents your message asked who never answered it. */
  silent: Agent[];
  /** This is the message Retry asks again. */
  retry: boolean;
  engine: EngineInfo;
  /** The day a card's due days are counted from. */
  today: string;
  /** Live replies left today, for a question's Send. */
  left?: number;
  actions: CardActions;
}) {
  const portraitSrc = usePortraitSrc();
  const message = thread.messages[index];
  const { day, newDay, opens, grouped, gutter } = place;
  const agent = message.role === "agent" ? speaker(message.agentId) : undefined;
  const named = gutter && !grouped;
  const asker = message.answers ? speaker(thread.messages.find((item) => item.ask?.id === message.answers)?.agentId) : undefined;
  const asked = message.followsUp ? thread.messages.find((item) => item.ask?.id === message.followsUp)?.ask : undefined;
  const followed = asked && speaker(asked.to);
  const label = message.role === "agent" && (message.routine || asker || followed);
  const [copied, setCopied] = useState(false);
  const copy = (message: ChatMessage) => void navigator.clipboard.writeText(message.text).then(() => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  });
  const { onModel, onRetry, onChoose, onUnremember, onLearn, onProposal, onArchiveAgent, onAsk } = actions;
  return (
    <Fragment>
    {opens && <div className="session-break"><span>New conversation</span>{message.at && <time dateTime={message.at}>{clock(message.at)}</time>}</div>}
    {switchedFrom(thread, index) && <div className="model-switch" role="note"><span>{agent?.name ?? "They"} now on <ModelUsed model={message.usage!.model!} effort={message.usage!.effort} /></span></div>}
    <div data-message-id={message.id} className={`chat-message ${message.role}${gutter ? " gutter" : ""}${grouped ? " grouped" : ""}`}
      data-day={newDay ? day : undefined}>
      {named && <div className="message-speaker">
        {agent && <img src={portraitSrc(agent)} alt="" />}{agent?.name ?? "Agent"}
        {message.at && <time dateTime={message.at}>{clock(message.at)}</time>}
      </div>}
      {label && <div className="message-label">
        {message.routine && <RoutineBadge kind={message.routine.kind} />}
        {asker && <span>answering {asker.name}</span>}
        {followed && <span>following up on {followed.name}</span>}
        {!named && message.at && <time dateTime={message.at}>{clock(message.at)}</time>}
      </div>}
      {message.role === "agent" && message.warnings?.length ? <Warnings kinds={message.warnings} /> : null}
      {message.role === "agent" && message.used && <Sources used={message.used} today={today} onReconnect={readOnly ? undefined : actions.onConnections} />}
      {needle ? <p><Marked text={message.text} query={needle} /></p>
        : message.role === "agent" && hasMarks(message.text) ? <Suspense fallback={<p>{message.text}</p>}><RichText text={message.text} /></Suspense>
        : message.text && <p>{message.text}</p>}
      {/* When and where, and Copy: shown on hover or focus, in the gap under the message. */}
      <div className="message-tools">
        {!named && !label && message.at && <time dateTime={message.at}>{clock(message.at)}</time>}
        {message.role === "user" && message.from && <span>in {message.from}</span>}
        {message.role === "agent" && message.usage?.model && <ModelUsed model={message.usage.model} effort={message.usage.effort} />}
        {message.text && <Tip label={copied ? "Copied" : "Copy"}><button type="button" className="message-copy" onClick={() => copy(message)}
          aria-label={copied ? "Copied" : `Copy ${message.role === "user" ? "your" : `${agent?.name ?? "the agent"}'s`} message`}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></Tip>}
      </div>
      {message.role === "user" && silent.length > 0 && (() => {
        const why = message.failure;
        // The step that would make it work: more usage, a model of your own, or any model (the box offers that one).
        const fix = why && limited(why) && engine.manage
          ? <a href={engine.manage.href} target="_blank" rel="noreferrer">{engine.manage.label}</a>
          : why && needsOwnModel(why) && onModel ? <button type="button" onClick={onModel}>Connect your own model</button> : null;
        // A reply that failed on a model this chat or the agent picked can try again on the one before it (D82): the
        // agent's usual, or the provider's default.
        const lone = silent.length === 1 ? silent[0] : undefined;
        const back = !lone || !why || !retry || !actions.onChatModel ? undefined
          : chatModelOf(thread, lone.id) ? { label: `Try on ${lone.name}'s usual`, choice: { model: lone.model ?? null, effort: lone.effort ?? null } }
          : lone.model ? { label: "Try on the default model", choice: { model: null } } : undefined;
        return (
          <div className="message-unanswered">
            <span><b><CircleAlert size={12} aria-hidden="true" />{new Intl.ListFormat(locale).format(silent.map((agent) => agent.name))} didn't answer</b>{why && <small>{why}</small>}</span>
            {!readOnly && fix}
            {!readOnly && !engine.offline && back && <button type="button" onClick={() => void actions.onChatModel!(lone!.id, back.choice).then(() => onRetry(message.id))}>
              <RotateCcw size={12} />{back.label}</button>}
            {!readOnly && !engine.offline && retry && <Tip label={`Ask ${silent.length === 1 ? silent[0].name : "them"} again`}><button type="button" onClick={() => onRetry(message.id)}><RotateCcw size={12} />Retry</button></Tip>}
          </div>
        );
      })()}
      {message.links && (
        <div className="message-links">
          {message.links.map((link) => {
            const web = link.href.startsWith("https:");
            return (
              <Fragment key={link.href}>
                <a className="message-link" href={link.href} download={link.download}
                  target={web ? "_blank" : undefined} rel={web ? "noopener noreferrer" : undefined}>
                  {link.href.startsWith("mailto:") ? <Mail size={14} /> : link.download ? <CalendarPlus size={14} /> : <ExternalLink size={14} />}
                  {link.label}
                </a>
                {link.events?.length && !readOnly ? <CalendarAdd events={link.events} /> : null}
              </Fragment>
            );
          })}
        </div>
      )}
      {/* One bad stored card shows its own notice instead of blanking the chat and the app (2026-11-20). */}
      <CardBoundary>
      {message.display && <ChoiceChips display={message.display} open={chipsOpen}
        onPick={readOnly ? undefined : (option) => onChoose(message.id, option)} />}
      {(message.display?.blocks || message.display?.taskIds) && <ShownItems display={message.display!} readOnly={readOnly} />}
      {message.display?.calendar && agent && <CalendarAsk level={message.display.calendar} agent={agent} threadId={thread.id} readOnly={readOnly}
        question={thread.messages.slice(0, index).findLast((item) => item.role === "user")} />}
      {message.remembered && (
        <ul className="message-memories" aria-label="Remembered">
          {message.remembered.map(({ memory, undone }) => (
            <li key={memory.id} data-undone={undone || undefined}>
              <Bookmark size={12} aria-hidden="true" />
              <span title={`${undone ? "Forgotten" : "Remembered"}: ${memory.text}`}>{undone ? "Forgotten" : memory.text}</span>
              {!undone && !readOnly && <Tip label="Undo: forget it"><button type="button" onClick={() => onUnremember(message.id, memory.id)}
                aria-label={`Forget “${memory.text}”`}><RotateCcw size={12} /></button></Tip>}
            </li>
          ))}
        </ul>
      )}
      {message.learned && <LearnedPills learned={message.learned}
        onLearn={readOnly ? undefined : (memoryId, action) => onLearn(message.id, memoryId, action)} />}
      {message.proposal?.agent ? <AgentDraftCard proposal={message.proposal} draft={message.proposal.agent} speaker={speaker}
        onProposal={readOnly ? undefined : onProposal} onArchive={readOnly ? undefined : onArchiveAgent} />
        : message.proposal && <ProposalCard proposal={message.proposal} onOpenNote={actions.onOpenNote} openProject={actions.openProject}
        placeOf={actions.placeOf} agentOf={(id) => speaker(id)}
        error={actions.proposalErrors[message.proposal.id]} busy={busy} onPlant={readOnly ? undefined : actions.onPlant} planted={actions.planted}
        onRequestFresh={readOnly ? undefined : actions.onRequestFreshProposal} onProposal={readOnly ? undefined : onProposal} today={today}
        since={message.at} />}
      {message.ask && <AskCard ask={message.ask} from={agent} to={speaker(message.ask.to)} busy={busy} left={left}
        onAsk={readOnly ? undefined : (action, question) => onAsk(message.ask!.id, action, question)} />}
      </CardBoundary>
    </div>
    </Fragment>
  );
}
