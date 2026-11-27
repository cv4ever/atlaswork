// Keeps `.impeccable/design.json`, the sidecar Impeccable's live panel and skill read beside DESIGN.md, on DESIGN.md
// and the token file. Fails when the sidecar disagrees with what can be derived:
// - colorMeta: one entry per frontmatter colour, in its order, its canonical the frontmatter's value and its tonal ramp
//   the eight OKLCH steps derived from it (lightness 15 to 95%, chroma eased near black and white); role and display
//   name are written by hand, so a new colour fails until they are filled in;
// - typographyMeta: one entry per frontmatter typography token;
// - shadows and motion: a name that is a custom property in src/WarmEditorial.module.css carries its value;
// - narrative: the north star, overview, key characteristics, named rules and do's and don'ts, word for word.
// Components, breakpoints and purposes stay hand-written. Usage: node scripts/check-design-sidecar.mjs [--fix]
// (`--fix` rewrites what it can derive, keeps the rest, and stamps generatedAt).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const sidecarPath = join(".impeccable", "design.json");
const fix = process.argv.includes("--fix");
const design = readFileSync("DESIGN.md", "utf8").replace(/\r\n/g, "\n");
const sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
const tokens = readFileSync(join("src", "WarmEditorial.module.css"), "utf8");
const [, frontmatter = "", body = ""] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(design) ?? [];

/** The `  name:` keys under a top-level frontmatter group, with a scalar value when the key has one. */
const group = (name) => [...(new RegExp(`(?:^|\\n)${name}:\\n((?:  .*\\n?)*)`).exec(frontmatter)?.[1] ?? "").matchAll(/^  ([\w-]+):\s*(?:"([^"]*)")?/gm)]
  .map(([, key, value]) => [key, value]);
const colors = group("colors");
const typography = group("typography").map(([key]) => key);

// OKLCH from sRGB hex (Björn Ottosson's matrices), then the eight-step ramp the sidecar has always carried.
const oklch = (hex) => {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const [l, m, s] = [
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b,
  ].map(Math.cbrt);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { chroma: Math.hypot(a, bb), hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
};
const ramp = (hex) => {
  const { chroma, hue } = oklch(hex);
  return [15, 26, 38, 50, 62, 74, 86, 95].map((lightness, step) => `oklch(${lightness}% ${(chroma * [0.4, 0.7, 1, 1, 1, 1, 0.7, 0.4][step]).toFixed(4)} ${hue.toFixed(2)})`);
};

// DESIGN.md's prose by `## ` section, and the sidecar section tag each one's named rules carry.
const sections = new Map();
let current;
for (const line of body.split("\n")) {
  if (line.startsWith("## ")) sections.set((current = line.slice(3).trim()), []);
  else if (current) sections.get(current).push(line);
}
const tags = { Overview: "overview", Colors: "colors", Typography: "typography", Layout: "layout", "Elevation & Depth": "elevation", Shapes: "shapes", Components: "components", "Do's and Don'ts": "dos" };
const overview = (sections.get("Overview") ?? []).join("\n");
const keyAt = overview.indexOf("**Key Characteristics:**");
const rules = [];
for (const [name, lines] of sections) {
  for (let at = 0; at < lines.length; at++) {
    const rule = /^\*\*(The [^*]+?)\.\*\*\s*(.*)$/.exec(lines[at].trim());
    if (!rule) continue;
    const text = [rule[2]];
    while (lines[at + 1]?.trim() && !/^(?:- |#|\*\*)/.test(lines[at + 1])) text.push(lines[++at].trim());
    rules.push({ name: rule[1], body: text.join("\n"), section: tags[name] ?? name.toLowerCase() });
  }
}
const advice = (sections.get("Do's and Don'ts") ?? []).filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim());
const narrative = {
  northStar: /\*\*Creative North Star: "([^"]+)"\*\*/.exec(overview)?.[1],
  overview: (keyAt < 0 ? overview : overview.slice(0, keyAt)).split("\n\n").map((part) => part.trim()).filter((part) => part && !part.includes("Creative North Star")).join("\n\n"),
  keyCharacteristics: keyAt < 0 ? [] : overview.slice(keyAt).split("\n").filter((line) => line.startsWith("- ")).map((line) => line.slice(2).trim()),
  rules,
  dos: advice.filter((line) => line.startsWith("**Do**")),
  donts: advice.filter((line) => line.startsWith("**Don't**")),
};

const problems = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ext = sidecar.extensions ?? (sidecar.extensions = {});

const oldColors = ext.colorMeta ?? {};
const colorMeta = Object.fromEntries(colors.map(([name, value]) => {
  const old = oldColors[name] ?? {};
  const derived = { ...old, canonical: value, tonalRamp: /^#[0-9a-f]{6}$/i.test(value) ? ramp(value) : old.tonalRamp };
  if (!same(old, derived)) problems.push(`colorMeta.${name}: ${oldColors[name] ? "canonical or tonal ramp differs from DESIGN.md" : "missing"}`);
  if (!derived.role || !derived.displayName) problems.push(`colorMeta.${name}: write its role and displayName by hand`);
  return [name, derived];
}));
for (const name of Object.keys(oldColors)) if (!colors.some(([key]) => key === name)) problems.push(`colorMeta.${name}: not a DESIGN.md colour`);
if (same(Object.keys(oldColors).sort(), Object.keys(colorMeta).sort()) && !same(Object.keys(oldColors), Object.keys(colorMeta))) problems.push("colorMeta: not in DESIGN.md's colour order");

const oldTypography = ext.typographyMeta ?? {};
const typographyMeta = Object.fromEntries(typography.map((name) => [name, oldTypography[name] ?? {}]));
for (const name of typography) if (!oldTypography[name]?.displayName) problems.push(`typographyMeta.${name}: missing; write its displayName and purpose by hand`);
for (const name of Object.keys(oldTypography)) if (!typography.includes(name)) problems.push(`typographyMeta.${name}: not a DESIGN.md typography token`);

const cssValue = (name) => new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)?.[1].trim().replace(/\s+/g, " ");
for (const kind of ["shadows", "motion"]) {
  for (const entry of ext[kind] ?? []) {
    const value = cssValue(entry.name);
    if (value === undefined || value === entry.value) continue;
    problems.push(`${kind}.${entry.name}: ${entry.value} (the token is ${value})`);
    entry.value = value;
  }
}

for (const [key, value] of Object.entries(narrative)) {
  if (!same(sidecar.narrative?.[key], value)) problems.push(`narrative.${key}: differs from DESIGN.md`);
}

if (!problems.length) process.exit(0);
if (fix) {
  ext.colorMeta = colorMeta;
  ext.typographyMeta = typographyMeta;
  sidecar.narrative = { ...sidecar.narrative, ...narrative };
  sidecar.generatedAt = new Date().toISOString();
  writeFileSync(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`);
  const left = problems.filter((problem) => problem.includes("by hand"));
  console.log(`Rewrote ${sidecarPath} from DESIGN.md and the token file.`);
  if (left.length) {
    console.error(`Still to write by hand:\n  ${left.join("\n  ")}`);
    process.exit(1);
  }
  process.exit(0);
}
console.error(`${sidecarPath} disagrees with DESIGN.md (node scripts/check-design-sidecar.mjs --fix rewrites what it can):\n  ${problems.join("\n  ")}`);
process.exit(1);
