// The Skin module: one painter owns cached startup, saved Session choices, temporary preview precedence, system-theme
// changes, theme colour, Domain hue, the emblem family and preview scroll restoration. Preview scroll never reaches
// Workbench persistence. main.tsx restores startup paint; App.tsx supplies saved choices and preview events.
import { emblemFamilyOf } from "./dialogs/themes.ts";
import type { Session } from "./session.ts";
import { initialSession } from "./session.ts";
import warmEditorial from "./WarmEditorial.module.css";

export type Look = Pick<Session, "palette" | "canvas" | "sidebarStyle" | "railStyle" | "emblems" | "theme" | "density">;
type Paint = Look & { daypart: string; hue: string };
const root = document.documentElement;
const media = matchMedia("(prefers-color-scheme: dark)");
let saved: Paint = { palette: initialSession.palette, canvas: initialSession.canvas, sidebarStyle: initialSession.sidebarStyle,
  railStyle: initialSession.railStyle, emblems: initialSession.emblems, theme: initialSession.theme, density: initialSession.density,
  daypart: "day", hue: "" };
let patch: Partial<Look> = {};
let previewing = false;
let scroll = 0;
let scroller: HTMLElement | null = null;
let frame = 0;
let theme: "light" | "dark" = media.matches ? "dark" : "light";
const listeners = new Set<() => void>();
let painted = "";
const holding = new WeakMap<HTMLElement, number>();

/**
 * Holds CSS transitions inside `scope` for this frame and the next (`data-switching`, WorkbenchShell.css). A new look
 * or a new page changes hundreds of elements at once; letting their colour and size transitions play would restyle
 * and repaint them every frame for the transitions' whole duration. Keyframe animations, such as a page's entrance,
 * still play. Scope it to what changes: marking the root restyles the whole document twice.
 */
function holdTransitions(scope: HTMLElement = root) {
  scope.dataset.switching = "";
  cancelAnimationFrame(holding.get(scope) ?? 0);
  holding.set(scope, requestAnimationFrame(() => holding.set(scope, requestAnimationFrame(() => { delete scope.dataset.switching; }))));
}

/** The only document painter. Preview choices never become the startup cache. */
function paint() {
  const look = { ...saved, ...patch };
  const resolved = look.theme === "system" ? (media.matches ? "dark" : "light") : look.theme;
  const emblems = emblemFamilyOf(look.emblems, look.palette);
  const key = [resolved, look.palette, look.canvas, look.sidebarStyle, look.railStyle, emblems, look.density, look.daypart, look.hue].join("|");
  if (key === painted) return;
  // A new look recolours every surface at once; only the theme dial keeps turning.
  if (painted) holdTransitions();
  painted = key;
  root.classList.add(warmEditorial.skin);
  root.dataset.skin = "warm-editorial";
  root.dataset.theme = resolved;
  root.dataset.palette = look.palette;
  root.dataset.canvas = look.canvas;
  root.dataset.sidebar = look.sidebarStyle;
  root.dataset.rail = look.railStyle;
  root.dataset.emblems = emblems;
  root.dataset.density = look.density;
  root.dataset.daypart = look.daypart;
  if (look.hue) root.dataset.domainHue = "";
  else delete root.dataset.domainHue;
  root.style.setProperty("--domain-hue", look.hue);
  // The browser's bar takes the theme's own canvas colour, read back from its tokens.
  root.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--canvas").trim());
  if (theme !== resolved) {
    theme = resolved;
    for (const listener of listeners) listener();
  }
}

/** Browser painting and preview lifetime. Workbench remains the owner of saved Session choices and scroll. */
export const skin = {
  restoreStartup() {
    try {
      const cached = JSON.parse(localStorage.getItem("look") ?? "{}");
      if (cached && typeof cached === "object") {
        const { palette, canvas, sidebar, rail, emblems, theme, density, daypart, hue } = cached;
        saved = { palette: palette ?? saved.palette, canvas: canvas ?? saved.canvas, sidebarStyle: sidebar ?? saved.sidebarStyle,
          railStyle: rail ?? saved.railStyle, emblems: emblems ?? saved.emblems, theme: theme ?? saved.theme, density: density ?? saved.density,
          daypart: daypart ?? saved.daypart, hue: hue ?? "" };
      }
    } catch { /* blocked or corrupt: use the system theme and default look */ }
    paint();
  },
  /** `remember` caches the look for the next startup paint; the design showcase paints without it. */
  apply(look: Look & Pick<Session, "followDaypart">, daypart: string, hue = "", remember = true) {
    saved = { palette: look.palette, canvas: look.canvas, sidebarStyle: look.sidebarStyle, railStyle: look.railStyle, emblems: look.emblems,
      theme: look.theme, density: look.density, daypart: look.followDaypart ? daypart : "day", hue };
    if (remember) try {
      localStorage.setItem("look", JSON.stringify({ palette: saved.palette, canvas: saved.canvas, sidebar: saved.sidebarStyle,
        rail: saved.railStyle, emblems: saved.emblems, theme: saved.theme, density: saved.density, daypart: saved.daypart, hue }));
    } catch { /* blocked: the current look still paints; startup uses defaults */ }
    paint();
  },
  preview(next: Partial<Look> = {}, content: HTMLElement | null = null) {
    cancelAnimationFrame(frame);
    const temporary = Object.keys(next).length > 0;
    if (temporary && !previewing) {
      scroller = content;
      scroll = content?.scrollTop ?? 0;
    }
    const restoring = !temporary && previewing;
    patch = next;
    previewing = temporary || restoring;
    paint();
    if (restoring) {
      scroller?.scrollTo({ top: scroll });
      frame = requestAnimationFrame(() => { previewing = false; scroller = null; });
    }
  },
  rememberScroll(content: HTMLElement, remember: (top: number) => void) {
    if (!previewing) remember(content.scrollTop);
  },
  /** A new page is about to draw over the old one: its reused elements change at once, without transitions. */
  holdTransitions,
  getTheme: () => theme,
  subscribe(listener: () => void) {
    if (!listeners.size) media.addEventListener("change", paint);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) media.removeEventListener("change", paint);
    };
  },
};
