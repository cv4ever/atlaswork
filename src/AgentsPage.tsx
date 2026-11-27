// The Agents page: Atlas, the crew grouped by where they work, the bench, community setups, and teams; on the dev
// server, a third tab with every agent's briefing side by side (dev/briefings).
import { lazy, Suspense, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowRight, Bot, MessagesSquare, Plus, ScrollText, Settings2, Sparkles, Users } from "lucide-react";
import * as crews from "./agents.ts";
import { useApp, useUi, useView } from "./appContext.ts";
import { agentFromShared } from "./community.ts";
import { atlasId } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import type { Agent } from "./model.ts";
import { PageBand } from "./PageBand.tsx";
import { tabKey } from "./place.ts";
import { Tip } from "./Popups.tsx";
import { Emblem } from "./Emblem.tsx";

// Production builds drop it: Vite makes `import.meta.env.DEV` false there (scripts/check-bundle.mjs).
const Briefings = import.meta.env.DEV ? lazy(() => import("../dev/briefings/Briefings.tsx")) : undefined;

/** Where an agent works, as chips: domains it looks after (emoji), projects it's assigned to (dot), teams it's on. */
function AssignmentChips({ agent }: { agent: Agent }) {
  const domains = useView((view) => view.domains);
  const projects = useView((view) => view.visible.projects);
  const teamList = useView((view) => view.data.teams);
  if (agent.id === atlasId) return <span className="assignment-chip everywhere"><Sparkles size={12} />Everywhere</span>;
  const stewarded = domains.filter((domain) => domain.agentId === agent.id);
  const assigned = projects.filter((project) => project.agentId === agent.id);
  const teams = teamList.filter((team) => team.memberIds.includes(agent.id));
  if (!stewarded.length && !assigned.length && !teams.length) return <span className="assignment-chip idle">Not assigned yet</span>;
  return <>
    {stewarded.map((domain) => (
      <span key={domain.name} className="assignment-chip" style={{ "--hue": domain.hue } as CSSProperties}><Emblem emoji={domain.emoji} /> {domain.name}</span>
    ))}
    {assigned.map((project) => (
      <span key={project.id} className="assignment-chip"><span className={`project-dot ${project.color}`} />{project.title}</span>
    ))}
    {teams.map((team) => (
      <span key={team.id} className="assignment-chip team"><Users size={12} />{team.name}{team.memberIds[0] === agent.id && " · lead"}</span>
    ))}
  </>;
}

/** Agents other people shared (D34): one tap adds a copy to your crew, house rules shown to review first. */
function CommunityPicks() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const community = useUi((state) => state.community);
  if (!community.length) return null;
  return <>
    <h2 className="roster-heading">Shared by the community<small>Someone else's setup, yours to adjust. Review the house rules before you add one.</small></h2>
    <div className="crew-picks community-picks">
      {community.map((item) => (
        <div key={item.id} className="crew-pick">
          <button type="button" className="crew-pick-main" onClick={() => actions.adoptShared(agentFromShared(item))}>
            <img src={portraitSrc(item)} alt="" />
            <span className="crew-pick-copy"><strong>{item.name}</strong><small>{item.role || "No role yet"}</small>
              <em>{item.write_mode === "full" ? "⚡ Proactive, with Undo" : "✋ Asks first"}</em></span>
            <span className="pick-check community-add" aria-hidden="true"><Plus size={14} strokeWidth={3} /></span>
          </button>
          <div className="crew-pick-details"><p>{item.instructions || "No house rules written."}</p></div>
        </div>
      ))}
    </div>
  </>;
}

