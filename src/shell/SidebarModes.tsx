// The sidebar's two tabs: Projects (the selected domain's; its stored id is still "workspace") and Agents, with the
// unread count across the roster. Any arrow key moves to the other tab.
import { FolderOpen, MessageCircle } from "lucide-react";
import { Tip } from "../Popups.tsx";

type Mode = "workspace" | "agents";
const modes = [["workspace", "Projects", FolderOpen], ["agents", "Agents", MessageCircle]] as const;

export function SidebarModes({ mode: selected, unread, onMode }: { mode: Mode; unread: number; onMode: (mode: Mode) => void }) {
  return (
    <div className="sidebar-modes" role="tablist" aria-label="Sidebar">
      {modes.map(([mode, label, Icon]) => (
        <Tip key={mode} label={label}><button id={`sidebar-tab-${mode}`} role="tab" aria-selected={selected === mode}
          aria-controls={`sidebar-${mode}`} tabIndex={selected === mode ? 0 : -1} onClick={() => onMode(mode)}
          onKeyDown={(event) => {
            // Two tabs: any arrow moves to the other one (the rail stacks them vertically).
            if (!event.key.startsWith("Arrow")) return;
            event.preventDefault();
            const other = mode === "workspace" ? "agents" : "workspace";
            onMode(other);
            document.getElementById(`sidebar-tab-${other}`)?.focus();
          }}>
          {/* Keyed by selection so the icon remounts and hops each time its tab is picked. */}
          <Icon key={String(selected === mode)} size={16} /><span>{label}</span>
          {mode === "agents" && unread > 0 && <span className="sidebar-mode-unread" aria-label={`${unread} unread`}>{unread}</span>}
        </button></Tip>
      ))}
    </div>
  );
}
