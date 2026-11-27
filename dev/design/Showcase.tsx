// The design showcase's page (main.tsx): tokens read live from the skin's stylesheet rule (Tokens.tsx), the shared parts
// in their real classes and in each state (Parts.tsx), and every widget in every view (WidgetGallery.tsx), drawn by
// PageGrid and DataBlock over workspaces held in memory (workspace.tsx). The toolbar repaints through the Skin painter,
// so a theme, mode, density or domain choice shows exactly what the app would.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import AppDialogs from "../../src/AppDialogs.tsx";
import { AppContext, useApp, useView } from "../../src/appContext.ts";
import { ChatPanel } from "../../src/ChatViews.tsx";
import { initialSession } from "../../src/session.ts";
import type { Session } from "../../src/session.ts";
import { themes } from "../../src/dialogs/themes.ts";
import { widgetKinds } from "../../src/blocks.ts";
import OverviewPage from "../../src/OverviewPage.tsx";
import { skin } from "../../src/skin.ts";
import { forceStates } from "./force.ts";
import { Section, Segments } from "./frame.tsx";
import { Dialogs, Parts, States } from "./Parts.tsx";
import Tokens from "./Tokens.tsx";
import WidgetGallery from "./WidgetGallery.tsx";
import { useDemoApp, Workspace } from "./workspace.tsx";

export default function Showcase() {
  const app = useDemoApp();
  if (!app) return <main className="boot-state"><h1>Opening the demo workspace…</h1></main>;
  return <AppContext value={app}><Page /><AppDialogs /></AppContext>;
}

/** A page as the shell holds it: `.workspace-content` is the container the mastheads measure. */
function Frame({ children }: { children: ReactNode }) {
  return <div className="workspace-content ds-frame">{children}</div>;
}

const sections = [["colour", "Colour"], ["type", "Type"], ["spacing", "Spacing"], ["corners", "Corners"], ["depth", "Depth"], ["motion", "Motion"],
  ["parts", "Parts"], ["states", "States"], ["dialogs", "Dialogs"], ["widgets", "Widgets"], ["pages", "Pages"], ["chat", "Chat"]] as const;

function Page() {
  const { actions } = useApp();
  const domains = useView((view) => view.domains);
  const rawDomains = useView((view) => view.data.domains);
  const current = useView((view) => view.session.domain);
  const [palette, setPalette] = useState<Session["palette"]>(initialSession.palette);
  const [theme, setTheme] = useState<"light" | "dark">(skin.getTheme());
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  // Bumped after each repaint, so the values read from computed styles are the new look's.
  const [painted, setPainted] = useState(0);
  const hue = rawDomains.find((domain) => domain.name === current)?.hue ?? "";
  useLayoutEffect(() => {
    skin.apply({ palette, theme, density, canvas: initialSession.canvas, sidebarStyle: initialSession.sidebarStyle, railStyle: initialSession.railStyle, emblems: initialSession.emblems, followDaypart: false }, "day", hue, false);
    setPainted((count) => count + 1);
  }, [palette, theme, density, hue]);
  useEffect(() => forceStates(), []);
  const page = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  /** Where the page is scrolled to: its section, and inside Widgets the kind (`widget-tasks`). */
  const [place, setPlace] = useState({ section: "colour", kind: "" });
  useEffect(() => {
    const scroller = page.current, header = bar.current;
    if (!scroller || !header) return;
    // The bar wraps to two rows on narrow windows; what sticks under it and what scrolls to it follow its height.
    const measure = () => scroller.style.setProperty("--ds-bar", `${header.offsetHeight}px`);
    const resized = new ResizeObserver(measure);
    resized.observe(header);
    let frame = 0;
    const read = () => {
      frame = 0;
      // The last one whose top has passed under the bar; a kind also has the strip of kinds above it.
      const under = header.getBoundingClientRect().bottom;
      const last = (selector: string, line: number) => [...scroller.querySelectorAll<HTMLElement>(selector)].filter((element) => element.getBoundingClientRect().top <= line).at(-1)?.id ?? "";
      const section = last(".ds-section", under + 72) || "colour";
      const kind = section === "widgets" ? last(".ds-kind", under + 120) : "";
      setPlace((now) => now.section === section && now.kind === kind ? now : { section, kind });
    };
    const scrolled = () => { frame ||= requestAnimationFrame(read); };
    scroller.addEventListener("scroll", scrolled, { passive: true });
    return () => { resized.disconnect(); scroller.removeEventListener("scroll", scrolled); cancelAnimationFrame(frame); };
  }, []);
  return (
    <div className="ds-page" ref={page}>
      <header className="ds-bar" ref={bar}>
        <strong>Atlaswork design system</strong>
        <nav aria-label="Sections">{sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={place.section === id || undefined}>{label}</a>)}</nav>
        <select className="ds-jump" aria-label="Jump to a section" value={place.kind || place.section} onChange={(event) => document.getElementById(event.target.value)?.scrollIntoView()}>
          {sections.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          <optgroup label="Widgets">{Object.entries(widgetKinds).map(([kind, { label }]) => <option key={kind} value={`widget-${kind}`}>{label}</option>)}</optgroup>
        </select>
        <select className="ds-domain" aria-label="Theme" title="Theme: its palette, title face and corners" value={palette} onChange={(event) => setPalette(event.target.value as Session["palette"])}>
          {themes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <Segments label="Mode" value={theme} options={{ light: "Light", dark: "Dark" }} onChange={setTheme} />
        <Segments label="Density" value={density} options={{ comfortable: "Comfortable", compact: "Compact" }} onChange={setDensity} />
        <select className="ds-domain" aria-label="Domain" title="Domain: its hue becomes the accent" value={current} onChange={(event) => actions.switchDomain(event.target.value)}>
          {domains.map((domain) => <option key={domain.name} value={domain.name}>{domain.emoji} {domain.name}</option>)}
        </select>
      </header>
      <main className="ds-main">
        <p className="ds-lede">Every token, part and widget of the system as the app draws it, over the demo workspace. The rules behind them are
          in <code>DESIGN.md</code> and <code>docs/page-design.md</code>; pick a domain to see its hue become the accent.</p>
        <Tokens painted={painted} />
        <Parts />
        <States />
        <Dialogs />
        <WidgetGallery current={place.kind} />
        <Section id="pages" title="Pages" shot={false} lede="Today and a project page, whole: the hero and its garden, the plate, the crew, rituals, the week, the horizon and the shelf; then a masthead with its agent's brief over the project's grid.">
          <h3 className="ds-sub">Today</h3>
          <Frame><OverviewPage /></Frame>
          <h3 className="ds-sub">A project page</h3>
          {/* A project page needs a workspace of its own: one workspace shows one page at a time. */}
          <Workspace seed="demo" place="tab=project:demo-cooking"><Frame><OverviewPage /></Frame></Workspace>
        </Section>
        <Section id="chat" title="Chat" shot={false} lede="The chat panel on the demo's conversation: speaker lines, a proposal with Apply, the composer and its context row.">
          <div className="ds-chat"><ChatPanel where="side" /></div>
        </Section>
      </main>
    </div>
  );
}
