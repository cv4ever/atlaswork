// The token sections of the showcase: every custom property the skin declares, read live from its stylesheet rule and
// drawn by what it is for. What a token is for (its group, its job, the pairs its contrast is judged on) is written
// here beside DESIGN.md's words; its value never is. A token this file doesn't know still shows, under "Unsorted".
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { domainHues } from "../../src/model.ts";
import warmEditorial from "../../src/WarmEditorial.module.css";
import { Section, Segments } from "./frame.tsx";

/** The declarations of the skin's rule with this suffix ("" is the base rule, `[data-daypart="night"]` a variant). */
function skinRule(suffix = "") {
  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules)
      if (rule instanceof CSSStyleRule && rule.selectorText === `.${warmEditorial.skin}${suffix}`) return rule.style;
  }
  return null;
}
/** The custom properties the skin's own rule declares, in the token file's order. */
const tokenNames = () => [...(skinRule() ?? [])].filter((name) => name.startsWith("--"));

type Kind = "font" | "text" | "radius" | "motion" | "ease" | "shadow" | "layer" | "size" | "colour";
const kindOf = (name: string): Kind => /^--font-/.test(name) ? "font" : /^--text-/.test(name) ? "text" : /^--radius/.test(name) ? "radius"
  : /^--motion-/.test(name) ? "motion" : /^--ease-/.test(name) ? "ease" : /^--(shadow|panel-shadow)/.test(name) ? "shadow"
  : /^--layer-/.test(name) ? "layer" : /-(width|height|padding|gap)$/.test(name) ? "size" : "colour";

