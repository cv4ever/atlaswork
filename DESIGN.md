---
name: Atlaswork
description: A warm, tended workspace for life's notes, tasks and agents.
colors:
  canvas: "#f7f5ef"
  sidebar: "#f0eee6"
  panel: "#fffdf8"
  recessed: "#eeece3"
  ink: "#34382f"
  secondary: "#4f5348"
  muted: "#62685c"
  line: "#e2e2d7"
  line-strong: "#c8ccbf"
  line-field: "#898f82"
  forest: "#416b57"
  forest-ink: "#355b48"
  forest-soft: "#e7ece2"
  forest-hover: "#345944"
  on-accent: "#fffdf8"
  clay: "#ad7761"
  clay-ink: "#8f5640"
  ochre: "#a08a4a"
  sun: "#e2a12c"
  sage: "#7e9473"
  kind-countdown: "#d29a2b"
  kind-tracker: "#2f8b9a"
  kind-habit: "#6c9a68"
  kind-countdown-alt: "#5482c9"
  kind-tracker-alt: "#7c68c4"
  kind-habit-alt: "#8d9a3e"
  vendor-claude: "#c15f3c"
  vendor-gemini: "#4a6fd6"
  vendor-deepseek: "#4d6bfe"
  vendor-mistral: "#d9530e"
  vendor-meta: "#0467df"
  error: "#a14232"
  error-soft: "#f5e5de"
  attention: "#f2a531"
  on-attention: "#2a2116"
  stuck: "#d9534f"
  scrim: "#1c251d80"
  canvas-dark: "#252720"
  sidebar-dark: "#22241e"
  panel-dark: "#2b2e25"
  recessed-dark: "#30342a"
  ink-dark: "#e8e8db"
  secondary-dark: "#bdc1b0"
  muted-dark: "#a3aa97"
  line-dark: "#3c4234"
  line-strong-dark: "#58614b"
  line-field-dark: "#777f6a"
  forest-dark: "#b3c9a6"
  forest-ink-dark: "#c0d3b4"
  forest-soft-dark: "#374332"
  on-accent-dark: "#253021"
  clay-dark: "#d3a68e"
  ochre-dark: "#c2b273"
  sun-dark: "#edc154"
  sage-dark: "#a4b58d"
  kind-countdown-dark: "#e0b45a"
  kind-tracker-dark: "#6fb8c3"
  kind-habit-dark: "#9cc497"
  kind-countdown-alt-dark: "#8eaee0"
  kind-tracker-alt-dark: "#a99ae0"
  kind-habit-alt-dark: "#b5c070"
  vendor-claude-dark: "#e58a6b"
  vendor-gemini-dark: "#8ea7f0"
  vendor-deepseek-dark: "#8197ff"
  vendor-mistral-dark: "#f5813f"
  vendor-meta-dark: "#6aa6f5"
  error-dark: "#efae9c"
  error-soft-dark: "#4c342c"
  domain-clay: "#c2705a"
  domain-marigold: "#d29a2b"
  domain-moss: "#8d9a3e"
  domain-sage: "#6c9a68"
  domain-pine: "#2f7a62"
  domain-lagoon: "#2f8b9a"
  domain-sky: "#5482c9"
  domain-iris: "#7c68c4"
  domain-plum: "#a0588e"
  domain-rose: "#d1667c"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(28px, 2.6vw, 38px)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-1.25px"
  headline-lg:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
  headline-sm:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.3
  title-sm:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.25
  body-lg:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  body-small:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  mark:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 500
rounded:
  hair: "3px"
  xs: "4px"
  small: "6px"
  md: "8px"
  base: "10px"
  control: "12px"
  card: "16px"
  tile: "18px"
  shell: "22px"
  pill: "999px"
spacing:
  control: "34px"
  row: "45px"
  card: "24px"
  section: "32px"
  page: "40px"
  grid-gap: "16px"
  shell-gap: "12px"
  shell-inset: "16px"
  sidebar: "236px"
  agent-panel: "360px"
  measure: "1120px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.on-accent}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "8px 12px"
    height: "{spacing.control}"
  button-primary-hover:
    backgroundColor: "{colors.forest-hover}"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "8px 12px"
    height: "{spacing.control}"
  button-quiet:
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.small}"
    padding: "4px 8px"
    height: "28px"
  button-quiet-hover:
    backgroundColor: "{colors.recessed}"
    textColor: "{colors.forest-ink}"
  button-text:
    textColor: "{colors.forest-ink}"
    typography: "{typography.label}"
    padding: "2px 0"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.panel}"
    rounded: "{rounded.small}"
    padding: "8px 12px"
    height: "{spacing.control}"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.small}"
    size: "29px"
  chip-date:
    backgroundColor: "{colors.forest-soft}"
    textColor: "{colors.forest-ink}"
    typography: "{typography.mark}"
    rounded: "{rounded.xs}"
    padding: "2px 6px"
  chip-date-late:
    textColor: "{colors.clay-ink}"
  chip-filter:
    textColor: "{colors.secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
  chip-filter-selected:
    backgroundColor: "{colors.forest-soft}"
    textColor: "{colors.forest-ink}"
  badge-attention:
    backgroundColor: "{colors.attention}"
    textColor: "{colors.on-attention}"
    typography: "{typography.mark}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.small}"
    padding: "8px 10px"
  widget-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.card}"
    padding: "16px 18px"
  menu:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "6px"
    width: "240px"
  menu-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px"
  dialog:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.shell}"
    width: "570px"
  switch:
    backgroundColor: "{colors.line-strong}"
    rounded: "{rounded.pill}"
    size: "38px"
  switch-on:
    backgroundColor: "{colors.forest}"
