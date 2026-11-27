// The icon for what a reply reads (agents-design D81): a connected account's own mark (Google Calendar), else the
// app's icon for your files, images, notes, tasks or pages. The sources line and the typing indicator share it.
import { FolderOpen, Image, LayoutGrid, ListChecks, NotebookText } from "lucide-react";
import { GoogleCalendarMark } from "../BrandMarks.tsx";
import type { SourceKind } from "./sources.ts";

const icons = { files: FolderOpen, image: Image, notes: NotebookText, tasks: ListChecks, pages: LayoutGrid };

export function SourceIcon({ kind }: { kind: SourceKind }) {
  if (kind === "calendar") return <GoogleCalendarMark size={14} />;
  const Icon = icons[kind];
  return <Icon size={14} aria-hidden="true" />;
}
