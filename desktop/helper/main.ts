// The desktop app's helper (agents-design D77): a compiled Deno program the app starts once this computer is paired.
// It reads its settings from the first line on stdin (the computer's token, the project's address and publishable
// key, the folders linked on this computer, its search list while search is on, D78, and the app's version, D85), and
// each later line is the folders and the search list again after either changed, or what the app did with a tidy job.
// It asks for this computer's next job (`computer_poll`, which records the version) every 10 s, and every 3 s while its
// account has a job open or had one in the last minute (D84), runs each one here (job.ts) and has the agent function
// land it. It keeps the search index of its
// search list (search.ts) in its working folder, refreshed when it starts, when the list changes and every 15
// minutes, and answers from it the searches another of the account's computers asks of this one (D84). On its stdout
// it asks the app to show a file or folder a reply found, for a request asked in the app's own window with this
// start's window key (D78), and hands it a tidy job's moves (D79, tidy.ts); the app checks again before either. It
// stops when the app closes its stdin, and when the app asks it to finish so it can update (D85, finish.ts), once it
// holds no work. It exits with 3 when the account no longer knows its token, so the app forgets it. It logs what
// happened, never what was asked, answered or found.
import { AgentError } from "../../supabase/functions/agent/logic.ts";
import { partsOf } from "../../supabase/functions/agent/searches.ts";
import type { Answer } from "../../supabase/functions/agent/searches.ts";
import { imageForAgent, officeOf, pdfText } from "./files.ts";
import { finishing } from "./finish.ts";
import { runJob } from "./job.ts";
import type { Claimed, LocalFolder, Server } from "./job.ts";
import { openIndex } from "./search.ts";
import type { SearchFolder } from "./search.ts";
import { appOn, runTidy } from "./tidy.ts";

/**
 * `windowKey` is this start of the app's (D78): only a request that carries it may show a file on the screen. `version`
 * is the app's (D85), absent from an app before it.
 */
type Settings = { token: string; supabaseUrl: string; publishableKey: string; folders: LocalFolder[]; search: SearchFolder[]; windowKey: string; version?: string };

/** How long the helper waits between asks while nothing waits for this computer, and while its account is busy (D84). */
const idleMs = 10_000, busyMs = 3_000;
/** The exit code for a token the account no longer knows. */
const removed = 3;
/** How often the search index looks for new, changed and gone files. */
const reindexMs = 15 * 60_000;

const log = (line: string) => console.error(`${new Date().toISOString()} ${line}`);

const foldersOf = (value: unknown): LocalFolder[] => Array.isArray(value)
  ? value.filter((folder) => typeof folder?.id === "string" && folder.id && typeof folder?.name === "string" && typeof folder?.path === "string") : [];
const searchOf = (value: unknown): SearchFolder[] => Array.isArray(value)
  ? value.filter((folder) => typeof folder?.name === "string" && folder.name && typeof folder?.path === "string" && folder.path) : [];
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** What the helper may open now, for the log. */
const opens = (settings: Settings) =>
  `${count(settings.folders.length, "linked folder", "linked folders")}, ${count(settings.search.length, "folder", "folders")} to search`;

/** Showing a file (D78): the ask goes to the app on stdout, one JSON line, with the key the app checks first. */
const showFor = ({ windowKey: key }: Settings) => key
  ? { key, open: (path: string) => console.log(JSON.stringify({ show: { key, path } })) } : undefined;

function settingsOf(line: string): Settings {
  const value = JSON.parse(line) as Partial<Settings>;
  if (typeof value.token !== "string" || !value.token.startsWith("awc_") || typeof value.supabaseUrl !== "string" || typeof value.publishableKey !== "string")
    throw new Error("the app sent no usable settings");
  return {
    token: value.token, supabaseUrl: value.supabaseUrl.replace(/\/+$/, ""), publishableKey: value.publishableKey,
    folders: foldersOf(value.folders), search: searchOf(value.search), windowKey: typeof value.windowKey === "string" ? value.windowKey : "",
    ...typeof value.version === "string" && /^\d{1,4}\.\d{1,4}\.\d{1,6}$/.test(value.version) && { version: value.version },
  };
}

/** The agent function, as this computer: each call names the job, and a refusal throws with the function's words. */
function serverFor(settings: Settings): Server {
  const ask = async (job: string, body: Record<string, unknown>) => {
    const response = await fetch(`${settings.supabaseUrl}/functions/v1/agent`, {
      method: "POST", headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ job, ...body }),
    });
    const answer = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (response.status === 403) throw new Removed();
    if (!response.ok || !answer) throw new AgentError(typeof answer?.error === "string" ? answer.error : `the agent function answered ${response.status}`);
    return answer;
  };
  return {
    model: (job, messages, tools) => ask(job, { model: { messages, ...tools && { tools } } }) as never,
    see: (job, messages) => ask(job, { see: { messages } }) as never,
    outside: (job, call) => ask(job, { outside: call }) as never,
    progress: (job, step) => ask(job, { progress: step }),
    land: (job, answered) => ask(job, { land: answered }),
    fail: (job, reason) => ask(job, { fail: reason }),
    tidied: (job, outcome) => ask(job, { tidied: outcome }),
    search: async (job, query) => partsOf(await ask(job, { search: query })),
    move: (job, move) => ask(job, { move }),
  };
}

class Removed extends Error {}

/**
 * This computer's next job, or null, whether its account has a job open or had one in the last minute, and a search
 * another of its computers asks of this one (D84), or null.
 */
