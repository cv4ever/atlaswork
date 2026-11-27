// The phone's chrome: the header (your picture, every domain as a seed, Search), the bottom bar (Today, Projects,
// Capture: hold to dictate, Chat: hold for what waits on you, More) with its More sheet, and the Open tabs sheet (hold
// one to pin it).
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { FolderOpen, LayoutGrid, MessageCircle, Pin, Plus, Search, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canDictate } from "../dictation.ts";
import { toolLabels } from "../session.ts";
import type { ResourceKind } from "../model.ts";
import { domainKey, parseTab } from "../place.ts";
import { Tip } from "../Popups.tsx";
import { kindIcons } from "../Resources.tsx";
import { countUsage } from "../usage.ts";
import { phonePageGroups, phonePages, toolIcons } from "./nav.ts";
import type { PhonePage } from "./nav.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { Emblem } from "../Emblem.tsx";

/**
 * A phone bar button that does one thing on a tap and another when held for 450 ms, the way a voice note starts in a
 * messaging app. The press must not select anything or open the browser's callout. `onRelease`: the held action waits
 * until the finger lifts and the click a lift may still send has passed, since a light-dismiss popover the action
 * opens would close on that click.
 */
function useHold(onHold: () => void, onTap: () => void, onRelease = false) {
  const timer = useRef(0);
  const held = useRef(false);
  const stop = () => window.clearTimeout(timer.current);
  const lift = () => { stop(); if (held.current && onRelease) timer.current = window.setTimeout(onHold, 500); };
  return {
    onPointerDown: () => { stop(); held.current = false; timer.current = window.setTimeout(() => { held.current = true; if (!onRelease) onHold(); }, 450); },
    onPointerUp: lift, onPointerCancel: lift, onPointerLeave: () => { if (!held.current) stop(); },
    onContextMenu: (event: { preventDefault: () => void }) => event.preventDefault(),
    onClick: () => {
      if (!held.current) onTap();
      else if (onRelease) { stop(); setTimeout(onHold); }
      held.current = false;
    },
  };
}

/**
 * The phone bar's Capture: a tap opens it, a long press opens it listening (agents-design D53). Where the browser
 * can't recognise speech, a long press opens it as a tap does.
 */
function CaptureTab({ onCapture }: { onCapture: (listen?: boolean) => void }) {
  const hold = useHold(() => { countUsage("nav_capture"); onCapture(canDictate); }, () => { countUsage("nav_capture"); onCapture(); });
  return (
    <Tip label="Capture (hold to speak)"><button className="phone-hold phone-capture" aria-label="Capture" {...hold}>
      <span className="phone-capture-mark"><Plus size={18} strokeWidth={2.5} /></span>
    </button></Tip>
  );
}

/**
 * The phone bar's Chat. Its count is only the agents waiting on you (an approval, a question, a block); unread news
 * is a quiet dot. Holding it opens Needs you, as the home-screen shortcut does (agents-design D52).
 */
function ChatTab({ current, needs, unread, onChat, onNeedsYou }: {
  current: boolean; needs: number; unread: number; onChat: () => void; onNeedsYou: () => void;
}) {
  const hold = useHold(() => { countUsage("nav_needs"); onNeedsYou(); }, () => { countUsage("nav_chat"); onChat(); }, true);
  const label = needs ? `Chat, ${needs} waiting on you` : unread ? `Chat, ${unread} unread` : "Chat";
  return (
    <Tip label="Chat (hold for Needs you)"><button className="phone-hold phone-chat" aria-current={current ? "page" : undefined} data-pending={needs > 0}
      aria-label={label} {...hold}>
        <MessageCircle size={18} /><span>Chat</span>
        {/* Keyed by the count, so each new wait drops the teardrop in again. */}
        {needs > 0 ? <span key={needs} className="atlas-count">{needs}</span> : unread > 0 && <span className="phone-news" aria-hidden="true" />}
      </button></Tip>
  );
}

/**
 * One open tab in the phone's Open tabs sheet: a tap opens it, holding pins or unpins it, and × closes it unless it's
 * pinned (agents-design D60). Phones have no tab strip; the page's own heading opens this sheet (`OpenTabsButton`).
 */
function OpenTabRow({ label, Icon, current, pinned, onOpen, onPin, onClose }: {
  label: string; Icon: LucideIcon; current: boolean; pinned: boolean; onOpen: () => void; onPin: () => void; onClose: () => void;
}) {
  const hold = useHold(onPin, onOpen);
  return (
    <div className="open-tab" aria-current={current ? "page" : undefined}>
      <Tip label={pinned ? "Hold to unpin" : "Hold to pin"}><button className="phone-hold" {...hold}>
        <Icon size={16} /><span>{label}</span>{pinned && <Pin size={14} aria-label="Pinned" />}
      </button></Tip>
      {!pinned && <Tip label={`Close ${label}`}><button className="icon-button" aria-label={`Close ${label}`} onClick={onClose}><X size={14} /></button></Tip>}
    </div>
  );
}

