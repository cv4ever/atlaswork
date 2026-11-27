// The theme dial in the header and the phone's More sheet.
import { useState, useSyncExternalStore } from "react";
import { skin } from "../skin.ts";
import { Tip } from "../Popups.tsx";

/**
 * The theme dial turns the moment it's pressed. It flips its own state, and asks for the theme only after that frame
 * has painted: restyling every surface takes a long frame, which used to land before the turn began. The compositor
 * runs the turn meanwhile. The local state clears once the theme catches up.
 */
export function ThemeToggle({ onTheme }: { onTheme: (theme: "light" | "dark") => void }) {
  const theme = useSyncExternalStore(skin.subscribe, skin.getTheme);
  const [turned, setTurned] = useState<"light" | "dark" | null>(null);
  if (turned === theme) setTurned(null);
  const dark = (turned ?? theme) === "dark";
  return (
    <Tip label={`Switch to ${dark ? "light" : "dark"} mode`}><button className="theme-toggle" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={() => {
      const next = dark ? "light" : "dark";
      setTurned(next);
      requestAnimationFrame(() => setTimeout(() => onTheme(next)));
    }}>
    <span className="theme-dial" />
        </button></Tip>
  );
}
