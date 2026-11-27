// Keep going: Today's own widgets, and one kept quote to close the page.
import { useState } from "react";
import { Quote, Shuffle } from "lucide-react";
import { useApp, useView } from "../appContext.ts";
import { Tip } from "../Popups.tsx";

/** One quote you kept, a different one each day; the shuffle turns to another. */
export function TodayShelf() {
  const { actions } = useApp();
  const quotes = useView((view) => view.todayQuotes);
  const today = useView((view) => view.today);
  const [turn, setTurn] = useState(0);
  if (!quotes.length) return null;
  const pick = quotes[(Math.round(Date.parse(`${today}T12:00:00`) / 864e5) + turn) % quotes.length];
  const words = (pick.body?.trim() || pick.title).replace(/\s+/g, " ");
  return (
    <div className="today-closing">
      <section className="today-card today-shelf" aria-label="From your shelf">
        <div className="section-heading"><h2><Quote size={16} />From your shelf</h2>
          {quotes.length > 1 && <Tip label="Another quote"><button className="icon-button heading-add" aria-label="Another quote" onClick={() => setTurn(turn + 1)}><Shuffle size={16} /></button></Tip>}</div>
        <figure>
          <blockquote>{words.length > 220 ? `${words.slice(0, 217).trimEnd()}…` : words}</blockquote>
          {pick.source && <figcaption>{pick.source}</figcaption>}
        </figure>
        <button className="text-button" onClick={() => actions.openResource(pick, false, [pick.id])}>Open with your notes</button>
      </section>
    </div>
  );
}
