// Your crew today (D40, agents-design D75): Atlas's line on what matters most, each agent's next step for your day with
// Apply, Other time and Not now, the rest of the crew's news, who has nothing to say, Plan the rest of my day, and the
// chat with whoever answers here.
import type { CSSProperties } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronRight, Clock, MessageCircle, MessagesSquare, Sprout } from "lucide-react";
import { AvatarStack } from "../AvatarStack.tsx";
import { useApp, useUi, useView } from "../appContext.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { atlasId } from "../model.ts";
import { Picker, Tip } from "../Popups.tsx";
import { atlasLineOf, clockOf, dayParts, minuteNow } from "./day.ts";
import type { DayStep } from "./day.ts";
import { useDaySteps } from "./steps.ts";

/** One next step: who suggests it, where it lands in your day and why; nothing changes until Apply. `face` is false
 *  when the agent's face already shows above it (Atlas heads the rail; one face per agent on screen, D40). */
function CrewStep({ step, face }: { step: DayStep; face: boolean }) {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const free = useView((view) => view.todayFree);
  // A plan's step put elsewhere is answered: the plan's own time no longer stands, so the step leaves the rail for today.
  const place = (at: string, words: string) => {
    if (!step.task) return;
    actions.placeInDay([{ id: step.task.id, at }], `Put “${step.title}” ${words}.`);
    if (step.proposal) actions.skipStep(step.key);
  };
  return (
    <article id={`step-${step.key}`} tabIndex={-1} className="crew-step" style={{ "--hue": step.hue } as CSSProperties} aria-label={`${step.agent.name} suggests: ${step.title}`}>
      {face && <img src={portraitSrc(step.agent)} alt="" />}
      <p className="crew-step-who"><strong>{step.agent.name}</strong><span>{step.label}</span>
        <span className="crew-step-when"><Clock size={12} aria-hidden="true" />{step.minute === undefined ? "Today" : clockOf(step.minute)}</span></p>
      <h3>{step.title}</h3>
      <p className="crew-step-why">{step.why}</p>
      <div className="crew-step-actions">
        <button className="primary-button" onClick={() => actions.applySteps([step])}>Apply</button>
        {step.task && (!step.proposal || step.proposal.change) && (
          <Picker className="tray-menu" label={`Another time for “${step.title}”`} tip="Pick another time"
            trigger={<button type="button" className="quiet-button">Other time</button>}>
            <Menu.GroupLabel>Another time today</Menu.GroupLabel>
            {free.filter((minute) => minute !== step.minute).slice(0, 4).map((minute) => (
              <Menu.Item key={minute} onClick={() => place(clockOf(minute), `at ${clockOf(minute)}`)}>At {clockOf(minute)}, free</Menu.Item>
            ))}
            {dayParts.map((part) => <Menu.Item key={part.part} onClick={() => place(part.part, `in the ${part.label.toLowerCase()}`)}>In the {part.label.toLowerCase()}</Menu.Item>)}
            <Menu.Item onClick={() => place("", "in today's tray")}>Anytime today</Menu.Item>
          </Picker>
        )}
        {step.proposal && <button className="quiet-button" onClick={() => actions.openConversation(step.proposal!.thread)}>See it</button>}
        <button className="quiet-button" onClick={() => actions.skipStep(step.key)}>Not now</button>
      </div>
    </article>
  );
}

