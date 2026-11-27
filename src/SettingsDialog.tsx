// The one Settings dialog, laid out by PanelTabs. You: Profile, Account (AccountSettings.tsx), AI model
// (OwnModelSettings.tsx), Connections (agents-design D74), Every agent (EveryAgentSettings.tsx, drawn by its host) and
// Backups. App: Appearance, Canvas and Layout, whose pages App.tsx draws (it owns the look Session and hover previews),
// each ending in LookPreview, a real `.workbench` at half scale. The avatar opens it on Profile, the Settings button on
// Appearance. Its sections are src/settings/ (Backups, Connections, the about line and Setup).
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Camera, Check, Cloud, Contact, HardDrive, Info, LayoutPanelLeft, LogIn, Palette, PenLine, Plug, Sparkles, Sprout, Users, Wallpaper } from "lucide-react";
import { AboutSection } from "./AboutSettings.tsx";
import Dialog from "./Dialog.tsx";
import PanelTabs from "./PanelTabs.tsx";
import type { PanelTab } from "./PanelTabs.tsx";
import { AccountSection } from "./AccountSettings.tsx";
import { OwnModelSection } from "./OwnModelSettings.tsx";
import { auth } from "./account.ts";
import { plantStages, portraits } from "./look.ts";
import { PictureChoices, pictureNote, usePhotoUpload } from "./PicturePicker.tsx";
import Plant from "./Plant.tsx";
import type { LocalModel } from "./atlas.ts";
import { Tip } from "./Popups.tsx";
import { BackupsSection } from "./settings/BackupsSection.tsx";
import type { Backups } from "./settings/BackupsSection.tsx";
import { calendarOffered } from "./connections.ts";
import { AboutLine, SetupAgain } from "./settings/ProfileParts.tsx";
import type { SettingsTab } from "./ui.ts";

/** Which tab holds each step of the plant's vine. */
const stepTabs: Record<string, SettingsTab> = { "profile-name": "you", "profile-about": "you", "profile-account": "account", "profile-backups": "backups" };

/** A name to suggest from a sign-in email: "ana.lopez@…" → "Ana". */
const nameFromEmail = (email: string) => {
  const word = email.split("@")[0].split(/[._+-]/)[0].replace(/\d+$/, "");
  return word.length > 1 ? word[0].toLocaleUpperCase() + word.slice(1) : "";
};
/** A touch screen can't hover, so the looks' try-it-on hint only shows where a pointer can. */
const tryOn = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;
/** The App group's pages, drawn by `App.tsx`, which owns the look Session and its previews. */
export type AppPages = Record<"appearance" | "canvas" | "layout", ReactNode>;

/**
 * Settings, in one dialog (two tab groups). You: a plant that grows as you fill in your profile (name, a line about
 * you, an account, a backup), the account, your own AI model, and workspace backups. App: appearance, canvas and
 * layout. Edits save as you go, like the rest of the session.
 */
