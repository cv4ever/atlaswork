// One thread on screen: the rail (chat/ChatStrip.tsx), the header (chat/ChatHeader.tsx, where the conversation stands:
// chat/sessionInfo.ts; its conversations: chat/ConversationSwitcher.tsx), the find bar (chat/FindBar.tsx), the
// transcript (which messages show: chat/transcriptWindow.ts; how it scrolls: chat/useTranscriptScroll.ts; each
// message: chat/MessageRow.tsx) and the composer (chat/Composer.tsx), or the reading bar while an earlier conversation
// is on screen. It asks the Room module for actions through page callbacks.
import { useMemo, useRef, useState } from "react";
import { ChevronUp, MessagesSquare } from "lucide-react";
import { retryable } from "./sittings.ts";
import type { Sitting } from "./sittings.ts";
import { dayLabel, locale } from "./dates.ts";
import type { Agent, ChatMessage, Domain, Note, Proposal, Thread } from "./model.ts";
import { ChatHeader } from "./chat/ChatHeader.tsx";
import { sessionInfo } from "./chat/sessionInfo.ts";
import type { EngineInfo } from "./atlas.ts";
import type { ContextUse } from "./agents.ts";
import type { ChatModel } from "./chatModel.ts";
import type { ModelSource } from "./modelMenu.ts";
import { routineDate } from "./view.ts";
import type { ChatEntry } from "./view.ts";
import { ChatStrip } from "./chat/ChatStrip.tsx";
import { Composer } from "./chat/Composer.tsx";
import { percentOf } from "./chat/ContextMeter.tsx";
import { FindBar } from "./chat/FindBar.tsx";
import type { Find } from "./chat/FindBar.tsx";
import { hits } from "./chat/Marked.tsx";
import { MessageRow } from "./chat/MessageRow.tsx";
import { Typing } from "./chat/Typing.tsx";
import type { Step } from "./room/types.ts";
import { transcriptWindow } from "./chat/transcriptWindow.ts";
import { useTranscriptScroll } from "./chat/useTranscriptScroll.ts";
import { ConversationSwitcher, ReadingBar, summaryOf, useReading, whenOf } from "./chat/ConversationSwitcher.tsx";

