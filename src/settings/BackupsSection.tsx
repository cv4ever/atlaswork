// Settings → Backups: where the workspace lives and how much this browser holds, then Export and Restore. A backup is
// one file with everything, files and images included; restoring saves a copy of this workspace first.
import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, Upload } from "lucide-react";

export type Backups = {
  /** How long ago this browser last exported one ("3 days ago"), or null if never. */
  last: string | null; signedIn: boolean; persisted: boolean | null; holds: [number, string][];
  onExport: () => Promise<void>; onRestore: (file: File) => Promise<void>;
};

/** "42 tasks, 7 projects and 18 resources". */
const inventory = (holds: [number, string][]) => {
  const parts = holds.map(([count, noun]) => `${count} ${noun}${count === 1 ? "" : "s"}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
};

export function BackupsSection({ backups }: { backups: Backups }) {
  // Everything this site keeps in the browser, files included; null until the browser answers (or if it can't).
  const [used, setUsed] = useState<number | null>(null);
  useEffect(() => { navigator.storage?.estimate?.().then((estimate) => setUsed(estimate.usage ?? null), () => undefined); }, [backups.last]);
  const restoreInput = useRef<HTMLInputElement>(null);
  const keeps = backups.persisted === true ? "The browser keeps it until you clear site data."
    : backups.persisted === false ? "The browser may clear it when space runs low; installing the app usually stops that." : "";
  return (
    <section className="settings-group" id="profile-backups" aria-label="Backups">
      <div className="settings-card account-card">
        <span className="account-orb" aria-hidden="true"><HardDrive size={18} /></span>
        <div>
          <strong>{backups.last ? `Last backup ${backups.last}` : "No backup from this browser yet"}</strong>
          <p>{backups.signedIn ? "Your workspace lives in your account; files and images stay in this browser."
            : "Your workspace lives in this browser."} {keeps}
            {used !== null && ` It uses ${(used / 1e6).toFixed(1)} MB here.`}</p>
        </div>
      </div>
      <h4 className="settings-group-spaced">Export or restore</h4>
      <div className="settings-card">
        <p className="settings-card-copy">A backup is one file with your {inventory(backups.holds)}, files and images included.
          Restoring replaces this workspace, after saving a copy of it first.</p>
        <div className="settings-actions">
          <button className={backups.last ? "secondary-button" : "primary-button"} onClick={() => void backups.onExport()}>
            <Download size={16} />Export backup</button>
          <button className="secondary-button" onClick={() => restoreInput.current?.click()}><Upload size={16} />Restore from a backup…</button>
          <input ref={restoreInput} type="file" accept="application/json,.json" hidden aria-hidden="true" tabIndex={-1}
            onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void backups.onRestore(file); }} />
        </div>
      </div>
    </section>
  );
}
