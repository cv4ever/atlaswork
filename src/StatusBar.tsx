// The status bar: whether your work is saved, where you are, the note's words, progress on what's due, chat and theme.
// Each of its parts follows only what it shows (docs/adr/0002).
import { Fragment, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { Circle, Moon, PanelBottom, Sun } from "lucide-react";
import { useApp, useUi, useView, useWorkbench } from "./appContext.ts";
import Plant from "./Plant.tsx";
import { Emblem } from "./Emblem.tsx";
import { skin } from "./skin.ts";
import type { Progress } from "./view.ts";
import { Tip } from "./Popups.tsx";

export function editedAgo(updatedAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60_000));
  return minutes < 1 ? "just now" : minutes < 60 ? `${minutes} min ago` :
    minutes < 1440 ? `${Math.floor(minutes / 60)} hr ago` : minutes < 2880 ? "1 day ago" : `${Math.floor(minutes / 1440)} days ago`;
}

/** The save line. It alone follows saves, so a save starting or ending re-renders one line, not the app. */
function SaveStatus() {
  const { workbench, actions, signedIn } = useApp();
  const storageError = useWorkbench((snapshot) => snapshot.storageError);
  const saving = useSyncExternalStore(workbench.subscribeSaving, workbench.isSaving);
  const where = signedIn ? "to your account" : "on this device";
  return (
    <span className={storageError ? "save-failed" : ""}>
      {storageError ? (
        <>
          <Circle size={12} />
          Not saved <button onClick={() => void workbench.retrySaving()}>Retry</button>
          <button onClick={() => void actions.exportBackup()}>Export</button>
        </>
      ) : <><span className="local-dot" />{saving ? `Saving ${where}…` : `Saved ${where}`}</>}
    </span>
  );
}

/** The theme switch. It reads the painted theme itself, so a theme change doesn't re-render the app. */
function StatusTheme() {
  const { actions } = useApp();
  const theme = useSyncExternalStore(skin.subscribe, skin.getTheme);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Tip label={`Switch to ${next} mode`}><button className="status-theme" aria-label={`Switch to ${next} mode`} onClick={() => actions.setTheme(next)}>
      {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
    </button></Tip>
  );
}

/** The progress lane. Ticking something off where you are sends sparks off its edge. */
function StatusProgress({ id, label, hue, rider, done, total }: Progress) {
  const [seen, setSeen] = useState({ id, done, sparks: 0 });
  if (seen.id !== id || seen.done !== done)
    setSeen({ id, done, sparks: seen.id === id && done > seen.done ? seen.sparks + 1 : seen.sparks });
  return (
    <span className="status-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total}
      aria-valuenow={done} aria-valuetext={`${done} of ${total} done`} title={`${label}: ${done} of ${total} done`}
      data-complete={done === total} style={{ "--hue": hue, "--share": done / total } as CSSProperties}>
      <span className="progress-lane">
        <span className="progress-fill" />
        <span className="progress-rider" aria-hidden="true">{typeof rider === "string" ? <Emblem emoji={rider} /> : <Plant stage={rider} />}</span>
        {seen.sparks > 0 && <span key={seen.sparks} className="progress-sparks" aria-hidden="true"><i /><i /><i /><i /><i /></span>}
      </span>
      <small>{done}/{total}</small>
    </span>
  );
}

/** Where you are, the open note's words and age, and whether you're offline. */
function StatusMiddle() {
  const crumbs = useView((view) => view.screen.crumbs);
  const note = useView((view) => view.screen.note);
  const now = useView((view) => view.now);
  const online = useUi((state) => state.online);
  return (
    <span className="status-middle">
      <nav className="status-crumbs" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => <Fragment key={index}>{index > 0 && <span>/</span>}{crumb}</Fragment>)}
      </nav>
      <span className="status-extra">
        {note && <>
          <span>·</span>{(note.body.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []).length} words
          <span>·</span><time dateTime={note.updatedAt}>Edited {editedAgo(note.updatedAt, now)}</time>
        </>}
        {!online && <><span>·</span>Offline. Your local work is still available.</>}
      </span>
    </span>
  );
}

export default function StatusBar() {
  const { actions } = useApp();
  const visible = useView((view) => view.session.statusVisible);
  const progress = useView((view) => view.progress);
  const label = useView((view) => view.chat.current.label);
  const unread = useView((view) => view.chat.unreadTotal);
  return (
    <footer className="status-bar" inert={!visible}>
      <SaveStatus />
      <StatusMiddle />
      {progress && progress.total > 0 && <StatusProgress {...progress} />}
      <span>
        <button className="status-atlas" onClick={actions.showAtlas} aria-label={`Open chat with ${label}`}>
          {unread ? `${unread} unread` : label}
        </button>
        <StatusTheme />
        <Tip label="Hide status bar"><button aria-label="Hide status bar" onClick={() => actions.updateSession({ statusVisible: false })}>
        <PanelBottom size={16} />
                </button></Tip>
      </span>
    </footer>
  );
}
