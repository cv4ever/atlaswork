// Coming up (agents-design D75): the seven days after today as tiles with their first tasks, the busiest ringed, then the
// next dated thing from any page or person, with what its agent says about it and that brief's one action.
import { useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { useApp, useView } from "../appContext.ts";
import { formatDate } from "../dates.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { daysTo } from "../pageGrid/due.ts";
import { Tip } from "../Popups.tsx";
import * as workspace from "../workspace.ts";
import { StartForm } from "./cards.tsx";
import type { PagePlace } from "./derive.ts";

/** A wait in words: "tomorrow", "in 9 days", "in 3 weeks", "in 2 months". */
const waitWords = (days: number) => days === 1 ? "tomorrow" : days < 15 ? `in ${days} days` : days < 60 ? `in ${Math.round(days / 7)} weeks` : `in ${Math.round(days / 30)} months`;

export function TodayAhead() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const today = useView((view) => view.today);
  const evening = useView((view) => view.evening);
  const { days, week, busiest } = useView((view) => view.todayTasks);
  const horizon = useView((view) => view.todayHorizon);
  const briefs = useView((view) => view.todayBriefs);
  const domains = useView((view) => view.domains);
  const [adding, setAdding] = useState(false);
  const next = horizon.find((item) => item.date > today);
  const said = next && briefs.flat().find((entry) => entry.open === next.open);
  const mark = (title: string, at: PagePlace, date: string) => {
    const added = !!actions.apply((d) => workspace.addBlock(d, at.place, { id: `countdown-${crypto.randomUUID().slice(0, 8)}`, type: "countdown", title, date, since: today, width: "narrow" }));
    if (added) { actions.toast(`“${title}” is counting down on ${at.label}'s page.`); setAdding(false); }
    return added;
  };
  return (
    <section className="today-card today-ahead" aria-label="Coming up">
      <div className="section-heading"><h2><CalendarDays size={16} />{evening ? "Tomorrow and after" : "Coming up"}</h2>
        <span className="heading-actions"><span>{week} this week</span>
          <Tip label="Add a date to look forward to"><button className="icon-button heading-add" aria-label="Add a date to look forward to" aria-expanded={adding}
            onClick={() => setAdding(!adding)}><Plus size={16} /></button></Tip></span></div>
      {adding && <StartForm dated label="What's coming" onAdd={mark} onCancel={() => setAdding(false)} />}
      <ol className="ahead-days">
        {days.map(({ day, tasks }) => {
          const date = new Date(`${day}T12:00:00`);
          const weekend = [0, 6].includes(date.getDay()) || undefined;
          return (
            <li key={day} data-weekend={weekend} data-busiest={busiest > 2 && tasks.length === busiest || undefined}>
              <h3><strong>{date.getDate()}</strong>{formatDate(date, { weekday: "short" })}</h3>
              {tasks.slice(0, 2).map((task) => (
                <button key={task.id} className="ahead-task" style={{ "--hue": domains.find((domain) => domain.name === task.domain)?.hue } as CSSProperties}
                  onClick={() => actions.editTask(task)}>{task.title}</button>
              ))}
              {tasks.length > 2 && <small>+{tasks.length - 2} more</small>}
            </li>
          );
        })}
        {next && (
          <li className="ahead-next" data-said={said ? "" : undefined} style={{ "--hue": next.hue } as CSSProperties}>
            <h3><span>{next.title}</span><small>{formatDate(new Date(`${next.date}T12:00:00`), { day: "numeric", month: "short" })} · {waitWords(daysTo(next.date, today))}</small></h3>
            {said ? <>
              <p><img src={portraitSrc(said.brief.agent)} alt="" /><span><strong>{said.brief.agent.name}:</strong> {said.brief.title}</span></p>
              <span className="ahead-next-actions">
                <button className="primary-button" onClick={() => actions.actOnBrief(said.brief.action)}>{said.brief.action.label}</button>
                <button className="quiet-button" onClick={() => actions.openDated(next)}>Open</button>
              </span>
            </> : <button className="quiet-button" onClick={() => actions.openDated(next)}>Open {next.label}</button>}
          </li>
        )}
      </ol>
    </section>
  );
}
