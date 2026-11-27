// @mentions in the note editor (agents-design D71), apart from MentionPicker.tsx so the fields that start with the app
// (a task's title, Capture) don't load Tiptap and ProseMirror: only the note editor, which loads on demand, imports this.
import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useApp } from "./appContext.ts";
import { MentionList, listKeys, useOffers } from "./MentionPicker.tsx";
import { typedMention } from "./people.ts";

/**
 * @mentions in the note editor: `keysRef` is the ref Tiptap's key handler reads (made before the editor), `page` the
 * element the list is placed in. Returns the list to render after the editor.
 */
export function useEditorMentions(editor: Editor | null, page: RefObject<HTMLElement | null>, keysRef: RefObject<(event: KeyboardEvent) => boolean>) {
  const { actions } = useApp();
  // The @name being typed before the caret, where it starts, and where to show the list.
  const typed = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor || !editor.isFocused || !editor.state.selection.empty) return null;
      const { $from } = editor.state.selection;
      const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
      const found = typedMention(before, before.length);
      const box = page.current?.getBoundingClientRect();
      if (!found || !box) return null;
      const at = editor.view.coordsAtPos($from.pos - found.query.length - 1);
      return { query: found.query, from: $from.pos - found.query.length - 1, to: $from.pos,
        top: at.bottom - box.top + 6, left: Math.max(0, Math.min(at.left - box.left, box.width - 240)) };
    },
  });
  // The highlighted row, kept with the words it was picked for so new words start at the top again.
  const [moved, setMoved] = useState({ query: "", index: 0 });
  const [closed, setClosed] = useState<number>();
  const open = !!typed && typed.from !== closed;
  const offers = useOffers(open ? typed.query : undefined);
  const index = moved.query === typed?.query ? moved.index : 0;
  const count = offers.people.length + (offers.fresh ? 1 : 0);
  const write = (name: string) => {
    if (typed) editor?.chain().focus().insertContentAt({ from: typed.from, to: typed.to }, `@${name} `).run();
  };
  const pick = () => index < offers.people.length ? write(offers.people[index].name) : (write(offers.fresh), actions.newPerson(offers.fresh));
  useLayoutEffect(() => {
    keysRef.current = (event) => open
      && listKeys(event.key, count, index, (next) => setMoved({ query: typed.query, index: next }), pick, () => setClosed(typed.from));
  });
  return open && <MentionList people={offers.people} fresh={offers.fresh} index={index} style={{ top: typed.top, left: typed.left }}
    onPick={(person) => write(person.name)} onNew={(name) => { write(name); actions.newPerson(name); }} />;
}
