// A person's page in the Library (agents-design D71): the masthead with their face, who they are and their next date;
// their domain agent's brief when a date is near; then what agents remember about them, their dates, where they're
// mentioned elsewhere and what you keep in their topic.
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bookmark, Cake, CircleCheck, Circle, FileText, Library, MessageCircle, Plus, Sprout, X } from "lucide-react";
import { agentById, stewardOf } from "./agents.ts";
import { useApp, useView } from "./appContext.ts";
import { AvatarStack } from "./AvatarStack.tsx";
import type { Brief } from "./brief.ts";
import { BriefBubble } from "./BriefView.tsx";
import { daysBetween, formatDate } from "./dates.ts";
import { atlasId } from "./model.ts";
import type { Memory } from "./model.ts";
import { PageBand } from "./PageBand.tsx";
import { datesAhead, inWords, mentionsOf, nextLabel } from "./people.ts";
import type { Mention, NextDate, PersonTopic } from "./people.ts";
import { PersonFace } from "./PersonFace.tsx";
import { homeKey, placeName, tabKey } from "./place.ts";
import { Tip } from "./Popups.tsx";
import { ResourceGrid } from "./Resources.tsx";

/** How many lines a block shows before "n more". */
const shownAtFirst = 4;
const dayWords = (day: string) => formatDate(new Date(`${day}T12:00:00`), { weekday: "long", day: "numeric", month: "long" });
/** "today", "yesterday", "5 days ago", else the date. */
const agoWords = (days: number, at: string) => days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago`
  : `on ${formatDate(new Date(at), { day: "numeric", month: "short" })}`;

/** A block's list: the first few, then a button for the rest. */
function Folded<T>({ items, render }: { items: T[]; render: (item: T) => ReactNode }) {
  const [all, setAll] = useState(false);
  return <>
    <ul className="person-list">{(all ? items : items.slice(0, shownAtFirst)).map(render)}</ul>
    {!all && items.length > shownAtFirst && <button type="button" className="text-button" onClick={() => setAll(true)}>{items.length - shownAtFirst} more</button>}
  </>;
}

/** The domain agent's word when a date is two weeks off or nearer: what's coming, and a chat to plan it. */
function nearBrief(person: PersonTopic, next: NextDate | undefined, agent: Brief["agent"]): Brief | null {
  if (!next || next.days > 14) return null;
  const label = next.date.label.toLocaleLowerCase();
  const when = next.days === 0 ? "today" : `on ${dayWords(next.day)}`;
  return { kind: "milestone", key: `person:${person.id}:${next.date.id}:${next.day}`, agent,
    title: next.days === 0 ? `It's ${person.name}'s ${label} today.` : `${person.name}'s ${label} is ${inWords(next.days)}, ${dayWords(next.day)}.`,
    line: `${next.years ? /birthday/i.test(label) ? `Turning ${next.years}. ` : `${next.years} years. ` : ""}Want a plan for the day, from what you've told me about ${person.name}?`,
    action: { kind: "chat", label: "Plan it", thread: `agent:${agent.id}`,
      draft: `@${person.name}'s ${label} is ${when}${next.years ? ` (${next.years} years)` : ""}. Help me plan something for it, from what you know about them.` } };
}

const mentionIcons = { task: Circle, note: FileText, project: Sprout, message: MessageCircle } as const;

