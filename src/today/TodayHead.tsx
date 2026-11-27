// Today's head (the greeting, the date and the day in one sentence) and the day line under it: the sky as a ruler from
// 07:00 to 23:00, the sun or tonight's moon at now, every task with a time at its hour and how long it holds, today's
// calendar events, and the crew's next steps dashed at theirs until you apply them (agents-design D75).
import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { CalendarDays, SlidersHorizontal } from "lucide-react";
import { useApp, useUi, useView } from "../appContext.ts";
import { calendarOffered, connections } from "../connections.ts";
import { formatDate } from "../dates.ts";
import type { Task } from "../model.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { skyAt } from "../sky.ts";
import { Tip } from "../Popups.tsx";
import { clockOf, lengthOf, lineFrom, lineShare, lineTo, minuteNow, minuteOf, placedAt } from "./day.ts";
import type { DayEvent, DayStep } from "./day.ts";
import { useDaySteps } from "./steps.ts";

/** The sun's eight rays, long and short in turn. */
const skyRays = [0, 45, 90, 135, 180, 225, 270, 315].map((turn, index) => ({ turn, d: index % 2 ? "M0 -8.6 V-10.6" : "M0 -8.6 V-12.4" }));

function SunFace() {
  return (
    <>
      <g className="sky-rays">{skyRays.map(({ turn, d }) => <path key={turn} d={d} transform={`rotate(${turn + 22.5})`} />)}</g>
      <circle className="sky-disc" r="6.4" />
      <path className="sky-shine" d="M-4.4 -1.2 A4.6 4.6 0 0 1 -1.2 -4.4" />
    </>
  );
}

/**
 * Tonight's moon (`moonPhase` in sky.ts): the unlit disc faintly, the lit part between its rim and the terminator, an
 * ellipse whose width follows the phase. Lit on the right while waxing; the southern hemisphere sees it mirrored.
 */
function MoonFace({ phase, south }: { phase: number; south: boolean }) {
  const turn = Math.cos(2 * Math.PI * phase);
  const waxing = phase < 0.5;
  const terminator = waxing ? (turn > 0 ? 0 : 1) : (turn < 0 ? 0 : 1);
  return (
    <g className="sky-moon" transform={south ? "scale(-1 1)" : undefined}>
      <circle className="sky-moon-dark" r="6" />
      {(1 - turn) / 2 > 0.03 && <path className="sky-moon-lit" d={`M0 -6 A6 6 0 0 ${waxing ? 1 : 0} 0 6 A${(6 * Math.abs(turn)).toFixed(2)} 6 0 0 ${terminator} 0 -6Z`} />}
    </g>
  );
}

export function TodayHead() {
  const { actions } = useApp();
  const now = useView((view) => view.now);
  const daypart = useView((view) => view.daypart);
  const greeting = useView((view) => view.greeting);
  const evening = useView((view) => view.evening);
  const today = useView((view) => view.today);
  const name = useView((view) => view.session.profileName);
  const { open, done, lateCount: late } = useView((view) => view.todayTasks);
  // One sentence for the whole day: what's done, what's left and what was carried over.
  const summary = !open.length && !done.length ? (evening ? "Nothing was due today." : "Nothing due today, a clear day.")
    : evening ? `${done.length} done today${open.length ? `, ${open.length} still open` : ", nothing left open"}.`
    : !open.length ? `All ${done.length} done, the garden's watered.`
    : `${done.length} done, ${open.length} to go${late ? `, ${late} carried over` : ""}.`;
  const sky = skyAt(new Date(now), daypart);
  return (
    <header className="today-hero">
      <div className="today-hero-title">
        <h1>
          {name ? `${greeting}, ${name}` : greeting}
          {/* Phones show the sun or tonight's moon after the greeting; the day line below draws it at its hour. */}
          <svg className="today-sky-badge" viewBox={sky.state === "night" ? "-7.5 -7.5 15 15" : "-13 -13 26 26"} aria-hidden="true">
            {sky.state === "night" ? <MoonFace phase={sky.phase} south={sky.south} /> : <SunFace />}
          </svg>
        </h1>
        <p><time dateTime={today}>{formatDate(new Date(now), { weekday: "long", month: "long", day: "numeric" })}</time><span aria-hidden="true"> · </span>{summary}</p>
      </div>
      <Tip label="Customize this page"><button className="icon-button widgets-button" aria-label="Customize this page" onClick={() => actions.setUi({ modal: "widgets" })}>
        <SlidersHorizontal size={18} />
      </button></Tip>
    </header>
  );
}

