// How a domain's or topic's emblem is drawn. A record keeps the emoji it was given; Settings → Appearance → Emblems
// (`Session.emblems`) picks one family for every emblem: the device's own emoji, Microsoft's Fluent Flat, Fluent's
// one-colour glyphs in the place's colour (Mono), or the app's own Lucide line icons (Line). A theme names its family
// (dialogs/themes.ts), which "Theme" follows. dev/emblemAssets.ts makes the drawings served at /emblems/<family>/<key>.svg;
// src/Emblem.tsx draws one, and an emoji a family lacks stays the device's (Line falls back to Mono first).

export type EmblemFamily = "device" | "flat" | "mono" | "line";

/** The families as Settings lists them: the words, and the line under them. */
export const emblemFamilies: { id: EmblemFamily; name: string; line: string }[] = [
  { id: "device", name: "Device emoji", line: "Your phone's or computer's own emoji." },
  { id: "flat", name: "Fluent Flat", line: "Soft flat colour, the same on every device." },
  { id: "mono", name: "Mono", line: "One colour: the domain's own." },
  { id: "line", name: "Line", line: "The app's line icons, in the domain's colour." },
];

/** An emoji's file name: its code points in hex, without the variation selector (☀ and ☀️ are one emblem). */
export const emblemKey = (emoji: string) =>
  [...emoji].map((char) => char.codePointAt(0)!.toString(16)).filter((point) => point !== "fe0f").join("-");

/**
 * The emoji Line draws, as Lucide icons: the picker's eighteen (look.ts `domainEmoji`) first, then emblems agents and
 * people often choose. Any other emoji falls back to Mono.
 */
export const lineIcons: Record<string, string> = {
  "☀️": "sun", "🌿": "leaf", "🏡": "house", "🪙": "piggy-bank", "🧭": "compass", "🌱": "sprout", "📚": "library", "🎨": "palette",
  "🏃": "footprints", "🧘": "flower-2", "🍳": "chef-hat", "✈️": "plane", "🎵": "music", "💛": "heart", "🛠️": "wrench",
  "🏢": "building-2", "🌙": "moon", "🐾": "paw-print",
  "🏠": "house", "💼": "briefcase", "💪": "dumbbell", "🏋️": "dumbbell", "📷": "camera", "🎒": "backpack", "🎹": "piano", "🎓": "graduation-cap",
  "💰": "piggy-bank", "💵": "banknote", "🧠": "brain", "❤️": "heart", "🌍": "globe", "🎮": "gamepad-2", "🐶": "dog", "🐱": "cat",
  "🚗": "car", "📝": "notebook-pen", "💡": "lightbulb", "🔬": "microscope", "🌸": "flower", "🌳": "trees", "🎯": "target",
  "📖": "book-open", "🎬": "clapperboard", "🍎": "apple", "☕": "coffee", "🧳": "luggage", "🚴": "bike", "👶": "baby", "🎁": "gift",
  "🏥": "hospital", "💻": "laptop", "🏖️": "umbrella", "🎸": "guitar", "📈": "trending-up", "🏆": "trophy", "⭐": "star",
};

/** Line's icons by emblem key, so ☀ and ☀️ find the same one. */
export const lineIconByKey = new Map(Object.entries(lineIcons).map(([emoji, icon]) => [emblemKey(emoji), icon]));
