// The resource editor (Tiptap), memoized so unrelated shell changes don't update it. Typing @ offers people (D71).
import { memo, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading2,
  Quote,
  Undo2,
  Redo2,
  Paperclip,
  MessageCircle,
  Archive,
} from "lucide-react";
import type { Note } from "./model.ts";
import { useEditorMentions } from "./EditorMentions.tsx";
import { Tip } from "./Popups.tsx";

const editorAttributes = { "aria-label": "Note content", role: "textbox", "aria-multiline": "true", spellcheck: "true" };

/**
 * Edits a resource's title and your own words about it. `children` (the viewer and its places) sit between the title
 * and the text. The same resource can be open in a tab and in the peek; each picks up the other's edits while unfocused.
 */
export default memo(function NoteEditor({
  note,
  kind = "Personal note",
  onChange,
  onAttach,
  onAsk,
  askLabel = "Atlas",
  onArchive,
  titleEnd,
  children,
}: {
  note: Note;
  kind?: string;
  onChange: (id: string, patch: Partial<Pick<Note, "title" | "body">>) => void;
  onAttach?: (id: string) => void;
  /** Ask about this: the selected words go to the chat as a quote, with the note attached. */
  onAsk?: (id: string, quote: string) => void;
  /** Who the chat opens to, named on the ask buttons. */
  askLabel?: string;
  onArchive: (id: string) => void;
  /** After the title row's buttons: the phone's open-tabs stack when the editor is a tab, not the peek. */
  titleEnd?: ReactNode;
  children?: ReactNode;
}) {
  // The open @ list's keys, read by Tiptap's key handler, which is set once when the editor is made.
  const keysRef = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: note.body,
    contentType: "markdown",
    editorProps: { attributes: editorAttributes, handleKeyDown: (_view, event) => keysRef.current(event) },
    onUpdate: ({ editor }) => onChange(note.id, { body: editor.getMarkdown() }),
  });
  const selected = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold"),
      italic: editor?.isActive("italic"),
      bullet: editor?.isActive("bulletList"),
      ordered: editor?.isActive("orderedList"),
      heading: editor?.isActive("heading", { level: 2 }),
      quote: editor?.isActive("blockquote"),
    }),
  });
  const page = useRef<HTMLElement>(null);
  // Selecting words offers to ask about them, placed just under where the selection ends.
  const ask = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor || !onAsk || !editor.isFocused || editor.state.selection.empty) return null;
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to, "\n").trim();
      const box = page.current?.getBoundingClientRect();
      if (!text || !box) return null;
      const end = editor.view.coordsAtPos(to);
      return { text: text.length > 800 ? `${text.slice(0, 800)}…` : text,
        top: end.bottom - box.top + 8, left: Math.max(0, Math.min(end.left - box.left - 20, box.width - 180)) };
    },
  });
  const mentionList = useEditorMentions(editor, page, keysRef);
  useEffect(() => {
    if (editor && !editor.isFocused && editor.getMarkdown() !== note.body)
      editor.commands.setContent(note.body, { contentType: "markdown", emitUpdate: false });
  }, [editor, note.body]);
  return (
    <article className="note-page" ref={page}>
      <div className="note-title-row">
        <input
          aria-label="Note title"
          className="note-title"
          value={note.title}
          onChange={(event) => onChange(note.id, { title: event.target.value })}
        />
        {onAttach && <button className="quiet-button" onClick={() => onAttach(note.id)}>
          <Paperclip size={16} /> Ask {askLabel} about this
        </button>}
        <Tip label="Archive"><button className="icon-button" aria-label="Archive this resource" onClick={() => onArchive(note.id)}>
          <Archive size={16} />
        </button></Tip>
        {titleEnd}
      </div>
      <div className="note-meta">
        {kind}
        <span className="dot" />
        Saved locally as you write
      </div>
      {children}
      <div
        className="editor-toolbar"
        role="toolbar"
        aria-label="Text formatting"
      >
        <Tip label="Bold"><button aria-label="Bold"
        aria-pressed={!!selected?.bold}
        onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold size={16} />
        </button></Tip>
        <Tip label="Italic"><button aria-label="Italic"
        aria-pressed={!!selected?.italic}
        onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic size={16} />
        </button></Tip>
        <span className="toolbar-divider" />
        <Tip label="Heading"><button aria-label="Heading"
        aria-pressed={!!selected?.heading}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run()
        }>
          <Heading2 size={18} />
        </button></Tip>
        <Tip label="Bulleted list"><button aria-label="Bulleted list"
        aria-pressed={!!selected?.bullet}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <List size={18} />
        </button></Tip>
        <Tip label="Numbered list"><button aria-label="Numbered list"
        aria-pressed={!!selected?.ordered}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={18} />
        </button></Tip>
        <Tip label="Quote"><button aria-label="Quote"
        aria-pressed={!!selected?.quote}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          <Quote size={16} />
        </button></Tip>
        <span className="toolbar-divider" />
        <Tip label="Undo text edit"><button aria-label="Undo text edit"
        onClick={() => editor?.chain().focus().undo().run()}>
          <Undo2 size={16} />
        </button></Tip>
        <Tip label="Redo text edit"><button aria-label="Redo text edit"
        onClick={() => editor?.chain().focus().redo().run()}>
          <Redo2 size={16} />
        </button></Tip>
      </div>
      <EditorContent editor={editor} />
      {mentionList}
      {ask && onAsk && (
        // Pressing it mustn't blur the editor first, or the selection (and with it the chip) is gone before the click.
        <button className="ask-chip" style={{ top: ask.top, left: ask.left }} onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAsk(note.id, ask.text)}>
          <MessageCircle size={14} /> Ask {askLabel}
        </button>
      )}
      <p className="editor-footnote">
        {onAttach ? "A thought doesn't need to be finished to belong here." : "Your own words about it. Why it matters, what to remember."}
      </p>
    </article>
  );
});
