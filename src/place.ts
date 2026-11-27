// The Place module (GLOSSARY.md "Place"): the only code that reads or writes place keys, and where the Session is.
// A Home or a page names a Project by its bare id; a tab says `project:<id>`. Sessions and URLs keep both, so both stay.
import type { WorkspaceData } from "./model.ts";
import type { Session } from "./session.ts";

export type Place = { kind: "domain"; name: string } | { kind: "project"; id: string } | { kind: "topic"; id: string };
/** What a tab shows: a Domain's overview, a Project, a Resource, or a page such as Today or Library. */
export type Tab = Exclude<Place, { kind: "topic" }> | { kind: "resource"; id: string } | { kind: "page"; key: string };

/** A Domain's key, the same as a Home, a page and a tab. */
export const domainKey = (name: string) => `area:${name}`;

/** A Home key: the Topic, else the Project, else the Domain. */
export const homeKey = ({ domain, projectId = "", topicId }: { domain: string; projectId?: string; topicId?: string }) =>
  topicId ? `topic:${topicId}` : projectId || domainKey(domain);

export function parseHome(key: string): Place {
  if (key.startsWith("area:")) return { kind: "domain", name: key.slice(5) };
  if (key.startsWith("topic:")) return { kind: "topic", id: key.slice(6) };
  return { kind: "project", id: key };
}

export function tabKey(tab: Tab) {
  switch (tab.kind) {
    case "domain": return domainKey(tab.name);
    case "project": return `project:${tab.id}`;
    case "resource": return `note:${tab.id}`;
    case "page": return tab.key;
  }
}

export function parseTab(key: string): Tab {
  if (key.startsWith("area:")) return { kind: "domain", name: key.slice(5) };
  if (key.startsWith("project:")) return { kind: "project", id: key.slice(8) };
  if (key.startsWith("note:")) return { kind: "resource", id: key.slice(5) };
  return { kind: "page", key };
}

/** A Home as the person reads it: the Domain's name, the Project's title, the Topic with its emoji, or a person's name (D71). */
export function placeName(data: WorkspaceData, key: string) {
  const place = parseHome(key);
  if (place.kind === "domain") return place.name;
  if (place.kind === "topic") {
    const topic = data.topics.find((item) => item.id === place.id);
    return topic ? topic.person ? topic.name : `${topic.emoji} ${topic.name}` : "a topic";
  }
  return data.projects.find((project) => project.id === place.id)?.title ?? "a project";
}

/**
 * Where the Session is. `domain` and `projectId` are the place on screen: the selected Domain, and the open Project or
 * a Resource tab's home Project (none on a global page); chat follows them. `topic` is the Topic open in the Library.
 * `home` is where Capture saves: that Topic, an open Resource's own Home, else that Project, else the selected Domain.
 */
export function here(data: WorkspaceData, session: Session) {
  const tab = session.view ? undefined : parseTab(session.active);
  const note = tab?.kind === "resource" ? data.notes.find((item) => item.id === tab.id) : undefined;
  const projectId = tab?.kind === "project" ? data.projects.find((project) => project.id === tab.id)?.id ?? ""
    : note?.projectId ?? "";
  const topic = session.view === "library" ? data.topics.find((item) => item.id === session.libraryTopic && !item.archived) : undefined;
  return { domain: session.domain, projectId, topic,
    home: topic ? homeKey({ domain: "", topicId: topic.id }) : note ? homeKey(note) : projectId || domainKey(session.domain) };
}
