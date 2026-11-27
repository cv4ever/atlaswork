// The start form Today's cards share: a ritual from the tray, a date from Coming up.
import { useState } from "react";
import { useView } from "../appContext.ts";
import { addDays } from "../dates.ts";
import { domainKey } from "../place.ts";
import type { PagePlace } from "./derive.ts";

/** A name, a day when asked for, and the page it lives on (the domain you're in by default): how Today starts a ritual or a date. */
export function StartForm({ dated, label, onAdd, onCancel }: {
  dated: boolean; label: string; onAdd: (title: string, at: PagePlace, date: string) => boolean; onCancel?: () => void;
}) {
  const domains = useView((view) => view.domains);
  const domain = useView((view) => view.session.domain);
  const today = useView((view) => view.today);
  const places = useView((view) => view.pagePlaces);
  const [title, setTitle] = useState("");
  const [where, setWhere] = useState(domainKey(domain));
  const [date, setDate] = useState(addDays(today, 30));
  const at = places.find((item) => item.place === where) ?? places[0];
  return (
    <form className="start-form" onSubmit={(event) => {
      event.preventDefault();
      if (title.trim() && at && (!dated || date > today) && onAdd(title.trim(), at, date)) setTitle("");
    }}>
      <input value={title} maxLength={60} placeholder={label} aria-label={label} onChange={(event) => setTitle(event.target.value)} />
      <div className="start-form-row">
        {dated && <input type="date" value={date} min={addDays(today, 1)} aria-label="When" onChange={(event) => setDate(event.target.value)} />}
        <select value={at?.place} aria-label="The page it lives on" onChange={(event) => setWhere(event.target.value)}>
          {domains.map((item) => (
            <optgroup key={item.name} label={item.name}>
              <option value={domainKey(item.name)}>{item.name} overview</option>
              {item.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </optgroup>
          ))}
        </select>
        <button type="submit" className="secondary-button" disabled={!title.trim()}>Add</button>
        {onCancel && <button type="button" className="text-button" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