/** A contrast pair that has to hold: this colour, on that one, at least so many to 1. */
type Check = [fg: string, bg: string, floor: number];
/** WCAG AA: 4.5 to 1 for words, 3 to 1 for marks and the edges of controls. */
const words = 4.5, marks = 3;
const colourRoles: Record<string, { group: string; use: string; checks?: Check[] }> = {
  "--canvas": { group: "Paper", use: "surface: the backdrop behind the panels", checks: [["--muted", "--canvas", words]] },
  "--sidebar": { group: "Paper", use: "surface: sidebar, mastheads, Today's hero", checks: [["--muted", "--sidebar", words]] },
  "--panel": { group: "Paper", use: "surface: cards, panels, dialogs", checks: [["--muted", "--panel", words]] },
  "--recessed": { group: "Paper", use: "surface: a well in a card, a hover fill", checks: [["--muted", "--recessed", words]] },
  "--ink": { group: "Ink", use: "text: headings and body", checks: [["--ink", "--panel", words]] },
  "--secondary": { group: "Ink", use: "text: supporting lines, quiet buttons", checks: [["--secondary", "--panel", words]] },
  "--muted": { group: "Ink", use: "text: captions, metadata, placeholders", checks: [["--muted", "--panel", words]] },
  "--line": { group: "Lines", use: "hairline: dividers, card borders. No floor" },
  "--line-strong": { group: "Lines", use: "hairline: secondary buttons, switch tracks. No floor" },
  "--line-field": { group: "Lines", use: "edge: anything you type or pick in", checks: [["--line-field", "--panel", marks], ["--line-field", "--canvas", marks]] },
  "--skin-accent": { group: "Accent", use: "mark: the skin's accent, before a domain's hue", checks: [["--skin-accent", "--panel", marks]] },
  "--accent": { group: "Accent", use: "fill and mark: primary buttons, selection, focus rings", checks: [["--on-accent", "--accent", words], ["--accent", "--panel", marks]] },
  "--accent-ink": { group: "Accent", use: "text: the accent as words", checks: [["--accent-ink", "--panel", words], ["--accent-ink", "--recessed", words]] },
  "--accent-soft": { group: "Accent", use: "fill: date chips, selected filters", checks: [["--accent-ink", "--accent-soft", words]] },
  "--accent-hover": { group: "Accent", use: "fill: a primary button under the pointer", checks: [["--on-accent", "--accent-hover", words]] },
  "--on-accent": { group: "Accent", use: "text: words on an accent fill", checks: [["--on-accent", "--accent", words]] },
  "--clay": { group: "Kinds", use: "mark: trackers, lateness. Never words", checks: [["--clay", "--panel", marks]] },
  "--clay-ink": { group: "Kinds", use: "text: clay as words (\"3 days late\")", checks: [["--clay-ink", "--panel", words]] },
  "--ochre": { group: "Kinds", use: "mark: countdowns, the week, the backup reminder", checks: [["--ochre", "--panel", marks]] },
  "--sage": { group: "Kinds", use: "mark: habits, agent work", checks: [["--sage", "--panel", marks]] },
  "--error": { group: "Status", use: "text and fill: failed saves, danger buttons", checks: [["--error", "--panel", words], ["--error", "--error-soft", words], ["--panel", "--error", words]] },
  "--error-soft": { group: "Status", use: "fill: behind an error message", checks: [["--error", "--error-soft", words]] },
  "--attention": { group: "Status", use: "fill: an agent waits on you, unread counts", checks: [["--on-attention", "--attention", words]] },
  "--on-attention": { group: "Status", use: "text: numerals on an attention fill", checks: [["--on-attention", "--attention", words]] },
  "--stuck": { group: "Status", use: "mark: an agent that could not finish", checks: [["--stuck", "--panel", marks]] },
  "--vendor-claude": { group: "Makers", use: "mark: Claude's models (agents-design D82). Never words", checks: [["--vendor-claude", "--panel", marks], ["--vendor-claude", "--canvas", marks]] },
  "--vendor-openai": { group: "Makers", use: "mark: OpenAI's models, in ink", checks: [["--vendor-openai", "--panel", marks]] },
  "--vendor-gemini": { group: "Makers", use: "mark: Gemini models", checks: [["--vendor-gemini", "--panel", marks], ["--vendor-gemini", "--canvas", marks]] },
  "--vendor-deepseek": { group: "Makers", use: "mark: DeepSeek models", checks: [["--vendor-deepseek", "--panel", marks], ["--vendor-deepseek", "--canvas", marks]] },
  "--vendor-mistral": { group: "Makers", use: "mark: Mistral models", checks: [["--vendor-mistral", "--panel", marks], ["--vendor-mistral", "--canvas", marks]] },
  "--vendor-meta": { group: "Makers", use: "mark: Llama models", checks: [["--vendor-meta", "--panel", marks], ["--vendor-meta", "--canvas", marks]] },
  "--scrim": { group: "Veil", use: "veil: behind a dialog, over a portrait being changed" },
  "--bloom-1": { group: "Veil", use: "veil: the canvas wash, first bloom" },
  "--bloom-2": { group: "Veil", use: "veil: the canvas wash, second bloom" },
  "--bloom-3": { group: "Veil", use: "veil: the canvas wash, third bloom" },
};
const colourGroups = ["Paper", "Ink", "Lines", "Accent", "Kinds", "Makers", "Status", "Veil", "Unsorted"];
const unsorted = { group: "Unsorted", use: "not sorted yet: add it to colourRoles in dev/design/Tokens.tsx", checks: undefined };

