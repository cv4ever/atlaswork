// The person part of the topic dialog (agents-design D71): their face (a photo or their initials on a colour), who
// they are to you, the domain whose agent reads about them, and the dates that come round each year.
import { useState } from "react";
import type { CSSProperties } from "react";
import { Camera, Plus, X } from "lucide-react";
import { stewardOf } from "../agents.ts";
import { useView } from "../appContext.ts";
import type { Person, PersonDate } from "../model.ts";
import { personHues as hues } from "../people.ts";
import { PersonFace } from "../PersonFace.tsx";
import { squarePhoto } from "../PicturePicker.tsx";
import { Tip } from "../Popups.tsx";

/** A year-less date shows in the date field on 2000, a leap year, so 29 February can be picked. */
const shown = (date: string) => date.startsWith("--") ? `2000${date.slice(1)}` : date;

/** One date: its label, the day, and whether the year is known (a birthday whose year you don't know). */
function DateRow({ date, onChange, onRemove }: { date: PersonDate; onChange: (date: PersonDate) => void; onRemove: () => void }) {
  const yearless = date.date.startsWith("--");
  return (
    <li className="person-date-row">
      <input aria-label="What the date is" list="person-date-labels" maxLength={30} placeholder="Birthday" value={date.label}
        onChange={(event) => onChange({ ...date, label: event.target.value })} />
      <input type="date" aria-label={`${date.label || "Date"}: day`} value={shown(date.date)}
        onChange={(event) => onChange({ ...date, date: yearless && event.target.value ? `-${event.target.value.slice(4)}` : event.target.value })} />
      <label className="checkbox-label"><input type="checkbox" checked={yearless} disabled={!date.date}
        onChange={(event) => onChange({ ...date, date: event.target.checked ? `-${date.date.slice(4)}` : `${new Date().getFullYear()}${date.date.slice(1)}` })} />
        Year unknown</label>
      <Tip label="Remove this date"><button type="button" className="icon-button" aria-label={`Remove ${date.label || "this date"}`} onClick={onRemove}>
        <X size={14} /></button></Tip>
    </li>
  );
}

export function PersonFields({ name, person, onChange }: { name: string; person: Person; onChange: (person: Person) => void }) {
  const data = useView((view) => view.data);
  const domains = useView((view) => view.visible.domains);
  const [error, setError] = useState("");
  const change = (patch: Partial<Person>) => onChange({ ...person, ...patch });
  const reader = person.domain ? stewardOf(data, person.domain) : undefined;
  const first = name.trim().split(/\s+/)[0] || "them";
  const upload = async (file: File) => {
    setError("");
    try { change({ photo: await squarePhoto(file, 96) }); } catch { setError("That file isn't a picture this browser can read. Try a JPG, PNG or WebP."); }
  };
  return (
    <>
      <div className="look-field">
        <span>Face</span>
        <div className="person-look">
          <PersonFace person={{ name, person }} size={44} />
          <div className="person-hues" role="radiogroup" aria-label="Colour">
            {hues.map(([label, hue]) => (
              <Tip key={hue} label={label}><button type="button" role="radio" aria-checked={!person.photo && person.hue === hue} aria-label={label}
                className="person-hue" style={{ "--hue": hue } as CSSProperties} onClick={() => change({ hue, photo: undefined })} /></Tip>
            ))}
          </div>
          <label className="quiet-button person-photo"><Camera size={14} />{person.photo ? "Another photo" : "Photo"}
            <input type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} />
          </label>
          {person.photo && <button type="button" className="text-button" onClick={() => change({ photo: undefined })}>Remove photo</button>}
        </div>
        {error && <small className="field-error">{error}</small>}
      </div>
      <label>
        Who they are to you
        <input maxLength={60} list="person-relations" placeholder="Sister, best friend, our accountant…" value={person.relation}
          onChange={(event) => change({ relation: event.target.value })} />
      </label>
      <label>
        Where they belong
        <select value={person.domain} onChange={(event) => change({ domain: event.target.value })}>
          {domains.map((domain) => <option key={domain.name} value={domain.name}>{domain.emoji} {domain.name}</option>)}
          <option value="">Nowhere: Atlas alone reads about {first}</option>
        </select>
        <small className="person-reader">{person.domain ? `${reader?.name ?? "Whoever looks after it"} and Atlas read about ${first}.` : `Only Atlas reads about ${first}.`}</small>
      </label>
      <div className="look-field">
        <span>Dates</span>
        {person.dates.length > 0 && <ul className="person-dates">
          {person.dates.map((date) => (
            <DateRow key={date.id} date={date} onChange={(next) => change({ dates: person.dates.map((item) => item.id === date.id ? next : item) })}
              onRemove={() => change({ dates: person.dates.filter((item) => item.id !== date.id) })} />
          ))}
        </ul>}
        <button type="button" className="text-button person-add-date"
          onClick={() => change({ dates: [...person.dates, { id: crypto.randomUUID(), label: person.dates.length ? "" : "Birthday", date: "" }] })}>
          <Plus size={14} />Add a date</button>
      </div>
      <datalist id="person-date-labels"><option value="Birthday" /><option value="Anniversary" /><option value="Name day" /></datalist>
      <datalist id="person-relations">{["Partner", "Mother", "Father", "Sister", "Brother", "Daughter", "Son", "Friend", "Colleague", "Client"]
        .map((relation) => <option key={relation} value={relation} />)}</datalist>
    </>
  );
}
