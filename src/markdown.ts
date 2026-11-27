// Agent replies in Markdown (agents-design D64): whether a reply needs the rich renderer (RichText.tsx, loaded only
// then, so plain replies stay as light as before), and its words without the marks for one-line previews (the
// sidebar, the Chats list, the peek and a routine's push). Pure: the routines function imports it too.

/** A reply that uses Markdown worth drawing: emphasis, code, a link, a list, a heading, a quote or a table. */
const marks = /\*\*|__|~~|`|\[[^\]\n]+\]\([^)\s]+\)|^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s|^\s{0,3}#{1,6}\s|^\s{0,3}>|^\s*\|.*\|\s*$/m;
export const hasMarks = (text: string) => marks.test(text);

/** The reply's words without Markdown marks: a table row reads "a · b", a list item its text, a link its label. */
export function plainOf(text: string) {
  if (!hasMarks(text)) return text;
  return text
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, "$1")
    .split("\n")
    // A table's rule row (|---|:-:|) and a --- line go; a table's other rows keep their cells.
    .filter((line) => !/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) || !line.includes("|") && !/-{3,}/.test(line))
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, "")
      .replace(/^\s{0,3}>\s?/, "")
      .replace(/^\s*(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?/, "")
      .replace(/^\s*\|(.*?)\|?\s*$/, (_row, cells: string) => cells.split("|").map((cell) => cell.trim()).filter(Boolean).join(" · ")))
    .join("\n")
    .replace(/!?\[([^\]\n]*)\]\([^)\s]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    // Single * or _ emphasis, only where it wraps words, so snake_case and 2 * 3 stay.
    .replace(/(^|[\s(])([*_])(\S(?:[^*_\n]*\S)?)\2(?=[\s.,;:!?)]|$)/gm, "$1$3");
}
