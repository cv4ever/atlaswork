// The directory pages: Domains, the selected domain's Projects as garden beds, the Archive, and the Library.
import type { CSSProperties, ReactNode } from "react";
import { Archive, ArrowRight, ChevronRight, CircleCheck, FolderOpen, Link2, MessageCircle, Pencil, Plus, RotateCcw, Search, Sprout,
  Trash2, UserPlus } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { AvatarStack } from "./AvatarStack.tsx";
import { Picker, Tip } from "./Popups.tsx";
import * as crews from "./agents.ts";
import { useApp, useView } from "./appContext.ts";
import { atlasId, kindLabels, kindOf, noteTitle } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { projectInk } from "./look.ts";
import type { Task } from "./model.ts";
import { suggestedDomains } from "./onboarding.ts";
import { PageBand } from "./PageBand.tsx";
import { byPressure, paceOf } from "./pace.ts";
import Plant from "./Plant.tsx";
import { dueWords } from "./pageGrid/due.ts";
import { datesAhead, inWords, isPerson, peopleOf } from "./people.ts";
import { PersonFace } from "./PersonFace.tsx";
import { PersonPage } from "./PersonPage.tsx";
import { domainKey, homeKey, placeName, tabKey } from "./place.ts";
import { kindIcons, ResourceGrid, ResourceThumb } from "./Resources.tsx";
import { presenceLabel } from "./shell/RosterRow.tsx";
import * as workspace from "./workspace.ts";
import { Emblem } from "./Emblem.tsx";

