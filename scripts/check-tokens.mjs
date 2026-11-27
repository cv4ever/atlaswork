// Keeps the stylesheets on the design system's tokens (DESIGN.md, src/WarmEditorial.module.css), the values a review
// can't catch by eye. Fails on: a single-length radius in px under 24px (use --radius-*; larger portrait squircles may
// stay raw); a transition or animation duration of 100 to 1000ms (use --motion-*; stagger delays, loops and steps()
// stay raw); a font weight other than 400, 500, 600 or 700; a `font:` shorthand with a px size under 36px (use
// --text-*); a font size under 11px; a gap, padding or margin in px off the spacing grid (even numbers to 24px, then
// multiples of 4; 1px is a hairline); a blurred box-shadow that isn't a --shadow-* token (rings and edges,
// which have no blur, are drawing); a ring round a face or swatch that isn't 2px of panel then 4px of colour, or 3px
// then 5px (a keyframe may swell one); a z-index that isn't a --layer-* token; a colour literal other than black or white, outside a custom property. A block
// that draws an illustration in fixed colours opts out with a `/* token-exempt: <reason> */` comment.
// It also reads the components: a Lucide icon is 12, 14, 16 or 18px, or 24px and up as an illustration.
// It holds each class to one sheet: the first sheet in the cascade that styles a class on its own (`.name`, with or
// without a state) owns it, and a later sheet doing the same is two components sharing a name (CODING_STANDARDS.md,
// "Global class names stay unique") unless it says so in a `/* restyles: .name .other */` comment. Overrides inside
// @media and rules that reach a class through an ancestor are not definitions; a stale `restyles` entry fails too.
// And it keeps one value per colour: DESIGN.md's frontmatter, the landing page's copy of the tokens and the domain
// hues in src/model.ts must match the token file, and an @property's initial-value must be a token's or a domain hue's.
// Usage: node scripts/check-tokens.mjs [file.css…] (default: every stylesheet in src, except the token file, and the design showcase's and admin page's).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const tokenFile = "WarmEditorial.module.css";
// In cascade order: the sheets src/styles.css imports, then the shell's, then the showcase's and the admin page's.
const devPages = [join("dev", "design"), join("dev", "admin"), join("dev", "briefings")];
const files = process.argv.length > 2 ? process.argv.slice(2)
  : [...[...readFileSync(join("src", "styles.css"), "utf8").matchAll(/@import "\.\/styles\/([\w-]+\.css)";/g)].map(([, name]) => join("src", "styles", name)),
    join("src", "WorkbenchShell.css"), ...devPages.flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith(".css")).map((name) => join(dir, name)))];

