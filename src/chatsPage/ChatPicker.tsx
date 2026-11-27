// Open a chat: the Chats tab bar's + (agents-design D27), like a browser's new tab. Every conversation, those waiting
// on you first, then by group, filtered as you type, with Start a room at the foot. It opens from the +, or from the
// Needs you shortcut until it closes.
import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Plus, Search, Users } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import { Picker } from "../Popups.tsx";
import type { ChatEntry } from "../view.ts";

export function ChatPicker({ chats, needs, open, currentId, pickChats, onPickShown, onOpen, onNewRoom }: {
  chats: ChatEntry[];
  /** Chats waiting on you (an approval, a question, a block), listed first. */
  needs: string[];
  /** Chats open as tabs. */
  open: Set<string>;
  currentId: string;
  /** Holds it open (the Needs you shortcut); closing it calls `onPickShown`, which clears it. */
  pickChats: boolean;
  onPickShown: () => void;
  onOpen: (id: string) => void;
  onNewRoom: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const onPicking = (next: boolean) => {
    setPicking(next);
    if (!next && pickChats) onPickShown();
  };
  const waiting = chats.filter((chat) => needs.includes(chat.id));
  const others = chats.filter((chat) => !needs.includes(chat.id));
  const groups = [...new Set(others.map((chat) => chat.group))];
  const elsewhere = chats.filter((chat) => chat.unread && !open.has(chat.id)).length;
  const row = (chat: ChatEntry) => (
    <Menu.Item key={chat.id} label={`${chat.label} ${chat.detail}`} aria-current={chat.id === currentId || undefined} onClick={() => onOpen(chat.id)}>
      <AvatarStack agents={chat.agents} size={26} />
      <span><strong>{chat.label}</strong><small>{chat.last ? `${chat.last.by}: ${chat.last.text}` : chat.detail}</small></span>
      {open.has(chat.id) ? <em>Open</em> : chat.unread > 0 && <span className="strip-unread">{chat.unread}</span>}
    </Menu.Item>
  );
  return (
    <Picker className="chat-list chat-picker" label="Open a chat" tip="Open a chat, or start a room" align="start" filter open={picking || pickChats} onOpenChange={onPicking}
      trigger={<button className="icon-button chat-picker-button" aria-label={`Open a chat${elsewhere ? `, ${elsewhere} with unread messages` : ""}`}>
        <Plus size={18} />{elsewhere > 0 && <span className="strip-dot" />}
      </button>}>
      <div className="chats-search"><Search size={16} />
        <Menu.Input type="search" aria-label="Find a chat" placeholder="Find a chat or agent…" />
      </div>
      <Menu.Empty className="chat-list-empty">No chat or agent by that name</Menu.Empty>
      <Menu.List>
        {waiting.length > 0 && (
          <Menu.Group render={<section />}>
            <Menu.GroupLabel className="chat-list-group">Needs you</Menu.GroupLabel>
            {waiting.map(row)}
          </Menu.Group>
        )}
        {groups.map((group) => (
          <Menu.Group key={group} render={<section />}>
            <Menu.GroupLabel className="chat-list-group">{group}</Menu.GroupLabel>
            {others.filter((chat) => chat.group === group).map(row)}
          </Menu.Group>
        ))}
        <Menu.Item className="chat-list-all" label="Start a room" onClick={() => onNewRoom()}>
          <span><strong>Start a room</strong><small>Bring several agents into one conversation</small></span><Users size={16} />
        </Menu.Item>
      </Menu.List>
    </Picker>
  );
}
