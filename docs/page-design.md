# Pages and widgets: the design standard

What every project page and every widget on it is built from. Classes live in `src/styles/widgets.css` and `src/styles/widget-views.css` ("Pages (D32)" and the
widget sections); the decisions behind them are D32, D36 and D38 in `docs/agents-design.md`. Reuse these parts before
adding a new one.

## The page

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [🌱] Title ✎ (Fraunces, hue-tinted)     [folder] [customize] (lead▾) (crew)│
│      outcome line                     [stage chip] ▬▬▭▭ 0 of 3 steps done│
└───────────────────────────────── band in --sidebar, edge to edge ───────┘
 (◕) ╭ Title of the brief ─────────────────────────────── [Action] ╮ (×)
     ╰ one line from the managing agent ───────────────────────────╯
   narrow (4)    │ wide (8)                                      │
   half (6)              │ half (6)                              │
   full (12)                                                     │
```

- Masthead: one band per page (`.page-masthead`, drawn by `PageBand.tsx` on every page, domain, project and person
  included), spanning the content area (`.workspace-content`
  is an inline-size container; the band is `100cqw` wide). Background is the theme's second tone (`--sidebar`), never a
  tint of the project colour, which appears only on the tile's ring, the title and the stage chip (no coloured top
  rule: Carlos dropped it, 2026-11-20). Two rows, one grid (`tile title actions` over `tile intent foot`): row one, the
  48px tile, the title with its edit pencil and the actions; row two, the intention or outcome and on its right the
  domain's sections or the project's stage. It never folds. The pencil (`.title-edit`) is the one way into a page's
  dialog, muted beside the title and visible on phones too; the domain chips and cards use the same pencil, the open
  domain's chip on hover like the rest. Customize is always the bordered sliders button (`.widgets-button`) near the
  end of the actions, followed only by faces and the open-tabs stack, on Today, domain and project pages alike. Faces
  among the actions are round buttons with their words in the tooltip.
- Project masthead (`ProjectMasthead.tsx`): actions linked folder (D47, `FolderLink.tsx`: a folder icon whose popover
  reuses `.view-menu`, shown only where the browser can link folders), Customize, who leads it (a face and a chevron
  opening the menu that changes who leads, or a dashed person-plus while nobody does) and the crew's chat button as
  the other faces. The team is set in the project dialog. Row two: the stage chip, a bar and "0 of 3 steps done, next
  due Fri 20 Nov", on one line; the sentence is whole in the tooltip and gives way to its count ("1/4") when the band
  is under 900px. While the brief says "We're behind", the strip leaves out its Behind chip. Phones put the actions
  beside the stage, under the outcome. The body keeps the page's 1120px measure.
- Domain masthead (`.domain-masthead` in `DomainPage.tsx`): the domain's emoji on the tile; actions Customize on
  Overview, then the domain agent's face as a round chat button ("Chat with Vital" its tooltip; Atlas while the
  domain has none; a speech mark while that agent speaks in the brief), which keeps its place on Tasks and Resources,
  where Customize leaves. Row two: the Overview, Tasks and Resources sections as tabs standing on the band's lower
  edge (the open one in ink on a 2px accent-ink line; the band has no padding under them; Overview has no count).
- Plain masthead (`PageBand.tsx`, 2026-11-22: Carlos asked that every page header follow one standard; the domain,
  project and person bands moved onto it the same day, passing their extras through its tile, actions and foot
  slots): Agents, Domains, Projects, Library, a Library topic, Archive and Routines use the same band. Pages without a place of their
  own have no tile (`[data-plain]`): the title and its line on the left, the actions on the right, the main one a
  labelled primary button (New agent, Plant a domain, New project, New topic, Run due) and the rest icons with their
  words in the tooltip (Start a room, New routine), then the open-tabs stack. A topic keeps its emoji on the tile, a
  "Library ›" crumb before its name and the edit pencil. Agents puts Agents and Teams as tabs on the band's lower edge,
  styled as the domain's sections (`.masthead-tabs`, shared). Today (its hero), the Chats page (its tab bar; the
  Logbook's search header) and Settings (a dialog) keep their own heads.
  Phones put the intention under the name and give the tabs the full width without their icons.
- Project dialog (start or edit, `ProjectDialog` in `dialogs/ProjectDialog.tsx`, D62): the domain dialog's seed packet in the
  project's colour (`.domain-preview`: the colour seed, the name, why it matters). Editing, a pace line under it
  (stage chip, bar, "1 of 4 steps done · next due Tue 17 Nov"). Then one row of facts (`.project-facts`), each a chip
  with its icon and current answer: the domain, the finish date with days left, the crew's faces with "Vital joins
  from Health", a starter's "3 first steps", "No routines" or "1 of 1 routines on". A chip unfolds its choices in a
  recessed panel under the row, one at a time: the domain as chips, the finish date as chips (No date, In 2 weeks, In
  a month, In 3 months, Pick a day), which moves the page's first countdown or adds one at the top, the lead as faces
  (the face pointed at named under them) and the team as chips, the starter's steps with its tip, the routines. A new
  project opens filled in: done in a month, the colour its domain uses least; from an idea, its name, line and colour,
  plus one optional field when the starter asks a number. Editing, the footer holds Delete and Archive.
- Task dialog (new or edit, `TaskDialog` in `dialogs/TaskDialog.tsx`, D75): the title (with @mentions), then one row
  per question, its label (with its icon) left and its answer right (stacked on phones). A new task's title can say its
  day, time and length ("Call the clinic tomorrow at 16:30 for 15 min", `taskWords.ts`): the answers follow until one
  is picked by hand, a line under the title repeats what was read and the name it saves as. Lives in: one fact chip
  unfolding the domains and that domain's projects, the two homes used last as dashed chips beside it. Day (Carlos's
  O1 of three, 2026-11-22): the day tiles (`DayTiles.tsx`, also Capture's and the tasks widget's add row since
  2026-11-23): a week of tiles (weekday, the date in Fraunces, a bar for the hours already planned out of 07:00 to
  22:00, weekends warmer) and a No day tile with its icon (Someday); above them the week's dates, Earlier and Next week
  (five weeks ahead), a project's Finish line and Pick a date for any other day; under them "Mon 23 Nov · 2 other
  tasks, 1 h · 12 h left after this", or "Yesterday: pick a new day" on a late one. When (W2 of five, the same day; only
  with a day ahead): four cards, Any time, Morning, Afternoon and Evening, each with its icon and how much of it is free
  for this task ("5 h free", or Full or Gone and disabled). A part is a whole answer; picked, it unfolds a recessed
  panel with five free start times spread across it (dashed, as Today's suggestions are) and Other time, a list of the
  part's quarter hours in 24-hour time, "· taken" beside those that clash; a time picked there keeps its part's card
  lit. How long: a segmented track (`.step-seg`, equal columns on one line on phones), 15 min to 2 h. A new task opens
  due today with its home's usual length and part (`taskHabits.ts`: three tasks agreeing, at least half of those that
  set it; the part only while it isn't over) and takes a new home's when it moves, saying so under How long ("Your
  usual in Health: 45 min, mornings"); otherwise any time and half an hour. From an hour long, "Break it down with
  Vital" under How long writes the request in the chat of whoever answers in that home, who proposes the steps. Its
  button says where it lands ("Add for Thursday", ↵; Ctrl ↵ from anywhere), and the footer stays in view while the
  dialog scrolls. Editing adds Done, Delete (Undo on the toast) and, for a task due by today, Move to tomorrow.
  Colour never tells the rows apart (Carlos's pick B over a colour per row): the shape does, and a pick is always the
  domain's accent.
- Project ideas (D62, `ProjectIdeas` in `DomainPage.tsx`): the top of a domain page's Overview, under the band.
  The domain agent's tilted face and "Ideas from Vital", then two or three idea cards, a dashed More ideas card that
  opens the agent's chat with a request for another written, and a dashed New project card, on one row (sideways
  scroll on phones). Once the domain has two projects the row folds to its heading, a button with the number of ideas
  and a chevron that opens it. A card is flat paper: a seed in the project's colour, the title in Fraunces, its line
  in two muted lines, the agent's tip as tooltip; it lifts 2px and its seed sways under the pointer.
- Person page (D71, `PersonPage` in `PersonPage.tsx`): the same band with the person's face as its round tile (photo,
  or initials in their colour's ink on a light wash), their name with its pencil (the topic dialog with its person
  part), and their domain agent's face as the chat button, which opens a chat starting "About @Sofia". Row two: who
  they are and their domain, and on its right their next date and when you last noted something. Their agent's brief
  when a date is two weeks away or nearer ("Plan it"). Then four blocks: What Kin remembers (wide; Forget on hover,
  the words it came from as tooltip), Dates (narrow), Mentioned elsewhere (wide; tasks, notes, chats and projects that
  name them, each opening where it lives) and Kept here (narrow; the topic's resources). Lists show four, then "n more".
- Mentions (D71, `MentionPicker.tsx`): typing @ in a note, Capture or an add-task row opens a small list of people
  (face, name, who they are) and New person last; arrows move, Enter or Tab picks, Escape closes. In a field it floats
  in the top layer at the field, under it or over it near the window's foot; in a note it sits under the caret.
- Brief (D40): when the managing agent has something to say, the first thing under the band on every section (page
  content, not the header: Carlos, 2026-11-20); its bubble runs the page's width. The guide head
  from the first morning (`.guide-head`, `.guide-face`, `.guide-bubble`), a 44px face, a 16px title, one line and one
  `.secondary-button` action, with "Not now" as an × on hover or focus. A new project's welcome is larger: the 56px
  face, an 18px title, numbered tips (`.brief-tips`, arriving one by one after the line) and Got it as a text button
  beside the action. A line seen before shows whole, without typing or the pop. Dismissed, it is a speech icon among
  the actions with the words as its tooltip; while the open chat panel shows its agent, it is the same icon without a
  press. Nothing to say, no row. While the brief shows, "Ideas from Vital" under it leaves out the face. One face per
  agent: while an agent speaks in a brief, its face on the band becomes a dashed speech mark (`.crew-speaking`), stacks
  leave its portrait out, and the floating chat button shows a chat mark if no face is left.
- Grid: twelve columns, 16px gaps. A half block that starts a row and can't share it with the next block takes the row.
  Phones stack everything.

### Today

```
│ Good afternoon, Carlos                                                      [customize] │
│ Sunday 22 November · 3 done, 7 to go, 2 carried over.                                   │
│ ┌ day line (sidebar tone) ───────────────────────────┐ ┌ Your crew today (sage) ──────┐ │
│ │      Now 15:10 ☀   Big shop   (Vital)?            │ │ (Atlas) Blood work matters   │ │
│ │  run ○      ┊   ●        (Spark)?   ●  Lights out │ │ most today: 2 days late. …   │ │
│ │ 07  09  11  13  15  17  19  21  23                │ │ (Vital) 16:30 Call the clinic│ │
│ └───────────────────────────────────────────────────┘ │ why · Apply Other time Not now│ │
│ ┌ Anytime today (dashed): chips you drag or place ──┐ │ (Spark) 18:00 …              │ │
│ │ rituals as seeds · Add something for today        │ │ news rows · quiet line       │ │
│ └───────────────────────────────────────────────────┘ │ Plan the rest of my day      │ │
│  Morning        │  Afternoon (lit) │  Evening         │ Talk to Atlas                │ │
│ Coming up (marigold): 7 day tiles with titles │ the next date and what its agent says  │
│ Keep going: Today's widgets, half and half · From your shelf: one quote                │
```

Today is the day itself (agents-design D75, Carlos's pick of 2026-11-22): the day line, the tasks with no place yet and
the parts of the day in the main column, the crew's rail beside them, then what's coming. Phones put the crew's rail
first, then the day line (it scrolls sideways, opening on now), the tray and the parts, the one you're in first.

- Head (`.today-hero` in `src/today/TodayHead.tsx`): the greeting as the heading, the full date and one sentence for
  the day (done, to go, carried over; in the evening done and still open), Customize. No band: the day line under it is
  the sky. Phones show the sun or tonight's moon after the greeting.
- Day line (`.day-line`, `TodayDayLine`): the sky as a ruler from 07:00 to 23:00 in the sidebar tone, hills along its
  foot, the hours already gone pale, and the sun on a dotted arc at now (`skyAt` in `sky.ts`: warmer within the hour of
  sunrise or sunset, tonight's moon in its real phase after dark), a dashed line down from it to "Now 15:10" in the
  hours row, where no title reaches it (the hour beside it steps aside). Every task due today with a time is a bud in
  its domain's hue at its hour, a flower once ticked: ticking it blooms the flower (`celebrate` in
  `src/pageGrid/TaskRows.tsx`), the page's one animated moment. A next step stands as its agent's face, dashed, at the
  time it suggests, its title in italics with a question mark. With Google Calendar connected, today's timed events
  stand as small ink squares that don't open, and all-day ones as a chip at the top left. Along the line's foot a band
  shows how long each holds: a task its length in its hue, a step dashed, an event in ink. Labels take two lanes; a
  pin with no room for its title shows only its mark, the title in its tooltip. A task's pin opens the task, a step's
  moves focus to it in the rail.
- Tray (`.day-tray`, `TodayTray` in `src/today/TodayHours.tsx`): open tasks in play today with no place in the day yet,
  as chips (tick, domain emblem, title that opens it, how late), oldest first; drag one into a part, or pick a part or
  a free half hour from its clock menu (shown on hover or focus, always on touch). "Move the late ones to today" moves
  every late one in one changeset; from the evening the tray is "Still open" and moves what's left to tomorrow. Under
  the chips, the rituals still to tick as seeds (every habit block on every live page; ticking marks today done where
  it lives, the plus starts another), the add row (saves a task due today, tomorrow from the evening, to the domain in
  the top bar) and how many more were done today.
- Parts (`.day-parts`, `TodayParts`): Morning (to 12:00), Afternoon (to 19:00) and Evening, each its tasks by time,
  then the ones placed in the part without one, as `TaskRows` with the time in place of the due day and the star for
  your one thing. The part you're in is lit in the sun's colour and says until when; the ones behind you say how many
  are done or still open, and on phones shrink to their heading once nothing is open. Each takes a dropped task.
- Your crew today (`.today-crew`, `src/today/TodayCrew.tsx`, D40 and D75): Atlas's line on a sage band, what matters
  most (your starred task, else the oldest late one, else the next timed one) and how many next steps wait; then each
  step: face (only where the agent's face isn't already above it: Atlas heads the rail, and an agent's later steps sit
  under its first, D40), agent and place, its time, the task, one reason (Atlas's morning plan in his own words), Apply, Other
  time (free times its task fits, the parts, anytime), See it for a chat's or routine's proposal, and Not now (gone for
  the day on this device). Then the rest of the crew's news (questions routines left, weekly ideas, briefs of agents
  without a step), three at a time with "N more from your crew", the agents with nothing to say in one quiet line, Plan
  the rest of my day (Atlas puts the tray's tasks where they fit, half an hour apart, dashed until you apply) with Apply
  all, and the chat with whoever answers here.
- Coming up (`.today-ahead`, `src/today/TodayAhead.tsx`): the seven days after today as tiles, each with its first two
  tasks in their domain's colour and "+n more", weekends warmer, the busiest (three or more) ringed; then the next dated
  thing from any page or person (`todayHorizonOf`) with how long until it, and when its place's agent has a brief, its
  face, what it says and that brief's action. The plus adds a countdown to any page. From the evening it reads
  "Tomorrow and after".
- Customize lists the crew, the rituals, Coming up and the shelf as switches (`todayCards` in `session.ts`,
  `Session.todayHidden`) above Today's widgets; the day always shows. A hidden crew gives the day the whole width.
- Keep going: `Session.widgets` draw half width, two to a row. Projects show the six most pressing (pace order) with
  "The 6 most pressing of N", each as its stage's plant in a pot of its colour (every pace list does). A project
  with no open task that isn't finished says "no next step" in clay and offers "Add a step" where its bar would be,
  on every page's pace list. Recently touched lists the six resources edited last, newest first, the picture when
  there is one, tilted like a pinned print.
- From your shelf (`.today-shelf`, `.today-closing`): one quote resource a day across the page's foot, on taped ochre
  paper tilted a hair, with its source and a shuffle for another. No quotes, no card.
- Surfaces: the day line in the sidebar tone, the tray dashed, the parts recessed paper with the current one in the
  sun's wash; the crew's rail and Coming up are cards with their kind's band (crew sage, Coming up marigold
  `--kind-countdown`), the shelf taped paper. The first morning's guide keeps its hills and sprig (`--motif-*` on
  `.today-page`). Nothing moves at rest; the shelf lifts 2px under the pointer.

## A widget

Every block is a card: `--tile` names its colour, which also drives its fills (`--hue`), its words and controls (`--hue-ink`, AA in every kind colour), a figure 40px and up (`--hue-figure`) and its tints (`--hue-wash`).
The colour owns one region of the card, the heading band, the way an agent card's band sits behind the portrait (Carlos, 2026-11-22, asking for widgets less plain and monotone); the body stays paper.

| Part | Class | Rule |
|---|---|---|
| Card | `.page-block > .data-widget`, `.tasks-widget` | flat `--panel`, 16px radius (`--radius-card`), 16/18px padding, hairline border and shadow; no side stripe |
| Heading | `.section-heading h2`, `.heading-title` | 12px semibold on a flat band of `--hue-wash` running edge to edge across the card's top (not on paper notes, Next up, a countdown asking for its date or Today's own cards, which keep their corner motifs), the icon bare in the card's colour; a long title stops at two lines with the whole one as its tooltip, and the band grows with it; the detail beside it never shrinks and speaks in `--hue-ink`; on phones, text actions that don't fit beside the title (All domains, Garden view · New project) and the view icon take their own line under it |
| Detail | `.section-heading > span`, `.count-chip` | the one number that summarises the block, right of the title |
| Figure | `.countdown-figure strong`, `.goal-numbers strong` | Fraunces, the only large text in a card, in the card's colour |
| Progress | `.progress-track`, `.wait-track`, `.goal-bar` | filled with `--hue` over `--hue-wash`, as are the steppers, empty day tiles and rings |
| Caption | `.widget-caption` | one muted line of meaning under the figure; `strong` for the part that changed |
| Log row | `.widget-log` | pinned to the card's bottom above a rule: stepper or field on the left, the action on the right |
| Quiet action | `.text-button` | "Open", "Garden view": accent ink, no border |
| Heading action | `.icon-button.heading-add` | the one add action, an icon with its words as its `Tip` and `aria-label` |
| View menu | `.view-button`, `.view-menu` | every block's three views (D39), behind a layout icon that appears on hover or focus; the menu (`Picker`, arrow keys and typeahead) names each view with a line and ticks the current one; picking saves `block.view` |
| Main action | `.secondary-button` (`.log-button`, `.habit-today`) | one per card at most, bordered in the card's colour with its words in `--hue-ink`, turns tinted when done |
| Date | `.task-when`, `.date-pick` | says the day in plain words, never a pill ("Today", "Thursday", "Sat 14 Nov"), full date as tooltip; today and tomorrow in the accent ink, late in clay ("3 days late"), both semibold; no day yet is a dotted "When?"; a date still to set offers 2 weeks, 1 month, 3 months, each with the day it lands on |
| Fold | `.task-fold` | finished rows behind a `details` summary that counts them ("4 done") |
| Empty | `.empty-inline`, `.inline-date` | says what the first entry does, beside a small line drawing of what will fill the card (a ticked and a dashed task, a pot with a sprout, stacked cards, a dotted rising line, a clipboard, a dotted road to a flag, a taped note) in the card's colour, masked from SVG (`--empty-art`); a countdown without a date draws the card dashed |
| Celebration | `.burst` | plays once per success, never on load |

Tints by kind, light and dark from the skin tokens.
On a domain page whose hue is a kind's own (`data-hue` on `.page-grid`: Marigold, Lagoon, Sage), that kind steps aside to `--kind-*-alt` (countdown sky, tracker iris, habit moss), so a page-coloured goal and a kind never read as one.

| Kind | `--tile` | Signature |
|---|---|---|
| Tasks, Next up | page colour | open steps first by due date, finished folded behind their count; the first one at 16px (default view), or grouped Late / Today / This week / Later / Someday with a pace line, or with an add row that asks the day; Next up: card washed in the page colour, its task at 16px |
| Countdown | `--kind-countdown` (marigold) | the figure in marigold; two bars (time gone in marigold, steps done in the accent) by default, or a calendar of day tiles (weeks past six weeks, tiles at most 24px), or an arc with the sun at today. The page's finish line (its first shown dated countdown with a start, `src/pace.ts`) alone compares time gone with steps done and carries the pace verdict ("Time to push") in clay; the masthead's stage chip says Behind from the same verdict. Other countdowns say how much of the wait is behind you. Its moment (the figure's beat in the last week, the popper on the day) plays once, when the card first comes into view, never on a loop |
| Habit | `--kind-habit` (leaf) | day tiles that fill leaf green; four weeks with a sprout growing with the streak beside them (default, compared with the four weeks before only once the habit was kept then), today as the wide tile on whatever weekday it falls, or a ring of seven; "Mark today done". The streak never misses twice (`habitStreak` in `blocks.ts`, Today's rituals too): one missed day keeps it, two end it; its flame is filled clay, and hollow and muted while a missed yesterday waits on today's tick |
| Tracker | `--kind-tracker` (lagoon) | the latest value large with its change (default), a line with last/usual/target picks, or a rail to slide to the number; target as a dashed ink line; hits in lagoon, misses in `--tracker-miss` (clay, stronger in the dark theme), the colour of lateness; the first and last dates under each chart |
| Goal | page colour | a piggy bank filling with the share reached, a coin dropping into its slot on each contribution, with the amount once under it (default; a mason jar instead when the unit isn't money), a bar with flags named by amount, or a ring with the expected notch, in the page colour; amounts offered from history, never the one already in the stepper, each contribution undoable; the correction slider shows on hover or focus (always on touch) |
| Checklist | page colour | chips (default), or ruled rows with done ones folded, or a run where Enter keeps the cursor |
| Milestones | page colour | the late or next step as a washed hero over the next three steps, the rest behind "n later" and reached ones behind their count (default), a horizontal road spaced by time (past four steps only the next and the finish keep their words, the rest are dots with a tooltip), or the spine with an add form that guesses the date |
| Pinned note | `--ochre` | paper: ochre-tinted card, no border, lifted shadow, a strip of tape (default); its `- [ ]` lines as live ticks; or the body as an editor saving on blur |
| Projects, Resources | page colour | projects sorted by pace verdict (default), as plant tiles, or as each project's next task, a project with no next step offering "Add a step"; resources behind kind-count chips (default), by age, or over a paste-or-drop strip |

Rules of thumb: one figure, one action, one caption per card. Colour says what kind of thing you look at; size says
what to read first. Every part and widget view is drawn live at the dev server's `/dev/design/` (README, "Design showcase"). No new border radius, shadow, duration or button style without adding it here; radii, durations and sizes come from the tokens in `DESIGN.md`.

## Progressive disclosure

Show the least that lets someone act; the rest appears on demand. Applies everywhere, not only to widgets:

- A compact state shows an icon or a face, with the words as its tooltip (`title`) and `aria-label`. The expanded
  state shows the words. Example: the folded masthead's lead is a face and a chevron, and its chat button the
  other faces alone; unfolded they say "Forge" and "Chat with Muse".
- Secondary actions appear on hover or focus (`.crew-member .icon-button`, `.checklist-remove`), never as a permanent
  row of icons.
- Details live behind a chevron, a popover or an unfold, not beside the summary (the masthead, an agent's details in
  onboarding, a put-away widget's values).
- Counts before lists: a chip with the number, the items on open.

## Every element is a question

Each thing on a page asks the person something; make the answer one glance or one tap:

- Smart defaults: offer the usual answer before the field (the countdown's 2 weeks / 1 month / 3 months; the
  stepper pre-filled with the last value). People read a default as the recommendation.
- Specific over vague: "0 of 3 steps done, next due Tue 10 Nov", "3 days late", "14 days to go", never "soon" or
  "a few". Show the derived number (percent of time gone against percent of steps done) so nobody does the maths.
  Dates, times and numbers are British English whatever the browser's language (`locale` in `dates.ts`; the lint
  refuses the browser default), so a Portuguese browser never writes "ter., 10/11" inside an English sentence.
- Progress shows the end: the stage chip, the thin bar and "n of m" in the masthead; a project with nothing ticked is
  "Just planted", not already "Sprouting".
- The input fits the answer: a date picker for a date, a stepper for a number, a slider to correct a total, a tick for
  done; a text field only for a name.
- A metric names what each change should move: taps to the first useful action, time to the finish date being set,
  share of pages with a date, late tasks resolved per week, folded-header share.

## Prototypes for Carlos

Visual decisions are made from screenshots, not descriptions: build the variants as `[data-proto="a|b|c"]` CSS (and
JSX only where structure differs) behind a `?proto=<name>` query read once at load, screenshot each in light and dark,
embed them base64 in one HTML page under the Temp folder with one line of trade-off each, link it with `file:///`,
and let him answer with an option code. The commit that hardcodes his pick removes the switch and logs the choice in
omp-config `agents/design.md`.
