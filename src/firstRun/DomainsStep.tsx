// The first run's Domains step: every domain as a tile to tick (Everyday fixed, yours ticked to start), and "Your own",
// which opens into a name, an emoji and what it's for. The picks' rules are picks.ts.
import { useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { Check, Lock, Plus } from "lucide-react";
import { domainEmoji } from "../look.ts";
import type { OnboardingStart } from "../onboarding.ts";
import { Tip } from "../Popups.tsx";
import { Burst } from "../dataBlocks/parts.tsx";
import { addOwn, menuOf, namingOf, toggleDomain } from "./picks.ts";
import type { Naming, Picked, Picks } from "./picks.ts";
import { Emblem } from "../Emblem.tsx";

/** A stable ref, so the name field takes focus once, when the "Your own" tile opens. */
const focusOnMount = (input: HTMLInputElement | null) => input?.focus();

export function DomainsStep({ start, picks, bursts, onPicked }: {
  start: OnboardingStart;
  picks: Picks;
  /** How many times each pick was ticked on, so a burst plays per tick. */
  bursts: Record<string, number>;
  onPicked: (picked: Picked) => void;
}) {
  const [naming, setNaming] = useState<Naming | null>(null);
  const { allDomains, everyday, isYours } = menuOf(start, picks.own);
  const { name: ownName, refused, listed } = namingOf(start, picks, naming);
  const add = () => {
    if (!naming || !ownName || refused) return;
    onPicked(addOwn(start, picks, naming));
    setNaming(null);
  };
  /** Esc in the tile's fields closes it without closing the whole dialog. */
  const escapeNaming = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setNaming(null); } };
  return (
    <div className="area-picks">
      {allDomains.map((domain, index) => {
        const fixed = everyday(domain.name);
        const on = fixed || picks.domains.includes(domain.name);
        const mine = isYours(domain.name);
        return (
          <Tip key={domain.name} label={fixed ? "Everyday is always here, and Atlas looks after it" : undefined}><button type="button" className="area-pick" aria-pressed={on} aria-disabled={fixed || undefined} style={{ "--hue": domain.hue || undefined, "--i": index } as CSSProperties} onClick={() => onPicked(toggleDomain(start, picks, domain.name))}>
          <span className="area-pick-emoji" aria-hidden="true"><Emblem emoji={domain.emoji} /></span>
          <strong>{domain.name}</strong>
          <small>{fixed ? "Always here, with Atlas" : mine ? on ? "Already yours" : "Archived when you finish" : domain.intention || "Your own"}</small>
          <span className="pick-check" aria-hidden="true">{fixed ? <Lock size={12} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}</span>
          <Burst count={bursts[domain.name] ?? 0} />
                          </button></Tip>
        );
      })}
      {naming ? (
        <form className="area-pick area-own" data-naming="" style={{ "--i": allDomains.length } as CSSProperties}
          onSubmit={(event) => { event.preventDefault(); add(); }}>
          <Tip label="Change emoji"><button type="button" className="area-pick-emoji" aria-label={`Emoji: ${naming.emoji}. Change`} popoverTarget="own-emoji" style={{ anchorName: "--own-emoji" } as CSSProperties}><Emblem emoji={naming.emoji} /></button></Tip>
          <div id="own-emoji" popover="auto" className="emoji-grid" role="radiogroup" aria-label="Emoji" style={{ positionAnchor: "--own-emoji" } as CSSProperties}>
            {domainEmoji.map((emoji) => (
              <button key={emoji} type="button" role="radio" aria-checked={naming.emoji === emoji} aria-label={emoji}
                onClick={(event) => { setNaming({ ...naming, emoji }); event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover(); }}><Emblem emoji={emoji} /></button>
            ))}
          </div>
          <span className="area-own-name">
            <input ref={focusOnMount} value={naming.name} maxLength={32} placeholder="Name it" aria-label="Domain name"
              aria-invalid={!!refused || undefined} onChange={(event) => setNaming({ ...naming, name: event.target.value })} onKeyDown={escapeNaming} />
            <Tip label="Add this domain"><button type="submit" className="icon-button" aria-label="Add this domain" disabled={!ownName || !!refused}><Check size={16} /></button></Tip>
          </span>
          <input className="area-own-about" value={naming.about} maxLength={60} placeholder="What's it for? (optional)" aria-label="What it's for"
            onChange={(event) => setNaming({ ...naming, about: event.target.value })} onKeyDown={escapeNaming} />
          <small className={refused ? "field-error" : undefined}>
            {refused ? "Everyday is always here" : listed ? `Enter ticks ${listed.name}` : "Enter adds it; Esc cancels"}</small>
        </form>
      ) : (
        <button type="button" className="area-pick area-own" style={{ "--i": allDomains.length } as CSSProperties}
          onClick={() => setNaming({ emoji: "✨", name: "", about: "" })}>
          <span className="area-pick-emoji" aria-hidden="true"><Plus size={18} /></span>
          <strong>Your own</strong><small>A part of life that isn't here</small>
        </button>
      )}
    </div>
  );
}
