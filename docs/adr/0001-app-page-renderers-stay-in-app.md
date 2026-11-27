# App's page renderers and record dialogs stay in App.tsx

**Superseded by 0002** (2026-11-08): page renderers and dialogs moved into components that subscribe to the View and the UI store themselves, so they no longer take App's values as props.

`App.tsx` is long, and two refactors keep looking attractive: moving its page renderers (`agentsPage`, `routinesPage`, `libraryPage`, `widgets` and the rest) into their own files, and folding the eight record-dialog drafts into one shared hook. We rejected both in the architecture review of 2026-11-07, because they fail the deletion test. Each renderer reads 20 or more of App's values and handlers, so a file per page would take that many props and move the complexity without concentrating it. Each dialog's save opens something different afterwards, so a shared hook would be a shallow wrapper.

The way to shrink App is to move decisions out of it into deep modules with their own tests, as Place, Search, `onScreen`, `Workbench.restore`, the Room's `discover()` and the Account `Backend` did. Revisit this if a renderer stops needing App's state.
