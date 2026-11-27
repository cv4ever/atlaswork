// One domain page, three sections: what's growing (under the domain agent's project ideas), every next step, and
// everything kept. Its masthead is the project masthead's band (docs/page-design.md): the emoji on a tile, the name
// with its edit pencil and the actions (Customize, the domain agent's face to chat); under them, the intention with
// the sections as tabs on its right.
import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ChevronDown, ChevronRight, CircleCheck, LayoutGrid, Link2, MessageCircle, Plus, Search, SlidersHorizontal } from "lucide-react";
import { agentById, nearestThread, stewardOf } from "./agents.ts";
import { useApp, useView } from "./appContext.ts";
import { BriefBubble, BriefNote } from "./BriefView.tsx";
import { isSpeaking } from "./brief.ts";
import { AvatarStack } from "./AvatarStack.tsx";
import { atlasId } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { plantStages } from "./look.ts";
import { shownBlocks } from "./blocks.ts";
import type { Note } from "./model.ts";
import PageGrid from "./PageGrid.tsx";
import { TaskRows } from "./pageGrid/TaskRows.tsx";
import Plant from "./Plant.tsx";
import { domainKey, homeKey, placeName, tabKey } from "./place.ts";
import { ResourceGrid } from "./Resources.tsx";
import { ideasFor } from "./starterProjects.ts";
import type { ShownDomain } from "./view.ts";
import * as workspace from "./workspace.ts";
import { PageBand } from "./PageBand.tsx";
import { countUsage } from "./usage.ts";
import { Tip } from "./Popups.tsx";
import { Emblem } from "./Emblem.tsx";

/**
 * What the domain's agent suggests starting here (agents-design D62): two or three ideas (`ideasFor`), each opening the
 * project dialog filled in from it, then More ideas, which opens that agent's chat with the request written so a live
 * suggestion comes from the agent itself, and a card for a project of your own. Once the domain has two projects the
 * row folds to its heading, which unfolds it. While that agent speaks in the brief just above, the heading leaves its
 * face out (one face per agent).
 */
function ProjectIdeas({ area, speaker, projects }: { area: string; speaker?: string; projects: number }) {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const agent = stewardOf(data, area) ?? agentById(data, atlasId)!;
  const ideas = ideasFor(data, area);
  const foldable = projects >= 2;
  const [open, setOpen] = useState(!foldable);
  const ask = () => {
    void actions.updateSession({ chatDraft: `Suggest one project for ${area} that fits what I keep here: what done looks like, by when, and the first steps.` });
    actions.chatWith(nearestThread(data, area));
  };
  const shown = open || !foldable;
  return (
    <section className="project-ideas" aria-labelledby="project-ideas-title">
      <header>
        {agent.id !== speaker && <img src={portraitSrc(agent)} alt="" />}
        <h2 id="project-ideas-title">{foldable
          ? <button type="button" className="project-ideas-toggle" aria-expanded={shown} aria-controls="project-idea-list" onClick={() => setOpen(!shown)}>
            Ideas from {agent.name}<span className="crew-count">{ideas.length}</span><ChevronDown size={14} aria-hidden="true" /></button>
          : `Ideas from ${agent.name}`}</h2>
      </header>
      {shown && <div className="project-idea-list" id="project-idea-list">
        {ideas.map((idea, index) => (
          <Tip key={idea.title} label={idea.tip}><button type="button" className="project-idea" style={{ "--hue": `var(--${idea.color === "pine" ? "accent" : idea.color})`, "--i": index } as CSSProperties}
          onClick={() => actions.newProject(area, idea)}>
          <span className="project-idea-plant" aria-hidden="true"><Plant stage={plantStages[0]} /></span>
          <strong>{idea.title}</strong>
          <small>{idea.line}</small>
                    </button></Tip>
        ))}
        <button type="button" className="project-idea project-idea-new project-idea-more" style={{ "--i": ideas.length } as CSSProperties} onClick={ask}>
          <span className="project-idea-plant" aria-hidden="true"><MessageCircle size={16} /></span>
          <strong>More ideas</strong>
          <small>Ask {agent.name} for one that fits what you keep here.</small>
        </button>
        <button type="button" className="project-idea project-idea-new" style={{ "--i": ideas.length + 1 } as CSSProperties} onClick={() => actions.newProject(area)}>
          <span className="project-idea-plant" aria-hidden="true"><Plus size={18} /></span>
          <strong>New project</strong>
          <small>Name your own. The rest comes filled in.</small>
        </button>
      </div>}
    </section>
  );
}

