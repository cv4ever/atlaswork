# Verification log

Past delivery verification, newest first. Current checks live in README "Verification".

Base UI menus and tooltips, redone on `main` (2026-11-18, not released; ADR 0003).
The 2026-11-12 `base-ui` branch was too far behind `main` to merge, so it was rebuilt on it: about 180 `title`s on buttons and labels became `Tip` through an AST codemod, and the view menu, the crew, team and steward pickers, the side panel's All chats and the Chats page's picker (Needs you first, filtered as you type, opened by the Needs you shortcut too) became `Picker`.
TypeScript, ESLint, the paragraph and token checks, 215 Node tests, 50 Deno tests and `check:bundle` passed; `checkChats`, `checkPages`, `checkBriefs`, `checkCapture`, `checkFirstRun` and `checkDesign` passed on a worktree dev server.
In headless Chromium: a view menu opened by a quick click, a tap, Enter and the down arrow; arrow keys moved through its items, a pick or a second click closed it, and Escape returned focus to its button; a hover showed "Switch to light theme" and keyboard focus showed a tip at once.
The first build, with a Base UI tooltip trigger per control, a mounted menu per view menu and the rarely opened pages fetched in idle moments, read up to 1.7 times slower than `main` in `compareSpeed` at 4× CPU.
`Tip` now only marks the control and one document listener shows the shared tooltip, `Picker` mounts its menu only while open, and those pages load when first opened.
Five-round `compareSpeed` runs on this busy machine then swung both ways by up to 70% per interaction, so the record is a nine-round run, which passed: theme 112 → 120 ms, dial 76 → 93, project 592 → 568, Today 528 → 568, domain 928 → 1,120, resources 320 → 368, chat 320 → 304 and 256 → 240, search 520 → 616, a keystroke 112 → 112.
The main chunk grew from 418.5 to 427.7 kB gzip (Base UI Menu and Tooltip with Floating UI, less Settings, the agent dialog and the Agents and Routines pages, now their own chunks).

Linked folders and their follow-ups (2026-11-12, released as 09947c6 with everything before it, including the 2026-11-11 entries below; agents-design D47).
Before pushing, the production catalogue confirmed the `usage_counts_event_check` name the migration drops, and showed `20261111123000_routine_admission` and `20261111170000_every_agent_record` still pending; both are additive and went with `20261112120000_linked_folders`.
Read back afterwards: all three migrations recorded, `agent_resumes` present, the usage check accepting `file_reply`, and `claim_agent_resume` not executable by anon.
End to end on the deployed function with a throwaway trial account: the first leg paused on `read_file` with a resume token and counted 1 reply; the resumed leg answered "The receipts are kept in the blue box under the desk." and the count stayed 1; replaying the token returned 409 "already continued", and the token with a changed request 409 as well. The account was deleted.
Workers AI passed the five linked-folder cases in `dev/compare`; headless Chromium read and searched a real PDF through pdf.js.

Routine admission, proposal recovery and shared Today selections (2026-11-11, not released): scoped Node regressions, TypeScript, targeted ESLint and the paragraph check passed.
The local Routine database regression passed all 17 assertions, including authorization, monotonic receipts, account isolation and quota rollback.
Two concurrent Postgres sessions produced one winner, as did independent IndexedDB tabs; an ordinary stale save did not erase the winning receipt.
On an isolated headless origin (5198), changing a proposed page caused Apply to refuse inline, and Request fresh proposal re-sent the exact original text to Atlas while keeping an unrelated composer draft.
Desktop and 390px phone captures showed the wrapped recovery controls without horizontal overflow.
Native Today actions starred an overdue task without repeating it in the late group, completed a task in both plate and garden, and updated the ritual card and heading together.
A browser module probe retained all six Today selection identities across chat-only writes and theme changes, then expired the focus, removed yesterday's completion and reset rituals on the next day.
The scoped UI review ran inline under the delegation policy; the existing visual language stayed unchanged.
The design scan reported existing stylesheet findings outside the edited rules, with none in the changed TSX files.
Production Event Timing at 1440×900, 4× CPU and medians of five measured Today at 552 → 536 ms on demo and 1456 → 688 ms on large, a single paired before/after run on the same workstation.
Both Today results fit the unchanged budgets (550 and 750 ms).
The full speed check still failed large theme (168 ms against 150) and resources (752 against 650), which also failed the baseline; budgets were not raised.

