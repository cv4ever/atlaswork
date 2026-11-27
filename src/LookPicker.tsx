// The look of a domain, topic or project (emblem and colour) behind one button: the record's emblem, or its colour as
// a dot, with a palette badge. Few people change the look, so its choices wait in a popover (progressive disclosure,
// docs/page-design.md); every record dialog uses this one instead of rows of always-open choices.
import type { CSSProperties } from "react";
import { Palette } from "lucide-react";
import { domainEmoji } from "./look.ts";
import { Tip } from "./Popups.tsx";
import { Emblem } from "./Emblem.tsx";

export type LookColour = { value: string; label: string; swatch: string; note?: string };

export function LookPicker({ id, className, emoji, onEmoji, colour, colours, onColour, onOpen }: {
  /** Unique on the page: names the popover and its anchor. */
  id: string;
  /** The button's own class: the domain's seed, or the smaller `look-button`. */
  className: string;
  emoji?: string;
  onEmoji?: (emoji: string) => void;
  colour?: string;
  colours?: LookColour[];
  onColour?: (value: string) => void;
  /** Called each time the popover opens. */
  onOpen?: () => void;
}) {
  const current = colours?.find((item) => item.value === colour);
  const words = [emoji && `emblem ${emoji}`, current && `colour ${current.label}`].filter(Boolean).join(", ");
  const title = emoji && colours ? "Change emblem and colour" : emoji ? "Change emblem" : "Change colour";
  return (
    <>
      <Tip key={emoji} label={title}><button type="button" className={className} popoverTarget={id} style={{ anchorName: `--${id}`, "--swatch": current?.swatch } as CSSProperties}
        aria-label={`${words[0].toUpperCase()}${words.slice(1)}. Change`}>
          {emoji !== undefined ? <Emblem emoji={emoji} /> : <span className="look-dot" aria-hidden="true" />}<Palette size={12} aria-hidden="true" />
        </button></Tip>
      <div id={id} popover="auto" className="look-picker" aria-label={title.replace("Change ", "")} style={{ positionAnchor: `--${id}` } as CSSProperties}
        onToggle={(event) => { if (event.newState === "open") onOpen?.(); }}>
        {onEmoji && <>
          <strong id={`${id}-emblem`}>Emblem</strong>
          <div className="look-emoji" role="radiogroup" aria-labelledby={`${id}-emblem`}>
            {domainEmoji.map((item) => (
              <button key={item} type="button" role="radio" aria-checked={emoji === item} aria-label={item} onClick={() => onEmoji(item)}><Emblem emoji={item} /></button>
            ))}
          </div>
        </>}
        {colours && onColour && <>
          <strong id={`${id}-colour`}>Colour</strong>
          <div className="look-hues" role="radiogroup" aria-labelledby={`${id}-colour`}>
            {colours.map((item) => (
              <Tip key={item.value} label={item.note ?? item.label}><button type="button" role="radio" aria-checked={colour === item.value} aria-label={item.label}
                style={{ "--swatch": item.swatch } as CSSProperties} onClick={() => onColour(item.value)} /></Tip>
            ))}
          </div>
        </>}
      </div>
    </>
  );
}
