// A fanned stack of faces or emoji, used by Crew's more tile and Ready's seals.
import type { CSSProperties, ReactNode } from "react";

/** Ready's fanned stack: the first five, then "+n" for the rest, so a long list keeps to its seal. */
export function Stack({ items }: { items: ReactNode[] }) {
  return <span className="ready-stack" aria-hidden="true">{items.slice(0, 5)}{items.length > 5 && <i className="ready-more" style={{ "--n": 5 } as CSSProperties}>+{items.length - 5}</i>}</span>;
}
