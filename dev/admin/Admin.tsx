// The admin page's frame: a sidebar of sections and the one on screen, kept in the URL's hash (`#agents/Vital`), so a
// reload or a shared link opens the same place. The theme choice repaints through the Skin painter without saving.
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { Activity, ArrowUpRight, Gauge, GitCompareArrows, Palette, Users, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { initialSession } from "../../src/session.ts";
import { skin } from "../../src/skin.ts";
import AgentsAdmin from "./AgentsAdmin.tsx";
import ChangesAdmin from "./ChangesAdmin.tsx";
import LimitsAdmin from "./LimitsAdmin.tsx";
import OpsAdmin from "./OpsAdmin.tsx";
import ToolsAdmin from "./ToolsAdmin.tsx";

const sections: [string, string, LucideIcon, string][] = [
  ["agents", "Agents", Users, "Defaults and system prompts"],
  ["tools", "Tools", Wrench, "Permissions and what they add"],
  ["changes", "Changes", GitCompareArrows, "What the next release ships"],
  ["limits", "Limits", Gauge, "Caps and request sizes"],
  ["ops", "Operations", Activity, "Waitlist, accounts, usage"],
  ["design", "Design system", Palette, "Tokens, parts and widgets"],
];

const subscribe = (changed: () => void) => { addEventListener("hashchange", changed); return () => removeEventListener("hashchange", changed); };
const readHash = () => decodeURIComponent(location.hash.slice(1));

export default function Admin() {
  const hash = useSyncExternalStore(subscribe, readHash);
  const [section = "", ...rest] = hash.split("/");
  const current = sections.some(([id]) => id === section) ? section : "agents";
  const [theme, setTheme] = useState<"light" | "dark">(skin.getTheme());
  useLayoutEffect(() => {
    skin.apply({ palette: initialSession.palette, theme, density: "comfortable", canvas: initialSession.canvas, sidebarStyle: initialSession.sidebarStyle, railStyle: initialSession.railStyle, emblems: initialSession.emblems, followDaypart: false }, "day", "", false);
  }, [theme]);
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <a className="admin-brand" href="#agents"><img src="/icon.svg" alt="" width={24} height={24} /><span>Atlaswork <b>admin</b></span></a>
        <nav aria-label="Sections">
          {sections.map(([id, label, Icon, hint]) => (
            <a key={id} href={`#${id}`} className="admin-nav-item" aria-current={current === id ? "page" : undefined}>
              <Icon size={18} aria-hidden="true" /><span>{label}<small>{hint}</small></span>
            </a>
          ))}
        </nav>
        <div className="admin-side-foot">
          <div className="segmented-control" role="radiogroup" aria-label="Theme">
            {(["light", "dark"] as const).map((option) => (
              <button key={option} type="button" role="radio" aria-checked={theme === option} onClick={() => setTheme(option)}>{option === "light" ? "Light" : "Dark"}</button>
            ))}
          </div>
          <a className="quiet-button" href="/" target="_blank" rel="noreferrer">Open the app <ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
      </aside>
      <main className="admin-main" data-section={current}>
        {current === "agents" && <AgentsAdmin selected={rest.join("/") || "Atlas"} />}
        {current === "tools" && <ToolsAdmin />}
        {current === "limits" && <LimitsAdmin />}
        {current === "ops" && <OpsAdmin />}
        {current === "changes" && <ChangesAdmin />}
        {current === "design" && (
          <section className="admin-design" aria-labelledby="admin-design-title">
            <header className="admin-head">
              <div><h1 id="admin-design-title">Design system</h1>
                <p>Every token, part and widget as the app draws it. Its own toolbar switches theme, density and domain.</p></div>
              <a className="secondary-button" href="/dev/design/" target="_blank" rel="noreferrer">Open on its own <ArrowUpRight size={14} aria-hidden="true" /></a>
            </header>
            <iframe className="admin-frame" src="/dev/design/" title="Atlaswork design system" />
          </section>
        )}
      </main>
    </div>
  );
}