export default function SettingsDialog({ name, bio, picture, photo, hue, portrait, greeting, backups, app, daypart, initialTab = "you", localModel, spend, everyAgent, people, connections, onChange, onSetup, onClose }: {
  name: string; bio: string; picture: string; photo: string; hue: string; greeting: string; backups: Backups; app: AppPages;
  /** The crew face you picked as your picture, "" for none. */
  portrait: string;
  /** null opens Settings itself: Appearance beside the list on desktop, the list alone on phones. */
  daypart: string; initialTab?: SettingsTab | null;
  /** The engine's device-local provider, offered in AI model beside the account's. */
  localModel?: LocalModel;
  /** Spend by agent, shown under AI model (agents-design D45). */
  spend?: ReactNode;
  /** Settings → Every agent (D46), given a way to open AI model when there's an account for one. */
  everyAgent: (openModel?: () => void) => ReactNode;
  /** Settings → People (D71): adding people from the phone's contacts, only when asked. */
  people: ReactNode;
  /** Settings → Connections (D74, D83), given whether you're signed in and a way to Account. */
  connections: (signedIn: boolean, onAccount: () => void) => ReactNode;
  onChange: (patch: { profileName?: string; profileBio?: string; profilePhoto?: string; profileHue?: string; profilePortrait?: string }) => void;
  /** Closes Settings and runs the welcome again (agents-design D34). */
  onSetup: () => void;
  onClose: () => void;
}) {
  // undefined while the session loads, null when signed out.
  const [user, setUser] = useState<string | null>();
  useEffect(() => { void auth?.getSession().then(({ data }) => setUser(data.session?.user.email ?? null)); }, []);
  const start = initialTab ?? "appearance";
  const [tab, setTab] = useState<SettingsTab>(auth || (start !== "account" && start !== "model") ? start : "you");
  // A vine step to focus once its tab has rendered.
  const [focusStep, setFocusStep] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const photos = usePhotoUpload(onChange);
  // The faces fold behind one button until you go looking (progressive disclosure); a face you use stays out front.
  const [faces, setFaces] = useState(false);

  // Making the profile counts as the first step, so the plant never starts at zero.
  const steps = [
    { id: "made", label: "Profile made", done: true },
    { id: "profile-name", label: "Your name", done: !!name.trim() },
    { id: "profile-about", label: "A line about you", done: !!bio.trim() },
    ...(auth ? [{ id: "profile-account", label: "Signed in", done: !!user }] : []),
    { id: "profile-backups", label: "Backed up", done: !!backups.last },
  ];
  const done = steps.filter((step) => step.done).length;
  const stage = plantStages[Math.round(((done - 1) / (steps.length - 1)) * (plantStages.length - 1))];
  const next = steps.find((step) => !step.done);
  const suggested = !name.trim() && user ? nameFromEmail(user) : "";
  const goTo = (id: string) => {
    setTab(stepTabs[id] ?? "you");
    setFocusStep(id);
  };
  useEffect(() => {
    if (!focusStep) return;
    const target = body.current?.querySelector<HTMLElement>(`#${focusStep}`);
    target?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target?.querySelector<HTMLElement>("input:not([hidden]), textarea, .primary-button, .secondary-button")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a step focuses once, after its tab has rendered
    setFocusStep("");
  }, [focusStep, tab, user]);

  const you: PanelTab[] = [
    { id: "you", label: "Profile", hint: "Name, picture, about", icon: Sprout, sticker: "👋", blurb: "How Atlaswork greets you. The plant grows as you go." },
    ...(auth ? [
      { id: "account", label: "Account", hint: user ? "Plan, usage, sign out" : "Sign in to sync", icon: Cloud, sticker: user ? "☁️" : "🔑", blurb: user ? "Your workspace follows you to every device." : "One email link and your workspace follows you anywhere." },
      { id: "model", label: "AI model", hint: "Bring your own", icon: Sparkles, sticker: "🧠", blurb: "Plug in your own model. Your agents think with it, your provider bills you." },
      ...calendarOffered ? [{ id: "connections", label: "Connections", hint: "Google Calendar", icon: Plug, sticker: "🔌", blurb: "Accounts your agents can use, and what each one may do with them." }] : [],
    ] : []),
    { id: "agents", label: "Every agent", hint: "Rules they all share", icon: Users, sticker: "🤝", blurb: "What all your agents share: house rules, a personality, and the tools new ones start with." },
    { id: "people", label: "People", hint: "From your contacts", icon: Contact, sticker: "📇", blurb: "Bring a few people over from your phone. Only the ones you pick, and only when you ask." },
    { id: "backups", label: "Backups", hint: backups.last ? `Last ${backups.last}` : "None yet", icon: HardDrive, sticker: "📦", blurb: "One file that holds everything. Keep it somewhere safe." },
  ];
  const appTabs: PanelTab[] = [
    { id: "appearance", label: "Appearance", hint: "Theme, emblems, crew", icon: Palette, sticker: "🎨", blurb: tryOn ? "Pick a theme, its emblems and how your crew is drawn. Hover one to try it on." : "Pick a theme, its emblems and how your crew is drawn. Tap one to use it." },
    { id: "canvas", label: "Canvas", hint: "Pattern, sidebar, rail", icon: Wallpaper, sticker: daypart === "night" ? "🌌" : "🌄", blurb: "The weather inside your workspace. Each theme brings its own; change any part here." },
    { id: "layout", label: "Layout", hint: "Density and status bar", icon: LayoutPanelLeft, sticker: "📐", blurb: "How much fits on screen, and what stays in view." },
    { id: "about", label: "About", hint: "Version and what's new", icon: Info, sticker: "🌱", blurb: "Which version this is, and what changed lately." },
  ];

  // Settings opens on its selected tab, not Profile's name field, so a phone's keyboard never pops up unasked.
  return (
    <Dialog title="Settings" onClose={onClose} className="tabbed-dialog" initialFocus='[role="tab"][aria-selected="true"]'>
      <div ref={body} className="panel-host">
        <PanelTabs groups={[{ label: "You", tabs: you }, { label: "App", tabs: appTabs }]} active={tab} onSelect={(id) => setTab(id as SettingsTab)} browse={initialTab === null}
          footer={<Tip label={next ? `Next: ${next.label.toLowerCase()}` : "All done"}><button className="panel-nav-plant" onClick={() => next ? goTo(next.id) : setTab("you")}>
          <span aria-hidden="true"><Plant stage={stage} /></span>
          <span><strong>{stage.label}</strong><small>{done} of {steps.length} done</small></span>
                    </button></Tip>}>
          {(tab === "appearance" || tab === "canvas" || tab === "layout") && app[tab]}
          {tab === "about" && <AboutSection />}
          {tab === "you" && <>
            <div className="profile-hero" data-bloom={done === steps.length || undefined}>
              <Tip label="Upload a photo"><button className="profile-portrait" aria-label="Upload a photo" onClick={photos.open}>
                <img src={picture} alt="" />
                <span className="profile-portrait-camera" aria-hidden="true"><Camera size={18} /></span>
                <span key={stage.label} className="profile-plant" aria-hidden="true"><Plant stage={stage} /></span>
              </button></Tip>
              {/* Your name is the heading itself: type over it. Its tooltip shows the greeting Today makes with it. */}
              <div className="profile-hero-copy" id="profile-name">
                <div className="profile-name-row">
                  <span className="profile-name-field">
                    <Tip label={`Today greets you with “${greeting}${name.trim() ? `, ${name.trim()}` : ""}”`}>
                      <input value={name} maxLength={60} autoComplete="given-name" placeholder="Your first name" aria-label="Your name"
                        spellCheck={false} onChange={(event) => onChange({ profileName: event.target.value })} />
                    </Tip>
                    <PenLine size={16} aria-hidden="true" />
                  </span>
                  {suggested && <button className="capture-start" onClick={() => onChange({ profileName: suggested })}>Use “{suggested}”</button>}
                </div>
                <p>{stage.label}, {done} of {steps.length} done.{next ? <> Next: <button className="profile-next" onClick={() => goTo(next.id)}>{next.label.toLowerCase()}</button></> : " Nothing left to do."}</p>
              </div>
              <ol className="profile-vine" style={{ "--grown": (done - 1) / (steps.length - 1), "--steps": steps.length } as CSSProperties} aria-label={`${done} of ${steps.length} steps done`}>
                {steps.map((step) => (
                  <li key={step.id} data-done={step.done || undefined}>
                    <button className="profile-leaf" disabled={step.id === "made"} onClick={() => goTo(step.id)}
                      aria-label={`${step.label}: ${step.done ? "done" : "to do"}`}>
                      {step.done && <Check size={12} strokeWidth={3} />}
                    </button>
                    <span>{step.label}</span>
                  </li>
                ))}
              </ol>
            </div>

            <section className="settings-group" id="profile-picture">
              <h4>Your picture</h4>
              <div className="settings-card">
                <PictureChoices name={name} you={{ picture, photo, hue, portrait }} faces={faces} offered={portraits} labels
                  onFaces={setFaces} onUpload={photos.open} onChange={onChange} />
              </div>
              {photos.field}
              <p className="settings-note">{pictureNote(photo, faces)}</p>
              {photos.error && <p className="field-error" role="alert">{photos.error}</p>}
            </section>

            <AboutLine bio={bio} onBio={(profileBio) => onChange({ profileBio })} />
            <SetupAgain onSetup={onSetup} />
          </>}

          {tab === "account" && user !== undefined && <AccountSection user={user} onExport={backups.onExport} />}

          {/* A device-local model (the dev ChatGPT bridge) needs no account; the stored providers do. */}
          {tab === "model" && user !== undefined && (user || localModel ? <><OwnModelSection signedIn={!!user} localModel={localModel} />{spend}</> : (
            <div className="settings-empty">
              <span aria-hidden="true">🔌</span>
              <p>Sign in first: your model's key is stored with your account, so it needs one to live in.</p>
              <button className="primary-button" onClick={() => setTab("account")}><LogIn size={16} />Go to Account</button>
            </div>
          ))}

          {tab === "connections" && user !== undefined && connections(!!user, () => setTab("account"))}
          {tab === "agents" && everyAgent(auth ? () => setTab("model") : undefined)}
          {tab === "people" && people}
          {tab === "backups" && <BackupsSection backups={backups} />}
        </PanelTabs>
      </div>
    </Dialog>
  );
}

/**
 * A live miniature of the workspace for the App tabs. It is a real `.workbench` with a `.sidebar` and a chat panel
 * ending in a real `.chat-strip`, drawn at twice its size and scaled down, so the canvas pattern, daypart wash, sidebar
 * surface, chat rail, theme and density render exactly as they do behind the dialog, including while a choice is only
 * hovered (Skin preview).
 */
export function LookPreview({ status }: { status: boolean }) {
  return (
    <figure className="look-preview">
      <div className="look-preview-frame" aria-hidden="true">
        <div className="workbench look-preview-shell">
          <div className="sidebar look-preview-sidebar"><b /><i /><i /><i /><i /></div>
          <div className="look-preview-main"><b /><span /><span /><span /></div>
          <div className="look-preview-chat"><div className="chat-strip"><i className="strip-avatar"><b /></i><i className="strip-avatar" aria-current="true"><b /></i><i className="strip-avatar"><b /></i></div></div>
          {status && <div className="look-preview-status"><i /><i /></div>}
        </div>
      </div>
      <figcaption>{tryOn ? "Your workspace, live. Hover any choice above to try it on." : "Your workspace, live, as you pick above."}</figcaption>
    </figure>
  );
}