const blackOrWhite = /^#(?:0{3,4}|0{6}|0{8}|f{3,4}|f{6}|f{8}|000[0-9a-f]|0{6}[0-9a-f]{2}|fff[0-9a-f]|f{6}[0-9a-f]{2})$/i;
const outsideCalc = (value) => value.replace(/calc\((?:[^()]|\([^()]*\))*\)/g, "");
const shadowLayers = (value) => { const out = [""]; let depth = 0; for (const char of value) { if (char === "(") depth++; if (char === ")") depth--; if (char === "," && !depth) out.push(""); else out[out.length - 1] += char; } return out.map((layer) => layer.trim().replace(/\s+/g, " ")); };
const blurred = (layer) => { const lengths = layer.replace(/^inset /, "").split(/ (?=[#a-z])/)[0].split(" "); return lengths.length >= 3 && parseFloat(lengths[2]) > 0; };
const onGrid = (px) => px <= 1 || (px <= 24 ? px % 2 === 0 : px % 4 === 0);
const rules = [
  ["border-radius", (value) => {
    const px = /^(\d+(?:\.\d+)?)px(?:\s*!important)?$/.exec(value);
    return px && Number(px[1]) < 24 && "use a --radius-* token";
  }],
  [/^(?:transition|animation)(?:-duration)?$/, (value) => value.split(/,(?![^()]*\))/)
    .filter((part) => !part.includes("steps("))
    .flatMap((part) => [...outsideCalc(part).matchAll(/(?<![\w.-])(\d+)ms\b/g)])
    .some(([, ms]) => ms >= 100 && ms <= 1000) && "use a --motion-* duration"],
  ["font-weight", (value) => /^\d+$/.test(value) && !["400", "500", "600", "700"].includes(value) && "use 400, 500, 600 or 700"],
  ["font", (value) => {
    const px = /(?:^|\s)(\d+)px/.exec(value);
    return px && Number(px[1]) < 36 && "use a --text-* size";
  }],
  [/^(?:(?:row-|column-)?gap|(?:padding|margin)(?:-[a-z-]+)?)$/, (value) => [...outsideCalc(value).matchAll(/(?<![\w.])-?(\d+(?:\.\d+)?)px/g)]
    .some(([, px]) => !onGrid(Number(px))) && "use the spacing grid: even numbers to 24px, then multiples of 4"],
  ["box-shadow", (value, selector) => !/^(?:\d+%|from|to)$/.test(selector) && shadowLayers(value).some((layer, index, all) => {
    const gap = /^0 0 0 ([\d.]+)px var\(--panel\)$/.exec(layer), colour = /^0 0 0 ([\d.]+)px /.exec(all[index + 1] ?? "");
    return gap && colour && !["2/4", "3/5"].includes(`${gap[1]}/${colour[1]}`);
  }) && "a ring is 2px of panel then 4px of colour, or 3px then 5px"],
  ["box-shadow", (value) => shadowLayers(value).some((layer) => !layer.startsWith("var(") && layer !== "none" && blurred(layer))
    && "use a --shadow-* token; shadows are never coloured"],
  ["z-index", (value) => /\d/.test(value.replace(/var\([^)]*\)/g, "").replace(/\+ 1\b/, "")) && "use a --layer-* token"],
  ["font-size", (value) => {
    const px = /^(\d+)px$/.exec(value);
    return px && Number(px[1]) < 11 && "no text under 11px (DESIGN.md, The Eleven Pixel Floor)";
  }],
];

const problems = [];
/** Class name to the sheets that define it on its own, outside any at-rule, in cascade order. */
const owners = new Map();
/** Sheet to the classes it says it restyles. */
const restyles = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  restyles.set(file, new Set([...text.matchAll(/\/\*\s*restyles:([^*]*)\*\//g)].flatMap(([, names]) => names.match(/[\w-]+/g) ?? [])));
  // Innermost blocks only: a rule inside @media is checked once, as its own block.
  for (const block of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const [, selector, body] = block;
    if (body.includes("token-exempt") || selector.trim().split("\n").pop().trim().startsWith("@property")) continue;
    const line = text.slice(0, block.index + selector.length).split("\n").length;
    // Depth 0 means no enclosing at-rule: every `{` before this block has closed.
    const before = text.slice(0, block.index).replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\("data:[^"]*"\)/g, "");
    if (before.split("{").length === before.split("}").length) {
      // Split at top-level commas only: a class listed inside `.page :is(.a, .b)` is scoped by its ancestor, not
      // defined; a selector that starts with `:is(.a, .b)` styles each of them on its own.
      const parts = selector.replace(/\/\*[\s\S]*?\*\//g, "").split(/,(?![^()]*\))/)
        .flatMap((part) => { const list = /^\s*:is\(([^()]*)\)(\S*)\s*$/.exec(part); return list ? list[1].split(",").map((name) => name + list[2]) : [part]; });
      for (const part of parts) {
        const own = /^\.([\w-]+)(?:::?[\w-]+(?:\([^)]*\))?|\[[^\]]*\])*$/.exec(part.trim());
        if (own) owners.set(own[1], (owners.get(own[1]) ?? new Set()).add(file));
      }
    }
    for (const declaration of body.replace(/url\("data:[^"]*"\)/g, "url()").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon < 0) continue;
      const property = declaration.slice(0, colon).replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const value = declaration.slice(colon + 1).trim();
      if (property.startsWith("--")) continue;
      for (const [name, test] of rules) {
        const applies = typeof name === "string" ? property === name : name.test(property);
        const problem = applies && test(value, selector.trim().split(/\s+/).pop());
        if (problem) problems.push(`${file}:${line} ${property}: ${value} (${problem})`);
      }
      for (const [hex] of value.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
        if (!blackOrWhite.test(hex)) problems.push(`${file}:${line} ${property}: ${hex} (use a colour token, or mark an illustration block token-exempt)`);
      }
    }
  }
}
for (const [name, sheets] of owners) {
  const [owner, ...others] = sheets;
  for (const sheet of others) {
    if (!restyles.get(sheet).has(name)) problems.push(`${sheet} styles .${name}, which ${owner} owns (rename it, move the rule there, or add it to this sheet's \`/* restyles: … */\` comment)`);
  }
}
for (const [sheet, names] of restyles) {
  for (const name of names) {
    const sheets = [...(owners.get(name) ?? [])];
    if (sheets.indexOf(sheet) < 1) problems.push(`${sheet} says it restyles .${name}, but ${sheets.length ? "it owns that class or never styles it on its own" : "no sheet defines that class"}`);
  }
}
// Icons: every `size` on a component imported from lucide-react (or passed on as `Icon` or `Glyph`).
if (process.argv.length <= 2) {
  for (const file of ["src", ...devPages].flatMap((dir) => readdirSync(dir).filter((name) => name.endsWith(".tsx")).map((name) => join(dir, name)))) {
    const text = readFileSync(file, "utf8");
    const icons = new Set(["Icon", "Glyph", ...[...text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)]
      .flatMap(([, names]) => names.split(",").map((name) => name.trim().split(" as ").pop()))]);
    for (const [tag, name, , sizes] of text.matchAll(/<([A-Z]\w*)\b([^<>]*?)\bsize=\{([^}]*)\}/g)) {
      if (!icons.has(name)) continue;
      for (const [size] of sizes.matchAll(/\b\d+\b/g)) {
        if (![12, 14, 16, 18].includes(Number(size)) && Number(size) < 24)
          problems.push(`${file}:${text.slice(0, text.indexOf(tag)).split("\n").length} <${name} size={${sizes}}> (icons are 12, 14, 16 or 18px)`);
      }
    }
  }
}
// One value per colour. DESIGN.md calls the default accent forest; a `-dark` name is the dark theme's value.
if (process.argv.length <= 2) {
  const tokens = readFileSync(join("src", tokenFile), "utf8");
  const declared = (block) => Object.fromEntries([...(block ?? "").matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,8})\b/gi)].map(([, name, value]) => [name, value.toLowerCase()]));
  const light = declared(/\.skin \{([^}]*)\}/.exec(tokens)?.[1]);
  const dark = declared(/\.skin\[data-theme="dark"\] \{([^}]*)\}/.exec(tokens)?.[1]);
  const hues = Object.fromEntries([...(/domainHues[^{]*\{([^}]*)\}/.exec(readFileSync(join("src", "model.ts"), "utf8"))?.[1] ?? "").matchAll(/(\w+):\s*"(#[0-9a-f]{6})"/gi)]
    .map(([, name, value]) => [name.toLowerCase(), value.toLowerCase()]));
  const forest = { forest: "skin-accent", "forest-ink": "accent-ink", "forest-soft": "accent-soft", "forest-hover": "accent-hover" };
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync("DESIGN.md", "utf8"))?.[1] ?? "";
  for (const [, name, value] of (/\ncolors:\r?\n((?:  .*\r?\n)*)/.exec(frontmatter)?.[1] ?? "").matchAll(/^  ([\w-]+): "(#[0-9a-f]{3,8})"/gim)) {
    const inDark = name.endsWith("-dark");
    const base = inDark ? name.slice(0, -5) : name;
    const actual = base.startsWith("domain-") ? hues[base.slice(7)] : (inDark ? dark : light)[`--${forest[base] ?? base}`];
    if (actual !== value.toLowerCase()) problems.push(`DESIGN.md colors.${name}: ${value} (the ${base.startsWith("domain-") ? "domain hue in src/model.ts" : "token"} is ${actual ?? "missing"})`);
  }
  for (const page of readdirSync("landing").filter((name) => name.endsWith(".html"))) {
    for (const [name, value] of Object.entries(declared(/:root \{([^}]*)\}/.exec(readFileSync(join("landing", page), "utf8"))?.[1]))) {
      const actual = light[name === "--accent" ? "--skin-accent" : name];
      if (actual && actual !== value) problems.push(`landing/${page} ${name}: ${value} (the token is ${actual})`);
    }
  }
  // An @property's initial-value must be a literal, so it can't name a token; it must still be a token's or a domain hue's value.
  const known = new Set([...Object.values(light), ...Object.values(dark), ...Object.values(hues)]);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const rule of text.matchAll(/@property\s+(--[\w-]+)\s*\{[^}]*initial-value:\s*(#[0-9a-f]{3,8})\b/gi)) {
      if (!known.has(rule[2].toLowerCase())) problems.push(`${file}:${text.slice(0, rule.index).split("\n").length} @property ${rule[1]} initial-value: ${rule[2]} (use a token's or a domain hue's value)`);
    }
  }
}
if (problems.length) {
  console.error(`Values off the design system's tokens (DESIGN.md):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