export default function DomainPage({ domain: areaDomain }: { domain: ShownDomain }) {
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const section = useView((view) => view.session.section);
  const filters = useView((view) => view.session.filters);
  const selected = useView((view) => view.session.domain);
  const live = useView((view) => view.visible);
  const brief = useView((view) => view.domainBrief);
  const briefState = useView((view) => view.briefState);
  const inPanel = useView((view) => view.inPanel);
  const blocks = useView((view) => view.screen.page.blocks);
  // Phones: a sideways swipe on the heading moves to the next or previous domain, in the header seeds' order (D59).
  // Only the heading takes it, so wide widgets keep their own sideways scroll.
  const domains = useView((view) => view.domains);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const area = areaDomain.name;
  const here = new Set(live.domainProjects.map((project) => project.id));
  const linkedIn = data.notes.filter((note) => !note.archived && note.domain !== selected && note.linkedProjectIds?.some((id) => here.has(id)));
  const kept = [...live.domainNotes, ...linkedIn];
  const words = (filters[section] || "").toLocaleLowerCase();
  const setWords = (value: string) => actions.updateSession({ filters: { ...filters, [section]: value } });
  const hushed = !!brief && inPanel.has(brief.agent.id);
  const state = briefState(domainKey(area));
  /** A linked resource's badge: its home, and whether that home is archived. */
  const homeLabel = (note: Note) => `${placeName(data, homeKey(note))}${workspace.homeArchived(data, note) ? " (archived)" : ""}`;
  const sections = [
    { id: "overview", label: "Overview", Icon: LayoutGrid, count: undefined },
    { id: "tasks", label: "Tasks", Icon: CircleCheck, count: live.domainTasks.filter((task) => !task.done).length },
    { id: "resources", label: "Resources", Icon: Link2, count: kept.length },
  ] as const;
  const keeper = stewardOf(data, area);
  const talker = keeper ?? agentById(data, atlasId)!;
  const speaking = !!brief && isSpeaking(brief, state, hushed);
  return (
    <div className="collection-page">
      {/* The page band: the emoji, the name with its pencil and the actions; under the name, the intention with the
          sections as tabs on its right, standing on the band's edge. A sideways swipe on it changes domain. */}
      <PageBand title={area} line={areaDomain.intention || "The projects growing in this domain."} tile={<Emblem emoji={areaDomain.emoji} />} hue={areaDomain.hue}
        className="domain-masthead" edit={{ label: `Edit ${area}`, onClick: () => actions.editDomain(area) }}
        heading={{
          "data-swipe": "",
          onPointerDown: (event) => { swipe.current = event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY }; },
          onPointerCancel: () => { swipe.current = null; },
          onPointerUp: (event) => {
            const from = swipe.current;
            swipe.current = null;
            const dx = event.clientX - (from?.x ?? 0), dy = event.clientY - (from?.y ?? 0);
            if (!from || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 2 || domains.length < 2) return;
            const at = domains.findIndex((item) => item.name === area);
            countUsage("nav_swipe");
            actions.navigate(domainKey(domains[(at + (dx < 0 ? 1 : -1) + domains.length) % domains.length].name));
          },
        }}
        // The domain's agent (Atlas while it has none) is a face at the end of the actions, its words the tooltip, so it
        // keeps its place when Customize leaves with the Overview; one face per agent on the page: while it speaks in
        // the brief under the band, the face gives way to a speech mark. Who looks after it changes behind the pencil.
        actions={<>
          {brief && !speaking && (
            <BriefNote brief={brief} hushed={hushed && brief.key !== state.dismissed} onState={(next) => actions.setBriefState(domainKey(area), next)} />)}
          {section === "overview" && <Tip label="Customize this page"><button className="icon-button widgets-button" aria-label="Customize this page"
            onClick={() => actions.setUi({ modal: "widgets" })}><SlidersHorizontal size={18} /></button></Tip>}
          <Tip label={keeper ? `Chat with ${keeper.name}, who looks after ${area}` : `Chat with ${talker.name}`}>
            <button className="secondary-button crew-chat" aria-label={`Chat with ${talker.name}`} onClick={() => actions.chatWith(nearestThread(data, area))}>
              {speaking && brief?.agent.id === talker.id
                ? <span className="crew-chat-icon" aria-hidden="true"><MessageCircle size={16} /></span>
                : <AvatarStack agents={[talker]} size={26} />}
            </button>
          </Tip>
        </>}
        foot={<div className="segmented-control domain-sections masthead-tabs" role="group" aria-label={`${area} sections`}>
          {sections.map(({ id, label, Icon, count }) => (
            <button key={id} aria-pressed={section === id} onClick={() => actions.navigateTo(id)}>
              <Icon size={16} />{label}{count !== undefined && <span className="crew-count">{count}</span>}
            </button>
          ))}
        </div>} />
      {/* What the agent has to say is page content, not the header's: it opens the page, on every section. */}
      {brief && speaking && (
        <BriefBubble brief={brief} state={state} onState={(next) => actions.setBriefState(domainKey(area), next)} onAct={actions.actOnBrief} />
      )}
      {section === "tasks" ? <>
        <div className="collection-toolbar">
          <label>
            <Search size={16} />
            <input aria-label="Filter tasks" placeholder="Find a task…" value={filters.tasks || ""} onChange={(event) => setWords(event.target.value)} />
          </label>
          <button className="text-button" onClick={() => actions.newTask()}><Plus size={14} />New task</button>
        </div>
        {[{ id: "", title: `Straight in ${area}`, color: "" }, ...live.domainProjects].map((group) => {
          const tasks = live.domainTasks.filter((task) => task.projectId === group.id && task.title.toLocaleLowerCase().includes(words));
          return tasks.length ? (
            <section className="task-group" key={group.id || "domain"}>
              {group.id ? (
                <button className="task-group-title" onClick={() => actions.openTab(tabKey({ kind: "project", id: group.id }))}>
                  <span className={`project-dot ${group.color}`} />{group.title}<ChevronRight size={14} />
                </button>
              ) : <div className="task-group-title">{group.title}</div>}
              <TaskRows tasks={tasks} limit={tasks.length} />
            </section>
          ) : null;
        })}
        {!live.domainTasks.some((task) => task.title.toLocaleLowerCase().includes(words)) && (
          <div className="empty-state">
            <Search size={24} />
            <h2>{words ? "No tasks match." : `No tasks in ${area} yet.`}</h2>
            <p>{words ? "Try another word, or add a new task." : "A little space for what's next."}</p>
          </div>
        )}
      </> : section === "resources" ? <>
        <div className="collection-toolbar">
          <label>
            <Search size={16} />
            <input aria-label="Filter resources" placeholder="Look through your shelf…" value={filters.resources || ""}
              onChange={(event) => setWords(event.target.value)} />
          </label>
          <button className="text-button" onClick={() => actions.openCapture(domainKey(area))}><Plus size={14} />Capture</button>
        </div>
        <ResourceGrid key={`all:${area}`} title={`Everything in ${area}`} onOpen={actions.openResource}
          items={kept.filter((note) => `${note.title} ${note.body} ${note.url ?? ""} ${note.source ?? ""}`.toLocaleLowerCase().includes(words))}
          from={(note) => note.domain !== selected ? homeLabel(note) : undefined}
          empty={words ? "Nothing matches. Try another word." : `Nothing kept in ${area} yet. Capture a link, a file, or a thought.`} />
      </> : <>
        <ProjectIdeas key={area} area={area} projects={areaDomain.projects.length} speaker={speaking ? brief?.agent.id : undefined} />
        <PageGrid blocks={shownBlocks(blocks)} domain={areaDomain} />
      </>}
    </div>
  );
}
