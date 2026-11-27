// A project's linked folder among the masthead's actions (docs/page-design.md "Progressive disclosure"): one icon whose
// tooltip says the state, opening a popover with the folder's name, where it is and the actions (a `section`, so the
// masthead's rules for its title block leave it alone).
// A folder on one of the account's computers (agents-design D77) is the project's own (`Project.folder`), so every
// device shows it; the desktop app's window on that computer links one through Windows' picker, changes and unlinks
// it, and any device can unlink it. Elsewhere a browser links one for itself (D47, folders.ts), never in the
// workspace, and each link, Reconnect and Unlink adds one to today's anonymous count (usage.ts).
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { FolderMinus, FolderOpen, FolderPlus, FolderSync, RefreshCw } from "lucide-react";
import { desktop } from "./desktop.ts";
import type { DesktopComputer } from "./desktop.ts";
import { folderLinks, linkedFolders } from "./folders.ts";
import { formatDate } from "./dates.ts";
import type { ComputerFolder, Project } from "./model.ts";
import { countUsage } from "./usage.ts";
import { Tip } from "./Popups.tsx";

type Props = { project: Project; onFolder: (folder: ComputerFolder | undefined) => void };

const close = (event: { currentTarget: HTMLElement }) => event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();

/** The computer this page runs on, inside the desktop app once it's paired; null anywhere else. */
function useThisComputer() {
  const [computer, setComputer] = useState<DesktopComputer | null>(null);
  useEffect(() => {
    let live = true;
    desktop?.info().then((info) => { if (live) setComputer(info.computer); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return computer;
}

export default function FolderLink({ project, onFolder }: Props) {
  const links = useSyncExternalStore(linkedFolders.subscribe, linkedFolders.getSnapshot);
  const here = useThisComputer();
  const pick = async (computer: DesktopComputer, replaces?: ComputerFolder) => {
    const id = crypto.randomUUID();
    const picked = await desktop!.linkFolder(id, replaces?.id).catch(() => null);
    if (picked) onFolder({ id, computer, name: picked.name, path: picked.path });
  };
  if (project.folder) return <OnComputer project={project} folder={project.folder} here={here} onPick={pick} onFolder={onFolder} />;
  if (here) return (
    <Tip label={`Link a folder on ${here.name}`}><button type="button" className="icon-button" aria-label={`Link a folder on ${here.name}`}
      onClick={() => void pick(here)}><FolderPlus size={18} /></button></Tip>
  );
  if (!folderLinks) return null;
  const projectId = project.id;
  const folder = links.get(projectId);
  if (!folder) return (
    <Tip label="Link a folder from this computer"><button type="button" className="icon-button" aria-label="Link a folder from this computer"
      onClick={() => void linkedFolders.link(projectId).then((linked) => linked && countUsage("folder_linked"))}><FolderPlus size={18} /></button></Tip>
  );
  const id = `folder-${projectId.replace(/[^\w-]/g, "")}`;
  const open = folder.access === "granted";
  const files = `${folder.files}${folder.truncated ? "+" : ""} ${folder.files === 1 ? "file" : "files"}`;
  const label = open ? `Folder ${folder.name}: ${files}` : `Folder ${folder.name}: reconnect so agents can read it`;
  return <>
    <Tip label={label}><button type="button" className="icon-button folder-button" data-closed={open ? undefined : ""} popoverTarget={id} aria-label={label}
      style={{ anchorName: `--${id}` } as CSSProperties}><FolderOpen size={18} /></button></Tip>
    <section id={id} popover="auto" className="view-menu folder-menu" aria-label="Linked folder" style={{ positionAnchor: `--${id}` } as CSSProperties}>
      <strong>{folder.name}</strong>
      <div className="folder-line">{files}, listed {formatDate(folder.scanned, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}. Agents here with “Read files” can
        read its text files and PDFs when you ask. They never change them.</div>
      {!open && (
        <button type="button" onClick={(event) => { close(event); countUsage("folder_reconnected"); void linkedFolders.reconnect(projectId); }}>
          <RefreshCw size={14} /><span><strong>Reconnect</strong><small>The browser asks after it restarts; “Allow on every visit” stops that.</small></span>
        </button>
      )}
      <button type="button" onClick={(event) => { close(event); void linkedFolders.link(projectId).then((linked) => linked && countUsage("folder_linked")); }}>
        <FolderSync size={14} /><span><strong>Choose another folder</strong><small>Replaces this one for the project.</small></span>
      </button>
      <button type="button" onClick={(event) => { close(event); countUsage("folder_unlinked"); void linkedFolders.unlink(projectId); }}>
        <FolderMinus size={14} /><span><strong>Unlink</strong><small>Agents stop reading it. Your files stay as they are.</small></span>
      </button>
    </section>
  </>;
}

/** A project's folder on one of the account's computers, as every device shows it. */
function OnComputer({ project, folder, here, onPick, onFolder }: Props & {
  folder: ComputerFolder; here: DesktopComputer | null; onPick: (computer: DesktopComputer, replaces: ComputerFolder) => Promise<void>;
}) {
  const id = `folder-${project.id.replace(/[^\w-]/g, "")}`;
  const computer = folder.computer.name;
  const onThis = here?.id === folder.computer.id;
  const label = `Folder ${folder.name} on ${computer}`;
  return <>
    <Tip label={label}><button type="button" className="icon-button folder-button" popoverTarget={id} aria-label={label}
      style={{ anchorName: `--${id}` } as CSSProperties}><FolderOpen size={18} /></button></Tip>
    <section id={id} popover="auto" className="view-menu folder-menu" aria-label="Linked folder" style={{ positionAnchor: `--${id}` } as CSSProperties}>
      <strong>{folder.name}</strong>
      <div className="folder-line">On {computer}, at {folder.path}. Agents here with “Read files” read its text files, PDFs and images there when
        you ask, so an answer that needs them waits until {computer} is on. Reading never changes them.</div>
      {onThis && (
        <button type="button" onClick={(event) => { close(event); void onPick(here, folder); }}>
          <FolderSync size={14} /><span><strong>Choose another folder</strong><small>Replaces this one for the project.</small></span>
        </button>
      )}
      <button type="button" onClick={(event) => {
        close(event);
        if (onThis) void desktop!.unlinkFolder(folder.id).catch(() => undefined);
        onFolder(undefined);
      }}>
        <FolderMinus size={14} /><span><strong>Unlink</strong><small>Agents stop reading it. Your files stay as they are.</small></span>
      </button>
    </section>
  </>;
}