async function poll(settings: Settings): Promise<{ job: Claimed | null; busy: boolean; search: { id: string; query: string } | null }> {
  const response = await fetch(`${settings.supabaseUrl}/rest/v1/rpc/computer_poll`, {
    method: "POST", headers: { apikey: settings.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: settings.token, ...settings.version && { p_version: settings.version } }),
  });
  if (response.status === 403) throw new Removed();
  if (!response.ok) throw new Error(`computer_poll answered ${response.status}`);
  const answer = await response.json() as { job?: Claimed | null; busy?: boolean; search?: { id?: unknown; query?: unknown } | null } | null;
  const search = typeof answer?.search?.id === "string" && typeof answer.search.query === "string" ? { id: answer.search.id, query: answer.search.query } : null;
  return { job: answer?.job ?? null, busy: answer?.busy === true, search };
}

/** Sends this computer's part of another computer's search (D84); the account takes it once, for the ask it claimed. */
async function answerSearch(settings: Settings, id: string, answer: Answer) {
  const response = await fetch(`${settings.supabaseUrl}/rest/v1/rpc/answer_search`, {
    method: "POST", headers: { apikey: settings.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ p_token: settings.token, p_id: id, p_answer: answer }),
  });
  if (response.status === 403) throw new Removed();
  if (!response.ok) throw new Error(`answer_search answered ${response.status}`);
}

async function main() {
  const lines = Deno.stdin.readable.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  while (!buffer.includes("\n")) {
    const chunk = await lines.read();
    if (chunk.done) return;
    buffer += chunk.value;
  }
  const settings = settingsOf(buffer.slice(0, buffer.indexOf("\n")));
  buffer = buffer.slice(buffer.indexOf("\n") + 1);
  // One refresh at a time: a change while one reads makes it read again once it ends.
  const index = openIndex();
  let reading = false, again = false;
  const reindex = async () => {
    if (reading) { again = true; return; }
    reading = true;
    try {
      do {
        again = false;
        const started = Date.now();
        const done = await index.refresh(settings.search, pdfText).catch((cause) => { log(`the search index couldn't be kept: ${cause}`.slice(0, 200)); });
        if (done && settings.search.length) {
          log(`search index: ${done.files} files, ${done.texts} with their text${done.full ? " (full)" : ""}, in ${Math.round((Date.now() - started) / 1000)} s`);
        }
      } while (again);
    } finally { reading = false; }
  };
  // The app makes a tidy's moves (D79) and answers on stdin.
  const app = appOn((line) => console.log(line));
  // The app keeps stdin open while it runs, sending the folders and the search list again when either changes, and
  // what it did with a tidy job; when it closes, so does this. Before it updates it asks this to finish (D85).
  const finish = finishing();
  const stop = () => {
    log("finished, so the app can update");
    Deno.exit(0);
  };
  void (async () => {
    for (;;) {
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        try {
          const changed = JSON.parse(buffer.slice(0, end));
          if ("finish" in changed) {
            if (finish.ask()) stop();
          } else if ("tidied" in changed) app.heard(changed.tidied);
          else {
            const list = JSON.stringify(settings.search);
            settings.folders = foldersOf(changed.folders);
            settings.search = searchOf(changed.search);
            log(`now ${opens(settings)}`);
            if (JSON.stringify(settings.search) !== list) void reindex();
          }
        } catch { log("the app sent a line that couldn't be read"); }
        buffer = buffer.slice(end + 1);
      }
      const chunk = await lines.read();
      if (chunk.done) Deno.exit(0);
      buffer += chunk.value;
    }
  })();
  const server = serverFor(settings);
  log(`started${settings.version ? ` (app ${settings.version})` : ""} with ${opens(settings)}`);
  void reindex();
  setInterval(() => void reindex(), reindexMs);
  // An outage is logged when it starts and when it ends, not on every ask.
  let unreachable = "";
  let busy = false;
  for (;;) {
    // An update waits for the work this holds: once the app asked, none starts and the helper stops after it.
    if (!finish.begin()) stop();
    try {
      const asked = await poll(settings);
      const job = asked.job;
      busy = asked.busy;
      if (unreachable) log("reached the account again");
      unreachable = "";
      // Another computer's search first (D84): its reply waits at most 15 s for this part.
      if (asked.search) {
        const found = index.find(asked.search.query, settings.search);
        await answerSearch(settings, asked.search.id, { hits: found.found.map(({ path, changed, line }) => ({ path, changed, line })),
          all: found.all, files: found.files, reading: found.reading });
        log(`answered a search from another computer: ${found.found.length} files`);
      }
      if (job?.kind === "tidy") {
        log(`job ${job.id}: ${await runTidy(job, server, app.ask)}`);
        continue;
      }
      if (job) {
        // A job searches the list as it stands when it starts, while search is on here (D78).
        const search = settings.search.length ? { folders: [...settings.search], find: index.find } : undefined;
        log(`job ${job.id}: ${await runJob(job, server, { folders: settings.folders, search, show: showFor(settings) }, { pdf: pdfText, image: imageForAgent, office: officeOf })}`);
        continue;
      }
    } catch (cause) {
      if (cause instanceof Removed) {
        log("this computer was removed from its account");
        Deno.exit(removed);
      }
      const why = cause instanceof Error ? cause.message.slice(0, 120) : "unexpected";
      if (why !== unreachable) log(`couldn't reach the account: ${why}`);
      unreachable = why;
    } finally {
      if (finish.end()) stop();
    }
    await new Promise((resolve) => setTimeout(resolve, busy ? busyMs : idleMs));
  }
}

await main();
