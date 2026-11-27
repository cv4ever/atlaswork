// The live conversation, in the side panel or as the Chats page's conversation (D27), and the Chats page around it.
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CircleCheck, NotebookText, Settings2, Trash2, Users } from "lucide-react";
import AgentPanel from "./AgentPanel.tsx";
import { modelLabel, useModelState } from "./modelMenu.ts";
import { chatModelOf, inChat, recentModels } from "./chatModel.ts";
import type { AgentTab } from "./ui.ts";
import * as crews from "./agents.ts";
import { useActivity, useApp, useUi, useView } from "./appContext.ts";
import ConversationPage from "./ConversationPage.tsx";
import type { FixedTab } from "./chatsPage/ChatTabs.tsx";
import { LogbookPage } from "./chatsPage/LogbookPage.tsx";
import { nearCap, refreshStanding, trialDaysLeft, untilReset, useStanding } from "./allowance.ts";
import { caps } from "../supabase/functions/agent/caps.ts";
import { calendarOffered } from "./connections.ts";
import { agentTools, byId, calendarAccess, canUse, kindOf } from "./model.ts";
import { finishing, sessionStartOf, sittingsOf } from "./sittings.ts";
import { isOpen, jobLine } from "./jobs.ts";
import { listComputers } from "./computers.ts";
import { searchLimits } from "../supabase/functions/agent/searches.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { dayLabel, formatDate } from "./dates.ts";
import type { ToolId } from "./model.ts";
import { homeKey, placeName, tabKey } from "./place.ts";
import { presenceLabel } from "./shell/RosterRow.tsx";
import { Tip } from "./Popups.tsx";

const clockOf = (at: string) => formatDate(new Date(at), { hour: "2-digit", minute: "2-digit" });

