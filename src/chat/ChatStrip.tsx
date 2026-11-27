// The chat panel's rail (D13): Atlas, then this place's agents and rooms; All chats and Start a room at its foot. Phones
// lay it in a row. Each face carries what it holds for you: a count waiting on you, a replying wave, an unread dot.
import { Fragment } from "react";
import type { CSSProperties } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowRight, MessagesSquare, Users } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import { Picker, Tip } from "../Popups.tsx";
import type { ChatEntry } from "../view.ts";

const waitingIn = (entry: ChatEntry) => entry.thread.messages.filter((message) =>
  message.proposal?.status === "pending" || message.ask?.status === "pending").length;

export function ChatStrip({ strip, chats, current, threadId, replying, onPick, onShowAll, onNewRoom }: {
  /** Atlas, then the agents and room for where you are. */
  strip: ChatEntry[];
  /** Every conversation, for the chat list. */
  chats: ChatEntry[];
  current: ChatEntry;
  threadId: string;
  replying?: (threadId: string) => boolean;
  onPick: (threadId: string) => void;
  onShowAll: () => void;
  onNewRoom: () => void;
}) {
  const groups = [...new Set(chats.map((chat) => chat.group))];
  return (
    <nav className="chat-strip" aria-label="Conversations" style={{ "--open-hue": current.hue } as CSSProperties}>
      {strip.map((entry, index) => {
        const waiting = waitingIn(entry);
        const busy = replying?.(entry.id);
        return (
          <Fragment key={entry.id}>
            {index === 1 && <hr className="strip-rule" />}
            <Tip label={`${entry.label}${waiting ? ` · ${waiting} waiting on you` : busy ? " · replying" : entry.unread ? ` · ${entry.unread} unread` : entry.detail ? ` · ${entry.detail}` : ""}`}>
              <button className="strip-avatar" aria-current={entry.id === threadId || undefined}
                aria-label={`${entry.label}${waiting ? `, ${waiting} waiting on you` : ""}${busy ? ", replying" : ""}${entry.unread ? `, ${entry.unread} unread` : ""}`}
                style={{ "--hue": entry.hue } as CSSProperties} onClick={() => onPick(entry.id)}>
                <AvatarStack agents={entry.agents.slice(0, 2)} size={entry.agents.length > 1 ? 24 : 34} />
                {waiting > 0 ? <span className="strip-unread">{waiting}</span> : entry.unread > 0 && <span className="strip-dot" />}
                {busy && <span className="strip-busy" aria-hidden="true"><i /><i /><i /></span>}
              </button>
            </Tip>
          </Fragment>
        );
      })}
      <span className="strip-gap" />
      <Picker className="chat-list" label="All chats" tip="All chats" align="end"
        trigger={<button className="strip-all" aria-label="All chats">
          <MessagesSquare size={18} />
          {chats.some((chat) => chat.unread && !strip.some((entry) => entry.id === chat.id)) && <span className="strip-dot" />}
        </button>}>
        {groups.map((group) => (
          <Menu.Group key={group}>
            <Menu.GroupLabel className="chat-list-group">{group}</Menu.GroupLabel>
            {chats.filter((chat) => chat.group === group).map((chat) => (
              <Menu.Item key={chat.id} aria-current={chat.id === threadId || undefined} onClick={() => onPick(chat.id)}>
                <AvatarStack agents={chat.agents} size={26} />
                <span><strong>{chat.label}</strong><small>{chat.last ? `${chat.last.by}: ${chat.last.text}` : chat.detail}</small></span>
                {chat.unread > 0 && <span className="strip-unread">{chat.unread}</span>}
              </Menu.Item>
            ))}
          </Menu.Group>
        ))}
        <Menu.Item className="chat-list-all" onClick={() => onShowAll()}>
          <span><strong>Logbook</strong><small>What came of every conversation</small></span><ArrowRight size={16} />
        </Menu.Item>
      </Picker>
      <Tip label="Start a room with several agents"><button className="strip-all" aria-label="Start a room" onClick={onNewRoom}>
        <Users size={18} />
      </button></Tip>
    </nav>
  );
}
