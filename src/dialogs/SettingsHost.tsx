// Settings as a popup: the dialog (SettingsDialog.tsx, loaded when first opened) with the pages App owns, Appearance,
// Canvas and Layout, whose hover previews paint the real workspace (Crew style redraws its faces) and restore it when
// the preview ends.
import { lazy, useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useApp, useUi, useView } from "../appContext.ts";
import { AvatarStack } from "../AvatarStack.tsx";
import { crewStylePreview } from "../crewStyle.ts";
import type { CrewStyle } from "../look.ts";
import { crewStyles } from "../look.ts";
import { atlasId } from "../model.ts";
import type { WorkspaceData } from "../model.ts";
import { skin } from "../skin.ts";
import type { Look } from "../skin.ts";
import { editedAgo } from "../StatusBar.tsx";
import warmEditorial from "../WarmEditorial.module.css";
import { EmblemsSection } from "../settings/EmblemsSection.tsx";
import { themes, themeSettings, backgrounds, sidebars, rails } from "./themes.ts";

// Opened by few sessions, so loaded when first opened rather than at startup.
const SettingsDialog = lazy(() => import("../SettingsDialog.tsx"));
const LookPreview = lazy(() => import("../SettingsDialog.tsx").then((module) => ({ default: module.LookPreview })));
const AgentSpend = lazy(() => import("../AgentSpend.tsx").then((module) => ({ default: module.AgentSpend })));
const EveryAgentSection = lazy(() => import("../EveryAgentSettings.tsx").then((module) => ({ default: module.EveryAgentSection })));
const ContactsSection = lazy(() => import("../settings/ContactsSection.tsx").then((module) => ({ default: module.ContactsSection })));
const ConnectionsSection = lazy(() => import("../settings/ConnectionsSection.tsx").then((module) => ({ default: module.ConnectionsSection })));

/** The page's scrolling element: Settings previews keep its scroll, and the skin restores it when a preview ends. */
const workspacePage = () => document.getElementById("workspace-content");