/** The live conversation: in the side panel, or as the Chats page's conversation (D27). */
export function ChatPanel({ where }: { where: "side" | "page" }) {
  const { actions, conversations, engine, signedIn, workbench, jobs: jobWatch } = useApp();
  const live = useView((view) => view.about);
  const page = where === "page";
  // Atlaswork's model shares one daily allowance across every agent (D48); the count is read again after each reply.
  const models = useModelState(engine);
  const hosted = signedIn && models.status === "ready" && models.provider.using === "hosted";
  const standing = useStanding(hosted);
  const { threadId, thread, current, strip, chats, welcome } = useView((view) => view.chat);
  const data = useView((view) => view.data);
  const now = useView((view) => view.now);
  const draft = useView((view) => view.session.chatDraft);
  const selected = useView((view) => view.session.domain);
  const activeNote = useView((view) => view.screen.note);
  const activeProject = useView((view) => view.screen.project);
  const lastNote = useView((view) => view.visible.lastNote);
  const noteById = useView((view) => view.noteById);
  const jump = useUi((state) => state.jump);
  const compose = useUi((state) => state.compose);
  const { thinking, errors, progress, proposalErrors, jobs } = useActivity();
  const replying = !!thinking[threadId];
  useEffect(() => { if (hosted && !replying) void refreshStanding(); }, [hosted, replying]);
  // Replies a closed page asked for, and work you handed off (D73), are still being written by the agent function, which
  // lands them in the account (D72): say so instead of offering Retry. You can write meanwhile: each message saves on
  // its own (D76). Each one's job (D76) says what it's doing; the job watch follows it and reloads what it landed.
  const onTheirWay = signedIn && !replying ? finishing(thread, now, jobs) : [];
  const onItsWay = onTheirWay.at(-1);
  const awaited = onItsWay && current.agents.find((agent) => onItsWay.awaiting?.includes(agent.id));
  const job = onItsWay && jobs.find((item) => item.messageId === onItsWay.id);
  const known = !!job;
  const ended = !!job && !isOpen(job);
  useEffect(() => {
    if (!onItsWay) return;
    void jobWatch?.refresh();
    // The workspace is read again every 8 s for a message whose job isn't known (it wasn't stored, or can't be read),
    // and at once for one whose job ended, whose answer is in the account (the job watch reloads only for an ending it
    // saw happen).
    if (known && !ended) return;
    const reload = () => void workbench.refresh();
    if (ended) reload();
    const timer = window.setInterval(reload, 8_000);
    return () => window.clearInterval(timer);
  }, [onItsWay, known, ended, workbench, jobWatch]);
  // A job on a computer (D77, D84) names it: the projects' folders name theirs, and the account's list every computer
  // and which are off (not seen in the last 30 s), read when the job moves, and every 15 s while it waits for one.
  const onComputer = job && isOpen(job) && job.runsOn.startsWith("computer:") ? `${job.runsOn} ${job.state}` : "";
  const [listed, setListed] = useState<{ names: ReadonlyMap<string, string>; off: ReadonlySet<string> }>({ names: new Map(), off: new Set() });
  useEffect(() => {
    if (!onComputer) return;
    let live = true;
    const list = () => void listComputers().then((computers) => {
      if (!live) return;
      const off = computers.filter((computer) => !computer.lastSeen || Date.now() - Date.parse(computer.lastSeen) > searchLimits.seen);
      setListed({ names: new Map(computers.map((computer) => [computer.id, computer.name])), off: new Set(off.map((computer) => computer.id)) });
    }, () => undefined);
    list();
    const timer = onComputer.endsWith(" waiting") ? window.setInterval(list, 15_000) : undefined;
    return () => { live = false; window.clearInterval(timer); };
  }, [onComputer]);
  const allowance = hosted && standing && (standing.plan === "pro" || standing.plan === "trial" && trialDaysLeft(standing.trialEndsAt, now) > 0)
    ? { used: standing.replies, cap: caps.replies, resets: untilReset(new Date(now)), near: standing.replies >= caps.replies * nearCap } : undefined;
  const sittings = sittingsOf(thread);
  const sessionStart = sessionStartOf(thread, sittings, now);
  const usage = current.agents.filter((agent) => !agent.archived)
    .map((agent) => ({ agent, use: crews.contextOf(agent, thread, sessionStart) }));
  const today = new Date(now).toDateString();
  const sessionsToday = sittings.filter((sitting) => sitting.at && new Date(sitting.at).toDateString() === today).length
    + (sessionStart >= thread.messages.length ? 1 : 0);
  // What they're doing, in words you can act on: who's replying, what waits on you, or when they last spoke.
  const lead = current.agents[0];
  const presence = lead && crews.presenceOf(data, lead, { thinking, errors, jobs });
  // When they last wrote, with the day once it isn't today: "18:42", "yesterday 18:42", "Sat, Nov 14".
  const lastDay = current.last?.at && dayLabel(current.last.at, now);
  const lastAt = current.last?.at && (lastDay === "Today" ? clockOf(current.last.at)
    : lastDay === "Yesterday" ? `yesterday ${clockOf(current.last.at)}` : lastDay);
  // The account's list wins: a folder keeps the name its computer had when it was linked.
  const computers = new Map([...data.projects.flatMap((project) => project.folder ? [[project.folder.computer.id, project.folder.computer.name] as const] : []),
    ...listed.names]);
  const status = awaited ? { kind: "working" as const, text: jobLine(job, awaited.name, !!onItsWay.background, computers, listed.off) }
    : current.kind !== "agent"
    ? { kind: thinking[threadId] ? "working" as const : "idle" as const,
      text: thinking[threadId] ? `${thinking[threadId]!.name} is replying…` : `${current.agents.length} here · ${lead?.name ?? "Nobody"} answers first` }
    : !presence ? undefined
    : presence.kind === "working" ? { kind: presence.kind, text: progress[threadId]?.length ? `${progress[threadId].at(-1)!.text}…` : "Replying…" }
    : presence.kind === "approval" ? { kind: presence.kind, text: `${presence.count} to review` }
    : presence.kind === "question" ? { kind: presence.kind, text: `Asked you: ${presence.text}` }
    : presence.kind === "stuck" ? { kind: presence.kind, text: presence.reason }
    : { kind: presence.kind, text: `${lead.role || "No role yet"}${lastAt ? ` · last wrote ${lastAt}` : ""}` };
  // The note to offer: the one you're on (beside your work), else the one you last changed; never a link, file or
  // image, and never the one already attached.
  const offered = [!page && activeNote, lastNote].find((note): note is NonNullable<typeof lastNote> =>
    !!note && kindOf(note) === "note" && note.id !== thread.attachedNoteId);
  const rail = useView((view) => view.session.chatRail);
  return (
    <AgentPanel
      engine={live}
      embedded={page}
      findable={page}
      jumpTo={page ? jump ?? undefined : undefined}
      compose={compose}
      now={now}
      usage={usage}
      sessionStart={sessionStart}
      sessionsToday={sessionsToday}
      sittings={sittings}
      status={status}
      replying={(id) => !!thinking[id]}
      suggestedNote={offered && { note: offered, on: !page && offered === activeNote }}
      details={page ? { open: rail === "details", onToggle: () => actions.updateSession({ chatRail: rail === "details" ? "" : "details" }) } : undefined}
      allowance={allowance}
      onModel={() => actions.openSettings("model")}
      onConnections={calendarOffered ? () => actions.openSettings("connections") : undefined}
      models={engine}
      recentOf={(source) => recentModels(data.threads, source)}
      onChatModel={(agentId, choice) => conversations.setChatModel(threadId, agentId, choice)
        .catch((cause: unknown) => actions.toast(cause instanceof Error ? cause.message : "That model couldn't be set."))}
      onKeepModel={(agentId) => conversations.keepChatModel(threadId, agentId)
        .then(() => actions.toast(`${byId(data.agents).get(agentId)?.name ?? "The agent"} answers on this everywhere now: every chat and routine.`),
          (cause: unknown) => actions.toast(cause instanceof Error ? cause.message : "That model couldn't be saved."))}
      onAttach={(id) => conversations.attach(threadId, id)}
      // A Logbook jump stays in the UI state, and would keep the chat New just cleared showing.
      onNewSession={() => { conversations.newSession(threadId); actions.setUi({ jump: null }); actions.toast("New conversation. Agents start fresh; the Logbook keeps the last one."); }}
      thread={thread}
      current={current}
      strip={strip}
      chats={chats}
      agents={data.agents}
      welcome={welcome}
      attached={noteById[thread.attachedNoteId ?? ""]}
      draft={draft}
      thinking={thinking[threadId] ?? null}
      awaited={awaited}
      finishing={onTheirWay.map((message) => message.id)}
      progress={progress[threadId]}
      error={errors[threadId] ?? ""}
      onDraft={(chatDraft) => actions.updateSession({ chatDraft })}
      onPick={actions.chatWith}
      onSend={(text) => conversations.send(threadId, text, activeProject?.title ?? selected)}
      onHandOff={signedIn && !live.offline ? (text) => conversations.send(threadId, text, activeProject?.title ?? selected, true) : undefined}
      onRetry={(messageId) => { void conversations.retry(threadId, messageId); }}
      onClose={page ? undefined : actions.closePanel}
      onExpand={page ? undefined : actions.expandChat}
      onChooseNote={() => actions.openSearch("context")}
      onDetach={() => conversations.attach(threadId, null)}
      onOpenNote={(id) => actions.openTab(tabKey({ kind: "resource", id }))}
      openProject={(id) => data.projects.some((project) => project.id === id && !project.archived) ? () => actions.openTab(tabKey({ kind: "project", id })) : undefined}
      onProposal={(proposal, action) => actions.handleProposal(threadId, proposal, action)}
      placeOf={(home) => placeName(data, homeKey(home))}
      onPlant={(domain) => actions.newDomain(domain)}
      planted={(name) => data.domains.some((domain) => !domain.archived && domain.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase())}
      proposalErrors={proposalErrors}
      onRequestFreshProposal={(proposal) => { void actions.requestFreshProposal(threadId, proposal.id); }}
      onAsk={(askId, action, question) => { void actions.handleAsk(threadId, askId, action, question); }}
      onUnremember={(messageId, memoryId) => actions.unremember(threadId, messageId, memoryId)}
      onLearn={(messageId, memoryId, action) => actions.learn(threadId, messageId, memoryId, action)}
      onChoose={(messageId, option) => {
        if (conversations.pick(threadId, messageId, option)) void conversations.send(threadId, option, activeProject?.title ?? selected);
      }}
      onArchiveAgent={actions.archiveQuiet}
      onNewRoom={() => actions.newRoom()}
      // This chat in the Logbook, from the switcher's foot and the side panel's rail.
      onShowAll={() => actions.showLogbook(threadId)}
    />
  );
}