/** Each step's role in DESIGN.md's hierarchy: its name, the faces that use it, weight, line height, and where it appears. */
const typeRoles: Record<string, { role: string; serif: boolean; sans: boolean; weight: number; leading: number; use: string }> = {
  "--text-2xs": { role: "Mark", serif: false, sans: true, weight: 500, leading: 1.3, use: "date and stage chips, badges. Never a sentence" },
  "--text-xs": { role: "Label", serif: false, sans: true, weight: 500, leading: 1.4, use: "widget headings, buttons, metadata, counts" },
  "--text-sm": { role: "Body small", serif: false, sans: true, weight: 400, leading: 1.5, use: "captions, settings descriptions" },
  "--text-md": { role: "Body", serif: false, sans: true, weight: 400, leading: 1.5, use: "notes, chat messages, task titles" },
  "--text-lg": { role: "Body large", serif: true, sans: true, weight: 400, leading: 1.5, use: "small card titles, domain names in the nav, long-form inputs" },
  "--text-xl": { role: "Title small", serif: true, sans: false, weight: 600, leading: 1.25, use: "Today's group titles, card titles" },
  "--text-2xl": { role: "Title", serif: true, sans: false, weight: 600, leading: 1.3, use: "directory and section titles, names in their cards" },
  "--text-3xl": { role: "Headline small", serif: true, sans: false, weight: 600, leading: 1.25, use: "dialog headings, the one large figure in a widget" },
  "--text-4xl": { role: "Headline", serif: true, sans: false, weight: 600, leading: 1.2, use: "an editor's first heading, page titles on phones" },
  "--text-5xl": { role: "Headline", serif: true, sans: false, weight: 600, leading: 1.2, use: "sign-in and boot screens, an agent's card title" },
  "--text-display": { role: "Display", serif: true, sans: false, weight: 600, leading: 1.2, use: "page titles, Today's greeting, a note's title" },
};

/** What each token is for, in DESIGN.md's words. */
const jobs: Record<string, string> = {
  "--radius-hair": "a progress bar, a code span", "--radius-xs": "a date chip, a tag", "--radius-small": "a button, an icon button",
  "--radius-md": "a small tile, a menu item", "--radius": "a field, a toast, a panel well", "--radius-control": "a nav item, a tab, a menu",
  "--radius-card": "a card, a widget", "--radius-tile": "a portrait, a topic tile", "--radius-shell": "the shell's panels, dialogs",
  "--radius-pill": "chips, switches, the status bar",
  "--motion-quick": "a hover, a colour change", "--motion-settle": "a layout change, a panel", "--motion-pop": "a pick answering",
  "--motion-enter": "something arriving", "--motion-flourish": "a celebration", "--motion-fill": "a bar filling, a line drawing",
  "--motion-linger": "a rare long one-off",
  "--panel-shadow": "Hairline: panels and cards at rest", "--shadow": "Lift: dialogs, popovers, menus",
  "--shadow-raised": "Raised: a selected segment, a toast row", "--shadow-knob": "Knob: a slider thumb, a switch",
  "--shadow-well": "Well: a track or slot pressed in", "--shadow-drop": "Drop: a tile or badge just off the page",
  "--shadow-hover": "Hover: a card lifted under the pointer", "--shadow-float": "Float: the Atlas button at rest",
  "--shadow-float-hover": "Float: the Atlas button, lifted", "--shadow-sheet-side": "Sheet: the resource peek, from the side",
  "--shadow-sheet-up": "Sheet: the peek on phones, from below",
  "--layer-behind": "a drawn backdrop", "--layer-raised": "something lifted in its own card", "--layer-sticky": "a sticky bar inside a page",
  "--layer-panel": "the sidebar and side panels", "--layer-chrome": "the shell's bars", "--layer-float": "the chat bubble, tooltips",
  "--layer-toast": "toasts", "--layer-top": "what must never be covered",
  "--control-height": "buttons and fields", "--row-height": "a task row", "--card-padding": "inside a directory card",
  "--page-padding": "a page's inset", "--section-gap": "between a page's sections", "--sidebar-width": "the sidebar", "--agent-width": "the agent panel",
};
/** Every gap, padding and margin sits on this grid (scripts/check-tokens.mjs): even pixels to 24, then multiples of 4. */
const gridSteps = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40];
const dayparts = ["morning", "day", "evening", "night"];

type Rgba = [number, number, number, number];
const luminance = ([r, g, b]: number[]) => {
  const linear = (channel: number) => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};
const contrast = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

type Read = { values: Record<string, string>; rgba: Record<string, Rgba>; px: Record<string, string>; washes: Record<string, string[]> };

