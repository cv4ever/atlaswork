// What the app was opened to do from outside it (agents-design D52): a home-screen shortcut (`?do=note`, `voice`,
// `atlas`, `today` or `needs`), Android's Share sheet (the manifest's share_target sends `share_title`, `share_text`
// and `share_url`), or a routine's notification (`?do=open&thread=…`, D55). Each one opened adds one to today's
// anonymous count (usage.ts).

export const shortcuts = ["note", "voice", "atlas", "today", "needs"] as const;
type Shortcut = (typeof shortcuts)[number];
export type LaunchIntent = { [K in Shortcut]: { kind: K } }[Shortcut] | { kind: "share"; text: string } | { kind: "open"; thread: string };
/** A chat a notification may open: an agent's, a project room, a team or a started room. */
const threadId = /^(agent|room|team|chat):[^\s]{1,200}$/;

const shareKeys = ["share_title", "share_text", "share_url"] as const;

/**
 * One capture text from what an app shared. Apps put a page's address in `url` or inside `text` (Chrome on Android
 * does the latter); when the address is all there is besides the title, the text is just the address, so it saves as
 * a link. Otherwise the title, text and address each get a line, once.
 */
export function sharedText(title = "", text = "", url = "") {
  const address = url.trim() || text.match(/https?:\/\/\S+/i)?.[0] || "";
  const rest = (address ? text.replace(address, "") : text).trim();
  if (address && (!rest || rest === title.trim())) return address;
  return [...new Set([title.trim(), text.trim(), url.trim()].filter(Boolean))].join("\n");
}

/** The intent in `url`, if any. */
export function launchIntentOf(url: URL): LaunchIntent | null {
  const params = url.searchParams;
  if (shareKeys.some((key) => params.has(key))) {
    const text = sharedText(params.get("share_title") ?? "", params.get("share_text") ?? "", params.get("share_url") ?? "");
    return text ? { kind: "share", text } : null;
  }
  if (params.get("do") === "open") {
    const thread = params.get("thread") ?? "";
    return threadId.test(thread) ? { kind: "open", thread } : null;
  }
  const action = shortcuts.find((shortcut) => shortcut === params.get("do"));
  return action ? { kind: action } : null;
}

/** Reads the intent from the address bar and removes it, so a reload or Back doesn't run it again. */
export function takeLaunchIntent(): LaunchIntent | null {
  const url = new URL(location.href);
  const intent = launchIntentOf(url);
  const keys = [...shareKeys, "do", "thread"];
  if (!keys.some((key) => url.searchParams.has(key))) return intent;
  for (const key of keys) url.searchParams.delete(key);
  history.replaceState(history.state, "", url);
  return intent;
}
