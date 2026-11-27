// The app's floating parts on Base UI (ADR 0003): Base UI brings the behaviour (keyboard, focus, positioning, roles),
// styles.css brings the look. `Tip` is a control's tooltip; `Picker` is a menu opened from a button.
import { cloneElement, useEffect, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode, SyntheticEvent } from "react";
import { Menu } from "@base-ui/react/menu";
import { Tooltip } from "@base-ui/react/tooltip";

/**
 * A popup opened from inside a modal dialog or a native popover must render there: both sit in the top layer, and the
 * page below a modal is inert.
 */
const layerOf = (trigger: Element | undefined) => trigger?.closest<HTMLElement>("dialog[open], [popover]") ?? null;

type Shown = { at: HTMLElement; label: string; layer: HTMLElement | null };

/**
 * Shows the tip of the control under the pointer or keyboard focus: after 300 ms on hover, at once while another tip
 * was just showing or on keyboard focus. Touch never hovers, so a long press (500 ms without moving) shows it for
 * 2.5 s instead and swallows the click and context menu that press would end in. One set of listeners on the document
 * serves every `Tip`, so a control pays nothing for its tooltip until it shows (ADR 0003).
 */
function useTips(show: (shown: Shown | null) => void) {
  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer = 0;
    let hide = 0;
    let warmUntil = 0;
    let start: { x: number; y: number } | undefined;
    let pressed = false;
    const tipOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>("[data-tip]") : null);
    const open = (at: HTMLElement) => {
      clearTimeout(timer);
      // The control may have left the page while the hover delay ran.
      if (!at.isConnected) return;
      current = at;
      show({ at, label: at.dataset.tip!, layer: layerOf(at) });
    };
    const close = () => {
      clearTimeout(timer);
      clearTimeout(hide);
      if (current) warmUntil = performance.now() + 300;
      current = null;
      start = undefined;
      show(null);
    };
    const over = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const at = tipOf(event.target);
      if (!at || at === current) return;
      clearTimeout(timer);
      if (current || performance.now() < warmUntil) open(at);
      else timer = window.setTimeout(() => open(at), 300);
    };
    const out = (event: PointerEvent) => {
      const at = tipOf(event.target);
      if (at && !at.contains(event.relatedTarget as Node | null)) at === current ? close() : clearTimeout(timer);
    };
    const focus = (event: FocusEvent) => {
      const at = tipOf(event.target);
      if (at && at === event.target && at.matches(":focus-visible")) open(at);
    };
    const down = (event: PointerEvent) => {
      close();
      pressed = false;
      if (event.pointerType !== "touch") return;
      const at = tipOf(event.target);
      if (!at) return;
      start = { x: event.clientX, y: event.clientY };
      timer = window.setTimeout(() => {
        pressed = true;
        open(at);
        hide = window.setTimeout(close, 2500);
      }, 500);
    };
    const move = (event: PointerEvent) => {
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) { clearTimeout(timer); start = undefined; }
    };
    const up = () => { if (!pressed) clearTimeout(timer); start = undefined; };
    const swallow = (event: Event) => {
      if (!pressed) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "click") pressed = false;
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape" && current) close(); };
    const listeners: [string, EventListener][] = [
      ["pointerover", over as EventListener], ["pointerout", out as EventListener], ["focusin", focus as EventListener],
      ["focusout", close], ["pointerdown", down as EventListener], ["pointermove", move as EventListener], ["pointerup", up],
      ["pointercancel", up], ["click", swallow], ["contextmenu", swallow], ["keydown", key as EventListener], ["scroll", close],
    ];
    for (const [type, listener] of listeners) document.addEventListener(type, listener, { capture: true });
    return () => {
      clearTimeout(timer);
      clearTimeout(hide);
      for (const [type, listener] of listeners) document.removeEventListener(type, listener, { capture: true });
    };
  }, [show]);
}

/** Mounts the one tooltip every `Tip` shares, placed by Base UI against the control it describes. */
export function Tips({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  useTips(setShown);
  return (
    <>
      {children}
      <Tooltip.Root open={!!shown}>
        {shown && (
          <Tooltip.Portal container={shown.layer ?? undefined}>
            <Tooltip.Positioner className="tip-positioner" anchor={shown.at} sideOffset={6} collisionPadding={8}>
              <Tooltip.Popup className="tip">{shown.label}</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        )}
      </Tooltip.Root>
    </>
  );
}

/**
 * A control's words as its tooltip, on hover, keyboard focus, or a long press on touch. The control still needs its
 * own `aria-label` (or visible text): the tooltip is visual only. Words that differ from that name reach screen
 * readers as the control's description, as `title` did. It only marks the control (`data-tip`), so it costs nothing
 * to render; `Tips` does the rest.
 */
export function Tip({ label, children }: { label?: string; children: ReactElement<{ "aria-label"?: string }> }) {
  if (!label) return children;
  const description = label !== children.props["aria-label"] ? label : undefined;
  return cloneElement(children, { "data-tip": label, "aria-description": description } as Record<string, string | undefined>);
}

type Place = { layer: HTMLElement | null; hue?: string };
const placeOf = (trigger: Element | undefined): Place => ({
  layer: layerOf(trigger),
  hue: trigger && getComputedStyle(trigger).getPropertyValue("--hue") || undefined,
});

/**
 * A menu opened from `trigger`: arrow keys, Home/End and typeahead move through its `Menu.Item`s, Escape and a click
 * outside close it, and focus returns to the trigger. `filter` adds a search field (put a `Menu.Input` and a
 * `Menu.List` inside). The popup takes the trigger's `--hue`, so items tint as they did beside it. Pass `open` and
 * `onOpenChange` to open it from elsewhere too, such as a shortcut.
 *
 * The trigger stays a plain button and Base UI's menu, placed against it, mounts only while open, so a page that draws
 * a view menu per block pays for none of them until one opens (ADR 0003).
 */
export function Picker({ trigger, tip, label, className, align = "end", filter, open, onOpenChange, children }: {
  trigger: ReactElement<{ "aria-label"?: string }>;
  tip?: string;
  label: string;
  className: string;
  align?: "start" | "center" | "end";
  filter?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // A press on the trigger while open first closes the menu as a press outside it; the click that follows mustn't reopen it.
  const [closedAt, setClosedAt] = useState(0);
  const isOpen = open ?? shown;
  const change = (next: boolean, at = 0) => {
    if (!next) setClosedAt(at);
    setShown(next);
    onOpenChange?.(next);
  };
  const button = cloneElement(trigger, {
    ref: setAnchor, "aria-haspopup": "menu", "aria-expanded": isOpen,
    onClick: (event: SyntheticEvent) => { if (event.timeStamp - closedAt > 250) change(!isOpen); },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      change(true);
    },
  } as Record<string, unknown>);
  const place = isOpen && anchor ? placeOf(anchor) : undefined;
  const menu = place && (
    <Menu.Root open onOpenChange={(next, { event }) => change(next, event?.timeStamp)}>
      <Menu.Portal container={place.layer ?? undefined}>
        <Menu.Positioner className="picker-positioner" anchor={anchor} align={align} sideOffset={6} collisionPadding={8}>
          <Menu.Popup className={className} aria-label={label} finalFocus={() => anchor}
            style={place.hue ? { "--hue": place.hue } as CSSProperties : undefined}>
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
  return (
    <>
      {tip ? <Tip label={tip}>{button}</Tip> : button}
      {menu && (filter ? <Menu.FilterProvider>{menu}</Menu.FilterProvider> : menu)}
    </>
  );
}
