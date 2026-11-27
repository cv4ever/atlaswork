// The themes and surface names that Settings' Appearance and Canvas pages and the search dialog's commands share.
// A theme's colours, title face and corners live in WarmEditorial.module.css (`[data-palette]`); here it names its
// own canvas, sidebar and chat rail, which picking it sets and the Canvas page can change afterwards, and its emblem
// family (emblemFamilies.ts), which Emblems' "Theme" follows: Fluent Flat, or Mono for the quiet themes.
import type { EmblemFamily } from "../emblemFamilies.ts";
import type { Session } from "../session.ts";

/** Canvas patterns, by the words Settings shows. Each is a mask in WorkbenchShell.css, picked by `data-canvas` or `data-pattern`. */
export const backgrounds = [["contours", "Contours"], ["linen", "Linen"], ["waves", "Waves"], ["tiles", "Tiles"], ["blossoms", "Blossoms"],
  ["grid", "Dot grid"], ["daisies", "Daisies"], ["stars", "Stars"], ["beans", "Beans"], ["terrazzo", "Terrazzo"], ["doodles", "Doodles"],
  ["aurora", "Aurora"], ["plain", "Plain"]] as const satisfies readonly (readonly [Session["canvas"], string])[];
export const sidebars = ["paper", "sage", "sunrise", "glass", "ink"] as const;

/** The chat rail's surfaces (agents-design D13), by the words Settings shows. */
export const rails = [["vine", "Vine"], ["ink", "Ink"], ["tray", "Seed tray"], ["hue", "Chat colour"], ["plain", "Plain"]] as const;

export type Theme = { id: Session["palette"]; name: string; line: string; surfaces: Pick<Session, "canvas" | "sidebarStyle" | "railStyle">;
  emblems: EmblemFamily };
export const themes: Theme[] = [
  { id: "garden", name: "Garden", line: "Forest on cream", surfaces: { canvas: "contours", sidebarStyle: "paper", railStyle: "vine" }, emblems: "flat" },
  { id: "linen", name: "Linen", line: "Ink and vermilion", surfaces: { canvas: "linen", sidebarStyle: "paper", railStyle: "plain" }, emblems: "flat" },
  { id: "tide", name: "Tide", line: "Harbour blue", surfaces: { canvas: "waves", sidebarStyle: "sage", railStyle: "vine" }, emblems: "flat" },
  { id: "terracotta", name: "Terracotta", line: "Burnt orange, olive", surfaces: { canvas: "tiles", sidebarStyle: "sunrise", railStyle: "tray" }, emblems: "flat" },
  { id: "dusk", name: "Dusk", line: "Plum and rose", surfaces: { canvas: "blossoms", sidebarStyle: "sunrise", railStyle: "hue" }, emblems: "flat" },
  { id: "frost", name: "Frost", line: "Cobalt, sans titles", surfaces: { canvas: "grid", sidebarStyle: "glass", railStyle: "plain" }, emblems: "mono" },
  { id: "meadow", name: "Meadow", line: "Grass and sunflower", surfaces: { canvas: "daisies", sidebarStyle: "sage", railStyle: "tray" }, emblems: "flat" },
  { id: "midnight", name: "Midnight", line: "Amber on night blue", surfaces: { canvas: "stars", sidebarStyle: "paper", railStyle: "ink" }, emblems: "flat" },
  { id: "espresso", name: "Espresso", line: "Copper on coffee", surfaces: { canvas: "beans", sidebarStyle: "paper", railStyle: "tray" }, emblems: "flat" },
  { id: "graphite", name: "Graphite", line: "Black, grey, violet", surfaces: { canvas: "plain", sidebarStyle: "paper", railStyle: "plain" }, emblems: "mono" },
  { id: "violet", name: "Violet", line: "Violet on cool grey", surfaces: { canvas: "grid", sidebarStyle: "paper", railStyle: "plain" }, emblems: "mono" },
  { id: "paper", name: "Paper", line: "Warm grey, serif titles", surfaces: { canvas: "plain", sidebarStyle: "paper", railStyle: "plain" }, emblems: "mono" },
];

/** What picking a theme sets: its palette and its own surfaces. */
export const themeSettings = (theme: Theme): Pick<Session, "palette" | "canvas" | "sidebarStyle" | "railStyle"> => ({ palette: theme.id, ...theme.surfaces });

/** The emblem family a choice draws: its own, or with "theme" the palette's. */
export const emblemFamilyOf = (emblems: Session["emblems"], palette: Session["palette"]): EmblemFamily =>
  emblems !== "theme" ? emblems : themes.find((theme) => theme.id === palette)?.emblems ?? "flat";
