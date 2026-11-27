// The shell's effects that draw nothing themselves: the panes' widths as CSS variables, the selected tab scrolled into
// view, and the canvas glow following a mouse pointer (never on touch, never with reduced motion).
import { useEffect } from "react";
import type { RefObject } from "react";

export function usePaneWidths(sidebar: number, agent: number) {
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", `${sidebar}px`);
    document.documentElement.style.setProperty("--agent-width", `${agent}px`);
  }, [sidebar, agent]);
}

/** Scrolls the tab for `active` into view when it's cut off, observed after layout rather than on every selection. */
export function useTabInView(shell: RefObject<HTMLDivElement | null>, active: string) {
  useEffect(() => {
    const tab = shell.current?.querySelector(`[data-tab="${CSS.escape(active)}"]`)?.closest(".tab");
    if (!tab) return;
    // Scrolling every selection forced a full-page synchronous layout.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < 1) tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, { root: tab.closest(".tabs"), threshold: 1 });
    observer.observe(tab);
    return () => observer.disconnect();
  }, [shell, active]);
}

/** Moves the canvas glow under the mouse, once a frame. */
export function useCanvasGlow(glow: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0, x = 0, y = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || reducedMotion.matches) return;
      x = event.clientX;
      y = event.clientY;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (glow.current) glow.current.style.transform = `translate3d(${x - 160}px, ${y - 160}px, 0)`;
      });
    };
    addEventListener("pointermove", move, { passive: true });
    return () => { removeEventListener("pointermove", move); cancelAnimationFrame(frame); };
  }, [glow]);
}
