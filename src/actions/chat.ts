// What chat's buttons do through the Room: opening a conversation in the panel or as the page, rooms, attaching a
// note, a question for another agent (D50), memories (D49) and handing something to Atlas.
import { ActionCore } from "./core.ts";
import { atlasId } from "../model.ts";
import { countUsage } from "../usage.ts";
import { morph } from "../morph.ts";
import * as workspace from "../workspace.ts";

export class ChatActions extends ActionCore {
  /** The page the Chats page returns to, kept up to date while you're anywhere else. */
  protected conversationReturn = "";

  /** The "start a room" dialog, with these agents already picked. */
  newRoom = (memberIds: string[] = []) => this.ui.set({ roomDraft: { title: "", memberIds } });
  /** Starts a room with the agents you picked; one agent opens their own chat. */
  startRoom = (title: string, memberIds: string[]) => {
    try {
      const id = this.conversations.startRoom(title, memberIds);
      this.ui.set({ roomDraft: null });
      this.chatWith(id);
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Could not start this room.");
    }
  };
  deleteRoom = (id: string, title: string) => this.ui.set({ confirming: {
    title: `Delete “${title}”?`,
    body: "The conversation goes for good. Tasks the agents added stay where they are.",
    action: "Delete chat",
    danger: true,
    run: () => { if (this.apply((d) => workspace.deleteThread(d, id))) this.toast("Chat deleted."); },
  } });
  showAtlas = () => {
    // The Chats page already shows the picked thread.
    if (this.session.view === "chats") return;
    morph(() => this.shell.current?.showChat());
  };
  /** Opens a conversation in the panel and keeps it there while you stay in this place; on the Chats page, as its tab. */
  chatWith = (id: string) => {
    if (this.session.view === "chats") return this.openConversation(id);
    this.conversations.pickChat(id);
    this.showAtlas();
  };
  /** Opens a conversation on the Chats page (D27) as a tab: from the roster, the picker, history, or moved out of the side panel. */
  openConversation = (id: string) => {
    this.conversations.openChat(id);
    if (this.session.view !== "chats") this.openTab("chats");
  };
  /** Back to the page you came from, optionally keeping this conversation open beside it. */
  leaveConversation = (dock: boolean) => {
    const id = this.shown.chat.threadId;
    const back = this.conversationReturn || "today";
    // One view transition: the page's chat shrinks into the side panel, or the page simply returns.
    morph(() => {
      this.openTab(back);
      if (!dock) return;
      this.conversations.pickChat(id);
      this.shell.current?.showChat();
    });
  };
  /** Remembers the page the Chats page returns to; App calls it whenever you're anywhere else. */
  rememberReturn = (key: string) => { this.conversationReturn = key; };
  closeChatTab = (id: string) => { if (!this.conversations.closeChat(id)) this.leaveConversation(false); };
  /** The Logbook (D19), every conversation or one chat's ("" for everyone), on the Chats page's own tab. */
  showLogbook = (who: string) => {
    this.ui.set({ logbookLimit: 120, logbookWho: who, logbookShow: "all" });
    this.openTab("logbook");
  };
  closePanel = () => morph(() => { void this.updateSession({ agentOpen: false }); });
  /** Moving the chat into the page closes the panel, so closing the page later doesn't bring a second copy back. */
  expandChat = () => {
    const id = this.shown.chat.threadId;
    morph(() => { void this.updateSession({ agentOpen: false }); this.openConversation(id); });
  };
  attachNote = (id: string) => {
    this.conversations.attach(this.shown.chat.threadId, id);
    this.showAtlas();
    this.toast("Attached to this conversation. Other notes stay outside it unless the agent looks after them.");
  };
  /** Ask about this: attaches the note, quotes the selected words into the message box and puts the caret after them. */
  askAbout = (id: string, quote: string) => {
    const lines = quote.trim().split("\n").map((line) => `> ${line}`.trimEnd()).join("\n");
    const draft = this.session.chatDraft.trim();
    void this.updateSession({ chatDraft: `${draft ? `${draft}\n\n` : ""}${lines}\n\n` });
    this.attachNote(id);
    this.ui.set({ compose: Date.now() });
  };
  requestFreshProposal = async (threadId: string, proposalId: string) => {
    try { await this.conversations.requestFreshProposal(threadId, proposalId); }
    catch (cause) { this.toast(cause instanceof Error ? cause.message : "Couldn't request a fresh proposal."); }
  };
  /** Your answer to an agent's question for another agent (agents-design D50); the asked agent's reply follows in the chat. */
  handleAsk = async (threadId: string, askId: string, action: "send" | "always" | "decline", question?: string) => {
    try {
      const answered = this.conversations.actOnAsk(threadId, askId, action, question);
      countUsage(action === "send" ? "ask_sent" : action === "always" ? "ask_always" : "ask_declined");
      this.toast(action === "decline" ? "Declined. Nothing was sent." : action === "always" ? "Sent. From now on they ask each other without you; Permissions lists who." : "Sent.");
      await answered;
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Couldn't send the question.");
    }
  };
  /** A memory's Undo on the reply that saved it (agents-design D49). */
  unremember = (threadId: string, messageId: string, memoryId: string) => {
    try {
      this.conversations.unremember(threadId, messageId, memoryId);
      countUsage("memory_undone");
      this.toast("Forgotten.");
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Couldn't take that back.");
    }
  };
  /** Keep, Not this or Undo on where something is on a computer, as a reply offered to remember it (agents-design D80). */
  learn = (threadId: string, messageId: string, memoryId: string, action: "keep" | "decline" | "undo") => {
    try {
      this.conversations.learn(threadId, messageId, memoryId, action);
      countUsage(action === "keep" ? "memory_learned_kept" : action === "decline" ? "memory_learned_declined" : "memory_undone");
      this.toast(action === "keep" ? "Kept." : action === "decline" ? "Not kept." : "Forgotten.");
    } catch (cause) {
      this.toast(cause instanceof Error ? cause.message : "Couldn't change that.");
    }
  };
  /** Forgets a memory for good, from an agent's Briefing. */
  forgetMemory = (id: string) => {
    if (this.apply((d) => workspace.forgetMemory(d, id))?.changes.deletedMemoryIds) countUsage("memory_forgotten");
  };
  /**
   * Atlas may be mid-reply in his thread (a morning check-in runs as the app opens, which is when a phone capture
   * arrives), and a busy thread takes no new message, so the request waits for him and goes the moment he's done.
   */
  protected toAtlas(ask: () => void, waiting: string) {
    const thread = `agent:${atlasId}`;
    this.chatWith(thread);
    if (!this.conversations.getSnapshot().thinking[thread]) return ask();
    this.toast(waiting);
    const stop = this.conversations.subscribe(() => {
      if (this.conversations.getSnapshot().thinking[thread]) return;
      stop();
      ask();
    });
  }
}
