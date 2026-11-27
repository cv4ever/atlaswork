// A page's blocks as they may be saved (`cleanBlocks`) and as their arrangement compares (`layoutOf`).
import { blockWidths, shownBlocks, viewOf, widgetKinds } from "../blocks.ts";
import type { Block } from "../blocks.ts";

/** A page's arrangement (which shown blocks, in what order, drawn how), ignoring what they logged and what was put away. */
export const layoutOf = (blocks: Block[]) => shownBlocks(blocks).map((block) => `${block.id}:${block.type}:${viewOf(block)}:${block.width ?? ""}`).join();

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isAmount = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * A page as it may be saved: known widgets with unique ids, views and widths they have, real dates and finite numbers.
 * Anything else (an emptied number field, a stale view, a block of a kind this version doesn't know) is dropped, so a
 * saved page always draws.
 */
export function cleanBlocks(blocks: Block[]): Block[] {
  const ids = new Set<string>();
  return blocks.filter((block) => typeof block?.id === "string" && block.id && block.type in widgetKinds && !ids.has(block.id) && ids.add(block.id))
    .map(({ view, width, date, since, removed, target, current, better, entries, days, items, steps, ...rest }) => ({
      ...rest,
      ...view && view in widgetKinds[rest.type].views && { view },
      ...width && width in blockWidths && { width },
      ...isDay(date) && { date }, ...isDay(since) && { since }, ...isDay(removed) && { removed },
      ...isAmount(target) && { target }, ...isAmount(current) && { current },
      ...(better === "up" || better === "down") && { better },
      ...entries && { entries: entries.filter((entry) => isDay(entry?.date) && isAmount(entry.value)) },
      ...days && { days: [...new Set(days.filter(isDay))].sort() },
      ...items && { items: items.filter((item) => typeof item?.text === "string" && item.text.trim()).map((item) => ({ text: item.text.trim(), done: !!item.done })) },
      ...steps && { steps: steps.filter((step) => typeof step?.title === "string" && step.title.trim() && isDay(step.date))
        .map((step) => ({ title: step.title.trim(), date: step.date, done: !!step.done, ...step.done && isDay(step.reached) && { reached: step.reached } }))
        .sort((a, b) => a.date.localeCompare(b.date)) },
    }));
}
