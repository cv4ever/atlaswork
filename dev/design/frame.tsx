// The showcase's own frame parts: a section with its heading and lede, a card of parts, and a segmented choice.
import type { ReactNode } from "react";

/** `shot` marks the section for the screenshot regression (scripts/check-visual.mjs); sections that follow the clock or shoot their parts leave it off. */
export function Section({ id, title, lede, children, shot = true }: { id: string; title: string; lede: ReactNode; children: ReactNode; shot?: boolean }) {
  return (
    <section id={id} className="ds-section" aria-labelledby={`${id}-title`} data-section={title} data-shot={shot ? id : undefined}>
      <h2 id={`${id}-title`} className="today-group-title">{title}</h2>
      <p className="ds-section-lede">{lede}</p>
      {children}
    </section>
  );
}

/** One part of the Parts section; `wide` gives it the grid's whole row. */
export function Part({ title, wide, children }: { title: string; wide?: boolean; children: ReactNode }) {
  return <div className="ds-part" data-wide={wide || undefined}><h3 className="ds-sub">{title}</h3>{children}</div>;
}

export function Segments<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Record<T, string>; onChange: (value: T) => void }) {
  return (
    <div className="segmented-control" role="radiogroup" aria-label={label}>
      {(Object.entries(options) as [T, string][]).map(([option, text]) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>{text}</button>
      ))}
    </div>
  );
}
