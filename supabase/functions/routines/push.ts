// What a push notification says, and when none goes out (launch plan D17 phase 2b, agents-design D55): one per
// routine run that posted, and one per chat reply the agent function landed after its page had gone (D72), each
// opening its chat; none during the account's quiet hours (they wait in the chat instead), and the service worker
// shows none while the app is on screen (public/push-sw.js). Pure, so tests cover it; send.ts sends.
import { routineKinds } from "../../../src/model.ts";
import { plainOf } from "../../../src/markdown.ts";
import { offsetMinutes } from "./run.ts";
import type { Post } from "./run.ts";

/** Whether `now` falls in quiet hours on the account's clock; `from` and `to` are minutes past midnight and may wrap. */
export function inQuietHours(timeZone: string, now: Date, from: number, to: number) {
  const minute = ((Math.floor(now.getTime() / 6e4) + offsetMinutes(timeZone, now.getTime())) % 1440 + 1440) % 1440;
  if (from === to) return false;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

export type Payload = { title: string; body: string; url: string; tag: string };

/**
 * The notification for one post: who and which routine (a chat reply has none: "Vital replied"; work you handed off
 * says its own `title`, D73), the first words of what they said, and where tapping goes.
 */
export function payloadOf(post: Omit<Post, "kind"> & Partial<Pick<Post, "kind">> & { title?: string }): Payload {
  const words = plainOf(post.text).replace(/\s+/g, " ").trim();
  return {
    title: post.kind ? `${post.agent} · ${routineKinds[post.kind].label}` : post.title ?? `${post.agent} replied`,
    body: words.length > 140 ? `${words.slice(0, 139).trimEnd()}…` : words || "Something for you in the chat.",
    url: `/?do=open&thread=${encodeURIComponent(post.threadId)}`,
    // A newer post in the same chat replaces the older notification rather than stacking.
    tag: post.threadId,
  };
}