/** Every domain as a card that answers "where do I go next?": its projects with their progress, what's late, what's next. */
export function DomainsPage() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const domains = useView((view) => view.domains);
  const tasks = useView((view) => view.visible.tasks);
  const today = useView((view) => view.today);
  const first = useView((view) => view.data.domains[0].name);
  const data = useView((view) => view.data);
  const roster = useView((view) => view.chat.roster);
  const atlas = crews.agentById(data, atlasId)!;
  const crew = data.agents.filter((agent) => !agent.archived && agent.id !== atlasId);
  const isLate = (task: Task) => !task.done && !!task.due && task.due < today;
  const open = tasks.filter((task) => !task.done);
  const late = open.filter(isLate).length;
  const projectCount = domains.reduce((sum, domain) => sum + domain.projects.length, 0);
  const names = new Set(domains.map((domain) => domain.name.toLocaleLowerCase()));
  const suggestions = suggestedDomains.filter((domain) => !names.has(domain.name.toLocaleLowerCase())).slice(0, 6);
  return (
    <div className="collection-page">
      <PageBand title="Domains"
        line={<>{plural(domains.length, "domain")} · {plural(projectCount, "project")} · {plural(open.length, "open task")}{late > 0 && <>, <span data-late>{late} late</span></>}</>}
        actions={<button className="primary-button" onClick={() => actions.newDomain()}><Plus size={16} />Plant a domain</button>} />
      <div className="domain-directory">
        {domains.map((domain) => {
          const own = tasks.filter((task) => task.domain === domain.name);
          const done = own.filter((task) => task.done).length;
          const lateHere = own.filter(isLate).length;
          const next = own.filter((task) => !task.done && task.due && task.due >= today).map((task) => task.due!).sort()[0];
          // Who answers here: the domain's steward, else Atlas (agents-design D6). Its face carries the roster's presence and unread.
          const steward = crews.stewardOf(data, domain.name);
          const who = steward ?? atlas;
          const row = roster.find((entry) => entry.agent.id === who.id);
          const status = row ? presenceLabel(row.presence) : "";
          const news = `${status ? `, ${status}` : ""}${row?.unread ? `, ${row.unread} unread` : ""}`;
          const stewardLabel = steward ? `${who.name} looks after ${domain.name}${news}. Chat with ${who.name}`
            : `Nobody looks after ${domain.name} yet, so ${who.name} answers${news}. Choose who looks after it`;
          // Most pressing first (late or behind, then no next step, then by next due day, finished last); four show.
          const rows = byPressure(domain.projects, own, today);
          const hidden = rows.length - shownProjects;
          return (
            <section className="domain-card" key={domain.name} style={{ "--hue": domain.hue } as CSSProperties}>
              <div className="domain-card-heading"><span className="domain-mark" aria-hidden="true"><Emblem emoji={domain.emoji} /></span>
                {/* The heading button stretches over the whole card; inner controls sit above it. */}
                <button className="domain-card-open" onClick={() => actions.openTab(domainKey(domain.name))}>
                  <h2>{domain.name}</h2>{domain.intention && <p>{domain.intention}</p>}
                </button>
                <Tip label={`Edit ${domain.name}`}><button className="icon-button domain-card-tend" aria-label={`Edit ${domain.name}`}
                  onClick={() => actions.editDomain(domain.name)}><Pencil size={18} /></button></Tip>
                {(() => {
                  const face = (
                    <button className="domain-steward" data-unassigned={!steward || undefined} data-domain={domain.name} aria-label={stewardLabel}
                      {...steward && { onClick: () => actions.chatWith(`agent:${who.id}`) }}>
                      <span className="domain-steward-face"><img src={portraitSrc(who)} alt="" />
                        {status && <span className="roster-presence" data-kind={row!.presence.kind} />}
                        {row && row.unread > 0 && <span className="strip-unread">{row.unread}</span>}</span>
                      <span>{who.name}</span>
                    </button>
                  );
                  if (steward) return <Tip label={stewardLabel}>{face}</Tip>;
                  // Once someone is picked the menu's button becomes the chat button, so focus goes there, not to the page.
                  const focusChat = () => requestAnimationFrame(() => document.querySelector<HTMLElement>(`.domain-steward[data-domain="${CSS.escape(domain.name)}"]`)?.focus());
                  return (
                    <Picker className="crew-picker" label={`Who looks after ${domain.name}`} tip={stewardLabel} trigger={face}>
                      {crew.map((agent) => (
                        <Menu.Item key={agent.id} onClick={() => { actions.assignDomain(domain.name, agent); focusChat(); }}>
                          <img src={portraitSrc(agent)} alt="" /><span><strong>{agent.name}</strong><small>{agent.role}</small></span>
                        </Menu.Item>
                      ))}
                      <Menu.Item className="crew-picker-new" onClick={() => actions.chatWith(`agent:${atlas.id}`)}>
                        <MessageCircle size={16} />
                        <span><strong>Chat with {atlas.name} for now</strong><small>{atlas.name} answers until someone looks after {domain.name}</small></span>
                      </Menu.Item>
                    </Picker>
                  );
                })()}
              </div>
              <div className="domain-projects">{rows.slice(0, shownProjects).map(({ project, pace, behind, finished, stalled }) => (
                <div key={project.id} className="domain-project">
                  <button onClick={() => actions.openTab(tabKey({ kind: "project", id: project.id }))}>
                    <span className="domain-project-plant" title={pace.stage.label} aria-hidden="true"><Plant stage={pace.stage} /></span>
                    <span>{project.title}</span>
                    <small data-late={behind > 0 || pace.behind || stalled || undefined}>
                      {behind ? `${behind} late` : pace.behind ? "Behind" : stalled ? "No next step" : finished ? "Done" : `${pace.done} of ${pace.total} done`}</small>
                    <ChevronRight size={16} />
                  </button>
                  {stalled && <Tip label="Add a step"><button className="icon-button domain-project-step" aria-label={`Add a step to ${project.title}`} onClick={() => actions.newTask(project.id)}><Plus size={14} /></button></Tip>}
                </div>
              ))}
              {hidden > 0 && <button className="domain-projects-more" onClick={() => actions.openTab(domainKey(domain.name))}>
                {hidden} more in {domain.name}<ArrowRight size={14} /></button>}
              {!domain.projects.length && (
                <button className="domain-first-project" onClick={() => actions.newProject(domain.name)}>
                  <Plus size={16} /><span>Start a first project</span></button>
              )}</div>
              <footer className="domain-card-foot">
                <span className="progress-track" role="img" aria-label={`${done} of ${own.length} tasks done`}>
                  <span style={{ transform: `scaleX(${own.length ? done / own.length : 0})` }} /></span>
                <span>{own.length ? `${done} of ${plural(own.length, "task")} done` : "No tasks yet"}
                  {lateHere > 0 ? <> · <span data-late>{lateHere} late</span></> : next ? ` · next due ${dueWords(next, today)}` : ""}</span>
              </footer>
            </section>
          );
        })}
        <section className="domain-card domain-card-new">
          <div className="domain-card-heading"><span className="domain-mark" aria-hidden="true"><Plus size={24} /></span>
            <button className="domain-card-open" onClick={() => actions.newDomain()}>
              <h2>Plant a domain</h2><p>{suggestions.length ? "Pick a common one, or name your own." : "Name another part of your life."}</p>
            </button>
          </div>
          {suggestions.length > 0 && <div className="domain-suggestions">
            {suggestions.map((domain) => (
              <Tip key={domain.name} label={domain.intention}><button style={{ "--hue": domain.hue } as CSSProperties}
                onClick={() => actions.newDomain(domain)}><span aria-hidden="true"><Emblem emoji={domain.emoji} /></span>{domain.name}</button></Tip>
            ))}
          </div>}
        </section>
      </div>
      <aside className="world-guide"><Sprout size={32} strokeWidth={1.2} /><div><h2>A domain is a garden. A project is something you grow.</h2><p>Tasks and resources live in a domain, or in one of its projects. Resources can also live in a Library topic, outside every domain. Anything without a home starts in {first}.</p></div></aside>
    </div>
  );
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
/** Project rows a domain card lists before "N more". */
const shownProjects = 4;