/**
 * The Chats page (D27): open chats as tabs over the live conversation, and beside it who you're talking to, what needs
 * you, and the settings that shape their replies. The fixed Logbook tab (`fixed`, D19) shows under the chat tab bar
 * instead.
 */
export function ChatsPage({ fixed }: { fixed?: FixedTab }) {
  const portraitSrc = usePortraitSrc();
  const { actions, conversations, engine } = useApp();
  const models = useModelState(engine);
  const { threadId, thread, current, roster, tabs, chats, entries, sittings } = useView((view) => view.chat);
  const data = useView((view) => view.data);
  const now = useView((view) => view.now);
  const pinned = useView((view) => view.session.chatTabs.pinned);
  const rail = useView((view) => view.session.chatRail);
  const filters = useView((view) => view.session.filters);
  const logbookWho = useUi((state) => state.logbookWho);
  const logbookShow = useUi((state) => state.logbookShow);
  const logbookLimit = useUi((state) => state.logbookLimit);
  const pickChats = useUi((state) => state.pickChats);
  const needs = roster.filter((entry) => crews.needsYou(entry.presence)).map((entry) => entry.thread);
  const agent = current.kind === "agent" ? current.agents[0] : undefined;
  const presence = agent && roster.find((entry) => entry.thread === threadId)?.presence;
  const waiting = thread.messages.filter((message) => message.proposal?.status === "pending" || message.ask?.status === "pending").length;
  // Approvals in this chat get a button below; ones they posted in rooms are only named.
  const status = !presence || (presence.kind === "approval" && waiting) ? ""
    : presence.kind === "approval" ? `${presence.count} to approve in their rooms` : presenceLabel(presence);
  const scope = agent && crews.scopeOf(data, agent.id);
  // Google Calendar shows among them while the agent may use it (agents-design D83).
  const tools = agent ? [...(Object.keys(agentTools) as ToolId[]).filter((id) => canUse(agent, id)).map((id) => agentTools[id].label),
    ...calendarOffered && calendarAccess(agent).level !== "off" ? ["Google Calendar"] : []] : [];
  const routinesOn = agent?.routines?.filter((routine) => !routine.paused).length ?? 0;
  const editable = agent && !current.readOnly;
  const row = (label: string, value: ReactNode, tab?: AgentTab) => (
    <div className="conversation-fact">
      <dt>{label}</dt>
      <dd>{value}{editable && tab && <button onClick={() => actions.editAgent(agent, tab)} aria-label={`Change ${label.toLocaleLowerCase()}`}>Change</button>}</dd>
    </div>
  );
  const details = <>
    {(status || waiting > 0) && (
      <section className="conversation-needs" data-kind={presence?.kind}>
        <h2>Now</h2>
        {status && <p>{status}</p>}
        {waiting > 0 && (
          <button className="secondary-button" onClick={() => document.querySelector(".chats-page .proposal.pending")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <CircleCheck size={16} />Review {waiting} waiting on you
          </button>
        )}
      </section>
    )}
    {agent ? (
      <section>
        <h2>About {agent.name}</h2>
        <dl>
          {row("Role", agent.role || "No role yet", "profile")}
          {row("Looks after", scope?.all ? "Everything" : crews.scopeLabelOf(data, agent.id) || "Only notes you attach", "profile")}
          {row("Acts", agent.writeMode === "full" ? "Proactive, with undo" : "Asks first, you decide", "permissions")}
          {row("Model", <>{modelLabel(inChat(agent, thread), models)}{chatModelOf(thread, agent.id) && " · this chat"}{models.status === "error" && <span className="field-error" role="alert"> {models.message}{" "}
            <button type="button" className="text-button" onClick={engine.models.reload}>Retry</button></span>}</>, "profile")}
          {row("Can use", tools.join(", ") || "Nothing yet", "permissions")}
          {row("On their own", routinesOn ? `${routinesOn} ${routinesOn === 1 ? "routine" : "routines"} on` : "No routines", "schedule")}
        </dl>
      </section>
    ) : (
      <section>
        <h2>In this room</h2>
        <ul className="conversation-members">
          {current.agents.map((member, index) => (
            <li key={member.id}>
              <Tip label={`Chat with ${member.name} alone`}><button onClick={() => actions.openConversation(`agent:${member.id}`)}>
                <img src={portraitSrc(member)} alt="" />
                <span><strong>{member.name}</strong><small>{index === 0 ? "Answers first" : member.role}</small></span>
              </button></Tip>
            </li>
          ))}
        </ul>
      </section>
    )}
    <section className="conversation-actions">
      <h2>More</h2>
      {editable && <button className="quiet-button" onClick={() => actions.newRoom([agent.id])}><Users size={16} />Start a room with {agent.name}</button>}
      {!agent && !current.readOnly && <button className="quiet-button" onClick={() => actions.newRoom(current.agents.map((member) => member.id))}>
        <Users size={16} />New room with these agents</button>}
      <button className="quiet-button" onClick={() => actions.showLogbook(threadId)}>
        <NotebookText size={16} />This chat in the Logbook</button>
      {editable && <button className="quiet-button" onClick={() => actions.editAgent(agent)}><Settings2 size={16} />Configure {agent.name}</button>}
      {current.kind === "room" && <button className="quiet-button danger-text" onClick={() => actions.deleteRoom(threadId, current.label)}><Trash2 size={16} />Delete room</button>}
    </section>
  </>;
  const logbook = fixed && (
    <LogbookPage sittings={sittings} entries={entries} query={filters.logbook ?? ""} who={logbookWho} show={logbookShow} limit={logbookLimit} now={now}
      onQuery={(query) => { actions.setUi({ logbookLimit: 120 }); actions.updateSession({ filters: { ...filters, logbook: query } }); }}
      onWho={(id) => actions.setUi({ logbookLimit: 120, logbookWho: id })}
      onShow={(show) => actions.setUi({ logbookLimit: 120, logbookShow: show })}
      onJump={(id, index) => { actions.openConversation(id); actions.setUi({ jump: { threadId: id, index, nonce: Date.now() } }); }}
      onMore={() => actions.setUi({ logbookLimit: logbookLimit + 300 })} />
  );
  return (
    <ConversationPage tabs={tabs} pinned={pinned} currentId={threadId} chats={chats} railOpen={rail === "details"}
      needs={needs} pickChats={pickChats} onPickShown={() => actions.setUi({ pickChats: false })}
      panel={fixed ? null : <ChatPanel where="page" />} details={details} fixed={fixed && { tab: fixed, page: logbook }}
      onFixed={(tab) => actions.openTab(tab)}
      onOpen={actions.openConversation}
      onCloseTab={actions.closeChatTab}
      onTogglePin={conversations.togglePinChat}
      onNewRoom={() => actions.newRoom()}
      onDock={() => actions.leaveConversation(true)}
      onClose={() => actions.leaveConversation(false)}
      onRail={(open) => actions.updateSession({ chatRail: open ? "details" : "" })} />
  );
}
