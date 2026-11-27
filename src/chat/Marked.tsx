// Find in a chat: a message's text with every hit marked, and how many hits a text holds. The chat panel and the
// Chats page's history share them.
import type { ReactNode } from "react";

/** Text with every case-insensitive hit of `query` marked. */
export function Marked({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return <>{text}</>;
  const parts: ReactNode[] = [];
  const lower = text.toLocaleLowerCase();
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    parts.push(text.slice(from, at), <mark key={at}>{text.slice(at, at + needle.length)}</mark>);
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

/** How many times `needle` (already lowercased) occurs in `text`. */
export function hits(text: string, needle: string) {
  let count = 0;
  const lower = text.toLocaleLowerCase();
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) count++;
  return count;
}