Shared Agent model state (2026-11-11, not released; agents-design D44): typecheck, targeted lint, 13 node tests (`engine`, `live`, `spend`) and 7 Deno provider/admission tests passed.
ESLint does not target the dev echo file; TypeScript checks it.
On an isolated headless origin (5201), `checkModel` passed selection, Thinking, Test, save, Details, reply attribution and the $0.0099 spend result, and `checkChats` passed all eight steps.
The Chats checker now copies returned tab labels into an array literal and checks the browser-error count, retaining its value/order assertions without cross-realm prototype comparisons.
A local ChatGPT-route stand-in exercised an active provider's default changing from `plan-a` to `plan-b`: mounted Details first showed loading, then an explicit metadata error, and Retry recovered the new default.
Changing the same provider's Thinking default to Thorough reached the Agent Profile's Default tooltip.
A disconnected-plan stand-in then reconnected through the real setup flow; mounted Details refreshed to `plan-b` without pressing Retry.
The source design scan returned no findings, and the 390px Profile showed its current model controls without page overflow.
No real provider or credential was used.

omp chat removed (2026-11-10, 4e8aa61, not released): typecheck, lint, 120 node tests and the bundle check passed (`Bundle clean: 8 files`).
On a worktree dev server (5197), `checkChats` passed all eight steps and `checkModel` passed.
With a stale `workbench.dev.omp` link to `main` left in localStorage, Atlas answered "Echo: ping from test" through the echo engine, the badge read "Dev · echo" and the composer "Proactive, with undo".
A unit test covers boot stripping `ompAgent`, `ompThinking`, `ompSessions` and `engineSessions`.

A model per agent (2026-11-10, c8f8299, not released; agents-design D44): 120 node and 24 Deno tests passed, including the boundary refusing a malformed model and `providersFor` choosing only from the own provider's catalogue.
On the ChatGPT plan in a headless tab, Atlas's Profile listed the plan's 8 models with gpt-6-luna as the default.
`not a-model!` was saved as `nota-model`, and the next reply failed with OpenAI's "The 'nota-model' model is not supported…", which proves the agent's model reached the provider; on `gpt-6-astra` Atlas answered "OK".
`checkChats` and `checkModel` passed.

Request check and model tools (2026-11-10, df46410 and 793ce5b, not released): the boundary test sends padded fields at the top, in the agent, a note, a task, history and the model, and none come out.
`checkModel` gained the echo pass (pick `echo-large`, Test, Save, Details row, "Echo on echo-large: Hello?") and passed with `checkChats`.
On the plan, the agent Test answered "OK" in 3.1 s on gpt-6-astra and named OpenAI's refusal for `nota-model`.
The OpenRouter picker in Atlas's dialog listed 401 tool-calling models with prices, Default first (the echo engine briefly posed as OpenRouter for the screenshot).

Model row refresh (2026-11-10, 9d6bb92, not released): with a throwaway free account signed in on 5197 and Settings over the Chats page, Atlas's Details Model row read "The default", then "gpt-test-a (OpenAI-compatible API default)" after Save and test of an OpenAI-compatible model with a fake key (Settings said the provider refused the key), then "The default" after Disconnect, with the URL unchanged throughout.
The account was deleted afterwards.
That session lingered in the shared hidden browser and stopped the next checks from loading 5197 (HTTP 409) until the origin's localStorage was cleared.

Thinking per agent, spend by agent, commands rebuilt (2026-11-10, not released; agents-design D44, D45): 121 node tests (with `spend.test.ts`) and 25 Deno tests passed, including the padded-command boundary case, `parseTest` with effort, and `providersFor` keeping the account's effort unless the agent sets one.
`checkModel` passed with Thorough on `echo-large` ("Echo on echo-large · high: Hello?", Details "echo-large · Thorough") and Spend by agent pricing Atlas at $0.0099; `checkChats` passed.
On the ChatGPT plan, Thorough's Test answered "OK" in 1.7 s, and Atlas's next reply stored `usage.model` `{ source: "chatgpt", id: "gpt-6-luna" }`.

