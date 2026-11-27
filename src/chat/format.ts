// Small words the chat panel's parts share: a message's clock time and whether a failure is a usage limit.
import { formatDate } from "../dates.ts";

/** A message's time of day, as the transcript and the context meter show it. */
export const clock = (at: string) => formatDate(new Date(at), { hour: "2-digit", minute: "2-digit" });
/** OpenAI's usage-limit state: Manage usage first, then the reason. */
export const limited = (error: string) => /usage limit/i.test(error);