---

# Design System: Atlaswork

This file is the visual language; `src/WarmEditorial.module.css` holds its tokens, except the ten domain hues, which a domain stores as a value and `domainHues` in `src/model.ts` holds. `scripts/check-tokens.mjs` (part of `pnpm run lint`) keeps the stylesheets on the tokens.
Page and widget anatomy (masthead, twelve-column grid, the parts every widget is built from, tints by kind) lives in `docs/page-design.md`.
The dev server's `/dev/design/` page draws all of it live, every widget in every view included (DEVELOPMENT.md, "Design showcase").
The decisions behind both are D-codes in `docs/agents-design.md`, and Carlos's recorded taste overrides anything here.

## Overview

**Creative North Star: "The Tended Garden"**

Atlaswork is a place a person returns to every day, so it feels like a well-kept garden shed rather than an office: warm paper surfaces, a deep green accent, earthy clay, ochre and sage, and small living things.
A seed bobs on the active domain, a plant grows with a project's progress, a sticker bounces in, Today's buds flower on the day line in their domain's colour as tasks are ticked, and the sun walks the day line with the hour.
Whimsy is real but rationed: one animated moment per card, never on load, always in answer to something the person did.
Plants (the four growth stages, `src/Plant.tsx`), the sky and motifs (a sprig and hills on the first morning's guide, a footpath with flags) are authored SVG in the palette, not emoji.
Motifs are masks filled with the card's own tint at about a quarter strength, one per card, in a corner.

The app is an Operate surface.
Structure is calm and predictable (a sidebar, a page panel, cards on a twelve-column grid), and personality lives in the details: Fraunces headings, hand-feel radii, a tilt on hover, the domain's own colour carried through its page.

Progressive disclosure is the default: a compact state shows only the icon or face with its words as tooltip (on touch, a long press shows it); text and secondary actions appear on expand, hover or focus.

**Key Characteristics:**
- Warm off-white paper in light, mossy charcoal in dark; never pure white or black surfaces. Other themes keep the rule in their own colours.
- One accent at a time: the theme's (forest in Garden), the current domain's hue inside a domain.
- Fraunces for titles and the one big figure per card (a theme may set its own title face); DM Sans for everything else; one size ladder for both.
- Short, settled motion on interaction, a spring only when something grows or lands; nothing moves at rest except a slow seed bob on the active domain.
- Dense but legible: labels at 12px, and 11px only inside chips and badges.
- Every colour, size, corner and duration comes from a token.

## Colors

Earthy and low-chroma, with saturation reserved for domain hues, an agent waiting on you, and the moment something is done.

### Primary
- **Forest** (`forest`; dark theme `forest-dark`): primary buttons, active and selected states, focus outlines, the default accent.
  `forest-ink` is its text form, `forest-soft` its tinted fill (date chips, selected filters, pressed icon buttons), `on-accent` the text on a forest fill.
  In code these are `--accent`, `--accent-ink`, `--accent-soft`, `--accent-hover` and `--on-accent`, since a domain can replace them (below).

### Secondary
- **Clay**, **Ochre** and **Sage**: the kind colours of everything but the data widgets.
  Clay marks lateness and misses ("3 days late", the pace verdict, a tracker's missed days; words in `clay-ink`, which passes AA where `clay` does not).
  Ochre marks the week, pinned notes and the backup reminder.
  Sage marks agent work and Today's rituals.
  Each lifts in the dark theme.
- **Widget kinds** (`kind-countdown` marigold, `kind-tracker` lagoon, `kind-habit` leaf; each lifts in the dark theme): the data widgets' own colours, taken from the domain palette so a page of widgets has the range the agent cards have (Carlos, 2026-11-22).
  A widget's colour fills its heading band at 12% and its marks in full; its words take the colour mixed 52% into ink (AA on the panel and the band), and a figure 40px and up 72%.
  On a domain page whose hue is a kind's own, the kind steps aside to its `-alt` (countdown sky, tracker iris, habit moss), so it never reads as the page's goal or checklist.
  A tracker's missed days are `--tracker-miss`: clay at half strength on paper, 80% on the dark panel, where half reads as mud.
- **Model makers** (`vendor-*`): the marks of the companies whose models answer (Claude, Gemini, DeepSeek, Mistral, Llama; OpenAI's mark takes the ink), in each maker's own colour deepened to 3:1 on the panel and lifted in the dark theme (agents-design D82).
  Only on the mark itself, never on words or fills.

### Tertiary
- **Domain hues** (`domain-*`): each domain picks one of ten.
  It tints that domain's chip, page rule, plant ring, title and progress fill.
  Text on a full domain-hue fill is black or white, whichever passes AA for that hue.
- **Attention** (`attention`, text `on-attention`): an agent waiting on you (an approval or a question), the unread badge, the Atlas count.
- **Sun** (`sun`; dark theme `sun-dark`): only Today's sky and the part of the day you're in. A flat gold disc with eight rays at now on the day line, mixed toward clay within the hour of sunrise or sunset; its tints draw the moon in its real phase and wash the current part of the day.
- **Stuck** (`stuck`): an agent that could not finish.
- **Error** (`error`, `error-soft`): failed saves, field errors, the danger zone and danger buttons, the scam warnings above an agent's reply (a soft fill with an error-tinted border and a shield in `error`, always open, agents-design D79), and the mark beside a file a tidy couldn't move.

### Neutral
- **Paper** (`canvas`, `sidebar`, `panel`, `recessed`): the page backdrop, the sidebar and masthead's second tone, cards and panels, and wells inside them.
- **Ink** in three tiers (`ink`, `secondary`, `muted`): headings and body; supporting text and quiet buttons; captions, metadata and placeholders.
- **Lines** (`line`, `line-strong`, `line-field`): hairline dividers and card borders; the strong form for secondary buttons; the field form for the edge of anything you type or pick in.
- **Scrim** (`scrim`): the veil behind a dialog and over a portrait being changed.
- The dark theme mirrors every neutral (`*-dark`) at the same contrast steps.

### Themes and surfaces
The colours above are Garden, the default of twelve themes (Carlos chose eight others on 2026-11-23 and the three plain ones on 2026-11-26, each from mockups on the real app).
A theme (`data-palette`, Settings → Appearance → Theme; `Session.palette`) replaces the neutrals, the three inks, the accent family and clay, ochre and sage, sets the canvas wash (`--theme-wash-*`), and may set the title face (`--font-title`), scale the corners and drop the green from the shadows and scrim; every theme has a light and a dark block in `src/WarmEditorial.module.css`, at the same contrast steps as Garden.
Domain hues, widget kinds, attention, stuck, sun and errors never change with the theme: they carry meaning.
- **Garden**: forest on cream, Fraunces, contours.
- **Linen**: near-white paper, black ink, vermilion; Instrument Serif; corners at 55%; a fine linen weave.
- **Tide**: sea-glass paper, harbour blue, coral for late; Fraunces; waves.
- **Terracotta**: sand, burnt orange, olive and saffron; Young Serif; star-and-diamond tiles.
- **Dusk**: lilac, plum, rose and peach; Newsreader; corners at 115%; blossoms.
- **Frost**: cool grey, cobalt; Inter Tight titles; corners at 60%; a dot grid. The quiet theme for people who want less whimsy.
- **Meadow**: butter paper, grass green, tomato and sunflower; Bricolage Grotesque; corners at 130%; daisies and sprigs.
- **Midnight**: blue-black and an amber lantern accent (deep amber in light); Fraunces; stars and two constellations.
- **Espresso**: coffee and copper (latte in light); Young Serif; coffee beans.

The plain themes (Carlos, 2026-11-26) follow the palette Linear and Notion use: neutral greys, one main colour, violet for the accent's words, and state colours where the kinds go (sage green for agent work and done, ochre amber for the week and pinned, clay red-orange for late). Their shadows and scrim are neutral, and they set no pattern but Violet's dot grid.
- **Graphite**: zinc greys; near-black buttons, Capture and the current place; violet only for words, links and selection; DM Sans titles, so one family throughout; corners at 65%; plain canvas. The quietest theme.
- **Violet**: cool greys with violet as the one accent, buttons included; Inter Tight titles; corners at 65%; a dot grid. Named for the colour so it never reads as the Iris domain hue.
- **Paper**: Notion's warm off-white and warm near-black, violet words; Fraunces, Atlaswork's own voice; corners at 75%; plain canvas.

Picking a theme also sets its own surfaces (`src/dialogs/themes.ts`); the Canvas page changes any of them afterwards:
- **Canvas** (`data-canvas`): contours, linen, waves, tiles, blossoms, dot grid, daisies, stars, coffee beans, terrazzo, doodles, an aurora wash, or plain.
  Patterns are black-on-clear SVG masks (`--pattern` on the pseudo-element that draws each, `WorkbenchShell.css`; never on the root, where every element would inherit them) through which the theme's wash shows at low strength, behind the panel only; Settings draws each as a tile the same way.
- **Sidebar** (`data-sidebar`): paper (default), sage, sunrise, glass, or ink, a deep green surface in both themes with its own local tokens.
- **Chat rail** (`data-rail`): a hand-drawn sage vine (default), the ink sidebar's deep green with contour lines, a speckled seed tray with each face in a paper pocket, a flat tint of the open chat's colour, or plain; patterns are masks under the faces, desktop only.
- **Emblems** (`data-emblems`, Appearance → Emblems; `Session.emblems`): how domain and topic emoji are drawn. Fluent Flat, Microsoft's flat emoji, the same on every device (default), or Mono, Fluent's one-colour glyphs in the place's colour, for the quiet themes (Frost, Graphite, Violet, Paper); "Theme" follows the theme, and a person may pick Device emoji, Fluent Flat, Mono or Line instead (Carlos, 2026-11-26, from a mockup of eight families).
- **Daypart** (`data-daypart`): with Follow time of day on, morning, evening and night shift the theme's wash halfway toward gold, clay and blue; the day shows it as the theme has it.
- **Mode and density** (`data-theme`, `data-density`): light, dark or Auto; comfortable or compact. In Settings "Theme" is only ever the palette, and light or dark is the Mode.

### Named Rules
**The Accent Follows the Domain Rule.** Inside a domain, its hue becomes the accent: primary buttons, the selected nav item, the active tab and focus rings turn that colour, mixed toward black in light and white in dark. Outside any domain, the accent is forest.

**The Readable Hue Rule.** A domain's accent and accent text are capped at oklch lightness 0.52 in the light theme, so paper text on the accent and accent words on paper, recessed and soft fills pass 4.5:1 for every hue. A new hue is checked against that cap before it joins the ten.

**The Own Colour Rule.** A domain's hue appears only where that domain is: its chip, its plant ring, title and progress. A page is never washed in it, and a band never wears it as a stripe along an edge; the masthead uses the theme's second tone (`sidebar`).
A card that stands for one domain or agent may carry that hue as a flat tint of the panel, 8 to 14%: the domain card's heading, the domain dialog's preview, the agent card's band behind the portrait, the agent badge, an agent's speech bubble in Crew (Carlos, 2026-11-16). Never a gradient, and never on a card that only belongs to the place.

**The Three Inks Rule.** `ink`, `secondary` and `muted` sit at about 12, 8 and 5.6 to 1 on the panel in both themes. Use the lightest tier that still says what the text is; never fade text further with opacity.

**The Daypart Rule.** Washes stay behind the panel, never on content.

## Typography

**Display Font:** Fraunces (with Georgia, serif)
**Body Font:** DM Sans (with sans-serif)

**Character:** a soft, slightly old-fashioned serif with optical warmth for titles, against a clean geometric sans that keeps dense rows readable.

**Theme title faces:** a theme may swap the display face (`--font-title`) and nothing else: Instrument Serif (Linen), Young Serif (Terracotta, Espresso), Newsreader (Dusk), Inter Tight (Frost, Violet), Bricolage Grotesque (Meadow) and DM Sans itself (Graphite), each but DM Sans one weight of Google Fonts' latin subset in `public/fonts`, fetched only when its theme is on. DM Sans stays the body face in every theme.

### Hierarchy
One ladder serves both faces (`--text-*`); the face says what a line is, the step says how much it matters.
- **Display** (`--text-display`, 600, 28 to 38px fluid, 1.2, -1.25px tracking): page titles, Today's greeting, a note's title.
- **Headline** (`--text-5xl` 32px, `--text-4xl` 28px, 600): sign-in and boot screens, an agent's card title, an editor's first heading, page titles on phones.
- **Headline small** (`--text-3xl`, 24px, 600, 1.25): dialog headings, domain cards, Settings page titles, the one large figure in a widget.
- **Title** (`--text-2xl`, 21px, 600, 1.3): directory and section titles, team and agent names in their cards.
- **Title small** (`--text-xl`, 18px, 600, 1.25): Today's group titles, card titles, a brief's welcome title, an editor's third heading.
- **Body large** (`--text-lg`, 16px): small Fraunces card titles and the nav's domain names; long-form inputs.
- **Body** (`--text-md`, 14px, 1.5): notes, chat messages, task titles.
- **Body small** (`--text-sm`, 13px): captions, settings descriptions, page outcome lines on phones.
- **Label** (`--text-xs`, 12px, 500): widget headings, buttons, metadata, counts.
- **Mark** (`--text-2xs`, 11px): date and stage chips, unread badges, the calendar tile's weekday. Never a sentence.

Compact density lowers body large, body, body small and label by one pixel each (15, 13, 12, 11px); marks and every heading step stay put.
Weights are 400, 500 and 600; 700 only for the numerals in badges and meters.

### Named Rules
**The Ladder Rule.** Every text size is a step of the ladder. Emoji glyphs size to their tile, and a figure drawn inside a graphic (a ring, a jar, an arc) sizes to the graphic; both may use raw pixels, nothing else does.

**The Eleven Pixel Floor.** No text is smaller than 11px, in any density, and 11px is for marks (chips, badges), not for words a person reads in a line. Body copy on phones is at least 12px.

**The One Figure Rule.** Each card has at most one large Fraunces figure; everything else in it is label or body size.

## Layout

A shell of three columns on desktop: a 236px sidebar (it folds to a 68px rail, and does so by itself between 761 and 1200px), the page panel, and an optional 360px agent panel; the status bar runs under them.
The shell keeps 16px from the window and 12px between its panels.
The desktop top bar folds to one 24px row 6px under the window's edge, so the page starts at 36px instead of 72px (Carlos, 2026-11-26, picked "the ribbon" over a named current chip with sprouting bars and over moving the bar into the sidebar).
Folded, every domain chip lies flat as a 12px bar of its own width, the open domain's solid in its hue and the others their hue at 30% (42% on the dark canvas), see-through; pointing at the bars or tabbing into them stands the full chips back up over the page's top edge on a panel with the float shadow.
A domain with late tasks keeps a clay dot on its bar's top-right corner, like a notification badge (Carlos, 2026-11-26, picked it over a dot at the bar's end, which read as a slider's handle, a count, a clay ring, nothing until opened, and a total beside the date), so the folded bar still says where something is overdue.
Today becomes a date pill, Search and Capture 24px icons with their words as tooltips, and the theme dial leaves for the status bar's.
On phones (760px and under) the sidebar becomes a drawer, a bottom bar carries Today, Projects, Capture, Chat and More, and the shell tightens to 8px.
Capture is the bar's centre and its one action: a 56px forest disc with a 24px plus and no label, raised half out of the bar and ringed in the bar's paper, while the four places around it keep icon and label (Carlos, 2026-11-16, chose this common centred layout over an accent pill in line with the others).
The phone header holds your picture (it opens your profile), a seed for every domain and Search as an icon (agents-design D59, Carlos, 2026-11-17, after finding the search pill rarely used): a seed is the domain's emoji in a pill, and the domain you're in also names itself and wears its hue as a ring, so any domain is one tap away and the header says where you are.
Scrolling a page down folds the header away and scrolling up brings it back.
Phones have no tab strip: a page's heading ends with a stack and the count of open tabs, shown only while another is open, which opens them as a sheet under the header (agents-design D60, 2026-11-17).
Larger screens show the strip only once a second tab is open.
A task row on a phone gives its title the whole width; the date, the domain by name and a small face follow on a quiet line under it.
More opens a sheet over the bar with the other pages as four-to-a-row tiles in two groups, Places (Domains, Library, Archive) and Crew (Agents, Routines), and Settings beside the theme dial under a hairline; never a native select.
Chat's marigold count is only the agents waiting on you; unread news is a quiet accent dot, and holding Chat opens Needs you.
Phones have no status bar: the theme lives in More, chat in the bottom bar, and a failed save raises its own alert.
Settings on a phone drills down like the phone's own settings: its pages as a full-width list under their group names, a tap opens one, and "All settings" leads back; a row of tab chips clipped the words (2026-11-17).
The phone chat gives the conversation the height: the side panel's rail of faces becomes a row across the top, the name is one line without its underline, and the starters keep to one row that scrolls sideways; the composer starts one line tall and grows to a third of the screen.
The viewport resizes for the on-screen keyboard (`interactive-widget=resizes-content` in `index.html`), so dialogs centre in the space above it; while it's up, the bottom bar, and in the chat the row of faces and the starters, step aside (`data-keyboard` on the shell).
Choices inside a dialog you type in unfold in the dialog, never as a popover: on a phone the tap closes the keyboard and moves the dialog, which cut off an anchored menu (Capture's place and Save as, 2026-11-17); Capture itself is a sheet at the foot of a phone's screen, and its header reads "Capture to ☀️ Everyday", the place a pill in the title (Carlos picked this over Atlas in the header).
Pages keep a 1120px measure inside the panel, with 40px padding (28px compact, 24px on tablets, 20px on phones) and 32px between sections (24px compact).
Bands that run edge to edge (Today's hero, a project's or domain's masthead) pad by the same inset, so their words start where the page's do.
Widgets sit on a twelve-column grid with 16px gaps (`docs/page-design.md`).
Every gap, padding and margin sits on one grid: even pixels up to 24, then multiples of 4; 1px is a hairline.
Stacking uses named layers (`--layer-behind`, `raised`, `sticky`, `panel`, `chrome`, `float`, `toast`, `top`), never a bare number.

### Named Rules
**The Density Rule.** Comfortable and compact change type, padding, row height and control height together (`--row-height` 45 to 36px, `--control-height` 34 to 30px, `--card-padding` 24 to 18px), never one alone.

## Elevation & Depth

Mostly tonal: depth comes from the paper tones (canvas, panel, recessed) and hairline borders.
Shadows are soft, warm and low, and lift only in response to the pointer or an overlay.

### Shadow Vocabulary
- **Hairline** (`--panel-shadow`): panels and cards at rest.
- **Raised** (`--shadow-raised`) and **Knob** (`--shadow-knob`): something small sitting on its surface (a selected segment, a toast row); a handle you drag (a slider thumb, a switch).
- **Well** (`--shadow-well`): a track or slot pressed in.
- **Drop** (`--shadow-drop`): a tile or badge standing just off the page.
- **Float** (`--shadow-float`, `--shadow-float-hover`): the Atlas button and its speech bubble, at rest and lifted.
- **Lift** (`--shadow`): dialogs, popovers, menus, the onboarding cards.
- **Sheet** (`--shadow-sheet-side`, `--shadow-sheet-up`): the resource peek and the Routines page's routine sheet sliding in from the side, or from below on phones.
- **Hover** (`--shadow-hover`): a card lifted under the pointer, as a domain card rises and tilts half a degree.
- **Ring**: a selected portrait, swatch or face, in one of two sizes: `0 0 0 2px var(--panel), 0 0 0 4px <colour>`, or 3px then 5px on a large portrait; the panel-coloured gap keeps it off the image.

### Named Rules
**The Earned Lift Rule.** Surfaces are flat at rest. A shadow grows only on hover, drag or an open overlay.

**The Named Shadow Rule.** A shadow with blur is a `--shadow-*` token. Rings and edges, which have no blur, are drawing and stay with their part.

**The Ink Not Glow Rule.** A place shows its colour in ink: a title, an icon, a filled bar, a ring round a face. Never as a coloured shadow, a halo round a dot, a gradient wash across a card, or a stripe down its edge. The exceptions are the flat tint on a place's own card (The Own Colour Rule) and a flat band across a card's top (the agent card behind its portrait, a widget behind its heading).

## Shapes

Gently rounded and slightly hand-made, with corners named by what they round (`--radius-*`):
a progress bar or code span (hair, 3px), a date chip or tag (xs, 4px), a button or icon button (small, 6px), a small tile or menu item (md, 8px), a field, toast or panel well (base, 10px), a nav item, tab, menu or form input (control, 12px), a card or widget (card, 16px), a portrait or topic tile (tile, 18px), the shell panels and dialogs (shell, 22px), and pills for domain chips, filter chips, switches and the status bar.
Circles are `50%`.
Signature organic corners appear on things that grow: seed and plant tiles use `50% 50% 35% 50%`, domain cards `20px 20px 10px 20px`, a speech bubble tucks the corner nearest its speaker, and the Atlas unread badge is a teardrop pointing at its avatar.
Large portrait squircles (28px and up) keep their own radius.

## Components

Tactile and quiet: controls sit flat and answer the pointer with a short, settled move.

### Buttons
- **Shape:** gently rounded (6px), 34px tall (30px compact), 12px medium label.
- **Primary:** accent fill, `on-accent` text; one per view at most.
- **Secondary:** panel fill, `line-strong` border, ink text; the border turns accent on hover.
- **Quiet / Text:** no border; `secondary` or accent-ink text, a recessed wash on hover.
- **Danger:** error fill, panel text; only in a danger zone, for something that can't be undone.
- **Press:** every button sinks 1px and scales to 0.97.
- **Icon buttons:** 29px square, muted icon, recessed on hover, accent-soft when pressed. Their words live in a `Tip` (the shared tooltip, `src/Popups.tsx`, ADR 0003) and `aria-label`, never `title`. One glyph per meaning: a pencil edits a place (beside a page's title, on a domain chip or card); the sliders customize a page and sit near the end of its actions, followed only by faces and the open tabs.
- **Focus:** a 2px accent outline 3px off the control, on keyboard focus only.
- **Target:** anything you tap is at least 24px in both directions. A smaller mark keeps its size and reaches further: the 18px task tick's target extends 4px past it on every side.

### Chips
- **Domain chips:** pills with the domain's emoji on a tile; active fills with the hue and its emoji bobs; the edit pencil slides out on hover or focus; a domain with late tasks has a clay dot on the pill's top-right where its curve turns, ringed in paper like the sidebar's late count, which stays there as a folded bar stands up into the chip.
- **Date chips:** accent-soft fill, accent-ink 11px text (`--text-2xs`), 4px radius; late dates turn clay-ink on a clay wash and say how late.
- **Filter chips:** pills with a hairline border and a muted count; selected ones fill accent-soft.
- **Memory pills:** what a reply remembered, under it: a hairline pill in muted 12px text with an accent-ink bookmark; its Undo is a 22px round button shown on hover or focus (always on touch screens), and an undone one turns dashed and says "Forgotten".
  Where something is on a computer, offered to remember (agents-design D80), is the same hairline outline with the control radius, a muted folder-search icon and ink text that wraps, and Keep (accent-ink) and Not this (muted) as 24px text pills that stay in view and wrap together; kept, it becomes a memory pill, and turned down it turns dashed and says "Not kept".
  The computer it's on (D84) follows the words in muted text with a small monitor icon and never truncates, so a narrow pill cuts the words, never where.
- **Source chips:** what a reply read, above its words (agents-design D81): a connected account is a hairline pill on the panel, its service's own mark at 14px, the action in ink 12px semibold and what it read after a muted dot ("Checked Google Calendar · Tue 24 – Mon 30 Nov"); one that couldn't read the service turns dashed in clay on a faint clay wash, clay-ink, its mark greyed, and a revoked one has a hairline Reconnect pill beside it. Your own notes, tasks, pages, files and images show only a 26px round muted icon, the words in its tooltip.
- **Counts:** the one number that summarises a widget, as muted words beside its title, not a pill; a late count turns clay-ink and semibold.
- **Badges:** attention amber with `on-attention` numerals for unread and waiting counts.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** flat panel. The kind's colour is in the heading's icon and the fills inside, never across the card.
- **Shadow Strategy:** hairline at rest (see Elevation).
- **Border:** hairline (`line`).
- **Internal Padding:** `--card-padding` (24px, 18px compact) on directory cards; a block on a page uses 16px by 18px.
- Anatomy and kind colours: `docs/page-design.md`.

### Inputs / Fields
- **Style:** panel fill, body-size text, placeholders in `muted`, and a `line-field` edge: 3:1 or more against the panel and the canvas in both themes, the least a field's boundary may be. Corners are 6px by default, 10px in settings cards and widgets, 12px in onboarding and sign-in.
- **Focus:** the 2px accent outline.
- **Error:** an `error` line under the field.
- **Switches:** a 38 by 22px pill in `line-strong` that fills with the accent when on; the knob slides across.
- **Segmented controls:** a recessed tray of choices with the picked one raised on the panel; choices that don't fit the width wrap to another row inside the tray (each row filled on phones), never running past its edge.
- **Listening:** a microphone that hears you fills with the accent while a ring breathes out from it (`--motion-linger`, until you stop; still under reduced motion). Capture is a field with its tools inside it: the box takes the edge and the focus ring, the textarea none.
- **Filled for you:** a field or chip an agent just filled (Describe it, agents-design D63) wears the 2px accent ring for a moment, fading over 2.4s on the settle curve, never a tint or glow. Describe it itself is a pill-shaped field with the agent's face first and the microphone and an accent send button inside it. While the agent works, one accent arc turns on a hairline ring round its face (`--motion-linger`, linear), the send button's arrow becomes a turning loader with a small stop square inside (tap to stop), and the packet's name and purpose breathe between half and most of their ink (1.6s, the purpose a beat later); the face never hops.
- **Seed packet:** a project's or domain's name in Fraunces, and what it's for on at least two ruled lines in the packet's hue that grow with the text; focused, the rules stay hairline and take the full hue.
- **Undecided:** a choice nobody has made yet (a new domain's keeper before it has a name) shows a dashed circle with a muted person icon and says when it will be chosen, never a default face posing as a pick.

### Navigation
Sidebar sections in DM Sans with Fraunces for the domain name; nav items and tabs are 12px-rounded and fill with the accent when selected.
Settings uses vertical tabs with a one-line hint each.
The status bar is a floating pill carrying save state, breadcrumbs and the place's progress lane (a striped fill in the place's colour with its plant riding the edge).
On phones the bottom bar has one ink pill that slides to the place you pick on the settle curve (resting on More while one of its pages is open, fading out on a domain's page, which its seed marks instead), and the picked icon hops in on the spring as it arrives (Chat's bubble chatters); nothing hops until the bar is first touched.
A seed you pick hops the same way and its name slides out beside it, again only once the row has been touched; a sideways swipe on a domain page's heading moves to the next domain.
Pressing Capture turns its plus a quarter, like a seed twisted into the soil; More deals its tiles up one after another, each icon popping behind its tile, and its grid icon tips onto its corner while the sheet is open.
A page you switch to on a phone settles up into place (12px and a fade, on the settle curve; never the first page), and Chat's teardrop drops in again each time another agent starts waiting on you.
On a touch screen a task row follows a sideways finger on the settle curve: right past 88px ticks it off over an accent-soft wash, left uncovers Star (an ochre wash) and Tomorrow (recessed) behind it; the parts behind exist only while that row is swiped.

### Menus and dialogs
- **Menus:** a 240px panel with 12px corners, the lift shadow, 8px-rounded items with a title and a muted line each; the chosen one shows a check in the place's colour. A menu opened from a button is a `Picker` (Base UI, ADR 0003): arrow keys, Home/End and typeahead move through it, Escape returns to the button, and it stays inside the window.
- **Dialogs:** 570px wide at most, 22px corners, the lift shadow over the scrim; a Fraunces heading at 24px.

### Atlas and the crew
Agents always appear as their portrait, never a generic icon.
The Atlas button is a bubble floating over the page's bottom-right corner: the face with an attention teardrop for the unread count, the name sliding out on hover; a new message peeks above it once as a speech bubble whose tucked corner points at the face.
Stacked avatars stand for a team.
The chat panel shows each face once (Carlos, 2026-11-17, after the strip and the name card both showed Atlas): conversations are a 56px rail of faces down its right edge in the `sidebar` tone with a surface from Looks (a hand-drawn sage vine by default; Carlos picked it over ink, a seed tray and a tint of the chat's colour, then asked that people can choose), the open one ringed in its colour, with an attention count for what waits on you there and a wave of dots while it replies; the header is the name in Fraunces at 24px with its hand-drawn underline and the conversation's title under it (on the Chats page, where the tab names the chat, one row of title, status and actions at the conversation's width); the transcript fades out over its top 16px, so text under the header reads as more above; your messages sit at the right edge at their own width, one-to-one replies carry no name or face, and a room's voices carry theirs at 24px in the margin.
An agent's card says no in the error colour (Reject and Decline outlined, Apply filled) and says what became of it in one line.
A message fills the transcript's width, as its cards and the composer do (Carlos, 2026-11-22: a 56ch measure left half the Chats page empty). A reply may carry Markdown at that width (lists indented, a table compact in `--text-sm` with hairline rows that scrolls sideways, bold at 600, no headings), answers to tap as pills like its links (the tapped one stays filled in an accent tint with a tick, the rest fold away), and your own widgets and tasks drawn with the page's cards, each with its place under it in muted `--text-xs` (agents-design D64).
Everything about the conversation that isn't a message (context, model, write mode) sits behind one context meter in the composer, and the note they read is a chip inside the message box.
In the first run Atlas is the guide and moves between steps (a view transition on the settle curve): a large sticker on Hello, beside his bubble on the left, then on the right with the bubble's tucked corner mirrored, then centred and larger on Ready; a pick makes him hop once.
An agent's presence dot is attention amber when it waits on you and stuck red when it could not finish.
An agent whose routine is off sleeps on the Routines page: the face greyed, a moon on its badge, and two z's that drift up once when you switch it off; switched on, the face hops once (agents-design D70).
On the page's week line each run is its runner's face on a stem from a sage seed in the soil line, today is a small sun, and a stack sways from its seed under the pointer; a run whose face would cover the stack before it joins that stack, so stacks never overlap.
A routine's next runs are tear-off leaves; a weekend leaf is warmer ochre paper with a dashed fold under its band and the day's name in clay, as Today's week strip warms weekends.

### Icons
Lucide line icons in the colour of the text beside them, at four sizes: 12px inside a chip or small tile, 14px beside a label, 16px in buttons and rows, 18px in navigation.
The phone bar's Capture disc is the one exception, a 24px plus.
From 24px up an icon is otherwise an illustration (an empty state, a boot screen).
Emoji appear only as an emblem a person picked (a domain's, a topic's), on a tinted tile; a project's growth stage is the drawn plant.
An emblem keeps its emoji and is drawn in the family Appearance → Emblems picks (`src/emblemFamilies.ts`, `src/Emblem.tsx`): the device's emoji, Fluent Flat, Mono (Fluent's high-contrast glyphs as a mask in `color-mix(hue 70%, ink)`), or Line (Lucide, from a fixed emoji map; any other emoji falls back to Mono). An emoji a family lacks stays the device's; text that names a place (a toast, a menu option) keeps the glyph.
A connected service (Google Calendar) shows its own mark in its own colours wherever the app names it: the sources chip, the typing step, Add to Google Calendar, Settings → Connections. It is the one icon not drawn in the text's colour.
Two drawn exceptions sit beside the icons, at the same sizes: a model maker's own mark (from Simple Icons, filled, in its `vendor-*` colour) wherever a model is named, and Thinking as a plant in Lucide's stroke: a dashed ring for the account's setting, a seed for Fast, a sprout for Balanced, a full stem for Thorough (agents-design D82).
A person in the Library (agents-design D71) has a face instead: their photo, or their initials in their colour's ink on a light wash of it, always round, so a person never reads as a topic or an agent's portrait.
The app's own mark (`public/icon.svg`, Carlos's pick on 2026-11-26) is a cream capital A drawn as a mountain on a forest tile, a sun-yellow road climbing its left leg and crossbar to a sun just above the peak: the name, the climb and the goal, with help along the way.
It is the favicon of both sites, the installed app's icon (full-bleed and smaller inside the safe zone when the platform masks it), the Windows app's icon, and Atlaswork's mark where a model is named; the dev install wears it on clay (`dev/app`).
It stays in fixed colours (forest, cream, sun) whatever the theme, and is drawn from one SVG, never redrawn per size.

## Do's and Don'ts

### Do:
- **Do** reuse the parts in `docs/page-design.md` before adding a new one.
- **Do** take every size, corner, duration, shadow, layer and colour from a token, and every gap from the spacing grid; add a token when a value repeats with the same intent three times.
- **Do** put a new rule in the sheet that owns its class (`src/styles/`, one sheet per part of the app; the shell, domain chips included, in `src/WorkbenchShell.css`; owners in DEVELOPMENT.md, "Where to change the UI"); a sheet that restyles another's class says so in a `restyles` comment.
- **Do** carry a domain's hue only in the places The Own Colour Rule names.
- **Do** pick a motion duration by its job: `--motion-quick` (160ms) for hover and colour, `--motion-settle` (280ms) for layout and panels, `--motion-pop` (360ms) for a pick answering, `--motion-enter` (440ms) for something arriving, `--motion-flourish` (520ms) for a celebration, `--motion-fill` (700ms) for a bar filling or a line drawing, `--motion-linger` (900ms) for a rare long one-off.
- **Do** move with the settle curve (`--ease-settle`) for every hover, press, panel and state change; keep the spring (`--ease-spring`) for keyframed moments when something grows or lands: a plant, a sticker, a tick, a badge. Turn both off under reduced motion.
- **Do** show compact states as an icon or face with words in the tooltip, and reveal text on expand, hover or focus.
- **Do** check light and dark themes, both densities and a light domain hue (marigold) on the showcase (`/dev/design/`); meet WCAG AA in each.

### Don't:
- **Don't** wash a page or masthead in the domain colour or rule its edge in it; the masthead is the `sidebar` tone with a hairline under it.
- **Don't** set text under 11px, a sentence at 11px, or a heading between two ladder steps.
- **Don't** put the spring on a transition; a hover that bounces reads as a toy.
- **Don't** add more than one animated moment per card, or animate on load.
- **Don't** use emoji glyphs where a drawn icon exists, except as a domain's own emblem.
- **Don't** nest a card inside a widget card.
- **Don't** mark a card, row or callout with a coloured stripe down its side; a selected row takes a soft fill, a quotation its indent and voice.
- **Don't** seat a heading's icon on a tinted tile, shade a seal like a sphere, or fill a surface with a gradient; tiles are for emblems (a domain's emoji, a plant) and pictures.
- **Don't** write a colour literal outside the token file; an illustration in fixed colours (the theme dial) says so with a `token-exempt` comment. A theme's swatch in Settings is drawn from that theme's own tokens, never copied colours.
