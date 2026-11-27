// Folders linked to projects on this device (agents-design D47). Each link is a folder handle the browser granted
// through the File System Access API (desktop Chromium only), kept in this browser's IndexedDB beside the last listing
// of its files, never in the workspace: a handle can't sync, be backed up or move to another device. The agent loop
// pauses on `search_files`, `read_file` and `read_image` (supabase/functions/agent/logic.ts), and `run` answers them
// here with fileTools.ts, from text files and PDFs (pdf.js, loaded on the first PDF) and, shrunk, images (D58).
// Nothing in this module writes to disk.
import { createStore, del, entries, set } from "idb-keyval";
import type { UseStore } from "idb-keyval";
import { limits } from "../supabase/functions/agent/logic.ts";
import type { Folder, ToolCall } from "../supabase/functions/agent/logic.ts";
import { fileTools, pdfPages, scanFolder } from "./fileTools.ts";
import type { FileLike, OpenFolder, PdfText } from "./fileTools.ts";
import { imageForAgent } from "./images.ts";

declare global {
  interface Window { showDirectoryPicker?(options?: { mode?: "read" | "readwrite"; id?: string }): Promise<FileSystemDirectoryHandle> }
  interface FileSystemHandle {
    queryPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
    requestPermission?(descriptor: { mode: "read" }): Promise<PermissionState>;
  }
}

/** Whether this browser can link folders at all: Chromium on a desktop. */
export const folderLinks = typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

/** A project's linked folder as the page shows it. `access` is "prompt" after a restart, until Reconnect. */
export type LinkedFolder = { name: string; files: number; truncated: boolean; scanned: number; access: PermissionState };
/** What IndexedDB keeps per project id. */
type Link = { handle: FileSystemDirectoryHandle; files: string[]; truncated: boolean; scanned: number };

/** A PDF's text with pdf.js, from its first `pdfPages` pages. */
export async function pdfText(file: FileLike): Promise<PdfText> {
  // Dynamic on purpose: pdf.js and its worker are about 1.5 MB, loaded only when an agent first opens a PDF.
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const document = await task.promise;
    const read = Math.min(document.numPages, pdfPages), pages: string[] = [];
    for (let number = 1; number <= read; number++) {
      const content = await (await document.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => "str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : "").join(""));
    }
    return { text: pages.join("\n\n"), pages: document.numPages, read };
  } finally {
    void task.destroy();
  }
}
/** An image shrunk for the function; in the browser every file the tools open is a File. */
const shrunk = (file: FileLike) => imageForAgent(file as File);

/** Where a reply's agent works, by project: only projects can have a folder. */
export type ProjectPlace = { projectId: string; place: string };
/** The folders a reply may read: what the request lists, and how to answer the tools on them. */
export type ReplyFolders = { folders: Folder[]; run(call: ToolCall): Promise<string> };
/** What the engine needs from the links: the folders of one reply's places. */
export type FolderSource = { forReply(places: ProjectPlace[]): Promise<ReplyFolders> };

/**
 * This device's links, one per project, for the page (`subscribe`, `getSnapshot`), the engine (`forReply`), the agent
 * dialog's Briefing (`listed`) and the chat's Send (`reopen`). Linking and Reconnect need a click: the browser asks for
 * permission only during one.
 */