ChatGPT plan bridge (2026-11-09): Carlos signed in through Settings → AI model → ChatGPT plan on a worktree dev server (127.0.0.1:5193); the callback stored a registered client with the plan scope.
`/api/chatgpt/models` listed 8 models; Test answered "OK" in 2.5 s on gpt-6-luna.
A foreign Origin got 403.
`dev/compare/compare.ts chatgpt --cases=1-24` scored 22/24 (median 7.5 s, 2.8 calls a reply; misses: cases 9 and 16 left items out of a summary), so namespaced tools, `function_call` echoes and `instructions` all pass the plan route.
In a headless tab, Use ChatGPT plan set the chat badge to "ChatGPT plan", and Atlas (omp link removed) answered "mark the laundry task as done" with a proposal that applied with Undo.
`responses_test.ts` covers the request shape, a chunked stream and the plan error codes.

Live everywhere and AI model settings (2026-11-09, released aa24e01): `pnpm run check` passed (128 node tests, 22 Deno tests, bundle clean with the echo and ChatGPT markers).
On a worktree dev server, `checkModel` and `checkChats` (echo engine) passed; skin, pages, briefs and speed passed (chats and speed after one rerun); design reported only `edge-flush-cards nav.domain-shelf`, which main shows too.
With the ChatGPT plan on, opening the demo seed ran its due routines through the model: 12 posts across 10 agents (check-ins proposing tasks from notes, a review ticking off two tasks and moving one, a report), each with measured tokens; Kin and Muse proposed the same photo-book tasks, so an agent's own check-in now covers only places it's the nearest owner of.
`compare.ts chatgpt --cases=1-24` with reasoning replay: 21/24, median 6.3 s (22/24, 7.5 s without).
An omp-linked routine reached `/api/agent` and kept the page busy, so routines now never go to omp.
OpenAI API key: the Responses request was accepted, but that key has no credit, which surfaced a nested `error` event read wrongly (fixed, tested).
OpenRouter with effort low answered a tool call.
Production, throwaway trial account (deleted): Atlas answered live with three tasks applied, the pill read "1% · 4.9k tokens", an email request came back as an "Open the draft" mailto link, AI model showed no ChatGPT plan and the Thinking control, `set_model_key` stored effort "low", `{"models":true}` listed OpenRouter models, Test answered in 2.0 s, and Run check-in now on the hosted model answered "found nothing new".

New-person start (2026-11-05): `pnpm run check` passed.
On the production preview with service-worker caches cleared, `?fresh=new` opened Today with five areas and no records.
Today showed "Nothing due today.
Add a task", "Write your first note" and "Talk to Atlas".
The greeting had no name, and the sidebar said "You · On this device".
Atlas's chat opened on the new welcome.
At 390 px there was no horizontal overflow.
`?fresh` still loaded the demo seed ("Laundry and sheets", "Weeknight cooking").
Note: a stale service worker served the previous build on the first try, so clear it when checking a new build in the shared hidden browser.

Fake door and Sentry (2026-11-05): after a prompt line for "I did X", the Workers AI comparison scored 20/20 and 19/20, up from 16 and 17 (both "mark done" cases now pass).
Proposal tool results now name what was proposed and what was skipped, after Kin claimed "three items" for a one-task proposal.
A recapture then said "a new task for Plan one long lunch together".
The waitlist migration on the local stack: a new email returned 201, a duplicate 409, an invalid email 400, a `created_at` override 401, and reading or deleting the list 401.
On the hosted project after `db push`, the landing form (served on 5197 in hidden Chromium) showed the invalid-email message, "You're on the list" and "You're already on the list" (mixed case).
The test row was deleted with the secret key.
Stripe test mode: Atlaswork Pro (€8 monthly, €72 yearly, VAT included, tax code `txcd_10105001`) and the €48 founder product.
Its Payment Link was created with `managed_payments[enabled]=true`, and its checkout page showed €48.00 with tax €0.00 and Link as the seller.
Landing screenshots at 1440 and 390 px had no horizontal overflow.
Sentry: built with `VITE_SENTRY_DSN`, the SDK loaded as a 32 kB gzipped chunk (93 kB raw; the namespace import had been 155 kB gzipped).
A thrown error on the preview posted an envelope to the EU ingest, which returned 200.

