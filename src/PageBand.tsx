// Every page's header band (docs/page-design.md, "Masthead"): two rows in one grid, edge to edge in the theme's second
// tone. Row one: the tile (a place's emblem or a person's face; pages without a place of their own have none), the
// title after an optional crumb back, with its edit pencil, and the actions, ending with the open-tabs stack. Row two:
// the title's line, and on its right the foot: a domain's or the Agents page's tabs, a project's stage strip, a person's
// dates. Domain, project and person pages pass their own extras through the same slots.
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { ChevronRight, Pencil } from "lucide-react";
import { OpenTabsButton } from "./OpenTabs.tsx";
import { Tip } from "./Popups.tsx";

export function PageBand({ title, line, tile, picture, crumb, edit, actions, foot, hue, className, heading }: {
  title: string;
  line: ReactNode;
  /** An emblem on the tile: a domain's or topic's emoji, a project's plant. */
  tile?: ReactNode;
  /** A picture that is the tile itself (a person's face, `.masthead-face`). */
  picture?: ReactNode;
  /** The page this one sits in, as a link back before the title. */
  crumb?: { label: string; onClick: () => void };
  /** The pencil after the title: the page's one way into its dialog. */
  edit?: { label: string; onClick: () => void };
  actions?: ReactNode;
  /** Row two's right: `.masthead-tabs`, `.masthead-stage` or a person's facts. */
  foot?: ReactNode;
  hue?: string;
  /** The page's own band class (`domain-masthead`, `project-masthead`, `person-masthead`). */
  className?: string;
  /** Extra props on the heading box, such as a domain's swipe handlers. */
  heading?: HTMLAttributes<HTMLDivElement> & { "data-swipe"?: string };
}) {
  const plain = tile === undefined && picture === undefined;
  return (
    <header className={`page-masthead${className ? ` ${className}` : ""}`} data-plain={plain || undefined}
      style={hue ? { "--hue": hue } as CSSProperties : undefined}>
      <div className="page-heading" {...heading}>
        {tile !== undefined && <span className="masthead-plant" aria-hidden="true">{tile}</span>}
        {picture}
        <div className="masthead-title">
          {crumb && <><button className="text-button masthead-crumb" onClick={crumb.onClick}>{crumb.label}</button>
            <ChevronRight size={16} className="masthead-crumb-sep" aria-hidden="true" /></>}
          <h1>{title}</h1>
          {edit && <Tip label={edit.label}><button className="icon-button title-edit" aria-label={edit.label} onClick={edit.onClick}><Pencil size={16} /></button></Tip>}
        </div>
        <p>{line}</p>
        <span className="masthead-actions">{actions}<OpenTabsButton /></span>
      </div>
      {foot}
    </header>
  );
}
