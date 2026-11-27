// Internal navigation rules for the Workbench module. Callers use Workbench, never Session patches.
import { initialSession, seededTabs, viewLabels } from "./session.ts";
import type { WorkspaceData } from "./model.ts";
import type { DomainSection, Session, TabSet } from "./session.ts";
import { domainKey, parseTab } from "./place.ts";
import type { Change } from "./workspace.ts";

const isView = (key: string) => Object.hasOwn(viewLabels, key);
const sectionOf = (value?: string | null): DomainSection => value === "tasks" || value === "resources" ? value : "overview";
const own = ({ tabs, active, pinned, section }: Session): TabSet => ({ tabs, active, pinned, section });
const equal = (a: string[], b: string[]) => a.length === b.length && a.every((value, index) => value === b[index]);

function available(data: WorkspaceData) {
  const domains = new Set(data.domains.filter((domain) => !domain.archived).map((domain) => domain.name));
  const projects = new Map(data.projects.filter((project) => !project.archived && domains.has(project.area)).map((project) => [project.id, project]));
  const topics = new Set(data.topics.filter((topic) => !topic.archived).map((topic) => topic.id));
  // A Resource with an archived home is still reachable through a live Project Link. Built only when a Resource tab
  // asks: most navigation checks only domains and projects, and this reads every note.
  let notes: Set<string> | undefined;
  const noteIds = () => notes ??= new Set(data.notes.filter((note) => !note.archived && (
    (note.topicId ? topics.has(note.topicId) : domains.has(note.domain) && (!note.projectId || projects.has(note.projectId)))
    || note.linkedProjectIds?.some((id) => projects.has(id))
  )).map((note) => note.id));
  return {
    domains,
    accepts(key: string, domain: string) {
      const tab = parseTab(key);
      return key === domainKey(domain) || key === "projects"
        || (tab.kind === "project" && projects.get(tab.id)?.area === domain)
        || (tab.kind === "resource" && noteIds().has(tab.id));
    },
  };
}
function ownerOf(data: WorkspaceData, key: string) {
  const tab = parseTab(key);
  return tab.kind === "domain" ? tab.name
    : tab.kind === "project" ? data.projects.find((project) => project.id === tab.id)?.area : undefined;
}
function switchDomain(session: Session, name: string): Session {
  if (name === session.domain) return session.view ? { ...session, view: null } : session;
  const { [name]: saved, ...others } = session.domainTabs;
  return { ...session, ...(saved ?? seededTabs(name)), domain: name, view: null,
    domainTabs: { ...others, [session.domain]: own(session) } };
}
function fallback(session: Session, data: WorkspaceData, requested?: string): Session {
  const live = (name?: string) => data.domains.some((domain) => domain.name === name && !domain.archived);
  const domain = live(requested) ? requested! : live(session.domain) ? session.domain : data.domains.find((domain) => !domain.archived)!.name;
  return { ...switchDomain(session, domain), active: domainKey(domain), section: "overview", view: null };
}

/** Discard unavailable tabs in every Domain, preserving Resource tabs independently of their home. */
export function reconcile(session: Session, data: WorkspaceData, renamed?: Change["renamedDomain"]): Session {
  let next = session;
  if (renamed) {
    const keyOf = (key: string) => key === domainKey(renamed.from) ? domainKey(renamed.to) : key;
    const rename = (set: TabSet): TabSet => ({ ...set, tabs: set.tabs.map(keyOf), pinned: set.pinned.map(keyOf), active: keyOf(set.active) });
    next = { ...session, ...rename(own(session)), domain: session.domain === renamed.from ? renamed.to : session.domain,
      domainTabs: Object.fromEntries(Object.entries(session.domainTabs).map(([name, set]) => [name === renamed.from ? renamed.to : name, rename(set)])) };
  }
  const live = available(data);
  if (!live.domains.has(next.domain)) next = fallback(next, data);
  const clean = (set: TabSet, domain: string): TabSet => {
    const overview = domainKey(domain);
    const tabs = [overview, ...new Set(set.tabs.filter((key) => key !== overview && live.accepts(key, domain)))];
    const pinned = [overview, ...new Set(set.pinned.filter((key) => key !== overview && tabs.includes(key)))];
    const active = tabs.includes(set.active) ? set.active : overview;
    const section = active === set.active ? sectionOf(set.section) : "overview";
    return equal(tabs, set.tabs) && equal(pinned, set.pinned) && active === set.active && section === set.section
      ? set : { tabs, pinned, active, section };
  };
  const current = own(next);
  const selected = clean(current, next.domain);
  let changed = selected !== current;
  const domainTabs: Record<string, TabSet> = {};
  for (const [name, set] of Object.entries(next.domainTabs)) {
    if (!live.domains.has(name) || name === next.domain) { changed = true; continue; }
    domainTabs[name] = clean(set, name);
    if (domainTabs[name] !== set) changed = true;
  }
  return changed ? { ...next, ...selected, domainTabs } : next;
}

