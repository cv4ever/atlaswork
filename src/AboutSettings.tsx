// Settings → About: which version this is, a way to look for a newer one or load it (src/update.ts), and what's new
// (src/changelog.ts).
import { useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { changelog } from "./changelog.ts";
import { formatDate } from "./dates.ts";
import { appBuilt, appVersion, updates } from "./update.ts";

const day = (iso: string) => formatDate(new Date(`${iso}T12:00:00`), { day: "numeric", month: "long", year: "numeric" });

export function AboutSection() {
  const { status, checkedAt } = useSyncExternalStore(updates.subscribe, updates.get);
  const line = {
    unavailable: "The development build: it reloads by itself as files change.",
    checking: "Looking for a new version…",
    current: `Up to date${checkedAt ? `, checked at ${formatDate(checkedAt, { hour: "2-digit", minute: "2-digit" })}` : ""}.`,
    ready: "A new version is ready. Reload to use it; it also loads by itself the next time you leave the app.",
    failed: "Couldn't reach Atlaswork to look. Try again when you're online.",
  }[status];
  return <>
    <section className="settings-group" aria-labelledby="settings-version">
      <h4 id="settings-version">Version</h4>
      <div className="settings-card">
        <div className="setting-row">
          <div>
            <strong>Atlaswork {appVersion}{appBuilt && <small className="about-built"> · {day(appBuilt)}</small>}</strong>
            <p role="status">{line}</p>
          </div>
          {status === "ready"
            ? <button type="button" className="primary-button" onClick={updates.apply}><RefreshCw size={16} />Reload to update</button>
            : <button type="button" className="secondary-button" disabled={status === "unavailable" || status === "checking"}
              onClick={() => void updates.check()}><RefreshCw size={16} className={status === "checking" ? "about-spin" : undefined} />Check for updates</button>}
        </div>
      </div>
    </section>
    <section className="settings-group" aria-labelledby="settings-news">
      <h4 id="settings-news">What's new</h4>
      <ol className="about-news">
        {changelog.map((release) => (
          <li key={release.day} className="settings-card">
            <time dateTime={release.day}>{day(release.day)}</time>
            <strong>{release.title}</strong>
            <ul>{release.changes.map((change) => <li key={change}>{change}</li>)}</ul>
          </li>
        ))}
      </ol>
    </section>
  </>;
}
