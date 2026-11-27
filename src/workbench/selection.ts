// Where you are after an edit: tabs whose records went away close (and a renamed domain's follow its name), a new
// domain is selected and a new or moved project opens, both as a new history entry. Pure; workbench.test.ts covers it.
import type { WorkspaceData } from "../model.ts";
import { tabKey } from "../place.ts";
import type { Session } from "../session.ts";
import * as tabs from "../tabs.ts";
import type { Change } from "../workspace.ts";

export function sessionAfter(before: WorkspaceData | null, previous: Session, { data, changes, renamedDomain }: Change) {
  let session = before ? tabs.reconcile(previous, data, renamedDomain) : previous;
  let mode: "push" | "replace" = "replace";
  if (before && !renamedDomain) {
    const addedDomain = changes.domains?.find((domain) => !before.domains.some((old) => old.name === domain.name));
    const openedProject = changes.projects?.find((project) => {
      const old = before.projects.find((item) => item.id === project.id);
      return !old || old.area !== project.area;
    });
    if (addedDomain) session = tabs.selectDomain(session, data, addedDomain.name);
    if (openedProject) session = tabs.open(session, data, tabKey({ kind: "project", id: openedProject.id }));
    if (addedDomain || openedProject) mode = "push";
  }
  return { session, mode };
}
