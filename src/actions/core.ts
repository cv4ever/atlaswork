// The Actions' core: the stores they act through, Workspace edits with refusals as toasts, the Session, popups and
// navigation. Each area of Actions extends the one before it (core, chat, records, crew, library, then actions.ts), so
// one stable object serves every component (docs/adr/0002) while each area keeps its own file.
import type { RefObject } from "react";
import type { Conversations } from "../conversations.ts";
import type { WorkspaceData } from "../model.ts";
import type { Away } from "../away.ts";
import type { TidyAsk } from "../tidying.ts";
import type { Records } from "../records.ts";
import type { SettingsTab, Ui, WorkbenchShellHandle } from "../ui.ts";
import type { ViewStore } from "../view.ts";
import type { Workbench } from "../workbench.ts";
import type { Change } from "../workspace.ts";

export class ActionCore {
  protected readonly workbench: Workbench;
  protected readonly conversations: Conversations;
  protected readonly ui: Ui;
  protected readonly view: ViewStore;
  protected readonly shell: RefObject<WorkbenchShellHandle | null>;
  protected readonly away: Away | null;
  /** Apply and Undo of a tidy (agents-design D79), through the agent function; signed in only. */
  protected readonly tidy: ((ask: TidyAsk) => Promise<Records>) | null;

  constructor(workbench: Workbench, conversations: Conversations, ui: Ui, view: ViewStore,
    shell: RefObject<WorkbenchShellHandle | null>, away: Away | null = null, tidy: ((ask: TidyAsk) => Promise<Records>) | null = null) {
    this.workbench = workbench;
    this.conversations = conversations;
    this.ui = ui;
    this.view = view;
    this.shell = shell;
    this.away = away;
    this.tidy = tidy;
  }

  protected get data() { return this.workbench.getSnapshot().data!; }
  protected get session() { return this.workbench.getSnapshot().session; }
  protected get shown() { return this.view.get()!; }

  toast = (text: string) => this.ui.set({ toast: text });
  /** Applies a Workspace edit to current records; a refusal shows as a toast and returns nothing. */
  apply = <T extends Change>(transition: (data: WorkspaceData) => T): T | undefined => {
    const result = this.workbench.edit(transition);
    if (typeof result !== "string") return result;
    this.toast(result);
  };
  updateSession = (patch: Parameters<Workbench["updateSession"]>[0]) => this.workbench.updateSession(patch);
  setTheme = (theme: "light" | "dark") => { void this.updateSession({ theme }); };
  setUi = (patch: Parameters<Ui["set"]>[0]) => this.ui.set(patch);

  openSettings = (tab: SettingsTab | null) => this.ui.set({ settingsTab: tab, modal: "settings" });
  /** Popups and phone layout stay here; the Workbench owns every persisted navigation decision. */
  openTab = (target: string) => {
    if (target === "profile" || target === "settings") this.openSettings(target === "profile" ? "you" : null);
    else void this.workbench.navigate(target);
    this.shell.current?.showWorkspace();
  };
  /** The sidebar and phone navigation: the Library opens on every topic. */
  navigate = (key: string) => {
    if (key === "library") this.setLibraryTopic("");
    this.openTab(key);
  };
  /** Moves within the page on screen (a domain's sections), without leaving the chat on a phone. */
  navigateTo = (key: string) => { void this.workbench.navigate(key); };
  /** Search, the tab finder, or the note picker for this conversation. */
  openSearch = (modal: "search" | "tabs" | "context") => this.ui.set({ query: "", modal });
  closeModal = () => this.ui.set({ modal: null });
  /** Opens a topic in the Library, "" for every topic; it's a Session choice, so a reload keeps it open. */
  setLibraryTopic = (id: string) => { void this.updateSession({ libraryTopic: id }); };

  /** Customize and data blocks change the page on screen; the Workbench decides whether Today's Session or a Page changes. */
  protected refused = (reason?: string) => { if (reason) this.toast(reason); };
}
