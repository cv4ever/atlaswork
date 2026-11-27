// A guide's line arriving a few characters at a time (Atlas on Today, D35; a project's brief, D40).
import { useEffect, useState } from "react";

/** The part of `text` typed so far. `animate` false, or reduced motion, shows it whole; `animate` is fixed per mount. */
export function useTyped(text: string, animate = true) {
  const whole = () => !animate || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(whole() ? text.length : 0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new line starts typing over from its first character
    if (whole()) { setShown(text.length); return; }
    setShown(0);
    const timer = setInterval(() => setShown((count) => {
      if (count >= text.length) { clearInterval(timer); return count; }
      return count + 2;
    }), 24);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `animate` is fixed per mount; only new text restarts it
  }, [text]);
  return text.slice(0, shown);
}
