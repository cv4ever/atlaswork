# Resources design

Agreed on 2026-10-20 through a grilling session and built the same day. Inspired by Tiago Forte's PARA: projects hold material, and material that outlives a project moves to Resources (topics) or Archive. Decisions are numbered so later changes can cite them. Resource creation, home and Link transitions moved behind the existing Workspace module's interface on 2026-10-22. The record remains `Note` with a `kind`, without a schema migration.

## Before

- A resource was a `Note` with `resource: true` (`model.ts`): a title and a markdown body. It had no URL, file, or media.
- The project page's Notes widget mixed resources in and labelled them "Note". Project cards counted only non-resource notes.
- Resources was a per-domain shelf whose "Read" opened the note editor. Every item belonged to one domain and at most one project, and nothing could be shared.

## Decisions

### Model

- **D1 Home and links.** Each Resource has exactly one home: a Project, a Domain, or a Topic. The Workspace module validates the destination. A Topic clears Domain and Project ownership, a Project supplies its own Domain, and a direct Domain clears Project and Topic ownership. Home edits resolve the current Resource by id and preserve its content, annotations, edit time and Blob. Missing destinations are refused, never redirected to the selected Domain.
- **D32 Link targets.** Beyond its home, a Resource can be linked into other Projects, and only Projects. Workspace owns Link lists: linking and unlinking are idempotent, duplicates and home-as-Link entries cannot be introduced, and moving into a linked Project removes only that redundant Link.
- **D2 Notes are a kind.** One concept, so there is no separate Notes list.
- **D3 Kinds.** Note, link, file/document, image, video, quote.
- **D4 Name.** "Resource".
- **D11 Annotation** (revised 2026-10-28). Every kind has a markdown body for your own notes, edited in the same editor as notes. Tab and peek edits send only changed title, body or quote source to Workspace's `editResource` by id. Workspace stamps the edit and preserves current Home, Links, archive state, other content and Blob. A late content edit cannot recreate a deleted Resource.
- **D5 Topics.** PARA's Resources bucket is first-class: named topics that can be a resource's home.
- **D12 Topic scope.** Topics are global and cut across domains.
- **D27 Topic shape.** Name, emoji, optional description. Created from Library or by typing a new name in any place picker. Archive and delete work like projects.

### Where resources show up