Model comparison (2026-11-05): `dev/compare/compare.ts` ran 20 demo-workspace requests through `runAgent` on Workers AI, `claude -p` (Sonnet) and `codex exec`.
First run: Workers AI 16/20, Codex 20/20, Claude 9/20.
One Workers AI miss was the judge's: a non-breaking space in "vitamin D", now normalised.
Another was a real leak of gpt-oss `<|channel|>` tokens, now retried by `degenerate` with a Deno regression test.
A Workers AI rerun scored 17/20; both runs missed "mark done" cases 2 and 12.
Claude's misses were mostly the CLI harness: it tried native calls to the loop's tools and reported them unavailable.
A clearer protocol line raised it to 12/20, and it still did so in 4 cases.
Every reply was plain text.
`pnpm run check` passed.
The redeployed function answered a hosted smoke request with a proposal (58 Neurons).

Live agent engine (2026-11-05): `pnpm run check` passed 77 Node tests (`src/live.test.ts`: places and proposals limited to scope, sourceless Apply/Undo and refusal after a project moves, history limits, sign-in reuse, a 401 dropping the token, local outside tools) and 5 Deno tests (validation, tools, proposal drafts, lookup and round budgets, garbled-reply retry).
On the local stack, the migration applied with `db reset`.
A signed-in user got 403 calling `begin_agent_reply` and updating `agent_usage`, could read only their own row, and was refused at 20 replies.
Hosted: anonymous sign-ins enabled, `db push`, `WORKERS_AI_TOKEN` set, function deployed.
On a production preview build (5190, `?fresh`) in hidden Chromium, the header showed "Live".
Ledger streamed "Reading notes…", "Drafting tasks…" and proposed 3 tasks in Finance / Subscription cleanup; Apply added them and Undo removed them.
Atlas (proactive) ticked off "Cancel the video service" with Undo, and Undo restored it.
With the user's row set to 20 replies, the chat showed "You've used today's 20 live replies" (HTTP 429).
With an invalid Workers AI token the chat showed "Atlas couldn't answer: The AI service failed"; after restoring it the next turn answered.
Five live turns took 9.9, 5.4, 3.1, 2.3 and 3.0 s, at 121, 126, 86, 74 and 149 Neurons (launch plan D6).
`agent_usage` recorded 687 Neurons for the first six turns, matching the streamed totals.
The first browser run found two bugs, now fixed: Workers AI rejects `content: null` on assistant tool-call turns, and three lookups left no tool call for the proposal.

Chat-only omp integration verification on 2026-11-04: TypeScript and accessibility lint passed; all 69 Node tests passed, including real-HTTP origin/Host/token/method/type/size/target/resume denials, cancellation/concurrent-call handling, scoped text export, simulated fallback, persisted responder/room/day/manual-session/relink isolation and local-only routines.
The production/PWA build passed, with the existing >500 kB chunk warning.
Through hidden Chromium on the running tailnet instance, Atlas returned a fresh acknowledgement, then recalled an unpredictable code after a full reload without that code being included in the second request.
Forge returned its canonical `engineer` identity.
Explicit unlink persisted over reload, cleared the native reference and restored simulation; relinking restored OMP chat.
Desktop and 390px phone settings rendered without page overflow.
Live GET/missing-token/foreign-origin/invalid-target/cwd-injection probes returned 405/403/403/400/400 with no CORS grant.
The test browser used its own seeded storage, not Carlos's desktop browser.
No consequential agent action was tested.
Routines, preview and unlinked chat remain simulated; task proposals, native usage accounting, other providers/agents and destructive actions were not live-tested.
No commit, push, new public exposure or Tailscale setting change.
The existing dev server was retained.
SFTP did not trigger its config watcher until the config timestamp was refreshed.
Windows remote checks require the signed-in `remote-task.ps1` route and `call pnpm ...` in its cmd command so the wrapper receives the final exit marker.

