// The emblem drawings (src/emblemFamilies.ts), made from the Iconify sets in devDependencies at dev and build time
// rather than committed as thousands of files: /emblems/flat/<key>.svg (Fluent Flat), /emblems/mono/<key>.svg (Fluent's
// high-contrast set, used as a mask in the place's colour) and /emblems/line/<key>.svg (Lucide, only `lineIcons`).
// An emoji's set name is its Unicode slug (unicode-emoji-json); the emoji a set lacks get no file, and
// `virtual:emblems` tells src/Emblem.tsx which keys each family has. The dev server serves the files; a build emits
// them as assets, kept out of the service worker's precache (vite.config.ts) and cached when first shown.
import { createRequire } from "node:module";
import type { Plugin } from "vite";
import { emblemKey, lineIcons } from "../src/emblemFamilies.ts";

type IconSet = { icons: Record<string, { body: string; width?: number; height?: number }>; aliases?: Record<string, { parent: string }>;
  width?: number; height?: number };
const require = createRequire(import.meta.url);
const load = (name: string) => require(`@iconify-json/${name}/icons.json`) as IconSet;

function svgOf(set: IconSet, name: string) {
  const icon = set.icons[name] ?? set.icons[set.aliases?.[name]?.parent ?? ""];
  if (!icon) return undefined;
  const width = icon.width ?? set.width ?? 16, height = icon.height ?? set.height ?? 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`;
}

type Drawings = { files: Map<string, string>; covered: Record<"flat" | "mono", string[]> };

/** Every drawing by its path under /emblems/, and the keys each emoji family covers. */
function drawings(): Drawings {
  const files = new Map<string, string>();
  const covered: Drawings["covered"] = { flat: [], mono: [] };
  const emoji = require("unicode-emoji-json/data-by-emoji.json") as Record<string, { slug: string }>;
  const sets = { flat: load("fluent-emoji-flat"), mono: load("fluent-emoji-high-contrast") };
  for (const [char, { slug }] of Object.entries(emoji)) {
    const key = emblemKey(char);
    for (const family of ["flat", "mono"] as const) {
      const svg = svgOf(sets[family], slug.replaceAll("_", "-"));
      if (svg && !files.has(`${family}/${key}.svg`)) { files.set(`${family}/${key}.svg`, svg); covered[family].push(key); }
    }
  }
  const lucide = load("lucide");
  for (const [char, name] of Object.entries(lineIcons)) {
    const svg = svgOf(lucide, name);
    if (!svg) throw new Error(`emblemFamilies.ts lineIcons: Lucide has no "${name}" (for ${char})`);
    files.set(`line/${emblemKey(char)}.svg`, svg);
  }
  return { files, covered };
}

export function emblemAssets(): Plugin {
  let made: Drawings | undefined;
  const get = () => made ??= drawings();
  return {
    name: "atlaswork-emblems",
    resolveId: (id) => id === "virtual:emblems" ? "\0virtual:emblems" : undefined,
    load(id) {
      if (id !== "\0virtual:emblems") return undefined;
      const { covered } = get();
      return `export const flat = new Set(${JSON.stringify(covered.flat.join(" "))}.split(" "));\n`
        + `export const mono = new Set(${JSON.stringify(covered.mono.join(" "))}.split(" "));\n`;
    },
    configureServer(server) {
      server.middlewares.use("/emblems/", (request, response, next) => {
        const svg = get().files.get(decodeURIComponent((request.url ?? "").slice(1).split("?")[0]));
        if (!svg) return next();
        response.setHeader("Content-Type", "image/svg+xml");
        response.setHeader("Cache-Control", "max-age=86400");
        response.end(svg);
      });
    },
    generateBundle() {
      for (const [path, svg] of get().files) this.emitFile({ type: "asset", fileName: `emblems/${path}`, source: svg });
    },
  };
}