export function createFolderLinks(open: () => UseStore = () => createStore("atlaswork-folders", "links")) {
  let store: UseStore | undefined;
  const db = () => store ??= open();
  let links = new Map<string, Link>();
  let state: ReadonlyMap<string, LinkedFolder> = new Map();
  let loaded: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  // Links Send already asked about since the page loaded: a "Block" is the person's answer until they press Reconnect.
  const asked = new Set<string>();
  const accessOf = async (handle: FileSystemDirectoryHandle) => await handle.queryPermission?.({ mode: "read" }) ?? "granted";
  async function publish() {
    const next = new Map<string, LinkedFolder>();
    for (const [id, link] of links)
      next.set(id, { name: link.handle.name, files: link.files.length, truncated: link.truncated, scanned: link.scanned, access: await accessOf(link.handle) });
    state = next;
    for (const listener of listeners) listener();
  }
  const load = () => loaded ??= entries<string, Link>(db()).then(async (rows) => { links = new Map(rows); await publish(); }).catch(() => undefined);
  async function save(projectId: string, handle: FileSystemDirectoryHandle) {
    const link = { handle, ...await scanFolder(handle), scanned: Date.now() };
    links.set(projectId, link);
    await set(projectId, link, db());
    await publish();
    return link;
  }
  /**
   * The linked folders of `places` as a request lists them, from each link's last listing: a folder without access
   * keeps its listing, so the model still knows what's there and the tools say how to open it. Total files stay within
   * what the agent function takes.
   */
  function fit(places: ProjectPlace[]) {
    const opened: OpenFolder[] = [], folders: Folder[] = [];
    let room = limits.items;
    for (const { projectId, place } of places) {
      const link = links.get(projectId);
      if (!link || opened.length >= limits.folders || room <= 0) continue;
      let name = link.handle.name.slice(0, 180);
      for (let n = 2; opened.some((folder) => folder.name === name); n++) name = `${link.handle.name.slice(0, 180)} (${n})`;
      // The reply's name replaces the handle's (a duplicate's gets a number); paths past what the function takes stay out.
      const files = link.files.map((path) => name + path.slice(link.handle.name.length)).filter((path) => path.length <= 400).slice(0, room);
      room -= files.length;
      opened.push({ name, handle: link.handle, files, allowed: async () => await accessOf(link.handle) === "granted"
        || await link.handle.requestPermission?.({ mode: "read" }).catch(() => "denied") === "granted" });
      folders.push({ place, name, files });
    }
    return { opened, folders };
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      void load();
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => state,
    /** Asks for a folder and links it to the project, replacing any earlier one. Resolves false when the person cancels. */
    async link(projectId: string) {
      let handle: FileSystemDirectoryHandle;
      try { handle = await window.showDirectoryPicker!({ mode: "read", id: "atlaswork-folder" }); } catch { return false; }
      await load();
      await save(projectId, handle);
      return true;
    },
    /** Asks the browser for read access again (after a restart) and lists the folder afresh. */
    async reconnect(projectId: string) {
      const link = links.get(projectId);
      if (!link || await link.handle.requestPermission?.({ mode: "read" }).catch(() => "denied") === "denied") return publish();
      await save(projectId, link.handle);
    },
    /**
     * Asks the browser for read access to every link waiting on a Reconnect, once per page load each, so the first
     * message after a restart opens them. Call it synchronously inside the click (a chat's Send).
     */
    reopen() {
      for (const [projectId, link] of links) {
        if (state.get(projectId)?.access !== "prompt" || asked.has(projectId)) continue;
        asked.add(projectId);
        void link.handle.requestPermission?.({ mode: "read" })
          .then(async (access) => { await (access === "granted" ? save(projectId, link.handle) : publish()); }).catch(() => undefined);
      }
    },
    async unlink(projectId: string) {
      links.delete(projectId);
      await del(projectId, db());
      await publish();
    },
    /** What `forReply` would list now, without listing afresh (the agent dialog's Briefing, D46). */
    listed: (places: ProjectPlace[]) => fit(places).folders,
    /** The linked folders of `places` for one reply, listed afresh where access stands. */
    async forReply(places: ProjectPlace[]): Promise<ReplyFolders> {
      await load();
      for (const { projectId } of places) {
        const link = links.get(projectId);
        if (link && await accessOf(link.handle) === "granted") await save(projectId, link.handle).catch(() => undefined);
      }
      const { opened, folders } = fit(places);
      return { folders, run: fileTools(opened, pdfText, shrunk) };
    },
  };
}

/** This browser's links. */
export const linkedFolders = createFolderLinks();