- **D22 Sidebar** (revised 2026-11-22). Projects lead, as in PARA. Order: the selected domain as the masthead (emblem, name, "N projects" opening the domain page, and its late count as a clay badge on the emblem's corner, rail included, its own link to the domain's Tasks, so the name keeps the line; replaced your name and its "On this device" line, which said nothing the status bar didn't), above the Projects and Agents tabs (Projects was Workspace; its stored mode is still `workspace`); then, under Projects, that domain's projects most pressing first (the Domains page's order, `byPressure`), each with its late steps, the open one wrapping to two lines, and New project, with no fold; at the foot Library and Archive side by side on one row (the Agents tab shows Agents and Routines instead), then you (portrait and name, opening the profile) with a Settings gear. In the rail the projects stay as folder icons and the foot pair stacks.
  Next up (2026-11-19, P1 of three prototypes: a next step under each project hid tasks outside projects and doubled row heights; a Today-only strip left quiet days empty) fills the room under the projects with the domain's next three open tasks, late first, ticked in place; it steps aside whenever the projects need the height.
  Today is a calendar tile at the left end of the top bar's domains (since 2026-11-18, to give the name room): its tooltip says "Open Today", it stays selected on Today, and the Today page's heading no longer repeats it (two tiles 80px apart); the greeting leads there and the full date remains visible. Agents and Chats left the sidebar (the Agents tab covers both; Search still opens either page). Tasks and Resources left the sidebar and became sections of the domain page (Overview · Tasks · Resources); Resources there covers everything in the domain, projects included. The Notes entry goes. Recent lists every kind with its kind icon.
- **D23 Library.** Topics as a list, like a table of contents (2026-11-13, replacing a grid of cards): emoji, name, its line, three thumbnails and the count at the line's end. Clicking one drills down inside the Library view with a breadcrumb (Library / Typography). Topics never open as tabs.
- **D20 Reach.** The Resources section replaces the Notes widget on project pages, domain overviews, and Today. Today shows recently touched resources from all domains.
- **D33 Domain overview.** Shows only resources homed directly in the domain. The Resources page covers everything in it.
- **D6 Project view.** One mixed grid with kind filter chips.
- **D28 Chips and order.** All, plus only the kinds present, with counts. Most recently touched first. The text filter stays.
- **D29 Card faces.** Note: title and excerpt. Link: favicon, host, title, annotation line. File: type glyph (PDF/DOC/XLS), name, size. Image: full-bleed thumbnail. Video: thumbnail with play badge. Quote: serif excerpt, large quote mark, source.
- **D7 Linked badge.** A linked card shows a link icon and "from \<home\>".
- **D18 Archived home.** A linked resource whose home is archived stays visible in live projects. Its badge reads "from \<home\> (archived)".

### Interaction

- **D10 Peek first.** Clicking a resource opens a peek. The peek can expand into a tab.
- **D13 Peek placement.** A right slide-over, left of the chat panel when chat is open. Phones get a bottom sheet.
- **D14 Gestures.** Click opens the peek. Ctrl/Cmd-click, middle-click, or the expand icon opens a tab. New notes open straight in a tab.
- **D36 Peek keys.** Esc closes. ↑/↓ (or j/k) peek the previous or next card in grid order. Enter expands to a tab.
- **D30 Editable peek.** From top to bottom: viewer (image, YouTube embed, PDF iframe, or link card with Open ↗), title, Home and Linked-to chips, annotation editor, actions.
- **D24 Tab domain.** A resource tab opens in the current domain's tab set and never switches domains. Notes follow this rule too.
- **D8 Smart capture.** Kind is detected from the input: a URL becomes a link (or a video for YouTube), an image file becomes an image, another file becomes a file, text becomes a note. A kind menu is the fallback.
- **D15 Capture entry points.** The header Capture button (replacing New note) and Ctrl+K. Each Resources section has an Add button that opens the same dialog, already targeted at that section. All use Workspace's `createResource` with content and the chosen home. Detection and form interaction stay in `Resources.tsx`; current-place selection, navigation and feedback stay in `App.tsx`.
- **D25 Capture dialog.** One field that takes a paste, typed text, a dropped file, or a picked file. It previews the detected kind ("Link · youtube.com"). A "Save to \<place\>" chip can be changed, and the kind menu sits beside it.
- **D26 Default place.** The current place. On global pages (Today, Library root, Agents, Chats) it is the selected domain.
- **D31 Quotes.** Created from the kind menu: text plus a free-text source. Editing the source uses the same current-record content edit as title and annotation.
- **D9 Linking.** From the Project side, the Add menu's "Link existing…" opens a type-ahead picker. From the Resource side, use its Linked-to chips. Both call `setResourceLinked` with Resource and Project ids, not a reconstructed Resource record.
- **D16 Actions.** A linked card offers Unlink and leaves the Resource's content and home untouched. A homed one offers Move to… (Project, Domain, or Topic), Archive, and Delete. Home controls call Workspace's `moveResource` by id. Delete lists the places where the Resource is linked. Deleting a Project removes only its Link from Resources homed elsewhere.
- **D17 Project archive.** Archiving a Project opens a keep-sheet of its homed Resources. Ticked rows move to the selected Topic and retain the archived Project as a Link. The rest archive with the Project. The sheet can be skipped. Workspace's `archiveProject` validates all keep selections before returning one `Change`; missing Topics or Resources no longer homed in that Project refuse the whole edit.
- **D34 Keep-sheet defaults.** Nothing is ticked. Ticking a row reveals a topic picker that remembers the last pick and can create a topic. Resources linked elsewhere are labelled "stays visible in \<project\>".
- **D35 Phone bar.** Today, Tasks, Resources, Chat, Capture. Library is reached through the page selector.

### Fidelity and scope

- **D19 Fidelity.** Dropped images and files are stored as Blobs in IndexedDB and previewed: `<img>`, PDFs in an iframe. Links get hostname, favicon, and an editable title, because cross-origin metadata needs a proxy. YouTube gets its real thumbnail and an embedded player. The demo seeds one example of each kind.
- **D21 Agents.** Out of scope. Agents keep reading notes only (check-in and chat context).

## Defaults

Follow these unless they are revisited.

- **R1** Existing `resource: true` notes become the note kind, and the flag goes.
- **R2** Project cards count resources. The `notes` widget key becomes `resources`.
- **R3** The Archive page and Ctrl+K search cover every resource kind and topics. A URL pasted into Ctrl+K offers "Capture link to \<place\>".
- **R4** A local video file is stored as a Blob and plays in `<video>`. Other video sites are captured as links.
- **R5** The peek has a fixed width (~480px) and cannot be resized. Motion uses the existing tokens and animates only `transform` and `opacity`.
- **R6** The model changes only as much as the UI needs.
