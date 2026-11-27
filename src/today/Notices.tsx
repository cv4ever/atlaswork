// The notes above Today's cards: a backup nudge, the plan's notice, and the first morning's row.
import { useState } from "react";
import { ChevronRight, Download, HardDrive, PlugZap } from "lucide-react";
import { planNotice, useStanding } from "../allowance.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { backupReminderDue } from "../backup.ts";
import FirstMorning from "../FirstMorning.tsx";
import { useModelState } from "../modelMenu.ts";

/** Browser-only workspaces get three days with content before their first reminder; exported backups age weekly. */
export function BackupNudge() {
  const { actions, signedIn } = useApp();
  const hasContent = useView((view) => view.hasBackupContent);
  const firstContentAt = useView((view) => view.session.firstContentAt);
  const now = useView((view) => view.now);
  const lastBackup = useUi((state) => state.lastBackup);
  const snooze = useUi((state) => state.backupSnooze);
  if (signedIn || !hasContent || !backupReminderDue(firstContentAt, lastBackup, snooze, now)) return null;
  const age = lastBackup ? Math.floor((now - Date.parse(lastBackup)) / 864e5) : null;
  return (
    <aside className="backup-nudge" aria-label="Backup reminder">
      <HardDrive size={18} />
      <p>{age !== null && <strong>Last backup {age} days ago. </strong>}Your workspace is saved in this browser.
        Download a backup to keep another copy.</p>
      <button className="primary-button" onClick={() => void actions.exportBackup()}><Download size={16} />Export backup</button>
      <button className="text-button" onClick={actions.snoozeBackup}>Remind me in 7 days</button>
    </aside>
  );
}

const planNoticeKey = "atlaswork.plan-notice";

/**
 * The plan speaking on Today (agents-design D48): a trial's last days, or a plan with no live replies, while Atlaswork's
 * model would answer and nothing of your own is connected. Not now keeps that notice away on this device until what
 * it says changes.
 */
export function PlanNotice() {
  const { actions, engine, signedIn } = useApp();
  const now = useView((view) => view.now);
  const models = useModelState(engine);
  const hosted = signedIn && models.status === "ready" && models.provider.using === "hosted";
  const standing = useStanding(hosted);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(planNoticeKey) ?? ""; } catch { return ""; } });
  const notice = hosted && standing ? planNotice(standing, now) : null;
  if (!notice || notice.key === dismissed) return null;
  const dismiss = () => {
    setDismissed(notice.key);
    try { localStorage.setItem(planNoticeKey, notice.key); } catch { /* blocked: it shows again next visit */ }
  };
  return (
    <aside className="backup-nudge" aria-label="Your plan">
      <PlugZap size={18} />
      <p><strong>{notice.title}. </strong>{notice.line}</p>
      <button className="primary-button" onClick={() => actions.openSettings("model")}><PlugZap size={16} />Connect a model</button>
      <button className="text-button" onClick={dismiss}>Not now</button>
    </aside>
  );
}

export function FirstMorningRow() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const firstMorning = useView((view) => view.firstMorning);
  const data = useView((view) => view.data);
  const name = useView((view) => view.session.profileName);
  // An idea or your own project opens the project dialog filled in (D62); its Start builds and opens the project, and
  // returning to Today remounts the guide at its domain picker.
  const start = useUi((state) => state.firstMorningStart);
  if (firstMorning === "pending") return (
    <FirstMorning data={data} name={name} start={start ?? undefined}
      onStart={(domain, starter) => { actions.setUi({ firstMorningStart: null }); actions.newProject(domain, starter); }}
      onPlant={() => actions.newDomain()}
      onLater={() => { actions.setUi({ firstMorningStart: null }); void actions.updateSession({ firstMorning: "later" }); }} />
  );
  if (firstMorning === "later") return (
    <button className="today-link first-morning-later-row" onClick={() => void actions.updateSession({ firstMorning: "pending" })}>
      <img src={portraitSrc({ portrait: "atlas" })} alt="" /><span><small>Atlas</small><strong>Set up a domain together</strong></span><ChevronRight size={16} />
    </button>
  );
  return null;
}
