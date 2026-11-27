// How the transcript moves: new messages ease in (switching threads doesn't replay the history), the view stays at the
// bottom as messages arrive, a jump into history or a tap on what waits on you holds the view there until the next
// message or thread change, and the find bar's current match is marked and centred.
import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Agent, Thread } from "../model.ts";

type Scroll = {
  thread: Thread;
  thinking: Agent | null;
  /** The find bar's query, trimmed and lowercased: while finding, the view doesn't jump to the bottom. */
  needle: string;
  /** The current match among the transcript's `<mark>`s. */
  findIndex: number;
  /** Scroll to this message once per `nonce`. */
  jumpTo?: { threadId: string; index: number; nonce: number };
};

export function useTranscriptScroll(transcript: RefObject<HTMLDivElement | null>, { thread, thinking, needle, findIndex, jumpTo }: Scroll) {
  const previous = useRef({ id: thread.id, messages: thread.messages });
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { id: thread.id, messages: thread.messages };
    const pane = transcript.current;
    if (before.id !== thread.id || !pane?.getClientRects().length || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const prior = new Map(before.messages.map((message) => [message.id, message]));
    for (const message of thread.messages) {
      const old = prior.get(message.id);
      if (old === message) continue;
      const row = pane.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
      if (!row) continue;
      if (!old) {
        row.animate([{ opacity: 0.6, transform: `translate(${message.role === "user" ? "7px" : "0"}, 4px)` }, { opacity: 1, transform: "none" }],
          { duration: 200, easing: "ease-out" });
        row.querySelector(".proposal")?.animate([{ opacity: 0.7, transform: "perspective(600px) rotateX(-9deg) scale(0.98)" }, { opacity: 1, transform: "none" }],
          { duration: 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
      } else if (message.proposal?.status !== old.proposal?.status) {
        row.querySelector(".proposal-result")?.animate([{ opacity: 0.65, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }],
          { duration: 180, easing: "ease-out" });
      }
    }
  }, [thread, transcript]);
  // A jump into history holds the view until the next message or thread change.
  const held = useRef(false);
  useEffect(() => {
    const pane = transcript.current;
    held.current = false;
    if (!pane || needle) return;
    // Again once layout settles: the transcript uses content-visibility, so a fresh load can lay it out late, and a panel
    // opened from hidden only gets its height then.
    const bottom = () => { if (!held.current) pane.scrollTo({ top: pane.scrollHeight }); };
    bottom();
    let height = pane.clientHeight;
    const sized = new ResizeObserver(() => { if (!height) bottom(); height = pane.clientHeight; });
    sized.observe(pane);
    pane.addEventListener("contentvisibilityautostatechange", bottom);
    return () => { sized.disconnect(); pane.removeEventListener("contentvisibilityautostatechange", bottom); };
  }, [transcript, thread.id, thread.messages.length, thinking, needle]);
  // Declared after the scroll to the bottom so a jump wins when both run.
  useEffect(() => {
    const message = jumpTo?.threadId === thread.id ? thread.messages[jumpTo.index] : undefined;
    const row = message && transcript.current?.querySelector(`[data-message-id="${CSS.escape(message.id)}"]`);
    if (!row) return;
    held.current = true;
    row.scrollIntoView({ block: "center" });
    row.animate([{ background: "var(--accent-soft)" }, { background: "transparent" }], { duration: 1600, easing: "ease-out" });
    // Once per jump: the jump arrives in the same commit as its thread, and returning to the tab later doesn't replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the jump's nonce on purpose
  }, [jumpTo?.nonce]);
  useEffect(() => {
    const marks = transcript.current?.querySelectorAll("mark") ?? [];
    marks.forEach((mark, index) => mark.toggleAttribute("data-current", index === findIndex));
    marks[findIndex]?.scrollIntoView({ block: "center" });
  }, [transcript, needle, findIndex, thread.messages]);

  /** Brings the first card waiting on you into view, for the header's status, and holds it there. */
  const showWaiting = () => {
    const card = transcript.current?.querySelector(".proposal.pending");
    if (!card) return;
    held.current = true;
    card.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    card.animate([{ boxShadow: "0 0 0 3px var(--attention)" }, { boxShadow: "0 0 0 3px transparent" }], { duration: 1400, easing: "ease-out" });
  };
  return { showWaiting };
}