/** Appearance's Crew style (agents-design D16): each style drawn with your own Atlas and first two agents, tried on while pointed at. */
function CrewStyles({ data, chosen, onPick }: { data: WorkspaceData; chosen: CrewStyle; onPick: (style: CrewStyle) => void }) {
  const faces = [...data.agents.filter((agent) => agent.id === atlasId), ...data.agents.filter((agent) => agent.id !== atlasId && !agent.archived)].slice(0, 3);
  return (
    <section className="settings-group" aria-labelledby="settings-crew-style">
      <h4 id="settings-crew-style">Crew style</h4>
      <div className="theme-cards" role="group" aria-labelledby="settings-crew-style">
        {crewStyles.map((style) => (
          <button key={style.id} type="button" className="theme-card" aria-pressed={chosen === style.id}
            onPointerEnter={() => crewStylePreview.set(style.id)} onPointerLeave={() => crewStylePreview.set(null)}
            onFocus={() => crewStylePreview.set(style.id)} onBlur={() => crewStylePreview.set(null)}
            onClick={() => onPick(style.id)}>
            <span className="crew-style-faces"><AvatarStack agents={faces} size={40} drawn={style.id} /></span>
            <span><strong>{style.label}</strong><small>{style.hint}</small></span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function SettingsHost() {
  const { actions, engine, signedIn } = useApp();
  const session = useView((view) => view.session);
  const picture = useView((view) => view.profilePicture);
  const greeting = useView((view) => view.greeting);
  const daypart = useView((view) => view.daypart);
  const now = useView((view) => view.now);
  const data = useView((view) => view.data);
  const tab = useUi((state) => state.settingsTab);
  const lastBackup = useUi((state) => state.lastBackup);
  const persisted = useUi((state) => state.persisted);
  // The mode painted now (light or dark): the Mode row's Auto line, and the mode every theme card is drawn in.
  const mode = useSyncExternalStore(skin.subscribe, skin.getTheme);
  const previewLook = (patch: Partial<Look> = {}) => skin.preview(patch, workspacePage());
  // Closing Settings ends any preview it left behind.
  useEffect(() => () => { skin.preview({}, workspacePage()); crewStylePreview.set(null); }, []);
  const { updateSession } = actions;
  return (
    <SettingsDialog name={session.profileName} bio={session.profileBio} picture={picture} photo={session.profilePhoto}
      hue={session.profileHue} portrait={session.profilePortrait} greeting={greeting} daypart={daypart} localModel={engine.localModel}
      spend={<AgentSpend data={data} engine={engine} now={now} />}
      everyAgent={(openModel) => <EveryAgentSection value={data.everyAgent} agents={data.agents} onChange={actions.setEveryAgent} onModel={openModel} />}
      connections={(signedIn, onAccount) => (
        <ConnectionsSection signedIn={signedIn} onAccount={onAccount} data={data} now={now} onAccess={actions.setAgentAccess} />)}
      people={<ContactsSection domains={data.domains.filter((domain) => !domain.archived)} onImport={actions.importPeople}
        onLibrary={() => { actions.closeModal(); actions.navigate("library"); }} />}
      onChange={updateSession} onClose={actions.closeModal} onSetup={actions.openOnboarding} initialTab={tab}
      backups={{ last: lastBackup && editedAgo(lastBackup, now), signedIn, persisted, onExport: actions.exportBackup, onRestore: actions.restoreBackup,
        holds: [[data.tasks.length, "task"], [data.projects.length, "project"], [data.notes.length, "resource"]] }}
      app={{
        appearance: <>
          <section className="settings-group" aria-labelledby="settings-themes">
            <h4 id="settings-themes">Theme</h4>
            <div className="theme-cards" role="group" aria-labelledby="settings-themes">
              {themes.map((theme) => (
                <button key={theme.id} type="button" className="theme-card" data-theme-id={theme.id} aria-pressed={session.palette === theme.id}
                  onPointerEnter={() => previewLook(themeSettings(theme))} onPointerLeave={() => previewLook()}
                  onFocus={() => previewLook(themeSettings(theme))} onBlur={() => previewLook()}
                  onClick={() => updateSession(themeSettings(theme))}>
                  <span className={`${warmEditorial.skin} theme-swatch`} data-palette={theme.id} data-theme={mode} data-pattern={theme.surfaces.canvas} aria-hidden="true">
                    <i /><b>Aa<em /><u /><u /></b>
                  </span>
                  <span><strong>{theme.name}</strong><small>{theme.line}</small></span>
                </button>
              ))}
            </div>
          </section>
          <EmblemsSection value={session.emblems} palette={session.palette} domains={data.domains}
            onChange={(emblems) => updateSession({ emblems })} onPreview={(emblems) => previewLook(emblems ? { emblems } : {})} />
          <CrewStyles data={data} chosen={session.crewStyle} onPick={(crewStyle) => updateSession({ crewStyle })} />
          <section className="settings-group" aria-labelledby="settings-mode">
            <h4 id="settings-mode">Light or dark</h4>
            <div className="settings-card">
              <div className="setting-row">
                <div>
                  <strong>Mode</strong>
                  <p>{session.theme === "system" ? `Following your device: ${mode} right now.` : `Always ${session.theme}, in every theme.`}</p>
                </div>
                <div className="segmented-control" role="group" aria-label="Mode">
                  {([["system", Monitor, "Auto"], ["light", Sun, "Light"], ["dark", Moon, "Dark"]] as const).map(([value, Icon, label]) => (
                    <button key={value} aria-pressed={session.theme === value} onClick={() => updateSession({ theme: value })}>
                      <Icon size={16} />{label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <LookPreview status={session.statusVisible} />
        </>,
        canvas: <><section className="settings-group" aria-labelledby="settings-surfaces">
          <h4 id="settings-surfaces">Surfaces</h4>
          <div className="settings-card">
            <div className="setting-row setting-row-stacked">
              <div><strong>Background</strong><p>The pattern behind your panels, in your theme's colours.</p></div>
              <div className="pattern-tiles" role="group" aria-label="Background">
                {backgrounds.map(([value, label]) => (
                  <button key={value} type="button" className="pattern-tile" data-pattern={value} aria-pressed={session.canvas === value}
                    onPointerEnter={() => previewLook({ canvas: value })} onPointerLeave={() => previewLook()}
                    onFocus={() => previewLook({ canvas: value })} onBlur={() => previewLook()}
                    onClick={() => updateSession({ canvas: value })}>
                    <i aria-hidden="true" data-pattern={value} />{label}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <div><strong>Sidebar</strong><p>The surface behind your navigation.</p></div>
              <div className="segmented-control" role="group" aria-label="Sidebar">
                {sidebars.map((value) => (
                  <button key={value} aria-pressed={session.sidebarStyle === value}
                    onPointerEnter={() => previewLook({ sidebarStyle: value })} onPointerLeave={() => previewLook()}
                    onFocus={() => previewLook({ sidebarStyle: value })} onBlur={() => previewLook()}
                    onClick={() => updateSession({ sidebarStyle: value })}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="setting-row">
              <div><strong>Chat rail</strong><p>The strip of faces down the chat's edge.</p></div>
              <div className="segmented-control" role="group" aria-label="Chat rail">
                {rails.map(([value, label]) => (
                  <button key={value} aria-pressed={session.railStyle === value}
                    onPointerEnter={() => previewLook({ railStyle: value })} onPointerLeave={() => previewLook()}
                    onFocus={() => previewLook({ railStyle: value })} onBlur={() => previewLook()}
                    onClick={() => updateSession({ railStyle: value })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="setting-row toggle-row">
              <div><strong>Follow time of day</strong>
                <p>A gentle shift in the canvas, once a minute. It's {daypart === "day" ? "afternoon" : daypart} now.</p></div>
              <input type="checkbox" role="switch" checked={session.followDaypart}
                onChange={(event) => updateSession({ followDaypart: event.target.checked })} />
              <span className="switch" aria-hidden="true" />
            </label>
          </div>
        </section><LookPreview status={session.statusVisible} /></>,
        layout: <><section className="settings-group" aria-labelledby="settings-layout">
          <h4 id="settings-layout">On screen</h4>
          <div className="settings-card">
            <div className="setting-row">
              <div><strong>Density</strong><p>{session.density === "compact" ? "Tighter rows, more on screen." : "Room to breathe."}</p></div>
              <div className="segmented-control" role="group" aria-label="Density">
                {(["comfortable", "compact"] as const).map((value) => (
                  <button key={value} aria-pressed={session.density === value} onClick={() => updateSession({ density: value })}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="setting-row toggle-row status-bar-setting">
              <div><strong>Status bar</strong>
                <p>Along the bottom: whether your work is saved, where you are, and progress on what's due.</p></div>
              <input type="checkbox" role="switch" checked={session.statusVisible}
                onChange={(event) => updateSession({ statusVisible: event.target.checked })} />
              <span className="switch" aria-hidden="true" />
            </label>
          </div>
        </section><LookPreview status={session.statusVisible} /></>,
      }} />
  );
}
