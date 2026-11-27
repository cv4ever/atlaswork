# Coding standards

Read during review. `pnpm run check` already enforces types, the accessibility lint and tests; these are the judgement calls it can't.

## CSS

- **Global class names stay unique.** Styles are global: one sheet per part of the app in `src/styles/` (imported in cascade order by `src/styles.css`), then `src/WorkbenchShell.css`. A new class in a diff must not already style a different component. `scripts/check-tokens.mjs` (in `pnpm run lint`) fails when a second sheet styles a class on its own; a deliberate restyle is listed in that sheet's `/* restyles: … */` comment, and a review asks whether each new entry there is one component or two. Example: `.agent-badge` is the agent dialog's name badge; reusing it for a chat portrait badge turned that badge into a 35×50 sticky box.

## Copy

- **UI paths in copy match the current labels.** Messages, errors, docs and comments that name a place in the app ("Settings → Account") use the tab and section names the UI shows today. A diff that renames or moves a tab or section greps `src/`, `supabase/functions/`, `docs/`, `README.md` and `DEVELOPMENT.md` for the old path. Example: after the AI model moved to its own tab, the agent function still told signed-out users to connect a model in "Profile → Account".
- **User-facing copy uses the app's own words.** Domain (never area, section or category; Everyday is the default domain), project, resource (a note, link, file, image, video or quote; "note" only for the note kind), Library and topic, agent and crew (Atlas is "your thinking partner", other agents are never bots or assistants), team, room, routine, proposal, and the write modes "Proactive" and "Asks first". A diff that adds copy with a synonym picks the term here; a new concept earns a line here first. Example: the onboarding shipped as "Your areas" and was renamed to "Your domains".

## Review switches

- **A URL switch added for a design review leaves with the decision.** Prototypes shown behind a query switch (`?proto=…`) are removed, or made the default, in the commit that records which option Carlos chose. Example: the onboarding's `?proto=guide,path,tilt,burst` lived in `main` for a day between the review page and the choice.

## Browser checks

- **A diff that changes what a browser check drives runs that check.** `scripts/check-skin.mjs` drives the Settings appearance pages (themes, Canvas, Layout); `scripts/check-chats.mjs` drives the Chats page, the roster and the room "To" row; `scripts/check-pages.mjs` drives a project page (masthead, grid, countdown, pace verdict). When a diff changes those screens or the labels, classes or ids the scripts select, the review runs the check (`pnpm run check:browser -- --only skin`, DEVELOPMENT.md "Verification") and reports its result, fixing the script when the change is intended. Otherwise only a release runs them, all through `scripts/check-browser.mjs`. Example: Settings gained grouped tabs and captioned preset cards in `cf54c76`; the skin check stayed broken until a release check found it.

## Data safety

- **A step that replaces or deletes data waits on a step that can fail.** Its precondition (a safety copy, a confirmation, a save) throws or returns a failure the caller checks. A helper that catches its own error and only shows a message can't gate it. Example: restoring a backup awaited `exportBackup` for the safety copy, but `exportBackup` caught its error and showed a toast, so a failed copy still replaced the whole workspace (fixed by `Workbench.restore`, which refuses unless `keepCopy` resolves).

## Privacy

- **Telemetry SDKs set data collection explicitly.** An analytics or error-reporting SDK's init (Sentry, Umami, Cloudflare) names every data-collection option it keeps off, checked against the installed version's types or docs, and its comment matches. Example: Sentry 11 dropped `sendDefaultPii` and collects user info, cookies, headers, bodies and query params by default through `dataCollection`; a comment claiming "no personal data by default" was wrong.

## Module shape

- **A component draws; its rules live in a module it calls.** Lint already refuses a `.ts` module importing a `.tsx` one and holds every file to 600 lines, functions to 150 and code lines to 160 characters (`eslint.config.js`, no exceptions since 2026-11-21). The judgement call is where a rule goes: when a component's logic decides something a person would notice (which messages show, what a pick ticks), it becomes a pure function beside it and gets a node test, as `chat/transcriptWindow.ts` and `firstRun/picks.ts` did. Example: before 2026-11-21 the chat's "Earlier conversations" folding lived inside a 605-line `AgentPanel` render, where no test could reach it.
