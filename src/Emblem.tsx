// A domain's or topic's emblem (emblemFamilies.ts): its emoji as text, which styles/emblems.css swaps for the drawing
// of the family the root's `data-emblems` names, when that family draws this emoji. The glyph stays in the text, so
// copying, search and screen readers keep the emoji, and a family that lacks it shows the device's own.
import type { CSSProperties } from "react";
import { flat, mono } from "virtual:emblems";
import { emblemKey, lineIconByKey } from "./emblemFamilies.ts";
import type { EmblemFamily } from "./emblemFamilies.ts";

/** `family` draws this one in a given family whatever the setting: Settings' samples. */
export function Emblem({ emoji, family }: { emoji?: string; family?: EmblemFamily }) {
  if (!emoji) return null;
  const key = emblemKey(emoji);
  const hasFlat = flat.has(key), hasMono = mono.has(key), hasLine = lineIconByKey.has(key);
  const style = {
    "--emblem-flat": hasFlat ? `url("/emblems/flat/${key}.svg")` : undefined,
    "--emblem-mono": hasMono ? `url("/emblems/mono/${key}.svg")` : undefined,
    "--emblem-line": hasLine ? `url("/emblems/line/${key}.svg")` : hasMono ? `url("/emblems/mono/${key}.svg")` : undefined,
  } as CSSProperties;
  return (
    <span className="emblem" data-family={family} data-flat={hasFlat || undefined} data-mono={hasMono || undefined}
      data-line={hasLine || hasMono || undefined} style={style}>{emoji}</span>
  );
}
