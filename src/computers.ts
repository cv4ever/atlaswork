// The account's computers (agents-design D77): each install of the desktop app registers as one, with a token of its
// own that only claims that computer's jobs (`public.computers`, migration 20261123200000_computers.sql). Settings →
// Account lists them with when each was last seen, its app version (D85), whether agents may search it (D78) and tidy
// it (D79), and removes one, which stops its token at once and fails the work waiting for it. Signed out, there are none.
import { account } from "./account.ts";

export type Computer = { id: string; name: string; createdAt: string; lastSeen?: string; version?: string; search: boolean; tidy: boolean };

const text = (value: unknown) => typeof value === "string" ? value : undefined;

/** Rows as PostgREST returns them, kept only when they're whole. `version` is what its helper last said (D85). */
export function computersOf(rows: unknown): Computer[] {
  return (Array.isArray(rows) ? rows : []).flatMap((row: Record<string, unknown>): Computer[] => {
    const id = text(row?.id), name = text(row?.name), createdAt = text(row?.created_at), lastSeen = text(row?.last_seen), version = text(row?.version);
    return id && name && createdAt
      ? [{ id, name, createdAt, ...lastSeen && { lastSeen }, ...version && { version }, search: row.search === true, tidy: row.tidy === true }]
      : [];
  });
}

/** The signed-in account's computers, oldest first. */
export async function listComputers(): Promise<Computer[]> {
  if (!account) return [];
  return computersOf(await account.read("computers?select=id,name,created_at,last_seen,version,search,tidy&order=created_at"));
}

/**
 * Turns one of the account's computers' search on or off (D78), from that computer's own window, so the account knows
 * agents may search there. What they may search stays on that computer.
 */
export async function setComputerSearch(id: string, on: boolean): Promise<void> {
  if (!account) return;
  if (await account.rpc("set_computer_search", { p_id: id, p_on: on }) !== true) throw new Error("That computer was removed from your account.");
}

/**
 * Turns one of the account's computers' tidying on or off (D79), from that computer's own window, so the account knows
 * agents may tidy there. Turning search off turns it off too.
 */
export async function setComputerTidy(id: string, on: boolean): Promise<void> {
  if (!account) return;
  if (await account.rpc("set_computer_tidy", { p_id: id, p_on: on }) !== true) throw new Error("That computer was removed from your account.");
}

/** Removes one of the account's computers; it fails when it's already gone. */
export async function removeComputer(id: string): Promise<void> {
  if (!account) return;
  if (await account.rpc("remove_computer", { p_id: id }) !== true) throw new Error("That computer was already removed.");
}

/** Registers this computer for the signed-in account; its token comes back this once, for the desktop app to keep. */
export async function registerComputer(name: string): Promise<Computer & { token: string }> {
  if (!account) throw new Error("Sign in first, from Settings → Account.");
  const made = await account.rpc("register_computer", { p_name: name }) as { id?: unknown; name?: unknown; token?: unknown } | null;
  const id = text(made?.id), named = text(made?.name), token = text(made?.token);
  if (!id || !named || !token) throw new Error("This computer wasn't added. Try again.");
  return { id, name: named, token, createdAt: new Date().toISOString(), search: false, tidy: false };
}
