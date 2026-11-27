// A domain's or project's page, by its Home key: arranged, reset, a block edited, added or purged; put-away data
// blocks keep what they logged. And a place's brief mark (D40).
import { byId } from "../model.ts";
import type { BriefMark, WorkspaceData } from "../model.ts";
import { defaultPages, keepsData } from "../blocks.ts";
import type { Block } from "../blocks.ts";
import { parseHome } from "../place.ts";
import { unchanged } from "./change.ts";
import type { Change } from "./change.ts";
import { editDomain } from "./domains.ts";
import { editProject } from "./projects.ts";

/** Records a place's brief mark (D40: the brief dismissed, its welcome done), merged into what's there; one record per place. */
export function markBrief(data: WorkspaceData, place: string, patch: BriefMark): Change {
  const current = data.briefs[place] ?? {};
  const next: BriefMark = { ...current, ...patch };
  if (next.dismissed === undefined) delete next.dismissed;
  if (current.dismissed === next.dismissed && !!current.welcomed === !!next.welcomed) return unchanged(data);
  return { data: { ...data, briefs: { ...data.briefs, [place]: next } }, changes: { briefs: { [place]: next } } };
}

/** A domain overview's or project's blocks as shown, by its Home key, or undefined once the place is gone. */
export function pageOf(data: Pick<WorkspaceData, "domains" | "projects">, place: string): Block[] | undefined {
  const where = parseHome(place);
  if (where.kind === "domain") {
    const domain = data.domains.find((item) => item.name === where.name);
    return domain && (domain.widgets ?? defaultPages.domain);
  }
  const project = where.kind === "project" ? byId(data.projects).get(where.id) : undefined;
  return project && (project.widgets ?? defaultPages.project);
}

export const defaultPageOf = (place: string) => parseHome(place).kind === "domain" ? defaultPages.domain : defaultPages.project;

/** `shown` in order, then every data block of `current` it leaves out, put away with what it logged. Record blocks just go. */
export const withPutAway = (current: Block[], shown: Block[], today: string): Block[] => [...shown,
  ...current.filter((block) => keepsData(block) && !shown.some((item) => item.id === block.id))
    .map((block) => ({ ...block, removed: block.removed ?? today }))];

/** A page's stored blocks; `undefined` means its place's default. */
function savePage(data: WorkspaceData, place: string, widgets: Block[] | undefined): Change {
  const where = parseHome(place);
  return where.kind === "domain" ? editDomain(data, where.name, { widgets }) : editProject(data, place, { widgets });
}
function currentPage(data: WorkspaceData, place: string) {
  const blocks = pageOf(data, place);
  if (!blocks) throw new Error("That page no longer exists.");
  return blocks;
}

/**
 * Arranges a domain's or project's page, by its Home key: `blocks` are what it shows, in order, with any settings or
 * logged values changed. A data block left out is put away with what it logged; only `purgeBlock` deletes one.
 * A put-away block passed in is restored.
 */
export function arrangePage(data: WorkspaceData, place: string, blocks: Block[], today: string): Change {
  return savePage(data, place, withPutAway(currentPage(data, place), blocks.map(({ removed: _removed, ...block }) => block), today));
}

/** Puts a page back on its default; its data blocks are put away, not deleted. */
export function resetPage(data: WorkspaceData, place: string, today: string): Change {
  const kept = withPutAway(currentPage(data, place), [], today);
  return savePage(data, place, kept.length ? [...defaultPageOf(place), ...kept] : undefined);
}

/** Deletes a put-away block and what it logged, for good. Blocks on show are never purged. */
export function purgeBlock(data: WorkspaceData, place: string, id: string): Change {
  return savePage(data, place, currentPage(data, place).filter((block) => !(block.id === id && block.removed)));
}

/** Saves one block of a domain's or project's page, by its Home key: what Today logs into a habit that lives elsewhere. */
export function editBlock(data: WorkspaceData, place: string, block: Block): Change {
  return savePage(data, place, currentPage(data, place).map((item) => item.id === block.id ? block : item));
}

/** Adds a block to the end of a domain's or project's page, by its Home key: a habit or countdown started from Today. */
export function addBlock(data: WorkspaceData, place: string, block: Block): Change {
  return savePage(data, place, [...currentPage(data, place), block]);
}
