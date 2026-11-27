# Developing Atlaswork

How to run, change, check and release Atlaswork. The project overview is [README.md](README.md).

## Run

From a clone of this repo, with Node 22 and pnpm:

```sh
pnpm install
pnpm run dev
```

Open http://127.0.0.1:5191/. Without a backend in `.env.local` the app runs signed out, keeping its data in the browser, with agents offline; "Supabase" below sets up your own backend.

```sh
pnpm run build
pnpm run preview
```

Production preview uses http://127.0.0.1:5190/ and supports offline startup after its first online visit.
New builds activate automatically instead of waiting for an unimplemented update prompt.
Refresh to check for updates.
A tab still running the original prompt-mode build may need a second refresh after the update installs.

### Supabase

The backend (launch plan D3) lives in `supabase/`: `config.toml`, migrations and Edge Functions (Deno).
The CLI is pinned as a dev dependency, so run it as `pnpm exec supabase …` from this folder.
This checkout is linked to the hosted project `workbench` (ref `mcihsugblojunfpuohim`, Paris).
On drdoom the CLI is logged in through its stored token, named `omp-engineer-drdoom`.

- **Local stack:** `pnpm exec supabase start` starts the stack in Docker Desktop: Postgres on 54322, the API and Edge Functions on 54321, Studio on 54323.
  The first start pulls about 2 GB of images.
  It binds to every interface with well-known default keys and an unauthenticated Studio, so stop it when you're done (`pnpm exec supabase stop`) and never put real data in it.
- **Functions:** `pnpm exec supabase functions new <name>` creates one and `pnpm exec supabase functions serve` runs it locally. Deploy with `pnpm exec supabase functions deploy <name>`. Function secrets are set with `supabase secrets set` from Bitwarden placeholders, never committed.
- **Database changes:** run `pnpm exec supabase migration new <name>`, test against the local stack (`pnpm exec supabase db reset`, then `pnpm exec supabase test db`), then apply them to the hosted project with `pnpm exec supabase db push --remote` (without `--remote` the CLI targets the local stack; in an agent run it refuses to apply until you confirm and rerun with `--yes`, so ask Carlos first).
  `supabase/tests/database/` holds the security tests (who may read, write or call what); add a case there for every new grant or policy.
  CI runs them when `supabase/**` changes (`.github/workflows/database.yml`).
