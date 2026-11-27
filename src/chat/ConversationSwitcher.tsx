// A chat's conversations (agents-design D28, D29): the header's title opens them as a list, this chat's only (whatever
// sits under a tab belongs to that tab, D19), what waits on you first and then by age, each saying what came of it.
// Picking an earlier one reads it on its own (`useReading`), with the reading bar in place of the message box (`ReadingBar`).
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronDown, ChevronLeft, ChevronRight, History, NotebookText, Search, SquarePen } from "lucide-react";
import { dayLabel, formatDate, locale } from "../dates.ts";
import type { ChatMessage } from "../model.ts";
import { Picker, Tip } from "../Popups.tsx";
import { groupLogbook, outcomeOf } from "../chatsPage/logbook.ts";
import type { Sitting } from "../sittings.ts";

/**
 * Which earlier conversation is read on its own, by its start: none while finding (which searches the whole chat),
 * and a new Logbook jump (its `jump` nonce) or another chat ends it. `past` is every conversation before the current one.
 */
export function useReading(threadId: string, sittings: Sitting[], sessionStart: number, needle: string, jump?: number) {
  const key = `${threadId}:${jump ?? ""}`;
  const [at, setAt] = useState<{ key: string; start: number } | null>(null);
  const past = sittings.filter((sitting) => sitting.start < sessionStart);
  const reading = at?.key === key && !needle ? past.find((sitting) => sitting.start === at.start) : undefined;
  return { past, reading, onRead: (start: number | null) => setAt(start === null ? null : { key, start }) };
}

/** When a conversation last moved: the time today, "Yesterday", else the date. */
export function whenOf(at: string | undefined, now: number) {
  const day = dayLabel(at, now);
  return day === "Today" && at ? formatDate(new Date(at), { hour: "2-digit", minute: "2-digit" }) : day;
}

const count = (sitting: Sitting) => `${(sitting.end - sitting.start).toLocaleString(locale)} ${sitting.end - sitting.start === 1 ? "message" : "messages"}`;

/** What came of a conversation in words, else how long it ran. */
export function summaryOf(sitting: Sitting, messages: readonly ChatMessage[]) {
  return outcomeOf(sitting, messages.slice(sitting.start, sitting.end)).text || count(sitting);
}

export function ConversationSwitcher({ sittings, messages, sessionStart, reading, title, fresh, now, label, canNew, onNew, onRead, onLogbook }: {
  sittings: Sitting[];
  messages: readonly ChatMessage[];
  /** Where the conversation the agents are in starts; at the end of the thread while the next message starts one. */
  sessionStart: number;
  /** The start of the earlier conversation on screen, if one is. */
  reading?: number;
  /** The trigger's words: the conversation on screen, or "New conversation" in italics while the chat is clear. */
  title: string;
  fresh: boolean;
  now: number;
  /** Whose conversations these are, for the search field and the trigger's name. */
  label: string;
  /** Whether a new conversation can start: not while the chat is clear, read-only or answering. */
  canNew: boolean;
  onNew?: () => void;
  /** Reads an earlier conversation by its start; null goes back to the current one. */
  onRead: (start: number | null) => void;
  onLogbook: () => void;
}) {
  const items = sittings.toReversed().map((sitting) => ({ sitting, outcome: outcomeOf(sitting, messages.slice(sitting.start, sitting.end)) }));
  const shownStart = reading ?? sessionStart;
  return (
    <Picker className="chat-list conversation-list" label={`Conversations with ${label}`} align="start" filter
      tip={`Conversations with ${label}: open an earlier one, or start a new one`}
      trigger={<button type="button" className="agent-topic" data-fresh={fresh || undefined} aria-label={`${title}. Conversations with ${label}`}>
        <History size={14} aria-hidden="true" /><span>{title}</span><ChevronDown size={14} aria-hidden="true" />
      </button>}>
      <div className="chats-search"><Search size={16} />
        <Menu.Input type="search" aria-label={`Find a conversation with ${label}`} placeholder={`Search ${label}'s conversations…`} />
      </div>
      <Menu.Empty className="chat-list-empty">No conversation with those words</Menu.Empty>
      <Menu.List>
        {canNew && onNew && (
          <Menu.Item className="conversation-new" label="New conversation" onClick={onNew}>
            <SquarePen size={16} aria-hidden="true" /><span><strong>New conversation</strong><small>{label} starts fresh; this one stays here</small></span>
          </Menu.Item>
        )}
        {groupLogbook(items, now).map((group) => (
          <Menu.Group key={group.label} render={<section />}>
            <Menu.GroupLabel className="chat-list-group" data-waiting={group.label === "Waiting on you" || undefined}>{group.label}</Menu.GroupLabel>
            {group.items.map(({ sitting, outcome }) => {
              const current = sitting.start >= sessionStart;
              return (
                // The label carries the words said, so the search finds a conversation by what was in it.
                <Menu.Item key={sitting.key} label={`${sitting.title}\n${sitting.text}`} aria-current={sitting.start === shownStart || undefined}
                  onClick={() => onRead(current ? null : sitting.start)}>
                  <span>
                    <strong>{sitting.title}</strong>
                    <small data-tone={outcome.tone}>{current ? "Now · " : ""}{outcome.text || count(sitting)}</small>
                  </span>
                  <time dateTime={sitting.at}>{whenOf(sitting.at, now)}</time>
                </Menu.Item>
              );
            })}
          </Menu.Group>
        ))}
        <Menu.Item className="chat-list-all" label="Logbook" onClick={onLogbook}>
          <span><strong>Every chat's conversations</strong><small>In the Logbook</small></span><NotebookText size={16} aria-hidden="true" />
        </Menu.Item>
      </Menu.List>
    </Picker>
  );
}

/**
 * Takes the message box's place while an earlier conversation is on screen: agents start each conversation fresh, so
 * you write in the current one. The arrows step to the conversation before or after; past the newest, back to now.
 */
export function ReadingBar({ past, reading, now, who, onRead }: {
  /** Earlier conversations, oldest first. */
  past: Sitting[];
  reading: Sitting;
  now: number;
  /** Who starts fresh: the agent's name, or "Everyone here" in a room. */
  who: string;
  onRead: (start: number | null) => void;
}) {
  const index = past.findIndex((sitting) => sitting.start === reading.start);
  const older = past[index - 1];
  const newer = past[index + 1];
  const day = dayLabel(reading.at, now);
  const from = day === "Today" || day === "Yesterday" ? day.toLocaleLowerCase(locale) : day === "Earlier" ? "a while ago" : day;
  return (
    <div className="reading-bar" role="region" aria-label="Reading an earlier conversation">
      <History size={16} aria-hidden="true" />
      <p>Reading <strong>{reading.title}</strong>, from {from}. {who} starts each conversation fresh, so you write in the current one.</p>
      <span className="reading-step">
        <Tip label={older ? `Older: ${older.title}` : "This is the first conversation"}><button type="button" className="icon-button" aria-label="Older conversation" disabled={!older}
          onClick={() => older && onRead(older.start)}><ChevronLeft size={16} /></button></Tip>
        <small>{index + 1} of {past.length}</small>
        <Tip label={newer ? `Newer: ${newer.title}` : "Back to the current conversation"}><button type="button" className="icon-button" aria-label="Newer conversation"
          onClick={() => onRead(newer ? newer.start : null)}><ChevronRight size={16} /></button></Tip>
      </span>
      <button type="button" className="primary-button" onClick={() => onRead(null)}>Back to now</button>
    </div>
  );
}