export default function AgentsPage() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const info = useView((view) => view.about);
  const data = useView((view) => view.data);
  const domains = useView((view) => view.domains);
  const liveProjects = useView((view) => view.visible.projects);
  const entries = useView((view) => view.chat.entries);
  const profileName = useView((view) => view.session.profileName);
  const profileBio = useView((view) => view.session.profileBio);
  const now = useView((view) => view.now);
  /** Which half of the crew the Agents page shows, or on the dev server every agent's briefing. */
  const [crewTab, setCrewTab] = useState<"agents" | "teams" | "briefings">("agents");
  const writeLabel = (agent: Agent) => agent.writeMode === "full" ? "Proactive" : "Asks first";
  const atlas = data.agents.find((agent) => agent.id === atlasId)!;
  const roster = data.agents.filter((agent) => agent.id !== atlasId && !agent.archived);
  const unreadOf = (agent: Agent) => entries.get(`agent:${agent.id}`)?.unread ?? 0;
  const teamUnread = new Map(data.teams.map((team) => [team.id, entries.get(`team:${team.id}`)?.unread ?? 0]));
  // Stewards in domain order, then whoever works through projects or teams, then the bench.
  const stewards = domains.flatMap((domain) => roster.filter((agent) => agent.id === domain.agentId));
  const working = roster.filter((agent) => !stewards.includes(agent) && (liveProjects.some((project) => project.agentId === agent.id)
    || data.teams.some((team) => team.memberIds.includes(agent.id))));
  const bench = roster.filter((agent) => !stewards.includes(agent) && !working.includes(agent));
  const tabs = [
    { id: "agents", label: "Agents", count: roster.length + 1, unread: [atlas, ...roster].reduce((sum, agent) => sum + unreadOf(agent), 0) },
    { id: "teams", label: "Teams", count: data.teams.length, unread: [...teamUnread.values()].reduce((sum, count) => sum + count, 0) },
    ...Briefings ? [{ id: "briefings", label: "Briefings", count: roster.length + 1, unread: 0 }] as const : [],
  ] as const;
  const agentCard = (agent: Agent, index: number) => {
    const home = domains.find((domain) => domain.agentId === agent.id);
    const unread = unreadOf(agent);
    return (
      <section key={agent.id} className="agent-card" style={{ "--hue": home?.hue, "--i": index } as CSSProperties}>
        <button className="agent-card-open" onClick={() => actions.chatWith(`agent:${agent.id}`)} aria-label={`Chat with ${agent.name}`}>
          <span className="agent-card-portrait"><img src={portraitSrc(agent)} alt="" />{unread > 0 && <span className="strip-unread">{unread}</span>}</span>
          <h2>{agent.name}</h2>
          <p>{agent.role || "No role yet"}</p>
        </button>
        <div className="agent-card-chips"><AssignmentChips agent={agent} /></div>
        <div className="agent-card-foot">
          <span className={`write-mode ${agent.writeMode}`}>{writeLabel(agent)}</span>
          <Tip label="Configure"><button className="icon-button" aria-label={`Configure ${agent.name}`} onClick={() => actions.editAgent(agent)}><Settings2 size={16} /></button></Tip>
        </div>
      </section>
    );
  };
  const group = (title: string, hint: string, agents: Agent[], offset: number) => agents.length > 0 && <>
    <h2 className="roster-heading">{title}<small>{hint}</small></h2>
    <div className="agent-roster">{agents.map((agent, index) => agentCard(agent, offset + index))}</div>
  </>;
  return (
    <div className="collection-page agents-page">
      {/* The page band: Start a room and New agent on the right, the Agents and Teams switch as tabs on its lower edge. */}
      <PageBand title="Your crew" line="Each one sees only where you put them. Atlas sees everything."
        actions={<>
          <Tip label="Start a room with several agents"><button className="icon-button" aria-label="Start a room" onClick={() => actions.newRoom()}>
            <MessagesSquare size={18} /></button></Tip>
          <button className="primary-button" onClick={() => crewTab === "teams" ? actions.newTeam() : actions.newAgent()}>
            <Plus size={16} />{crewTab === "teams" ? "New team" : "New agent"}</button>
        </>}
        foot={<div className="segmented-control crew-switch masthead-tabs" role="group" aria-label="Show">
          {tabs.map((tab) => (
            <button key={tab.id} aria-pressed={crewTab === tab.id} onClick={() => setCrewTab(tab.id)}>
              {tab.id === "agents" ? <Bot size={16} /> : tab.id === "teams" ? <Users size={16} /> : <ScrollText size={16} />}{tab.label}
              <span className="crew-count">{tab.count}</span>
              {tab.unread > 0 && <span className="crew-unread" aria-label={`${tab.unread} unread`} />}
            </button>
          ))}
        </div>} />
      {crewTab === "briefings" && Briefings ? <Suspense key="briefings" fallback={null}>
        <Briefings data={data} person={{ name: profileName, about: profileBio }} today={new Date(now).toLocaleDateString("en-CA")} onEdit={(agent) => actions.editAgent(agent, "briefing")} />
      </Suspense> : crewTab === "agents" ? <div key="agents" className="crew-panel">
        <section className="atlas-profile">
          <div className="atlas-portrait"><img src={portraitSrc(atlas)} alt="" /><Sparkles size={18} strokeWidth={1.2} /></div>
          <div className="atlas-profile-copy">
            <div className="agent-card-title"><h2>{atlas.name}</h2><span className="simulation-badge">{info.badge}</span></div>
            <p className="agent-role">{atlas.role}</p>
            <p>Your main assistant. He answers wherever nobody else is assigned, and can join any crew.</p>
            <div className="agent-capabilities"><AssignmentChips agent={atlas} /><span className="assignment-chip">{writeLabel(atlas)}</span></div>
          </div>
          <div className="agent-actions">
            <button className="primary-button" onClick={() => actions.chatWith(`agent:${atlasId}`)}>Chat<ArrowRight size={16} />
              {unreadOf(atlas) > 0 && <span className="agent-waiting">{unreadOf(atlas)} unread</span>}</button>
            <button className="secondary-button" onClick={() => actions.editAgent(atlas)}><Settings2 size={16} />Configure</button>
          </div>
        </section>
        {group("Tending a domain", "Each looks after one part of your life.", stewards, 0)}
        {group("On projects and teams", "Brought in for specific work.", working, stewards.length)}
        <h2 className="roster-heading">On the bench<small>{bench.length ? "Ready whenever you find them something to do." : "Everyone's busy. Room for one more?"}</small></h2>
        <div className="agent-roster">
          {bench.map((agent, index) => agentCard(agent, index))}
          <button className="agent-card agent-card-new" onClick={() => actions.newAgent()} style={{ "--i": bench.length } as CSSProperties}>
            <span className="agent-card-portrait"><Plus size={24} /></span>
            <h2>New agent</h2>
            <p>Say what you need, and Atlas suggests who could help.</p>
          </button>
        </div>
        <CommunityPicks />
      </div> : <div key="teams" className="crew-panel">
        <p className="crew-hint">Reusable groups. The first member leads. Put a team on any project, or chat with it directly.</p>
        <div className="team-roster">
          {data.teams.map((team, index) => {
            const members = crews.teamMembers(data, team);
            const projects = liveProjects.filter((project) => project.teamId === team.id);
            const unread = teamUnread.get(team.id) ?? 0;
            const [lead, ...rest] = members;
            return (
              <section key={team.id} className="team-card" style={{ "--i": index } as CSSProperties}>
                <div className="team-faces">
                  {members.map((agent, position) => (
                    <Tip key={agent.id} label={`${agent.name}${position === 0 ? ", lead" : ""}`}><button className={position === 0 ? "lead" : ""} style={{ "--n": position } as CSSProperties} aria-label={`Chat with ${agent.name}`} onClick={() => actions.chatWith(`agent:${agent.id}`)}>
                    <img src={portraitSrc(agent)} alt="" />
                                        </button></Tip>
                  ))}
                  {unread > 0 && <span className="strip-unread">{unread}</span>}
                </div>
                <h3>{team.name}</h3>
                <p className="team-members">{lead ? <>Led by <strong>{lead.name}</strong>{rest.length > 0 && <>, with {rest.map((agent) => agent.name).join(", ")}</>}</> : "Nobody on it yet"}</p>
                {team.purpose && <p>{team.purpose}</p>}
                <div className="agent-card-chips">
                  {projects.length ? projects.map((project) => (
                    <button key={project.id} className="assignment-chip" onClick={() => actions.openTab(tabKey({ kind: "project", id: project.id }))}><span className={`project-dot ${project.color}`} />{project.title}</button>
                  )) : <span className="assignment-chip idle">No project yet</span>}
                </div>
                <div className="agent-card-foot">
                  <button className="text-button" onClick={() => actions.chatWith(`team:${team.id}`)} disabled={!members.length}><MessagesSquare size={14} />Team chat</button>
                  <Tip label="Edit team"><button className="icon-button" aria-label={`Edit ${team.name}`} onClick={() => actions.editTeam(team)}><Settings2 size={16} /></button></Tip>
                </div>
              </section>
            );
          })}
          <button className="team-card agent-card-new" onClick={actions.newTeam} style={{ "--i": data.teams.length } as CSSProperties}>
            <span className="agent-card-portrait"><Users size={24} /></span>
            <h3>New team</h3>
            <p>Group a few agents around a kind of work.</p>
          </button>
        </div>
      </div>}
      <section className="agent-boundaries"><h2>You keep the reins.</h2>
        <p>Every agent and routine answers through your AI model, and every change they make is a proposal you approve or undo.</p>
      </section>
    </div>
  );
}
