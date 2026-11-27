// The header's domain shelf: every domain as a chip (its pencil edits it, a clay dot says it has late tasks), scrolling
// sideways with arrows while it overflows, a vertical wheel scrolling it too, and All domains at its end. The selected
// domain stays in view.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ChevronsRight, Pencil } from "lucide-react";
import { Tip } from "../Popups.tsx";
import { Emblem } from "../Emblem.tsx";

export function DomainRail({ domains, late, currentDomain, active, onSelectDomain, onEditDomain, onNavigate }: {
  domains: { name: string; emoji: string; hue: string }[];
  /** Open tasks past their day, per domain name. */
  late: Record<string, number>;
  currentDomain: string;
  active: string;
  onSelectDomain: (name: string) => void;
  onEditDomain: (name: string) => void;
  onNavigate: (key: string) => void;
}) {
  const shelf = useRef<HTMLElement>(null);
  const [shelfMore, setShelfMore] = useState({ any: false, left: false, right: false });
  useEffect(() => {
    const el = shelf.current!;
    const measure = () => {
      const left = el.scrollLeft > 1, right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      // Arrows stay mounted while the shelf overflows: toggling them mid-scroll resizes the shelf and halts smooth scrolling.
      setShelfMore((was) => (was.left === left && was.right === right ? was : { any: left || right, left, right }));
    };
    // Mice without a horizontal wheel: a vertical wheel over the shelf scrolls it sideways.
    const wheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || el.scrollWidth <= el.clientWidth) return;
      event.preventDefault();
      el.scrollBy({ left: event.deltaY });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { observer.disconnect(); el.removeEventListener("scroll", measure); el.removeEventListener("wheel", wheel); };
  }, []);
  useEffect(() => {
    const el = shelf.current!;
    el.dispatchEvent(new Event("scroll"));
    // Keep the selected domain in view after switching or adding domains.
    el.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [domains.length, currentDomain]);
  return (
    <div className="domain-rail" data-more-left={shelfMore.left} data-more-right={shelfMore.right}>
    <button className="shelf-arrow" aria-label="Scroll domains left" tabIndex={-1} hidden={!shelfMore.any} disabled={!shelfMore.left}
      onClick={() => shelf.current?.scrollBy({ left: -shelf.current.clientWidth * 0.7, behavior: "smooth" })}><ChevronLeft size={16} /></button>
    <nav ref={shelf} className="domain-shelf" aria-label="Domains">
      {domains.map((domain) => {
        const selected = domain.name === currentDomain;
        const lateHere = late[domain.name] ?? 0;
        return (
          <div key={domain.name} className="domain-chip" data-active={selected} style={{ "--hue": domain.hue } as CSSProperties}>
            <Tip label={lateHere ? `${domain.name}: ${lateHere} late` : domain.name}><button aria-label={domain.name} aria-current={selected || undefined}
              onClick={() => onSelectDomain(domain.name)}>
              <span className="domain-chip-emoji" aria-hidden="true"><Emblem emoji={domain.emoji} /></span><span>{domain.name}</span>
            </button></Tip>
            <Tip label={`Edit ${domain.name}`}><button className="domain-chip-settings" aria-label={`Edit ${domain.name}`} onClick={() => onEditDomain(domain.name)}><Pencil size={14} /></button></Tip>
            {lateHere > 0 && <span className="domain-chip-late" aria-hidden="true" />}
          </div>
        );
      })}
    </nav>
    <button className="shelf-arrow" aria-label="Scroll domains right" tabIndex={-1} hidden={!shelfMore.any} disabled={!shelfMore.right}
      onClick={() => shelf.current?.scrollBy({ left: shelf.current.clientWidth * 0.7, behavior: "smooth" })}><ChevronRight size={16} /></button>
    <Tip label="All domains"><button className="domain-all" aria-label="All domains" aria-current={active === "domains" ? "page" : undefined} onClick={() => onNavigate("domains")}><ChevronsRight size={18} /></button></Tip>
    </div>
  );
}
