/**
 * Daily limits per user per UTC day, and the shared Workers AI budget (10,000 free Neurons a day). The function
 * enforces them (index.ts); the app shows the reply caps on Settings → Account. `userNeurons` is one account's share
 * of that budget (about 18 replies at 111 Neurons), so a few heavy replies can't spend it for everyone. No Deno APIs here.
 */
export const caps = { replies: 20, ownReplies: 200, neurons: 8_000, userNeurons: 2_000 };

/**
 * Work you hand off (agents-design D73): it counts as `replies` of the day's replies, once for the whole job, and may
 * take `rounds` tool rounds and `lookups` lookups in all (a reply: 4 and 3, texts.ts `limits`), over at most `runs`
 * runs and `ms` of running (D76). Each run hands on after `runMs`, which leaves room for the model call under way (an
 * own model's may take 60 s) inside the Edge runtime's 150 s for work after the response; the next run carries on, and
 * the last stops offering tools when the time is up. What it couldn't finish says "Stopped at its limit".
 */
export const background = { replies: 3, rounds: 24, lookups: 24, runs: 6, ms: 600_000, runMs: 80_000 };

/** What the function says when a reply needs a plan, or the account used today's replies or share; the chat offers its own model on each. */
export const refusals = {
  plan: "Atlaswork's model is invite-only for now. Connect your own AI model in Settings → AI model.",
  replies: (cap: number) => `You've used today's ${cap} live replies. They reset at 00:00 UTC.`,
  background: (count: number) => `Work in the background counts as ${count} replies, and today has fewer left. Send it as a normal message, or wait for 00:00 UTC.`,
  share: "You've used today's share of live agents. It resets at 00:00 UTC, or connect your own AI model in Settings → AI model.",
};
/** Whether a chat error is one of those, so connecting a model of your own would let the agent answer. */
export const needsOwnModel = (error: string) => error === refusals.plan || error === refusals.share || error === refusals.replies(caps.replies);
