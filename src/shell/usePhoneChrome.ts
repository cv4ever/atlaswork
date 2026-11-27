// How the shell's chrome makes room on a phone, as attributes on the shell element for WorkbenchShell.css:
// `data-keyboard` while the on-screen keyboard is up, `data-header-away` while you scroll the page down.
import { useEffect } from "react";
import type { RefObject } from "react";

/** A new page (`active`) or the chat opening or closing on a phone (`chatShown`) brings the header back. */
export function usePhoneChrome(shell: RefObject<HTMLDivElement | null>, active: string, chatShown: boolean) {
  // The viewport shrinks for the on-screen keyboard (interactive-widget in index.html), so a window much shorter than
  // its tallest at this width means the keyboard is up: phones then hide the bar and chat chrome to keep the field
  // and what you're answering in view. A new width (rotation) starts the measure again.
  useEffect(() => {
    let width = innerWidth, tallest = 0;
    const measure = () => {
      if (innerWidth !== width) { width = innerWidth; tallest = 0; }
      tallest = Math.max(tallest, innerHeight);
      shell.current?.toggleAttribute("data-keyboard", innerHeight < tallest * 0.8);
    };
    measure();
    addEventListener("resize", measure);
    return () => removeEventListener("resize", measure);
  }, [shell]);
  // Phones: the header steps aside while you scroll the page down and comes back as soon as you scroll up, at the top,
  // and on every new page or chat. Scroll events don't bubble, so the shell listens in the capture phase for any
  // scroller in the workspace; a 24px run in one direction decides, so a finger's jitter doesn't flicker it.
  useEffect(() => {
    const root = shell.current!;
    const phone = matchMedia("(max-width: 760px)");
    let lastTop = 0, lastEl: Element | null = null, run = 0;
    const scroll = (event: Event) => {
      const el = event.target;
      if (!phone.matches || !(el instanceof HTMLElement) || !el.closest(".workspace-center")) return;
      const top = el.scrollTop, delta = el === lastEl ? top - lastTop : 0;
      lastEl = el;
      lastTop = top;
      if (!delta) return;
      run = Math.sign(delta) === Math.sign(run) ? run + delta : delta;
      if (top < 48 || run < -24) root.removeAttribute("data-header-away");
      else if (run > 24) root.setAttribute("data-header-away", "");
    };
    root.addEventListener("scroll", scroll, { capture: true, passive: true });
    return () => root.removeEventListener("scroll", scroll, { capture: true });
  }, [shell]);
  useEffect(() => { shell.current?.removeAttribute("data-header-away"); }, [shell, active, chatShown]);
}
