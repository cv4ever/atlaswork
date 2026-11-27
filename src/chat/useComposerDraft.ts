// The chat box's words: typing stays in the panel, and the saved Session (and with it the whole App) hears about it once
// you pause (400 ms), send, or leave. An outside change (sending clears it, another panel saved it) replaces what you're
// typing; nothing else does. `compose` focuses the box once per value, across remounts (Ask about this).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** The last `compose` value served, so reopening the panel later doesn't steal focus again. */
let composed = 0;

export function useComposerDraft(composer: RefObject<HTMLTextAreaElement | null>, draft: string, onDraft: (text: string) => void, compose?: number) {
  const [text, setText] = useState(draft);
  const saved = useRef(draft);
  const pending = useRef<number | undefined>(undefined);
  const latest = useRef({ text, onDraft });
  useLayoutEffect(() => { latest.current = { text, onDraft }; });
  // Only an outside change replaces what you're typing. Checked on every render, not only when `draft` changes: Send
  // saves the text and clears it in one batch, so a message sent within the save delay never shows `draft` changing,
  // and the box kept what was just sent.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- every render on purpose; `saved` stops a second update
  useEffect(() => {
    if (draft !== saved.current) { saved.current = draft; setText(draft); }
  });
  useEffect(() => {
    if (!compose || compose === composed) return;
    // The panel may still be opening (a view transition, the saved layout): wait up to a second for it to show.
    let frame = 0, tries = 60;
    const focus = () => {
      const box = composer.current;
      if ((!box || !box.offsetParent) && --tries > 0) { frame = requestAnimationFrame(focus); return; }
      if (!box) return;
      composed = compose;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
      box.scrollTop = box.scrollHeight;
    };
    frame = requestAnimationFrame(focus);
    return () => cancelAnimationFrame(frame);
  }, [composer, compose]);
  useEffect(() => () => {
    if (pending.current !== undefined) { clearTimeout(pending.current); latest.current.onDraft(latest.current.text); }
  }, []);
  /** Saves `value` now, cancelling the pending save. */
  const saveDraft = (value: string) => {
    clearTimeout(pending.current);
    pending.current = undefined;
    saved.current = value;
    onDraft(value);
  };
  /** Shows `value` in the box and saves it once typing pauses. */
  const type = (value: string) => {
    setText(value);
    clearTimeout(pending.current);
    pending.current = window.setTimeout(() => saveDraft(value), 400);
  };
  return { text, type, saveDraft };
}