type Pin = { key: string; minute: number; title: string; hue: string; task?: Task; step?: DayStep; event?: DayEvent; done?: boolean; lane?: number;
  crowded?: boolean };

/**
 * Two lanes of labels: each pin takes the lower one unless a label there is still too close, then the upper one; with
 * both taken it shows only its mark, its title in the tooltip (progressive disclosure), so titles never overlap.
 */
function laned(pins: Pin[]): Pin[] {
  const ends = [-1, -1];
  return [...pins].sort((a, b) => a.minute - b.minute).map((pin) => {
    const at = lineShare(pin.minute);
    const lane = ends.findIndex((end) => at - end > 0.2);
    if (lane === -1) return { ...pin, lane: 0, crowded: true };
    ends[lane] = at;
    return { ...pin, lane };
  });
}

/**
 * One thing on the line: a task's bud in its domain's hue while open, a flower once done (it blooms when ticked,
 * `celebrate`); a step's agent's face, dashed; a calendar event's small leaf of a page.
 */
function PinMark({ pin }: { pin: Pin }) {
  const portraitSrc = usePortraitSrc();
  if (pin.step) return <img className="day-pin-face" src={portraitSrc(pin.step.agent)} alt="" />;
  return (
    <svg className="day-pin-mark" viewBox="0 0 24 24" aria-hidden="true">
      {pin.event ? <rect className="day-pin-event" x="6" y="6" width="12" height="12" rx="3" />
        : pin.done
        ? <g className="plant-flower">{[0, 72, 144, 216, 288].map((turn) => <ellipse key={turn} cx="12" cy="6.4" rx="3" ry="4" transform={`rotate(${turn} 12 11)`} />)}<circle cx="12" cy="11" r="2.4" className="plant-heart" /></g>
        : <circle className="day-pin-bud" cx="12" cy="12" r="5.5" />}
    </svg>
  );
}

/** Today's calendar events (D75), read from the connector when this build offers it and the calendar is connected, every ten minutes. */
function useDayEvents(today: string, minute: number) {
  const { actions } = useApp();
  const tenth = Math.floor(minute / 10);
  useEffect(() => {
    if (!calendarOffered) return;
    let live = true;
    void (async () => {
      if (connections.getSnapshot().status === "idle") await connections.load();
      const state = connections.getSnapshot();
      const events = state.status === "ready" && state.calendar ? await connections.readDay(today) : [];
      if (live) actions.setUi({ dayEvents: { day: today, events } });
    })();
    return () => { live = false; };
  }, [actions, today, tenth]);
  return useUi((state) => state.dayEvents.day === today ? state.dayEvents.events : noEvents);
}
const noEvents: DayEvent[] = [];