omp chat latency verification (2026-11-04): `pnpm run check` passed all 70 tests, including streamed progress and a failure after progress that hides upstream detail.
Against the running dev server on 127.0.0.1:5191, Ledger (`trader`) turns through the warm RPC pool took 11.1 s for the first turn (process start), then 3.4 s resumed, 4.0 s with a `read` tool call (its intent streamed at 2.6 s), 3.2 s in another thread and 2.5 s switching back with the earlier context intact.
The same trivial turns took 10.9 s and 5.7 s with a new process per turn.
The session file recorded thinking `low` for the turn that asked for it and `high` (the agent default) for the next.
Hidden Chromium on `?fresh`: Configure Ledger → Thinking low → Save, then a Ledger chat turn showed "Reading requested README heading…" in the typing bubble at 4.8 s and the reply at 6.9 s.

omp confinement verification (2026-11-04): `pnpm run check` passed all 72 tests and the new bundle step ("Bundle clean: 7 files, no dev omp markers").
A probe file in `src/` importing `../dev/omp/agents.ts` failed lint with the boundary message, and `src/main.tsx` passed.
Hidden Chromium against the dev server on 5191: legacy state was planted (Ledger record with `ompAgent: ""` and `ompThinking: "low"`, a thread with `ompSessions`) and the page reloaded.
The links moved to `localStorage` (`{"ledger":{"agent":"","thinking":"low"}}`), the record lost both fields, and the thread got `engineSessions` keyed `omp:trader`.
Relinking Ledger to `trader` in Profile → Chat connection applied without Save and showed "Dev · omp".
After New session, a chat turn streamed "Reading first README heading…" and replied in 17.4 s (cold RPC start after the config reload).
The thread stored `{"key":"omp:trader","id":"01a1a863-…","start":2}`.

Dev omp tailnet login gate (2026-11-04): a throwaway `tailscale serve` on port 5199 showed that serve sends `Tailscale-User-Login: <the tailnet login>` plus `X-Forwarded-For`, and overwrites a client-supplied `Tailscale-User-Login: evil@example.com`.
The serve entry was removed afterwards.
Unit cases refuse proxied requests without a login or with another login, and accept the allowed login in any case.
Live on 5191 with `OMP_TAILNET_LOGINS` set to the owner's login: a tailnet-origin request and a loopback request both passed the gate (400 for an empty body, not 403).

Composer typing (2026-11-04): on the production preview (5196), 80 scripted input events into the Chats composer took a median of 11.2 ms (p90 16.9) of synchronous work before the change and 2.3 ms (p90 4.2) after.
Hidden Chromium confirmed that typed text survives a reload after a pause, that Enter sends and clears the box, and that the cleared draft stays cleared after reload.
`checkChats` passed all eight steps on the preview; its first run failed once at the roster-to-tabs assertion with identical values and passed on rerun.

Backup and persistence (2026-11-04): `src/backup.test.ts` round-trips a 70,000-byte PNG File (bytes, name, type, lastModified), restores a version-1 file resource without its contents, and refuses non-JSON files, unknown versions and incomplete data.
On the production preview (5196, `?fresh`), Settings → Local data reported that headless Chromium denied persistent storage.
Export downloaded `workspace-backup-2026-11-04.json` (47 KB, version 2) with the demo receipts CSV as a `text/csv` blob.
After that record was deleted from IndexedDB, Restore from backup (dialog accepted) reloaded the app with 43 notes and the 140-byte `receipts-2025.csv` back as a File with its original content.

Owner edit verification on 2026-10-28: TypeScript, accessibility lint and all 60 Node tests passed, and Vite built the production bundle and offline files.
A throwaway script first reproduced the Domain rename preview mismatch, stale Domain/Agent archive overwrites, restored Team membership, and deleted Agent/Team recreation.
Hidden Chromium exercised Domain status and check-in previews through rename, concurrent archive/owner/tool/routine/assignment changes, explicit creation, deletion refusal, invalid and deleted Agent Schedule drafts, reload persistence, and desktop/390px phone rendering without page overflow.
Current routine lists remained visible during unrelated Domain and Agent edits.
`scripts/check-skin.mjs` passed twice against a disposable loopback origin.

