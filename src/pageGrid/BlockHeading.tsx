// A record widget's heading: its icon and title, its actions, and the view menu (D39). Changing the view saves the
// page; Today's blocks keep Session.widgets, so there only their views change.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "../appContext.ts";
import type { Block } from "../blocks.ts";
import { ViewMenu } from "../dataBlocks/parts.tsx";

export function BlockHeading({ block, fallback, Icon, action }: { block: Block; fallback: string; Icon: LucideIcon; action?: ReactNode }) {
  const { actions } = useApp();
  return (
    <div className="section-heading"><h2><Icon size={16} />{block.title || fallback}</h2>
      <span className="heading-actions">{action}<ViewMenu block={block} onView={(view) => actions.changeBlock({ ...block, view })} /></span></div>
  );
}