/** Names as a short list: "Hearth and Ledger", "Hearth, Kin and 2 more". */
const namesOf = (names: string[]) => names.length <= 2 ? names.join(" and ") : names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]}`
  : `${names[0]}, ${names[1]} and ${names.length - 2} more`;

export function TodayCrew() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const steps = useDaySteps();
  const planning = useUi((state) => state.planning);
  const all = useUi((state) => state.allBriefs);
  const briefs = useView((view) => view.todayBriefs);
  const asks = useView((view) => view.todayAsks);
  const ideas = useView((view) => view.todayIdeas);
  const quiet = useView((view) => view.todayQuiet);
  const open = useView((view) => view.todayTasks.open);
  const anytime = useView((view) => view.todayDay.anytime);
  const focus = useView((view) => view.todayFocus);
  const today = useView((view) => view.today);
  const now = useView((view) => view.now);
  const atlas = useView((view) => view.data.agents.find((agent) => agent.id === atlasId));
  const current = useView((view) => view.chat.current);
  const unread = useView((view) => view.chat.unreadTotal);
  const faces = useView((view) => view.facesOnPage);
  const shownFaces = current.agents.filter((agent) => !faces.has(agent.id));
  const line = atlasLineOf(open, focus, steps, today, minuteNow(now));
  // An agent's step is its news; the others keep their rows below, most pressing first.
  const news = briefs.filter((entries) => !steps.some((step) => step.agent.id === entries[0].brief.agent.id));
  return (
    <section className="today-card today-crew" aria-label="Your crew today">
      <div className="crew-atlas">
        {atlas && <img src={portraitSrc(atlas)} alt="" />}
        <h2>Your crew today<small>{atlas?.name ?? "Atlas"}, on what matters most</small></h2>
        <p>{line.lead ? <><button className="text-button" onClick={() => actions.editTask(line.lead!)}>{line.lead.title}</button>{line.after}</> : <>{line.before}{line.after}</>}</p>
      </div>
      {(all ? steps : steps.slice(0, 3)).map((step, index, shown) => (
        <CrewStep key={step.key} step={step} face={step.agent.id !== atlas?.id && !shown.slice(0, index).some((other) => other.agent.id === step.agent.id)} />
      ))}
      {asks.length > 0 && (
        <button className="crew-news" onClick={() => actions.openConversation(asks[0].thread)}>
          <span className="today-asks-icon" aria-hidden="true"><MessagesSquare size={18} /></span>
          <span><strong>{asks.length === 1 ? "A question waits" : `${asks.length} questions wait`}</strong>
            <small>{asks[0].from.name} wants to ask {asks[0].to.name}{asks.length > 1 ? `, and ${asks.length - 1} more` : ""}</small></span>
        </button>
      )}
      {ideas.length > 0 && (
        <button className="crew-news" onClick={() => actions.chatWith(ideas[0].thread)}>
          <span className="today-asks-icon" aria-hidden="true"><Sprout size={18} /></span>
          <span><strong>{ideas.length === 1 ? `${ideas[0].agent.name} has ideas for next week` : `${ideas.length} agents have ideas for next week`}</strong>
            <small>{ideas[0].first || `${ideas[0].count} suggestions`}</small></span>
        </button>
      )}
      {(all ? news : news.slice(0, 3)).map((entries) => (
        <button key={entries[0].brief.agent.id} className="crew-news" onClick={() => actions.openTab(entries[0].open)}>
          <img src={portraitSrc(entries[0].brief.agent)} alt="" />
          <span><strong>{entries[0].brief.agent.name}{entries.length > 1 && <em> +{entries.length - 1}</em>}</strong>
            <small>{entries[0].label}: {entries[0].brief.title}</small></span>
        </button>
      ))}
      {(steps.length > 3 || news.length > 3) && <button className="text-button crew-more" aria-expanded={all} onClick={() => actions.setUi({ allBriefs: !all })}>
        {all ? "Show fewer" : `${Math.max(0, steps.length - 3) + Math.max(0, news.length - 3)} more from your crew`}</button>}
      {quiet.length > 0 && (
        <p className="crew-quiet"><AvatarStack agents={quiet.slice(0, 3)} size={22} />{namesOf(quiet.map((agent) => agent.name))}: nothing needs you today</p>
      )}
      <div className="crew-plan">
        {(planning || anytime.length > 0) && atlas && (
          <Tip label={planning ? "Take Atlas's plan off your day" : "Atlas puts what's left in the tray at the free half hours, dashed until you apply"}>
            <button className="secondary-button" aria-pressed={planning} onClick={() => actions.setUi({ planning: !planning })}>
              <img src={portraitSrc(atlas)} alt="" />{planning ? "Hide Atlas's plan" : "Plan the rest of my day"}</button></Tip>
        )}
        {steps.length > 1 && <button className="quiet-button" onClick={() => actions.applySteps(steps)}>Apply all</button>}
      </div>
      <button className="today-chat" onClick={actions.showAtlas}>
        {shownFaces.length ? <AvatarStack agents={shownFaces} size={24} /> : <MessageCircle size={16} />}
        <span>{current.agents.length > 1 ? `${current.label} room` : `Talk to ${current.label}`}</span>
        {unread > 0 && <b className="today-chat-unread">{unread} unread</b>}
        <ChevronRight size={16} />
      </button>
    </section>
  );
}
