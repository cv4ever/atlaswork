// What an agent shows in a reply beyond words (agents-design D64), under its message in AgentPanel: answers you tap,
// and your own widgets and tasks drawn live from your records, so you log a value, tick a habit or finish a task
// without leaving the chat. The agent only points at them (`Display`); every change here is yours, saved as on the page.
// Styles: `.message-choices` and `.message-shown` in chat-panel.css.
import { Check } from "lucide-react";
import { useApp, useView } from "./appContext.ts";
import type { Display } from "./model.ts";
import type { Block } from "./blocks.ts";
import { TaskRows } from "./pageGrid/TaskRows.tsx";
import { parseHome, placeName, tabKey } from "./place.ts";
import { DataBlock } from "./Widgets.tsx";
import * as workspace from "./workspace.ts";

/**
 * The answers an agent offered (`open` while nothing was picked and nobody wrote since). Once answered only the
 * picked one stays, ticked; an answer typed instead folds them away.
 */
export function ChoiceChips({ display, open, onPick }: { display: Display; open: boolean; onPick?: (option: string) => void }) {
  const choices = display.picked ? [display.picked] : open && onPick ? display.choices ?? [] : [];
  if (!choices.length) return null;
  return (
    <div className="message-choices" role="group" aria-label="Answers you can tap">
      {choices.map((option) => display.picked
        ? <span key={option} className="message-choice is-picked"><Check size={14} aria-hidden="true" />{option}</span>
        : <button key={option} type="button" className="message-choice" onClick={() => onPick!(option)}>{option}</button>)}
    </div>
  );
}

/** The widgets and tasks a reply points at, as they are now: what's gone since says so in one quiet line. */
export function ShownItems({ display, readOnly }: { display: Display; readOnly: boolean }) {
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const blocks = (display.blocks ?? [])
    .map(({ place, id }) => ({ place, block: workspace.pageOf(data, place)?.find((item) => item.id === id && !item.removed) }));
  const tasks = (display.taskIds ?? []).flatMap((id) => data.tasks.find((task) => task.id === id) ?? []);
  const gone = blocks.filter((item) => !item.block).length + (display.taskIds?.length ?? 0) - tasks.length;
  const save = (place: string) => (next: Block) => { actions.apply((d) => workspace.editBlock(d, place, next)); };
  // A domain page's Home key is its tab; a project's Home is its bare id, its tab `project:<id>`.
  const open = (place: string) => {
    const home = parseHome(place);
    if (home.kind !== "topic") actions.openTab(tabKey(home));
  };
  return (
    <div className="message-shown" inert={readOnly || undefined}>
      {blocks.map(({ place, block }) => block && (
        <figure key={`${place}/${block.id}`}>
          <DataBlock block={block} today={today} notes={data.notes} onChange={save(place)}
            onOpenNote={(note) => actions.openResource(note, false, [note.id])} onEditNote={(id, body) => actions.changeNote(id, { body })} />
          <figcaption><button type="button" className="text-button" onClick={() => open(place)}>On {placeName(data, place)}</button></figcaption>
        </figure>
      ))}
      {tasks.length > 0 && <div className="message-tasks"><TaskRows tasks={tasks} showDomain /></div>}
      {gone > 0 && <p className="message-gone">{gone === 1 ? "One thing shown here is gone from its page." : `${gone} things shown here are gone from their pages.`}</p>}
    </div>
  );
}