Architecture implementation verification on 2026-10-28: installed TypeScript and ESLint binaries passed, all 57 Node tests passed, and Vite built the production bundle and offline files.
Before the edits, a throwaway script reproduced stale Resource writes restoring Home and removing Links, deleted Resource resurrection, stale Project drafts clearing archive state, and deleted Project resurrection.
Hidden Chromium exercised focused Resource edits after a move and Link change, file annotation and Blob preservation, quote source edits, background Project archive/assignment followed by a dialog title save, deleted Project refusal, explicit creation and Domain moves, and reload persistence.
Skin checks covered cached paint before Workspace load, pointer/focus previews, cancellation, save/reload, live system-theme changes, theme colour and scroll restoration without persisting a preview clamp.
Desktop and 390px phone screenshots checked rendering, with no phone page overflow.

Task home verification on 2026-10-22: before the change, a throwaway script reproduced Topic-note proposals writing Tasks with no Domain, and Apply after a Domain rename writing Tasks into the old Domain name.
`pnpm run check` now passes 55 tests, including a regression for both, home validation, missing Tasks and changed-field edits.
Hidden Chromium created a Task in a Project, moved and renamed it into another Domain through the dialog, completed it from its checkbox and kept the completion after reload, with no page errors.
The test tab and dev server were closed afterward.

Thread discovery verification on 2026-10-22: `pnpm run check` passed 54 tests from the 51-test Resource baseline, and `pnpm exec vite build` succeeded.
Hidden Chromium reproduced unread history disappearing from the total after a crew shrank, retained Project Room name search returning no conversations, and a Room with no active members redirecting to Atlas.
After the fixes it exercised empty Room creation and picker visibility, previews, sending, archived agent read-only history, Project archive/delete, retained Room selection and reloads.
Screenshots checked desktop Chats/picker and 390px phone layouts without page overflow.
No browser errors were recorded.
The test tab and dev server were closed afterward.

Resource ownership verification on 2026-10-22: `pnpm run check` passed 51 tests, up from the 49-test baseline, and `pnpm exec vite build` succeeded.
Hidden Chromium on an isolated origin exercised header note/URL capture, section file capture, Ctrl+K URL capture, both Link entry points, peek/editor moves and unlinking, the Project archive keep-sheet, archived-home visibility, Project deletion, cross-Domain Resource tabs and reloads with the saved annotation and Blob bytes intact.
Screenshots checked 1440px desktop and 390px phone layouts.
The test tab and dev server were closed afterward.

Architecture verification: `npm run check` passed all 36 tests and `npm run build` produced the production bundle and offline files.
`src/workbench.test.ts` exercises migration, latest-record retry, concurrent failures, Session and scroll persistence, ordered Room replies, atomic proposal/history writes, approval and drift-refusing Undo, late replies after deletion, independent thread activity, and daily routines across reloads.
Hidden Chromium confirmed the duplicate pending-routine defect before the change and one proposal after repeated runs, created a two-agent Room and observed Muse then Atlas reply in mention order, opened its Chats history, forced a note-save failure and recovered the latest title through Retry, reloaded that title, and checked saved dark appearance with no horizontal overflow on a 390px phone viewport.

The build and both model regressions pass.
For the navigation update, hidden Chromium exercised unread-message opening and read persistence, all directory pages, resource filtering and editor opening, domain deep-link reloads, header task creation, and phone page selection.
Screenshots covered desktop light/dark and 390px phone layouts.
Header fit was checked at 780, 1024, 1664, and 2496px; all five new destinations were checked for phone overflow.

Routine readiness verification: `pnpm run check` passed all 49 tests and `pnpm exec vite build` produced the production bundle and offline files.
Regressions cover missing tools for every owner and run trigger, a review archiving a Project before its routine's turn, quiet manual repeats, manual/scheduled overlap, and posted-message fallback.
Hidden Chromium exercised blocked → permissions enabled without execution → Run due → reload, manual-run deduplication, a domain draft preview, and the 14-day midnight almanac count.
Desktop and 390px phone layouts rendered without page overflow; fresh phone startup had no page errors.

Production profiling at 1440×900 with 4× CPU throttling includes scrolling Home, pointer movement over the canvas, six Atlas transitions, and ten tab switches.
It exposed repeated editor mounts, synchronous tab scrolling, and native Atlas width/height animation; these paths now retain open editors, observe clipped tabs, and scale snapshots.
The strict no-frame-over-16ms target is **not met** on this workstation.
Keep the measured frame costs in the delivery report rather than treating containment or passing tests as performance proof.
