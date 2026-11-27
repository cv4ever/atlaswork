// Cloudflare Turnstile, the "not a bot" check in front of sign-in emails (Supabase's CAPTCHA protection) and the
// waitlist (supabase/functions/waitlist). Builds without VITE_TURNSTILE_SITE_KEY show no widget and send no token.
import { useCallback, useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: { render(box: HTMLElement, options: object): string; reset(id: string): void; remove(id: string): void };
  }
}
export const turnstileKey: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY;

let loading: Promise<void> | undefined;
/** Turnstile's script, added to the page once and kept: loading it twice makes it warn and render late. */
function loadTurnstile() {
  // No Promise.withResolvers: sign-in must work on Safari before 17.4, and Vite doesn't polyfill it.
  return loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { loading = undefined; script.remove(); reject(new Error("Turnstile didn't load")); };
    document.head.append(script);
  });
}

/**
 * Renders the widget into the element given to `box` (a callback ref) while `active`; `token` is its answer ("" until
 * solved or after it expires). A token works once, so `reset` asks for a fresh one after each use.
 */
export function useTurnstile(active: boolean) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const widget = useRef("");
  const [token, setToken] = useState("");
  useEffect(() => {
    if (!turnstileKey || !active || !box) return;
    let gone = false;
    loadTurnstile().then(() => {
      if (!gone) widget.current = window.turnstile!.render(box, { sitekey: turnstileKey, callback: setToken, "expired-callback": () => setToken("") });
    }, () => undefined);
    // A token belongs to its widget: once it's gone, the next widget has to answer again.
    return () => { gone = true; if (widget.current) window.turnstile?.remove(widget.current); widget.current = ""; setToken(""); };
  }, [active, box]);
  const reset = useCallback(() => {
    if (widget.current) window.turnstile?.reset(widget.current);
    setToken("");
  }, []);
  return { box: setBox, token, reset, needed: !!turnstileKey };
}
