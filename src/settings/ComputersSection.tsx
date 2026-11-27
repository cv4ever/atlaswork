// Settings → Account → Computers (agents-design D77): the computers the account's desktop app runs on, each with when
// it was last seen and its app version (D85), and Remove, asked first, which also forgets where agents learned things
// are on it (D80). In the desktop app the section also pairs the computer it runs on: a name
// and one click, then the app's own dialog confirms before it keeps the token. Once paired, that computer's own window
// turns its search on or off and edits the list of folders agents may search there (D78), and turns tidying on or off
// (D79), which needs Documents on that list; other devices see only whether a computer searches and tidies. In a
// browser it shows only once the account has a computer.
import { Fragment, useEffect, useState } from "react";
import { FolderMinus, FolderPlus, Monitor, Plus, Trash2 } from "lucide-react";
import { useApp, useView } from "../appContext.ts";
import { listComputers, registerComputer, removeComputer, setComputerSearch, setComputerTidy } from "../computers.ts";
import type { Computer } from "../computers.ts";
import { computerName, desktop } from "../desktop.ts";
import type { DesktopInfo, DesktopSearch } from "../desktop.ts";
import { Tip } from "../Popups.tsx";
import { editedAgo } from "../StatusBar.tsx";
import { locale } from "../dates.ts";

/** What this computer's search index holds, in words, while it reads and once it's done. */
function indexLine(index: DesktopSearch["index"], now: number): string {
  const count = (n: number) => n.toLocaleString(locale);
  if (index?.reading) return index.files ? `Reading your folders: ${count(index.files)} files so far…` : "Reading your folders…";
  if (!index?.at) return "Reading your folders…";
  return `${count(index.files)} files, ${count(index.texts)} of them with their text, updated ${editedAgo(index.at, now)}.${
    index.full ? " That's the most it keeps: take a folder off the list to make room." : ""}`;
}

/**
 * This computer's search list while search is on: its folders with Remove, the usual ones to add in one tap or another
 * through Windows' picker, and tidying (D79), which needs Documents on the list.
 */
