# Components subscribe to what they draw

Supersedes 0001 (2026-11-08, Carlos's call: speed is a cornerstone of the product).

`App.tsx` was one component of about 3,000 lines that re-rendered whole on every Workbench snapshot: a theme click, a toast, a keystroke in a dialog field, a saved scroll position or opening chat redrew Today, the sidebar, the chat panel and every dialog. Measured on the demo seed with the CPU slowed 4×, switching domain took 1,368 ms to the next paint, Ctrl+K search 960 ms and opening chat 552 ms. ADR 0001 kept the page renderers in App because a file per page would take 20 or more props; that cost is gone once components read their state themselves instead of through props.

Now four modules carry what App held, and every component subscribes to the part it draws:

- **View** (`view.ts`) derives everything the screen shows from the Workbench snapshot, the Room's activity and the UI store's clock, each part memoized on exactly the inputs it reads. A part keeps its identity until its own inputs change, so `useView((view) => view.chat)` redraws only when the conversations do.
- **UI store** (`ui.ts`) holds what's open on screen and not saved: the open popup, record-dialog drafts, the peek, the toast, Chats page history choices, backup dates and the minute clock. Each dialog subscribes to its own draft.
- **Actions** (`actions.ts`) is one stable object with every button's behaviour. Actions read current state when they run, never a value captured while rendering. Its areas live in `src/actions/` and build on each other (core, chat, records, crew, library, then `actions.ts`), so the object stays one while each area keeps its own file (2026-11-21).
- **appContext.ts** passes them down in one context whose value never changes, with `useView`, `useUi`, `useWorkbench` and `useActivity`.

Rules that keep it fast: a `useView`/`useUi` selector returns a part as the store holds it or a primitive, never a new object; nothing reads mutable state (`workbench.getSnapshot()`, `conversations.discover()`, `Date.now()`, `location`) while rendering, only in handlers and effects; a new derived value used by more than one component goes into the View, memoized on its inputs. React Compiler builds every component on top of this (the two Settings sections it can't compile run as before), and the `react-hooks` lint rules refuse code that would make its caching wrong. `scripts/check-speed.mjs` holds the budgets, as part of `checkBrowser`.

At workspace size (2026-11-11, `?fresh=large`: 2,000 resources, 500 tasks, 78 projects), two more rules. Derived values never scan every record once per project, agent or thread: they look up indexes built once per list (`byId`, `perList` in `model.ts`), which stay right because an edit replaces a list rather than changing it. And a list that grows with the workspace is drawn in pieces (resource grids 48 cards at a time, task lists past 20 rows in a background render), while Today, mounted behind other pages, hides with `content-visibility: hidden` so the browser keeps its layout. `checkSpeed` times both seeds.
