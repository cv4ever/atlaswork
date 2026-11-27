// What Capture, the Library and the pages do: saving captures and files (sorted by Atlas, D53), resources, topics,
// page blocks, and what a home-screen shortcut or Share opened the app to do (D52).
import { CrewActions } from "./crew.ts";
import { atlasId, domainHues, kindLabels, kindOf } from "../model.ts";
import { shownBlocks } from "../blocks.ts";
import { addDays, formatDate } from "../dates.ts";
import type { Note, Topic } from "../model.ts";
import { newPerson as personPart, personHues } from "../people.ts";
import type { Block } from "../blocks.ts";
import type { LaunchIntent } from "../launch.ts";
import { domainKey, homeKey, parseHome, placeName, tabKey } from "../place.ts";
import { countUsage } from "../usage.ts";
import * as workspace from "../workspace.ts";
import type { ResourceDraft } from "../workspace.ts";

export class LibraryActions extends CrewActions {
  /** The capture dialog, saving to `place`: where you are unless something says otherwise; `listen` opens it listening. */
  openCapture = (place = this.shown.screen.home, link = false, listen = false) => this.ui.set({ query: "", capture: { place, link, listen } });
  /** Needs you: Chats with its rail closed and All chats open, what waits on you first (a shortcut, or holding Chat). */
  openNeedsYou = () => {
    void this.updateSession({ chatRail: "" });
    this.ui.set({ pickChats: true });
    this.openTab("chats");
  };
  /**
   * What the app was opened to do from a home-screen shortcut or Android's Share sheet (launch.ts, agents-design D52).
   * A share opens Capture with its text, and Speak opens it listening (D53), both saving to Everyday unless that domain
   * is gone.
   */
  runLaunch = (intent: LaunchIntent) => {
    countUsage(intent.kind === "share" ? "share_opened" : intent.kind === "open" ? "push_opened" : `shortcut_${intent.kind}`);
    if (intent.kind === "open") return this.openConversation(intent.thread);
    if (intent.kind === "note") return this.newNote();
    if (intent.kind === "atlas") return this.chatWith(`agent:${atlasId}`);
    if (intent.kind === "today") return this.openTab("today");
    if (intent.kind === "needs") return this.openNeedsYou();
    const everyday = this.shown.data.domains.some((domain) => domain.name === "Everyday" && !domain.archived);
    const place = everyday ? domainKey("Everyday") : this.shown.screen.home;
    this.ui.set({ query: "", capture: intent.kind === "voice" ? { place, listen: true } : { place, text: intent.text } });
  };
  /**
   * Saves a capture. A new note opens straight in a tab on larger screens (writing needs room); on a phone you stay
   * where you were and the toast offers Open, unless the note is blank, which only makes sense opened. The toast offers
   * Undo while it's untouched, and for words, Sort with Atlas (agents-design D53), so a plain save can still be sorted.
   * Words captured away from the desk (shared, or opened listening) join the unsorted pile its domain's brief offers.
   */
  saveCapture = (draft: ResourceDraft, place: string) => {
    const from = this.ui.get().capture;
    const away = !!(from?.listen || from?.text) && (draft.kind === "note" || draft.kind === "quote");
    const change = this.apply((d) => workspace.createResource(d, away ? { ...draft, unsorted: true } : draft, place));
    if (!change) return;
    const note = change.resource;
    this.ui.set({ capture: null });
    const tab = tabKey({ kind: "resource", id: note.id });
    const blank = kindOf(note) === "note" && !note.title && !note.body;
    const phone = matchMedia("(max-width: 760px)").matches;
    if (kindOf(note) === "note" && (blank || !phone)) this.openTab(tab);
    if (blank) return;
    const toast = `Saved “${note.title || kindLabels[kindOf(note)]}” to ${placeName(change.data, place)}.`;
    this.ui.set({ toast, toastAction: { for: toast, buttons: [
      ...phone ? [{ label: "Open", run: () => this.openTab(tab) }] : [],
      { label: "Undo", run: () => {
        if (this.data.notes.find((item) => item.id === note.id)?.updatedAt !== note.updatedAt) return this.toast("It changed since you saved it, so it stays. Delete it from its page if you meant to.");
        if (this.apply((d) => workspace.deleteForever(d, { kind: "note", id: note.id }))) this.toast("Taken back.");
      } },
      ...["note", "quote"].includes(kindOf(note)) ? [{ label: "Sort with Atlas", run: () => this.sortWithAtlas(note.id) }] : [],
    ] } });
  };
  /** Capture with several files: each becomes a resource in the same place, saved together, one toast and one Undo for all. */
  saveFiles = (drafts: ResourceDraft[], place: string) => {
    const change = this.apply((d) => workspace.createResources(d, drafts, place));
    if (!change) return;
    this.ui.set({ capture: null });
    const made = change.resources;
    const toast = `Saved ${made.length} files to ${placeName(change.data, place)}.`;
    this.ui.set({ toast, toastAction: { for: toast, buttons: [{ label: "Undo", run: () => {
      if (made.some((note) => this.data.notes.find((item) => item.id === note.id)?.updatedAt !== note.updatedAt))
        return this.toast("Some of them changed since you saved them, so they stay. Delete them from their page if you meant to.");
      if (this.apply((d) => workspace.deleteResources(d, made.map((note) => note.id)))) this.toast("Taken back.");
    } }] } });
  };
  /** Capture's Save as Task: the words become a task where Save to says, due when you picked, with Undo while it's untouched. */
  saveCaptureTask = (title: string, due: string, place: string) => {
    const change = this.apply((d) => workspace.createTask(d, { title, due, done: false }, place));
    const task = change?.changes.tasks?.[0];
    if (!change || !task) return;
    this.ui.set({ capture: null });
    const today = this.shown.today;
    const when = !due ? "" : due === today ? " for today" : due === addDays(today, 1) ? " for tomorrow"
      : ` for ${formatDate(new Date(`${due}T12:00:00`), { weekday: "long", day: "numeric", month: "short" })}`;
    const toast = `Added “${task.title}” to ${placeName(change.data, place)}${when}.`;
    this.ui.set({ toast, toastAction: { for: toast, buttons: [{ label: "Undo", run: () => {
      if (this.apply((d) => workspace.withdrawTask(d, task))) this.toast("Taken back.");
    } }] } });
  };
  /**
   * Capture's Turn it into: closes Capture and opens the project, topic or domain form with your words as its name,
   * a project in the domain Save to points at.
   */
  captureAs = (kind: "project" | "topic" | "domain", words: string, place: string) => {
    const name = words.trim().split("\n")[0].slice(0, 80);
    this.ui.set({ capture: null });
    if (kind === "domain") {
      this.newDomain();
      const draft = this.ui.get().domainDraft;
      return draft && this.ui.set({ domainDraft: { ...draft, domain: { ...draft.domain, name: name.slice(0, 40) } } });
    }
    if (kind === "topic") return this.ui.set({ topicDraft: { id: crypto.randomUUID(), name: name.slice(0, 40), emoji: "📚", description: "" } });
    const home = parseHome(place);
    const area = home.kind === "domain" ? home.name : home.kind === "project" ? this.data.projects.find((project) => project.id === home.id)?.area : undefined;
    this.ui.set({ projectForm: this.projectStart(area ?? this.session.domain, { title: name }) });
  };
  /**
   * Capture's Sort with Atlas (agents-design D53): what you wrote, kept as a note where Capture saves it (the source,
   * whatever Atlas makes of it), goes to Atlas's chat attached, with a request to sort it into tasks and notes.
   */
  sortCapture = (draft: ResourceDraft, place: string) => {
    const change = this.apply((d) => workspace.createResource(d, draft, place));
    if (!change) return;
    this.ui.set({ capture: null });
    this.sortWithAtlas(change.resource.id);
  };
  sortWithAtlas = (noteId: string) => {
    const note = this.data.notes.find((item) => item.id === noteId);
    if (!note) return;
    countUsage("capture_sorted");
    this.apply((d) => workspace.markSorted(d, noteId));
    const thread = `agent:${atlasId}`;
    this.toAtlas(() => {
      this.conversations.attach(thread, noteId);
      void this.conversations.send(thread, "Sort this capture for me: what to do as tasks where they belong, with the days I named, and notes for what's worth keeping.",
        placeName(this.data, homeKey(note)));
    }, "Atlas is finishing a reply. Your capture goes to him right after.");
  };
  newNote = (place = this.shown.screen.home) => this.saveCapture({ kind: "note" }, place);
  setLinked = (id: string, projectId: string, linked: boolean) => {
    const change = this.apply((d) => workspace.setResourceLinked(d, id, projectId, linked));
    if (change) this.toast(`${linked ? "Linked into" : "Unlinked from"} ${placeName(change.data, projectId)}.`);
    return !!change;
  };
  /** Gives a resource a new home; a project it moves into stops being a link. */
  moveResource = (id: string, place: string) => {
    const change = this.apply((d) => workspace.moveResource(d, id, place));
    if (change) this.toast(`Moved to ${placeName(change.data, place)}.`);
  };
  /** Makes a topic from a picker; returns its place key, or nothing when the name is empty or taken. */
  createTopic = (name: string) => {
    const topic: Topic = { id: crypto.randomUUID(), name, emoji: "📚", description: "" };
    if (this.apply((d) => workspace.saveTopic(d, topic))) return homeKey({ domain: "", topicId: topic.id });
  };
  newTopic = () => this.ui.set({ topicDraft: { id: crypto.randomUUID(), name: "", emoji: "📚", description: "" } });
  /** The person dialog (D71), named when a mention offered "New person"; they belong to Family when there is one. */
  newPerson = (name = "") => {
    const domains = this.data.domains.filter((domain) => !domain.archived);
    const domain = domains.find((item) => item.name === "Family")?.name ?? domains[0]?.name ?? "";
    this.ui.set({ topicDraft: { id: crypto.randomUUID(), name, emoji: "📚", description: "", person: personPart(domain, domainHues.Clay) } });
  };
  /** Opens a person's page in the Library. */
  openPerson = (id: string) => { this.setLibraryTopic(id); this.openTab("library"); };
  /** A date on Today's horizon: a person's opens their page (D71), a page's its tab. */
  openDated = (item: { open: string; person?: string }) => item.person ? this.openPerson(item.person) : this.openTab(item.open);
  /** People picked from the phone's contacts in Settings (D71), into `domain`; returns who came in. */
  importPeople = (picked: { name: string; photo?: string }[], domain: string) => {
    const change = this.apply((d) => workspace.addPeople(d, picked, domain, personHues.map(([, hue]) => hue)));
    const added = change?.added ?? [];
    const skipped = picked.length - added.length;
    this.toast(added.length ? `Added ${added.length === 1 ? added[0] : `${added.length} people`} to your Library${skipped ? `; ${skipped} ${skipped === 1 ? "was" : "were"} already there` : ""}.`
      : "Everyone you picked is already in your Library.");
    return added;
  };
  saveTopicDraft = (draft: Topic) => {
    const created = !this.data.topics.some((topic) => topic.id === draft.id);
    // A date without a day isn't kept; one without a label is called Date.
    const clean = draft.person ? { ...draft, person: { ...draft.person, relation: draft.person.relation.trim(),
      dates: draft.person.dates.filter((date) => date.date).map((date) => ({ ...date, label: date.label.trim() || "Date" })) } } : draft;
    if (!this.apply((d) => workspace.saveTopic(d, clean))) return;
    const name = draft.name.trim();
    this.ui.set({ topicDraft: null, toast: !created ? `Saved ${name}.` : draft.person ? `${name} is in People.` : `${draft.emoji} ${name} is on the shelf.` });
  };
  /** Click peeks; Ctrl/Cmd/middle-click opens a tab in the current domain. */
  openResource = (note: Note, tab: boolean, order: string[]) => {
    if (!tab) return this.ui.set({ peek: { id: note.id, order } });
    this.ui.set({ peek: null });
    this.openTab(tabKey({ kind: "resource", id: note.id }));
  };
  arrangePage = (blocks: Block[]) => this.refused(this.workbench.arrangePage(this.shown.screen.page.place, blocks, this.shown.today));
  resetPage = () => this.refused(this.workbench.resetPage(this.shown.screen.page.place, this.shown.today));
  purgeBlock = (id: string) => this.refused(this.workbench.purgeBlock(this.shown.screen.page.place, id));
  /** Saves one block of the page on screen, its view or what it logged. */
  changeBlock = (next: Block) => this.arrangePage(shownBlocks(this.shown.screen.page.blocks).map((item) => item.id === next.id ? next : item));
}