export function PhoneHeader({ profileName, profilePicture, domains, currentDomain, active, here, onNavigate, onSearch }: {
  profileName: string;
  profilePicture: string;
  domains: { name: string; emoji: string; hue: string }[];
  currentDomain: string;
  active: string;
  /** Whether the current domain's seed names itself: not on global views, nor while chat covers the page. */
  here: boolean;
  onNavigate: (key: string) => void;
  onSearch: () => void;
}) {
  // The phone header's seeds keep the current domain in view, as the desktop shelf does.
  const seeds = useRef<HTMLElement>(null);
  useEffect(() => {
    seeds.current?.querySelector('[data-here="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [domains.length, currentDomain]);
  return (
    <header className="mobile-header">
      {/* You, as everywhere else: your picture opens your profile (the sidebar's profile button on larger screens). */}
      <Tip label={profileName || "Profile"}><button className="phone-profile" aria-label="Profile" onClick={() => { countUsage("nav_profile"); onNavigate("profile"); }}>
        <img src={profilePicture} alt="" />
      </button></Tip>
      {/* Every domain one tap away, as its emoji; the one you're in also names itself. data-touched: a seed hops only
          once the row has been used, never on load. */}
      <nav ref={seeds} className="phone-seeds" aria-label="Domains" onPointerDown={(event) => { event.currentTarget.dataset.touched = ""; }}>
        {domains.map((item) => {
          const seedHere = here && item.name === currentDomain;
          return (
            <Tip key={item.name} label={item.name}><button className="phone-seed" data-here={seedHere} style={{ "--hue": item.hue } as CSSProperties}
              aria-current={active === domainKey(item.name) && here ? "page" : undefined} aria-label={item.name} onClick={() => { countUsage("nav_domain"); onNavigate(domainKey(item.name)); }}>
                        <span className="phone-seed-emoji" aria-hidden="true"><Emblem emoji={item.emoji} /></span>
                        {seedHere && <span className="phone-seed-name" aria-hidden="true">{item.name}</span>}
                      </button></Tip>
          );
        })}
      </nav>
      <Tip label="Search everything"><button className="icon-button phone-search" aria-label="Search" onClick={() => { countUsage("nav_search"); onSearch(); }}>
        <Search size={18} />
      </button></Tip>
    </header>
  );
}

/** The phone's bottom bar: `at` is the slot its ink pill slides to (0 Today, 1 Projects, 3 Chat, 4 More; 2 is Capture; -1 none). */
export function PhoneBar({ at, active, here, needs, unread, onNavigate, onCapture, onChat, onNeedsYou, onTheme }: {
  at: number;
  active: string;
  /** Whether Today or Projects is the page on screen (a project's page counts as Projects). */
  here: { today: boolean; projects: boolean };
  /** Agents waiting on you, counted on Chat. */
  needs: number;
  unread: number;
  onNavigate: (key: string) => void;
  onCapture: (listen?: boolean) => void;
  onChat: () => void;
  onNeedsYou: () => void;
  onTheme: (theme: "light" | "dark") => void;
}) {
  const go = (key: "today" | "projects" | PhonePage) => { countUsage(`nav_${key}`); onNavigate(key); };
  const page = (key: PhonePage) => {
    const Icon = toolIcons[key];
    return (
      <button key={key} aria-current={active === key ? "page" : undefined} style={{ "--i": phonePages.indexOf(key) } as CSSProperties} onClick={(event) => {
        (event.currentTarget.closest("[popover]") as HTMLElement).hidePopover();
        go(key);
      }}><Icon size={18} /><span>{toolLabels[key]}</span></button>
    );
  };
  return (
    // data-touched: icons hop only once the bar has been used, never on load.
    <nav className="phone-nav" aria-label="Phone navigation" data-at={at} style={{ "--nav-at": at } as CSSProperties}
      onPointerDown={(event) => { event.currentTarget.dataset.touched = ""; }}>
      {(["today", "projects"] as const).map((key) => {
        const Icon = toolIcons[key];
        return <button key={key} aria-current={here[key] ? "page" : undefined}
          onClick={() => go(key)}><Icon size={18} /><span>{toolLabels[key]}</span></button>;
      })}
      {/* The phone's main action sits in the middle, larger and raised above the bar: the button that adds, not a place. */}
      <CaptureTab onCapture={onCapture} />
      <ChatTab current={at === 3} needs={needs} unread={unread} onNeedsYou={onNeedsYou} onChat={onChat} />
      {/* The pages the bar doesn't hold; the button reads as current while one of them is open. */}
      <button className="phone-more" popoverTarget="phone-pages" aria-current={at === 4 ? "page" : undefined}
        onClick={() => countUsage("nav_more")}><LayoutGrid size={18} /><span>More</span></button>
      <nav id="phone-pages" popover="auto" className="phone-pages" aria-label="More pages">
        {phonePageGroups.map(([label, keys]) => (
          <section key={label}>
            <h2>{label}</h2>
            <div>{keys.map(page)}</div>
          </section>
        ))}
        <div className="phone-pages-foot">{page("settings")}<ThemeToggle onTheme={onTheme} /></div>
      </nav>
    </nav>
  );
}

/** Phones: the open tabs, as a sheet under the header; the domain's overview isn't listed, its seed is in the header. */
export function OpenTabsSheet({ tabs, active, pinned, tabLabel, tabKind, onNavigate, onTogglePin, onCloseTab }: {
  tabs: string[];
  active: string;
  pinned: string[];
  tabLabel: (key: string) => string;
  tabKind: (key: string) => ResourceKind | undefined;
  onNavigate: (key: string) => void;
  onTogglePin: (key: string) => void;
  onCloseTab: (key: string) => void;
}) {
  const open = tabs.filter((key) => parseTab(key).kind !== "domain");
  return (
    <nav id="open-tabs" popover="auto" className="open-tabs" aria-label="Open tabs">
      <h2>{open.length} open</h2>
      {open.map((key) => {
        const resource = tabKind(key);
        return <OpenTabRow key={key} label={tabLabel(key)} Icon={resource ? kindIcons[resource] : FolderOpen} current={key === active}
          pinned={pinned.includes(key)} onPin={() => onTogglePin(key)} onClose={() => onCloseTab(key)}
          onOpen={() => { document.getElementById("open-tabs")?.hidePopover(); onNavigate(key); }} />;
      })}
      <p>Hold a tab to pin or unpin it.</p>
    </nav>
  );
}
