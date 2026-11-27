// The next steps Today draws (agents-design D75): the crew's from the View, then Atlas's plan for the rest of the day
// while you asked for it. The day line and the crew rail read the same list, so a step is dashed in both or neither.
import { useMemo } from "react";
import { useUi, useView } from "../appContext.ts";
import { atlasId } from "../model.ts";
import { planOf } from "./day.ts";
import type { DayStep } from "./day.ts";

export function useDaySteps(): DayStep[] {
  const steps = useView((view) => view.todaySteps);
  const free = useView((view) => view.todayFree);
  const anytime = useView((view) => view.todayDay.anytime);
  const agents = useView((view) => view.data.agents);
  const domains = useView((view) => view.domains);
  const day = useView((view) => view.today);
  const skipped = useView((view) => view.session.todaySkipped);
  const planning = useUi((state) => state.planning);
  return useMemo(() => {
    const atlas = agents.find((agent) => agent.id === atlasId);
    if (!planning || !atlas) return steps;
    const stepped = new Set(steps.flatMap((step) => step.task ? [step.task.id] : []));
    const hues = new Map(domains.map((domain) => [domain.name, domain.hue]));
    return [...steps, ...planOf(anytime, free, atlas, hues, day, skipped.day === day ? skipped.keys : [], stepped)];
  }, [steps, free, anytime, agents, domains, day, skipped, planning]);
}
