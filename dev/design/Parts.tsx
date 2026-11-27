// The shared parts in their real classes: each state a control can be in (drawn from the app's own :hover, :focus-visible
// and :active rules, force.ts), the parts at rest, what the app says when there is nothing or something failed, and
// every dialog behind a button.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Archive, Check, Circle, CircleCheck, LayoutGrid, NotebookText, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useApp, useView } from "../../src/appContext.ts";
import Dialog from "../../src/Dialog.tsx";
import { plantStages, portraitSrc } from "../../src/look.ts";
import { widgetKinds } from "../../src/blocks.ts";
import type { Block } from "../../src/blocks.ts";
import Plant from "../../src/Plant.tsx";
import { ViewMenu } from "../../src/dataBlocks/parts.tsx";
import { lateByDomain } from "../../src/workspace.ts";
import { Part, Section, Segments } from "./frame.tsx";

/** The pseudo-class behind each column, as force.ts names it in `data-force`. */
const forces = { hover: "hover", focus: "focus-visible", pressed: "active" } as const;
type Force = keyof typeof forces;
/** One control across its states: `draw` gets the forced state; `only` leaves out columns that mean nothing for it. */
type StateRow = { name: string; draw: (force?: string) => ReactNode; only?: Force[]; disabled?: ReactNode; other?: [string, ReactNode] };

/** A domain chip as the shell draws it (DomainRail.tsx): the domain's button, the edit pencil that slides out, and the
 * clay dot when the domain has late tasks. */
function DomainChip({ domain, active = false, late = 0, force }: { domain: { name: string; emoji: string; hue: string }; active?: boolean; late?: number; force?: string }) {
  const focused = force === "focus-visible";
  return (
    <div className="domain-chip" data-active={active} data-force={focused ? "focus-within" : force} style={{ "--hue": domain.hue } as CSSProperties}>
      <button aria-current={active || undefined} title={late ? `${domain.name}: ${late} late` : domain.name} data-force={focused ? force : undefined}>
        <span className="domain-chip-emoji" aria-hidden="true">{domain.emoji}</span><span>{domain.name}</span>
      </button>
      <button className="domain-chip-settings" aria-label={`Edit ${domain.name}`} title={`Edit ${domain.name}`}><Pencil size={14} /></button>
      {late > 0 && <span className="domain-chip-late" aria-hidden="true" />}
    </div>
  );
}

/** The folded top bar's domains (WorkbenchShell.tsx): flat bars at rest, standing up as chips while pointed at. */
function FoldedBar({ domains, current, late, open }: { domains: { name: string; emoji: string; hue: string }[]; current: string; late: Record<string, number>; open?: boolean }) {
  return (
    <header className="app-header" data-folded="true">
      <div className="domain-rail">
        <nav className="domain-shelf" aria-label={open ? "Domains, pointed at" : "Domains, folded"} data-force={open ? "hover" : undefined}>
          {domains.map((domain) => <DomainChip key={domain.name} domain={domain} active={domain.name === current} late={late[domain.name]} />)}
        </nav>
      </div>
    </header>
  );
}

