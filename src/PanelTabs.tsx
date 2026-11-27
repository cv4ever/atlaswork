// The tabbed layout of Settings. Its pages are labelled groups (`.settings-group` with an uppercase h4) of cards
// (`.settings-card`); a red `.settings-danger` group holds irreversible actions.
import { useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** One page of a tabbed panel: the nav shows `label` and `hint`; the page heads itself with `sticker`, `label` and `blurb`. */
export type PanelTab = { id: string; label: string; hint: string; icon: LucideIcon; sticker: string; blurb: string };
/** Tabs under a heading ("You", "App"); each group is its own tablist, and the arrow keys walk across all of them. */
export type PanelGroup = { label: string; tabs: PanelTab[] };

/**
 * The settings layout: grouped vertical tabs on the left, one page at a time on the right, at a fixed height so
 * switching never resizes the dialog. Arrow keys, Home and End move between tabs (WAI-ARIA tabs pattern, automatic
 * activation). Phones drill down instead, the way a phone's own settings do: the tabs as a full-width list (where
 * `browse` opens it), a pick opens its page, and the page's back button returns to the list.
 */
export default function PanelTabs({ groups, active, onSelect, browse = false, footer, children }: {
  groups: PanelGroup[]; active: string; onSelect: (id: string) => void; browse?: boolean; footer?: ReactNode; children: ReactNode;
}) {
  const tabs = groups.flatMap((group) => group.tabs);
  const tab = tabs.find((item) => item.id === active) ?? tabs[0];
  // The tab the phone list was opened on: any change of tab (a pick, the footer's next step) opens that page.
  const [listedAt, setListedAt] = useState<string | null>(browse ? tab.id : null);
  const browsing = listedAt === tab.id;
  const pick = (id: string) => { setListedAt(null); onSelect(id); };
  const move = (key: string) => {
    const at = tabs.indexOf(tab);
    const next = key === "Home" ? 0 : key === "End" ? tabs.length - 1
      : (at + (key === "ArrowDown" || key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    pick(tabs[next].id);
    document.getElementById(`panel-tab-${tabs[next].id}`)?.focus();
  };
  return (
    <div className="panel-tabs" data-browsing={browsing || undefined}>
      <div className="panel-nav">
        {groups.map((group) => (
          <div key={group.label} className="panel-nav-group">
            <span className="panel-nav-label" aria-hidden="true">{group.label}</span>
            {/* Arrow keys bubble up from the focused tab (roving tabindex), so the tablist itself stays unfocusable. */}
            {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
            <div role="tablist" aria-label={group.label} aria-orientation="vertical" onKeyDown={(event) => {
              if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              move(event.key);
            }}>
              {group.tabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.id} type="button" role="tab" id={`panel-tab-${item.id}`} aria-controls="panel-page"
                    aria-selected={item === tab} tabIndex={item === tab ? 0 : -1} onClick={() => pick(item.id)}>
                    <Icon size={18} aria-hidden="true" />
                    <span><strong>{item.label}</strong><small>{item.hint}</small></span>
                    <ChevronRight className="panel-nav-go" size={16} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {footer && <div className="panel-nav-footer">{footer}</div>}
      </div>
      <div className="panel-page" role="tabpanel" id="panel-page" aria-labelledby={`panel-tab-${tab.id}`} key={tab.id}>
        <button type="button" className="text-button panel-back" onClick={() => {
          setListedAt(tab.id);
          requestAnimationFrame(() => document.getElementById(`panel-tab-${tab.id}`)?.focus());
        }}>
          <ChevronLeft size={16} aria-hidden="true" />All settings
        </button>
        <header className="panel-page-head">
          <span className="panel-sticker" aria-hidden="true">{tab.sticker}</span>
          <div><h3>{tab.label}</h3><p>{tab.blurb}</p></div>
        </header>
        {children}
      </div>
    </div>
  );
}
