// Phones have no tab strip (agents-design D60): a page's own heading ends with this stack and the number of open tabs,
// which opens the shell's Open tabs sheet. It shows only while another tab than this page is open; a domain's overview
// doesn't count, since its seed is in the header. Larger screens keep the strip, so it hides there.
import { Layers } from "lucide-react";
import { useView } from "./appContext.ts";
import { parseTab } from "./place.ts";
import { Tip } from "./Popups.tsx";

export function OpenTabsButton() {
  const tabs = useView((view) => view.session.tabs);
  const active = useView((view) => view.session.view ?? view.session.active);
  const open = tabs.filter((key) => parseTab(key).kind !== "domain");
  if (!open.some((key) => key !== active)) return null;
  const label = `${open.length} open ${open.length === 1 ? "tab" : "tabs"}`;
  return (
    <Tip label={label}><button className="icon-button open-tabs-button" popoverTarget="open-tabs" aria-label={label}>
      <Layers size={18} /><span className="open-tabs-count" aria-hidden="true">{open.length}</span>
    </button></Tip>
  );
}
