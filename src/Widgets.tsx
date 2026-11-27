// Page blocks that keep their own data (D32): countdowns, trackers, habits, goals, checklists, milestones and pinned
// notes, each with three views (D39) picked from the block's own view menu. `DataBlock` picks the block's kind; each
// kind is its own file in src/dataBlocks/, with what they share (`ViewMenu`, `Burst`, day words) in `parts.tsx`, which
// the record widgets drawn in App.tsx use too, and the page editor in `PageEditor.tsx`. The editor and data blocks send
// the blocks to show; Workspace decides what is put away. Block kinds, views and widths are `widgetKinds` and
// `blockWidths` in blocks.ts; a project page's finish line and verdict come from pace.ts.
import type { Note } from "./model.ts";
import type { Block } from "./blocks.ts";
import type { Pace } from "./pace.ts";
import { Countdown } from "./dataBlocks/Countdown.tsx";
import { Tracker } from "./dataBlocks/Tracker.tsx";
import { Habit } from "./dataBlocks/Habit.tsx";
import { Goal } from "./dataBlocks/Goal.tsx";
import { Checklist } from "./dataBlocks/Checklist.tsx";
import { Milestones } from "./dataBlocks/Milestones.tsx";
import { PinnedNote } from "./dataBlocks/PinnedNote.tsx";

/** Draws a block that keeps its own data; record widgets draw in App. */
export function DataBlock({ block, today, notes, pace, onChange, onOpenNote, onEditNote }: {
  block: Block; today: string; notes: Note[]; pace?: Pace;
  onChange: (block: Block) => void; onOpenNote: (note: Note) => void; onEditNote: (id: string, body: string) => void;
}) {
  if (block.type === "countdown") return <Countdown block={block} today={today} onChange={onChange} pace={pace} />;
  if (block.type === "tracker") return <Tracker block={block} today={today} onChange={onChange} />;
  if (block.type === "habit") return <Habit block={block} today={today} onChange={onChange} />;
  if (block.type === "goal") return <Goal block={block} today={today} onChange={onChange} />;
  if (block.type === "checklist") return <Checklist block={block} onChange={onChange} />;
  if (block.type === "milestones") return <Milestones block={block} today={today} onChange={onChange} />;
  if (block.type === "note") return <PinnedNote block={block} notes={notes} today={today} onOpen={onOpenNote} onChange={onChange} onEdit={onEditNote} />;
  return null;
}