/** The selected domain's projects as garden beds; each plant grows with its share of finished tasks. */
export function ProjectsPage() {
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const domains = useView((view) => view.domains);
  const selected = useView((view) => view.session.domain);
  const active = useView((view) => view.session.active);
  const filters = useView((view) => view.session.filters);
  const domainProjects = useView((view) => view.visible.domainProjects);
  const domainTasks = useView((view) => view.visible.domainTasks);
  const today = useView((view) => view.today);
  const filter = filters[active] || "";
  const home = domains.find((domain) => domain.name === selected);
  const matches = domainProjects.filter((project) =>
    `${project.title} ${project.description}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  return (
    <div className="collection-page projects-page" style={{ "--hue": home?.hue } as CSSProperties}>
      <PageBand title="Projects" line={`What's growing in ${selected}. Each one blooms as its tasks get done.`} hue={home?.hue}
        actions={<button className="primary-button" onClick={() => actions.newProject()}><Plus size={16} />New project</button>} />
      {domainProjects.length > 0 && <div className="collection-toolbar">
        <label>
          <Search size={16} />
          <input aria-label="Filter projects" placeholder="Find a project…" value={filter}
            onChange={(event) => actions.updateSession({ filters: { ...filters, [active]: event.target.value } })} />
        </label>
        <span>{matches.length} {matches.length === 1 ? "project" : "projects"}</span>
      </div>}
      <div className="project-beds">
        {matches.map((project, index) => {
          const { done, total, stage } = paceOf(project, domainTasks.filter((task) => task.projectId === project.id), today);
          const resources = workspace.resourcesIn(data, project.id).length;
          return (
            <button key={project.id} className="project-bed" onClick={() => actions.openTab(tabKey({ kind: "project", id: project.id }))}
              style={{ "--bed": projectInk(project), "--i": index } as CSSProperties}>
              <span className="project-bed-top">
                <span className="project-plant" aria-hidden="true"><Plant stage={stage} /></span>
                <small>{stage.label}</small>
                <AvatarStack agents={crews.crewOf(data, project)} size={24} />
              </span>
              <h2>{project.title}</h2>
              <p>{project.description || "No description yet. Room to grow."}</p>
              <span className="project-stem" role="img" aria-label={`${done} of ${total} tasks done`}>
                <span style={{ transform: `scaleX(${total ? done / total : 0})` }} />
              </span>
              <span className="project-bed-meta">
                <span><CircleCheck size={14} />{total - done} open</span>
                <span><Link2 size={14} />{resources} {resources === 1 ? "resource" : "resources"}</span>
                <ArrowRight size={16} />
              </span>
            </button>
          );
        })}
        {!filter && (
          <button className="project-bed project-bed-new" onClick={() => actions.newProject()} style={{ "--i": matches.length } as CSSProperties}>
            <span className="project-plant" aria-hidden="true"><Plus size={24} /></span>
            <h2>Plant a project</h2>
            <p>{domainProjects.length ? "Something new taking root?" : `${selected} is fallow for now. Start something here.`}</p>
          </button>
        )}
      </div>
      {filter && !matches.length && (
        <div className="empty-state"><Search size={24} /><h2>No projects match.</h2><p>Try another word.</p></div>
      )}
    </div>
  );
}