export function PersonPage({ person }: { person: PersonTopic }) {
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const liveNotes = useView((view) => view.visible.notes);
  const state = useView((view) => view.briefState)(`topic:${person.id}`);
  const agent = stewardOf(data, person.person.domain) ?? agentById(data, atlasId)!;
  const ahead = datesAhead(person.person, today);
  const next = ahead[0];
  const memories = data.memories.filter((memory) => memory.topicId === person.id).sort((a, b) => b.at.localeCompare(a.at));
  const kept = liveNotes.filter((note) => note.topicId === person.id);
  const mentioned = useMemo(() => mentionsOf(data, person, (home) => placeName(data, homeKey(home)),
    (id) => id.startsWith("agent:") ? `Chat with ${agentById(data, id.slice(6))?.name ?? "an agent"}` : data.threads.find((thread) => thread.id === id)?.title || "A room"),
  [data, person]);
  const brief = nearBrief(person, next, agent);
  const lastNoted = [...mentioned.map((item) => item.at), ...kept.map((note) => note.updatedAt), ...memories.map((memory) => memory.at)]
    .filter(Boolean).sort().at(-1);
  const whoRemembered = (memory: Memory) => agentById(data, memory.agentId)?.name ?? "An agent";
  const open = (item: Mention) => {
    if (item.kind === "task") { const task = data.tasks.find((each) => each.id === item.id); if (task) actions.editTask(task); }
    else if (item.kind === "note") { const note = data.notes.find((each) => each.id === item.id); if (note) actions.openResource(note, false, [note.id]); }
    else if (item.kind === "project") actions.openTab(tabKey({ kind: "project", id: item.id }));
    else if (item.threadId) actions.chatWith(item.threadId);
  };
  const chat = () => {
    void actions.updateSession({ chatDraft: `About @${person.name}: ` });
    actions.chatWith(`agent:${agent.id}`);
  };
  const first = person.name.split(/\s+/)[0];
  return (
    <div className="collection-page library-page person-page">
      <PageBand title={person.name} hue={person.person.hue || "var(--accent)"} className="person-masthead"
        picture={<PersonFace person={person} size={48} className="masthead-face" />}
        edit={{ label: `Edit ${person.name}`, onClick: () => actions.setUi({ topicDraft: person }) }}
        line={[person.person.relation, person.person.domain].filter(Boolean).join(" · ") || "Someone in your life"}
        actions={<Tip label={`Chat with ${agent.name} about ${first}`}>
          <button className="secondary-button crew-chat" aria-label={`Chat with ${agent.name} about ${first}`} onClick={chat}>
            <AvatarStack agents={[agent]} size={26} />
          </button>
        </Tip>}
        foot={<p className="masthead-stage person-facts">
          {next && <Tip label={`${nextLabel(next)}: ${dayWords(next.day)}`}><span className="person-fact"><Cake size={14} aria-hidden="true" />
            {next.date.label} <strong>{inWords(next.days)}</strong></span></Tip>}
          {lastNoted && <span className="person-fact is-quiet">Last noted {agoWords(daysBetween(lastNoted.slice(0, 10), today), lastNoted)}</span>}
        </p>} />
      {brief && <BriefBubble brief={brief} state={state} onState={(patch) => actions.setBriefState(`topic:${person.id}`, patch)} onAct={actions.actOnBrief} />}
      <div className="page-grid">
        <div className="page-block width-wide"><section className="data-widget person-memories">
          <div className="section-heading"><h2><Bookmark size={16} />What {agent.name} remembers</h2></div>
          {memories.length ? <Folded items={memories} render={(memory) => (
            <li key={memory.id} className="person-memory">
              <Tip label={`${memory.computer ? `Found on ${memory.computer.name}, kept by you` : `From your words: “${memory.quote}”`} · ${whoRemembered(memory)}, ${formatDate(new Date(memory.at), { day: "numeric", month: "short" })}`}>
                <span>{memory.text}</span></Tip>
              <button type="button" className="text-button person-forget" aria-label={`Forget “${memory.text}”`} onClick={() => actions.forgetMemory(memory.id)}>
                <X size={12} />Forget</button>
            </li>
          )} /> : <p className="widget-caption">Nothing yet. Tell {agent.name} something about {first} in a chat, and it keeps a line here.</p>}
        </section></div>
        <div className="page-block width-narrow"><section className="data-widget person-dates-widget">
          <div className="section-heading"><h2><Cake size={16} />Dates</h2></div>
          {ahead.length > 0 && <ul className="person-list">{ahead.map((item) => (
            <li key={item.date.id} className="person-date">
              <span className="person-day" aria-hidden="true"><strong>{Number(item.day.slice(8))}</strong>
                {formatDate(new Date(`${item.day}T12:00:00`), { month: "short" })}</span>
              <span><b>{nextLabel(item)}</b><small>{inWords(item.days)}, {dayWords(item.day)}</small></span>
            </li>
          ))}</ul>}
          <button type="button" className="text-button" onClick={() => actions.setUi({ topicDraft: person })}><Plus size={14} />Add a date</button>
        </section></div>
        <div className="page-block width-wide"><section className="data-widget person-mentions">
          <div className="section-heading"><h2><Library size={16} />Mentioned elsewhere</h2></div>
          {mentioned.length ? <Folded items={mentioned} render={(item) => {
            const Icon = item.kind === "task" && item.done ? CircleCheck : mentionIcons[item.kind];
            return (
              <li key={`${item.kind}:${item.id}`}><button type="button" className="person-mention" onClick={() => open(item)}>
                <Icon size={14} aria-hidden="true" />
                <span className="person-mention-text">{item.kind === "note" && item.title && !item.text.includes(item.title) && <b>{item.title} · </b>}{item.text}</span>
                <small>{item.where}{item.archived ? ", archived" : ""}{item.at ? ` · ${formatDate(new Date(item.at), { day: "numeric", month: "short" })}` : ""}</small>
              </button></li>
            );
          }} /> : <p className="widget-caption">Write @{person.name} in a note or a task and it shows here{person.name.length >= 3 ? `, as does ${person.name} where nothing else shares the name` : ""}.</p>}
        </section></div>
        <div className="page-block width-narrow"><section className="data-widget person-kept">
          <ResourceGrid key={person.id} items={kept} title="Kept here" onOpen={actions.openResource}
            onAdd={() => actions.openCapture(homeKey({ domain: "", topicId: person.id }))} empty={`Capture something about ${first}: sizes, gift ideas, a photo.`} />
        </section></div>
      </div>
    </div>
  );
}
