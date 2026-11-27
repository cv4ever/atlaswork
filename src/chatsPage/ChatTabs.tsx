// The Chats page's tab bar (D27): the fixed Logbook tab first, then open chats, pinned first; arrow keys move between
// the chats (roving tabindex), a pin or close button on each.
import type { CSSProperties } from "react";
import { NotebookText, Pin, PinOff, X } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import { Tip } from "../Popups.tsx";
import type { ChatEntry } from "../view.ts";

/** The tab that leads the bar and never closes: the Logbook (D19), its own page. The Agents page left the bar
 *  (2026-11-22): the sidebar's Agents tab opens it, beside Routines. */
export type FixedTab = "logbook";

export function ChatTabs({ tabs, pinned, currentId, fixed, onOpen, onTogglePin, onCloseTab, onFixed }: {
  tabs: ChatEntry[];
  pinned: string[];
  currentId: string;
  /** The fixed tab that's selected, if one is. */
  fixed?: FixedTab;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onCloseTab: (id: string) => void;
  onFixed: (tab: FixedTab) => void;
}) {
  return (
    // Arrow keys bubble up from the focused tab (roving tabindex), so the tablist itself stays unfocusable.
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus
    <div className="tabs" role="tablist" aria-label="Open chats" onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const index = tabs.findIndex((tab) => tab.id === currentId);
      const next = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      onOpen(next.id);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-chat-tab="${CSS.escape(next.id)}"]`)?.focus());
    }}>
      {/* Every agent's conversations get a tab of their own, never a rail under one agent's tab (Carlos, 2026-11-21). */}
      <div className={`tab tab-logbook ${fixed === "logbook" ? "active" : ""}`}>
        <Tip label="Logbook: what came of every conversation"><button role="tab" aria-selected={fixed === "logbook"} tabIndex={fixed === "logbook" ? 0 : -1}
          onClick={() => onFixed("logbook")}><NotebookText size={16} /><span>Logbook</span></button></Tip>
      </div>
      <span className="tab-separator" aria-hidden="true" />
      {tabs.map((tab) => {
        const isPinned = pinned.includes(tab.id);
        const active = !fixed && tab.id === currentId;
        return (
          <div key={tab.id} className={`tab ${active ? "active" : ""}`} style={{ "--hue": tab.hue } as CSSProperties}>
            <Tip label={`${tab.label}${tab.detail ? ` · ${tab.detail}` : ""}`}><button role="tab" data-chat-tab={tab.id} aria-selected={active} tabIndex={active ? 0 : -1}
              aria-label={`${tab.label}${isPinned ? ", pinned" : ""}${tab.unread ? `, ${tab.unread} unread` : ""}`} onClick={() => onOpen(tab.id)}>
              <AvatarStack agents={tab.agents} size={20} />
              {!isPinned && <span>{tab.label}</span>}
              {isPinned && <Pin size={12} />}
              {tab.unread > 0 && !active && <span className="strip-unread">{tab.unread}</span>}
            </button></Tip>
            <Tip label={isPinned ? `Unpin ${tab.label}` : `Pin ${tab.label}`}><button className="tab-close chat-tab-pin" aria-label={isPinned ? `Unpin ${tab.label}` : `Pin ${tab.label}`}
              onClick={() => onTogglePin(tab.id)}>{isPinned ? <PinOff size={12} /> : <Pin size={12} />}</button></Tip>
            {!isPinned && <Tip label={`Close ${tab.label}`}><button className="tab-close" aria-label={`Close ${tab.label}`} onClick={() => onCloseTab(tab.id)}>
              <X size={12} /></button></Tip>}
          </div>
        );
      })}
    </div>
  );
}
