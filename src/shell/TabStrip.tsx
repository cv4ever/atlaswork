// The open tabs over the page, once a second one opens: the domain's overview first (its emblem only), then each tab
// with its icon, a pin or a close button. Arrow keys move between them (roving tabindex), middle-click closes, drag
// reorders; the chevron finds, pins or reorders them.
import { ChevronDown, FolderOpen, LayoutDashboard, Pin, X } from "lucide-react";
import type { ResourceKind } from "../model.ts";
import { domainKey, parseTab } from "../place.ts";
import { Tip } from "../Popups.tsx";
import { kindIcons } from "../Resources.tsx";
import { toolIcons } from "./nav.ts";

export function TabStrip({ tabs, active, pinned, currentDomain, tabLabel, tabKind, onNavigate, onCloseTab, onReorderTabs, onFindTabs }: {
  tabs: string[];
  active: string;
  pinned: string[];
  currentDomain: string;
  tabLabel: (key: string) => string;
  /** A resource tab's kind, for its icon. */
  tabKind: (key: string) => ResourceKind | undefined;
  onNavigate: (key: string) => void;
  onCloseTab: (key: string) => void;
  onReorderTabs: (tabs: string[]) => void;
  onFindTabs: () => void;
}) {
  return (
    <div className="workspace-topbar">
      {/* Arrow keys bubble up from the focused tab (roving tabindex), so the tablist itself stays unfocusable. */}
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus */}
      <div className="tabs" role="tablist" aria-label="Open workspace tabs" onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const index = tabs.indexOf(active);
        const key = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
        onNavigate(key);
        const strip = event.currentTarget;
        requestAnimationFrame(() => (strip.querySelector(`[data-tab="${CSS.escape(key)}"]`) as HTMLElement)?.focus());
      }}>
        {tabs.map((key) => {
          const overview = key === domainKey(currentDomain);
          const resource = tabKind(key);
          const Icon = resource ? kindIcons[resource] : parseTab(key).kind === "domain" ? LayoutDashboard
            : toolIcons[key as keyof typeof toolIcons] || FolderOpen;
          return (
            // Middle-click and drag are pointer extras; the buttons inside carry keyboard access.
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions
            <div className={`tab ${key === active ? "active" : ""} ${overview ? "tab-overview" : ""}`} key={key} draggable={!overview}
              onMouseDown={(event) => { if (event.button === 1) event.preventDefault(); }}
              onAuxClick={(event) => { if (event.button === 1 && !overview && !pinned.includes(key)) onCloseTab(key); }}
              onDragStart={(event) => event.dataTransfer.setData("text/workspace-tab", key)}
              onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                event.preventDefault();
                const source = event.dataTransfer.getData("text/workspace-tab");
                if (!tabs.includes(source) || source === key) return;
                const reordered = tabs.filter((tab) => tab !== source);
                reordered.splice(reordered.indexOf(key), 0, source);
                onReorderTabs(reordered);
              }}>
              <Tip label={overview ? `${currentDomain} overview` : undefined}><button role="tab" data-tab={key} aria-selected={key === active} aria-controls="workspace-content"
                aria-label={overview ? `${currentDomain} overview` : undefined} tabIndex={key === active ? 0 : -1} onClick={() => onNavigate(key)}>
                                <Icon size={14} />{!overview && <span>{tabLabel(key)}</span>}{!overview && pinned.includes(key) && <Pin size={12} />}
                              </button></Tip>
              {!overview && !pinned.includes(key) && <Tip label={`Close ${tabLabel(key)}`}><button className="tab-close" aria-label={`Close ${tabLabel(key)}`} onClick={() => onCloseTab(key)}><X size={12} /></button></Tip>}
            </div>
          );
        })}
      </div>
      <div className="topbar-actions">
        <Tip label="Find, pin, or reorder tabs"><button className="icon-button" aria-label="Find open tabs" onClick={onFindTabs}>
          <ChevronDown size={18} />
        </button></Tip>
      </div>
    </div>
  );
}
