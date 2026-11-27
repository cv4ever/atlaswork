# Base UI for menus and tooltips, our CSS for the look

2026-11-12, Carlos's call after comparing shadcn/ui and Beautiful UI.

Atlaswork's look is its own (`DESIGN.md`: Fraunces, the warm palette, domain hues) and lives in hand-written CSS on the skin's tokens.
What the hand-rolled parts lacked was behaviour.
Five native popovers carried `role="menu"`, but only one moved with the arrow keys, none had typeahead, and CSS anchor positioning placed them, which not every browser has.
Tooltips were `title` attributes: a second's delay, the browser's own box, and nothing on keyboard focus.

We use Base UI (`@base-ui/react`, headless, MIT) for those behaviours only, through `src/Popups.tsx`:

- **`Picker`** opens a Base UI Menu from a button: arrow keys, Home/End, typeahead, Escape, focus back to the trigger, and placement that flips at the window's edge.
  With `filter` it puts a search field over the items (the Chats page's chat picker).
  Its popup renders into the open modal dialog or native popover when the trigger sits in one, and takes the trigger's `--hue`.
  The trigger stays our own button and the menu, placed against it, mounts only while open, so a page with a view menu per block pays for none of them until one opens (2026-11-18).
- **`Tip`** gives a control its words as a tooltip, shown on hover after 300 ms (at once while another tip was just showing) and on keyboard focus.
  Touch never hovers, so a long press (500 ms without moving) shows it for 2.5 s and swallows the click and context menu that press would end in.
  `Tip` only marks the control (`data-tip`); `Tips` in `main.tsx` listens once on the document and shows the one shared Base UI tooltip against it, so the 180 or so controls with a tip cost nothing until one shows (2026-11-18: a Base UI trigger per control first rendered a component with its own state for each).
  The control keeps its `aria-label`; words that differ from it reach screen readers as `aria-description`, as `title` did.

Rules:

- A button or label that names itself in a tooltip uses `Tip`, not `title`.
  `title` stays only on passive text (a truncated name, a date chip), never on an element that contains a `Tip` or a `Picker`, since its native tooltip would show over theirs.
  ESLint enforces both (`no-restricted-syntax` and `local/no-title-around-tip` in `eslint.config.js`).
- A list of actions or choices opened from a button is a `Picker` with `Menu.Item` or `Menu.RadioItem` rows.
  Panels with form controls (roster options, context windows, the linked folder, the emoji grid) stay native popovers: they are not menus.
- Styles target Base UI's state attributes (`[data-open]`, `[data-highlighted]`, `[aria-checked]`) in `styles.css`; no Tailwind, no component library styles.

Rejected: shadcn/ui, because it brings Tailwind and its own visual defaults, a second styling convention beside 6,000 lines of CSS.
Beautiful UI (copy-paste agent chat components) for the same reason, plus icon sets beside lucide.
It stays a reference for agent states such as thinking traces, tool chips and approval cards, rebuilt in our tokens when we want one.

The Ctrl K search dialog keeps its own arrow-key handling in `Dialog.tsx`; moving it to Base UI's Autocomplete is a separate change.