function SearchList({ search, busy, tidying, onAdd, onRemove, onTidy }: { search: DesktopSearch; busy: boolean; tidying: boolean;
  onAdd: (path?: string) => void; onRemove: (path: string) => void; onTidy: (on: boolean) => void }) {
  return <>
    {search.folders.map((folder) => (
      <div className="setting-row" key={folder.path}>
        <div><strong>{folder.name}</strong><p>{folder.path}</p></div>
        <button className="secondary-button" disabled={busy} onClick={() => onRemove(folder.path)}><FolderMinus size={16} />Remove</button>
      </div>
    ))}
    <div className="setting-row setting-row-stacked">
      <div><strong>Add a folder</strong>
        <p>{search.folders.length ? "A folder that holds ones on the list takes their place." : "Nothing is searched until you add one."}</p></div>
      <div className="settings-actions">
        {search.offered.map((folder) => (
          <Tip key={folder.path} label={folder.path}>
            <button className="secondary-button" disabled={busy} onClick={() => onAdd(folder.path)}><Plus size={16} />{folder.name}</button>
          </Tip>
        ))}
        <button className="secondary-button" disabled={busy} onClick={() => onAdd()}><FolderPlus size={16} />Another folder…</button>
      </div>
    </div>
    <label className="setting-row toggle-row">
      <div><strong>Let agents tidy files here</strong>
        <p>They move and rename files in these folders into folders they make in Documents, such as Documents\Bank, and say why for
          each, with Undo. Only agents with Tidy files on.</p>
        {!search.documents && <p>Add Documents to the list first: their folders go there.</p>}</div>
      <input type="checkbox" role="switch" checked={tidying} disabled={busy || !tidying && !search.documents}
        onChange={(event) => onTidy(event.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  </>;
}

export function ComputersSection() {
  const profileName = useView((view) => view.session.profileName);
  const { workbench } = useApp();
  const [computers, setComputers] = useState<Computer[]>([]);
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [name, setName] = useState<string>();
  const [now, setNow] = useState(Date.now);
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    listComputers().then((list) => { if (live) setComputers(list); }, () => undefined);
    desktop?.info().then((read) => { if (live) setInfo(read); }, () => undefined);
    return () => { live = false; };
  }, []);
  // This computer, when the desktop app here is paired with one of this account's computers.
  const here = info?.computer && computers.some((computer) => computer.id === info.computer!.id) ? info.computer.id : undefined;
  // Search is on when both this computer and the account say so: the list is here, and the account says where to ask.
  const searching = !!here && !!info?.search.on && !!computers.find((computer) => computer.id === here)?.search;
  // Tidying (D79) likewise: this computer keeps it on only while search is on and Documents is on the list.
  const tidying = searching && !!info?.search.tidy && !!computers.find((computer) => computer.id === here)?.tidy;
  // While search is on, the index's status is read again every few seconds, so its count moves as the helper reads.
  useEffect(() => {
    if (!searching) return;
    const timer = window.setInterval(() => {
      desktop?.info().then((read) => { setInfo((was) => was && { ...was, search: read.search }); setNow(Date.now()); }, () => undefined);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [searching]);
  if (!computers.length && !info) return null;
  const run = async (work: () => Promise<void>, failed: string) => {
    setBusy(true);
    setError("");
    // The desktop app refuses with its own words, as a plain string.
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : typeof cause === "string" ? cause : failed); } finally {
      setBusy(false);
    }
  };
  const remove = (computer: Computer) => run(async () => {
    setConfirming(undefined);
    await removeComputer(computer.id);
    if (computer.id === here) await desktop?.unpair();
    setComputers(computers.filter((item) => item.id !== computer.id));
    // The account forgot what agents learned there (D80): reload, so its memories and their pills go here too.
    void workbench.refresh();
  }, `${computer.name} wasn't removed. Try again.`);
  const pair = (named: string) => run(async () => {
    const made = await registerComputer(named);
    try {
      await desktop!.pair({ id: made.id, name: made.name, token: made.token });
    } catch (cause) {
      // Declined in the app's dialog, or it couldn't keep the token: the computer the account just made goes again.
      await removeComputer(made.id).catch(() => undefined);
      if (cause === "Not now") return;
      throw new Error(typeof cause === "string" ? cause : "This computer wasn't added. Try again.");
    }
    setComputers([...computers, made]);
    setInfo({ ...info!, computer: { id: made.id, name: made.name } });
  }, "This computer wasn't added. Try again.");
  // The app turns tidying off when Documents leaves the list (D79); the account follows it.
  const searched = async (search: DesktopSearch | null) => {
    if (!search) return;
    setInfo({ ...info!, search });
    if (!search.tidy && computers.find((computer) => computer.id === here)?.tidy) {
      await setComputerTidy(here!, false);
      setComputers((list) => list.map((computer) => computer.id === here ? { ...computer, tidy: false } : computer));
    }
  };
  const searchHere = (on: boolean) => run(async () => {
    // On: the account first, so a refusal leaves this computer off. Off: this computer first, so it stops at once.
    if (on) await setComputerSearch(here!, true);
    setInfo({ ...info!, search: await desktop!.setSearch(on) });
    // Off takes tidying along, here and in the account (D79).
    if (!on) await setComputerSearch(here!, false);
    setComputers((list) => list.map((computer) => computer.id === here ? { ...computer, search: on, tidy: on && computer.tidy } : computer));
  }, on ? "Search wasn't turned on. Try again." : "Search wasn't turned off. Try again.");
  const tidyHere = (on: boolean) => run(async () => {
    // The same order as search; a refusal here puts the account back off.
    if (on) await setComputerTidy(here!, true);
    try {
      setInfo({ ...info!, search: await desktop!.setTidy(on) });
    } catch (cause) {
      if (on) await setComputerTidy(here!, false).catch(() => undefined);
      throw cause;
    }
    if (!on) await setComputerTidy(here!, false);
    setComputers((list) => list.map((computer) => computer.id === here ? { ...computer, tidy: on } : computer));
  }, on ? "Tidying wasn't turned on. Try again." : "Tidying wasn't turned off. Try again.");
  const addFolder = (path?: string) => run(async () => searched(await desktop!.addSearchFolder(path)), "That folder wasn't added. Try again.");
  const removeFolder = (path: string) => run(async () => searched(await desktop!.removeSearchFolder(path)), "That folder wasn't removed. Try again.");
  const suggested = name ?? computerName(info?.deviceName ?? "", profileName);
  return (
    <section className="settings-group" aria-labelledby="account-computers-title">
      <h4 id="account-computers-title">Computers</h4>
      <div className="settings-card">
        {info && !here && <>
          <div className="setting-row">
            <div><strong>Let agents work on this computer</strong>
              <p>They reach only the folders you link here, and you can remove it any time.</p></div>
          </div>
          <form className="account-form" onSubmit={(event) => { event.preventDefault(); if (suggested.trim()) void pair(suggested.trim()); }}>
            <input aria-label="This computer's name" maxLength={80} value={suggested} onChange={(event) => setName(event.target.value)} />
            <button className="primary-button" disabled={busy || !suggested.trim()}><Monitor size={16} />{busy ? "Adding…" : "Let them work here"}</button>
          </form>
        </>}
        {computers.map((computer) => <Fragment key={computer.id}>
          <div className="setting-row">
            <div><strong>{computer.name}</strong>
              <p>{computer.id === here ? "This computer · " : ""}{computer.lastSeen ? `Seen ${editedAgo(computer.lastSeen, now)}` : "Not seen yet"}
                {computer.version ? ` · Version ${computer.version}` : ""}
                {computer.id !== here && computer.search ? computer.tidy ? " · Agents may search and tidy it" : " · Agents may search it" : ""}</p></div>
            {confirming !== computer.id && <button className="secondary-button" disabled={busy}
              onClick={() => setConfirming(computer.id)}><Trash2 size={16} />Remove…</button>}
          </div>
          {computer.id === here && info && <>
            <label className="setting-row toggle-row">
              <div><strong>Let agents search this computer</strong>
                <p>Only in the folders you add here, which stay on this computer. Ask from any of your devices; what an agent finds goes to the
                  AI model like a file from a linked folder.</p>
                {searching && !!info.search.folders.length && <p role="status">{indexLine(info.search.index, now)}</p>}</div>
              <input type="checkbox" role="switch" checked={searching} disabled={busy} onChange={(event) => void searchHere(event.target.checked)} />
              <span className="switch" aria-hidden="true" />
            </label>
            {searching && <SearchList search={info.search} busy={busy} tidying={tidying} onAdd={(path) => void addFolder(path)}
              onRemove={(path) => void removeFolder(path)} onTidy={(on) => void tidyHere(on)} />}
          </>}
          {confirming === computer.id && (
            <div className="conn-confirm" role="alertdialog" aria-labelledby={`computer-confirm-${computer.id}`}>
              <p id={`computer-confirm-${computer.id}`}><strong>Remove {computer.name}?</strong> Agents stop working on it at once, work
                waiting for it stops, and they forget where things are on it. Adding it again takes one click in its desktop app.</p>
              <div className="settings-actions">
                <button className="primary-button danger-button" disabled={busy} onClick={() => void remove(computer)}><Trash2 size={16} />Remove</button>
                {/* Keep it takes focus, so Enter backs out rather than removing. */}
                <button className="secondary-button" ref={(button) => button?.focus()} onClick={() => setConfirming(undefined)}>Keep it</button>
              </div>
            </div>
          )}
        </Fragment>)}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <p className="settings-note">Agents work on a computer through the Atlaswork desktop app there.</p>
    </section>
  );
}