export function TodayDayLine() {
  const { actions } = useApp();
  const now = useView((view) => view.now);
  const today = useView((view) => view.today);
  const daypart = useView((view) => view.daypart);
  const inPlay = useView((view) => view.todayTasks.garden);
  const domains = useView((view) => view.domains);
  const steps = useDaySteps();
  const sky = skyAt(new Date(now), daypart);
  const minute = minuteNow(now);
  const events = useDayEvents(today, minute);
  const share = lineShare(minute);
  const hueOf = (task: Task) => domains.find((domain) => domain.name === task.domain)?.hue ?? "var(--accent)";
  const timed = inPlay.flatMap((task): Pin[] => {
    const at = minuteOf(placedAt(task, today));
    return at === null ? [] : [{ key: task.id, minute: at, title: task.title, hue: hueOf(task), task, done: task.done }];
  });
  const stepPins = steps.flatMap((step): Pin[] => step.minute === undefined ? []
    : [{ key: step.key, minute: step.minute, title: step.title, hue: step.hue, step }]);
  const eventPins = events.flatMap((event, index): Pin[] => event.allDay ? []
    : [{ key: `event:${index}`, minute: event.from, title: event.title, hue: "var(--secondary)", event }]);
  const pins = laned([...timed, ...stepPins, ...eventPins]);
  // How long each thing holds, as a band along the line's foot: a task its length, a step its task's, an event its own.
  const spans = [...timed, ...stepPins].map((pin) => ({ key: pin.key, from: pin.minute, to: pin.minute + lengthOf(pin.task ?? pin.step?.task ?? {}),
    hue: pin.hue, kind: pin.step ? "step" : "task" }))
    .concat(eventPins.map((pin) => ({ key: pin.key, from: pin.event!.from, to: pin.event!.to, hue: pin.hue, kind: "event" })));
  const allDay = events.filter((event) => event.allDay);
  // The sun rides an arc over the line: highest at its middle, at the hills at either end.
  const lift = 4 * share * (1 - share);
  const hours = Array.from({ length: (lineTo - lineFrom) / 120 + 1 }, (_, index) => lineFrom + index * 120);
  // On a phone the line is wider than the screen and scrolls; it opens with now in view.
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => {
    const line = scroller.current;
    if (line && line.scrollWidth > line.clientWidth) line.scrollLeft = share * line.scrollWidth - line.clientWidth / 3;
  }, [share]);
  return (
    <section ref={scroller} className="day-line" data-sky={sky.state} aria-label="Your day, hour by hour">
      <div className="day-line-track">
      <svg className="day-line-land" viewBox="0 0 1000 132" preserveAspectRatio="none" aria-hidden="true">
        <path className="day-line-arc" d="M20 104 Q500 -36 980 104" />
        <path className="day-line-hill" d="M0 104 C160 86 300 98 460 92 S800 80 1000 100 V132 H0Z" />
        <rect className="day-line-past" x="0" y="0" width={share * 1000} height="132" />
      </svg>
      {allDay.length > 0 && <p className="day-line-allday"><CalendarDays size={12} aria-hidden="true" />{allDay.map((event) => event.title).join(" · ")}</p>}
      <div className="day-line-spans" aria-hidden="true">
        {spans.map((span) => <i key={span.key} data-kind={span.kind} style={{ "--at": lineShare(span.from), "--to": lineShare(span.to), "--hue": span.hue } as CSSProperties} />)}
      </div>
      <span className="day-line-now" style={{ "--at": share, "--lift": lift } as CSSProperties}>
        <svg viewBox={sky.state === "night" ? "-7.5 -7.5 15 15" : "-13 -13 26 26"} aria-hidden="true">
          {sky.state === "night" ? <MoonFace phase={sky.phase} south={sky.south} /> : <SunFace />}
        </svg>
      </span>
      <ol className="day-line-pins">
        {pins.map((pin) => {
          const words = pin.event ? `${clockOf(pin.event.from)} to ${clockOf(pin.event.to)} ${pin.title}, from your calendar`
            : `${clockOf(pin.minute)} ${pin.title}${pin.step ? `, suggested by ${pin.step.agent.name}` : pin.done ? ", done" : ""}`;
          return (
            <li key={pin.key} className="day-pin" data-lane={pin.lane} data-crowded={pin.crowded || undefined} data-step={pin.step ? "" : undefined}
              data-event={pin.event ? "" : undefined} data-past={pin.minute < minute || undefined}
              data-task={pin.task?.id} style={{ "--at": lineShare(pin.minute), "--hue": pin.hue } as CSSProperties}>
              {pin.event ? <Tip label={words}><span className="day-pin-static" role="img" aria-label={words}>
                <span className="day-pin-title">{pin.title}</span><PinMark pin={pin} /></span></Tip>
                : <Tip label={words}><button aria-label={words} onClick={() => pin.task && !pin.step ? actions.editTask(pin.task)
                : document.getElementById(`step-${pin.key}`)?.focus()}>
                <span className="day-pin-title">{pin.title}{pin.step ? "?" : ""}</span>
                <PinMark pin={pin} />
              </button></Tip>}
            </li>
          );
        })}
      </ol>
      <div className="day-line-hours" aria-hidden="true">
        {hours.filter((hour) => Math.abs(lineShare(hour) - share) > 0.05).map((hour) => <span key={hour} style={{ "--at": lineShare(hour) } as CSSProperties}>
          {clockOf(hour).slice(0, 2)}</span>)}
        <span className="day-line-nowtag" style={{ "--at": share } as CSSProperties}>Now {clockOf(minute)}</span>
      </div>
      </div>
    </section>
  );
}
