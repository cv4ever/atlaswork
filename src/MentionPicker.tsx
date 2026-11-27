// Typing @ offers people (agents-design D71): a short list under the caret, names that start with what you typed
// first, and New person last, which writes the name and opens the person dialog. Arrow keys move, Enter or Tab picks,
// Escape closes. `useMentions` serves plain fields (a task's title, Capture); the note editor's own lives in
// EditorMentions.tsx, so these fields never load Tiptap.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, SyntheticEvent } from "react";
import { UserPlus } from "lucide-react";
import { useApp, useView } from "./appContext.ts";
import { peopleFor, peopleOf, typedMention } from "./people.ts";
import type { PersonTopic } from "./people.ts";
import { PersonFace } from "./PersonFace.tsx";

/** What a list offers for `query`: matching people, then New person when the words name nobody yet. */
export function useOffers(query: string | undefined) {
  const topics = useView((view) => view.data.topics);
  const people = useMemo(() => peopleOf(topics), [topics]);
  if (query === undefined) return { people: [], fresh: "" };
  const offered = peopleFor(people, query);
  const fresh = query.trim() && !people.some((person) => person.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase()) ? query.trim() : "";
  return { people: offered, fresh };
}

/**
 * The list itself, at `style`: under the caret in a note, or `floating` in the top layer at the field (a popover),
 * where no card's edge, stacking or dialog can cut it off. `index` is the highlighted row; New person is the last.
 */
export function MentionList({ people, fresh, index, style, floating, onPick, onNew }: { people: PersonTopic[]; fresh: string; index: number;
  style?: CSSProperties; floating?: boolean; onPick: (person: PersonTopic) => void; onNew: (name: string) => void }) {
  const list = useRef<HTMLUListElement>(null);
  const shown = people.length > 0 || !!fresh;
  useLayoutEffect(() => { if (floating && shown && !list.current?.matches(":popover-open")) list.current?.showPopover(); });
  if (!shown) return null;
  // Pressing a row mustn't blur the field first, or the caret (and the @ being typed) is gone before the click.
  const hold = (event: ReactMouseEvent) => event.preventDefault();
  return (
    <ul ref={list} popover={floating ? "manual" : undefined} className={`mention-picker${floating ? " is-floating" : ""}`} role="listbox" aria-label="People"
      style={style}>
      {people.map((person, at) => (
        <li key={person.id} role="option" aria-selected={at === index}><button type="button" tabIndex={-1} onMouseDown={hold} onClick={() => onPick(person)}>
          <PersonFace person={person} size={22} />{person.name}{person.person.relation && <small>{person.person.relation}</small>}
        </button></li>
      ))}
      {fresh && <li role="option" aria-selected={index === people.length}><button type="button" tabIndex={-1} onMouseDown={hold} onClick={() => onNew(fresh)}>
        <UserPlus size={14} aria-hidden="true" />New person “{fresh}”</button></li>}
    </ul>
  );
}

/** Arrow keys, Enter, Tab and Escape while a list is open; true when the key was the list's. */
export function listKeys(key: string, count: number, index: number, setIndex: (index: number) => void, pick: () => void, close: () => void) {
  if (!count) return false;
  if (key === "ArrowDown" || key === "ArrowUp") { setIndex((index + (key === "ArrowDown" ? 1 : count - 1)) % count); return true; }
  if (key === "Enter" || key === "Tab") { pick(); return true; }
  if (key === "Escape") { close(); return true; }
  return false;
}

type Field = HTMLInputElement | HTMLTextAreaElement;

/**
 * @mentions for a plain field holding `value`: spread `field` on the input (it wraps your onChange), render `list`
 * after it inside an element with `position: relative`.
 */
export function useMentions<T extends Field>(value: string, setValue: (value: string) => void) {
  const { actions } = useApp();
  const ref = useRef<T>(null);
  const [typed, setTyped] = useState<{ query: string; at: number }>();
  const [index, setIndex] = useState(0);
  const [place, setPlace] = useState<CSSProperties>();
  const { people, fresh } = useOffers(typed?.query);
  const count = people.length + (fresh ? 1 : 0);
  const write = (name: string) => {
    if (!typed) return;
    const end = typed.at + 1 + typed.query.length;
    const next = `${value.slice(0, typed.at)}@${name} ${value.slice(end)}`;
    setValue(next);
    setTyped(undefined);
    const caret = typed.at + name.length + 2;
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(caret, caret); });
  };
  // Fixed to the field, under it, or over it when the window's foot is near.
  const look = (field: Field) => {
    setTyped(typedMention(field.value, field.selectionStart ?? field.value.length));
    setIndex(0);
    const box = field.getBoundingClientRect();
    const room = box.bottom + 240 <= window.innerHeight;
    setPlace({ position: "fixed", left: box.left, ...room ? { top: box.bottom + 4 } : { top: "auto", bottom: window.innerHeight - box.top + 4 } });
  };
  const field = {
    ref,
    onKeyDown: (event: ReactKeyboardEvent<T>) => {
      if (typed && listKeys(event.key, count, index, setIndex,
        () => index < people.length ? write(people[index].name) : (write(fresh), actions.newPerson(fresh)), () => setTyped(undefined))) event.preventDefault();
    },
    onSelect: (event: SyntheticEvent<T>) => look(event.currentTarget),
    onBlur: () => setTyped(undefined),
  };
  const list = typed && <MentionList people={people} fresh={fresh} index={index} style={place} floating onPick={(person) => write(person.name)}
    onNew={(name) => { write(name); actions.newPerson(name); }} />;
  return { field, list };
}
