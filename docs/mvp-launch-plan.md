# MVP launch plan

Plan to turn this prototype into a paid MVP and test demand for a subscription. Decided on 2026-11-03 and checked against provider docs the same day. The real agent engine (step 4) is built and deployed; the rest is not implemented yet.
Since 2026-11-27 the source is public under AGPL-3.0. Prices, the provider account list, legal and tax notes and open business questions moved to the private `cv4ever/atlaswork-private` repo (`business-plan.md`); codes keep their numbers.

## Constraints

- Only free tiers, or providers that charge a percentage of each sale and have no monthly fee, until paying customers cover costs.
- Carlos's CapRover VPS is available for self-hosting. It already runs Umami, and an existing Resend account is available.
- The business is in Portugal and sells to EU users, so EEA-specific terms apply (see D6).

## Starting point

- The app runs in the browser. Signed out, data is in per-record IndexedDB (`src/storage.ts`). Signed in, it's in the account (`src/cloud.ts`, D15). The backend is Supabase: auth, the workspace tables and the agent Edge Function (step 4).
- Agent replies and routines come from the live engine (`src/live.ts`) for a signed-in account; with nothing connected, `offlineEngine` in `src/atlas.ts` says so (agents-design D43). Both sit behind the `AgentEngine` interface (`reply` and `about`).
- The app asks for persistent storage (`navigator.storage.persist()`) on start, and Settings → Backups says whether the browser granted it. Headless Chromium denied it; installed PWAs and often-used sites are usually granted.
- Backups are complete since 2026-11-04.
  The version-2 export (`src/backup.ts`) carries every file and image as base64.
  Settings → Backups → Restore from a backup replaces the workspace in one IndexedDB transaction, after downloading a copy of the current one.
  Version-1 files restore without their file contents, which they never held.

## Decisions

- **D1 Paid feature.** Users pay for real agents and routines. Data started local-first in IndexedDB; since D15 a signed-in account keeps it on the server.
- **D12 Pricing** (decided 2026-11-05, launch step 1; free tier widened 2026-11-06 by D16).
  Free: the workspace, with live agents and routines through your own AI model (D16).
  Pro: a monthly or yearly subscription for live agents and routines on our hosted model, with a fair-use daily limit and a 14-day trial that needs no card.
  Prices and the demand test are private.
  Since 2026-11-09 routines are model calls too (agents-design D43), so they count against the same daily replies.
  Since 2026-11-27 (Carlos, with open signups) an account that signs itself up starts on Free, and the hosted model is invite-only: an account invited from the admin page starts the 14-day trial (migration `20261127180000_open_signups.sql`), since the free Workers AI budget covers about 70 replies a day for everyone.
- **D2 Frontend.**
  Host the PWA and the landing page on Cloudflare Pages, free plan.
  Keep them off the VPS: Pages serves the service worker from its global network, and the app stays up if the VPS goes down.
  Since 2026-11-06 the landing page is the project `atlaswork` (atlaswork.app) and the app is `atlaswork-app` (app.atlaswork.app), deployed with `pnpm run deploy:app`.
