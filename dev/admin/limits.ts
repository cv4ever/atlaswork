// What the admin page lets an edit hold, shared by the page and the source edits (source.ts) without loading the
// TypeScript compiler into the browser.

/** The agent dialog's own limits for role and house rules (src/AgentDialog.tsx), so a person can still edit the default they get. */
export const patchLimits = { role: 40, instructions: 400, why: 60, says: 200 };
/** Longest wording a ground rule, template, tool description or command prompt line may have; the longest today is about 600 characters. */
export const lineLimit = 1200;
/**
 * The `limits` (supabase/functions/agent/texts.ts) the admin page edits: how much of the workspace a prompt lists.
 * Ranges keep a request within what the function accepts and the model's context.
 */
export const listingLimits = {
  titles: { label: "Note titles", min: 0, max: 100, does: "Newest note titles listed in the prompt; read_notes finds the rest. Also caps the linked files listed." },
  crew: { label: "Other agents", min: 0, max: 30, does: "Other agents named in the prompt, each with their places (D50)." },
  pages: { label: "Page lines", min: 0, max: 100, does: "Lines summarising the pages where the agent works (dates, checklists, goals)." },
  pageLine: { label: "Page line length", min: 100, max: 2000, does: "Characters of each page line." },
  history: { label: "Session history", min: 1, max: 30, does: "Earlier messages of the session sent with each reply." },
  memories: { label: "Memories", min: 0, max: 100, does: "Remembered things sent with a request: every one up to this many, past it those whose words best match the message (D49, D80)." },
  choices: { label: "Choices in a tool", min: 0, max: 50, does: "Longest list of values (places, domains, views) a tool's schema spells out; a longer one, such as Atlas's places, is listed once in the prompt instead." },
  pageFacts: { label: "Page lines inline", min: 200, max: 10000, does: "Characters of page lines the prompt carries; past it, it keeps each place and goal and read_pages has the rest (D66)." },
  noteText: { label: "Note text in a search", min: 100, max: 1500, does: "Characters of each note read_notes returns for a search with several matches; a note's exact title reads all of it (D66)." },
  recentTurns: { label: "Whole recent messages", min: 1, max: 30, does: "The latest session messages sent whole; earlier ones are cut to the length below (D66)." },
  olderTurn: { label: "Older message length", min: 50, max: 6000, does: "Characters kept of each earlier session message (D66)." },
} as const;