export function ArchivePage() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const rows: { key: string; icon: ReactNode; title: string; where: string; restore: () => void; remove: () => void }[] = [
    ...data.agents.filter((agent) => agent.archived).map((agent) => ({
      key: `agent:${agent.id}`, icon: <img className="archive-portrait" src={portraitSrc(agent)} alt="" />, title: agent.name,
      where: `Agent · ${agent.role || "no role"}`, restore: () => actions.setAgentArchived(agent.id, false), remove: () => actions.deleteAgent(agent.id, agent.name) })),
    ...[
      ...data.domains.filter((domain) => domain.archived).map((domain) => ({
        key: `domain:${domain.name}`, icon: <span className="archive-emoji"><Emblem emoji={domain.emoji} /></span>, title: domain.name, where: "Domain",
        target: { kind: "domain" as const, id: domain.name } })),
      ...data.projects.filter((project) => project.archived).map((project) => ({
        key: `project:${project.id}`, icon: <FolderOpen size={18} />, title: project.title, where: `Project in ${project.area}`,
        target: { kind: "project" as const, id: project.id } })),
      ...data.topics.filter((topic) => topic.archived).map((topic) => ({
        key: `topic:${topic.id}`, icon: <span className="archive-emoji"><Emblem emoji={topic.emoji} /></span>, title: topic.name, where: "Library topic",
        target: { kind: "topic" as const, id: topic.id } })),
      ...data.notes.filter((note) => note.archived).map((note) => {
        const Icon = kindIcons[kindOf(note)];
        return { key: `note:${note.id}`, icon: <Icon size={18} />, title: noteTitle(note),
          where: `${kindLabels[kindOf(note)]} in ${placeName(data, homeKey(note))}`, target: { kind: "note" as const, id: note.id } };
      }),
    ].map(({ target, ...row }) => ({ ...row, restore: () => actions.setArchived(target, false), remove: () => actions.deleteForever(target, row.title) })),
  ];
  return (
    <div className="collection-page">
      <PageBand title="Archive" line="Finished, paused, or simply resting. Out of sight, never lost." />
      <div className="archive-list">
        {rows.map(({ key, icon, title, where, restore, remove }) => (
          <div key={key} className="archive-row">
            <span className="archive-icon">{icon}</span>
            <span><strong>{title}</strong><small>{where}</small></span>
            <button className="quiet-button" onClick={restore}><RotateCcw size={14} />Restore</button>
            <Tip label="Delete forever"><button className="icon-button archive-delete" aria-label={`Delete ${title} forever`}
              onClick={remove}><Trash2 size={16} /></button></Tip>
          </div>
        ))}
      </div>
      {!rows.length && <div className="empty-state"><Archive size={28} /><h2>Nothing archived.</h2><p>Archive an agent, domain, project, topic, or resource to rest it here.</p></div>}
    </div>
  );
}

