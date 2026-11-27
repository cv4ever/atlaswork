// How people, agents and projects look: portraits and pictures, free agent names, the plant's stages, project
// colours and inks, domain emoji, and a domain's hue.
import type { Agent, WorkspaceData, Project, Domain } from "./model.ts";

/** Homebase's cast first, then illustrated portraits and neutral silhouettes (agents-design D16). */
export const portraits = ["hearth", "vital", "kin", "ledger", "compass", "spark", "muse", "scout", "quill", "forge",
  "gardener", "coach", "bookkeeper", "scholar", "chef", "traveler", "artist", "musician", "mentor", "guide", "homekeeper", "planner", "helm", "counsel",
  "mei", "cedar", "anika", "sylvie", "rami", "rowan", "amara", "hiro", "finn", "lina", "noor", "mateo",
  "imani", "ellis", "arjun", "zuri", "owen", "yuna", "clara", "malik", "vera", "minh", "eden", "hugo",
  "silhouette-pine", "silhouette-clay", "silhouette-navy", "silhouette-plum", "silhouette-ochre", "silhouette-teal"];

/**
 * Crew styles (agents-design D16): packs that redraw every portrait and Atlas in another style, chosen for the whole
 * crew in Settings → Appearance. Storybook is the original set; the rest live in `public/agents/<style>/`. The six
 * silhouettes stay as they are in every style.
 */
export const crewStyles = [
  { id: "storybook", label: "Storybook", hint: "Gouache and ink" },
  { id: "manga", label: "Manga", hint: "Anime cel shading" },
  { id: "heroes", label: "Heroes", hint: "Masks, capes, halftone" },
  { id: "villains", label: "Villains", hint: "The heroes' dark twins" },
  { id: "pixel", label: "Pixel", hint: "16-bit game portraits" },
  { id: "animals", label: "Animals", hint: "Fox, owl and friends" },
  { id: "ink", label: "Ink", hint: "Black line, no colour" },
  { id: "clay", label: "Clay", hint: "Stop-motion plasticine" },
  { id: "fantasy", label: "Fantasy", hint: "A guild in cloaks" },
] as const;
export type CrewStyle = (typeof crewStyles)[number]["id"];
const redrawn = new Set(["atlas", ...portraits.filter((portrait) => !portrait.startsWith("silhouette-"))]);
/** A portrait's picture in a crew style; components draw the crew's own style with `usePortraitSrc` (crewStyle.ts). */
export const portraitSrc = (agent: Pick<Agent, "portrait">, style: CrewStyle = "storybook") =>
  style !== "storybook" && redrawn.has(agent.portrait) ? `/agents/${style}/${agent.portrait}.webp`
  : agent.portrait === "atlas" ? "/atlas.webp" : `/agents/${agent.portrait}.webp`;

/** Names a new agent can start with; `skip` steps past ones you passed on. */
export const agentNames = ["Juniper", "Remy", "Mei", "Wren", "Otto", "Ines", "Theo", "Nova", "Kai", "Lumi", "Basil", "Ada", "Rio", "Sage", "Tove", "Ezra"];
export function freeName(data: Pick<WorkspaceData, "agents">, skip = "") {
  const taken = new Set(data.agents.map((agent) => agent.name.toLocaleLowerCase()));
  const free = agentNames.filter((name) => !taken.has(name.toLocaleLowerCase()));
  return free[(free.indexOf(skip) + 1) % free.length] ?? "";
}

/**
 * The profile picture: the name's first letter on the accent colour, as an image so it styles like a portrait. Without
 * a name it's a head-and-shoulders figure, so the sidebar never shows an empty dot.
 */
export const profileAvatar = (name: string, hue = "#416b57") => {
  const letter = (name.trim()[0] ?? "").toLocaleUpperCase().replace(/[<&]/g, "");
  const face = letter
    ? `<text x="32" y="42" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="#fffdf8">${letter}</text>`
    : `<circle cx="32" cy="25" r="10" fill="#fffdf8" opacity=".92"/><path d="M13 56c2-11 10-17 19-17s17 6 19 17" fill="#fffdf8" opacity=".92"/>`;
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${hue.replace(/[^#\w]/g, "")}"/>${face}</svg>`)}`;
};

/** A plant grows with progress: a project's finished steps (Pace `stageOf`) and how much of your profile is filled in.
 * Plant.tsx draws each stage. */
export const plantStages = [
  { label: "Just planted" }, { label: "Sprouting" }, { label: "Growing" }, { label: "In bloom" },
];

/** A project's colours (`Project.color`); "pine" is the skin's accent. */
export const projectColours = ["pine", "sage", "clay", "ochre"] as const;
export type ProjectColour = (typeof projectColours)[number];

/** A project's colour as a CSS value; "pine" is the skin's accent. */
export const projectInk = (project: Project) => `var(--${project.color === "pine" ? "accent" : project.color})`;

/**
 * The colour a new project in `area` takes: the one its live projects there use least, counting `also` (projects made
 * in the same proposal), the first in `projectColours` on a tie.
 */
export function quietestColour(projects: Project[], area: string, also: Project[] = []): ProjectColour {
  const there = [...projects.filter((project) => !project.archived && project.area === area), ...also];
  const used = (colour: string) => there.filter((project) => project.color === colour).length;
  return projectColours.reduce((best, colour) => used(colour) < used(best) ? colour : best);
}
export const domainEmoji = ["☀️", "🌿", "🏡", "🪙", "🧭", "🌱", "📚", "🎨", "🏃", "🧘", "🍳", "✈️", "🎵", "💛", "🛠️", "🏢", "🌙", "🐾"];

export const hueOf = (domain: Domain) => domain.hue || "var(--skin-accent)";

/** The Account tab's plan line, from `public.entitlements`: what you have and, on a trial, how long it lasts. */
export function planLine(plan: "trial" | "pro" | "free", trialEndsAt: string | null, now: Date) {
  if (plan === "pro") return { label: "Pro", detail: "Live agents on our hosted model.", stage: plantStages[3] };
  const days = trialEndsAt ? Math.ceil((Date.parse(trialEndsAt) - now.getTime()) / 86_400_000) : 0;
  if (plan === "trial" && days > 0) return { label: `Pro trial, ${days} ${days === 1 ? "day" : "days"} left`, detail: "Live agents on our hosted model until then.", stage: plantStages[1] };
  return { label: plan === "trial" ? "Trial ended" : "Free", detail: "Agents answer through your own AI model; connect one in Settings → AI model.", stage: plantStages[0] };
}
