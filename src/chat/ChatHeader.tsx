// A chat's header (agents-design D29). The rail already shows the face, so the header is the name: large, its hand-drawn
// underline drawn in when you arrive; then the conversation on screen, whose title opens this chat's conversations
// (chat/ConversationSwitcher.tsx), and a status when there is one to act on. Its actions are about this chat: in the
// side panel New conversation, Open as a page and Close; on the Chats page (`named` off, the tab above names the chat)
// Find, New conversation and About, while the page's own controls (side panel, close) sit at the tab bar's end.
import type { CSSProperties, ReactNode } from "react";
import { Info, Maximize2, Search, SquarePen, X } from "lucide-react";
import { Tip } from "../Popups.tsx";
import type { ChatEntry } from "../view.ts";
import type { SessionInfo } from "./sessionInfo.ts";

type Status = { kind: string; text: string };

export function ChatHeader({ current, threadId, switcher, meta, status, session, finding, details, canNew, named = true, onShowWaiting, onFind,
  onNewSession, onExpand, onClose }: {
  current: ChatEntry; threadId: string;
  /** The conversation switcher, titled by the conversation on screen. */
  switcher: ReactNode;
  /** A quiet line after the title: how long it runs, or who they are while the chat is clear. */
  meta?: string;
  status?: Status; session: SessionInfo;
  /** Whether the chat can be searched (the Chats page), and whether its find bar is open. */
  finding?: { open: boolean };
  /** The Chats page's About rail: whether it's open, and its toggle. */
  details?: { open: boolean; onToggle: () => void };
  /** New conversation shows only while there is one to end: not while the chat is clear, read-only or read back. */
  canNew: boolean;
  /** Shows the name and its underline; off where a tab already names the chat. */
  named?: boolean;
  onShowWaiting: () => void; onFind: () => void; onNewSession?: () => void; onExpand?: () => void;
  /** The side panel's close; the Chats page closes from its tab bar. */
  onClose?: () => void;
}) {
  // The status line only carries something to act on; the role and last reply sit in the meta line and tooltips.
  const actionable = status && status.kind !== "idle" ? status : undefined;
  const { where, freshReason } = session;
  const newTip = `New conversation: ${current.agents.length > 1 ? "everyone starts" : `${current.label} starts`} fresh, and this one stays in the list${freshReason ? `. Recommended: ${freshReason}` : ""}. ${where}`;
  const newLabel = freshReason ? `New conversation, recommended: ${freshReason}` : "New conversation";
  return (
    <header className="agent-header" data-compact={!named || undefined} key={threadId} style={{ "--hue": current.hue } as CSSProperties}>
      <span className="agent-title">
        {named && <>
          <strong title={`${current.label} · ${current.detail}`}>{current.label}</strong>
          <svg className="agent-squiggle" viewBox="0 0 120 8" preserveAspectRatio="none" aria-hidden="true"
            style={{ width: `${Math.min(current.label.length, 20) * 0.9}em` }}>
            <path d="M2 5 C 14 1, 22 8, 34 4 S 56 1, 68 5 S 92 8, 104 3 S 116 3, 118 4" />
          </svg>
        </>}
        <span className="agent-topic-line">{switcher}{meta && <small className="agent-meta">{meta}</small>}</span>
        {actionable && (actionable.kind === "approval" || actionable.kind === "question"
          ? <Tip label="Show what waits on you"><button type="button" className="agent-status" data-kind={actionable.kind} onClick={onShowWaiting}>
            {actionable.text}</button></Tip>
          : <small className="agent-status" data-kind={actionable.kind} role="status">{actionable.text}</small>)}
      </span>
      <span className="agent-header-actions">
        {finding && <Tip label="Find in this chat (Ctrl F)"><button className="icon-button" aria-label="Find in this chat" aria-pressed={finding.open}
          onClick={onFind}><Search size={16} /></button></Tip>}
        {canNew && onNewSession && (named
          ? <Tip label={newTip}><button className="icon-button" data-recommended={freshReason ? "" : undefined} onClick={onNewSession} aria-label={newLabel}>
            <SquarePen size={16} /></button></Tip>
          : <Tip label={newTip}><button className="agent-new" data-recommended={freshReason ? "" : undefined} onClick={onNewSession} aria-label={newLabel}>
            <SquarePen size={14} aria-hidden="true" /><span>New</span></button></Tip>)}
        {details && <Tip label={`About ${current.label}: role, places, tools and routines`}><button className="icon-button" aria-label={`About ${current.label}`}
          aria-pressed={details.open} onClick={details.onToggle}><Info size={18} /></button></Tip>}
        {onExpand && <Tip label="Open as a page, with room for details"><button className="icon-button agent-expand" aria-label="Open as a page" onClick={onExpand}>
          <Maximize2 size={16} /></button></Tip>}
        {onClose && <Tip label="Close chat"><button className="icon-button" aria-label="Close chat" onClick={onClose}><X size={18} /></button></Tip>}
      </span>
    </header>
  );
}
