// The desktop app's bridge (agents-design D77, desktop/src-tauri): inside Atlaswork for Windows the page can ask what
// the app knows, pair this computer with a token the account issued, forget it, link a folder on it through the app's
// own folder picker or unlink one, turn search on or off and edit its list (D78), turn tidying on or off (D79), and
// show a notification. In a browser there's no bridge and `desktop` is null.
export type DesktopComputer = { id: string; name: string };
/** A folder on this computer's search list (D78): the name a match's path starts with, and where it is. */
export type SearchFolder = { name: string; path: string };
/** How much this computer's search index holds: files found, how many with their text, and when a refresh last ended. */
export type SearchIndex = { files: number; texts: number; reading: boolean; at?: string; full?: boolean };
/**
 * This computer's search: whether it's on, its list, the usual folders (Documents, Desktop…) not on it yet, and while
 * it's on, its index. `tidy` says agents may tidy here (D79), which needs `documents`: Documents on the list, where
 * they make their folders.
 */
export type DesktopSearch = { on: boolean; folders: SearchFolder[]; offered: SearchFolder[]; tidy: boolean; documents: boolean;
  index?: SearchIndex | null };
/** `windowKey` is a secret this start of the app gives only its own window (D78), to mark a request asked here. */
export type DesktopInfo = { version: string; deviceName: string; computer: DesktopComputer | null; search: DesktopSearch; windowKey: string };
/** A folder linked on this computer as the app keeps it: the id the workspace names it by, its name and where it is. */
export type LocalFolder = { id: string; name: string; path: string };

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
const invoke = typeof window === "undefined" ? undefined
  : (window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } }).__TAURI__?.core?.invoke;

export const desktop = invoke ? {
  info: () => invoke<DesktopInfo>("desktop_info"),
  /** Keeps the computer's token in Windows Credential Manager once the person confirms in the app's own dialog. */
  pair: (computer: DesktopComputer & { token: string }) => invoke<void>("pair", computer),
  unpair: () => invoke<void>("unpair"),
  /** Asks for a folder in Windows' own picker and keeps it as `id`, in place of `replaces`; null when the person cancels. */
  linkFolder: (id: string, replaces?: string) => invoke<LocalFolder | null>("link_folder", { id, replaces: replaces ?? null }),
  unlinkFolder: (id: string) => invoke<void>("unlink_folder", { id }),
  setSearch: (on: boolean) => invoke<DesktopSearch>("set_search", { on }),
  /** Needs search on and Documents on the list; losing either turns it off. */
  setTidy: (on: boolean) => invoke<DesktopSearch>("set_tidy", { on }),
  /** Adds one of the offered folders, by its path, or else one picked in Windows' own picker; null when cancelled. */
  addSearchFolder: (path?: string) => invoke<DesktopSearch | null>("add_search_folder", { path: path ?? null }),
  removeSearchFolder: (path: string) => invoke<DesktopSearch>("remove_search_folder", { path }),
  notify: (title: string, body: string) => invoke<void>("notify", { title, body }),
} : null;

/**
 * Where a chat reply asked in this app's window is (D78): this computer, while it's paired, and this start's window
 * key, which its helper and app check before showing a file on this screen. Nothing in a browser.
 */
export async function windowHere(): Promise<{ computer: string; key: string } | undefined> {
  const info = await desktop?.info().catch(() => null);
  return info?.computer && info.windowKey ? { computer: info.computer.id, key: info.windowKey } : undefined;
}

/**
 * The name a new computer starts with: Windows' own name, unless it's one Windows made up (DESKTOP-4F2K1AB), then
 * "<your name>'s computer".
 */
export function computerName(deviceName: string, person: string): string {
  const made = !deviceName.trim() || /^(DESKTOP|LAPTOP|WIN)-[A-Z0-9]+$/i.test(deviceName.trim());
  return made ? person.trim() ? `${person.trim()}'s computer` : "This computer" : deviceName.trim().slice(0, 80);
}
