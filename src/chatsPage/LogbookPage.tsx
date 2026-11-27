// The Logbook (agents-design D19): the Chats page's own fixed tab, so a list of every agent's conversations never sits
// under one agent's tab. Each conversation says what came of it; what waits on you leads. A row opens its chat at the
// conversation (or its first match). What it lists is chatsPage/logbook.ts.
import { AvatarStack } from "../AvatarStack.tsx";
import { Marked } from "../chat/Marked.tsx";
import { dayLabel, formatDate, locale } from "../dates.ts";
import type { Sitting } from "../sittings.ts";
import type { ChatEntry } from "../view.ts";
import { Search } from "lucide-react";
import { groupLogbook, matchSittings, outcomeOf, shows } from "./logbook.ts";
import type { LogbookShow } from "./logbook.ts";

const clock = (at: string) => formatDate(new Date(at), { hour: "2-digit", minute: "2-digit" });
const showLabels: Record<LogbookShow, string> = { all: "Everything", waiting: "Waiting on you", decided: "Decided" };

export function LogbookPage({ sittings, entries, query, who, show, limit, now, onQuery, onWho, onShow, onJump, onMore }: {
  sittings: Sitting[];
  entries: ReadonlyMap<string, ChatEntry>;
  query: string;
  /** "" lists every chat's conversations; a thread id only that chat's. */
  who: string;
  show: LogbookShow;
  limit: number;
  now: number;
  onQuery: (query: string) => void;
  onWho: (id: string) => void;
  onShow: (show: LogbookShow) => void;
  /** Opens a chat at one of its messages. */
  onJump: (threadId: string, index: number) => void;
  onMore: () => void;
}) {
  const needle = query.trim().toLocaleLowerCase();
  // Searched and narrowed to one chat first, so the Show counts say what each filter would list.
  const { named, matches } = matchSittings(sittings, entries, needle, who);
  const told = matches.map((sitting) => ({
    sitting, outcome: outcomeOf(sitting, entries.get(sitting.threadId)!.thread.messages.slice(sitting.start, sitting.end)),
  }));
  const counts = { all: told.length, waiting: told.filter((item) => shows("waiting", item.outcome)).length, decided: told.filter((item) => shows("decided", item.outcome)).length };
  const listed = told.filter((item) => shows(show, item.outcome));
  const groups = groupLogbook(listed.slice(0, limit), now);
  // Chats with conversations, the latest first (sittings come newest first): the With list.
  const chats = [...new Set(sittings.map((sitting) => sitting.threadId))].flatMap((id) => entries.get(id) ?? []);
  return (
    <div className="logbook">
      <header className="logbook-head">
        <div><h1 id="logbook-title">Logbook</h1><p>What came of every conversation, across all your agents.</p></div>
        <label className="chats-search"><Search size={16} />
          <input type="search" aria-label="Search the logbook" placeholder="Search names and messages…" value={query}
            onChange={(event) => onQuery(event.target.value)} />
        </label>
      </header>
      <nav className="logbook-filters" aria-label="Logbook filters">
        <div role="group" aria-labelledby="logbook-show">
          <h2 id="logbook-show">Show</h2>
          {(Object.keys(showLabels) as LogbookShow[]).map((key) => (
            <button key={key} aria-pressed={show === key} data-show={key} onClick={() => onShow(key)}>
              <span>{showLabels[key]}</span><small>{counts[key].toLocaleString(locale)}</small>
            </button>
          ))}
        </div>
        <div role="group" aria-labelledby="logbook-with">
          <h2 id="logbook-with">With</h2>
          <button aria-pressed={!who} onClick={() => onWho("")}><span>Everyone</span></button>
          {chats.map((chat) => (
            <button key={chat.id} aria-pressed={who === chat.id} onClick={() => onWho(who === chat.id ? "" : chat.id)}>
              <AvatarStack agents={chat.agents} size={20} /><span>{chat.label}</span>
            </button>
          ))}
        </div>
      </nav>
      <section className="logbook-main" aria-labelledby="logbook-title">
        {groups.map((group) => (
          <section key={group.label} className="logbook-group" data-waiting={group.label === "Waiting on you" || undefined} aria-label={group.label}>
            <h2>{group.label}</h2>
            {group.items.map(({ sitting, outcome }) => {
              const chat = entries.get(sitting.threadId)!;
              const messages = chat.thread.messages.slice(sitting.start, sitting.end);
              // A conversation is a pointer into its chat; search lands on its first match, and only counts the rest.
              const found = needle && !named.has(sitting.threadId) ? messages.filter((message) => message.text.toLocaleLowerCase().includes(needle)).length : 0;
              const firstHit = found ? sitting.start + messages.findIndex((message) => message.text.toLocaleLowerCase().includes(needle)) : sitting.start;
              const day = dayLabel(sitting.at, now);
              const when = !sitting.at ? "Earlier" : day === "Today" || day === "Yesterday" ? clock(sitting.at) : day;
              return (
                <button key={sitting.key} className="logbook-row" onClick={() => onJump(sitting.threadId, firstHit)}>
                  <AvatarStack agents={chat.agents} size={chat.agents.length > 1 ? 20 : 28} />
                  <span className="logbook-row-text">
                    <strong><Marked text={sitting.title} query={query} /></strong>
                    <small>
                      <b><Marked text={chat.label} query={query} /></b>
                      {outcome.text && <> · <span data-tone={outcome.tone}>{outcome.text}</span></>}
                      {sitting.place && sitting.place !== chat.label && ` · in ${sitting.place}`}
                      {found > 0 && <em> · {found} matching</em>}
                    </small>
                  </span>
                  <time dateTime={sitting.at}>{when}</time>
                </button>
              );
            })}
          </section>
        ))}
        {listed.length > limit && <button className="chats-more" onClick={onMore}>Show {Math.min(listed.length - limit, 300).toLocaleString(locale)} older</button>}
        {!listed.length && <p className="chats-none">{needle || who || show !== "all" ? "Nothing here. Try another word, or Everything with everyone." : "No conversations yet."}</p>}
      </section>
    </div>
  );
}