export default function AgentPanel(props: {
  /** Who answers this conversation: the first engine among its members that can. */
  engine: EngineInfo;
  /** Inside the Chats page, which has its own list and faces: no strip, no close, sized by the page. */
  embedded?: boolean;
  /** Chats page only: a find bar over the transcript. */
  findable?: boolean;
  /** Scroll to this message of `threadId` once per `nonce`, rendering back to it if needed. */
  jumpTo?: { threadId: string; index: number; nonce: number };
  /** Focuses the message box, caret at the end, once per value (Ask about this). */
  compose?: number;
  /** Each member's measured context window and tokens in this thread (D28). */
  usage?: { agent: Agent; use: ContextUse }[];
  /** Where the current session begins; `thread.messages.length` when the next message starts a fresh one. */
  sessionStart: number;
  /** Sessions this thread has had today, the current or next one included. */
  sessionsToday: number;
  /** The minute clock, for day labels and how long the chat has been idle. */
  now: number;
  /** Starts a fresh session. */
  onNewSession?: () => void;
  /** This thread's conversations, oldest first (D28), for the header's switcher and the Previous line. */
  sittings: Sitting[];
  /** Whether someone is replying in a conversation, for the rail's faces. */
  replying?: (threadId: string) => boolean;
  /** What they're doing, for the header: replying, waiting on you, stuck, or how to reach them. */
  status?: { kind: "working" | "approval" | "question" | "stuck" | "idle"; text: string };
  /** The note you're on (`on`) or last touched, offered first in the paperclip's menu. */
  suggestedNote?: { note: Note; on: boolean };
  onAttach?: (noteId: string) => void;
  /** Today's live replies on Atlaswork's model (D48), for the composer's allowance chip; absent on any other model. */
  allowance?: { used: number; cap: number; resets: string; near: boolean };
  /** Opens Settings → AI model, from the allowance chip and from a refusal a model of your own would lift. */
  onModel?: () => void;
  /** Opens Settings → Connections, from a reply's disconnected calendar (D81). */
  onConnections?: () => void;
  /** The model state for the message box's model line (agents-design D82). */
  models?: ModelSource;
  /** The models replies used lately on a catalogue, for the picker's Recent rows (D82). */
  recentOf?: (source: string) => string[];
  /** This chat's model and thinking for one agent (D82); resolves once it's saved. */
  onChatModel?: (agentId: string, choice: ChatModel) => Promise<unknown>;
  /** Makes this chat's model and thinking that agent's own. */
  onKeepModel?: (agentId: string) => void;
  thread: Thread;
  current: ChatEntry;
  /** Atlas, then the agents and room for where you are. */
  strip: ChatEntry[];
  /** Every conversation, for the chat list. */
  chats: ChatEntry[];
  /** Everyone who might have spoken here, archived included. */
  agents: Agent[];
  welcome: string;
  attached?: Note;
  draft: string;
  /** Who is writing a reply on this page right now; the composer waits for it. */
  thinking: Agent | null;
  /**
   * Who the agent function is still answering after the page that asked went away (D72), or for work you handed off
   * (D73): shown typing, while you can keep writing, since each message saves on its own (D76).
   */
  awaited?: Agent;
  /** Your messages whose replies the agent function is still writing. */
  finishing?: string[];
  /** The steps that real agent has taken in this reply, the last the one it's on, each with its tool's icon (D81). */
  progress?: Step[];
  error: string;
  onDraft: (text: string) => void;
  onPick: (threadId: string) => void;
  onSend: (text: string) => void;
  /** Hands your message off to the background (D73); absent signed out. */
  onHandOff?: (text: string) => void;
  /** Asks the agents who didn't answer your latest message to answer it now (D28). */
  onRetry: (messageId: string) => void;
  /** The side panel's close; the Chats page closes from its tab bar. */
  onClose?: () => void;
  onChooseNote: () => void;
  onDetach: () => void;
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
  /** Keep, Not this or Undo on where something is on a computer, as a reply offered to remember it (agents-design D80). */
  onLearn: (messageId: string, memoryId: string, action: "keep" | "decline" | "undo") => void;
  /** Taps one of the answers an agent offered (agents-design D64): it's sent as your message. */
  onChoose: (messageId: string, option: string) => void;
  /** Opens "Start a room". */
  onNewRoom: () => void;
  /** This chat in the Logbook: from the switcher's foot, the rail's All chats and "N earlier messages". */
  onShowAll: () => void;
  /** Side panel only: moves this conversation into the page. */
  onExpand?: () => void;
  /** Chats page only: the About rail beside the chat, and its toggle. */
  details?: { open: boolean; onToggle: () => void };
}) {
  const {
    engine, thread, current, strip, chats, agents, welcome, thinking, awaited, finishing, progress, embedded, findable, jumpTo, usage, sessionStart,
    sessionsToday, sittings, now, status, replying, allowance, onPick, onClose, onNewRoom, onShowAll, onExpand, onNewSession,
  } = props;
  const transcript = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const room = current.kind !== "agent";
  const readOnly = current.readOnly;
  const speaker = (id?: string) => agents.find((agent) => agent.id === (id ?? "atlas"));
  const days = useMemo(() => thread.messages.map((message) => dayLabel(message.at, now)), [thread.messages, now]);
  // The day a card's due days are counted from: the View's clock, or `?today=`.
  const today = routineDate(now).toLocaleDateString("en-CA");
  const [find, setFind] = useState<Find | null>(null);
  const needle = find?.query.trim().toLocaleLowerCase() ?? "";
  const found = needle ? thread.messages.reduce((sum, message) => sum + hits(message.text, needle), 0) : 0;
  const findIndex = found ? ((find!.index % found) + found) % found : 0;
  const starts = useMemo(() => new Set(thread.sessionStarts), [thread.sessionStarts]);
  const { past, reading, onRead } = useReading(thread.id, sittings, sessionStart, needle, jumpTo?.threadId === thread.id ? jumpTo.nonce : undefined);
  const [kept, setKept] = useState<{ thread: string; ids: string[] }>({ thread: thread.id, ids: [] });
  const keptIds = kept.thread === thread.id ? kept.ids : [];
  const { first, hidden, newlyKept, shown } = transcriptWindow({ thread, needle, jumpTo, reading, keptIds });
  if (kept.thread !== thread.id || newlyKept.length) setKept({ thread: thread.id, ids: [...keptIds, ...newlyKept] });
  // The conversation folded away by New conversation, one step back from where the chat starts now.
  const folded = hidden > 0 && !reading ? sittings.findLast((sitting) => sitting.start < hidden) : undefined;
  // Who shows typing: a reply on this page, else one the agent function is still writing for you.
  const typing = thinking ?? awaited;
  const { showWaiting } = useTranscriptScroll(transcript, { thread, thinking: typing ?? null, needle, findIndex, jumpTo });
  // Agents a message of yours asked who never answered it (a failed reply, or a reload cut it off); hidden while anyone
  // replies here, and for a message the agent function is still answering (D72).
  const missed = (message: ChatMessage) => thinking || finishing?.includes(message.id) ? []
    : current.agents.filter((agent) => message.awaiting?.includes(agent.id));
  const retryId = retryable(thread, sessionStart)?.id;
  // An agent's offered answers stay tappable until you write again, by tapping or typing.
  const lastWritten = thread.messages.findLastIndex((message) => message.role === "user");
  function openFind() {
    setFind((was) => was ?? { query: "", index: 0 });
    requestAnimationFrame(() => document.getElementById("chat-find")?.focus());
  }
  const session = sessionInfo(thread, sessionStart, sessionsToday, now, usage?.length ? Math.max(...usage.map((seat) => percentOf(seat.use))) : undefined);
  const topic = sessionStart < thread.messages.length ? sittings.find((sitting) => sitting.start === sessionStart)?.title : undefined;
  const canNew = !readOnly && !session.clear && !reading && !!onNewSession;
  const meta = reading ? `${whenOf(reading.at, now)} · ${summaryOf(reading, thread.messages)}`
    : topic ? `${session.inSession} ${session.inSession === 1 ? "message" : "messages"}` : status && status.kind !== "idle" ? undefined : status?.text ?? current.detail;
  const switcher = (
    <ConversationSwitcher sittings={sittings} messages={thread.messages} sessionStart={sessionStart} reading={reading?.start}
      title={reading?.title ?? topic ?? "New conversation"} fresh={!reading && !topic} now={now} label={current.label}
      canNew={canNew && !thinking} onNew={onNewSession} onRead={onRead} onLogbook={onShowAll} />
  );

  return (
    // Ctrl/Cmd+F inside the Chats page's conversation searches it instead of the browser page.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside className={embedded ? "agent-panel-embedded" : "agent-panel"} aria-label={`Chat with ${current.label}`}
      onKeyDown={findable ? (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") { event.preventDefault(); openFind(); }
      } : undefined}>
      {!embedded && <ChatStrip strip={strip} chats={chats} current={current} threadId={thread.id} replying={replying}
        onPick={onPick} onShowAll={onShowAll} onNewRoom={onNewRoom} />}
      <ChatHeader current={current} threadId={thread.id} switcher={switcher} meta={meta} status={reading ? undefined : status} session={session}
        finding={findable ? { open: !!find } : undefined} details={props.details} canNew={canNew} named={!embedded} onShowWaiting={showWaiting}
        onFind={() => (find ? setFind(null) : openFind())} onNewSession={thinking ? undefined : onNewSession} onExpand={onExpand} onClose={onClose} />
      {find && <FindBar find={find} found={found} current={findIndex} onFind={setFind} onEscape={() => { setFind(null); composer.current?.focus(); }} />}
      <div className="agent-transcript" ref={transcript} aria-live="polite" aria-relevant="additions">
        {folded && <div className="chat-previous"><button type="button" onClick={() => onRead(folded.start)}>
          <ChevronUp size={14} aria-hidden="true" />Previous: <strong>{folded.title}</strong><small>{whenOf(folded.at, now)}</small></button></div>}
        {!reading && <div className="chat-message agent welcome-message"><p>{welcome}</p></div>}
        {first > 0 && !hidden && !reading && <button className="chat-earlier" onClick={onShowAll}><MessagesSquare size={14} />{first.toLocaleString(locale)} earlier messages</button>}
        {shown.map((index, position) => {
          const message = thread.messages[index];
          const agent = message.role === "agent" ? speaker(message.agentId) : undefined;
          const day = days[index];
          const previous = shown[position - 1];
          const newDay = previous === undefined || days[previous] !== day;
          const before = previous === undefined ? undefined : thread.messages[previous];
          // The divider marks a chosen fresh start, unless the chat begins there now that it's cleared.
          const opens = index > 0 && starts.has(index) && !(hidden && index === hidden) && index !== reading?.start;
          // Back-to-back messages from one voice on one day drop the repeated name, like a chat app.
          const grouped = !newDay && !opens && !message.routine && before?.role === message.role && before.agentId === message.agentId;
          // A one-to-one chat never repeats who is talking; a room, or another agent answering here, names each voice with
          // its face in the margin.
          const gutter = message.role === "agent" && (room || agent?.id !== current.agents[0]?.id);
          return (
            <MessageRow key={message.id} thread={thread} index={index} place={{ day, newDay, opens, grouped, gutter }} speaker={speaker}
              needle={needle} readOnly={readOnly} busy={!!thinking} chipsOpen={index > lastWritten && !thinking}
              silent={message.role === "user" ? missed(message) : []} retry={message.id === retryId} engine={engine} today={today}
              left={allowance ? Math.max(0, allowance.cap - allowance.used) : undefined} actions={props} />
          );
        })}
        {thread.messages.length > 0 && session.clear && !hidden && !reading && (
          <div className="session-break"><span>New conversation</span><small>Your next message starts it</small></div>
        )}
        {typing && !reading && <Typing agent={typing} room={room} steps={progress} />}
      </div>
      {reading ? <ReadingBar past={past} reading={reading} now={now} who={room ? "Everyone here" : current.label} onRead={onRead} />
        // The box takes the panel's own props by name (engine, draft, the note and model callbacks); only these are its own.
        : <Composer {...props} composer={composer} failure={thread.messages.findLast((message) => message.role === "user")?.failure}
          wroteOnScreen={shown.some((index) => thread.messages[index].role === "user")} />}
    </aside>
  );
}
