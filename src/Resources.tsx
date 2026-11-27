// Resources on screen: kind icons, capture detection, the card, the grid with kind chips, the viewer, the Capture
// form and the place picker. App.tsx owns the peek, the keep-sheet and the Library page.
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Check, ChevronDown, CircleCheck, Download, ExternalLink, File, FileText, Image, Link2, Mic, Paperclip, Play, Plus, Quote, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canDictate, useDictation } from "./dictation.ts";
import { kindLabels, kindOf, noteTitle, resourceKinds } from "./model.ts";
import type { Note, ResourceKind } from "./model.ts";
import type { ResourceDraft } from "./workspace.ts";
import { countUsage } from "./usage.ts";
import { Tip } from "./Popups.tsx";
import { DayTiles } from "./DayTiles.tsx";
import { useMentions } from "./MentionPicker.tsx";

export const kindIcons: Record<ResourceKind, LucideIcon> = { note: FileText, link: Link2, file: File, image: Image, video: Play, quote: Quote };
const plural: Record<ResourceKind, string> = { note: "Notes", link: "Links", file: "Files", image: "Images", video: "Videos", quote: "Quotes" };

export function youtubeId(url = "") {
  return url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/)?.[1];
}
export function hostOf(url = "") {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
const sizeOf = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const extensionOf = (name = "") => (name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? "file").toUpperCase();
/** The first readable paragraph, without markdown marks. */
export const excerptOf = (body: string) => body.replace(/[#*_>`]/g, "").split("\n").map((line) => line.trim()).find(Boolean) ?? "";

/** What a capture becomes: a file by its type, a URL as a link (or a video on YouTube), anything else a note. */
export function captured(text: string, file?: File): ResourceDraft {
  const trimmed = text.trim();
  if (file) {
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "file";
    return { kind, file, title: file.name.replace(/\.[^.]+$/, ""), body: trimmed };
  }
  if (/^https?:\/\/\S+$/i.test(trimmed))
    return { kind: youtubeId(trimmed) ? "video" : "link", url: trimmed, title: hostOf(trimmed), body: "" };
  const [first = "", ...rest] = trimmed.split("\n");
  return { kind: "note", title: first.slice(0, 80), body: (first.length > 80 ? `${first}\n${rest.join("\n")}` : rest.join("\n")).trim() };
}

/** An object URL for a stored file, released when the file changes or the view goes. */
export function useObjectUrl(file?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL follows the file and is released with it
    if (!file) return setUrl(undefined);
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function Favicon({ url }: { url?: string }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  return host && !failed
    ? <img className="favicon" src={`https://${host}/favicon.ico`} alt="" loading="lazy" onError={() => setFailed(true)} />
    : <Link2 size={14} />;
}

/** A card shaped by what it holds. Click peeks; Ctrl/Cmd-click or middle-click opens a tab. */
export function ResourceCard({ note, from, index, onOpen }: {
  note: Note; from?: string; index: number; onOpen: (note: Note, tab: boolean) => void;
}) {
  const kind = kindOf(note);
  const Icon = kindIcons[kind];
  const fileUrl = useObjectUrl(kind === "image" || kind === "video" ? note.file : undefined);
  const video = youtubeId(note.url);
  const thumb = kind === "image" ? fileUrl ?? note.url : video ? `https://i.ytimg.com/vi/${video}/hqdefault.jpg` : undefined;
  const open = (event: MouseEvent) => onOpen(note, event.ctrlKey || event.metaKey || event.button === 1);
  return (
    <button className="resource-card" data-kind={kind} style={{ "--i": index } as CSSProperties}
      onClick={open} onAuxClick={(event) => event.button === 1 && open(event)} onMouseDown={(event) => event.button === 1 && event.preventDefault()}>
      {(kind === "image" || kind === "video") && (
        <span className="resource-media">
          {thumb ? <img src={thumb} alt="" loading="lazy" /> : fileUrl ? <video src={fileUrl} muted preload="metadata" /> : <Icon size={28} strokeWidth={1.3} />}
          {kind === "video" && <span className="resource-play"><Play size={16} fill="currentColor" /></span>}
        </span>
      )}
      {kind === "file" && <span className="resource-glyph"><File size={30} strokeWidth={1.2} /><b>{extensionOf(note.file?.name)}</b></span>}
      <span className="resource-card-body">
        <span className="resource-kind">
          {kind === "link" ? <Favicon url={note.url} /> : <Icon size={14} />}
          {kind === "link" ? hostOf(note.url) : kind === "file" && note.file ? `${kindLabels.file} · ${sizeOf(note.file.size)}` : kindLabels[kind]}
        </span>
        {kind === "quote" ? <>
          <span className="resource-quote">{excerptOf(note.body) || note.title}</span>
          {note.source && <small className="resource-source">{note.source}</small>}
        </> : <>
          <strong>{noteTitle(note)}</strong>
          {kind !== "image" && kind !== "video" && excerptOf(note.body) && <span className="resource-excerpt">{excerptOf(note.body)}</span>}
        </>}
        {from && <span className="resource-from"><Link2 size={12} />from {from}</span>}
      </span>
    </button>
  );
}

/** Cards a grid without a `limit` draws at first and adds per "Show more": hundreds of cards take seconds to draw. */
const gridPage = 48;
/**
 * Resources as one grid, most recently touched first, with a chip per kind present. `from` labels linked ones.
 * `onOpen` gets the shown order so the peek can step through it. Without `limit` it shows `gridPage` cards at a time.
 */
export function ResourceGrid({ items, from, onOpen, onAdd, addLabel = "Add", title, limit, empty }: {
  items: Note[];
  from?: (note: Note) => string | undefined;
  onOpen: (note: Note, tab: boolean, order: string[]) => void;
  onAdd?: () => void;
  addLabel?: string;
  title?: ReactNode;
  limit?: number;
  empty: string;
}) {
  const [chip, setChip] = useState<ResourceKind | "all">("all");
  const [pages, setPages] = useState(1);
  const counts = new Map<ResourceKind, number>();
  for (const note of items) counts.set(kindOf(note), (counts.get(kindOf(note)) ?? 0) + 1);
  const pick = chip !== "all" && counts.has(chip) ? chip : "all";
  const picked = items.filter((note) => pick === "all" || kindOf(note) === pick);
  const cap = limit ?? pages * gridPage;
  const shown = picked.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, cap);
  const order = shown.map((note) => note.id);
  return (
    <section className="widget resources-widget">
      <div className="section-heading">
        <h2><Link2 size={16} />{title ?? "Resources"}</h2>
        {onAdd && <button className="text-button" onClick={onAdd}><Plus size={14} />{addLabel}</button>}
      </div>
      {counts.size > 1 && (
        <div className="kind-chips" role="group" aria-label="Show kind">
          <button aria-pressed={pick === "all"} onClick={() => setChip("all")}>All<span>{items.length}</span></button>
          {resourceKinds.filter((kind) => counts.has(kind)).map((kind) => {
            const Icon = kindIcons[kind];
            return (
              <button key={kind} aria-pressed={pick === kind} onClick={() => setChip(kind)}>
                <Icon size={14} />{plural[kind]}<span>{counts.get(kind)}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="resource-grid">
        {shown.map((note, index) => (
          <ResourceCard key={note.id} note={note} from={from?.(note)} index={index} onOpen={(item, tab) => onOpen(item, tab, order)} />
        ))}
      </div>
      {picked.length > cap && limit === undefined && (
        <button className="resources-more" onClick={() => setPages(pages + 1)}>Show {Math.min(picked.length - cap, gridPage)} more</button>
      )}
      {!items.length && <p className="empty-inline">{empty}</p>}
    </section>
  );
}

/** The thing itself, above your own words: image, player, document, link card, or a quote's source. */
export function ResourceViewer({ note, onChange }: { note: Note; onChange: (id: string, patch: Pick<Note, "source">) => void }) {
  const kind = kindOf(note);
  const fileUrl = useObjectUrl(kind === "note" || kind === "link" || kind === "quote" ? undefined : note.file);
  const video = youtubeId(note.url);
  if (kind === "image") return <figure className="resource-viewer viewer-image"><img src={fileUrl ?? note.url} alt={note.title} /></figure>;
  if (kind === "video") return (
    <figure className="resource-viewer viewer-video">
      {video ? <iframe src={`https://www.youtube-nocookie.com/embed/${video}`} title={note.title} loading="lazy"
        allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen />
        // eslint-disable-next-line jsx-a11y/media-has-caption -- your own dropped-in files: there's no caption track to offer.
        : fileUrl ? <video src={fileUrl} controls /> : <a href={note.url} target="_blank" rel="noreferrer">{note.url}</a>}
    </figure>
  );
  if (kind === "file") {
    // Browsers render PDFs, text, and images inline; anything else downloads.
    const inline = !!note.file && /^(application\/pdf|text\/|image\/)/.test(note.file.type);
    return (
      <figure className="resource-viewer viewer-file">
        {inline && fileUrl && <iframe src={fileUrl} title={note.title} />}
        <figcaption>
          <span className="resource-glyph small"><File size={18} strokeWidth={1.3} /><b>{extensionOf(note.file?.name)}</b></span>
          <span><strong>{note.file?.name ?? "No file"}</strong><small>{note.file ? sizeOf(note.file.size) : ""}</small></span>
          {fileUrl && <a className="quiet-button" href={fileUrl} download={note.file?.name}><Download size={14} />Download</a>}
        </figcaption>
      </figure>
    );
  }
  if (kind === "link") return (
    <a className="resource-viewer viewer-link" href={note.url} target="_blank" rel="noreferrer">
      <Favicon url={note.url} /><span><strong>{hostOf(note.url)}</strong><small>{note.url}</small></span><ExternalLink size={16} />
    </a>
  );
  if (kind === "quote") return (
    <label className="resource-viewer viewer-quote">
      Source
      <input value={note.source ?? ""} placeholder="Who said it, where" onChange={(event) =>
        onChange(note.id, { source: event.target.value })} />
    </label>
  );
  return null;
}

/** What you were writing in Capture, kept on this device until you save it, so closing the dialog loses nothing. */
const draftKey = "atlaswork.capture-draft";
const keepDraft = (text: string) => {
  try { if (text.trim()) localStorage.setItem(draftKey, text); else localStorage.removeItem(draftKey); } catch { /* blocked: the draft goes with the dialog */ }
};

/** Where a capture can go: each domain with its projects, then the Library's topics (`View.placeGroups`). */
type Places = { label: string; options: { value: string; label: string }[] }[];
/** What Capture's words can turn into instead: a form `named` by them (project, topic, domain), or another start. */
export type CaptureTurn = { icon: LucideIcon; label: string; hint: string; named?: boolean; run: (words: string) => void };
/** What the words are kept as: what they look like, or a note, quote or task you chose. */
type Keep = "guess" | "note" | "quote" | "task";

/** Quote or Task, once chosen, stays the choice for the next capture on this device; the others go back to guessing. */
const keepKey = "atlaswork.capture-kind";
const keptChoice = (): Keep => { try { const kept = localStorage.getItem(keepKey); return kept === "quote" || kept === "task" ? kept : "guess"; } catch { return "guess"; } };
/** The last places Capture saved to on this device, newest first, offered before the full list. */
const placesKey = "atlaswork.capture-places";
const recentPlaces = (): string[] => { try { return JSON.parse(localStorage.getItem(placesKey) ?? "[]") as string[]; } catch { return []; } };
const rememberPlace = (place: string) => {
  const recent = [place, ...recentPlaces().filter((item) => item !== place)].slice(0, 3);
  try { localStorage.setItem(placesKey, JSON.stringify(recent)); } catch { /* blocked: no recents */ }
};
/** A mouse and keyboard: Enter saves and Shift Enter starts a line. On touch, Enter is the keyboard's new line. */
const enterSaves = typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * One field for anything: paste a link, type a thought, speak, or drop or pick files (several at once, each saved as its
 * own resource with the same words). A chip in the field says what
 * it's saved as and unfolds the choice: kept as what it looks like, a note, a quote or a task, or turned into a project,
 * topic or domain (`turns`) named by the words. The place is the dialog header's (`PlacePill`); `place.open` unfolds its
 * chips at the top of the form. Choices unfold in the form, never as popovers, so a phone's keyboard closing and the
 * dialog moving never clips them. With nothing typed, Save makes a blank note. `initial` is text it opens with
 * (something shared), else the unsaved draft; `listen` starts the microphone at once (a voice capture). `sort` hands the
 * words to Atlas to sort into tasks and notes instead (agents-design D53); its button shows from the start and wakes
 * once there are words.
 */
export function CaptureForm({ place, today, onSave, onTask, turns, initial, listen, sort }: {
  place: { value: string; onChange: (value: string) => void; groups: Places; onNewTopic: (name: string) => string | undefined; open: boolean };
  /** Today as YYYY-MM-DD: a task is due today unless you pick another day. */
  today: string;
  /** One draft, or one per file when several are attached (each with the same words). */
  onSave: (drafts: ResourceDraft[]) => void;
  onTask: (title: string, due: string) => void;
  turns: CaptureTurn[];
  initial?: string;
  listen?: boolean;
  sort?: { face: string; run: (draft: ResourceDraft) => void };
}) {
  const [kinds, setKinds] = useState(false);
  const [text, setText] = useState(() => { try { return initial || localStorage.getItem(draftKey) || ""; } catch { return initial ?? ""; } });
  const mention = useMentions<HTMLTextAreaElement>(text, (next) => { setText(next); keepDraft(next); });
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0];
  const [keep, setKeep] = useState<Keep>(keptChoice);
  const [due, setDue] = useState(today);
  const [source, setSource] = useState("");
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const spokenAfter = useRef("");
  const dictation = useDictation((heard) => { const next = spokenAfter.current + heard; setText(next); keepDraft(next); });
  const guess = captured(text, file);
  const taskHome = !place.value.startsWith("topic:");
  // A file is always kept as itself; a task can't live in a topic, so there it falls back to a note.
  const as: Keep = file ? "guess" : keep === "task" && !taskHome ? "note" : keep;
  const draft: ResourceDraft = as === "quote" ? { kind: "quote", title: text.trim().slice(0, 60), body: text.trim(), source: source.trim() }
    : as === "note" ? { ...captured(text), kind: "note" } : guess;
  const words = !!text.trim();
  const ready = !!file || words || as === "guess" || as === "note";
  const shown = as === "task" ? "Task" : kindLabels[draft.kind as ResourceKind];
  const Shown = as === "task" ? CircleCheck : kindIcons[draft.kind as ResourceKind];
  const listening = dictation.state === "listening";
  const speak = () => {
    spokenAfter.current = text.trim() ? `${text.trimEnd()} ` : "";
    countUsage("capture_dictated");
    dictation.start();
  };
  const save = () => {
    if (!ready) return;
    dictation.stop();
    keepDraft("");
    rememberPlace(place.value);
    if (as === "task") onTask(text.trim(), due);
    else onSave(files.length > 1 ? files.map((item) => captured(text, item)) : [draft]);
  };
  // Picking, dropping or pasting adds to the files already there; the same file twice counts once.
  const take = (list?: FileList | null) => {
    if (!list?.length) return;
    const added = [...list];
    const same = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
    setFiles((kept) => [...kept, ...added.filter((item) => !kept.some((other) => same(item, other)))]);
    setKinds(false);
  };
  const many = files.length > 1;
  const total = files.reduce((sum, item) => sum + item.size, 0);
  const choose = (next: Keep) => {
    setKeep(next);
    setKinds(false);
    try { if (next === "quote" || next === "task") localStorage.setItem(keepKey, next); else localStorage.removeItem(keepKey); } catch { /* blocked: the choice lasts this capture */ }
  };
  // A voice capture listens as it opens; the microphone's own permission prompt is the browser's.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on opening
  useEffect(() => { if (listen && canDictate) speak(); }, []);
  const GuessIcon = kindIcons[captured(text).kind as ResourceKind];
  const option = (value: Keep, Icon: LucideIcon, label: string, hint: string, disabled = false) => (
    <button key={value} type="button" role="menuitemradio" aria-checked={as === value} disabled={disabled} onClick={() => choose(value)}>
      <Icon size={16} /><span><strong>{label}</strong><small>{hint}</small></span>{as === value && <Check size={16} className="capture-picked" />}
    </button>
  );
  return (
    <form className="capture-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
      {place.open && <PlaceChips {...place} />}
      <div className="capture-box" data-dragging={dragging}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); take(event.dataTransfer.files); }}>
        {files.length > 0 && (
          <div className="capture-files">
            {many && <p className="capture-files-total">{files.length} files · {sizeOf(total)}</p>}
            {files.map((item, index) => {
              const Kind = kindIcons[captured("", item).kind as ResourceKind];
              return (
                <div key={`${item.name}-${item.size}-${item.lastModified}`} className="capture-file">
                  <Kind size={18} /><span><strong>{item.name}</strong><small>{sizeOf(item.size)}</small></span>
                  <Tip label={`Remove ${item.name}`}><button type="button" className="icon-button" aria-label={`Remove ${item.name}`}
                    onClick={() => setFiles(files.filter((_, at) => at !== index))}><X size={16} /></button></Tip>
                </div>
              );
            })}
          </div>
        )}
        <span className="mention-host">
        <textarea {...mention.field} className="capture-field" aria-label="Capture" rows={file ? 2 : 3} value={text}
          placeholder={many ? "Why keep them? (optional, added to each)" : file ? "Why keep it? (optional)" : listening ? "Listening… say what's on your mind" : as === "task" ? "What needs doing?" : "Paste a link, write a thought, or drop files…"}
          onChange={(event) => { dictation.stop(); setText(event.target.value); keepDraft(event.target.value); }}
          onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); take(event.clipboardData.files); } }}
          onKeyDown={(event) => {
            mention.field.onKeyDown(event);
            if (event.defaultPrevented || event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            if (enterSaves || event.ctrlKey || event.metaKey) { event.preventDefault(); save(); }
          }} />
        {mention.list}
        </span>
        {as === "quote" && (
          <input className="capture-source" aria-label="Source" value={source} placeholder="Who said it, where" onChange={(event) => setSource(event.target.value)} />
        )}
        <div className="capture-tools">
          <Tip label="Attach files"><button type="button" className="icon-button" aria-label="Attach files" onClick={() => picker.current?.click()}><Paperclip size={16} /></button></Tip>
          <input ref={picker} type="file" multiple hidden onChange={(event) => { take(event.target.files); event.target.value = ""; }} />
          {canDictate && (
            <Tip label={listening ? "Stop listening" : "Speak"}><button type="button" className="icon-button capture-mic" aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak"}
            onClick={listening ? dictation.stop : speak}><Mic size={16} /></button></Tip>
          )}
          {dictation.state === "blocked" && <span className="capture-blocked" role="alert">The microphone is blocked. Allow it for this site in the browser’s settings.</span>}
          {dictation.state === "failed" && <span className="capture-blocked" role="alert">The browser’s speech service didn’t answer. Try again, or type it.</span>}
          {file ? (
            <span className="capture-kind"><Shown size={14} />{many ? `${files.length} files` : shown}</span>
          ) : (
            <Tip label="What to save it as"><button type="button" className="capture-kind" aria-expanded={kinds} aria-controls="capture-kinds" onClick={() => setKinds(!kinds)}>
              <small>Save as</small><Shown size={14} />{shown}{as === "guess" && draft.url ? ` · ${hostOf(draft.url)}` : ""}<ChevronDown size={14} />
            </button></Tip>
          )}
        </div>
      </div>
      {kinds && !file && (
        <div id="capture-kinds" className="capture-panel capture-kinds" role="menu" aria-label="Save it as">
          <h3>Keep it as</h3>
          {option("guess", GuessIcon, kindLabels[captured(text).kind as ResourceKind], words ? "What it looks like" : "A page to write in, opened in a tab")}
          {captured(text).kind !== "note" && option("note", FileText, "Note", "Plain text you can write in")}
          {option("quote", Quote, "Quote", "Words worth keeping, with who said them")}
          {option("task", CircleCheck, "Task", taskHome ? "Something to do, with a day" : "Tasks live in a domain or a project, not a topic", !taskHome)}
          <h3>Turn it into</h3>
          {turns.map(({ icon: TurnIcon, label, hint, named, run }) => (
            <button key={label} type="button" role="menuitem" onClick={() => { if (named) keepDraft(""); run(text); }}>
              <TurnIcon size={16} /><span><strong>{label}</strong><small>{hint}</small></span>
            </button>
          ))}
        </div>
      )}
      {/* When it's due: today by default, so a captured task lands on Today's plate; the same day tiles as the task dialog. */}
      {as === "task" && <div className="capture-due"><DayTiles due={due} onDue={setDue} label="Due" someday /></div>}
      <div className="capture-actions">
        {sort && (
          <Tip label={file ? "Atlas sorts words, not files" : words ? "Atlas turns it into tasks and notes where they belong" : "Write or say something, and Atlas sorts it into tasks and notes"}><button type="button" className="secondary-button capture-sort" disabled={!!file || !words} onClick={() => { dictation.stop(); keepDraft(""); rememberPlace(place.value); sort.run({ ...captured(text), kind: "note" }); }}>
          <img src={sort.face} alt="" /><span>Sort with Atlas</span></button></Tip>
        )}
        <button className="primary-button" type="submit" disabled={!ready}>Save<kbd>{enterSaves ? "↵" : "Ctrl ↵"}</kbd></button>
      </div>
    </form>
  );
}

/** A place as words: "☀️ Everyday", "☀️ Everyday › Home office", or a topic's own name. */
function placeName(groups: Places, value: string) {
  for (const group of groups) {
    const option = group.options.find((item) => item.value === value);
    if (!option) continue;
    return value.startsWith("area:") ? group.label : value.startsWith("topic:") ? option.label : `${group.label} › ${option.label}`;
  }
  return "Choose a place";
}

/** Capture's place in its header ("Capture to ☀️ Everyday"): a pill that unfolds every place in the form. */
export function PlacePill({ groups, value, open, onToggle }: { groups: Places; value: string; open: boolean; onToggle: () => void }) {
  return (
    <span className="capture-to">
      <span id="capture-to-label">to</span>
      <button type="button" className="capture-toggle" aria-labelledby="capture-to-label capture-to-value" aria-expanded={open}
        aria-controls="capture-places" onClick={onToggle}>
        <span id="capture-to-value">{placeName(groups, value)}</span><ChevronDown size={14} />
      </button>
    </span>
  );
}

/**
 * Places as chips you tap, unfolded in the form: where it's going and the last places you saved to first, then "All
 * places": each domain leading its row with its projects after it, the Library's topics and a new topic named in place.
 * The chosen place is filled.
 */
function PlaceChips({ value, onChange, groups, onNewTopic }: {
  value: string; onChange: (value: string) => void; groups: Places; onNewTopic: (name: string) => string | undefined;
}) {
  const [all, setAll] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const known = new Set(groups.flatMap((group) => group.options.map((option) => option.value)));
  const near = [...new Set([value, ...recentPlaces()])].filter((item) => known.has(item)).slice(0, 4);
  const create = () => {
    const made = onNewTopic(naming ?? "");
    if (made) { onChange(made); setNaming(null); }
  };
  const chip = (option: { value: string; label: string }, text = option.label) => (
    <button key={option.value} type="button" className="where-chip" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{text}</button>
  );
  return (
    <div id="capture-places" className="capture-panel place-chips" role="group" aria-label="Save to">
      <div className="place-row" data-recent>
        {near.map((item) => chip({ value: item, label: placeName(groups, item) }))}
        {!all && <button type="button" className="where-chip where-chip-new" aria-expanded={false} onClick={() => setAll(true)}>All places<ChevronDown size={14} /></button>}
      </div>
      {all && groups.map((group) => {
        const topics = group.options.every((option) => option.value.startsWith("topic:"));
        return (
          <div key={group.label} className="place-row" data-topics={topics || undefined}>
            {topics ? <span className="place-row-label">{group.label}</span> : chip(group.options[0], group.label)}
            {(topics ? group.options : group.options.slice(1)).map((option) => chip(option))}
            {topics && (naming === null
              ? <button type="button" className="where-chip where-chip-new" onClick={() => setNaming("")}><Plus size={14} />New topic</button>
              : <span className="place-new">
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- appears only after you tap "New topic", so focus follows your action. */}
                <input autoFocus aria-label="New topic name" placeholder="New topic name" maxLength={40} value={naming}
                  onChange={(event) => setNaming(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); create(); }
                    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNaming(null); }
                  }} />
                <button type="button" className="quiet-button" onClick={create} disabled={!naming.trim()}>Add</button>
              </span>)}
          </div>
        );
      })}
    </div>
  );
}