export default function Tokens({ painted }: { painted: number }) {
  const probe = useRef<HTMLSpanElement>(null);
  const [read, setRead] = useState<Read>({ values: {}, rgba: {}, px: {}, washes: {} });
  const names = useMemo(tokenNames, []);
  useLayoutEffect(() => {
    const element = probe.current;
    if (!element) return;
    const root = getComputedStyle(document.documentElement);
    const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const values: Read["values"] = {}, rgba: Read["rgba"] = {}, px: Read["px"] = {};
    for (const name of names) {
      const kind = kindOf(name);
      values[name] = root.getPropertyValue(name).trim();
      if (kind === "colour") {
        // Through a probe and a 1px canvas, so color-mix() and oklch() tokens resolve to sRGB as painted.
        element.style.color = `var(${name})`;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = getComputedStyle(element).color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        rgba[name] = [r, g, b, a / 255];
      } else if (kind === "text" || kind === "radius" || kind === "size") {
        element.style.width = `var(${name})`;
        px[name] = `${Math.round(parseFloat(getComputedStyle(element).width) * 100) / 100}px`;
      }
    }
    element.style.color = element.style.width = "";
    const washes = Object.fromEntries(dayparts.map((daypart) => {
      const rule = skinRule(`[data-daypart="${daypart}"]`);
      return [daypart, [1, 2, 3].map((index) => rule?.getPropertyValue(`--wash-${index}`).trim() ?? "")];
    }));
    setRead({ values, rgba, px, washes });
  }, [names, painted]);
  const of = (kind: Kind) => names.filter((name) => kindOf(name) === kind);
  const colours = of("colour").map((name) => ({ name, ...(colourRoles[name] ?? unsorted) }));
  const ratio = ([fg, bg]: Check) => read.rgba[fg] && read.rgba[bg] && read.rgba[fg][3] === 1 && read.rgba[bg][3] === 1 ? contrast(read.rgba[fg], read.rgba[bg]) : undefined;
  return <>
    <span ref={probe} className="ds-probe" aria-hidden="true" />
    <Section id="colour" title="Colour" lede="Each token as the current theme paints it, grouped by what it is for, with the contrast of the pairs it is used in: 4.5 to 1 for words, 3 to 1 for marks and the edges of controls. A pair under its floor says so.">
      {colourGroups.map((group) => {
        const members = colours.filter((colour) => colour.group === group);
        return members.length > 0 && <div key={group} className="ds-group">
          <h3 className="ds-sub">{group}</h3>
          <ul className="ds-swatches">
            {members.map(({ name, use, checks }) => (
              <li key={name}><span className="ds-swatch" style={{ background: `var(${name})` }} />
                <code>{name}</code><small>{read.values[name]}</small><small className="ds-use">{use}</small>
                {checks?.map((check) => {
                  const [fg, bg, floor] = check, value = ratio(check);
                  const pair = fg === name ? `on ${bg.slice(2)}` : `${fg.slice(2)} on it`;
                  return value === undefined ? <small key={fg + bg}>translucent {pair}</small>
                    : <small key={fg + bg} data-low={value < floor || undefined}><b>{value.toFixed(1)}</b> : 1 {pair}{value < floor && `, needs ${floor}`}</small>;
                })}</li>
            ))}
          </ul>
        </div>;
      })}
      <div className="ds-pair">
        <div><h3 className="ds-sub">Domain hues</h3>
          <ul className="ds-hues">{Object.entries(domainHues).map(([name, value]) => <li key={name} style={{ "--hue": value } as CSSProperties}><span />{name}<small>{value}</small></li>)}</ul></div>
        <div><h3 className="ds-sub">Daypart washes</h3>
          <ul className="ds-washes">{dayparts.map((daypart) => (
            <li key={daypart}><span>{(read.washes[daypart] ?? []).map((value, index) => <i key={index} style={{ background: value }} title={`--wash-${index + 1}: ${value}`} />)}</span>{daypart}</li>
          ))}</ul></div>
      </div>
    </Section>
    <Section id="type" title="Type" lede="One ladder for both faces: the face says what a line is, the step how much it matters. Each step is drawn in the faces, weight and line height its role uses. Steps up to lg follow density; headings stay put.">
      <ul className="ds-ladder">
        {of("text").map((name) => {
          const role = typeRoles[name];
          const style = { fontSize: `var(${name})`, fontWeight: role?.weight, lineHeight: role?.leading };
          return (
            <li key={name}><code>{name}</code><small>{read.px[name]}</small>
              <strong>{role?.role ?? "Unsorted"}<small>{role && `${role.weight} · ${role.leading}`}</small></strong>
              <span className="ds-samples">
                {(role?.serif ?? true) && <span style={style} className="ds-serif">The week ahead</span>}
                {(role?.sans ?? true) && <span style={style}>{name === "--text-2xs" ? "2 days late" : "Book blood work, due Friday"}</span>}
              </span>
              <small>{role?.use}</small></li>
          );
        })}
      </ul>
    </Section>
    <Section id="spacing" title="Spacing" lede="Every gap, padding and margin sits on one grid: even pixels up to 24, then multiples of 4. The named sizes below are tokens; the row, card, page, section and control sizes change together with density.">
      <ul className="ds-grid-steps">{gridSteps.map((step) => <li key={step}><span style={{ width: step, height: step }} />{step}</li>)}</ul>
      <ul className="ds-sizes">
        {of("size").map((name) => (
          <li key={name}><code>{name}</code><small>{read.px[name]}</small><span className="ds-size"><i style={{ width: `var(${name})` }} /></span><small>{jobs[name]}</small></li>
        ))}
      </ul>
    </Section>
    <Section id="corners" title="Corners" lede="Named by what they round.">
      <ul className="ds-corners">{of("radius").map((name) => (
        <li key={name}><span style={{ borderRadius: `var(${name})` }} /><code>{name}</code><small>{read.px[name]}</small><small>{jobs[name]}</small></li>
      ))}</ul>
    </Section>
    <Section id="depth" title="Depth" lede="Flat at rest: paper tones and hairlines. A shadow grows only on hover, drag or an open overlay, is never coloured, and always comes from a token. Layers stack in the order below, top first.">
      <ul className="ds-depth">
        {of("shadow").map((name) => <li key={name} style={{ boxShadow: `var(${name})` }}><code>{name}</code>{jobs[name]}</li>)}
        <li style={{ boxShadow: "0 0 0 2px var(--panel), 0 0 0 4px var(--accent)" }}><code>ring</code>Ring: a selected face or swatch</li>
        <li className="ds-recessed"><code>--recessed</code>A well inside a card</li>
      </ul>
      <h3 className="ds-sub">Layers</h3>
      <ol className="ds-layers">{of("layer").reverse().map((name) => <li key={name}><code>{name}</code><small>{read.values[name]}</small>{jobs[name]}</li>)}</ol>
    </Section>
    <Motion names={of("motion")} values={read.values} />
  </>;
}

function Motion({ names, values }: { names: string[]; values: Record<string, string> }) {
  const [played, setPlayed] = useState(false);
  const [curve, setCurve] = useState<"settle" | "spring">("settle");
  return (
    <Section id="motion" title="Motion" lede="Durations by job. The settle curve moves every hover, press and panel; the spring is kept for keyframed moments when something grows or lands. Off under reduced motion.">
      <div className="ds-motion-tools">
        <button type="button" className="secondary-button" onClick={() => setPlayed(!played)}>{played ? "Back" : "Play"}</button>
        <Segments label="Curve" value={curve} options={{ settle: "Settle", spring: "Spring" }} onChange={setCurve} />
        <code>{values[`--ease-${curve}`]}</code>
      </div>
      <ul className="ds-motion" data-played={played || undefined}>
        {names.map((name) => <li key={name}><code>{name}</code><small>{values[name]}</small>
          <span className="ds-track"><i style={{ transitionDuration: `var(${name})`, transitionTimingFunction: `var(--ease-${curve})` }} /></span>
          <small>{jobs[name]}</small></li>)}
      </ul>
    </Section>
  );
}