- **D3 Backend.**
  Supabase free plan: auth, Postgres with row-level security, and Edge Functions for the agent proxy and the billing webhook.
  Chosen over PocketBase because it's managed (no ops work), it keeps server code next to the database, Postgres is what sync engines like PowerSync and ElectricSQL build on, and moving to paid is just a plan change.
  Free plan limits ([pricing](https://supabase.com/pricing)):
  - 500 MB database, 1 GB file storage (50 MB max per upload), 5 GB egress.
  - 50,000 monthly active users, 500,000 Edge Function calls a month.
  - No automatic backups.
  - Pauses after 1 week without activity. At most 2 active projects.
  - Supabase branding stays in auth emails until the Pro plan.
- **D4 Auth.** Magic links plus Google sign-in. Each OAuth sign-in is one email you don't send.
- **D5 Email.**
  Resend, set as Supabase's custom SMTP.
  Supabase's built-in SMTP only sends to project team members, is limited to 2 emails an hour, and has no delivery guarantee ([docs](https://supabase.com/docs/guides/auth/auth-smtp)).
  Resend free plan ([pricing](https://resend.com/pricing)): 3,000 emails a month, 100 a day, 3 domains.
  Setup: <https://resend.com/docs/send-with-supabase-smtp>.
- **D6 LLM.**
  Cloudflare Workers AI's free tier first, with Groq's free tier added once its API key exists.
  Both run behind `AgentEngine` and are called only from the server-side proxy, with a hard daily cap per user.
  Switch to a paid API once revenue covers it.
  Bring your own API key is an optional extra for technical users.
  - **Gemini's free tier is ruled out.** Its terms allow only paid services when an app is available to users in the EEA, Switzerland, or the UK ([terms](https://ai.google.dev/gemini-api/terms)).
  - **Groq** free limits for `openai/gpt-oss-120b`, read from the account's Limits page: 30 requests a minute, 1,000 a day, 8,000 tokens a minute, and 200,000 tokens a day. They apply to the whole Groq organization, not each user ([rate limits](https://console.groq.com/docs/rate-limits)).
    - The [Services Agreement](https://console.groq.com/docs/legal/services-agreement) allows serving end users through your app and has no evaluation-only clause for the free plan.
    - Use only production models, not preview models ([models](https://console.groq.com/docs/models)).
    - EEA customers contract with Groq UK Limited. The [DPA](https://console.groq.com/docs/legal/customer-data-processing-addendum) covers transfers outside the EU with standard contractual clauses (SCCs), and Groq doesn't train on inputs or outputs.
    - Zero data retention for inference is turned on in the account.
  - **Workers AI** ([pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)): 10,000 Neurons a day free. The pricing page says they reset at 00:00 UTC, but the account behaves as a rolling 24-hour window: on 2026-11-19 it refused with error 4006 at 00:20 and 01:30 UTC with nothing spent that UTC day, and was free again about 24 hours after the last spend. `@cf/openai/gpt-oss-120b` costs 31,818 Neurons per million input tokens and 68,182 per million output tokens.
    - Cloudflare doesn't keep inputs or outputs after a standard inference request and doesn't train on them ([data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)). AI Gateway logging or caching would store them, so leave those off.
    - Cloudflare's [DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) is part of its standard agreement.
  - **Capacity, measured 2026-11-04.**
    A throwaway agent loop ran 20 typical requests on Workers AI `@cf/openai/gpt-oss-120b` against the demo workspace.
    It had a ~250-token system prompt, four tools (`read_notes`, `list_tasks`, `propose_tasks`, `complete_tasks`), `reasoning_effort: "low"`, at most 3 tool calls and a 900-token cap.
    - **Per reply:** 2.3 model calls, 1,258 input and 218 output tokens on average (maximum 2,897 in). That cost 55 Neurons on average (maximum 114), about $0.0006 at paid rates. The median reply took 3.5 s, the slowest 8.5 s.
    - **Daily free capacity:** about 180 replies on Workers AI (10,000 Neurons ÷ 55) and about 135 on Groq (200,000 tokens ÷ ~1,480 per reply, assuming similar usage).
      That's about 315 a day, more than double the earlier 135 estimate based on 3,000 in and 500 out.
      Enough for a closed beta of 20 to 30 users at 10 replies each.
    - **Tool use:** 19 of 20 were right. The model looked things up before answering and proposed tasks instead of claiming changes. When no matching task existed, it said so rather than inventing one.
    - **The one failure** was a degenerate reply: 900 tokens of "!!!!" and no tool call. Four retries of the same request were normal. The engine needs a guard: treat `finish_reason: "length"` or a run of one repeated character as a failure, retry once, and show an error instead of the text.
    - The spike sent the whole conversation each round and used no prompt caching. Multi-turn threads will cost more per reply as history grows, so cap the history sent.
  - **Live engine, measured 2026-11-05** (step 4).
    Five chat turns through the deployed function against the demo workspace in a hidden browser: 9.9, 5.4, 3.1, 2.3 and 3.0 s end to end (median 3.1 s), and 121, 126, 86, 74 and 149 Neurons, averaging **111 Neurons**, twice the spike's 55.
    The cost comes from input: the demo agents see 20–40 notes and tasks, the prompt lists every readable note title, and `list_tasks` returns every open task.
    At 111 Neurons the free 10,000 cover about 90 replies a day; the global cap of 8,000 stops at about 72.
    Workers AI returns `usage.neurons`, which the function records.
  - **Model comparison, 2026-11-05** (`dev/compare/compare.ts`, DEVELOPMENT.md "Live agents"). 20 fixed requests through the same loop on the demo workspace.
    **gpt-oss-120b on Workers AI first got 16 and 17 of 20** (median 3.0 and 2.2 s).
    Its one repeated miss: when told a task was done ("I cancelled the video service", "I called Sofia"), it proposed a new task instead of ticking the open one off.
    One prompt line fixed it ("When the person says they did… call `complete_tasks`"): **20 and 19 of 20** in two reruns, and the only remaining miss was an extra, unasked proposal.
    The first run also leaked gpt-oss's own `<|channel|>` format tokens once, which the guard now retries.
    **GPT through the Codex CLI on the ChatGPT subscription got 20 of 20** (median 18.3 s, mostly CLI start-up).
    Claude Sonnet through `claude -p` got 12 of 20, but most misses came from the harness, not the model: Claude Code kept trying to call the loop's tools natively and reported them unavailable.
    A fair Claude result needs the API or the tools served to Claude Code over MCP.
    Subscriptions are for local comparison only; their terms allow only the official clients.
- **D7 Billing.** Stripe with [Managed Payments](https://docs.stripe.com/payments/managed-payments), with Stripe acting as merchant of record. Paddle was the alternative and lost because Stripe now acts as merchant of record too and has more Supabase examples.
  - Stripe handles VAT and sales tax (calculating, collecting, filing, and paying it in more than 80 countries), fraud, disputes, and customer support for each transaction. Portugal is a supported business location ([eligibility](https://docs.stripe.com/payments/managed-payments/eligibility)).
  - Cost ([pricing](https://support.stripe.com/questions/managed-payments-pricing)): 3.5% per successful transaction, calculated on the amount including VAT.
    That's on top of standard Stripe card fees and Stripe Billing's pay-as-you-go subscription fee.
    Stripe's own estimate for other merchants of record is 7% to 9% all-in.
    Expect a similar total here.
  - What customers see ([how it works](https://docs.stripe.com/payments/managed-payments/how-it-works)):
    - They check out with Link, and their card statement shows `LINK.COM* <descriptor>`.
    - Stripe sends receipts, invoices, and trial emails itself.
    - Customers can cancel through Link, and the Customer Portal still works.
    - Checkout pages can't use your own domain.
    - Stripe may issue a refund if you don't answer a support escalation within 48 hours.
- **D8 Analytics.**
  Umami on CapRover for the landing page and conversions.
  Umami custom events for in-app funnels.
  Changed 2026-11-09 for the app: getting started is measured with anonymous per-day counts in our own database instead (`public.usage_counts`, `count_usage`, `src/usage.ts`, agents-design D42), with no cookies or identifiers, so the app needs no analytics script or consent banner.
  Read them with the service role: `select day, event, count from public.usage_counts order by day desc, event`.
- **D9 Errors.** Sentry, free plan, in a separate organization with EU data storage so Workbench doesn't share the ForexTradingTools error quota.
- **D10 Backups** (built 2026-11-06).
  A nightly encrypted `pg_dump` of the hosted database to Cloudflare R2 (free tier), protected against overwrite/deletion for 30 days and automatically expired after 31.
  This is required because the Supabase free plan has no automatic backups.
  Since 2026-11-14 it runs on the existing `fxtt-vps` at 03:17 UTC, outside GitHub Actions: the shared free compute allowance blocked three nightly runs.
  The server uses the dedicated `atlaswork_backup` reader, private credential files, pinned Docker images and a bounded/locked job, and verifies each uploaded ciphertext by downloading and comparing it.
  The archive includes the custom-format dump and a role-name catalog so a fresh image can restore grants without granting login to provider roles.
  GPG encryption uses the existing offsite-backup recovery key; only its public key is on the VPS, and the private key stays in Bitwarden.
  R2's bucket-wide 30-day lock blocks the VPS credential from overwriting or deleting retained backups; an account administrator can still remove the policy.
  R2's separate lifecycle rule expires objects after 31 days; the VPS no longer prunes.
  Thanos independently checks R2 hourly and reports a missing/stale (over 36 hours), unreadable or invalid encrypted archive, with one incident, daily reminders and recovery.
  Thanos also decrypts and restores the newest archive on day 3 monthly at 05:30 local, comparing every archived table's row count and checking workspace RLS and grants.
  Tradeoff: backups now depend on the existing VPS and monitoring depends on Thanos being online, but neither depends on Actions allowance.
  The unencrypted manual Actions backup and its unused repository secrets were retired during the hardening cutover.
  The backup script lives in `cv4ever/omp-config`; operational commands and the restore drill are private (`atlaswork-private/operations-backups.md`).
- **D11 Files.** Files and images stay as Blobs in IndexedDB. Supabase Storage's 1 GB free limit is too small for user uploads.
- **D13 Name** (decided 2026-11-05).
  The product is **Atlaswork**, after Atlas, the lead agent, and the domain is `atlaswork.app` (not bought yet).
  Buy it at Cloudflare Registrar, on the same account as Pages and DNS: it sells at cost, includes WHOIS privacy, and .app costs about $14 a year.
  Checked against the .com and .app registries the same day: `atlas-os` is taken in every TLD checked, `myatlas.app` and `.com` are taken, and `atlasos.app` is free but collides with the AtlasOS Windows project.
- **D14 Swap points** (decided 2026-11-06). Server storage and another agent engine (Letta or similar) plug in behind the two existing interfaces, without changing the UI.
  - **Storage:** `WorkspaceStore` (`src/workspace.ts`): `load`, `save(changes)` and `replace(data)`, each all-or-nothing.
    The account store (D15) implements these three, and a sync engine could later too.
    Backup restore goes through `replace`, so it can't write past a server store.
    The device `Session` stays local (`SessionStore`).
    `?fresh` clears only this browser's IndexedDB, so it never resets an account.
  - **Engine:** `AgentEngine` (`src/atlas.ts`).
    An engine that keeps its own memory (a Letta conversation, for example) would add a session handle to requests and replies, returned in the next request of that sitting; the seam had one (`EngineSession`) until the dev omp chat that used it was removed (agents-design D30, 2026-11-10).
    It may read data from the server instead of `request.data`.
    Proposals still come back as drafts that Workbench applies, which the Homebase Letta POC also needed (approval durability belongs to the app).
  - **Letta was considered and not adopted for the MVP:** it keeps conversations server-side, which the "no stored prompts" function avoids.
    It needs a paid plan ($20 a month plus $0.10 per active agent) or about 600 MB of RAM self-hosted.
    Its server-side tools also can't reach data held in IndexedDB.
    Reconsider it when routines must run with the browser closed or when workspace data moves to the server.
- **D15 Accounts and server storage** (decided 2026-11-06, launch step 5). Carlos chose each option below.
  - **Who:** every signed-in account keeps its workspace on the server. Signed out, it stays in the browser, and agents answer only through a device-local provider (none in production).
  - **How:** a Postgres-backed `WorkspaceStore` (`src/cloud.ts`): `public.workspace_records`, one row per record keyed like IndexedDB, row-level security, and `save_workspace`/`load_workspace` functions so each changeset is all-or-nothing.
    Writes need a connection; a failed one shows the existing "Not saved · Retry".
    Rejected: a sync engine (PowerSync or ElectricSQL), which works offline but adds a service and much more code; a local copy backed up to the server, which isn't real cross-device use.
  - **Files:** bodies stay on the device that added them (D11). Records sync, and another device shows the resource without its file. R2 is the upgrade when that hurts.
  - **First sign-in:** an empty account takes the browser's workspace. An account with data loads as it is, and the browser's copy stays underneath, untouched, for when you sign out.
  - **Plans:** `public.entitlements`. A self-signup starts on Free and an invited account gets the 14-day Pro trial (D12); the agent function refuses hosted replies without Pro or a running trial. Anonymous sign-ins are off, and anonymous users get neither a server workspace nor live replies.
- **D16 Bring your own model** (decided 2026-11-06, Carlos, required before launch). Any signed-in account, **including the free plan**, can have its agents answer through its own AI provider and pay that provider directly. Pro remains the plan for our hosted model.
  - **Ways in:** Settings → AI model has one Provider row (`src/OwnModelSettings.tsx`, `src/ownModel.ts`, reworked 2026-11-09 at Carlos's request): Atlaswork (the hosted model), OpenRouter, OpenAI API (any OpenAI-compatible address: OpenAI, Groq, Mistral, others), Anthropic API, and on the dev server ChatGPT plan.
    The card above it names the one in use; picking another opens its setup, and the one in use changes only when that setup succeeds ("Use Atlaswork's model" disconnects the stored key).
    OpenRouter connects by its OAuth PKCE (one click, billed to the customer's OpenRouter balance, reaches Claude, GPT, Gemini and open models) or a pasted key, with a searchable list of its models that call tools (from OpenRouter's public catalogue, with prices and a "Free models only" filter).
    OpenAI and Anthropic list the models a key reaches: a key just typed asks the provider from the browser, a stored key asks through the agent function (`{"models":true}`, no reply counted), and the model field suggests them (any id can still be typed).
    "Thinking" (Model default, Fast, Balanced, Thorough; `model_keys.effort`, migration `20261109190000_model_effort.sql`) sets a reasoning model's effort for OpenAI and OpenRouter; Anthropic has none.
    OpenAI's own API (api.openai.com) answers through the Responses API with nothing stored at OpenAI and the model's encrypted reasoning sent back between tool rounds; other OpenAI-compatible hosts keep Chat Completions.
    "Save and test" and "Test" send one tiny request through the agent function (`{"test":true}`, counted against the own-model cap) and show the answer time or the provider's error.
    "Disconnect" removes the key.
    Every agent answers through the provider in use, on its default model or on one picked in the agent's Profile (agents-design D44, 2026-11-10).
  - **ChatGPT plans** (checked 2026-11-09 against OpenAI's [Sign in with ChatGPT docs](https://developers.openai.com/siwc/token-sharing-open-source)): plan usage is open to open-source and locally hosted tools; paid or remotely hosted apps need OpenAI's approval through the interest form, which Atlaswork submitted 2026-11-06.
    So the product can't offer it yet.
    Carlos chose a local bridge for his own use (2026-11-09): the dev server signs in with OpenAI's documented flow, keeps the tokens on his computer and answers through `runAgent` on the Responses API (`dev/chatgpt/README.md`).
    `supabase/functions/agent/responses.ts` holds that call, so after approval the function can store the grant like a model key and use it server-side.
    OpenAI's UX requirements are in the bridge already: the first-use "You're using your ChatGPT plan" notice, "Using ChatGPT plan · Manage usage" beside the context pill, and a usage-limit message led by Manage usage.
    Still owed at approval: eligible plans marked on the pricing page, which doesn't exist yet.
  - **Not possible:** Claude Pro/Max subscriptions. Anthropic forbids third-party apps from using Claude.ai sign-in or plan credentials ([legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)).
  - **Keys:** encrypted in Supabase Vault (`public.model_keys` points at the secret), write-only for the customer (`set_model_key`, `clear_model_key`, `model_key_status` shows the last four characters), read only by the agent function through the service role (`model_key_for`).
    Disconnecting or deleting the account deletes the secret.
    OpenAI-compatible addresses must be https on a public host name, so the function can't be aimed at internal addresses.
  - **Limits:** own-model replies need no plan and spend none of our Neuron budget; a looser cap of 200 replies a day per user guards our function. Their cap on output is 4,000 tokens (reasoning models think inside it) and 60 s per call.
  - Rejected: keeping the key only in the browser. It never reaches us, but routines that run with the browser closed couldn't use it later.
- **D17 Phone** (decided 2026-11-16, Carlos, in a grilling session on an Android app).
  **No native or Play Store app for now.** Atlaswork stays a PWA, and the phone is a companion: capture, approving proposals, reading check-ins and chat, not editing project pages.
  A native shell (Trusted Web Activity, Capacitor or Kotlin) would fix none of what the phone lacks: routines run only while the app is open (agents-design D10), writes need a connection (D15), and files stay on their device (D11).
  Selling inside a Play Store app would also bring Play's billing rules on top of D7.
  **Revisit** when public signups open or beta users ask for home-screen widgets, the one feature that needs native code.
  **Phases**, each released to the closed beta after a browser check:
  1. Built 2026-11-16: PNG and maskable icons, home-screen shortcuts and a share target for text and links (agents-design D52).
  2. Routines while you're away, built 2026-11-16 (agents-design D54): routines run on the server (Supabase `pg_cron` calling the `routines` Edge Function) for accounts that opt in ("Run routines while I'm away", offered on the Routines page after routines have run and in Settings → Account), through the same agent permissions and claims the browser uses, paused after 7 days without opening the app.
     Built the same day (phase 2b, agents-design D55): opt-in web push for what a run posts (a report, proposals, an agent's question): one push per post with an Open button only (approving stays in the app), none while the app is on screen on that device, and none in quiet hours, 21:00 to 08:00 by default and changeable in Settings → Account.
  3. Built 2026-11-16 (agents-design D56): new notes and shared items written offline wait on the device and save when the connection returns.
  4. Built 2026-11-21 (agents-design D72): a chat reply finishes and lands when its tab closes mid-reply, with a push.
     Work you hand off runs on the server since 2026-11-22 (agents-design D73).
     Since 2026-11-23 every chat reply and hand-off is a job the server lands in the account whatever becomes of the page, so a sleeping laptop or a dropped connection no longer loses it, and a hand-off carries on across runs for up to 10 minutes (D76, built).
     Every device, the phone included, reads what each job is doing from the job itself, without coming back to the app.
     Since 2026-11-23 Atlaswork for Windows (D18, agents-design D77) lets a folder on a computer be asked about from the phone: a reply that reads it moves to that computer, and waits for it while it's off. Since 2026-11-24 a question from the phone can also search the folders chosen on that computer (agents-design D78), and since 2026-11-25 tidy them, with Apply and Undo from the phone (D79), keep where something was found with Keep on the phone (D80), and search every computer with search on at once, the reply moving to the one the file is on (D84). Cloud folders come after it.
- **D18 Desktop app, no self-hosting, and a one-time license** (2026-11-22; the desktop app's first version built 2026-11-23, the rest proposed: from Carlos's brainstorm on self-hosting Atlaswork, a local core on his computers and a version sold once).
  **Desktop app.** A Windows app that lets agents work on the person's computer (agents-design D77 to D80), the next big step after jobs (agents-design D76), ahead of cloud folders.
  Its first version is built (agents-design D77): pairing a computer, a helper that runs the agent loop there, and folders on the computer that every device can ask about. It installs unsigned, for Carlos only (Costs).
  Since 2026-11-24 agents find files across the computer and show them (agents-design D78): from any device a reply searches the folders on that computer's search list, from the helper's own index, and asked in the app's window it can open what it found on that screen.
  Since 2026-11-25 they tidy them where that computer allows it, moving and renaming files into folders in Documents with Undo, and the app's code puts fixed warnings above a reply that meets a common scam (agents-design D79); the trusted helper comes later.
  Since 2026-11-25 too, agents may offer to remember where something is on a computer, kept only with the person's Keep and forgotten when the computer is removed, and past 40 memories they read the ones that best match the message (agents-design D80).
  Since 2026-11-25 too, one question searches every computer with search on at once, names those that are off, and moves the reply to the computer the file it needs is on (agents-design D84).
  Since 2026-11-26 the app updates itself: a release that changes it publishes a version signed with the app's own update key, free and apart from Windows code signing, which installed apps download within the hour and install between jobs with the window closed, and the account shows each computer's version (agents-design D85).
  **No self-hosting product for now.** Running the backend for a customer means the whole Supabase stack, every migration applied on someone else's server (35 by 2026-11-22) and a Google OAuth client of their own.
  The backend stays hosted, and the work that self-hosting would have moved onto a person's own hardware runs in the desktop app instead.
  Since 2026-11-27 the source is public under AGPL-3.0, so anyone may run it themselves without support; contributions go through a CLA so the hosted service and any license sold once stay possible.
  **Selling once.** If Atlaswork sells something once, it's the desktop app: a perpetual license with 12 months of updates, which buyers keep using after that.
  The hosted model stays a subscription (D12).
  Free with a model of your own (D12, D16) already has no subscription and pays nothing, so the license is what those buyers would pay for.
  **Costs.** Windows code signing is paid every year, against this plan's free-tiers rule (Constraints), so desktop builds stay unsigned while Carlos is the only user, and signing is chosen before anyone else installs (agents-design D77: the Microsoft Store signs for free; Azure Artifact Signing doesn't take individuals here).
  Computer jobs read far more than a chat reply, so they need the person's own model, a model on the computer or a dearer plan (agents-design D78).
  Updates download from Supabase Storage, within the free plan's 5 GB of egress a month while there are few computers (about 2.3 GB at 3 computers and 5 releases a week, 36 MB an installer); many more installs need a paid plan or another host (agents-design D85).
  **Open.** The license price and what it includes, and the checks under Still open.

## Launch steps

1. **Define the test.** ~~Decide what's paid, the price, and the success number.~~ Decided 2026-11-05: see D12.
2. **Fake-door test.** A "coming soon" landing page with real screenshots and a waitlist, live at <https://atlaswork.app> from 2026-11-05 to 2026-11-27; no payments or pricing on the page yet.
   - `public.waitlist` keeps the addresses that joined; nobody can read it through the API, and the admin page invites from it (step 5).
   - Each signup stored `source` = `<utm_source>:<utm_content>:<hero|footer>` (migration `20261105150430_waitlist_source.sql`). Visits come from Cloudflare Web Analytics.
   - Since 2026-11-27 the page sends people to the app and the GitHub repo instead; the `waitlist` Edge Function and `landing/waitlist.js` are gone. Promotion plans and the founder offer are private.
3. **Prepare the app for strangers.**
   - ~~Replace the demo seed with onboarding and empty states.~~ Done 2026-11-05 (Carlos chose the smallest option): a never-saved workspace starts with five empty areas (Everyday, Health, Family, Finance, Career) and Atlas, whose welcome explains the first step (note → attach → ask for next steps → approve).
     The existing empty states cover Today, tasks and resources.
     The profile defaults to "You" with an initial-letter avatar instead of Carlos's name and photo.
     The app is named Atlaswork in its title and install manifest.
     The demo seed stays for tests (`?fresh`); `?fresh=new` shows the new-person start.
     Extended 2026-11-07: the starter is Everyday and Atlas only, and a first-run flow (agents-design D34) offers the areas and agents, including ones shared by the community.
   - ~~Call `navigator.storage.persist()`.~~ Done 2026-11-04.
   - ~~Fix the backup: include file Blobs and add a matching import.~~ Done 2026-11-04 (`src/backup.ts`, Settings → Backups).
   - ~~Add Sentry.~~ Done 2026-11-05: `@sentry/react`, errors only, without personal data. It loads only in production builds with `VITE_SENTRY_DSN` set, as a 32 kB gzipped chunk. A test error reached the EU project (HTTP 200).
4. **Real agent engine.** Built and deployed 2026-11-05: the `agent` Edge Function (`supabase/functions/agent/`) on Workers AI, and `createLiveEngine` (`src/live.ts`) behind `AgentEngine`. Details in DEVELOPMENT.md "Live agents".
   - The browser sends the signed-in account's token (step 5; it signed in anonymously until then) and a permission-filtered snapshot with the current session's last 12 messages (about 6,000 characters at most). The function keeps no history; a chat reply or work handed off is stored as a job with its request until the job ends, at most 24 hours (agents-design D76, `public.agent_jobs`), and its answer lands in the workspace's chat.
   - Tools run server-side against that snapshot: up to 3 lookups (`read_notes`, `list_tasks`), then `propose_tasks` or `complete_tasks` until one proposal exists, at most 4 tool rounds.
     The browser turns the proposal draft into a Workbench `Proposal`, so Apply, Undo and write modes work unchanged (agents-design D2, D11).
   - Guards: a 20 s timeout per model call, a 900-token cap, one retry for a reply cut at the cap or degenerated into one repeated character and then an error, request validation, 20 replies and 2,000 Neurons per user per UTC day and 8,000 Neurons a day across everyone (`public.agent_usage`, readable only by its owner, written only through service-role functions).
   - Signed-in accounts with Pro, a trial or their own model get it (D15, D16). The badge reads "Live". Routines answer through it too since 2026-11-09 (agents-design D43).
   - Groq is the second provider (2026-11-06): the function retries a call on Groq when Workers AI answers HTTP 429 (`complete` in `provider.ts`).
     Its free limit of 8,000 tokens a minute for the whole organization is about 5 replies a minute, so it absorbs bursts, not sustained load.
     Reviewed 2026-11-06 (Carlos kept it): the alternative is Workers Paid at $5 a month minimum, which removes the free daily cap and lets Groq and its US transfer go.
     Cerebras has no lasting free tier, and Mistral's free plan may train on inputs.
     Revisit at the first paying customer or when the beta outgrows about 90 replies a day.
5.
   **Accounts and access.**
   Built 2026-11-06 (D15, DEVELOPMENT.md "Accounts and server storage") and deployed to the hosted project the same day: the migration, the agent function, anonymous sign-ins off.
   Two throwaway accounts on the hosted project each got a trial, saw only their own records and had an unknown key refused.
   Both were deleted afterwards.
   - ~~Supabase auth (D4) and an `entitlements` row per user.~~ Email sign-in links, "Continue with Google", Settings → Account, the trial and the plan check are done.
     Google uses the OAuth client in GCP project `atlaswork`, published to production with only the basic email and profile scopes, so it needs no verification.
   - ~~Resend as custom SMTP (D5).~~ Done 2026-11-06: Supabase sends from `no-reply@auth.atlaswork.app` through `smtp.resend.com` with a sending-only key limited to that domain. A test sign-in link to Resend's `delivered@resend.dev` was delivered.
   - ~~SPF, DKIM, and DMARC records on an auth subdomain.~~ Done: Resend's DKIM, its two return-path CNAMEs and `_dmarc.auth` (`p=none`) in the `atlaswork.app` zone. The domain is verified in Resend.
   - ~~Raise Supabase's email limit.~~ 30 an hour, lowered to 4 an hour on 2026-11-13, raised back to 30 on 2026-11-27 with open signups (Carlos's choice): Resend's free 100 a day are still shared with FxTT, and "Continue with Google" has no limit.
   - ~~Turn on Supabase's CAPTCHA protection.~~ On, with the Turnstile widget "Atlaswork sign-in" (hostnames `atlaswork.app`, `localhost`, `127.0.0.1`).
     An email sign-in without a token is refused (`captcha_failed`).
     Builds must set `VITE_TURNSTILE_SITE_KEY`, or the form waits for a CAPTCHA that never appears.
   - The app is live at <https://app.atlaswork.app> (2026-11-06, D2).
     The owner's account is invited and set to `pro`.
     The hosted site URL is the app; the redirect list adds the local dev and preview servers.
     From 2026-11-07 to 2026-11-27 it was a closed beta: signed out, every deployed host showed only the waitlist and an invited sign-in.
     **Open since 2026-11-27** (Carlos): signups are on (Supabase Auth → "Allow new users to sign up"), the gate is gone, and signed out the app opens the local workspace, where Settings → Account signs in or creates an account. New accounts answer through a model of their own (D12).
   - Security review 2026-11-13, before signups open: a Content-Security-Policy and `frame-ancestors 'none'` on both sites (`public/_headers`, `landing/_headers`); sign-in emails carry a one-time code beside the link; the waitlist needs a Turnstile check and no longer tells whether an address was listed; Auth's before-user-created hook refuses sign-ups on disposable email domains (admin-created and invited accounts skip it); each account gets at most 2,000 of the 8,000 shared Neurons a day.
6. **Billing.**
   - Stripe Checkout for subscriptions with a trial, plus a webhook (Edge Function) that updates `entitlements` from `customer.subscription.*` events. With Managed Payments, subscriptions must be created through Checkout or Payment Links.
   - Set the product's tax code to `txcd_10105001` (AI as a service, cloud-based, personal use).
   - Test renewals, failed payments, and cancellations in test mode.
7. **Legal and business.**
   - ~~Privacy policy that names the processors.~~ Done 2026-11-06: <https://atlaswork.app/privacy>, linked from Settings → Account.
   - ~~Terms of use.~~ Draft live 2026-11-06 at <https://atlaswork.app/terms>, linked from the sign-in form. A refund policy joins it when payments open (step 6).
   - ~~Data processing agreements.~~ 2026-11-06: Supabase's, Resend's, Groq's, Cloudflare's and Sentry's are in place.
   - ~~GDPR data export and deletion.~~ Done 2026-11-06: Settings → Account → Danger zone → Delete calls `delete_my_account()`, which deletes the auth user, and the workspace, plan and usage rows cascade with it.
     It also clears the device's file shelf.
     Export is the existing workspace backup (Settings → Backups).
     Backups keep a deleted account for up to 30 days (D10), as the notice says.
   - Business registration and tax notes are private.
8. **Measure.** Track signup, activation (first project, first real agent reply), week-1 retention, trial-to-paid conversion, and LLM tokens per user.
9. **Launch in stages.** Open to everyone since 2026-11-27 with own models only; the hosted model stays invite-only until paid LLM usage is affordable, since the free LLM tiers (D6) can't support more.

## Not free

- A domain, about €10 a year. A `pages.dev` address works for the fake-door test. Buy a domain before adding billing.
- Work-accident insurance and possibly an accountant for the Portuguese registration.
- Windows code signing for the desktop app (D18), every year.

## Risks

- **R1 Data loss.**
  Signed-out data disappears if the browser profile is cleared or the browser refuses persistent storage.
  The export now keeps files and images and can be restored, but only if people export.
  Accounts move records off the device (D15), but file bodies stay on it.
  Account data is backed up nightly (D10), so up to a day of changes can be lost.
- **R2 LLM capacity and cost.**
  The spike measured 55 Neurons a reply (D6); the live engine averaged 111 on the demo workspace, so Workers AI's free tier covers about 90 replies a day, and the function's global cap stops at 8,000 Neurons (about 72).
  Per-user caps: 20 replies and 2,000 Neurons a day, so four heavy accounts at most can spend the shared budget; opening signups still needs paid inference or a much smaller free allowance.
  Routines will use the same budget once they're real.
  Growth means paid inference (about $0.0012 a reply at 111 Neurons).
  Cost grows with how much an agent can see and with history (capped at 12 messages).
  Trimming the note-title list and paging `list_tasks` are the first savings to try.
  Linked folders (agents-design D47, 2026-11-12) keep a question about files to one reply, but fill the context with file text, so each costs more Neurons; watch them before linking folders leaves the closed beta.
  A hand-off (agents-design D73, D76) counts as 3 replies but may take 24 tool rounds over 10 minutes, each later round rereading what the earlier ones found, so one can spend many times a reply's Neurons; the account's daily share still stops it.
- **R3 Device expectations.**
  People assume a subscription app syncs across devices.
  Accounts sync records, but not files and images (D15).
  A change made elsewhere shows when you come back to the app (it reloads the account when it becomes visible), not live while you're looking at it.
  Since 2026-11-23 an agent's work is the exception: every signed-in device reads its jobs while one is open and reloads when it ends (agents-design D76).
  Say both clearly.
- **R4 Supabase pausing.** The free plan pauses a project after 1 week without activity. Real users keep it active. A pause before the beta doesn't matter.
- **R5 Managed Payments eligibility.**
  Stripe reviews accounts first.
  It only works with Checkout and Payment Links, with no embedded payment forms and no subscriptions created outside Checkout.
  Fallback: plain Stripe with Stripe Tax.
  You then become the seller and register and file VAT yourself through the EU One-Stop Shop.
- **R6 VPS backups.** Anything on CapRover that holds user data or payment status needs backups stored off the VPS (D10).
- **R7 Selling before registering.** Private (business registration).
- **R8 Server workspace size.**
  Handled 2026-11-06: each record is capped at 1 MB and each account at 25 MB (`save_workspace` refuses the changeset and the app says the workspace is full).
  Writes go only through that function.
  Twenty full accounts would still fill the free plan's 500 MB, so watch the database size in the dashboard and move to Supabase Pro (8 GB) before it gets close.
- **R9 Google connector verification** (agents-design D74, proposed 2026-11-22).
  Calendar connections need Google's sensitive-scope app verification before public signups; Gmail's restricted scopes need restricted-scope verification and a paid yearly security assessment (CASA).
  Until Gmail passes, it stays on its own unverified OAuth client, invited beta accounts only, at most 100 users.
  Calendar's scopes went on the `atlaswork` project on 2026-11-22, unverified: before signups open, submit verification (privacy policy, demo video of connecting and reading) from the Verification Center.
  **Checklist** (2026-11-23, against Google's [verification requirements](https://support.google.com/cloud/answer/13464321)):
  - Done: home page on `atlaswork.app` with what the app does and links to Privacy and Terms; the privacy notice's Google Calendar part with the Limited Use statement (`landing/privacy.html#google-calendar`, live since 2026-11-23); the in-app notice in Settings → Connections; the three narrowest scopes with a justification; incremental consent (Calendar is asked only on Connect).
  - **Redirect domain** (Carlos's call, 2026-11-23). Google requires ownership, through Search Console, of every authorized domain, and both redirect URIs were on `mcihsugblojunfpuohim.supabase.co`, which we can't verify. Of a Supabase custom domain (paid) and Calendar on its own Google Cloud project, Carlos chose the project: "Atlaswork Calendar", authorized domain `atlaswork.app` only, redirect `https://app.atlaswork.app/connectors/callback`. A Cloudflare redirect rule on the `atlaswork.app` zone (`http_request_dynamic_redirect`, rule `16a46675e0474227859c5c77d38e2dea`) sends that path, query kept, to the connectors function's `/callback` with a 302. Sign-in stays on the `atlaswork` project, which needs no verification with email and profile only.
  - Cutover done 2026-11-23: project `atlaswork-calendar` made (Calendar API on; branding with `atlaswork.app` home, privacy and terms links and the only authorized domain; the three scopes; External, In production, unverified), web client "Atlaswork Calendar (connectors)" with that one redirect, stored as Bitwarden `WORKBENCH_GOOGLE_CALENDAR_CLIENT_ID` and `WORKBENCH_GOOGLE_CALENDAR_CLIENT_SECRET`; the functions' `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_REDIRECT_URI` point at it, and Connect's consent link names it. `atlaswork.app` was already a verified domain in Search Console. Grants made with the old client stop refreshing, so each connected account sees "Google Calendar disconnected" and connects again once. The `atlaswork` project's Calendar scopes are removed, since sign-in needs only email and profile.
  - Then Carlos: record the demo video (English consent screen, the app name and client visible: sign in, Settings → Connections → Connect, Google's page with the three permissions, back in the app give an agent Events, ask it "What's on tomorrow?", the sources chip and its days, Add to Google Calendar on a handed-over date, Disconnect) and upload it unlisted to YouTube; submit from Google Auth Platform → Verification Center with the video and the justification. Review takes a few days to weeks.
  - Video recorded and uploaded 2026-11-23 (<https://youtu.be/igAkcA36zeU>, unlisted). **Verify branding failed** the same day with four automated issues: privacy policy insufficient, home page behind a login page, home page doesn't explain the purpose, app name doesn't match the home page. The home page then gained "Your Google Calendar, if you connect it" (why the app asks for Calendar, linking `privacy.html#google-calendar`), its waitlist links say "privacy notice" rather than "waitlist privacy notice", and the hero's first line names Atlaswork. Re-verification ("I have fixed the issues") passed and the branding was published the same evening.
  - **Submitted for verification** 2026-11-23 from the Verification Center: one justification for the two sensitive scopes (`calendar.calendarlist.readonly` counts as non-sensitive), the video, and Additional info (separate sign-in project, incremental consent, sealed tokens, Limited Use, a reviewer account on request at hello@atlaswork.app). Status: data access under review. The `atlaswork` sign-in project no longer lists Calendar scopes.

## Accounts and open business questions

Private: `atlaswork-private/business-plan.md`. Secrets are in Bitwarden Secrets Manager and are never committed.