/** A small square for topic cards: the picture when there is one, else the kind's icon. */
export function ResourceThumb({ note }: { note: Note }) {
  const kind = kindOf(note);
  const fileUrl = useObjectUrl(kind === "image" ? note.file : undefined);
  const video = youtubeId(note.url);
  const src = kind === "image" ? fileUrl ?? note.url : video ? `https://i.ytimg.com/vi/${video}/default.jpg` : undefined;
  const Icon = kindIcons[kind];
  return <span className="resource-thumb" data-kind={kind}>{src ? <img src={src} alt="" loading="lazy" /> : <Icon size={16} />}</span>;
}

/** A home picker: domains, their projects, and topics (`area:Name`, a project id, `topic:id`), with a new topic made inline. */
export function PlacePicker({ value, onChange, groups, onNewTopic, label }: {
  value: string;
  onChange: (value: string) => void;
  groups: { label: string; options: { value: string; label: string }[] }[];
  /** Returns the new topic's place value, or undefined when the name is taken or empty. */
  onNewTopic: (name: string) => string | undefined;
  label: string;
}) {
  const [naming, setNaming] = useState<string | null>(null);
  const create = () => {
    const made = onNewTopic(naming ?? "");
    if (made) { onChange(made); setNaming(null); }
  };
  if (naming !== null) return (
    <span className="place-new">
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- appears only after you click "New topic", so focus follows your action. */}
      <input autoFocus aria-label="New topic name" placeholder="New topic name" maxLength={40} value={naming}
        onChange={(event) => setNaming(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); create(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setNaming(null); }
        }} />
      <button type="button" className="quiet-button" onClick={create} disabled={!naming.trim()}>Add</button>
      <button type="button" className="quiet-button" onClick={() => setNaming(null)}>Cancel</button>
    </span>
  );
  return (
    <select aria-label={label} value={value} onChange={(event) => event.target.value === "+topic" ? setNaming("") : onChange(event.target.value)}>
      {!value && <option value="" disabled>Choose a topic</option>}
      {groups.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </optgroup>
      ))}
      <option value="+topic">＋ New topic…</option>
    </select>
  );
}
