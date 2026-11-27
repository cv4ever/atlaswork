// Settings → People (agents-design D71): add a few people from the phone's contacts, only when you ask. The browser's
// own contact picker shows the contacts and you choose; Atlaswork receives only the names and pictures of those you
// picked, never a phone number, email or address, and nothing syncs afterwards. Only Chrome on Android has the
// picker, so elsewhere the section says so and points to New person in the Library.
import { useState } from "react";
import { Contact, Library } from "lucide-react";
import { squarePhoto } from "../PicturePicker.tsx";

/** The Contact Picker API (W3C draft): TypeScript's DOM types leave it out. */
type ContactInfo = { name?: string[]; icon?: Blob[] };
type ContactsManager = { select: (properties: string[], options: { multiple: boolean }) => Promise<ContactInfo[]>; getProperties: () => Promise<string[]> };
const contacts = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { contacts?: ContactsManager }).contacts;

export function ContactsSection({ domains, onImport, onLibrary }: {
  /** The live domains, by name and emoji; Family first when there is one. */
  domains: { name: string; emoji: string }[];
  onImport: (picked: { name: string; photo?: string }[], domain: string) => string[];
  onLibrary: () => void;
}) {
  const [domain, setDomain] = useState(domains.find((item) => item.name === "Family")?.name ?? domains[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const pick = async () => {
    if (!contacts) return;
    setBusy(true);
    setResult("");
    try {
      const offered = await contacts.getProperties();
      const chosen = await contacts.select(["name", ...offered.includes("icon") ? ["icon"] : []], { multiple: true });
      const picked = await Promise.all(chosen.flatMap((contact) => contact.name?.[0]?.trim() ? [contact] : []).map(async (contact) => ({
        name: contact.name![0].trim(),
        ...contact.icon?.[0] && { photo: await squarePhoto(contact.icon[0], 96).catch(() => undefined) },
      })));
      if (!picked.length) return;
      const added = onImport(picked.map(({ name, photo }) => ({ name, ...photo && { photo } })), domain);
      const skipped = picked.length - added.length;
      setResult(!added.length ? "Everyone you picked was already in your Library."
        : `Added ${added.join(", ")}.${skipped ? ` ${skipped} ${skipped === 1 ? "was" : "were"} already there.` : ""}`);
    } catch {
      setResult("The contact picker closed without sharing anyone.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="settings-group" aria-labelledby="settings-contacts">
      <h4 id="settings-contacts">From your phone's contacts</h4>
      <div className="settings-card">
        <p className="settings-card-copy">Pick people from your phone and they join the Library as people, with their name and picture only: no phone numbers,
          emails or addresses, and nothing syncs afterwards. Anyone already there is skipped.</p>
        {contacts ? <>
          <label className="setting-row">
            <div><strong>Where they belong</strong><p>Its agent reads about them, and Atlas.</p></div>
            <select value={domain} onChange={(event) => setDomain(event.target.value)}>
              {domains.map((item) => <option key={item.name} value={item.name}>{item.emoji} {item.name}</option>)}
              <option value="">Nowhere: Atlas alone</option>
            </select>
          </label>
          <div className="settings-actions">
            <button className="primary-button" disabled={busy} onClick={() => void pick()}><Contact size={16} />{busy ? "Waiting for your pick…" : "Choose contacts…"}</button>
          </div>
          {result && <p className="settings-note" role="status">{result}</p>}
        </> : (
          <div className="settings-actions">
            <p className="settings-note">This browser can't share your contacts; Chrome on Android can. Add people one by one with New person in the Library.</p>
            <button className="secondary-button" onClick={onLibrary}><Library size={16} />Open the Library</button>
          </div>
        )}
      </div>
    </section>
  );
}