export function selectDomain(session: Session, data: WorkspaceData, name: string): Session {
  return available(data).domains.has(name) ? switchDomain(session, name) : fallback(session, data, name);
}

export function open(session: Session, data: WorkspaceData, key: string, section?: DomainSection): Session {
  if (isView(key)) return { ...session, view: key as Session["view"] };
  if (key === "overview" || key === "tasks" || key === "resources") {
    section = sectionOf(key);
    key = domainKey(session.domain);
  }
  const live = available(data);
  const owner = ownerOf(data, key);
  const next = owner && live.domains.has(owner) ? switchDomain(session, owner) : session;
  if (!live.accepts(key, next.domain)) return fallback(session, data, owner);
  return { ...next, view: null, tabs: next.tabs.includes(key) ? next.tabs : [...next.tabs, key], active: key,
    ...(parseTab(key).kind === "domain" ? { section: section ?? "overview" } : {}) };
}

/** URLs carry the selected Domain even for global pages and Resources opened away from their home. */
export function toUrl(session: Session, base: URL): URL {
  const url = new URL(base);
  for (const key of ["view", "tab", "section", "domain"]) url.searchParams.delete(key);
  url.searchParams.set("domain", session.domain);
  url.searchParams.set(session.view ? "view" : "tab", session.view ?? session.active);
  if (!session.view && parseTab(session.active).kind === "domain" && session.section !== "overview") url.searchParams.set("section", session.section);
  return url;
}

/** Explicit URLs win over remembered presentation. Invalid destinations choose a live Overview. */
export function fromUrl(session: Session, data: WorkspaceData, url: URL): Session {
  const key = url.searchParams.get("view") ?? url.searchParams.get("tab");
  if (!key && !url.searchParams.has("domain")) return session;
  const domain = url.searchParams.get("domain") ?? (key && ownerOf(data, key)) ?? session.domain;
  if (!available(data).domains.has(domain)) return fallback(session, data, domain);
  const next = switchDomain(session, domain);
  return key ? open(next, data, key, sectionOf(url.searchParams.get("section"))) : fallback(next, data, domain);
}

export function close(session: Session, key: string): Session {
  if (!session.tabs.includes(key) || session.pinned.includes(key) || key === domainKey(session.domain)) return session;
  const index = session.tabs.indexOf(key);
  return { ...session, tabs: session.tabs.filter((tab) => tab !== key),
    active: session.active === key ? session.tabs[Math.max(0, index - 1)] : session.active };
}

export function reorder(session: Session, data: WorkspaceData, tabs: string[]): Session {
  return reconcile({ ...session, tabs: tabs.filter((key) => session.tabs.includes(key)) }, data);
}

export function togglePin(session: Session, key: string): Session {
  if (!session.tabs.includes(key) || key === domainKey(session.domain)) return session;
  return { ...session, pinned: session.pinned.includes(key) ? session.pinned.filter((tab) => tab !== key) : [...session.pinned, key] };
}

export function restore(saved: Partial<Session>, data: WorkspaceData, url: URL): Session {
  const session: Session = { ...initialSession, ...saved, scroll: saved.scroll ?? {}, filters: saved.filters ?? {},
    // The roster's All / Here filter became sections (2026-11-19); a saved `scope` is dropped.
    roster: { ...initialSession.roster, ...Object.fromEntries(Object.entries(saved.roster ?? {}).filter(([key]) => key !== "scope")) },
    // Creating a project used to mark the guide done. Keep it available again without undoing an explicit Later.
    firstMorning: saved.firstMorning === "later" ? "later" : "pending",
    // The Notes widget became Resources; old tab sets acquire their first remembered section during reconciliation.
    widgets: (saved.widgets ?? initialSession.widgets).map((widget) => (widget as string) === "notes" ? "resources" : widget) };
  return fromUrl(reconcile(session, data), data, url);
}