/** People above topics (D71): one line each with their face, who they are and their next date. */
function PeopleShelf() {
  const { actions } = useApp();
  const topics = useView((view) => view.visible.topics);
  const today = useView((view) => view.today);
  const people = peopleOf(topics);
  return (
    <section className="library-group" aria-labelledby="library-people">
      <h2 id="library-people">People</h2>
      <ul className="topic-shelf people-shelf">
        {people.map((person, index) => {
          const next = datesAhead(person.person, today)[0];
          return (
            <li key={person.id} style={{ "--i": index } as CSSProperties}>
              <button className="topic-row" onClick={() => actions.setLibraryTopic(person.id)}>
                <PersonFace person={person} size={32} className="topic-emoji" />
                <span className="topic-words"><strong>{person.name}</strong>{person.person.relation && <small>{person.person.relation}</small>}</span>
                <span className="topic-count">{next ? `${next.date.label} ${inWords(next.days)}` : person.person.domain}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </li>
          );
        })}
        <li><button className="topic-row topic-row-new" onClick={() => actions.newPerson()}>
          <span className="topic-emoji" aria-hidden="true"><UserPlus size={18} /></span>
          <span className="topic-words"><strong>New person</strong><small>What you know about someone, and the dates that matter.</small></span>
        </button></li>
      </ul>
    </section>
  );
}

/** PARA's Resources: topics you keep material on, outside any domain, and people (D71). A topic opens in place, not as a tab. */
export function LibraryPage() {
  const { actions } = useApp();
  const shownTopic = useView((view) => view.screen.topic);
  const liveNotes = useView((view) => view.visible.notes);
  const liveTopics = useView((view) => view.visible.topics).filter((topic) => !isPerson(topic));
  if (isPerson(shownTopic)) return <PersonPage key={shownTopic.id} person={shownTopic} />;
  if (shownTopic) return (
    <div className="collection-page library-page">
      <PageBand title={shownTopic.name} tile={<Emblem emoji={shownTopic.emoji} />} crumb={{ label: "Library", onClick: () => actions.setLibraryTopic("") }}
        edit={{ label: `Edit ${shownTopic.name}`, onClick: () => actions.setUi({ topicDraft: shownTopic }) }}
        line={shownTopic.description || "Material worth keeping, whatever project it serves next."} />
      <ResourceGrid key={shownTopic.id} items={liveNotes.filter((note) => note.topicId === shownTopic.id)} title="In this topic"
        onOpen={actions.openResource} onAdd={() => actions.openCapture(homeKey({ domain: "", topicId: shownTopic.id }))} empty="Nothing kept here yet. Capture something, or move it here from a project." />
    </div>
  );
  return (
    <div className="collection-page library-page">
      <PageBand title="Library"
        line="The people in your life, and topics you keep material on outside any one project. Finished projects leave what's worth keeping here."
        actions={<button className="primary-button" onClick={actions.newTopic}><Plus size={16} />New topic</button>} />
      <PeopleShelf />
      {/* A table of contents, not a wall of cards: one line per topic, what it holds at the line's end. */}
      <section className="library-group" aria-labelledby="library-topics">
        <h2 id="library-topics">Topics</h2>
        <ul className="topic-shelf">
          {liveTopics.map((topic, index) => {
            const kept = liveNotes.filter((note) => note.topicId === topic.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            return (
              <li key={topic.id} style={{ "--i": index } as CSSProperties}>
                <button className="topic-row" onClick={() => actions.setLibraryTopic(topic.id)}>
                  <span className="topic-emoji" aria-hidden="true"><Emblem emoji={topic.emoji} /></span>
                  <span className="topic-words"><strong>{topic.name}</strong>{topic.description && <small>{topic.description}</small>}</span>
                  <span className="topic-thumbs" aria-hidden="true">{kept.slice(0, 3).map((note) => <ResourceThumb key={note.id} note={note} />)}</span>
                  <span className="topic-count">{kept.length ? `${kept.length} ${kept.length === 1 ? "resource" : "resources"}` : "Empty"}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
          <li><button className="topic-row topic-row-new" onClick={actions.newTopic}>
            <span className="topic-emoji" aria-hidden="true"><Plus size={18} /></span>
            <span className="topic-words"><strong>New topic</strong><small>A subject you keep coming back to.</small></span>
          </button></li>
        </ul>
      </section>
    </div>
  );
}
