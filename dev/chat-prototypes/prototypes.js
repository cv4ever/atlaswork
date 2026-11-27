// Three alternative chat panels drawn from one set of demo conversations, plus the feedback form that sits under them.
// Plain DOM and template strings: each panel re-renders its own root on every change.

const I = (name, size = 16) => `<svg class="icon${size === 16 ? "" : ` s${size}`}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const face = (id, size) => `<img class="face" src="${agents[id].img}" alt="" width="${size}" height="${size}">`;
const stack = (ids, size) => `<span class="stack">${ids.map((id) => face(id, size)).join("")}</span>`;

const agents = {
  atlas: { name: "Atlas", img: "/atlas.webp", role: "Lead agent across your domains" },
  hearth: { name: "Hearth", img: "/agents/hearth.webp", role: "Home lead · ☀️ Everyday" },
  ledger: { name: "Ledger", img: "/agents/ledger.webp", role: "Money · 🪙 Finance" },
  vital: { name: "Vital", img: "/agents/vital.webp", role: "Health lead · 🌿 Health" },
  spark: { name: "Spark", img: "/agents/spark.webp", role: "Venture lead · 🧭 Career" },
  pipsmith: { name: "Pipsmith", img: "/agents/malik.webp" },
};

/** Fresh demo conversations; each panel owns a copy so you can click through one without changing the others. */
function seed() {
  return {
    atlas: {
      id: "atlas", label: "Atlas", members: ["atlas"], detail: "Lead agent", session: { n: 3, since: "16:02", pct: 2, tokens: "22k", read: "2.6k" },
      messages: [
        { id: "m1", role: "user", at: "16:02", text: "I'd like an agent for this: help me learn forex and build, test and debug Expert Advisors." },
        { id: "m2", role: "agent", by: "atlas", at: "16:03", draft: { status: "pending" }, remembered: "You build Expert Advisors for MT5",
          text: "Here's a draft: Pipsmith, who'd live in 📈 Trading under Career and check in weekly. Nothing changes until you review and save him." },
        { id: "m3", role: "agent", by: "atlas", at: "16:15", routine: "Check-in",
          text: "I suggest adding three Everyday tasks: fix the Atlaswork sidebar design error, review the Lisbon lease notes, and book blood work.",
          proposal: { status: "pending", where: "☀️ Everyday", items: ["Fix the Atlaswork sidebar design error", "Review the Lisbon lease notes", "Book blood work"] } },
      ],
    },
    hearth: {
      id: "hearth", label: "Hearth", members: ["hearth"], detail: "Home lead", unread: 1, session: { n: 1, since: "14:10", pct: 4, tokens: "8k", read: "5.1k" },
      messages: [
        { id: "e1", role: "user", at: "14:10", text: "Could you measure what fits on the desk wall?" },
        { id: "e2", role: "agent", by: "hearth", at: "14:32", text: "I checked your notes: the wall is 2.4 m, so the long desk fits with room for a plant stand." },
      ],
    },
    home: {
      id: "home", label: "Home front", members: ["hearth", "ledger"], room: true, detail: "Room · Hearth answers first", session: { n: 1, since: "15:20", pct: 5, tokens: "9k", read: "6.4k" },
      messages: [
        { id: "h1", role: "user", at: "15:20", text: "What's left for the home office corner?" },
        { id: "h2", role: "agent", by: "hearth", at: "15:21", text: "Two things: the desk and a lamp. The desk is ordered for Thursday." },
        { id: "h3", role: "agent", by: "ledger", at: "15:22", text: "The desk is paid. Home has €140 left for November." },
        { id: "h4", role: "user", at: "15:40", text: "Can we fit a desk lamp too?" },
        { id: "h5", role: "agent", by: "hearth", at: "15:41", text: "Probably. I'd like Ledger to confirm the number before I add it.",
          ask: { status: "pending", from: "hearth", to: "ledger", q: "Is there room for a €60 desk lamp in November's home budget?" } },
      ],
    },
    vital: { id: "vital", label: "Vital", members: ["vital"], detail: "Health lead", session: { n: 1, since: "08:00", pct: 1, tokens: "3k", read: "1.9k" },
      messages: [{ id: "v1", role: "agent", by: "vital", at: "08:00", routine: "Check-in", text: "Morning. Blood work is two days late; Thursday at 9:00 is free if you'd like it." }] },
    spark: { id: "spark", label: "Spark", members: ["spark"], detail: "Venture lead", session: { n: 1, since: "Yesterday", pct: 3, tokens: "5k", read: "3.0k" },
      messages: [{ id: "s1", role: "agent", by: "spark", at: "Yesterday", text: "The relaunch outline is in your Career notes whenever you want to look." }] },
  };
}
/** The strip: Atlas, then this place's agents and room. Everything else is in All chats. */
const strip = ["atlas", "hearth", "home"];
const everyone = ["atlas", "hearth", "home", "vital", "spark"];

const pendingOf = (thread) => thread.messages.filter((m) => [m.draft, m.proposal, m.ask].some((card) => card?.status === "pending"));
function statusOf(thread, typing) {
  if (typing) return { kind: "working", text: `${agents[typing].name} is replying…` };
  const waiting = pendingOf(thread);
  if (waiting.some((m) => m.ask)) return { kind: "question", text: "1 question for you" };
  if (waiting.length) return { kind: "approval", text: `${waiting.length} to review` };
  return { kind: "idle", text: thread.detail };
}
const statusHTML = (st, thread, button = true) => {
  const status = statusOf(thread, st.typing);
  const inner = `${status.kind === "approval" || status.kind === "question" ? '<span class="pip"></span>' : ""}${esc(status.text)}`;
  return button && (status.kind === "approval" || status.kind === "question")
    ? `<button class="status" data-kind="${status.kind}" data-act="needs" title="Show what waits on you">${inner}</button>`
    : `<span class="status" data-kind="${status.kind}">${inner}</span>`;
};

/* ---------- Cards ---------- */
function cardActions(message, primary, icon) {
  return `<div class="card-actions"><button class="btn primary small" data-act="resolve" data-m="${message.id}" data-to="done">${I(icon)}${primary}</button>`
    + `<button class="btn quiet" data-act="resolve" data-m="${message.id}" data-to="rejected">${message.ask ? "Decline" : "Reject"}</button></div>`;
}
function cardResult(message, done) {
  const card = message.draft ?? message.proposal ?? message.ask;
  const text = card.status === "rejected" ? (message.ask ? "Declined" : "Rejected") : done;
  return `<div class="card-result">${I(card.status === "rejected" ? "x" : "circle-check", 14)}${text}<button data-act="resolve" data-m="${message.id}" data-to="pending">Undo</button></div>`;
}
function cardHTML(p, message) {
  if (message.draft) {
    const waiting = message.draft.status === "pending";
    return `<div class="card" id="${p}-card-${message.id}">
      <div class="card-head">${I("user-plus", 14)}<span class="t">New agent</span>${waiting ? '<span class="waiting">Needs you</span>' : ""}</div>
      <div class="card-body"><div class="who"><img src="${agents.pipsmith.img}" alt=""><div><b>Pipsmith</b><small>Forex and trading-systems assistant · 📈 Trading · weekly check-in</small></div></div>
        <p class="rules">“Help Carlos learn forex and build, test and debug Expert Advisors. Explain risks and backtest limits; never promise returns.”</p></div>
      ${waiting ? cardActions(message, "Review Pipsmith", "eye") : cardResult(message, "Pipsmith joined your crew")}</div>`;
  }
  if (message.proposal) {
    const waiting = message.proposal.status === "pending";
    return `<div class="card" id="${p}-card-${message.id}">
      <div class="card-head">${I("circle-check", 14)}<span class="t">3 tasks for ${message.proposal.where}</span>${waiting ? '<span class="waiting">Needs you</span>' : ""}</div>
      <div class="card-body"><ul>${message.proposal.items.map((item) => `<li>${esc(item)}</li>`).join("")}</ul></div>
      ${waiting ? cardActions(message, "Add 3 tasks", "check") : cardResult(message, `Added to ${message.proposal.where}`)}</div>`;
  }
  if (message.ask) {
    const { from, to, q, status } = message.ask;
    const waiting = status === "pending";
    return `<div class="card" id="${p}-card-${message.id}">
      <div class="card-head">${I("messages-square", 14)}<span class="t">${agents[from].name} wants to ask ${agents[to].name}</span>${waiting ? '<span class="waiting">Needs you</span>' : ""}</div>
      <div class="card-body"><div class="ask-route">${face(from, 18)}${I("chevron-right", 12)}${face(to, 18)}<span>uses 1 of today's replies</span></div><p class="ask-q">“${esc(q)}”</p></div>
      ${waiting ? `<div class="card-actions"><button class="btn primary small" data-act="resolve" data-m="${message.id}" data-to="done">Send to ${agents[to].name}</button><button class="btn quiet" data-act="resolve" data-m="${message.id}" data-to="always" title="Let ${agents[from].name} ask ${agents[to].name} without checking">Always</button><button class="btn quiet" data-act="resolve" data-m="${message.id}" data-to="rejected">Decline</button></div>`
        : cardResult(message, `Sent to ${agents[to].name}`)}</div>`;
  }
  return "";
}
/** B keeps a one-line note in the transcript; the card itself lives in the tray. */
function refHTML(message) {
  const card = message.draft ?? message.proposal ?? message.ask;
  const label = message.draft ? "<b>Pipsmith</b>, a new agent" : message.proposal ? `<b>3 tasks</b> for ${message.proposal.where}` : `<b>A question</b> for ${agents[message.ask.to].name}`;
  const icon = message.draft ? "user-plus" : message.proposal ? "circle-check" : "messages-square";
  const done = card.status === "pending" ? "" : " done";
  const state = card.status === "pending" ? "Waiting below" : card.status === "rejected" ? "Rejected" : "Done";
  return `<button class="b-ref" data-act="tray-to" data-m="${message.id}">${I(icon, 14)}<span>${label}</span><span class="state${done}">${state}</span></button>`;
}

/* ---------- Messages ---------- */
/** `mode`: a and b name speakers only in rooms; c puts a face in the gutter in rooms; none of them repeat a 1:1 agent's name. */
function messagesHTML(p, st, thread, mode) {
  const out = ['<div class="day">Today</div>'];
  if (thread.id === "atlas") out.push(`<div class="session-break">Session 3 · since 16:02</div>`);
  thread.messages.forEach((m, index) => {
    const prev = thread.messages[index - 1];
    const sameVoice = prev && prev.role === m.role && prev.by === m.by && !m.routine;
    const named = thread.room && m.role === "agent" && !sameVoice;
    const gutter = mode === "c" && thread.room && m.role === "agent";
    const parts = [];
    if (gutter) parts.push(sameVoice ? '<span></span>' : face(m.by, 24));
    if (named) parts.push(`<div class="speaker">${mode === "c" ? "" : face(m.by, 20)}${agents[m.by].name}<time>${m.at}</time></div>`);
    if (m.routine) parts.push(`<div class="routine">${I("sunrise", 14)}${m.routine}${thread.room ? "" : ` · ${m.at}`}</div>`);
    parts.push(`<p>${esc(m.text)}</p>`);
    if (m.remembered) parts.push(`<span class="memory">${I("bookmark", 12)}${esc(m.remembered)}<button aria-label="Forget it" title="Undo: forget it">${I("rotate-ccw", 12)}</button></span>`);
    if (m.draft || m.proposal || m.ask) parts.push(mode === "b" ? refHTML(m) : cardHTML(p, m));
    parts.push(`<div class="msg-tools">${named || m.routine ? "" : `<time>${m.at}</time>`}<button class="icon-btn" aria-label="Copy message" title="Copy">${I("copy", 14)}</button></div>`);
    out.push(`<div class="msg ${m.role}${gutter ? " gutter" : ""}${sameVoice && thread.room ? " grouped" : ""}">${parts.join("")}</div>`);
  });
  if (st.typing) {
    const who = st.typing;
    const label = thread.room ? `<div class="speaker">${mode === "c" ? "" : face(who, 20)}${agents[who].name}</div>` : "";
    out.push(`<div class="msg agent${mode === "c" && thread.room ? " gutter" : ""}">${mode === "c" && thread.room ? face(who, 24) : ""}${label}<span class="typing" aria-label="${agents[who].name} is writing"><i></i><i></i><i></i></span></div>`);
  }
  return `<div class="transcript" aria-live="polite">${out.join("")}</div>`;
}

/* ---------- Composer parts ---------- */
const suggested = "ideias de coisas para fazer";
function noteChip(st) {
  return st.attached
    ? `<span class="chip attached" title="They read this note">${I("file-text", 14)}<span>${suggested}</span><button class="x" data-act="detach" aria-label="Detach note">${I("x", 12)}</button></span>`
    : `<button class="chip" data-act="attach" title="Share the note you're on">${I("paperclip", 14)}<span>${suggested}</span></button>`;
}
function toRow(st, thread) {
  if (!thread.room) return "";
  const pick = (value, inner, title, plain) => `<button class="${plain ? "plain" : ""}" data-act="to" data-v="${value}" aria-pressed="${st.to === value}" title="${title}">${inner}</button>`;
  const [first, ...rest] = thread.members;
  return `<div class="to-row" role="group" aria-label="Send to">To ${pick("first", `${face(first, 18)}${agents[first].name} first`, "Whoever answers first replies, unless you @name someone")}`
    + `${pick("all", "Everyone", "Everyone replies, in order", true)}${rest.map((id) => pick(id, `${face(id, 18)}${agents[id].name}`, `Only ${agents[id].name} replies`)).join("")}</div>`;
}
const placeholder = (st, thread) => thread.room
  ? st.to === "all" ? "Message everyone…" : st.to === "first" ? `Message the room…` : `Message ${agents[st.to].name}…`
  : `Message ${thread.label}…`;
const textarea = (st, thread) => `<textarea rows="1" data-input aria-label="${placeholder(st, thread)}" placeholder="${placeholder(st, thread)}">${esc(st.drafts[thread.id] ?? "")}</textarea>`;
const sendButton = (st, thread) => `<button class="send" data-act="send" aria-label="Send message" title="Send (Enter)" ${(st.drafts[thread.id] ?? "").trim() && !st.typing ? "" : "disabled"}>${I("arrow-up")}</button>`;
const dots = (n) => `<span class="dots" aria-hidden="true">${"<i></i>".repeat(n)}</span>`;
const bar = (pct) => `<span class="bar" aria-hidden="true"><i style="width:${Math.max(pct, 4)}%"></i></span>`;
/** Everything about the session and the model, which today is spread over the header, the context row and the composer. */
function factsHTML(thread, newSession = true) {
  const s = thread.session;
  const count = thread.messages.length;
  return `<div class="facts">
    <div class="fact"><span>Session ${s.n} today</span>${newSession ? `<button data-act="new-session">${I("square-pen", 12)} New session</button>` : ""}<small>Since ${s.since} · ${count} messages go into their next reply. History keeps earlier sessions.</small></div>
    <div class="fact"><span>Context ${s.pct}% full</span><span class="status">${s.tokens} tokens</span><small>${thread.room ? "The fullest member's" : `${thread.label}'s`} last reply read ${s.read} of 128k.</small></div>
    <div class="fact"><span>Answers through ChatGPT plan</span><a href="#" data-act="noop">Manage usage</a></div>
    <div class="fact"><span>Proactive, with undo</span><a href="#" data-act="noop">Change</a><small>Changes land right away; each one can be undone.</small></div>
  </div>`;
}
function chatsList(st, list, heading = true) {
  const row = (id) => {
    const t = st.threads[id];
    const waiting = pendingOf(t).length;
    const last = t.messages.at(-1);
    return `<button class="item" data-act="pick" data-t="${id}" aria-current="${id === st.thread}">${t.room ? stack(t.members, 26) : face(t.members[0], 30)}
      <span class="txt"><strong>${t.label}</strong><small>${last.role === "user" ? "You" : agents[last.by].name}: ${esc(last.text)}</small></span>
      ${waiting ? `<span class="badge" title="${waiting} waiting on you">${waiting}</span>` : t.unread ? '<span class="dot" title="Unread"></span>' : ""}</button>`;
  };
  const needs = list.filter((id) => pendingOf(st.threads[id]).length);
  const rest = list.filter((id) => !needs.includes(id));
  return `${heading && needs.length ? `<h4>Waiting on you</h4>${needs.map(row).join("")}<h4>Conversations</h4>` : ""}${(heading ? rest : list).map(row).join("")}`;
}

/* ---------- A: one header line ---------- */
function renderA(st) {
  const thread = st.threads[st.thread];
  const others = strip.filter((id) => id !== st.thread).slice(0, 3);
  const status = statusOf(thread, st.typing);
  const head = `<header class="a-head">
    <div class="a-who"><span class="face-wrap">${thread.room ? stack(thread.members, 30) : face(thread.members[0], 36)}${status.kind === "approval" || status.kind === "question" ? '<span class="presence"></span>' : ""}</span>
      <span class="name"><strong>${thread.label}</strong>${statusHTML(st, thread)}</span></div>
    <nav class="a-others" aria-label="Other conversations">${others.map((id) => {
      const t = st.threads[id];
      const waiting = pendingOf(t).length;
      return `<button class="a-other" data-act="pick" data-t="${id}" title="${t.label}${waiting ? ` · ${waiting} waiting on you` : t.unread ? " · new message" : ""}" aria-label="${t.label}">${t.room ? stack(t.members, 20) : face(t.members[0], 26)}${waiting ? `<span class="badge">${waiting}</span>` : t.unread ? '<span class="flag"></span>' : ""}</button>`;
    }).join("")}
      <button class="icon-btn" data-act="pop" data-pop="more" aria-label="More" title="All chats, start a room, open as page" aria-expanded="${st.pop === "more"}">${I("ellipsis")}</button>
      <button class="icon-btn" aria-label="Close chat" title="Close chat (Ctrl J)">${I("x")}</button></nav>
  </header>`;
  const pops = st.pop === "more" ? `<div class="pop" style="top:58px;right:10px;width:290px">${chatsList(st, everyone.filter((id) => id !== st.thread))}<hr>
      <button class="item" data-act="noop">${I("users")}<span class="txt"><strong>Start a room</strong><small>Several agents in one conversation</small></span></button>
      <button class="item" data-act="noop">${I("maximize-2")}<span class="txt"><strong>Open as a page</strong><small>Room for details and History</small></span></button></div>`
    : st.pop === "session" ? `<div class="pop" style="bottom:58px;right:12px;width:308px">${factsHTML(thread)}</div>` : "";
  const composer = `<form class="composer" data-act="submit"><div class="box">
      ${toRow(st, thread)}
      ${st.attached || st.thread === "atlas" ? `<div class="box-chips">${noteChip(st)}</div>` : ""}${textarea(st, thread)}
      <div class="box-foot">
        <button type="button" class="icon-btn" aria-label="Attach a note" title="Attach a note">${I("paperclip")}</button>
        <button type="button" class="icon-btn" aria-label="Speak" title="Speak">${I("mic")}</button>
        <span class="grow"></span>
        <button type="button" class="meter" data-act="pop" data-pop="session" aria-expanded="${st.pop === "session"}" title="Session, context and model">${dots(thread.session.n)}Session ${thread.session.n} · ${thread.session.pct}%</button>
        ${sendButton(st, thread)}
      </div></div>
    </form>`;
  return `<div class="panel a">${head}${messagesHTML("a", st, thread, "a")}${composer}${pops}</div>`;
}

/* ---------- B: switcher and tray ---------- */
function renderB(st) {
  const thread = st.threads[st.thread];
  const status = statusOf(thread, st.typing);
  const elsewhere = everyone.filter((id) => id !== st.thread).reduce((sum, id) => sum + pendingOf(st.threads[id]).length, 0);
  const head = `<header class="b-head">
    <button class="b-switch" data-act="pop" data-pop="switch" aria-expanded="${st.pop === "switch"}" aria-label="${thread.label}, switch conversation">
      <span class="face-wrap">${thread.room ? stack(thread.members, 28) : face(thread.members[0], 34)}</span>
      <span class="name"><strong>${thread.label}${I("chevron-down", 14)}${elsewhere ? `<span class="badge" title="${elsewhere} waiting in other chats">${elsewhere}</span>` : ""}</strong>${statusHTML(st, thread, false)}</span>
    </button>
    <button class="icon-btn" data-act="new-session" aria-label="New session" title="New session · Session ${thread.session.n} today, ${thread.messages.length} messages">${I("square-pen")}</button>
    <button class="icon-btn" aria-label="Open as a page" title="Open as a page">${I("maximize-2")}</button>
    <button class="icon-btn" aria-label="Close chat" title="Close chat (Ctrl J)">${I("x")}</button>
  </header>`;
  const waiting = pendingOf(thread);
  const tray = waiting.length ? `<section class="tray"${st.tray ? " data-open" : ""} aria-label="Waiting on you">
      <button class="tray-bar" data-act="tray" aria-expanded="${st.tray}"><span class="badge">${waiting.length}</span><b>Waiting on you</b><span>${waiting.map((m) => m.draft ? "Pipsmith" : m.proposal ? "3 tasks" : `question for ${agents[m.ask.to].name}`).join(" · ")}</span>${I("chevron-down", 14)}</button>
      ${st.tray ? `<div class="tray-list">${waiting.map((m) => {
        const card = cardHTML("b", m);
        return card.replace('class="card"', 'class="card tray-card"');
      }).join("")}</div>` : ""}
    </section>` : "";
  const pops = st.pop === "switch" ? `<div class="pop" style="top:62px;left:10px;width:320px">${chatsList(st, everyone)}<hr>
      <button class="item" data-act="noop">${I("users")}<span class="txt"><strong>Start a room</strong><small>Several agents in one conversation</small></span></button>
      <button class="item" data-act="noop">${I("history")}<span class="txt"><strong>All conversations</strong><small>Search and read back past chats</small></span></button></div>`
    : st.pop === "attach" ? `<div class="pop" style="bottom:58px;left:12px;width:280px">
      <button class="item" data-act="attach">${I("file-text")}<span class="txt"><strong>${suggested}</strong><small>The note you're on</small></span></button>
      <button class="item" data-act="noop">${I("search")}<span class="txt"><strong>Choose a note…</strong></span></button></div>`
    : st.pop === "session" ? `<div class="pop" style="bottom:58px;right:12px;width:308px">${factsHTML(thread, false)}</div>` : "";
  const composer = `<form class="composer" data-act="submit"><div class="box">
      ${st.attached ? `<div class="box-chips">${noteChip(st)}</div>` : ""}${toRow(st, thread)}
      ${textarea(st, thread)}
      <div class="box-foot">
        <button type="button" class="icon-btn" data-act="pop" data-pop="attach" aria-expanded="${st.pop === "attach"}" aria-label="Attach" title="Attach a note">${I("plus")}</button>
        <button type="button" class="icon-btn" aria-label="Speak" title="Speak">${I("mic")}</button>
        <span class="grow"></span>
        <button type="button" class="meter" data-act="pop" data-pop="session" aria-expanded="${st.pop === "session"}" title="Context, model and write mode">${bar(thread.session.pct)}${thread.session.pct}% context</button>
        ${sendButton(st, thread)}
      </div></div></form>`;
  return `<div class="panel b">${head}${messagesHTML("b", st, thread, "b")}${tray}${composer}${pops}</div>`;
}

/* ---------- C: crew rail ---------- */
function renderC(st) {
  const thread = st.threads[st.thread];
  const railFace = (id) => {
    const t = st.threads[id];
    const waiting = pendingOf(t).length;
    return `<button class="rail-face" data-act="pick" data-t="${id}" aria-current="${id === st.thread}" aria-label="${t.label}">
      ${t.room ? stack(t.members, 24) : `<img src="${agents[t.members[0]].img}" alt="">`}
      ${waiting ? `<span class="badge">${waiting}</span>` : t.unread ? '<span class="flag"></span>' : ""}
      <span class="rail-tip">${t.label}${waiting ? ` · ${waiting} waiting on you` : t.unread ? " · new message" : ""}</span></button>`;
  };
  const rail = `<nav class="c-rail" aria-label="Conversations">${railFace("atlas")}<hr>${strip.slice(1).map(railFace).join("")}
    <span class="grow"></span>
    <button class="icon-btn" data-act="pop" data-pop="chats" aria-expanded="${st.pop === "chats"}" aria-label="All chats" title="All chats">${I("messages-square", 18)}</button>
    <button class="icon-btn" aria-label="Start a room" title="Start a room">${I("users", 18)}</button></nav>`;
  const head = `<header class="c-head"><span class="name"><strong>${thread.label}</strong>
      <svg class="squiggle" viewBox="0 0 120 8" preserveAspectRatio="none" style="width:${Math.min(thread.label.length, 12) * 0.8}em" aria-hidden="true"><path d="M2 5 C 14 1, 22 8, 34 4 S 56 1, 68 5 S 92 8, 104 3 S 116 3, 118 4"/></svg>
      ${statusHTML(st, thread)}</span>
    <button class="icon-btn" aria-label="Open as a page" title="Open as a page">${I("maximize-2")}</button>
    <button class="icon-btn" aria-label="Close chat" title="Close chat (Ctrl J)">${I("x")}</button></header>`;
  const s = thread.session;
  const drawer = `<section class="drawer"${st.drawer ? " data-open" : ""}>
      <button class="drawer-bar" data-act="drawer" aria-expanded="${st.drawer}">${dots(s.n)}<span>Session ${s.n} · since ${s.since}</span><span class="grow"></span>${bar(s.pct)}<span>${s.pct}%</span>${I("chevron-down", 14)}</button>
      ${st.drawer ? `<div class="drawer-body">${factsHTML(thread)}${st.thread === "atlas" || st.attached ? `<div class="box-chips" style="margin:4px 0 4px">${noteChip(st)}</div>` : ""}</div>` : ""}
    </section>`;
  const composer = `<form class="composer" data-act="submit"><div class="box">
      ${st.attached && !st.drawer ? `<div class="box-chips">${noteChip(st)}</div>` : ""}${toRow(st, thread)}
      ${textarea(st, thread)}
      <div class="box-foot">
        <button type="button" class="icon-btn" aria-label="Attach a note" title="Attach a note">${I("paperclip")}</button>
        <button type="button" class="icon-btn" aria-label="Speak" title="Speak">${I("mic")}</button>
        <span class="grow"></span>${sendButton(st, thread)}
      </div></div></form>`;
  const pops = st.pop === "chats" ? `<div class="pop" style="left:60px;bottom:12px;width:290px">${chatsList(st, everyone)}<hr>
      <button class="item" data-act="noop">${I("history")}<span class="txt"><strong>All conversations</strong><small>Search and read back past chats</small></span></button></div>` : "";
  return `<div class="panel c">${rail}<div class="panel-main">${head}${messagesHTML("c", st, thread, "c")}${drawer}${composer}</div>${pops}</div>`;
}

/* ---------- State and events ---------- */
const renderers = { a: renderA, b: renderB, c: renderC };
const states = {};
const fresh = () => ({ thread: "atlas", threads: seed(), pop: null, tray: false, drawer: false, attached: false, to: "first", drafts: {}, typing: null });
for (const p of Object.keys(renderers)) states[p] = fresh();

function render(p, { scroll = "keep", focus = false } = {}) {
  const root = document.querySelector(`[data-p="${p}"]`);
  const before = root.querySelector(".transcript");
  const top = before?.scrollTop ?? 0;
  root.innerHTML = renderers[p](states[p]);
  const pane = root.querySelector(".transcript");
  pane.scrollTop = scroll === "bottom" || !before ? pane.scrollHeight : top;
  const box = root.querySelector("[data-input]");
  if (box) grow(box);
  if (focus && box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
}
const grow = (box) => { box.style.height = "auto"; box.style.height = `${Math.min(box.scrollHeight, 120)}px`; };
function flash(p, id) {
  const card = document.getElementById(`${p}-card-${id}`);
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  card.removeAttribute("data-flash"); void card.offsetWidth; card.setAttribute("data-flash", "");
}
function reply(p, by, text) {
  const st = states[p];
  const threadId = st.thread;
  st.typing = by;
  render(p, { scroll: "bottom" });
  setTimeout(() => {
    st.typing = null;
    st.threads[threadId].messages.push({ id: `r${Date.now()}`, role: "agent", by, at: "16:22", text });
    render(p, { scroll: st.thread === threadId ? "bottom" : "keep" });
  }, 1400);
}

document.addEventListener("click", (event) => {
  const root = event.target.closest("[data-p]");
  const target = event.target.closest("[data-act]");
  // A click outside an open popover closes it, in every panel.
  for (const [p, st] of Object.entries(states)) {
    if (st.pop && !(root?.dataset.p === p && (event.target.closest(".pop") || target?.dataset.act === "pop"))) { st.pop = null; render(p); }
  }
  if (!root || !target) return;
  const p = root.dataset.p;
  const st = states[p];
  const thread = st.threads[st.thread];
  const act = target.dataset.act;
  if (act === "submit") return;
  event.preventDefault();
  if (act === "pop") { st.pop = st.pop === target.dataset.pop ? null : target.dataset.pop; render(p); }
  else if (act === "pick") { st.thread = target.dataset.t; st.threads[st.thread].unread = 0; st.pop = null; st.to = "first"; st.tray = false; render(p, { scroll: "bottom" }); }
  else if (act === "attach") { st.attached = true; st.pop = null; render(p, { focus: true }); }
  else if (act === "detach") { st.attached = false; render(p); }
  else if (act === "to") { st.to = target.dataset.v; render(p, { focus: true }); }
  else if (act === "tray") { st.tray = !st.tray; render(p); }
  else if (act === "drawer") { st.drawer = !st.drawer; render(p); }
  else if (act === "tray-to") { st.tray = true; render(p); flash(p, target.dataset.m); }
  else if (act === "needs") {
    const first = pendingOf(thread)[0];
    if (first) flash(p, first.id);
  }
  else if (act === "new-session") {
    thread.session = { ...thread.session, n: thread.session.n + 1, since: "16:20", pct: 0, tokens: "0", read: "0" };
    thread.messages.push({ id: `n${Date.now()}`, role: "agent", by: thread.members[0], at: "16:20", text: "New session. I'll leave the earlier messages behind; History keeps them." });
    st.pop = null; render(p, { scroll: "bottom" });
  }
  else if (act === "resolve") {
    const message = thread.messages.find((m) => m.id === target.dataset.m);
    const card = message.draft ?? message.proposal ?? message.ask;
    const was = card.status;
    card.status = target.dataset.to === "always" ? "done" : target.dataset.to;
    if (!pendingOf(thread).length) st.tray = false;
    render(p);
    if (message.ask && was === "pending" && card.status === "done") reply(p, message.ask.to, "Yes: Home has €140 left for November, so a €60 lamp leaves €80.");
  }
  else if (act === "send") send(p);
});
document.addEventListener("submit", (event) => {
  const root = event.target.closest("[data-p]");
  if (!root) return;
  event.preventDefault();
  send(root.dataset.p);
});
function send(p) {
  const st = states[p];
  const thread = st.threads[st.thread];
  const text = (st.drafts[thread.id] ?? "").trim();
  if (!text || st.typing) return;
  thread.messages.push({ id: `u${Date.now()}`, role: "user", at: "16:21", text });
  st.drafts[thread.id] = "";
  const by = thread.room && st.to !== "first" && st.to !== "all" ? st.to : thread.members[0];
  reply(p, by, `This is where ${agents[by].name}'s reply lands. The prototype has no model, so this one is canned.`);
  setTimeout(() => document.querySelector(`[data-p="${p}"] [data-input]`)?.focus());
}
document.addEventListener("input", (event) => {
  const box = event.target.closest("[data-input]");
  const root = event.target.closest("[data-p]");
  if (!box || !root) return;
  const st = states[root.dataset.p];
  st.drafts[st.thread] = box.value;
  grow(box);
  root.querySelector(".send").disabled = !box.value.trim() || !!st.typing;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") for (const [p, st] of Object.entries(states)) if (st.pop) { st.pop = null; render(p); }
  const box = event.target.closest?.("[data-input]");
  if (box && event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(event.target.closest("[data-p]").dataset.p); }
});

