// The Chats page (D27): open chats as tabs over the live conversation (chatsPage/ChatTabs.tsx), a + after them that
// opens any chat or starts a room (chatsPage/ChatPicker.tsx), and the page's own controls at the bar's end: back to
// the side panel and close. What acts on one chat (find, its conversations, About) sits in the chat's header, and the
// About rail beside it. Its fixed tab, the Logbook (D19), shows its page under the tab bar in place of a chat.
import type { ReactNode } from "react";
import { PanelRight, X } from "lucide-react";
import type { ChatEntry } from "./view.ts";
import { Tip } from "./Popups.tsx";
import { ChatPicker } from "./chatsPage/ChatPicker.tsx";
import { ChatTabs } from "./chatsPage/ChatTabs.tsx";
import type { FixedTab } from "./chatsPage/ChatTabs.tsx";

export default function ConversationPage({
  tabs, pinned, currentId, chats, railOpen, needs, pickChats, panel, details, fixed,
  onOpen, onCloseTab, onTogglePin, onNewRoom, onRail, onFixed, onPickShown, onDock, onClose,
}: {
  /** Open chats, pinned first, in the order opened. */
  tabs: ChatEntry[];
  pinned: string[];
  currentId: string;
  /** Every conversation, grouped, for the picker. */
  chats: ChatEntry[];
  /** The About rail shows beside the chat. */
  railOpen: boolean;
  /** Chats waiting on you (an approval, a question, a block), listed first in Open a chat. */
  needs: string[];
  /** Holds Open a chat open (the Needs you shortcut); closing it calls `onPickShown`, which clears it. */
  pickChats: boolean;
  onPickShown: () => void;
  panel: ReactNode;
  details: ReactNode;
  /** The fixed tab's page (the Logbook), shown under the tab bar in place of a chat while it's selected. */
  fixed?: { tab: FixedTab; page: ReactNode };
  onOpen: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTogglePin: (id: string) => void;
  onNewRoom: () => void;
  onRail: (open: boolean) => void;
  /** Selects the fixed tab, the bar's first, like a domain's overview tab leads its workspace tabs. */
  onFixed: (tab: FixedTab) => void;
  /** Moves the chat on screen back beside the page you came from. */
  onDock: () => void;
  /** Leaves the Chats page for the page you came from. */
  onClose: () => void;
}) {
  const rail = !fixed && railOpen;
  const current = tabs.find((tab) => tab.id === currentId);
  return (
    <div className="chats-page" data-rail={rail || undefined}>
      {/* The same tab bar as a domain's workspace tabs, so both read as one kind of thing. */}
      <div className="workspace-topbar chat-topbar">
        <ChatTabs tabs={tabs} pinned={pinned} currentId={currentId} fixed={fixed?.tab} onOpen={onOpen} onTogglePin={onTogglePin} onCloseTab={onCloseTab}
          onFixed={onFixed} />
        <ChatPicker chats={chats} needs={needs} open={new Set(tabs.map((tab) => tab.id))} currentId={currentId} pickChats={pickChats}
          onPickShown={onPickShown} onOpen={onOpen} onNewRoom={onNewRoom} />
        <div className="topbar-actions">
          {!fixed && <Tip label={`Move ${current?.label ?? "this chat"} to the side panel, beside your work`}><button className="icon-button" aria-label="Move to side panel"
            onClick={onDock}><PanelRight size={18} /></button></Tip>}
          <Tip label="Close Chats and go back"><button className="icon-button" aria-label="Close Chats" onClick={onClose}><X size={18} /></button></Tip>
        </div>
      </div>
      {fixed ? <div className="chats-manage">{fixed.page}</div> : panel}
      {rail && (
        <aside className="chat-rail" aria-label={`About ${current?.label ?? "this chat"}`}>
          <header>
            <h2>About {current?.label ?? "this chat"}</h2>
            <Tip label="Close"><button className="icon-button" aria-label="Close About" onClick={() => onRail(false)}><X size={16} /></button></Tip>
          </header>
          <div className="chat-rail-scroll">{details}</div>
        </aside>
      )}
    </div>
  );
}