- **Connections** (agents-design D74, Google Calendar): the `connectors` function connects an account (Google's consent page and `/callback`), disconnects, adds events and lists the calendars you show; the agent and routines functions read the calendar with the stored grant (`supabase/functions/agent/calendar.ts`), on the calendars and rung each agent's access allows (D83, set in Settings → Connections, `src/settings/ConnectionsSection.tsx`).
  Function secrets: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (the web client "Atlaswork Calendar (connectors)" in GCP project `atlaswork-calendar`, Bitwarden `WORKBENCH_GOOGLE_CALENDAR_CLIENT_ID` and `WORKBENCH_GOOGLE_CALENDAR_CLIENT_SECRET`; Calendar API on, redirect URI `https://app.atlaswork.app/connectors/callback`, which a Cloudflare redirect rule forwards to the function's `/callback`), `GOOGLE_REDIRECT_URI` set to that address, and `CONNECTOR_KEY`, a random value that seals the stored refresh tokens: losing or changing it means everyone connects again. Sign-in keeps its own client in project `atlaswork` (launch plan R9).
  Locally, add `GOOGLE_REDIRECT_URI=http://127.0.0.1:54321/functions/v1/connectors/callback` (inside Docker the function's own address isn't what Google sees); without the Google secrets Connect says connections aren't set up.
  The app shows Settings → Connections and the chat's Add to Google Calendar only in builds with `VITE_GOOGLE_CALENDAR=1` (`.env.production` once the hosted secrets are set, `.env.local` for development).
- **Routines while you're away** (agents-design D54): the `routines` function runs opted-in accounts' due routines, called by the pg_cron job `routines-away` every 15 minutes.
  It checks a bearer secret of its own: the function secret `ROUTINES_CRON_SECRET` and the Vault secret `routines_cron_secret` hold the same random value, and Vault's `routines_url` holds the function's address; set them once per project (`supabase secrets set`, then `vault.create_secret` through `pnpm exec supabase db query --remote=<ref>`).
  The value lives nowhere else: to rotate it, set both again.
  Its tests are `supabase/functions/routines/run_test.ts` (what runs, on whose clock), `push_test.ts` (quiet hours, what a push says) and `supabase/tests/database/away.test.sql` and `push.test.sql` (who may call what).
  Pushes (D55) are signed with the function secret `VAPID_KEYS` (the VAPID key pair as JWK JSON, made with `@negrel/webpush`'s `generateVapidKeys`); its public half is `VITE_VAPID_PUBLIC_KEY` in `.env.production`.
  Replacing the pair means every device turns notifications on again.
- **Jobs** (agents-design D76): every chat reply and hand-off is a row in `public.agent_jobs` that only the service role writes (`create_job`, `claim_job`, `release_job`, `job_progress`, `finish_job`, migrations `20261123100000_agent_jobs.sql`, `20261123140000_job_pauses.sql`, `20261123160000_job_runs.sql` and `20261123180000_job_device_waits.sql`), and so is a tidy's Apply or Undo (kind `tidy`, D79, `20261125090000_tidy_jobs.sql`); an account reads its own jobs without their requests.
  A job's request is stored as its JSON text (`requestText` in `supabase/functions/agent/jobs.ts`), since a jsonb object reorders a command's fields, whose first names each list item.
  The pg_cron job `agent-jobs-expire` runs `expire_jobs()` every 5 minutes: a job still open after 24 hours fails and drops its request, one waiting over 6 minutes for a device's files fails too, and jobs go 7 days after they ended.
  A long hand-off carries on across runs: a run calls the agent function itself with the bearer `JOBS_SECRET` (a function secret), and the pg_cron job `agent-jobs-continue` posts there every minute while a job stalled, with Vault's `agent_url` (the function's address) and `jobs_secret` (the same value); set them once per project as for routines, and without them a hand-off gets one run.
  Its tests are `supabase/functions/agent/jobs_test.ts` (every way a run ends), `logic_test.ts` (a run handing on), `admission_test.ts` (a later run counts no reply) and `supabase/tests/database/jobs.test.sql` (who may create, claim, read and end jobs, leases, where a job may run, carrying on, the sweep, expiry).
  Every signed-in page reads its jobs (`createJobWatch` in `src/jobs.ts`, tests in `src/jobs.test.ts`): on opening, coming back into view or a message waiting, then every 4 s while one is open; a job that ends reloads the workspace.
- **Computers** (agents-design D77): each desktop install is a row in `public.computers` with its name, when it was last seen, its app version (D85, migration `20261125235000_computer_versions.sql`) and the SHA-256 of its token, never the token (migration `20261123200000_computers.sql`).
  A signed-in account registers one with `register_computer(name)`, which returns the token once (at most ten per account, each name once, case aside: D84, migration `20261125170000_computer_names.sql`), reads its own without the hashes, and removes one with `remove_computer(id)`, which fails the work waiting for it and forgets where things are on it (D80, migration `20261125150000_remove_computer_forgets.sql`).
  A computer's helper calls `computer_poll(token, version)` with the publishable key alone: an unknown or removed token gets HTTP 403, and a known one is marked as seen, records the app version the app handed its helper (only `x.y.z`; a helper from before D85 slice 3 sends none), claims the oldest job waiting for `computer:<id>` for 15 minutes, hears whether its account has a job open or had one in the last minute (`busy`), when it asks again in 3 s rather than 10 (D84), and takes the oldest search another of its computers asks of it, made in the last 20 s (`search`), which it answers from its index with `answer_search(token, id, answer)` before anything else (migration `20261125190000_computer_searches.sql`); helpers from before D84 call `next_computer_job(token)`, the same claim without `busy` or `search`.
  For a job it holds, its helper posts each step to the `agent` function with `Authorization: Bearer <token>` (`supabase/functions/agent/computer.ts`): a model call, an image, a calendar read, a progress line, then the landing or the failure; the function knows the computer through `computer_of(token)` and counts each call with `job_call` (migration `20261123220000_computer_jobs.sql`, at most 64 a job), and its tests are `computer_test.ts`.
  A project's folder on a computer is part of its record (`Project.folder`), and a chat reply or hand-off names it without its files, since D84 from every computer its places' folders are on (`computerFolders` in `src/agentRequest.ts`, one folder per name); at its first file tool the function moves the job to the computer that tool names (`computerFor` in `computer.ts`, `release_job` to `computer:<id>`, `runJobOnce` in `supabase/functions/agent/index.ts`), its stored request saying where it now runs (`Snapshot.at`, migration `20261125210000_job_moves.sql`), and the helper reads them and finishes it.
  A reply or hand-off whose agent reads files may also search the account's computers with search on (`search_computer`, D78): the function picks the one the reply searches on first (`searchedComputer` in `computer.ts`: one holding a folder of the reply that searches, else the oldest that asked for work in the last 30 s), the first search moves the job there the same way, and the helper answers from its index (`find` in `desktop/helper/search.ts`), after which `read_file` opens only what was found.
  Since D84 the helper also asks the function for the other computers' parts (`{ job, search }`): the function writes one row per computer seen in the last 30 s to `public.computer_searches`, which only the service role reads and writes, waits up to 15 s for their answers, deletes the rows and sends the parts back; `searchText` in `supabase/functions/agent/searches.ts` merges them, each path starting with its computer's name, and names the computers that are off or didn't answer in time. With every one off the search says so on the server without moving the reply. A computer running a job of its own answers asks only between jobs, so it counts as late meanwhile.
  Reading a file found on another computer ("Laptop: Papers/x.docx"), or a file or `search_files` in a folder on one, moves the job there (`{ job, move }`): the helper answers the calls it can, and the function lets the job wait for that computer with the turns so far, its request saying it runs there with what its searches found (`at.found`); that computer's helper answers the waiting calls first, opens only files the searches found there, and goes on. A file on a computer that's off waits for it; `open_file` shows only a file on the computer whose window asked. A tidy or a place a reply learned names its files' computer by those paths, bound at landing against the account's computers (`onComputer` in `searches.ts`).
  After a search there, an agent with Remember on may offer to remember where something is (`remember_where`, D80): the loop takes only a folder holding a file the search found (`Snapshot.found`, from the helper), the landing writes the sentence with the computer's name (`learnedOf` in `src/agentRequest.ts`), and the reply's first message keeps it as `learned` with Keep and Not this (`decideLearned` in `src/proposals.ts`), so no agent reads it until you keep it; the function counts each offer (`memory_learned`).
  A chat reply asked in the desktop app's own window carries that start's window key (`land.here`), which gets it `open_file` (D78): the helper checks the key and that the reply found the file, then asks the app on its stdout, and the app checks again (`showable` in `desktop/src-tauri/src/main.rs`, tested with `cargo test`) before opening it in its own app.
  Whether agents may search a computer (D78) is `computers.search`, which the account sets with `set_computer_search(id, on)` (migration `20261124090000_computer_search.sql`); the folders they may search never leave that computer.
  Whether agents may tidy it (D79) is `computers.tidy`, set with `set_computer_tidy(id, on)` (migration `20261124120000_computer_tidy.sql`), which refuses on while its search is off; search off takes tidying along.
  A reply whose agent has Tidy files may propose `tidy_files` (`src/commands/files.ts`) after a search, only when that computer tidies (`withTidy`) and only for files its searches found (`withFound`, both in `supabase/functions/agent/tidy.ts`, tests in `tidy_test.ts`); it lands as `Proposal.files`, a proactive agent approving up to 10 files on its own.
  Apply and Undo of a tidy post `{"tidy": …}` to the `agent` function (`createTidyAsk` and `askTidy` in `src/tidying.ts`, tests in `src/tidying.test.ts`), which saves the answer on the card and queues a `tidy` job for that computer, as it does for a tidy a proactive agent landed approved; the computer's helper hands it to the app and reports what the app did (`tidied`), which lands on the card.
  Settings → Account lists the account's computers once it has one, each with its version (`src/settings/ComputersSection.tsx`); its tests are `supabase/tests/database/computers.test.sql`.
- **Editor:** VS Code uses Deno only for `supabase/functions` (`.vscode/settings.json`, recommended extension `denoland.vscode-deno`). The app keeps the TypeScript and Node tooling.

### Live agents

Launch step 4 in `docs/mvp-launch-plan.md`.
The `agent` Edge Function (`supabase/functions/agent/`) answers chat and routines through Workers AI `@cf/openai/gpt-oss-120b`, or through the account's own model (launch plan D16).
With `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` set (the hosted values are in the launch plan's Accounts table) in `.env.local`, a signed-in account gets `createLiveEngine` (`src/live.ts`).
Signed out and without a device provider, `offlineEngine` answers that no model is connected and routines wait (agents-design D43).
Nothing answers by rule.
`createAgentEngine` (`src/atlas.ts`) assembles the provider adapters and owns one shared model snapshot for Settings → AI model, Profile, Details and Spend: who answers, their model menu and, when a reader asks, its models and prices.
Its subscribers see loading, a ready provider and menu (or no choice), or an error with manual Retry; provider/default changes hide the previous metadata immediately, and stale loads cannot overwrite newer choices.
Settings saves the account's own provider through the engine (`engine.own`, `accountModel` in `src/ownModel.ts`); device setup stays in its adapter (`docs/agents-design.md`, D44).

- **Flow:** the browser sends the account's access token, a permission-filtered snapshot (the Agent's Workspace in `src/agentWorkspace.ts`), the commands the agent's permissions allow (`src/commands.ts`, D33 and D43 in `docs/agents-design.md`), what the agent remembers (D49: up to 40, past that the ones whose words best match the message, `src/recall.ts`, D80) and the current session's last 12 messages.
  The function refuses accounts without Pro, a running trial or an own model (`public.entitlements`), runs the tool loop against the snapshot and streams NDJSON ending in the reply, its draft and the tokens it used.
  A chat reply is a job (D76): the page saves your message first, the function lands the reply in the account itself, and the stream ends with the records it wrote, which the page takes in (`Workbench.absorb`).
  A proposal draft becomes a Workbench `Proposal` in the browser, and the Proposal module (`src/proposals.ts`) lands it by write mode, so Apply, Undo and write modes work the same in chat and routines; an email, calendar or web-search draft becomes a link the person opens.
  Scam warnings (agents-design D79): `supabase/functions/agent/warnings.ts` recognises remote-access tools, gift cards or crypto as payment and requests for a password, PIN or code, in English and Portuguese; the loop checks each tool result and the reply (`runAgent` in `run.ts`), adds the app's note after a result that sets one off so the agent explains it, and the reply's first message keeps the kinds (`warnings`), which `proposals.land` also checks against the words, whoever ran the loop; its tests are `warnings_test.ts`.
  Routines ask through the same engine (`routineRequest` in `src/routines.ts`).
  **Agents asking each other** (D50): the request lists the other agents (`crew`), and an `ask_agent` draft becomes a question card in the chat; once you Send it (or always let that pair talk), the Room asks the other agent with the question alone and posts its answer in the same chat.
  **Linked folders** (D47): with "Read files" on, the request also lists the linked folders of the agent's projects on this device (`src/folders.ts`).
  `search_files` and `read_file` run in the browser, on text files and PDFs: the function ends a leg with `{pending, turns, resume}`, `src/live.ts` runs the calls and sends the request again with `turns` and the one-use `resume` token (`resume.ts`), so the question stays one reply.
  The Agent's Workspace keeps record exports, Page text and command choices consistent about scope and archived Homes, including archived parent Domains.
  Drafts retain their originating command, permissions and target identities; Room rechecks current access after the reply and at Apply, refusing a newly forbidden draft as a whole without retargeting titles.
  Older pending proposals without this provenance require a fresh proposal; history and Undo remain available.
  `src/agentWorkspace.test.ts` and `src/workbench.test.ts` cover attachments, revocation, archived Homes, replacement records and the reply-to-Apply path.
- **New agent abilities:** add a `CommandDef` in the matching file of `src/commands/` and list it in `commands` in `src/commands.ts`: the permissions it needs, its spec and how a checked draft becomes a Proposal or links. The function needs no change.
- **Caps:** 20 replies per user per UTC day (200 with the customer's own model), 2,000 Neurons per user a day (their share of the budget; own models skip it) and 8,000 Neurons a day across everyone, counted in `public.agent_usage` (migrations `20261105091313_agent_usage.sql`, `20261113180000_signup_hardening.sql`).
  Change them in `caps` in `caps.ts`; work handed off (agents-design D73) counts as `background.replies` of them at once (`p_count`, migration `20261122120000_background_work.sql`), for the whole job however many runs it takes (D76).
  `admission.ts` is the one place that asks the usage database whether a reply may start, on which providers and under which cap, and records what it spent; a failing database refuses with 503 rather than an uncaught error.
- **Secrets:** the function reads `WORKERS_AI_TOKEN`.
  Hosted: `pnpm exec supabase secrets set --remote "WORKERS_AI_TOKEN=…"` from the Bitwarden key `WORKBENCH_CLOUDFLARE_WORKERS_AI_TOKEN`.
  Local: the same line in `supabase/functions/.env` (gitignored), then `pnpm exec supabase functions serve --env-file supabase/functions/.env`.
  A local stack spends the same free Workers AI allowance as production, and once it's used up Workers AI answers HTTP 429 (code 4006) and the free Groq tier runs out within one multi-step reply.
  For a local check then, give the throwaway account its own model: OpenRouter with the Bitwarden key `WORKBENCH_OPENROUTER_TEST_KEY` (a $1-capped test key) on a `:free` model that takes tools, through `set_model_key` as that account (checked 2026-11-25 with `nvidia/nemotron-3-ultra-550b-a55b:free`).
- **Tests:** `pnpm run test:functions` (part of `check`) type-checks the function's entry file and runs its Deno tests: validation, tools, proposal drafts, the loop's budgets, pausing and resuming for file tools and their one-use resume tokens, the garbled-reply guard, providers and reply admission (plan, budget, both caps, own models, a failing database), without calling the model or the database.
  `src/live.test.ts` covers the browser side, including the contract: real `snapshotOf` output (`src/agentRequest.ts`), every command on, passes the function's `parseSnapshot`.
  `src/engine.test.ts` covers shared model state, failed metadata loads and Retry, out-of-order results, remounts without stale defaults, on-demand models and prices, and saving through the engine.
- **Snapshot contract:** `src/agentRequest.ts` and `src/commands.ts` (with `src/commands/`) type what they send with the function's `Snapshot` and `Command` (`logic.ts`) and fit it to its `limits`: note text to 20,000 characters, notes and tasks to the newest 300, task titles to 1,000.
  A chat message over 4,000 characters is refused before sending.
  Change a limit in `limits` only; both sides follow.
- **Model comparison:** `dev/compare/compare.ts` runs 108 fixed requests against the demo workspace through the same loop (`runAgent`) on Workers AI, Groq, the ChatGPT plan signed in through the dev bridge (`chatgpt`, the Responses API, `dev/chatgpt/README.md`) and, through the official `claude` and `codex` CLIs, the Claude and ChatGPT subscriptions signed in on this machine: 26 about notes, tasks and pages (five with Arrange pages on), 23 persona cases, one per suggested agent and Atlas, that check what its house rules promise (agents-design D41), five with a linked folder (D47), seven that carry a session's earlier turns (D28), seven routines run as the Room asks them (D43, D68), four about what agents remember (D49), four in which Atlas drafts an agent (D57), four in which a client's request passed on becomes a project and three that move whole projects or plant a domain (D61), eight that fill a dialog (D63) and three richer replies (D64).
  The demo seed's dates count from today, so the requests do too.
  `--cases=10,25-35` runs a subset, and `--runs=2` asks each case twice, since one run varies by a case or two.
  It prints a table of right answers, replies that keep the chat's format (no headings or raw HTML), latency, model calls and the tokens a reply read (with the share its provider served from cache: Workers AI gets the function's `x-session-affinity` key, one per agent), writes every reply to a temp file, and names the cases that started or stopped passing against that model's baseline in `dev/compare/baseline/`; `--save` makes the run the new baseline for the cases it ran, so commit it with the change it measured.
  Run it after changing an agent's instructions, the system prompt or the agent loop: day to day on Carlos's ChatGPT plan (`chatgpt`, free and outside the shared allocation), then once on `workers-ai`, the model Atlaswork's own plan answers on, before a release.
  A pass on the plan's much stronger model doesn't promise one on gpt-oss-120b, so only the Workers AI baseline counts for release.
  While production is a closed beta with only Carlos's test accounts behind the waitlist, a release doesn't wait for the Workers AI run (Carlos, 2026-11-20): the run is a measurement of what to fix, and it gates releases again once the waitlist opens to real users.
  The `claude` and `codex` rows call tools through a JSON schema in their CLIs, not through `provider.ts`, so they measure the model, not the adapter an own key uses.
  Run it from this folder with `WORKERS_AI_TOKEN=… node --experimental-strip-types dev/compare/compare.ts [workers-ai] [groq] [chatgpt] [claude] [codex] [--cases=…] [--runs=…] [--save]`.
  The cases live in `dev/compare/cases.ts`; `--draft=<file>` runs one agent's unsaved defaults instead of the saved ones and `--json=<file>` writes each case's result, which is how the admin page's Cases view runs them ("Admin page").
  A full Workers AI run at two runs a case spends more than the whole free allowance, which the hosted function shares, and that allowance frees up only as spend leaves a rolling 24-hour window, not at 00:00 UTC (measured 2026-11-20).
  So before asking Workers AI a run reads the last 24 hours' spend (`dev/compare/budget.ts`: Cloudflare's analytics with `CLOUDFLARE_ANALYTICS_TOKEN`, set from the Bitwarden key `WORKBENCH_CLOUDFLARE_ANALYTICS_TOKEN`, every caller counted; without it, this computer's ledger of what comparisons spent), keeps `--reserve` (2,000 unless set) for production, refuses with under 1,000 left and says when enough is free, and stops past `--max-neurons` (4,000 unless set) or what is left, naming the cases it skipped.
  **Before and after:** `node --experimental-strip-types dev/compare/ab.ts <before> <after> [model] [--cases=…] [--runs=…] [--recheck=4]` runs two checkouts (a second `git worktree` at the commit to compare against) or reads a `--json` file, asks every case whose result differs again `--recheck` times on both sides, and prints right answers, tokens a reply, and which cases are still apart by half or more over all their runs: those are the change, the rest is noise.
  Subscriptions are for this local comparison only; they never go into the hosted function.

### Accounts and server storage

Launch step 5 and D15 in `docs/mvp-launch-plan.md`.
Settings → Account (`src/AccountSettings.tsx`) emails a sign-in link with the same one-time code (for a link that opens in another browser, or that a company mail scanner used up first), and shows "Continue with Google" when the build sets `VITE_AUTH_GOOGLE=1`.
`src/account.ts` holds the auth client and `account`, the one `Backend` (`createBackend` in `src/cloud.ts`) every signed-in call goes through: `rpc` for Postgres functions, `read` for rows under row-level security, and `agent` for the Edge Function.
It sends the token, says "You're signed out" before sending anything when there is none, and gives one offline message; `src/cloud.test.ts` covers that.
Signed in, `src/main.tsx` opens the account's workspace through `createServerStore(account.rpc)` and live agents through `createLiveEngine(account)`.
Signed out, the workspace stays in this browser's IndexedDB.

- **Records:** `public.workspace_records` holds one row per record, keyed like IndexedDB (`task:<id>`, `domains`, …), behind row-level security.
  `load_workspace()` and `save_workspace(puts, deletes, replace)` apply each changeset all-or-nothing, and writes go only through `save_workspace`, which refuses a changeset that takes the account past 25 MB (1 MB a record).
  Notes go up without their file: file bodies stay on the device that added them (`atlaswork-files` in IndexedDB).
  Each chat message is a record of its own (`message:<thread>:<id>`, agents-design D76), and a save sends only the messages it changed against the workspace it started from (`accountRecordsOf` in `src/records.ts`), so a reply the agent function lands and a message written meanwhile both stay.
  `load_workspace` puts each thread's messages back in it, so reads get whole threads as before.
- **First sign-in:** an empty account takes the browser's workspace (`withLocalUpload`). An account with data loads as it is, and the browser's copy stays untouched underneath for when you sign out.
- **Other devices:** coming back to the app (the page becomes visible) reloads the account (`Workbench.refresh`), unless an edit is still saving or is made while it loads; then what's on screen wins and the next visit reloads.
- **Delete account:** Settings → Account → Danger zone → Delete runs `delete_my_account()`; the workspace, plan and usage rows cascade with the auth user. Export is the workspace backup.
- **CAPTCHA:** with `VITE_TURNSTILE_SITE_KEY` set, the email form shows a Cloudflare Turnstile widget (`src/turnstile.ts`) and sends its token. Turn on Supabase's CAPTCHA protection (Turnstile, with the secret) at the same time, or email sign-ins fail.
- **Email templates:** `supabase/templates/` (link and code). The local stack reads them through `config.toml`; the hosted project gets them with the Management API (`PATCH /v1/projects/<ref>/config/auth`, fields `mailer_templates_magic_link_content` and `mailer_templates_confirmation_content`), never `supabase config push`, which would also push the local site URL and open signups.
- **Disposable addresses:** Auth's before-user-created hook (`hook_before_user_created`, migration `20261113180000_signup_hardening.sql`) refuses sign-ups by email link or Google whose email domain is in `public.blocked_email_domains`. Accounts made or invited through the admin API or dashboard skip it (checked 2026-11-13). Refresh the list with a new migration. The hosted hook is on under Authentication → Hooks.
- **Local test:** `pnpm exec supabase start`, then put `VITE_SUPABASE_URL=http://127.0.0.1:54321`, the local publishable key and Turnstile's always-pass test site key `1x00000000000000000000AA` in `.env.e2e.local` and run Vite with `--mode e2e` (`.env.local` points at the hosted project).
  Env files beat `VITE_*` inherited from the shell (`vite.config.ts`), and Vite prints the backend it uses (`[env] e2e: backend …`).
  The waitlist function needs `TURNSTILE_SECRET_KEY` in `supabase/functions/.env` (the test secret `1x0000000000000000000000000000000AA` passes every token) and `pnpm exec supabase functions serve`.
  Throwaway hosted accounts for browser checks: `dev/test-account.mjs`, run with `WORKBENCH_SUPABASE_SECRET_KEY` in the environment (the Bitwarden key of that name).
  The browser checks open their tabs signed out (`scripts/check-tab.mjs`), so a test account's session left on a disposable port doesn't leak into them.
  Sign-in emails land in Mailpit at <http://127.0.0.1:54324>.
  Another dev server may already hold port 5191; check before trusting what loads there.

### Backups

The hosted database is dumped nightly, encrypted, to Cloudflare R2 with a 30-day object lock, and a monthly drill restores the newest archive into an isolated container and checks row counts and RLS (launch plan D10).
The backup scripts live outside this repo, and the operational runbook is private.

### Landing page

`landing/` is Atlaswork's "coming soon" page (launch plan step 2 and D13): real screenshots and a waitlist, no pricing or payments yet.
It's one `index.html` with no build step, and it reuses the app's fonts and colours.
Preview it with `python -m http.server 5197 -d landing`.
Both waitlist forms post to the `waitlist` Edge Function (`landing/waitlist.js`), which stores an email only after a Cloudflare Turnstile check passes and answers the same whether the address was listed before; the table takes no direct inserts.
The check is invisible unless Cloudflare wants a challenge.
`landing/_headers` and `public/_headers` set each site's Content-Security-Policy; a new script, frame or API host must be added there or the browser blocks it.
Retake the screenshots when the app changes: `pnpm run landing:shots` (`scripts/landing-shots.mjs`) builds this checkout, serves a production preview and writes `today.webp`, `project.webp` and the two phone shots from the demo seed in light theme with the status bar hidden, at the sizes the page serves (1920×1200, 780×1688); update their alt texts with what they now show.
Chat and dialog close-ups are element crops taken by hand the same way, at device scale 2.
Crop out anything only a signed-out preview shows, such as "No AI model is connected".
On phones, `<picture>` swaps the desktop Today and project shots for the phone ones.
`og.png` (1200×630) is the headline beside the Today shot, rendered from HTML in the browser.
`robots.txt`, `sitemap.xml`, `llms.txt` (a plain-text summary for AI answer engines) and the JSON-LD in `index.html` repeat only what the page says; update them with its copy.
`404.html` makes Pages answer unknown paths with a real 404 instead of the home page.

It's served by the Cloudflare Pages project `atlaswork` (atlaswork.app).
Deploy with `CLOUDFLARE_API_TOKEN="{{bws:<WORKBENCH_CLOUDFLARE_PAGES_TOKEN>}}" pnpm run deploy:landing` (`scripts/deploy-pages.mjs`; drop the angle brackets: the agent harness resolves the placeholder from Bitwarden, Pages edit and `atlaswork.app` DNS edit), and `deploy:app` the same way.
Without the token, the script falls back to your `npx wrangler login`, so a deploy that should use the token and doesn't still succeeds on a machine that once logged in.
Run Wrangler only through the script: inside this repo, wrangler 4 detects the Vite app, offers to convert it to Workers and adds itself to `package.json`.

### The hosted app

The app itself is the Pages project `atlaswork-app` at <https://app.atlaswork.app> (launch plan D2), built with `.env.production` (committed: every value in it is public).
The app is closed (launch plan step 5): on every deployed host, Cloudflare's `atlaswork-app.pages.dev` and per-deployment addresses included, a signed-out visitor gets `src/Gate.tsx`, the waitlist (the same `waitlist` function as the landing page, source `app::gate`) with an "Invited?
Sign in" switch, and only invited accounts open the app.
Invite one from the Supabase dashboard (Authentication → Users → Invite) or with the admin API.
The dev server and loopback open the local workspace signed out; `?gate` shows the gate there.
Opening the app to everyone is one line in `src/main.tsx` (`closed`).
The gate and the app are separate chunks (`React.lazy` in `src/main.tsx`), so a visitor at the waitlist never downloads the app; `src/appContext.ts` imports only types for the same reason, since the gate's account section reads it.

### Desktop app

Atlaswork for Windows (agents-design D77) is a Tauri 2 app in `desktop/src-tauri`: its window loads <https://app.atlaswork.app>, so every web release updates it, and it adds the tray, starting at Windows sign-in, notifications and the computer's pairing.
It needs Rust (`cargo`) and the Tauri CLI, a dev dependency here.

- **Build:** `pnpm run desktop:build` compiles the helper, then makes the per-user installer, `desktop/src-tauri/target/release/bundle/nsis/Atlaswork_<version>_x64-setup.exe`, without Windows code signing (decided before anyone but Carlos installs it, D77).
  `scripts/build-desktop.mjs` signs the update beside it (`.exe.sig`) with the app's update key (D85, R13), which it reads from Bitwarden (`WORKBENCH_DESKTOP_UPDATE_KEY` and its password, through `bws` with `BWS_ACCESS_TOKEN`) into the build's environment, unless `TAURI_SIGNING_PRIVATE_KEY` and its password are set; arguments after it go to `tauri build`.
- **Installing and updating:** the first install is by hand: the installer is copied to the computer and run there, for that Windows user, without admin rights.
  Being unsigned, it gets Windows SmartScreen's warning (More info → Run anyway).
  An app built since D85 slice 1 then updates itself (`desktop/src-tauri/src/update.rs`): 30 s after it starts and hourly it reads `latest.json` in the project's public `desktop` bucket (migration `20261125230000_desktop_updates.sql`), installs only an update signed with the update key, once its window is closed and its helper has finished the work it holds, and starts again hidden.
  `pnpm run release` publishes there (`scripts/publish-desktop.mjs`): when anything under `desktop/`, its build scripts, `.env.production` or a module the helper compiles in changed since the published commit, its plan says which version it publishes (the app's own in `tauri.conf.json` for a new minor line, else the published one's next patch), it builds that version after the check with Rust's build kept in `%LOCALAPPDATA%\atlaswork-desktop-target`, and after the deploy it uploads the installer, then `latest.json`, then `published.json`, keeping the newest two installers.
  By hand, `node scripts/publish-desktop.mjs --installer <path> --version <x.y.z> --commit <sha>` publishes to the local stack, and `--remote` to the hosted project with its secret key (`SUPABASE_SECRET_KEY`, else WORKBENCH_SUPABASE_SECRET_KEY from Bitwarden).
  The window loads the hosted app, so a web release updates everything a page draws; only a change under `desktop/` or in the helper needs a new version, which a release now ships.
  A computer can pair and take jobs only once the hosted database has D77's migrations (`20261123200000_computers.sql`, `20261123220000_computer_jobs.sql`) and the `agent` function its computer steps, which a release brings.
  Searching it (D78) also needs `20261124090000_computer_search.sql`, the function that offers `search_computer` and `open_file`, and an installer built since D78, whose helper keeps the index and whose app shows files.
  Tidying it (D79) needs `20261124120000_computer_tidy.sql` and `20261125090000_tidy_jobs.sql`, the function that offers `tidy_files` and takes Apply and Undo, and an installer built since D79 slice 4, whose app makes the moves.
  Remembering where things are on it (D80) needs `20261125120000_learned_counts.sql` and `20261125150000_remove_computer_forgets.sql`, the function that lands `learned` offers, and an installer built since D80 slice 2, whose helper offers `remember_where`.
  Several computers (D84) need `20261125170000_computer_names.sql`, `20261125190000_computer_searches.sql` and `20261125210000_job_moves.sql`, the function that asks the others' parts of a search and moves a reply between computers, and an installer built since D84 slice 3, whose helper answers others' searches (`computer_poll`) and moves a reply on; a helper from before still takes its own computer's jobs, but answers no search from another and never moves a reply, so another computer's search waits for it and names it as not answering.
  Updating itself (D85) needs `20261125230000_desktop_updates.sql` and `20261125235000_computer_versions.sql` and an installer from a release (0.6.0 on): an app from before (0.5.0 or older) never updates, so it's installed over by hand once, which keeps its pairing and linked folders; Settings → Account → Computers shows each computer's version, and the release plan counts the ones behind.
  The update key is the only way to an installed app: if it's lost, installed apps stop updating until a new key's build is installed by hand on each computer, and if it leaks, rotate it the same way (R13).
- **The helper:** `desktop/helper` runs this computer's jobs (D77): `pnpm run desktop:helper` (`scripts/build-helper.mjs`) compiles it with Deno into `desktop/src-tauri/binaries/` (gitignored), which a debug `cargo build` needs too, leaving out the parts of pdf.js it never loads (113 MB instead of 187).
  It may only read files, reach the hosted project or a local stack, and write in the working folder the app starts it in (`--allow-read`, `--allow-net` for those two, `--allow-write=.`).
  Its config (`desktop/helper/deno.json`) pins Node's types to 22, since Jimp brings 16.9's, which lack `node:sqlite`.
  Its tests run with the functions' (`pnpm run test:functions`), and it logs outcomes, never what was asked, to `%LOCALAPPDATA%\app.atlaswork.desktop\logs\helper.log`.
- **Linking a folder:** in the paired window the project masthead's folder icon opens Windows' picker (`link_folder`); the app keeps the folder by an id in `settings.json`, the project record names that id, its computer and path, and the helper hears each change on its stdin without restarting.
- **Searching:** in the paired window a switch under the computer's row in Settings → Account → Computers turns search on (D78), and the list of folders it may search unfolds under it (`set_search`, `add_search_folder`, `remove_search_folder`); the helper gets the list on its stdin only while that switch is on.
  It keeps their names and documents' text in `%LOCALAPPDATA%\app.atlaswork.desktop\search\index.sqlite` (`desktop/helper/search.ts`, tests in `search_test.ts`), refreshed at start, on a list change and every 15 minutes, and writes `status.json` beside it, which the section shows; with nothing to search it deletes the index.
- **Tidying:** under the search list, "Let agents tidy files here" (`set_tidy`, D79) turns on only while search is on and Documents is on the list, where agents make their folders; the app turns it off when either goes (`documents_listed` in `main.rs`), and the page tells the account.
  A tidy job's moves reach the app from the helper (`desktop/helper/tidy.ts`, tests in `tidy_test.ts`), and the app makes them itself (`desktop/src-tauri/src/tidy.rs`, tests run by `cargo test`): only files inside the search list's folders, never over a file and never to another drive, keeping what moved in `tidy.json` for Undo.
  A debug build takes `ATLASWORK_DOCUMENTS` as its Documents, so a check searches and tidies a test folder, never the real one.
- **Against a local app:** a debug build (`cargo build` in `desktop/src-tauri`) loads `ATLASWORK_URL` when it's set, a Vite dev server such as the e2e one on the local stack, and gets the same commands there; release builds always load the hosted app.
  `--hidden` starts it in the tray, as Windows does at sign-in, and `ATLASWORK_SHOW_DRY_RUN` makes it print `would show <path>` instead of opening a file, so a check puts no window on the screen.
- **Checking it without its window:** `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333` opens its WebView2 to the DevTools protocol, so `puppeteer-core`'s `connect({ browserURL: "http://127.0.0.1:9333" })` drives the page and calls `window.__TAURI__.core.invoke` there.
  Pairing waits for a click in the app's own dialog, which no page can make.
  A debug build's helper reaches `ATLASWORK_SUPABASE_URL` with `ATLASWORK_SUPABASE_KEY` when both are set, such as the local stack; release builds take the hosted project from `.env.production`.
- **What it keeps:** `settings.json` in `%APPDATA%\app.atlaswork.desktop` (the paired computer's id and name, the folders linked on it, whether search is on and its list, whether tidying is on, whether start at sign-in was set, whether the first close was explained, and the version an update is installing) and `tidy.json` beside it (what each tidy moved, for Undo), the token in Windows Credential Manager (`computer-token.Atlaswork`), the page's own storage, the helper's log, `updates.log` and the search index in `%LOCALAPPDATA%\app.atlaswork.desktop`, and a `HKCU\…\Run` value named `Atlaswork` while it starts at sign-in.
  A test run leaves all four: remove them after one.
- **Checking an update:** a debug build checks for updates only with `ATLASWORK_UPDATES` set, and needs a test endpoint and key merged in when it's built (`TAURI_CONFIG='{"plugins":{"updater":{"pubkey":…,"endpoints":[…],"dangerousInsecureTransportProtocol":true}}}' cargo build`), with an installer of a higher version signed by that test key (`TAURI_SIGNING_PRIVATE_KEY=<test key> pnpm run desktop:build --config <same, with "version">`) in a bucket on the local stack; the update installs the release app in `%LOCALAPPDATA%\Atlaswork`, so uninstall it afterwards (`uninstall.exe /S`) and delete the test installer, which must never be published.
  Put `TAURI_CONFIG` before the one command, never `export` it: a shell that keeps it builds every later app with the test endpoint (2026-11-25, it made a debug build 0.5.9); `pnpm run release` drops inherited `TAURI_*` settings, so its build always has the hosted endpoint and the key from Bitwarden.

### Releasing

`pnpm run release` (`scripts/release.mjs`) ships the pushed HEAD, or with `--ref=<commit>` that pushed commit, so an approval for some commits doesn't carry the ones pushed after them (`pnpm run release:plan -- --ref=<commit>` shows its plan).
It first prints the release plan (`scripts/release-plan.mjs`, alone as `pnpm run release:plan`), read from production: migrations the hosted database hasn't applied, for the app and the landing page the commits and files HEAD adds over the commit each serves, and the desktop app's published version with the one it would publish (Desktop app, "Installing and updating") and the computers seen in the last 30 days counted by version, never named, those behind the published one marked and those too old to update themselves counted apart (D85).
It ships only after you answer y; a session without a terminal shows Carlos the plan and runs `pnpm run release -- --yes`.
Then, in a temporary worktree, it installs, runs `check`, builds the desktop app when the plan publishes one (signed with the update key from Bitwarden, before anything ships), runs the database tests when the plan has migrations (`supabase db start` and `supabase test db` on a throwaway local stack with project id `workbench-release`, stopped and its project id put back before anything ships, since the Pages deploy refuses a changed tree, because the `database` workflow on GitHub doesn't run once the month's Actions minutes are used up), pushes migrations, deploys the agent, waitlist, routines and connectors functions, deploys the app and the landing page only when their plan changed, publishes the desktop app last, so computers never run ahead of the server, then removes the worktree. A local Supabase dev stack on the default ports makes that start fail: stop it first.
It refuses uncommitted changes or an unpushed commit, and so do `deploy:app` and `deploy:landing` (`scripts/deploy-pages.mjs`), which tag each Pages deployment with its commit.
It also refuses a commit that doesn't contain the one a site serves, which would take commits back out of production; a served commit from a branch later rebased onto main counts as contained when each of its commits is on main with the same subject and changed lines.
And it refuses a commit no screenshot regression passed on: a passing `checkVisual` on a clean checkout records its tree (`scripts/visual-stamp.mjs`, in the repository's Git folder, shared by every worktree and never committed), and a release passes when a recorded tree differs from it in nothing the showcase draws from (`src`, `dev/design`, `public` and the build files); `--without-visual-check` ships anyway and says so, for a fix that can't wait.
A release that changes what people see or do adds its lines to `src/changelog.ts` first, in their words: Settings → About lists it as What's new, and the first start of a new version offers it.
Installed apps look for a new version on start, whenever you come back to them and every 30 minutes (`src/update.ts`); a new version loads by itself while the app is in the background, or when you tap Reload in its toast or in Settings → About, never under you while you're using it.
A check always sees the newest version: browsers fetch the service worker past their cache when they look, and `public/_headers` keeps the manifest uncached (a no-cache on scripts there is replaced by Cloudflare's 4-hour browser cache, so it isn't set).
`deploy:app` also refuses while the hosted database lacks a migration, so the app never runs ahead of its schema (2026-11-16: six had waited unapplied for days behind app-only deploys).
`check` has no browser, so before a release run `pnpm run check:browser` (Verification, "Browser regressions") and ship only when it passes.

### Error reporting

Production builds report uncaught errors to Sentry (launch plan D9) when `VITE_SENTRY_DSN` is set at build time. The DSN is in the launch plan's Accounts table. Without it, and in dev, the SDK is never downloaded.

### Dev-only ChatGPT plan

The dev server can run every agent on Carlos's ChatGPT plan, through OpenAI's "Sign in with ChatGPT" on his own computer: Settings → AI model → ChatGPT plan.
Launch plan D16 explains why it isn't in the product yet.
Setup, boundary and files: `dev/chatgpt/README.md`.
Production builds and `vite preview` never contain it (`check:bundle`).

## Explore

- Separate rounded panels, an 11px minimum text scale, and comfortable or compact density. Light and dark share the same layout.
- Settings > Appearance starts with twelve themes: Garden (the default), Linen, Tide, Terracotta, Dusk, Frost, Meadow, Midnight, Espresso, and the plain Graphite, Violet and Paper.
  A theme is a palette with its own title face and corner size (`data-palette`, `src/WarmEditorial.module.css`) and its own background pattern, sidebar and chat rail (`src/dialogs/themes.ts`); every theme comes in light and dark.
  After the themes and Emblems, Crew style draws every portrait and Atlas in one of nine packs, Storybook (the default), Manga, Heroes, Villains, Pixel, Animals, Ink, Clay and Fantasy (`Session.crewStyle`, `crewStyles` in `src/look.ts`, images in `public/agents/<style>/`, agents-design D16).
  Then Mode picks Auto (your device), Light or Dark; in code that's still `Session.theme` and `data-theme`, while the Theme is `Session.palette`.
  Domain hues, widget kinds, attention, the sun and errors keep their colours in every theme.
- Canvas changes a theme's surfaces one at a time: thirteen background patterns as tiles (the theme's wash through a mask, `[data-pattern]` and `[data-canvas]` rules in `WorkbenchShell.css`), Sidebar and Chat rail.
  Hover or keyboard focus previews a theme or a surface without saving, even if compact density clamps a scrolled page.
  Leaving, blurring, or closing Settings restores saved appearance and the original scroll position.
- Follow time of day is on by default.
  Morning, evening and night shift the theme's wash halfway toward their own colours; the day shows the theme's as they are.
  The clock refreshes once a minute.
  Today opens with a band: the greeting, the full date and what's due across how many domains, a small sky with the sun or moon where the hour puts it, and the day's garden, one plant per task due (a flower in its domain's colour once ticked; late ones droop).
  The top bar's calendar tile says "Open Today" as its tooltip and stays selected on Today.
  Use `?daypart=morning`, `day`, `evening`, or `night` for a manual preview.
- Today is your day, hour by hour (agents-design D75).
  The head's one sentence counts what's done, what's left and what was carried over.
  The day line runs from 07:00 to 23:00 with the sun at now; every task with a time stands at its hour and flowers when ticked, and the crew's next steps stand dashed at their half hour until you answer.
  Under it, Anytime today holds the tasks with no time yet (drag one into a part of the day or pick a free half hour from its clock), the rituals still to tick and an add row; then Morning, Afternoon and Evening with their tasks by time, the one you're in lit.
  Beside the day, Your crew today: Atlas's line on what matters most, each agent's one next step with Apply, Other time and Not now, the rest of the crew's news, who has nothing to say, Plan the rest of my day (Atlas places what's left in the free half hours) and the chat.
  Coming up: the next seven days with their first tasks, then the next date counted down to with what its agent says.
  Keep going: Today's widgets two to a row (the most pressing projects as plants in pots, a stalled one offering "Add a step"; the six resources touched last).
  One kept quote closes the page.
  From the evening the tray reads Still open and moves what's left to tomorrow, and the add row plans tomorrow (`?daypart=evening` previews it).
  Customize turns the crew, rituals, Coming up and the quote on and off.
  Layout: `docs/page-design.md`, "Today".
- Resources follow `docs/resources-design.md` (PARA).
  A resource is a note, link, file, image, video, or quote with your own notes under it.
  It has one home (a domain, a project, or a Library topic) and can be linked into other projects; linked cards carry a "from …" badge.
  Project pages, domain overviews, Today, the per-domain Resources page, and Library topics share one grid with kind chips.
  Click peeks in a slide-over (↑/↓ or j/k step, Enter opens a tab, Esc closes); Ctrl/Cmd- or middle-click opens a tab in the current domain.
  Files and images are stored as Blobs; YouTube links get thumbnails and an embedded player.
  Archiving a project with resources opens a keep-sheet that moves what you tick into topics.
- Completing the final open task in a list creates one 600ms palette-chip burst from its checkbox. Other completions only animate the check. Reduced motion skips both.
- A never-saved workspace opens the first-run flow (D34 and D42 in `docs/agents-design.md`): your name, the domains to add (four ticked, or name your own on the "Your own" tile, with an emoji grid and an optional line on what it's for; a listed name ticks that domain), agents for those domains (one ticked per domain; a domain of your own gets a generic steward that checks in on Mondays), for everything and for work, plus agents other people shared, then what you'll open to, which points to New agent for building your own.
  Skip keeps Everyday and Atlas; it never shows again on that device once a workspace has anything in it.
  Every domain is on Atlas's first-morning guide: one without templates offers "A first project" you name yourself, and until it holds anything its steward asks what matters there on its page.
  Production builds on a real host count each step anonymously per day (`src/usage.ts`, launch plan D8); on `127.0.0.1` or `localhost` (the speed check, `vite preview`) nothing is counted.
  The Agents page lists what the community shared under the bench; an agent's dialog shares or unshares your own (signed in).
- After onboarding, a starter guide stays available on Today.
  Pick a domain (or plant a new one from its dashed tile), then one of its agent's project ideas or "Something else"; inside a domain its own agent speaks (Atlas where nobody looks after it).
  Either opens the project dialog filled in, as the domain page's ideas do (D62), and its Start lands you in the new project with its first steps.
  Return to Today to see "Where shall we start?" and choose another; creating a project never completes or removes the guide.
  Existing completed-guide states are restored to shown on reload; an explicit Later still folds it into a reminder.
  Used templates aren't offered again, and the ideas that fit any domain keep at least two on offer.
  There is no completion screen or forced next step.
  Every domain page opens with the same ideas.
- Agents follow `docs/agents-design.md`.
  Atlas plus any number of agents (the demo uses Homebase's cast) and reusable teams.
  A domain may have one agent; a project an assigned agent and a team, both optional.
  Chat opens to the nearest owner (project room, single crew member, domain agent, Atlas).
  Agents, project rooms, teams, and rooms you start each keep one timestamped thread with unread counts.
  Every agent answers through the AI model chosen in Settings → AI model; full-write agents apply proposals with Undo, propose-only agents wait for Apply.
- Routines are what agents do on their own: a check-in (note bullets become tasks), a status report, a review (tick off what notes mark done, move overdue tasks to today, archive quiet projects; a proactive one makes at most 5 changes itself), or a weekly improvement (up to three numbered suggestions with their evidence, answered by tapping one; agents-design D68).
  By default Atlas checks in every morning for every place whose agent doesn't, and reviews on Mondays; every other agent suggests improvements once a week, the crew taking weekdays in turn.
  Agents, domains, and projects each keep their own, weekly on chosen days every 1–4 weeks or monthly on a date or an nth weekday, at Morning, Midday, Evening, or an exact time.
  Each runs once its time has passed, the next time the app opens or comes back into view; a missed stretch runs once, and each run's result is kept (the last 10) with the replies and tokens it used.
  Picking an improvement lets the agent propose the change, its own house rules and routines included (reviewed in its dialog); improvements waiting for a pick show on Today, and a routine that failed twice in a row is flagged beside Routines and on its agent (agents-design D69).
  The Routines page says in one sentence how many are on, how many are due and who runs next, shows the next seven days as faces on stems, then every routine as a row with its last results and next run (the date over how far off it is); a row opens its sheet beside the list, with its detail (the editor, its last runs, Run now and Remove), and rows keep their places while you switch, edit or run them.
  The agent, domain, and project dialogs open the same detail in place of their list.
- The header's Search is a round icon button that shows its Ctrl K shortcut on hover.
  Chat is a bubble floating over the page's bottom-right corner (Ctrl J toggles it); new messages peek above it, and selecting words in a note offers to ask about them (agents-design D14).
  Capture opens one field that turns a pasted link, typed text, or dropped file into the right kind of resource, or speaks it in, saved where its header says ("Capture to ☀️ Everyday"); its Save as chip keeps the words as a note, quote or task, or turns them into a project, topic or domain named by them, and Sort with Atlas turns them into tasks and notes where they belong. `C` opens it (agents-design D53).
  The project and domain dialogs, new or editing, open with a line where you type or say what you want; the domain's agent (Atlas for domains) fills the form, steps, routines and a new domain's own agent included, lights up what it changed, lists what it assumed as links to those fields, and nothing is saved until you press Start, Plant or Save; Undo takes back only the fill.
  A project an agent proposes in chat has Review beside Apply, which opens the same dialog (agents-design D63).
  Focus mode and its shortcut have been removed.
- Today is a tear-off calendar tile at the left end of the top bar, before the domains (weekday and date, tilted until you point at it or open Today), so it is one click away whichever sidebar tab is open.
  The chevron at the top bar's right end (shown while you point at the bar) folds it to one 24px row, so pages start at 36px from the window's top instead of 72px; this device remembers it (`Session.headerFolded`).
  Folded, Today is a date pill, Search and Capture are icons with their words as tooltips, the theme dial leaves for the status bar's, and every domain chip lies flat as a 12px bar of its width, the open domain's in its colour and the rest see-through.
  Pointing at the bars, or tabbing into them, stands them back up as the full chips over the page's top edge; they fold again a moment after the pointer leaves, a pick included.
  A domain with late tasks carries a clay dot on its pill's top-right, like a notification badge, on the chip and on its folded bar alike; the chip's tooltip says how many ("Health: 2 late"), from `lateByDomain` in `src/workspace/queries.ts`.
  The sidebar's masthead is the selected domain (picked in the top bar) on one line: its emoji on a tile and its name, which open the domain page, with its late count as a clay badge on the tile's corner that links to the domain's Tasks (in the rail too); the collapse button beside it shows on hover or focus. Under it the Projects tab lists that domain's projects most pressing first, as the Domains page does (`byPressure` in `src/pace.ts`), each with its late steps in clay, the open one's title wrapping to a second line, and New project, as PARA puts projects first (chats live in the Agents tab; Search still opens the Chats page). The foot holds Library and Archive side by side on one row (the Agents tab shows Agents and Routines there instead; a failing routine is a clay dot on its icon, with the words in the tooltip), then your portrait and name, which open your profile, with a Settings gear beside them.
  Below the projects, Next up lists the domain's next three open tasks by day (late first, tasks outside a project included), each ticked in place, with "All N" opening the domain's Tasks; it shows only while the projects leave its whole height free, so it never makes the sidebar scroll, and the rail leaves it out.
  The Agents page opens from "Agents" (tooltip "Agents and teams") at the foot of the sidebar's Agents tab, beside Routines and always in view (in the rail as a robot icon), or Search; it is its own page, like Routines.
  The chevron that ends the top bar's domains opens All domains: one card per domain with its steward's face and name with the roster's presence dot and unread count (the face opens that chat; when nobody looks after the domain, Atlas stands in on a dashed ring and the face picks who will), its four most pressing projects (late or behind, then no next step with Add a step on hover, then by next due day, finished last; "N more" opens the domain), each with its stage plant and "n of m done", "n late", "Behind", "No next step" or "Done", a bar of the domain's tasks done and its late count or next due day,
  and a dashed Plant a domain card last whose chips (common domains not yet planted, from `suggestedDomains`) open the new-domain form pre-filled. An empty domain offers Start a first project there.
  Your profile (the portrait at the foot of the sidebar) holds your name (the profile's heading, edited in place; its tooltip shows Today's greeting with it), your picture (a photo kept on this device, your initial on one of six colours, or any crew face behind Faces), a line about you and your account (sign-in, your AI model, delete account) and Backups (last export, storage used, export and restore); a plant on the portrait grows as you fill it in, step by step.
  The masthead opens the domain page, whose Overview, Tasks, and Resources sections replace the old Tasks and Resources pages (`tasks`/`resources` links open those sections; Overview links to the Projects garden view).
- Signed out, Today waits three full days after content is first observed on this device before offering a backup.
  A project, resource, task, topic or user chat message starts `Session.firstContentAt`; onboarding's domains and agents do not.
  Existing workspaces without that timestamp receive the same grace period from their next visit.
  Empty workspaces and signed-in accounts never see the reminder.
  After an export it waits seven days; "Remind me in 7 days" snoozes it for a week (`atlaswork.last-backup` and `atlaswork.backup-snooze` in localStorage).
  Export remains available in Settings → You → Backups from day one.
  Settings keeps Appearance (themes drawn in their own colours and title face, Mode saying what Auto resolves to, switches for time of day and the status bar) and a row that opens the profile.
- Each domain overview and project page is arranged for what it's about (D32 in `docs/agents-design.md`): blocks of different widths on a grid, each with three views picked from a menu on the block itself (D39; tasks, projects, resources, a countdown, a tracker you log numbers into, a habit, a goal, a pinned note, a checklist, milestones).
  The sliders button beside the heading edits the page; "Use the default" puts it back.
  Today keeps its own layout and only the record widgets (tasks, projects, resources).
  `?fresh` shows it: Health charts sleep against a target and keeps a lights-out habit, First 10K counts down to race day and charts weekly distance, Finance watches an emergency fund and monthly spend, Family counts down to a birthday.
  Atlas, who can always use every tool, has a page proposal for Home office corner waiting in his chat; agents that can arrange pages also get a "Put tasks first on my pages" starter.
- Two tabs under the masthead switch the sidebar, and the choice is saved: Projects (the navigation above) and Agents, a chat-app roster.
  Atlas is pinned first, wearing a sparkle; while he has something to approve his row drops its time.
  Under him the selected domain's agents follow its emoji and name, then "Everyone else", whose fold is saved; an agent-less domain gets a prompt to give it one.
  In each section, agents you've never talked to fold behind "N more" (their faces, the names in its tooltip) until you open it, and "Show fewer" folds them again; each section is a labelled group for screen readers.
  Each row shows the portrait, domain badge, last message, time, unread count, and what the agent is doing: replying (typing dots), proposals to approve, a question awaiting your answer, or stuck (failed reply, a routine missing a tool), as a coloured dot and status line.
  The sliders button at the end of the domain's section line (shown on hover or focus) sorts by Needs you first, Latest message or Name inside each section, switches Detailed or Compact rows, and toggles status, last message, time and domain badge; all of it is saved.
  A row opens that agent's chat as the page (below), and the open chat is highlighted.
  Motion: tab icons hop when picked (the Agents bubble chatters), rows are dealt in with their faces popping up after them whenever the view changes, agents waiting on you wiggle once, faces tilt on hover, and Atlas's sparkle twinkles; reduced motion turns all of it off.
  In the rail both tabs become icons and the roster shows faces with their dots.
- The sliders button opens Roster view.
  It starts with a live preview row (the busiest agent, in your current settings) and offers a Reset button counting your changes from the recommended view.
  Order is three option cards, each with the first three faces it would list and a concrete caption ("2 waiting on you go first", "Kin wrote last, 12:00 PM", "Compass to Vital"); the recommended one is tagged.
  Rows are two sketch cards that say how many agents fit without scrolling ("9 of 11 fit").
  Details are switches with a meter and count ("3 of 4 on"), each captioned with a real example from the crew.
- Chats is one full-width page for talking with agents (D27 and D28 in `docs/agents-design.md`).
  Open chats sit as tabs in the same tab bar a domain's workspace uses: pin the ones you keep coming back to, close the rest, and reach any other chat or start a room from the bar's actions.
  The tab bar leads with one fixed tab, the Logbook: every conversation across every chat titled by what you asked, with who, what came of it (waiting on you, applied, turned down) and where you were; filters by state and by chat, search that counts matches without reprinting messages, and a click lands on that conversation in the live chat.
  Beside a chat, the Details rail shows what needs you, the agent's role, places, write mode, tools and routines with Change links, plus Start a room, This chat in the Logbook and Configure; rooms list their members.
  The header carries New conversation, which clears the chat and starts fresh while the Logbook keeps the old one; the composer's context meter opens each agent's measured context window, the model that answers and the crew's write mode.
  The conversation gets a find bar (Ctrl F inside it), message times, grouped back-to-back messages, and in rooms a "To" row: whoever answers first, Everyone in turn, or one member, each chip underlined by that member's context fill.
  A roster row or the side panel's expand button opens a chat here; "Move to side panel" takes it back next to the page you came from, and Close returns there without it.
- Domains opens grouped project lists.
  Library lists topics and drills into one in place.
  Agents is the roster: Atlas, the agents, and the teams, under the domain pages' band with Start a room and New agent on its right and Agents and Teams as tabs on its lower edge.
  Routines adds a routine for anyone, runs what's due, and runs any one now.
  A project's header shows who leads it as a face that changes who leads, and the rest of its crew on the chat button; its team is set in the project dialog.
- On phones, a safe-area-aware bottom bar holds Today, Projects, Chat and More, with Capture as a larger raised button in its centre (agents-design D59).
  More's sheet lists every other page under Places (Domains, Library, Archive) and Crew (Agents, Routines), with Settings and the theme dial below.
  The top bar holds your picture (opening your profile), a seed for each domain (one tap opens it; the one you're in names itself) and Search; it folds away while you scroll down.
  There is no tab strip: a page's heading ends with a stack and the number of open tabs, which opens them (hold to pin, × to close); task rows put the date, domain and face on a line under the title (agents-design D60).
  Chat counts only the agents waiting on you and opens Needs you when held; a sideways swipe on a domain's heading moves to the next domain.
  Settings is a list of its pages that drills into one; the chat keeps its chrome to one line each so the conversation has the height; while the keyboard is up the bottom bar steps aside (DESIGN.md, Layout).
  The peek becomes a bottom sheet.
- On desktop, the status bar keeps save errors and retry, the active note's word count and relative edit time, unread chat count, theme, and hide controls; phones have no status bar, and a failed save shows its own alert.
- It also carries a progress lane fitted to where you are.
  In a project (or one of its resources) it counts the project's tasks, ridden by the same plant as its garden bed.
  On a domain's pages it shows the day: tasks due by today in that domain, done or not, minus those finished on an earlier day.
  On Today the same across all domains.
  It hides when nothing counts, sparks when you tick something off, and turns rainbow when full.
  Reduced motion stops all of it but the fill.
- `Ctrl/Cmd K` searches resources, projects, and topics and matches actions before results: Capture, new note/task/project/topic, linking a resource into the open project, light and dark mode, every theme/background/sidebar/chat rail, Atlas visibility, Settings, and backup export.
  A pasted URL offers to capture it straight to where you are.
  Arrow keys and Enter move through both groups.
- Tabs still close, pin, reorder, resize, and preserve scroll positions. `Alt Shift Left/Right` switches tabs. Settings, Profile, and Capture remain dialogs over the active page.
- Open note editors and Today remain mounted across tab switches.
  Closing a note tab releases its editor.
  Atlas stays mounted while hidden.
  Panels use layout/paint containment; lists longer than 20 items and chat use content visibility.
  Pointer glow moves one small composited layer through a throttled rAF handler.
  Glass uses a 3px blur.

## Where to change the UI

Each module's header comment says what it owns and which invariants it keeps; read it before changing the module.
A big screen part is a folder of small files, each with one job and its own header: `src/shell/`, `src/chat/`, `src/dialogs/`, `src/firstRun/`, `src/pageGrid/`, `src/settings/`, `src/modelSettings/`, `src/room/`, `src/workbench/`, `src/actions/` and `src/commands/`.
Logic never imports drawing: a `.ts` module may not import a `.tsx` one (ESLint), so a type both need lives in the logic (`ui.ts`, `view.ts`, `brief.ts`), and rules a component keeps become a pure module it calls, tested in node (`chat/transcriptWindow.ts`, `firstRun/picks.ts`).

- `src/App.tsx`: composition: it creates the stores once (`createAppServices` in `src/appServices.ts`, which the design showcase reuses), keeps history, the clock, shortcuts and the look in step, and lays the screen out in the shell.
  Components subscribe to the part of the state they draw (`docs/adr/0002`): `src/view.ts` derives the screen from the Workbench and the Room, `src/ui.ts` holds popups and drafts, `src/actions.ts` is every button's behaviour (its areas build on each other in `src/actions/`: core, chat, records, crew, library), `src/appContext.ts` passes them down with `useView`/`useUi`.
  Today's tasks in play, where they sit in the day, the crew's next steps, page places, rituals, horizon and quotes are shared, memoized View parts; renderers keep only presentation and interaction state.
  Visibility depends on record lists rather than the whole Workspace object, so a chat-only write does not invalidate Today's selections.
- Pages: `src/OverviewPage.tsx` (Today and a project's page; each Today part is its own file in `src/today/`, what they show is worked out in `today/derive.ts`, and where each task sits in the day, the free half hours and the crew's next steps in `today/day.ts`), `src/PageGrid.tsx` (the block grid; the tasks, projects and resources widgets and the task rows every list draws are `src/pageGrid/`), `src/DomainPage.tsx`, `src/AgentsPage.tsx`, `src/RoutinesPage.tsx` (its rows, sheet and filters in `src/routinesPage/`, what it lists in `listing.ts`), `src/ChatViews.tsx` (chat panel and Chats page; the Chats page's tabs, picker and Logbook in `src/chatsPage/`), `src/DirectoryPages.tsx` (Domains, Projects, Archive, Library), `src/PersonPage.tsx` (a person's page in the Library, agents-design D71; their dates, mentions and renames in `src/people.ts`, their face in `src/PersonFace.tsx`), `src/ResourceTabs.tsx` (open resources and the peek), `src/StatusBar.tsx`.
  `src/AppDialogs.tsx`: every popup, in stacking order; each is its own file in `src/dialogs/`. `src/LookPicker.tsx`: a record's emblem and colour behind one button.
  `src/Emblem.tsx`: one domain's or topic's emblem, drawn in the family Settings → Appearance → Emblems (`src/settings/EmblemsSection.tsx`) picks (`src/emblemFamilies.ts`; the drawings come from `dev/emblemAssets.ts`, a Vite plugin that serves and emits `/emblems/` from the Iconify sets in devDependencies).
- `src/WorkbenchShell.tsx` and `src/WorkbenchShell.css`: the shell's layout; its parts are `src/shell/` (the sidebar's Projects and Agents tabs, the domain rail, the tab strip, the phone's header, bar and sheets, the splitters, the chat button). `src/morph.ts`: the view transition between the chat button and the panel. `src/WarmEditorial.module.css`: the design tokens (colour, type ladder, radii, durations, shadows, layers), density, daypart palettes.
  `src/styles/`: every other style, one sheet per part of the app (`today.css`, `widgets.css`, `chat-panel.css`, …), each opening with a line that says what it holds; `src/styles.css` imports them in cascade order, so a new sheet goes last.
  `scripts/check-tokens.mjs` (in `pnpm run lint`) keeps the sheets on the tokens, the spacing grid and the four icon sizes, holds each class to the sheet that owns it, and keeps `DESIGN.md`, the landing page, the domain hues and `@property` starting colours on the token file's colours.
  `scripts/check-design-sidecar.mjs` (also in `lint`) keeps `.impeccable/design.json`, the impeccable skill's sidecar, on `DESIGN.md` and the tokens; `--fix` rewrites what it can derive.
- `src/workbench.ts`, with its navigation rules in `src/tabs.ts`: Workspace, Session and navigation (`src/workbench.test.ts`); its writes and Retry, the load migration and where an edit leaves you are `src/workbench/`.
- `src/workspace.ts`: Workspace edits and queries, including the page on screen (`onScreen`) (`src/workspace.test.ts`). It is the interface only: each part lives in `src/workspace/` by record kind (`change.ts` is what every edit returns, `drafts.ts` the record dialogs, `proposals.ts` what agents propose, `queries.ts` what the screen reads).
- `src/place.ts`: place keys and where the Session is (`here`) (`src/place.test.ts`).
- `src/pace.ts`: how a project stands against its clock (steps, stage, finish line, behind) (`src/pace.test.ts`). `src/brief.ts`: what a project's or domain's agent says at the top of its page and on Today (`src/brief.test.ts`); `src/BriefView.tsx` draws it.
- `src/conversations.ts`: the Room module (`src/workbench.test.ts`), its interface over `src/room/` (the Activity store and the two writes in `core.ts`, how chats read in `discover.ts`, replies and questions between agents in `replies.ts`, edits that ask no agent in `threads.ts`, a round of routines in `routineRound.ts`); `src/AgentPanel.tsx` and `src/ConversationPage.tsx` draw it, from the parts in `src/chat/` (the rail, header, find bar, each message, the composer and its context meter; `transcriptWindow.ts` decides which messages show, `useTranscriptScroll.ts` how the transcript moves, `sessionInfo.ts` where the conversation stands), `src/ChatCards.tsx` the cards under a message (proposals, a drafted agent, a question for another agent), `src/ChatDisplay.tsx` what a reply shows (answers to tap, live widgets and tasks), `src/RichText.tsx` a Markdown reply (`src/markdown.ts` decides and strips previews, agents-design D64) and `src/AvatarStack.tsx` the overlapping faces everywhere.
  What a reply read: `src/chat/sources.ts` words it, `src/chat/SourcesLine.tsx` draws the line above the reply and `src/chat/SourceIcon.tsx` the icon it shares with the typing step, `src/chat/Typing.tsx` (the steps a reply took and the one it's on) (agents-design D81).
  Scam warnings: `Warnings` in `src/chat/MessageRow.tsx` draws each kind's fixed words from `warnings.ts` above the reply (agents-design D79).
  `src/chat/ModelLine.tsx`: the composer's model line and picker, over `src/chatModel.ts`, a chat's own model and thinking (agents-design D82, `src/chatModel.test.ts`).
  `src/proposals.ts`: what lands from a reply or routine run, by write mode, and Apply, Reject and Undo (`src/proposals.test.ts`).
- `src/agents.ts`: crews, scope, mentions and measured context (`src/agents.test.ts`).
  `src/agentWorkspace.ts`: an Agent's live, permitted records and change Homes, Page summaries, and current-record proposal/handoff admission (`src/agentWorkspace.test.ts` and `src/workbench.test.ts`).
  `src/atlas.ts`: the `AgentEngine` seam, `createAgentEngine`'s shared model state and per-reply request and draft binding, and the offline adapter (`src/engine.test.ts`).
  `src/agentRequest.ts`: what a reply asks the model (`snapshotOf`, from one Agent's Workspace selection) and how its draft becomes a Proposal or Handoff (`draftsOf`).
  `src/live.ts`: the live adapter, which sends that request to the agent function, reads the stream back and runs file tools between legs.
  `src/folders.ts`: this device's linked folders and the file tools on them (`src/folders.test.ts`); `src/FolderLink.tsx` draws the masthead's folder icon and popover. `src/images.ts`: an image shrunk for an agent to look at (agents-design D58).
  `src/commands.ts`: what agents may propose or hand over, one `CommandDef` each in `src/commands/` (tasks, projects, agents, links, show, fill). `src/agentDrafts.ts`: the agents Atlas drafts from your goal, opened in the agent dialog and saved from it (agents-design D57, `src/agentDrafts.test.ts`).
  `dev/chatgpt/`, `dev/echo/`: the dev-only engines (each has a README or header). `dev/briefings/`: the Agents page's dev-only Briefings tab, every agent's briefing side by side (agents-design D46).
- `src/routines.ts`: when routines run and what their runner is asked (`src/routines.test.ts`); `src/routineRun.ts`: one run, from asking to its outcome, for the Room and the routines function alike (`src/routineRun.test.ts`); `src/RoutineViews.tsx` draws them.
- `src/search.ts`: what Ctrl K finds (`src/search.test.ts`).
- `src/launch.ts`: what a home-screen shortcut or Android's Share sheet opened the app to do (`src/launch.test.ts`); the manifest's `shortcuts`, `share_target` and PNG icons are in `vite.config.ts` (agents-design D52).
- `public/icon.svg`: the app's mark (DESIGN.md, Icons); after changing it, `node scripts/render-icons.mjs` remakes every PNG from it (the PWA's, the iPhone's, the dev install's clay ones, the landing page's copies) and the Windows app's icons, with the checks' pinned Chrome and `tauri icon`.
- `src/skin.ts`: the Skin painter.
- `src/ProjectMasthead.tsx`: what a project page's band holds (who leads it, the crew's chat button, the stage strip) and its agent brief (`docs/page-design.md`).
- `src/PageBand.tsx`: every page's header band (domain, project, person, Agents, Domains, Projects, Library and its topics, Archive, Routines): tile, title with crumb and pencil, line, actions, and the foot on its lower edge (tabs, a stage strip, a person's dates) (`docs/page-design.md`).
- `src/TodayCalendar.tsx`: the shared weekday/date marker in the sidebar and Today's heading; its visual styles live in `src/WorkbenchShell.css`.
- `src/Widgets.tsx`: `DataBlock`, which draws each data block kind from its file in `src/dataBlocks/` (shared parts in `parts.tsx`, the page editor in `PageEditor.tsx`). `src/Resources.tsx`: resource cards, viewer and Capture. `src/NoteEditor.tsx`: the editor. `src/MentionPicker.tsx`: the list @ opens in the editor, Capture and the add-task rows (D71).
- `src/SettingsDialog.tsx` (its sections in `src/settings/`), `src/PanelTabs.tsx`, `src/AccountSettings.tsx`, `src/OwnModelSettings.tsx` (its status card and parts in `src/modelSettings/`), `src/EveryAgentSettings.tsx`: Settings; `src/allowance.ts` is the plan and today's replies they share with Ready, Today and the chat (agents-design D48). `src/PicturePicker.tsx`: your picture's choices and photo upload, shared by Settings → Profile and onboarding's Hello. `src/AgentDialog.tsx`, `src/Dialog.tsx`: the agent dialog and the modal; `src/AgentBriefing.tsx` is its Briefing tab (what the model is told), `src/AgentSettingsParts.tsx` the sliders and tool switches it shares with Settings → Every agent.
- `src/OnboardingDialog.tsx`: the first run (agents-design D34); its steps and the pure `picks.ts` are `src/firstRun/`, its content and the one workspace edit `src/onboarding.ts`.
- `src/Popups.tsx` (styles in `src/styles/popups.css`): the Base UI parts (ADR 0003), `Tip` for every control's tooltip and `Picker` for a menu opened from a button; ESLint refuses a `title` on a button or label. Pages and dialogs few sessions open (Settings, the agent dialog, onboarding, Agents, Routines) are `React.lazy` in `src/App.tsx` and `src/dialogs/`, loaded when first opened.
- `src/model.ts`: the workspace records' types and defaults (Atlas, the default domain and its hues, agent tools, routine and resource kinds). Beside it: `src/dates.ts` (formatting, always English, and day arithmetic), `src/blocks.ts` (a page's widget blocks), `src/session.ts` (this device's navigation, layout and Today cards), `src/look.ts` (portraits and crew styles, colours, emoji), `src/crewStyle.ts` (`usePortraitSrc`, which draws a face in the crew's style), `src/sittings.ts` (a thread's conversations). `src/storage.ts`: IndexedDB adapters. `src/cloud.ts` and `src/account.ts`: the account's `Backend` and server store (`src/cloud.test.ts`). `src/demo.ts`: the demo seed.

## Appearance and storage

Warm editorial remains the only skin. Light/dark/system theme and comfortable/compact density are separate saved choices. Motion uses CSS and the native Web Animations API, without an animation dependency or artificial response delays.

This simplified experiment uses a fresh IndexedDB store, `life-workspace-ui-experiment-v2`, so existing installations also start without the old 5,000-record demo. The previous `life-workspace-prototype-v1` database is left untouched, including any edits. There is no migration or automatic deletion.

Workspace data and replies are plugged in once in `src/main.tsx`: the store (the account's, or `indexedDbStore`, with `withDemoSeed` under `?fresh`) and the engine (`createLiveEngine` signed in, `offlineEngine` otherwise), which dev builds wrap with the echo engine and the ChatGPT plan bridge.
Drop `withDemoSeed` to start with only the default domain and Atlas; with it, a store from before agents gets the starter roster once, a store from before topics gets the example topics and resources once, and a store from before the demo world gets its missing records once.
Demo items land only in domains the store has.
Another `WorkspaceStore` can supply live records: `load()` returns null before the first save; `save(changes)` commits a changeset atomically in call order.
`claimRoutine(id, due)` atomically admits only a newer due time and returns the outcome plus stored receipts.
Workbench requires a confirmed claim before model dispatch; an ordinary save keeps the latest receipt per routine, even when another tab or device wrote it.
IndexedDB claims use one transaction; server claims use the `claim_routine` migration and the existing account quota.
Only `replace(data)` deliberately resets receipts with the rest of a restored workspace.
Workspace owns ordered domains, unique Agent/Topic names, legacy-thread migration and current-record retry.
Device presentation stays in Session.

Signed out, resources (including dropped files and images, kept as Blobs), topics, tasks, agents, chat threads and read state persist in this browser's IndexedDB.
Signed in, those records live in the account and reload on any device, while file and image bodies stay on the device that added them ("Accounts and server storage" above).
Profile fields, layout choices and `followDaypart` belong to the device Session in both cases.
Presets are derived, and appearance previews never persist.
There is no native wrapper.
The app asks the browser for persistent storage on start; Settings → Backups shows whether it was granted.
Settings/Search export a version-2 JSON backup with files and images as base64 (`src/backup.ts`); protect that export.
Restore from backup downloads a copy of the current workspace first and replaces nothing if that copy can't be made; then it replaces the whole workspace in one transaction.
Storage errors remain visible with export and retry.

## Verification

```sh
pnpm --dir experiments/workbench-prototype run check
```

`check` runs the type-check with `tsc` (`typecheck:tsc`; unused locals included; incremental, cached in `node_modules/.cache`), the lint (cached there too) (`eslint.config.js`: jsx-a11y, the dev-code boundary, no import cycles and logic never importing drawing), every `src/**/*.test.ts` and `dev/admin/*.test.ts`, the agent function's Deno tests, and a production build with the bundle check.
`pnpm run typecheck` is the same check on TypeScript's native preview compiler (`tsgo`, pinned in `package.json`): about 6 seconds where `tsc` takes over a minute cold, with the same errors on the same code (2026-11-21), so commits and agents use it and a release still answers to `tsc`.
`pnpm run release` runs it before deploying; the GitHub `check` workflow (`.github/workflows/check.yml`) runs it only when started by hand (`gh workflow run check.yml`), to save Actions minutes.
The pre-commit hook checks the staged snapshot, parking unstaged edits until it ends, so edit nothing while a commit runs; enable it once per clone with `git config core.hooksPath .githooks`.
On every commit it keeps staged Markdown at one sentence per line (`scripts/check-doc-lines.mjs`, which `lint` also runs over every tracked Markdown file).
`lint` also checks that docs point at code that is still there (`scripts/check-doc-paths.mjs`): every backticked repo path exists, and every "`name` in `file`" names a file that still has it, so a split or a rename updates the docs in the same commit.
Code commits also run types (`tsgo`), lint on the staged files and unit tests, plus the agent function's Deno tests when a staged file is one the functions load (`scripts/function-files.mjs`).
Install dependencies with pnpm (`packageManager` in `package.json` pins the version) and keep `pnpm-lock.yaml` as the only dependency lockfile.

For browser checks, `?fresh` resets this device's workspace to the demo seed, `?fresh=new` resets it to what a new person gets (`src/starter.ts`: Everyday and Atlas's welcome, then the first-run flow in `src/OnboardingDialog.tsx`; its picks apply through `src/onboarding.ts`); on the dev server it also forgets this device's echo and ChatGPT plan choices, and `&as=trial` shows the first run's model part as a new account on the trial sees it, signed out (agents-design D48); `?onboarding` reopens that flow over any workspace without resetting it, and `?today=YYYY-MM-DD` pins the day (`pinnedDay` in `dates.ts`): Today and every date drawn from it, the demo seed's dates, the design showcase's widgets and the day routines run for.
`?fresh=large` (dev server and `--mode speed` builds only; `dev/large`, kept out of production bundles by `check:bundle`) resets it to the demo plus a year of someone's records, the same on every run: about 2,000 resources, 500 tasks, 60 more projects, 30 more topics and 400 more chat messages.
Both keep your profile name and bio; everything else in the Session (tabs, look, Today's widgets) resets.
Use an isolated test origin, never personal workspace data.
Signed in, `?fresh` is ignored (it never resets an account), so sign that origin out first (`localStorage.removeItem("atlaswork.auth")`, then reload) when you want the new-person or demo state; the shared hidden browser keeps auth per origin between sessions.
With `?today`, the demo seed's edits and chat messages move by whole days to that day (keeping the real time of day) and routine posts are stamped 12:00 of it, so "edited 12 days ago" reads the same whatever the real date.
The shared hidden browser keeps a service worker per origin, so a preview port it visited before serves the previous build: unregister it and clear `caches` before checking a new build.

Measure speed on a production build (`pnpm exec vite build --mode speed`, which adds the large seed, then `pnpm exec vite preview --host 127.0.0.1 --port <unused port> --strictPort`), never the dev server: React's dev mode is several times slower.
To name the functions in a CPU profile, build with a throwaway config that merges `{ esbuild: { minifyIdentifiers: false, keepNames: true } }` into `vite.config.ts` (`--minify false` makes the main chunk too big for the PWA precache, and the build fails).
The chat composer keeps its text in the panel and saves it to the Session after a 400 ms pause or on send, so a keystroke re-renders only the panel: 2.3 ms median in production, down from 11.2 ms when every key re-rendered the whole app.

Rules that keep interactions fast (docs/adr/0002; measured 2026-11-08 on the demo seed, 1440×900, production build):

- Components subscribe to the part of the View (`useView`) or the UI store (`useUi`) they draw, and React Compiler (`vite.config.ts`) memoizes the rest, so a click redraws what it changed: opening Ctrl+K search or typing in a dialog redraws that popup, a saved scroll position redraws nothing.
  The `react-hooks` lint rules hold the Rules of React the compiler relies on: nothing reads `Date.now()`, `location`, refs or a store's snapshot while drawing; time comes from the View's minute clock (`view.now`).
- Dates and numbers format through `formatDate` and `formatNumber` in `dates.ts`, which cache one `Intl` formatter per options; `toLocaleDateString(locale, options)` builds a new one per call (0.2 ms, 90 times a cached one), so lint refuses it. Day arithmetic uses `addDays`, never `Intl`.
- A new look or a new page changes everything at once: `skin.holdTransitions` turns transitions off inside it for two frames (`data-switching` in WorkbenchShell.css).
  Before, a theme click started colour transitions on hundreds of elements, restyling and repainting them every frame for 280 ms while the dial tried to turn.
  The dial turns before the theme applies, so it starts within a frame.
- Infinite animations move only `transform`, `opacity`, `translate`, `rotate` or `scale`, so they run on the compositor without repainting.
- Nothing scans every record per project, agent or thread while drawing: lookups go through indexes built once per list (`byId` and `perList` in `model.ts`; edits replace a list, never change it, so its identity is its version), as `pendingProposals` (`agents.ts`) and a project's last edited resource (`brief.ts`) do.
  The View keeps the workspace-wide `visible` lists across a domain switch (`workspace.inDomain` re-slices only the domain's), so what's built on them keeps its identity too.
- Lists that grow with the workspace are drawn in pieces: a resource grid without a `limit` shows 48 cards and a "Show 48 more" button (`ResourceGrid`), and a task list longer than 20 rows paints its first 20 with the page and the rest in a background render (`TaskRows`, `useDeferredValue`).
- Today stays mounted behind other pages and hides with `content-visibility: hidden` rather than `display: none` (`.overview-page[hidden]`), so the browser keeps its layout and coming back restyles only what changed.

With the CPU slowed 4×, from `main` before this work to now: theme click 168 → 80 ms, dial start 127 → 35 ms, open project 320 → 112 ms, Today 960 → 344 ms, switch domain 1,368 → 592 ms, open chat 552 → 312 ms, close chat 648 → 200 ms, Ctrl+K 960 → 328 ms, a keystroke in chat 200 → 80 ms.
On the large seed (2026-11-11, medians of interleaved runs of `main` and the fix): Health's Resources section 1,216 → about 400 ms (405 cards before, 48 now), switch domain 448 → 336 ms, Today after a project 584 → 472 ms; the other interactions read the same as on the demo.
What remains is mostly the browser's own work: restyling the whole page when the theme, a domain's colour or a modal dialog changes it, the first layout of a newly opened page, and painting the canvas (its masked pattern and drifting blooms).
On the large seed, Today after a project page rebuilds the whole page (a project page and Today share one `overview-page`), and a domain's Tasks section draws every open task in its groups (about 500 ms for Health's 71).

### On your phone, without a release

With the dev server running, `pnpm run phone` opens it in the phone's Chrome over wireless debugging (`dev/phone.mjs`; pass a port and path for another server, `pnpm run phone 5297 "/?fresh"`).
It connects to the paired phone it finds on the Wi-Fi, maps the phone's `localhost` to this computer's with `adb reverse`, and opens the page, so every saved change reloads on the phone.
`localhost` is a secure context: the service worker, microphone and install behave as in production, and `chrome://inspect` on the computer debugs the phone's tab.
Pair the phone once (Developer options → Wireless debugging → Pair device with pairing code, then `adb pair <ip:port> <code>`); the port it connects on changes whenever Wireless debugging restarts, which the script finds by itself.
The phone keeps this origin's data apart from app.atlaswork.app.
The dev server serves its own manifest (`dev/app`), so Chrome's menu → Install installs it as "Atlaswork dev" with a clay icon, apart from the real app; it opens only while this computer's dev server runs and `pnpm run phone` has mapped the port since the phone last reconnected.

### Speed check

`scripts/check-speed.mjs` exports `checkSpeed(browser)`, which holds a build to fixed budgets, and `compareSpeed(browser)`, which `checkBrowser` runs last (about 8 minutes, twice that when something looks slower) and skips on `origin/main` itself.
It builds production in `--mode speed` into a temporary folder, serves it on an unused port (so no service worker serves an older build), and on each seed (`demo`, then `large`) at 1440×900 with the CPU slowed 4× times ten interactions from input to the next paint: the theme click, the dial's first turned frame, opening a project, Today, switching domain, Health's Resources section, opening and closing chat, Ctrl+K search and typing in the composer.
It throws naming every interaction over its budget (`budgets` in the script, per seed, medians of five, set at about 1.5 times what they measured on an idle drdoom; lower one when you make that interaction faster).
The budgets only hold on that idle machine: on 2026-11-21 `main` missed every one of them 2 to 13 times over on a busy drdoom.
`compareSpeed(browser, { base: "origin/main", rounds: 5 })` (same script) is the one `checkBrowser` trusts: it builds `base` in a temporary worktree and this checkout side by side and times them in turns so both feel the same load. An interaction more than 25% and 32 ms slower than `base` is timed again in a second pass, and only one slow both times fails: one pass alone flagged a different interaction each time it ran.
`checkSpeed(browser, { origin, seeds: ["large"] })` times a speed build you already serve, on the seeds you name; it refuses a dev server.
Run either the same way as the checks below.

### Browser regressions

`scripts/check-browser.mjs` exports `checkBrowser(browser, origin)`, which runs the checks below and the speed check in turn, keeps going after a failure and throws once naming every failed check.
It prints each check's outcome and time as it ends, and a check still running after 20 minutes counts as failed, so one that hangs can't hold up the run (a whole run once hung past 40 minutes, 2026-11-23; a full run takes about 8).
`pnpm run check:browser` runs it from any terminal, OMP or not: it starts this checkout's dev server on a free loopback port and a headless Chrome for Testing pinned in `scripts/browser.mjs` (`chromeBuild`, downloaded once into the main checkout's `node_modules/.cache/chrome`, which every worktree shares; `BROWSER_PATH` names another), which gives the checks the same `browser` interface OMP Eval does on top of puppeteer-core, then stops both.
`-- --only chats,pages` runs some checks, `--account <file>` adds the signed-in AI model check, and `--visual` adds the visual check, left out by default since its goldens come from one machine's fonts (`--update` and `--adopt` pass to it).
Run it before a release; run one check alone while working on its screen.
From OMP Eval, call `checkBrowser(browser, origin)` against a disposable origin the same way.
A dev server that has never served the origin fails the timing assertions on its first run (seen 2026-11-08: all three failed cold, all three passed on the rerun), so load the origin once, or rerun, before reading a failure as real; `check:browser` loads it once itself.

### Design check

`scripts/check-design.mjs` (`checkDesign`, 3 to 6 minutes) runs the [impeccable](https://github.com/pbakaus/impeccable) detector, pinned in the script, on Today, a project page, Library, Chats, Agents and Routines at desktop and phone widths (Chats desktop only), and on `landing/index.html`, and fails on any finding that is not advisory.
Accepted exceptions live in `.impeccable/config.json`: Fraunces, the Garden theme's cream canvas (DESIGN.md's North Star, which the landing page reuses), a misread font shorthand and the Chats page's full-width messages (each with a reason); `nested-cards`, since every widget card sits inside the shell's page panel (Carlos, 2026-11-08); and `repeated-container-text`, since agent names repeat by design (rail, chat list, speaker lines).
Scan any page yourself with `npx impeccable detect http://127.0.0.1:<port>/`.
Design context for agents: `PRODUCT.md` and `DESIGN.md`.

### Design showcase

With the dev server running, `/dev/design/` (for example `http://127.0.0.1:5191/dev/design/`) shows the design system as the app draws it: every token read live from `src/WarmEditorial.module.css` and grouped by what it is for (colours with the contrast of the pairs they are used in, type steps with their role, the spacing grid and sizes, corners, shadows, layers and durations with their job), the shared parts in their real classes, each across its rest, hover, focus, pressed and disabled states, empty, error and toast states, every dialog behind a button, every widget in every view, Today and a project page whole, and the chat panel.
A token the showcase has no words for still shows, under "Unsorted": give it a group, a job and its contrast pairs in `dev/design/Tokens.tsx`.
The state columns restate nothing: `dev/design/force.ts` copies every `:hover`, `:focus-visible` and `:active` rule of the app's stylesheets onto a `data-force` attribute, so a changed hover changes the table.
Widgets come from `PageGrid` and `DataBlock` over workspaces held in memory, so the page never reads or changes this browser's workspace.
The Widgets section's Sample choice swaps the demo for an empty workspace (what a new person gets, and each data widget before its first entry) or an overflowing one (the large seed, and each data widget with a long title and more values than fit); its Width choice draws each view at one of the page grid's four widths.
Check a new widget view in all three samples.
The bar marks the section you are in, a strip under it lists the widget kinds while Widgets scrolls, and on phones the section list is a picker.
Its toolbar switches theme, density and domain through the Skin painter; the domain also picks whose tasks, projects and resources the record widgets show.
Code: `dev/design/` (`Showcase.tsx` the page, `Tokens.tsx`, `Parts.tsx`, `WidgetGallery.tsx`, `workspace.tsx` the in-memory workspaces, `force.ts`, `design.css`). `vite build` bundles only `index.html`, so production never ships it.
Check a new token, part or widget view there in both themes before calling it done.
Its toolbar never changes the look this browser's app starts with.

### Admin page

With the dev server running, `/dev/admin/` (for example `http://127.0.0.1:5191/dev/admin/`) shows what sits behind the app, in five sections kept in the URL's hash (`#agents/Vital`).

- **Agents:** Atlas, every suggested agent by domain, and the steward for a domain you name, each with their defaults (role, hook, onboarding line, house rules, write mode, Personality) beside the exact system prompt they read, built by the functions a live reply uses (`snapshotOf`, `promptParts`, `toolsFor`), so it can't drift from what's sent.
  The prompt shows in the demo workspace or a new person's, coloured by where each line comes from as the agent dialog's Briefing colours it; the source chips hide or show each kind.
  Every line says how to change it, on hover: Atlaswork's ground rules (`groundRules` in the agent function's `texts.ts`) and each command's prompt line (its file in `src/commands/`) are edited in place and saved to that file, one draft for every agent; a profile line jumps to its field in the middle column; a line each person writes (their name, about them, rules for every agent, memories) opens the **sample person**, whose values only feed the preview.
  Lines built per request (notes, places, the crew, pages, memories, folders, today's dates) have their wording in `lineTemplates` (`texts.ts`): the pencil edits the words around the `{slots}` the code fills, and a list's item template beside it.
  A template may leave a slot out, which stops sending that value (the editor says so), but not add one the code doesn't fill (`templateSlots`).
  How much each list holds is a listing limit (Limits).
  The prompt's header gives about how many tokens a reply's first call sends (system prompt plus the tools offered on it, four characters a token), with the change a draft makes against what's saved; commands that wait for a lookup (`Command.after`) are counted apart, since they join only once it ran.
  Lines a draft changes are marked, and so are lines and fields the last release doesn't have yet ("Not released").
  Saving a ground rule restarts the dev server (its bridge imports the agent function), and the page reloads with the drafts it kept; unsaved ground rules don't reach Try it or Cases, unsaved command lines reach Try it.
  Under the prompt, their tools and what their routines ask.
  **Try it** sends one message with that prompt (draft included) through the dev ChatGPT plan bridge and shows the reply, the tools it used, its proposal as a draft and what it remembered; nothing is applied, and it needs the plan signed in from the app (Settings → AI model → ChatGPT plan).
  **Cases** runs the model comparison's cases that cover the agent (by the demo agent, the suggestion a case adds, or a routine's runner), on the draft when there is one, and marks each against that model's saved baseline, with the tokens a reply read over all its calls and the share served from the provider's cache; ChatGPT plan by default, Workers AI only when the dev server has `WORKERS_AI_TOKEN`, one run at a time.
  The view, the workspace and the sample person stay as you move between agents.
  Save writes the defaults into `src/suggestedAgents.ts` (Atlas's role, house rules, write mode and tone into `src/model.ts`; he has no onboarding card, so no hook or line) through the TypeScript syntax tree, so only the values change; a role or house rules HEAD committed move to `retired` (or `retiredAtlas` and `retiredAtlasRoles`), so `withCurrentRules` upgrades agents still holding them (agents-design D41), while a draft saved before any commit is replaced without a trace.
  A new write mode or tone reaches new workspaces only: existing agents keep theirs, as people may have set them.
  Fields hold the agent dialog's limits (40-character role, 400-character house rules).
  Unsaved drafts stay in the tab's sessionStorage across reloads.
  After changing house rules, run the model comparison ("Live agents") before a release, and commit the change yourself.
- **Tools:** each permission with its default and the model tools only it gives, measured on Vital in the demo (every switch on, then that one off), then every model tool with its spec and the prompt line its command adds.
  In the Agents prompt view, each tool's description (`toolTexts` in `texts.ts` for the built-in ones, a command's `description` in its file in `src/commands/`) has the same pencil as a prompt line, with its size in tokens; tool descriptions are most of what a call sends.
- **Changes:** what the next release ships: each agent's changed defaults, ground rules and command prompt lines, with what the newest `release-*` tag held beside what this checkout holds now (saved, committed or not); a ground rule from before `groundRules` existed counts as released when the release held the same wording.
- **Limits:** how much of a workspace a prompt lists (note titles, other agents, page lines and their length, session history, memories, the longest list of choices a tool's schema spells out, how much page text stays inline before `read_pages`, how much of each note a search returns, and how many recent messages go whole and how much of earlier ones), each editable within its range and saved to `limits` in `logic.ts` with Atlas's tokens per call before and after; then the reply caps (`caps.ts`) with the refusals people see, and the other request `limits` with what each bounds; a key without words shows marked, so a new limit can't hide.
  Changes lists templates, tool descriptions and listing limits beside the rules and prompt lines.
- **Operations:** warnings first (today's shared Neurons past 75%, replies Groq answered because Workers AI refused, an account past 80% of its replies or share, trials ending within 7 days), then the hosted project's waitlist (by source), accounts by plan (test accounts left out), replies, Neurons and replies by Groq per UTC day against the caps, getting started as a step-by-step funnel, the anonymous counts (`src/usage.ts`) and shared agents.
  The dev server reads them with the service-role key in its environment and hands the page only the figures, so start it with `WORKBENCH_SUPABASE_SECRET_KEY` set from the Bitwarden key of that name; without it the section says so.
  Each waitlist address without an account has Invite: after a confirmation, the server sends Supabase's invite email, and only to an address that is on the waitlist and has no account.
- **Design system:** the showcase above, in a frame.

Its routes (`/api/admin/status`, `ops`, `invite`, `agent`, `line`, `changes`, `cases`) take the same trust boundary as the ChatGPT bridge (`dev/trust.ts`: the page's own origin and per-start token, and through `tailscale serve` only `TAILNET_LOGINS`), with a token only the admin page is given.
Code: `dev/admin/` (`Admin.tsx` the frame, `AgentsAdmin.tsx` the catalogue and defaults, `PromptView.tsx` the prompt and its line edits, `AgentTrials.tsx` Try it and Cases, `ChangesAdmin.tsx`, `ToolsAdmin.tsx`, `LimitsAdmin.tsx`, `OpsAdmin.tsx`, `catalogue.ts` the agents and prompts, `ops.ts` the figures and invites, `source.ts` the source edits with `source.test.ts`, `limits.ts` what an edit may hold, `compare.ts` the case runs, `server.ts` the routes, `admin.css`).
`vite build` bundles only `index.html`, and `check:bundle` fails a build that carries the admin routes or token.
Browser regression: `checkAdmin` in `scripts/check-admin.mjs`, run like the checks below and by `checkBrowser`; it never presses Save, Send, Run or Invite.

### Screenshot regression

`scripts/check-visual.mjs` exports `checkVisual(browser, origin)`, run like the checks below and by `checkBrowser` (under a minute).
It shoots each token section, the parts with their state table, the states, every widget kind (demo sample, three up) and every dialog of the showcase at 1440px wide, in light and dark, on a pinned day, and compares each with its PNG in `dev/design/golden/`; a shot that changes size, or by more than 0.3% of its pixels, fails, and what it saw is written beside the golden as `<name>.actual.png`.
Today, the project page, chat and Settings' Profile tab follow the clock, so they are left out.
After an intended visual change, look at the `.actual.png` files, run `checkVisual(browser, origin, { update: true })` in your worktree and commit the new goldens with the change, never in the shared main checkout.
A pass (not an update) on a clean checkout records that checkout's look as checked, which `pnpm run release` requires ("Releasing"), so serve the checkout you import the script from; commit the goldens before the run that should count.
Goldens carry one machine's font rendering and one browser's, and `dev/design/golden/machine.json` names the computer and browser that drew them: drdoom since 2026-11-16, with the Chrome for Testing build `check:browser` pins since 2026-11-21, so an installed Chrome updating itself no longer stops the check.
That Chrome also draws text with a fixed ClearType contrast and gamma (`--text-contrast=1 --text-gamma=2.2`, `textRendering` in `scripts/browser.mjs`): Windows otherwise hands it the primary display's, and without the day's monitor (contrast 1) at night every light-theme shot failed (2026-11-22 and 2026-11-23). OMP's own browser has no such switches, so run the check through `check:browser`.
Raise `chromeBuild` on purpose, then redraw them with `pnpm run check:browser -- --only visual --update` on `main` and commit both.
On another machine, `{ update: true }` on `main` (`--update`) writes that machine's own goldens to `dev/design/golden/local/<host>/`, which Git ignores, and later checks there compare with them, so no tracked file changes; `{ update: true, adopt: true }` (`--update --adopt`) makes it the machine that draws the committed ones.
Goldens are images, so Git can't merge them: when a rebase stops on one, take `main`'s (`git checkout --ours dev/design/golden`, then `git add` it) and run `{ update: true }` again before continuing.
OMP Eval keeps an imported module for the whole session, so after editing the script import a copy under a new file name, or the old one runs.

### Contrast regression

`scripts/check-contrast.mjs` exports `checkContrast(browser, origin)`, run like the checks above and by `checkBrowser` (`--only contrast`, about a minute).
It measures every text in the showcase's widgets against the colours painted under it, in each demo domain and both themes, and fails below WCAG AA (4.5:1, or 3:1 at 24px or 18.66px bold); disabled controls are exempt.
It catches what the token pairs in `dev/design/Tokens.tsx` can't: colours mixed per card or per project (`--hue-ink`, a project group heading) on their band (2026-11-22: project headings had sat at 3.3:1 unnoticed).

### Skin browser regression

From this directory, start a disposable Vite origin:

```sh
pnpm exec vite --host 127.0.0.1 --port 5198 --strictPort
```

In OMP's JavaScript Eval, from this project:

```js
const { pathToFileURL } = await import("node:url");
const { resolve } = await import("node:path");
const script = pathToFileURL(resolve("scripts/check-skin.mjs")).href;
const { checkSkin } = await import(script);
console.log(await checkSkin(browser, "http://127.0.0.1:5198/"));
```

The script uses the existing hidden browser, resets only that disposable origin with `?fresh`, pins today's date for the seed, and closes its tab even after a failed assertion.
It refuses the normal workspace ports.
It checks cached startup paint before Workspace load, pointer/focus previews, cancellation, scroll-clamp exclusion and restoration, save/reload and live system-theme precedence.
Stop the Vite process afterward.
No browser-testing dependency or fake DOM is required.

### Chats browser regression

With the same disposable origin, run `checkChats` from `scripts/check-chats.mjs` the same way (`const { checkChats } = await import(...)`, then `await checkChats(browser, "http://127.0.0.1:5198/")`).
It covers the Chats page (D27–D29 in `docs/agents-design.md`): roster to tabs, pin and close, Logbook conversations and jump (D19), find, New conversation clearing the chat and hiding itself while it's clear, starters only in an empty chat with an empty box, a note attached through the paperclip's Find a note and detached, the last changed note offered first in the paperclip's menu and attached by a tap, the header's conversation title and count, its switcher, the Previous line reading the earlier conversation on its own until Back to now, the measured context meter, an asks-first agent's Proposal through Apply and Undo, a memory's pill and Undo, a question for another agent reworded with its pencil, sent, answered and followed up on (D50), a room's "To" Everyone opened from the tab bar's +, and reload.
Replies come from the dev echo engine (`dev/echo`), which it switches on in its own tab, so nothing answers for real; a message starting "propose:" makes echo draft that task, bound by the engine like a model's draft, and "ask: Vital: … | then: …" drafts that question with a follow-up.
To see Today's row of questions routines left, set `localStorage["workbench.dev.echo.routine-ask"]` to "Vital: …" before opening `?fresh&today=…`: every routine run by another agent then asks that.
Its helpers already work around the roster popover's inert duplicate row, hover-only tab buttons, and dev-server typing latency.

### Capture browser regression

With the same disposable origin, run `checkCapture` from `scripts/check-capture.mjs` the same way (about a minute; `checkBrowser` runs it too).
It covers Capture (agents-design D53): the header's place, Save as Task due tomorrow and its Undo, Task remembered for the next capture, recent places then All places, a quote saved with Enter, a project named by the words, and on a phone a saved note that leaves you where you were with Open in its toast.

### AI model browser regression

With the same disposable origin, run `checkModel` from `scripts/check-model.mjs` the same way.
Signed out, it covers Settings → AI model (the status card, the provider row with the dev ChatGPT plan choice, a stored provider asking for a sign-in, the ChatGPT setup opening) and a chat with no model connected saying how to connect one.
Then, in a second tab on the dev echo engine's two made-up models and prices, an agent's own model and thinking (agents-design D44, D45): Atlas's Profile → Model lists them, Thorough and Test answer, Save keeps them, the Chats page's Details names them, his reply says it came from them, and Settings → AI model → Spend by agent prices it ($0.0099 for 906 tokens in and 40 out).
Signed in, it needs a throwaway account: run `node dev/test-account.mjs create` ("Accounts and server storage" above), pass the parsed session file as a third argument (`checkModel(browser, origin, account)`, or `checkBrowser(browser, origin, account)`), and delete the account afterwards with `node dev/test-account.mjs delete <id>`.
That pass (`checkSignedIn`) opens the Chats page with Atlas's Details, saves a made-up OpenAI key in Settings → AI model, and checks that the status card, the in-use mark, Account's own-model cap and the Model row behind the dialog follow without a reload, that Test reports the provider refusing the key, and that Disconnect returns everything to Atlaswork's model.
Without an account the result says `signedIn: "skipped: no test account"`.

After editing a `scripts/check-*.mjs`, reset the Eval kernel before running it again: re-importing it in the same kernel, even with a `?v=` query, runs the old version.

### Project page browser regression

With the same disposable origin, run `checkPages` from `scripts/check-pages.mjs` the same way.
It first opens Domains, Projects, Library, Archive, Routines and Agents and checks that each has the standard band (spans the content, two rows, whole title, actions right of it), then opens Everyday's folded ideas and builds its "Host a celebration" starter, and covers both mastheads (D38: two rows spanning the content, the domain title's pencil opens its dialog, faces-only chat button, chat opens the thread), full grid rows, a countdown quick pick, and the other theme.

### Brief browser regression

With the same disposable origin, run `checkBriefs` from `scripts/check-briefs.mjs` the same way.
In a browser set to Portuguese, it covers briefs (D40 in `docs/agents-design.md`): Today's cards with each speaking agent's face once, Health's "Annual check-ups done" welcome with its starter tip and English dates, the speech mark on the crew chip, Got it and Not now holding through a reload, and Studio relaunch's brief hushed while the chat panel shows Spark.

### First-run browser regression

With the same disposable origin, run `checkFirstRun` from `scripts/check-first-run.mjs` the same way (about a minute; `checkBrowser` runs it too).
It walks what a new person does (agents-design D34, D35, D62): the first run on a trial account with every default, then "Start Health's first project".
Today's guide must speak as Vital with at least two ideas, no chips for the blocks every page has, and "Something else"; both open the project dialog in Health, an idea's Start lands on the new project, and Health's domain page shows "Ideas from Vital" without that one, with a New project card.
Back on Today, the New domain tile plants Family, which lands on Family's page with its own agent's ideas, and the guide then speaks as that agent.

### Verification log

Past delivery verification lives in `docs/verification-log.md`.