/* ---------- Page controls ---------- */
document.querySelectorAll("[data-theme-pick]").forEach((button) => button.addEventListener("click", () => {
  document.documentElement.dataset.theme = button.dataset.themePick;
  document.querySelectorAll("[data-theme-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
}));
document.querySelectorAll("[data-thread-pick]").forEach((button) => button.addEventListener("click", () => {
  for (const p of Object.keys(states)) { states[p].thread = button.dataset.threadPick; states[p].pop = null; states[p].to = "first"; render(p, { scroll: "bottom" }); }
  document.querySelectorAll("[data-thread-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
}));
document.querySelector("[data-reset]").addEventListener("click", () => {
  for (const p of Object.keys(states)) { states[p] = fresh(); render(p, { scroll: "bottom" }); }
  document.querySelectorAll("[data-thread-pick]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.threadPick === "atlas")));
});
for (const p of Object.keys(renderers)) render(p, { scroll: "bottom" });

/* ---------- Feedback ---------- */
// The fields sit beside each panel and join one empty <form> through their `form` attribute (panels hold forms of their own).
const form = document.getElementById("feedback");
const storeKey = "atlaswork.chat-prototypes.feedback";
const saved = JSON.parse(localStorage.getItem(storeKey) ?? "{}");
for (const [name, value] of Object.entries(saved)) {
  const field = form.elements.namedItem(name);
  if (field) field.value = value;
}
const note = document.getElementById("saved-note");
document.addEventListener("input", (event) => {
  if (event.target.form !== form) return;
  localStorage.setItem(storeKey, JSON.stringify(Object.fromEntries(new FormData(form))));
  note.textContent = "Saved in this browser";
});
function markdown() {
  const data = Object.fromEntries(new FormData(form));
  const lines = ["# Chat panel prototypes: feedback", ""];
  for (const column of document.querySelectorAll(".column[data-col]")) {
    const id = column.dataset.col;
    const verdict = data[`verdict-${id}`];
    const notes = (data[`notes-${id}`] ?? "").trim();
    if (!verdict && !notes) continue;
    lines.push(`## ${column.querySelector("h3").textContent}`);
    if (verdict) lines.push(`Verdict: ${verdict}`);
    if (notes) lines.push("", notes);
    lines.push("");
  }
  const picks = [...document.querySelectorAll(".mix tbody tr")].map((row) => [row.querySelector("th").firstChild.textContent.trim(), data[row.dataset.part]]).filter(([, pick]) => pick);
  if (picks.length) lines.push("## Mix and match", ...picks.map(([part, pick]) => `- ${part}: ${pick}`), "");
  if ((data.overall ?? "").trim()) lines.push("## Overall", "", data.overall.trim(), "");
  return lines.join("\n");
}
document.querySelector("[data-copy]").addEventListener("click", async () => {
  await navigator.clipboard.writeText(markdown());
  note.textContent = "Copied. Paste it into the chat with Forge.";
});
document.querySelector("[data-download]").addEventListener("click", () => {
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([markdown()], { type: "text/markdown" })), download: "chat-panel-feedback.md" });
  link.click();
  URL.revokeObjectURL(link.href);
});
document.querySelector("[data-clear]").addEventListener("click", () => {
  form.reset();
  localStorage.removeItem(storeKey);
  note.textContent = "Cleared";
});
