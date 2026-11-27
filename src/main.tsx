import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { startUpdates } from "./update.ts";
import { createAgentEngine, offlineEngine } from "./atlas.ts";
import { account, auth, backend } from "./account.ts";
import { createAway } from "./away.ts";
import { deviceOutbox, withOutbox } from "./outbox.ts";
import { createServerStore, withLocalUpload } from "./cloud.ts";
import { Tips } from "./Popups.tsx";
import { linkedFolders } from "./folders.ts";
import { createLiveEngine } from "./live.ts";
import { previewStanding } from "./allowance.ts";
import { accountModel, finishOpenRouter } from "./ownModel.ts";
import { clearWorkspace, indexedDbStore } from "./storage.ts";
import { withStarter } from "./starter.ts";
import { skin } from "./skin.ts";
import { countUsage } from "./usage.ts";
import "./styles.css";
import "./WorkbenchShell.css";

// Errors only, no tracing or replay (launch plan D9). Sentry 11 collects user info, cookies, headers, bodies and query
// params by default; all off. Production builds with a DSN load it; others never download it.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (import.meta.env.PROD && sentryDsn) void import("@sentry/react").then(({ init }) => init({ dsn: sentryDsn,
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false } }));

skin.restoreStartup();

startUpdates();
// The dev server's tab and any home-screen shortcut to it (`pnpm run phone`) read apart from the real app.
if (import.meta.env.DEV) document.title = "Atlaswork dev";
// The one place data and agent replies are plugged in. Dev builds add the dev-only engines (dev/echo, dev/chatgpt);
// the `import.meta.env.DEV` guard lets production builds drop them entirely, which `pnpm run check` verifies.
// `?fresh` wipes this device's workspace first, so a test run starts from the demo seed, not from what the last run left;
// `?fresh=new` starts from what a new person gets instead, and `?fresh=large` (dev and `--mode speed` builds only, which
// scripts/check-speed.mjs times) from the demo plus a year of records. A never-saved workspace otherwise gets the starter.
// On the dev server `?fresh=new` also forgets this device's dev model choices (echo, the ChatGPT plan), so the first run
// shows what a new person sees, and `?as=trial` shows it as a new account on the trial, signed out (agents-design D48).
// Signed in (launch plan D15), the workspace lives in the account and agents answer live; signed out, both stay here.
const params = new URLSearchParams(location.search);
// Signed in, `fresh` is dropped: wiping the device copy under an account only makes the next load conflict (HTTP 409).
const fresh = params.has("fresh") && !localStorage.getItem("atlaswork.auth");
// Dev and speed builds only, so production bundles drop dev/large; elsewhere `?fresh=large` is the demo seed.
const large = (import.meta.env.DEV || import.meta.env.MODE === "speed") && fresh && params.get("fresh") === "large";
const freshNew = fresh && params.get("fresh") === "new";
const demo = fresh && !freshNew && !large;
// The app is a chunk of its own that starts loading now, beside the session check, so the first paint doesn't wait on
// a second round trip. Since 2026-11-27 the app is open to everyone (launch plan step 5): signed out, it opens the
// local workspace, and Settings → Account signs in or creates an account.
const App = lazy(() => import("./App.tsx"));
void import("./App.tsx");
const ready = fresh ? clearWorkspace().then(() => {
  params.delete("fresh");
  history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}${location.hash}`);
}) : Promise.resolve();
// The anonymous live-agent sign-in this replaced.
localStorage.removeItem("workbench.auth");
ready
  .then(async () => {
    const signedIn = !!auth && !!backend && !!(await auth.getSession()).data.session;
    // Signing in or out in another tab switches stores, so this tab reloads into the same state.
    auth?.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "SIGNED_OUT") && !!session !== signedIn) location.reload();
    });
    // Back from OpenRouter's sign-in (Settings → AI model → Connect OpenRouter): trade the code for the key first.
    const openRouterProblem = signedIn ? await finishOpenRouter() : undefined;
    if (openRouterProblem) setTimeout(() => alert(openRouterProblem));
    // Signed in, notes written without a connection wait on this device and save once it's back (outbox.ts, D56).
    const outbox = signedIn ? withOutbox(createServerStore(account!.rpc), deviceOutbox) : null;
    const records = outbox ? withLocalUpload(outbox, indexedDbStore) : indexedDbStore;
    // Dynamic so the demo seed is its own chunk, loaded only under ?fresh: a normal start doesn't download it.
    const store = large ? (await import("../dev/large/index.ts")).withLargeSeed(records) : demo ? (await import("./demo.ts")).withDemoSeed(records) : withStarter(records);
    // Signed in, the account says who answers and saves its own provider through the engine (D44, D16).
    const base = signedIn ? { ...createLiveEngine(account!), ...accountModel } : offlineEngine;
    // Dev only, dynamic so production bundles drop dev/: the browser checks' echo engine (`workbench.dev.echo`) and the
    // ChatGPT plan bridge once chosen in Settings → AI model.
    if (import.meta.env.DEV && freshNew) {
      const [{ echoKey }, { choiceKey }] = await Promise.all([import("../dev/echo/index.ts"), import("../dev/chatgpt/index.tsx")]);
      for (const key of [echoKey, choiceKey]) localStorage.removeItem(key);
    }
    const echo = import.meta.env.DEV ? (await import("../dev/echo/index.ts")).withEcho(base) : base;
    const dev = import.meta.env.DEV ? (await import("../dev/chatgpt/index.tsx")).withChatGpt(echo) : base;
    // Atlaswork's model on a 14-day trial, with nothing read or answered: Ready's model part as a new account sees it.
    const preview = import.meta.env.DEV && !signedIn && params.get("as") === "trial";
    if (preview) previewStanding({ plan: "trial", trialEndsAt: new Date(Date.now() + 14 * 864e5).toISOString(), replies: 0 });
    const adapter = preview ? { ...dev, load: async () => ({ provider: { using: "hosted" as const, own: null }, menu: null }) } : dev;
    // Folders linked to projects on this device (agents-design D47) answer agents' file tools; each tool run and each
    // reply that used files adds one to today's anonymous count (usage.ts).
    const folderEngine = createAgentEngine(adapter, {
      async forReply(places) {
        const open = await linkedFolders.forReply(places);
        let used = false;
        return { ...open, run(call) {
          if (!used) countUsage("file_reply");
          used = true;
          countUsage(call.function.name === "read_file" ? "file_read" : "files_searched");
          return open.run(call);
        } };
      },
    });
    // What replies remember (agents-design D49): each new memory and each correction adds one to today's count, so the
    // share later undone or forgotten (counted in actions.ts) shows whether agents remember the right things. A question
    // for another agent (D50) counts too, against the Sends and Declines counted there, and so does an agent Atlas
    // drafted (D57), and whether it starts from someone you have or a suggested agent, against the Saves counted there.
    // Every reply to you counts, and so does one that says it can't and proposes nothing (D61): Atlas said he couldn't
    // plant a domain or move a project on 2026-11-20, and only a test by hand showed it.
    const cant = /\b(can['’]?t|cannot|can not|unable to|not able to)\b|não (consigo|posso)|no puedo|ne peux pas|kann (ich )?nicht/i;
    const engine = { ...folderEngine, async reply(request: Parameters<typeof folderEngine.reply>[0]) {
      const reply = await folderEngine.reply(request);
      for (const memory of reply.memories ?? []) countUsage(memory.replaces ? "memory_replaced" : "memory_saved");
      if (reply.ask) countUsage("ask_proposed");
      const drafted = reply.proposal?.agent;
      if (drafted) countUsage("agent_drafted");
      if (drafted?.agentId || drafted?.from) countUsage("agent_drafted_existing");
      if (!request.routine) {
        countUsage("agent_replied");
        if (!reply.proposal && !reply.ask && cant.test(reply.text)) countUsage("agent_cant");
      }
      return reply;
    } };
    // Dynamic like the dev engines: behind the DEV guard, production bundles drop dev/ and the portrait with it.
    const portrait = import.meta.env.DEV ? (await import("../dev/profile/index.ts")).portrait : undefined;
    createRoot(document.getElementById("root")!).render(
      <StrictMode>
        <Tips><Suspense fallback={null}>
          <App store={store} engine={engine} signedIn={signedIn} portrait={portrait} away={signedIn ? createAway(account!) : null}
            outbox={outbox} readJobs={signedIn ? account!.read : undefined} />
        </Suspense></Tips>
      </StrictMode>,
    );
  });
