import { clear, createStore, del, get, set } from "idb-keyval";
import type { Note } from "./model.ts";
import { accountRecordsOf, allRecordsOf, workspaceOf } from "./records.ts";
import { serial } from "./storage.ts";
import type { RoutineClaim, WorkspaceStore } from "./workspace.ts";

/** Calls a Postgres function through the Supabase REST API as the signed-in user. */
export type Rpc = (name: string, body: object) => Promise<unknown>;
/**
 * Every call the app makes to its backend as the signed-in user. A signed-out `token` rejects before anything is sent,
 * with its own message; a call that can't reach the backend rejects with one offline message.
 */
export type Backend = {
  rpc: Rpc;
  /** Reads rows under row-level security, such as `entitlements?select=plan`. */
  read(path: string): Promise<Record<string, unknown>[]>;
  /** Posts to the `agent` Edge Function and hands back its response, which may stream; `signal` stops it (D63's Stop). */
  agent(body: string, signal?: AbortSignal): Promise<Response>;
  /** Posts to the `connectors` Edge Function (agents-design D74) and returns its JSON; a refusal throws its words. */
  connectors(body: object): Promise<Record<string, unknown>>;
};
/** Where file bodies stay: on the device that added them (launch plan D11, D15). */
export type FileShelf = { get(id: string): Promise<File | undefined>; set(id: string, file: File): Promise<void>; del(id: string): Promise<void> };

const shelf = createStore("atlaswork-files", "files");
export const deviceFiles: FileShelf = { get: (id) => get(id, shelf), set: (id, file) => set(id, file, shelf), del: (id) => del(id, shelf) };
/** Drops every kept file on this device, after the account they belonged to was deleted. */
export const forgetDeviceFiles = () => clear(shelf);

/** What every call says when the account can't be reached at all; outbox.ts keeps notes on the device on exactly this. */
export const offlineMessage = "Couldn't reach your account. Check your connection.";

export function createBackend({ url, key }: { url: string; key: string }, token: () => Promise<string>): Backend {
  async function send(path: string, body?: string, signal?: AbortSignal) {
    const headers = { apikey: key, Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" };
    return fetch(`${url}/${path}`, body === undefined ? { headers } : { method: "POST", headers, body, signal })
      .catch((cause: unknown) => { throw signal?.aborted ? cause : new Error(offlineMessage); });
  }
  return {
    async rpc(name, body) {
      const response = await send(`rest/v1/rpc/${name}`, JSON.stringify(body));
      if (!response.ok) {
        const refusal = await response.json().catch(() => null) as { code?: string; message?: string } | null;
        // The size cap (migration *_workspace_quota.sql) and a computer name the account already has (D84,
        // `register_computer`) say what to do; other refusals stay generic.
        const said = (refusal?.code === "53400" || refusal?.code === "23505") && refusal.message;
        throw new Error(said || `Your account refused the change (HTTP ${response.status}).`);
      }
      return response.status === 204 ? null : response.json();
    },
    async read(path) {
      const response = await send(`rest/v1/${path}`);
      if (!response.ok) throw new Error(`Your account couldn't be read (HTTP ${response.status}).`);
      return response.json();
    },
    agent: (body, signal) => send("functions/v1/agent", body, signal),
    async connectors(body) {
      const response = await send("functions/v1/connectors", JSON.stringify(body));
      const answer = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof answer.error === "string" ? answer.error : `Connections didn't answer (HTTP ${response.status}).`);
      return answer;
    },
  };
}

/**
 * The workspace in the signed-in account (`public.workspace_records`), one row per record, keyed like IndexedDB but
 * with each chat message on its own (records.ts, agents-design D76), so a reply the agent function lands and a message
 * you write meanwhile both stay. Notes go up without their file; the file stays in `files` and is put back on load, so
 * another device sees the resource without it. Writes need a connection: a failed one surfaces through the
 * Workbench's save error and retry.
 */
export function createServerStore(rpc: Rpc, files: FileShelf = deviceFiles): WorkspaceStore {
  const enqueue = serial();
  /** Shelves the files first, so a saved note never points at a file that wasn't kept; returns the rows to send. */
  async function upload(puts: [string, unknown][]) {
    const rows: Record<string, unknown> = {};
    for (const [key, value] of puts) {
      if (!key.startsWith("note:")) { rows[key] = value; continue; }
      const { file, ...note } = value as Note;
      if (file) await files.set(note.id, file);
      rows[key] = note;
    }
    return rows;
  }
  return {
    async load() {
      const data = workspaceOf(Object.entries(await rpc("load_workspace", {}) as Record<string, unknown>));
      if (data) data.notes = await Promise.all(data.notes.map(async (note) => {
        const file = await files.get(note.id);
        return file ? { ...note, file } : note;
      }));
      return data;
    },
    save(changes, before) {
      return enqueue(async () => {
        const { puts, deletes } = accountRecordsOf(changes, before);
        await rpc("save_workspace", { p_puts: await upload(puts), p_deletes: deletes });
        // Only once the server dropped the note: until then a retry still needs its file.
        await Promise.all((changes.deletedNoteIds ?? []).map((id) => files.del(id)));
      });
    },
    claimRoutine(id, due) {
      return enqueue(() => rpc("claim_routine", { p_id: id, p_due: due }) as Promise<RoutineClaim>);
    },
    replace(data) {
      // shortcut: files of notes the restore drops stay on the shelf; sweep them if device storage becomes a problem.
      return enqueue(async () => { await rpc("save_workspace", { p_puts: await upload(allRecordsOf(data, true)), p_deletes: [], p_replace: true }); });
    },
  };
}

/** On an account's first load, an empty account takes this device's workspace; one with data loads as it is. */
export function withLocalUpload(server: WorkspaceStore, local: WorkspaceStore): WorkspaceStore {
  return {
    save: (changes, before) => server.save(changes, before),
    replace: (data) => server.replace(data),
    claimRoutine: (id, due) => server.claimRoutine(id, due),
    async load() {
      const data = await server.load();
      if (data) return data;
      const mine = await local.load();
      if (mine) await server.replace(mine);
      return mine;
    },
  };
}