function StateTable({ rows }: { rows: StateRow[] }) {
  return (
    <div className="ds-states-scroll">
      <table className="ds-states-table">
        <thead><tr><th scope="col">Part</th><th scope="col">Rest</th><th scope="col">Hover</th><th scope="col">Focus</th><th scope="col">Pressed</th><th scope="col">Disabled</th><th scope="col">Also</th></tr></thead>
        <tbody>
          {rows.map(({ name, draw, only, disabled, other }) => (
            <tr key={name}><th scope="row">{name}</th><td>{draw()}</td>
              {(Object.keys(forces) as Force[]).map((force) => <td key={force}>{(!only || only.includes(force)) && draw(forces[force])}</td>)}
              <td>{disabled}</td><td>{other && <>{other[1]}<small>{other[0]}</small></>}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Parts() {
  const agents = useView((view) => view.data.agents);
  const domains = useView((view) => view.domains);
  const current = useView((view) => view.session.domain);
  const dueTasks = useView((view) => view.visible.dueTasks);
  const today = useView((view) => view.today);
  const late = lateByDomain(dueTasks, today);
  const [chip, setChip] = useState("all");
  const [mode, setMode] = useState("asks");
  const [dialog, setDialog] = useState(false);
  const sample: Block = { id: "showcase-menu", type: "countdown", view: "pace" };
  const [view, setView] = useState("pace");
  const here = domains.find((domain) => domain.name === current) ?? domains[0];
  const button = (className: string, label: string) => ({
    draw: (force?: string) => <button className={className} data-force={force}>{label}</button>,
    disabled: <button className={className} disabled>{label}</button>,
  });
  const rows: StateRow[] = [
    { name: "Primary button", ...button("primary-button", "Apply") },
    { name: "Secondary button", ...button("secondary-button", "Not now") },
    { name: "Quiet button", ...button("quiet-button", "Move to today") },
    { name: "Text button", ...button("text-button", "Show all") },
    { name: "Danger button", ...button("primary-button danger-button", "Delete for good") },
    { name: "Icon button", draw: (force) => <button className="icon-button" data-force={force} title="Search" aria-label="Search"><Search size={16} /></button>,
      disabled: <button className="icon-button" disabled title="Search" aria-label="Search"><Search size={16} /></button>,
      other: ["selected", <button key="on" className="icon-button" aria-pressed="true" title="Search" aria-label="Search"><Search size={16} /></button>] },
    { name: "Filter chip", only: ["hover", "focus"], draw: (force) => <div className="kind-chips"><button aria-pressed="false" data-force={force}>Notes<span>5</span></button></div>,
      other: ["selected", <div key="on" className="kind-chips"><button aria-pressed="true">Notes<span>5</span></button></div>] },
    { name: "Field", only: ["hover", "focus"], draw: (force) => <input aria-label="Title" defaultValue="Cooking rhythm" data-force={force} />,
      disabled: <input aria-label="Title" defaultValue="Cooking rhythm" disabled /> },
    { name: "Switch", only: ["focus"], draw: (force) => <label className="switch-row"><input type="checkbox" role="switch" aria-label="Off" data-force={force} /><span className="switch" aria-hidden="true" /></label>,
      disabled: <label className="switch-row"><input type="checkbox" role="switch" aria-label="Off, disabled" disabled /><span className="switch" aria-hidden="true" /></label>,
      other: ["on", <label key="on" className="switch-row"><input type="checkbox" role="switch" aria-label="On" defaultChecked /><span className="switch" aria-hidden="true" /></label>] },
    { name: "Task tick", only: ["hover", "focus"], draw: (force) => <button className="task-check" aria-pressed="false" aria-label="Complete" data-force={force}><Circle size={18} /></button>,
      other: ["done", <button key="on" className="task-check" aria-pressed="true" aria-label="Mark incomplete"><CircleCheck size={18} /></button>] },
    // On keyboard focus the ring goes round the chip's button and its settings sprig slides out, as under the pointer.
    { name: "Domain chip", only: ["hover", "focus"], draw: (force) => <DomainChip domain={here} force={force} />, other: ["active", <DomainChip key="on" domain={here} active />] },
    { name: "Nav item", only: ["hover", "focus"], draw: (force) => <button className="nav-item" data-force={force}><NotebookText size={18} /><span>Library</span></button>,
      other: ["selected", <button key="on" className="nav-item selected" aria-current="page"><NotebookText size={18} /><span>Library</span></button>] },
    { name: "Tab", only: ["hover", "focus"],
      draw: (force) => <div className="tab" data-force={force === "hover" ? force : undefined}><button role="tab" aria-selected="false" data-force={force === "hover" ? undefined : force}><NotebookText size={14} /><span>Library</span></button></div>,
      other: ["selected", <div key="on" className="tab active"><button role="tab" aria-selected="true"><NotebookText size={14} /><span>Library</span></button></div>] },
  ];
  return (
    <Section id="parts" title="Parts" lede="The shared parts in their real classes. Reuse these before adding a new one (docs/page-design.md). The table draws each state from the app's own hover, focus and press rules, so it changes when they do.">
      <StateTable rows={rows} />
      <div className="ds-parts">
        <Part title="Buttons">
          <div className="ds-row">
            <button className="primary-button">Apply</button>
            <button className="secondary-button">Not now</button>
            <button className="quiet-button">Move to today</button>
            <button className="text-button">Show all</button>
            <button className="primary-button" disabled>Saving…</button>
          </div>
          <div className="ds-row">
            {[[Search, "Search"], [Plus, "Add task"], [Pencil, "Edit domain"], [Archive, "Archive"], [Trash2, "Delete"]].map(([Icon, label]) => {
              const Glyph = Icon as typeof Search;
              return <button key={label as string} className="icon-button" title={label as string} aria-label={label as string}><Glyph size={16} /></button>;
            })}
            <button className="primary-button danger-button">Delete for good</button>
          </div>
        </Part>
        <Part title="Chips, counts and badges">
          <div className="ds-row">
            <span className="task-when" data-soon>Today</span><span className="task-when">Thursday</span><span className="task-when" data-late>2 days late</span>
            <span className="count-chip">10 open</span><span className="count-chip" data-late>1 late</span>
            <span className="atlas-count" title="The Atlas button's unread teardrop">2</span><span className="sidebar-mode-unread" title="An unread count in the sidebar">3</span>
          </div>
          <div className="kind-chips" role="group" aria-label="Show kind">
            {[["all", "All", 12], ["note", "Notes", 5], ["link", "Links", 4], ["file", "Files", 3]].map(([id, label, count]) => (
              <button key={id} aria-pressed={chip === id} onClick={() => setChip(id as string)}>{label}<span>{count}</span></button>
            ))}
          </div>
          <div className="ds-row ds-shelf">
            {domains.slice(0, 4).map((domain) => (
              <DomainChip key={domain.name} domain={domain} active={domain.name === current} late={late[domain.name]} />
            ))}
          </div>
        </Part>
        <Part title="Folded top bar" wide>
          <FoldedBar domains={domains} current={current} late={late} />
          <div className="ds-folded-open"><FoldedBar domains={domains} current={current} late={late} open /></div>
        </Part>
        <Part title="Fields">
          <label className="ds-field">Title<input defaultValue="Weeknight cooking rhythm" /></label>
          <label className="ds-field">Placeholder<input placeholder="Add something for today" /></label>
          <label className="ds-field">Domain<select defaultValue="Health">{domains.map((domain) => <option key={domain.name}>{domain.name}</option>)}</select></label>
          <label className="ds-field">Rules<textarea rows={2} defaultValue="Keep replies short. Ask before moving dates." /></label>
        </Part>
        <Part title="Choices">
          <label className="switch-row"><input type="checkbox" role="switch" defaultChecked /><span className="switch" aria-hidden="true" />
            <span><strong>Follow the time of day</strong><small>The canvas wash changes with the hour.</small></span></label>
          <label className="switch-row"><input type="checkbox" role="switch" /><span className="switch" aria-hidden="true" />
            <span><strong>Show the status bar</strong><small>Save state, breadcrumbs and progress.</small></span></label>
          <Segments label="Write mode" value={mode} options={{ asks: "Asks first", proactive: "Proactive" }} onChange={setMode} />
          <label className="ds-row"><input type="checkbox" defaultChecked />A plain checkbox</label>
        </Part>
        <Part title="Menu">
          <div className="view-menu ds-static-menu" role="menu" aria-label="View, drawn open">
            <strong>View</strong>
            {Object.entries(widgetKinds.countdown.views).map(([id, { label, hint }], index) => (
              <button key={id} type="button" role="menuitemradio" aria-checked={view === id} data-force={index === 1 ? "hover" : undefined} onClick={() => setView(id)}>
                <Check size={14} /><span><strong>{label}</strong><small>{hint}</small></span>
              </button>
            ))}
          </div>
          <div className="ds-row ds-menu"><span>The second row is under the pointer. The live one, on a widget heading:</span><ViewMenu block={{ ...sample, view }} onView={setView} /></div>
        </Part>
        <Part title="Dialog and progress">
          <button className="secondary-button" onClick={() => setDialog(true)}>Open a dialog</button>
          <div className="progress-track"><span style={{ transform: "scaleX(0.6)" }} /></div>
          {dialog && <Dialog title="A dialog" onClose={() => setDialog(false)}>
            <div className="ds-dialog"><p>Dialogs are 570px at most, 22px corners, the lift shadow over the scrim, and a Fraunces heading.</p>
              <button className="primary-button" onClick={() => setDialog(false)}>Done</button></div>
          </Dialog>}
        </Part>
        <Part title="The crew">
          <ul className="ds-presence">
            {([["replying", "--accent"], ["waits on you", "--attention"], ["could not finish", "--stuck"]] as const).map(([label, colour], index) => agents[index] && (
              <li key={label}><span className="ds-face"><img src={portraitSrc(agents[index])} alt="" /><span className="roster-presence" style={{ "--presence": `var(${colour})` } as CSSProperties} /></span>{label}</li>
            ))}
          </ul>
        </Part>
        <Part title="Growing things">
          <ul className="ds-plants">{plantStages.map((stage) => <li key={stage.label}><span><Plant stage={stage} /></span>{stage.label}</li>)}</ul>
          <ul className="ds-motifs today-page">
            {([["sprig", "the first morning", "--accent"], ["hills", "the first morning", "--accent"]] as const).map(([motif, where, tile]) => (
              <li key={motif} style={{ "--motif": `var(--motif-${motif})`, "--tile": `var(${tile})` } as CSSProperties}><i />{motif}<small>{where}</small></li>
            ))}
          </ul>
        </Part>
      </div>
    </Section>
  );
}

/** Every dialog, opened as the app opens it. Each button's `data-dialog` names its shot in the screenshot regression. */
export function Dialogs() {
  const { actions, ui } = useApp();
  const atlas = useView((view) => view.data.agents[0]);
  const domain = useView((view) => view.session.domain);
  // The Profile tab quotes the hour's greeting, so the regression leaves it out (`clock`).
  const open: [string, string, () => void, boolean?][] = [
    ["settings-profile", "Settings: Profile", () => actions.openSettings("you"), true],
    ["settings-appearance", "Settings: Appearance", () => actions.openSettings("appearance")],
    ["agent", "An agent", () => actions.editAgent(atlas)],
    ["search", "Search", () => actions.openSearch("search")],
    ["capture", "Capture", () => actions.openCapture()],
    ["task", "New task", () => actions.newTask()],
    ["project", "New project", () => actions.newProject()],
    ["domain", "Tend a domain", () => actions.editDomain(domain)],
    ["topic", "New topic", () => actions.newTopic()],
    ["team", "New team", () => actions.newTeam()],
    ["onboarding", "Onboarding", () => ui.set({ reopenOnboarding: true })],
  ];
  return (
    <Section id="dialogs" title="Dialogs" shot={false} lede="Each opens the real dialog over this page. Escape closes it; nothing you do in one reaches your workspace. Settings: Appearance holds the looks: the canvas patterns and the sidebar styles.">
      <div className="ds-row">{open.map(([id, label, run, clock]) => <button key={id} className="secondary-button" data-dialog={id} data-clock={clock || undefined} onClick={run}>{label}</button>)}</div>
    </Section>
  );
}

/** What the app says when there is nothing, when something went wrong, and when something just happened. */
export function States() {
  return (
    <Section id="states" title="States" lede="Empty, failed and just-happened, in the app's own words and classes. A failure names what happened and what to do next.">
      <div className="ds-parts ds-states">
        <Part title="Empty">
          <div className="empty-state"><LayoutGrid size={24} /><h2>A little breathing room.</h2><p>Add a widget whenever you need one.</p>
            <button className="secondary-button">Choose widgets</button></div>
          <p className="empty-inline">Nothing open. A little space for what&apos;s next.</p>
        </Part>
        <Part title="Errors">
          <label className="ds-field">Name<input defaultValue="Atlas" aria-invalid="true" /></label>
          <small className="field-error">Someone already goes by that name. Names stay unique so @mentions are clear.</small>
          <div className="storage-error" role="alert">Your latest changes may not be saved: the disk is full
            <button>Retry saving</button><button>Export a copy</button></div>
        </Part>
        <Part title="Toast">
          <div className="toast" role="status"><span>Archived. You&apos;ll find it in Archive.</span>
            <button className="icon-button" aria-label="Dismiss notification"><X size={14} /></button></div>
        </Part>
      </div>
    </Section>
  );
}
