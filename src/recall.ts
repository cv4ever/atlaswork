// Which memories an agent reads (agents-design D49, D80): all it may see, up to `most`, and past that the ones whose
// words best match the message, ties to the newest. Words compare without case or accents, as the computer search
// index does, common English and Portuguese words don't count, and two words of four letters or more match when one
// starts the other ("receipt", "receipts"). The list read is newest first, as the prompt says. Pure, so the browser,
// the agent function and the routines runners pick the same list, and a correction's m1, m2… bind to what was shown.

const common = new Set([
  "the", "and", "for", "are", "was", "were", "with", "that", "this", "these", "those", "you", "your", "yours", "have", "has", "had", "not",
  "but", "from", "they", "them", "their", "what", "when", "where", "which", "who", "whom", "why", "how", "will", "would", "can", "could",
  "should", "about", "into", "there", "then", "than", "our", "out", "all", "any", "its", "his", "her", "she", "him", "one", "also", "just",
  "please", "tell", "know", "does", "did", "get", "got",
  "que", "para", "com", "uma", "uns", "umas", "por", "mais", "como", "dos", "das", "nos", "nas", "mas", "foi", "ser", "tem", "seu", "sua",
  "seus", "suas", "isso", "isto", "este", "esta", "esse", "essa", "onde", "quando", "qual", "quem", "sobre", "meu", "minha", "meus",
  "minhas", "pelo", "pela", "ele", "ela", "eles", "elas", "nao", "sim", "ate", "num", "numa", "tambem", "porque",
]);

/** A text's words that count: without case or accents, three letters or more, and not common. */
export function wordsOf(text: string): string[] {
  const words = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(words.filter((word) => word.length > 2 && !common.has(word)))];
}

/** Two words alike: the same, or of four letters or more with one starting the other ("receipt", "receipts"). */
const alike = (a: string, b: string) => a === b || a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a));

/**
 * The memories to read for `message`: every one up to `most`, else the `most` that match it best; newest first.
 * `matched` is what of a memory the message is matched against: its text, and where the caller says, its place.
 */
export function recall<T extends { text: string; at: string }>(memories: readonly T[], message: string, most: number,
  matched: (memory: T) => string = (memory) => memory.text): T[] {
  const newest = [...memories].sort((a, b) => b.at.localeCompare(a.at));
  const asked = wordsOf(message);
  if (newest.length <= most || !asked.length) return newest.slice(0, most);
  const scored = newest.map((memory, index) => {
    const words = wordsOf(matched(memory));
    return { index, score: asked.filter((word) => words.some((other) => alike(word, other))).length };
  });
  const picked = new Set(scored.sort((a, b) => b.score - a.score || a.index - b.index).slice(0, most).map(({ index }) => index));
  return newest.filter((_, index) => picked.has(index));
}
