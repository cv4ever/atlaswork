// Thinking as a plant (agents-design D82): the account's own setting a dashed ring, Fast a seed, Balanced a sprout,
// Thorough a full stem. Drawn in Lucide's stroke so it sits beside the app's icons.
import type { Effort } from "../../supabase/functions/agent/responses.ts";

const shapes: Record<Effort | "default", string[]> = {
  default: ["M12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14"],
  low: ["M12 19c-3 0-5-2.3-5-5.2S9.4 7.6 12 5.5c2.6 2.1 5 5.4 5 8.3S15 19 12 19Z", "M12 9.5v6"],
  medium: ["M12 21v-8", "M12 15c-4 0-6.5-2.4-6.5-6 3.8 0 6.5 2.2 6.5 6Z", "M12 13c0-4 2.6-6.8 6.5-6.8 0 4-2.7 6.8-6.5 6.8Z"],
  high: ["M12 22V3.5", "M12 18c-3.4 0-5.6-2-5.6-5.2 3.3 0 5.6 2 5.6 5.2Z", "M12 14c0-3.3 2.2-5.6 5.6-5.6 0 3.3-2.3 5.6-5.6 5.6Z",
    "M12 9.5C9.5 9.5 8 8 8 5.6c2.4 0 4 1.5 4 3.9Z", "M12 21c0-2.4 1.6-4 4-4 0 2.4-1.6 4-4 4Z"],
};

/** The plant for `effort`; null is the account's setting. Decorative: say the level beside it. */
export function ThinkingGlyph({ effort, size = 14 }: { effort: Effort | null; size?: number }) {
  const level = effort ?? "default";
  return (
    <svg className="thinking-glyph" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" strokeDasharray={level === "default" ? "2.4 2.4" : undefined} aria-hidden="true">
      {shapes[level].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
