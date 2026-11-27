// The chat button while the panel is closed: who it opens to, unread counts, and the newest message as a peek.
import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import type { Agent } from "../model.ts";
import { Tip } from "../Popups.tsx";

export type ChatButton = { label: string; agents: Agent[]; unread: number; replying?: Agent;
  peek?: { id: string; thread: string; agent: Agent; text: string; at: string; review: boolean } };
const peekedKey = "atlaswork.peeked-at";
const lastPeeked = () => { try { return localStorage.getItem(peekedKey) ?? ""; } catch { return ""; } };

/**
 * The floating chat bubble: the face alone, the name sliding out on hover or focus, and typing dots while any agent
 * replies. An agent message that lands while the app is open rises above it as a speech bubble (this device
 * remembers when, so a reload or reading it doesn't bring up older ones, and what was unread at opening stays with the badge), stays while the pointer or focus is on it, and
 * folds back after 8 seconds or on ×. The peek opens its own conversation (offering Review when the message carries a
 * pending proposal); the bubble opens the current one. Ctrl/Cmd+J toggles chat.
 */
export function ChatBubble({ chat, onOpen, onPeek }: { chat: ChatButton; onOpen: () => void; onPeek: (thread: string) => void }) {
  // What was already unread when the app opened is the badge's to say; only what lands from here on peeks.
  const [seen, setSeen] = useState(() => { const opened = new Date().toISOString(), last = lastPeeked(); return last > opened ? last : opened; });
  const [held, setHeld] = useState(false);
  const peek = chat.peek && chat.peek.at > seen ? chat.peek : undefined;
  // Keyed by the message, so other chat activity doesn't restart the 8 seconds.
  const peekAt = peek?.at;
  useEffect(() => {
    if (!peekAt) return;
    try { localStorage.setItem(peekedKey, peekAt); } catch { /* blocked: it may peek again after a reload */ }
    if (held) return;
    const timer = setTimeout(() => setSeen(peekAt), 8000);
    return () => clearTimeout(timer);
  }, [peekAt, held]);
  return (
    <div className="atlas-dock">
      {peek && (
        <div className="atlas-peek" role="status" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
          <Tip label={peek.review ? `Review ${peek.agent.name}'s suggestion` : `Open ${peek.agent.name}'s message`}><button className="atlas-peek-open" onClick={() => onPeek(peek.thread)}>
          {!chat.agents.some((agent) => agent.id === peek.agent.id) && <AvatarStack agents={[peek.agent]} size={28} />}
          <span>
            <strong>{peek.agent.name}</strong><span className="atlas-peek-text">{peek.text}</span>
            {peek.review && <span className="atlas-peek-review">Review</span>}
          </span>
                    </button></Tip>
          <Tip label="Dismiss"><button className="atlas-peek-close" aria-label="Dismiss" onClick={() => { setSeen(peek.at); setHeld(false); }}><X size={14} /></button></Tip>
        </div>
      )}
      <Tip label={chat.replying ? `${chat.replying.name} is replying…` : `Chat with ${chat.label} (Ctrl J)`}><button className="atlas-button" data-pending={chat.unread > 0} data-working={!!chat.replying || undefined} aria-keyshortcuts="Control+J" aria-label={`Chat with ${chat.label}${chat.unread ? `, ${chat.unread} unread` : ""}${chat.replying ? `, ${chat.replying.name} is replying` : ""}`} onClick={onOpen}>
      {chat.agents.length ? <AvatarStack agents={chat.agents} size={chat.agents.length > 1 ? 34 : 44} />
        : <span className="atlas-button-icon" aria-hidden="true"><MessageCircle size={18} /></span>}
      <span className="atlas-button-label" aria-hidden="true"><span>{chat.label}</span></span>
      {chat.unread > 0 && <span className="atlas-count" key={chat.unread}>{chat.unread}</span>}
      {chat.replying && <span className="atlas-typing roster-typing" aria-hidden="true"><i /><i /><i /></span>}
            </button></Tip>
    </div>
  );
}
