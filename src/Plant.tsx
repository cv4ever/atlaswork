// The plant that grows with progress (model.ts `plantStages`), drawn in the palette rather than borrowed from the
// emoji font (DESIGN.md): a seed in the soil, a sprout, a leafy stem, a flower. It sizes to the text around it (1em),
// so each place that shows one sets its size with font-size, as it did for the glyph.
import { plantStages } from "./look.ts";

const soil = <path d="M3 21.2h18" stroke="var(--clay)" strokeWidth="1.6" strokeLinecap="round" opacity="0.6" />;
const leaf = (d: string) => <path d={d} fill="var(--sage)" />;
const stem = (d: string) => <path d={d} fill="none" stroke="var(--skin-accent)" strokeWidth="1.8" strokeLinecap="round" />;

const drawings = [
  // Just planted: a seed resting in the soil.
  <>{soil}<path d="M12 8.5c3.8 2.8 5 6.3 3.4 9.8-.7 1.6-1.9 2.3-3.4 2.3s-2.7-.7-3.4-2.3C7 14.8 8.2 11.3 12 8.5z" fill="var(--clay)" /></>,
  // Sprouting: a short stem with its first two leaves.
  <>{soil}{stem("M12 21v-7")}{leaf("M12 14c-.4-3-2.4-4.6-5.4-4.4.2 3 2.3 4.7 5.4 4.4z")}{leaf("M12 14.6c.3-2.4 1.9-3.7 4.4-3.6-.1 2.5-1.8 3.8-4.4 3.6z")}</>,
  // Growing: a taller stem, leaves up both sides.
  <>{soil}{stem("M12 21V6.5")}{leaf("M12 17c-.5-2.9-2.4-4.3-5.3-4.1.3 2.9 2.3 4.4 5.3 4.1z")}{leaf("M12 14c.5-2.9 2.4-4.3 5.3-4.1-.3 2.9-2.3 4.4-5.3 4.1z")}
    {leaf("M12 10.6c-.4-2.4-2-3.6-4.4-3.4.2 2.4 1.9 3.6 4.4 3.4z")}{leaf("M12 7.2c.2-2.3 1.6-3.6 3.8-3.7 0 2.3-1.4 3.7-3.8 3.7z")}</>,
  // In bloom: the flower open on top.
  <>{soil}{stem("M12 21v-9")}{leaf("M12 18c-.5-2.6-2.2-3.9-4.8-3.7.3 2.6 2.1 4 4.8 3.7z")}{leaf("M12 16.4c.4-2.3 2-3.5 4.3-3.4-.2 2.4-1.8 3.6-4.3 3.4z")}
    <g fill="var(--ochre)">{[0, 60, 120, 180, 240, 300].map((turn) => <ellipse key={turn} cx="12" cy="3.9" rx="1.9" ry="2.9" transform={`rotate(${turn} 12 7.4)`} />)}</g>
    <circle cx="12" cy="7.4" r="2" fill="var(--clay)" /></>,
];

/** One growth stage as a drawing. Decorative: the stage's words sit beside it or in its container's title. */
export default function Plant({ stage }: { stage: (typeof plantStages)[number] }) {
  return <svg className="plant" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">{drawings[plantStages.indexOf(stage)]}</svg>;
}
