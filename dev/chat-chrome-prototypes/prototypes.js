// Chat chrome mockups: each frame is the Chats page (or the side panel) at its real size, built from the parts below.
const ic = (name, size = 16) => `<svg class="icon s${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const ATLAS = "/atlas.webp", VITAL = "/agents/vital.webp", COMPASS = "/agents/compass.webp";
const tip = (text, style) => `<span class="tip" style="${style}">${text}</span>`;

// ---------- Tab bar ----------
const tabs = ({ plus = true, plusOpen = false } = {}) => `
  <div class="tabs">
    <button class="tab">${ic("notebook-text")}Logbook</button>
    <span class="tab-sep"></span>
    <button class="tab on"><img src="${ATLAS}" alt="">Atlas<span class="pin">${ic("pin", 12)}</span><span class="x">${ic("x", 14)}</span></button>
    <button class="tab"><img src="${VITAL}" alt="">Vital<span class="badge">1</span></button>
    ${plus ? `<button class="newtab${plusOpen ? " open" : ""}" aria-label="Open a chat">${ic("plus", 18)}</button>` : ""}
  </div>`;

const barNow = `<div class="bar-actions ruled">
    <button class="ib">${ic("messages-square", 18)}</button><button class="ib">${ic("plus", 18)}</button><span class="divider"></span><button class="ib">${ic("info", 18)}</button>
  </div>`;
const barWindow = (tips = false) => `<div class="bar-actions">
    <button class="ib">${ic("panel-right", 18)}</button>
    <button class="ib">${ic("x", 18)}</button>
    ${tips ? tip("Close Chats, back to Today", "right:6px;top:42px") : ""}
  </div>`;

// ---------- Conversation header ----------
const switcher = ({ title = "Plan the Lisbon weekend", fresh = false, open = false } = {}) =>
  `<button class="switcher${open ? " open" : ""}">${ic("history")}<span class="t${fresh ? " fresh" : ""}">${title}</span><span class="chev">${ic("chevron-down", 14)}</span></button>`;
const meta = `<span class="meta">6 messages · since 18:40</span>`;

// ---------- Transcript ----------
const lisbon = `
  <div class="msg you"><p>Can you help me plan the Lisbon weekend? We leave Friday after work.</p></div>
  <div class="msg"><p>Gladly. Your flight lands at 21:30 on Friday, so I'd keep that evening to dinner near the hotel in Chiado. Saturday has the most room: the tile museum in the morning, Belém in the afternoon. Sunday you fly at 18:10, which leaves a slow morning in Alfama.</p></div>
  <div class="msg you"><p>Put the bookings on my tasks</p></div>
  <div class="card"><div class="head"><span class="dot"></span>2 tasks to add</div>
    <div class="row">${ic("list-checks", 14)}Book dinner in Chiado for Friday 22:00</div>
    <div class="row">${ic("list-checks", 14)}Buy Belém tower tickets for Saturday</div>
    <div class="btns"><button class="btn primary">Apply</button><button class="btn reject">Reject</button></div></div>`;
const prevLine = `<div class="prev"><button>${ic("chevron-up", 14)}Previous: <b>Sort my inbox notes</b> · 09:12</button></div>`;

// ---------- Message box ----------
const modelLine = (extra = "") => `<div class="mline">Atlas on <button>GPT-6.2 Sol ${ic("chevron-down", 12)}</button>·<button>Default</button>${extra}</div>`;
const tools = ({ clipOpen = false, pip = false, ghost = false } = {}) => `<div class="tools">
    <button class="tool${clipOpen ? " open" : ""}">${ic("paperclip")}${pip ? `<span class="pip"></span>` : ""}</button>
    <button class="tool">${ic("mic")}</button>
    ${ghost ? `<button class="ghost">${ic("plus", 12)}<span>braindump of things to do in atlaswork</span></button>` : ""}
    <span class="meter"><i></i><b>0%</b> context</span>
    <button class="tool">${ic("hourglass")}</button><span class="send">${ic("arrow-up", 18)}</span></div>`;
const box = (opts = {}) => `<div class="box">${opts.old ? modelLine() + `<div class="suggest-old">${ic("plus", 12)}Attach “braindump of things to do in atlaswork”</div>` : modelLine(opts.lineExtra)}
    <div class="text">Message Atlas…</div>${tools(opts)}${opts.saved ? `<span class="saved">26px back</span>` : ""}</div>`;
const composer = (opts = {}) => `<div class="composer col">${box(opts)}</div>`;

// ---------- Frames ----------
const frame = ({ bar, head, body, comp = composer(), over = "", side = "", left = "", cls = "" }) => `
  <div class="app ${cls}">
    <div class="topbar">${bar}</div>
    <div class="body">${left}<div class="conv"><div class="chead col">${head}</div><div class="transcript col">${body}</div>${comp}</div>${side}${over}</div>
  </div>`;
const legend = (rows) => `<ul class="legend">${rows.map(([key, text]) => `<li><span class="key">${key}</span><span>${text}</span></li>`).join("")}</ul>`;
const fig = (html, caption, rows) => `<figure>${html}<figcaption>${caption}</figcaption>${rows ? legend(rows) : ""}</figure>`;
const put = (id, ...figs) => { document.getElementById(id).innerHTML = figs.join(""); };

// The picker the tab bar's + opens: any chat, or a room.
const picker = `<div class="pop" style="left:330px;top:2px;width:320px">
  <div class="search">${ic("search", 14)}Open a chat: agent, room or team</div>
  <div class="glabel"><span class="dot"></span>Waiting on you</div>
  <button class="item"><img src="${VITAL}" alt=""><span class="name"><b>Vital</b><small class="wait">1 change to review</small></span></button>
  <div class="glabel">Your crew</div>
  <button class="item hover"><img src="${COMPASS}" alt=""><span class="name"><b>Compass</b><small>Career · last wrote Mon</small></span></button>
  <button class="item"><img src="/agents/counsel.webp" alt=""><span class="name"><b>Counsel</b><small>Finance · never talked</small></span></button>
  <hr><button class="item lead">${ic("users")}Start a room with several agents</button></div>`;

// The conversation switcher: this chat's conversations only (the tab rule), what came of each, newest first.
const history = (style) => `<div class="pop" style="${style}">
  <div class="search">${ic("search", 14)}Search Atlas's conversations<kbd>12</kbd></div>
  <button class="item lead">${ic("square-pen")}New conversation<kbd>Ctrl Shift O</kbd></button>
  <hr>
  <div class="glabel"><span class="dot"></span>Waiting on you</div>
  <button class="item"><span class="name"><b>Sort my inbox notes</b><small class="wait">1 change to review</small></span><span class="when">Today 09:12<br>5 msgs</span></button>
  <div class="glabel">Recent</div>
  <button class="item on"><span class="name"><b>Plan the Lisbon weekend</b><small>Now · 2 tasks to add</small></span><span class="when">Today 18:40<br>6 msgs</span></button>
  <button class="item hover"><span class="name"><b>Weekly review</b><small>Added 3 tasks</small></span><span class="when">Yesterday<br>14 msgs</span></button>
  <button class="item"><span class="name"><b>Dentist and insurance forms</b><small>Made 1 change</small></span><span class="when">Mon 23 Nov<br>9 msgs</span></button>
  <button class="item"><span class="name"><b>What should I read next?</b><small>Talk</small></span><span class="when">Sat 21 Nov<br>8 msgs</span></button>
  <div class="pop-foot"><span>Every chat's conversations</span><a class="link">Logbook ${ic("chevron-right", 12)}</a></div></div>`;

// ---------- Before ----------
document.getElementById("now").innerHTML = fig(frame({
  bar: tabs({ plus: false }) + barNow,
  head: `${switcher({ title: "New conversation", fresh: true }).replace(ic("history"), ic("message-square-text")).replace(`<span class="chev">${ic("chevron-down", 14)}</span>`, "")}<span class="meta">Your thinking partner · last wrote 19:15</span>
    <span class="acts"><button class="ib">${ic("search")}</button><button class="ib" style="opacity:.35">${ic("square-pen")}</button><button class="ib">${ic("panel-right", 18)}</button><button class="ib">${ic("x", 18)}</button></span>`,
  body: `<div class="prev" style="outline:1px dashed var(--line-strong);border-radius:8px;justify-content:center"><button>${ic("messages-square", 14)}Earlier conversations</button></div><div style="flex:1"></div>
    <div class="msg"><p>Hi Carlos, I'm Atlas. Tell me what's on your plate this week, a few lines is plenty, and I'll sort it into tasks for you to approve.</p></div>`,
  comp: composer({ old: true }),
  cls: "short",
}), "<b>Today, redrawn.</b> Seven controls in two rows; the dashed outline marks the attach line this page removes.", [
  [ic("messages-square"), "Tab bar: All chats (open any chat)"],
  [ic("plus"), "Tab bar: start a room, though + by tabs reads as a new tab"],
  [ic("info"), "Tab bar: Details about this agent, a chat-level panel"],
  [ic("square-pen"), "Header: New conversation, greyed whenever the chat is clear"],
  [ic("panel-right"), "Header: move to side panel, a page-level action"],
  [ic("x"), "Header: close the Chats page, beside tabs that also have ×"],
]);

// ---------- H: tab bar and header ----------
put("h1",
  fig(frame({
    bar: tabs({ plusOpen: true }) + barWindow(true),
    head: `${switcher()}${meta}<span class="acts"><button class="ib">${ic("search")}</button><button class="labelled">${ic("square-pen", 14)}New</button><button class="ib">${ic("panel-right-open", 18)}</button></span>`,
    body: lisbon, over: picker,
  }), "<b>Open.</b> The tab bar holds the page: + right after the last tab opens a chat (search any agent, or start a room at its foot); at the far right, the page's own controls. The chat's row holds the chat.", [
    [ic("plus"), "Open a chat <span class='where'>· one menu for All chats and Start a room</span>"],
    [ic("panel-right"), "Move to side panel <span class='where'>· page, far right</span>"],
    [ic("x"), "Close Chats <span class='where'>· page, far right, away from the tabs</span>"],
    [ic("history"), "Conversation switcher <span class='where'>· the title is the button (see E1)</span>"],
    [ic("search"), "Find in this chat"],
    [`${ic("square-pen", 14)}`, "New conversation, worded, and hidden instead of greyed while the chat is clear"],
    [ic("panel-right-open"), "Details about Atlas <span class='where'>· moved down: it's about this chat</span>"],
  ]),
  fig(frame({
    bar: tabs() + barWindow(),
    head: `${switcher({ title: "New conversation", fresh: true })}<span class="meta">Your thinking partner · last wrote 19:15</span><span class="acts"><button class="ib">${ic("search")}</button><button class="ib" aria-pressed="true">${ic("panel-right-open", 18)}</button></span>`,
    body: `${prevLine}<div style="flex:1"></div><div class="msg"><p>Hi Carlos, what's on your plate this week? A few lines is plenty, and I'll sort it into tasks for you to approve.</p></div>`,
    side: `<aside class="rail"><h4>About Atlas <button class="ib" style="width:24px;height:24px">${ic("x", 14)}</button></h4><div class="who"><img src="${ATLAS}" alt=""><span><b>Atlas</b>Your thinking partner</span></div>
      <dl><dt>Reads</dt><dd>Everything</dd><dt>Changes</dt><dd>Asks first</dd><dt>Routines</dt><dd>Morning check-in 08:00</dd></dl></aside>`,
    comp: composer({ saved: true }),
  }), "<b>Clear chat, Details open.</b> Nothing greyed out: New is simply absent until there is a conversation to end."),
  fig(`<div class="app side"><div class="body"><div class="conv">
      <div class="chead">${switcher({ title: "Plan the Lisbon w…" })}<span class="acts"><button class="ib">${ic("square-pen")}</button><button class="ib">${ic("maximize-2")}</button><button class="ib">${ic("x", 18)}</button></span></div>
      <div class="transcript col">${lisbon}</div>${composer()}</div></div></div>`,
    "<b>The side panel follows the same rule.</b> Name above (unchanged, not drawn), then the switcher, New, Open as a page and Close. Find and Details stay on the page, as today."),
);

put("h2",
  fig(frame({
    bar: tabs(),
    head: `${switcher()}${meta}<span class="acts"><button class="ib">${ic("search")}</button><button class="ib">${ic("square-pen")}</button><span class="divider"></span><button class="ib">${ic("panel-right-open", 18)}</button><span class="divider"></span><button class="ib">${ic("panel-right", 18)}</button><button class="ib">${ic("x", 18)}</button></span>`,
    body: lisbon,
  }), "<b>One toolbar.</b> The tab bar is only tabs and +. Every action sits in one row, in three groups: this conversation (find, new), this agent (details), this page (side panel, close).", [
    [ic("plus"), "Open a chat or start a room"],
    [`${ic("search")}${ic("square-pen")}`, "This conversation"],
    [ic("panel-right-open"), "This agent's details"],
    [`${ic("panel-right")}${ic("x")}`, "This page"],
  ]),
);

const menu = `<div class="pop" style="right:28px;top:44px;width:260px">
  <button class="item">${ic("search")}Find in this chat<kbd>Ctrl F</kbd></button>
  <button class="item">${ic("history")}Conversations with Atlas<kbd>12</kbd></button>
  <button class="item hover">${ic("panel-right-open")}About Atlas</button>
  <button class="item">${ic("users")}Start a room with Atlas</button>
  <hr>
  <button class="item">${ic("panel-right")}Move to side panel</button>
  <button class="item">${ic("x")}Close Chats</button></div>`;
put("h3",
  fig(frame({
    bar: tabs(),
    head: `${switcher()}${meta}<span class="acts"><button class="labelled">${ic("square-pen", 14)}New</button><button class="ib open">${ic("ellipsis", 18)}</button></span>`,
    body: lisbon, over: menu,
  }), "<b>Words in a menu.</b> One worded button for the action you take most, everything else named in a ⋯ menu with its shortcut. Nothing to decode, one click more for Find and Details."),
);

// ---------- E: earlier conversations ----------
put("e1",
  fig(frame({
    bar: tabs() + barWindow(),
    head: `${switcher({ open: true })}${meta}<span class="acts"><button class="ib">${ic("search")}</button><button class="labelled">${ic("square-pen", 14)}New</button><button class="ib">${ic("panel-right-open", 18)}</button></span>`,
    body: lisbon, over: history("left:max(0px, calc(50% - 410px + 22px));top:44px;width:400px"),
  }), "<b>The title is the switcher.</b> A tap lists every conversation with Atlas and what came of it, newest first, with whatever waits on you on top. Search finds older ones by their words. Only Atlas's: other agents' live in the Logbook."),
  fig(frame({
    bar: tabs() + barWindow(),
    head: `${switcher({ title: "Weekly review" })}<span class="meta">Yesterday · 14 messages · added 3 tasks</span><span class="acts"><button class="ib">${ic("search")}</button><button class="ib">${ic("panel-right-open", 18)}</button></span>`,
    body: `<div class="daycap">Wednesday 25 November</div>
      <div class="msg you"><p>Let's do the weekly review.</p></div>
      <div class="msg"><p>Three things slipped this week: the insurance form, the gym booking and Ana's birthday present. I'd put the form first, it's due Friday.</p></div>
      <div class="msg you"><p>Yes, add all three for next week</p></div>
      <div class="card"><div class="head">${ic("check", 14)}Added 3 tasks</div></div>`,
    comp: `<div class="composer col"><div class="reading">${ic("history")}<span class="grow">Reading <b>Weekly review</b>, yesterday. Atlas starts each conversation fresh, so you write in the current one.</span>
      <span class="stepper"><button class="ib">${ic("chevron-left", 14)}</button><small>3 of 12</small><button class="ib">${ic("chevron-right", 14)}</button></span>
      <button class="btn quiet">Continue it</button><button class="btn primary">Back to now</button></div></div>`,
  }), "<b>Reading an older one.</b> The chat shows only that conversation. Arrows step to the one before or after, Back to now returns, and Continue it starts a new conversation that hands Atlas this one to pick up from."),
  fig(frame({
    bar: tabs() + barWindow(),
    head: `${switcher({ title: "New conversation", fresh: true })}<span class="meta">Your thinking partner · last wrote 19:15</span><span class="acts"><button class="ib">${ic("search")}</button><button class="ib">${ic("panel-right-open", 18)}</button></span>`,
    body: `${prevLine}<div style="flex:1"></div><div class="msg"><p>Hi Carlos, what's on your plate this week? A few lines is plenty, and I'll sort it into tasks for you to approve.</p></div>`,
    cls: "short",
  }), "<b>The line at the top steps back one.</b> It replaces the dashed Earlier conversations box: it names the conversation it opens, so a tap does what it says. Older ones are in the switcher."),
);

put("e2",
  fig(frame({
    bar: tabs() + barWindow(),
    head: `${switcher()}${meta}<span class="acts"><button class="ib">${ic("search")}</button><button class="labelled">${ic("square-pen", 14)}New</button><button class="ib">${ic("panel-right-open", 18)}</button></span>`,
    body: lisbon,
    left: `<aside class="hist"><div class="hist-head">With Atlas<button class="ib" style="width:24px;height:24px">${ic("chevron-left", 14)}</button></div>
      <div class="search" style="margin:0 0 4px">${ic("search", 14)}Search</div>
      <div class="glabel"><span class="dot"></span>Waiting on you</div>
      <button class="item"><span class="name"><b>Sort my inbox notes</b><small class="wait">1 change to review</small></span></button>
      <div class="glabel">Today</div>
      <button class="item on"><span class="name"><b>Plan the Lisbon weekend</b><small>2 tasks to add</small></span></button>
      <div class="glabel">This week</div>
      <button class="item"><span class="name"><b>Weekly review</b><small>Added 3 tasks</small></span></button>
      <button class="item"><span class="name"><b>Dentist and insurance forms</b><small>Made 1 change</small></span></button>
      <button class="item"><span class="name"><b>What should I read next?</b><small>Talk</small></span></button></aside>`,
  }), "<b>A history column inside the tab.</b> Always in view while open, like ChatGPT's sidebar, folding to the title's history icon. Costs 260px of the conversation's width."),
);

put("e3",
  fig(frame({
    bar: tabs() + barWindow(),
    head: `${switcher()}${meta}<span class="acts"><button class="ib">${ic("search")}</button><button class="labelled">${ic("square-pen", 14)}New</button><button class="ib">${ic("panel-right-open", 18)}</button></span>`,
    body: `<div class="fold">${ic("history")}<span class="grow"><b>What should I read next?</b><small>Sat 21 Nov · talk · 8 messages</small></span>${ic("chevron-down", 14)}</div>
      <div class="fold">${ic("history")}<span class="grow"><b>Weekly review</b><small>Yesterday · added 3 tasks · 14 messages</small></span>${ic("chevron-down", 14)}</div>
      <div class="fold">${ic("history")}<span class="grow"><b>Sort my inbox notes</b><small class="wait">Today 09:12 · 1 change to review</small></span>${ic("chevron-down", 14)}</div>
      <div class="prev"><span>Now</span></div>
      <div class="msg you"><p>Can you help me plan the Lisbon weekend? We leave Friday after work.</p></div>
      <div class="msg"><p>Gladly. Your flight lands at 21:30 on Friday, so I'd keep that evening to dinner near the hotel in Chiado.</p></div>`,
    comp: composer(),
  }), "<b>Folded in the transcript.</b> Earlier conversations sit above the current one as one-line folds; scrolling up loads older folds, and a tap opens one in place. No popover, but long chats grow a tall stack."),
);

// ---------- A: the note offer ----------
const clipMenu = `<div class="pop" style="left:max(16px, calc(50% - 410px + 20px));bottom:62px;width:330px">
  <div class="glabel">The note you're on</div>
  <button class="item hover">${ic("file-text")}<span class="name"><b>braindump of things to do in atlaswork</b><small>Everyday · edited 19:02</small></span></button>
  <div class="glabel">Recent</div>
  <button class="item">${ic("file-text")}<span class="name"><b>Lisbon packing list</b><small>Everyday · yesterday</small></span></button>
  <button class="item">${ic("file-text")}<span class="name"><b>Insurance claim notes</b><small>Finance · Mon</small></span></button>
  <hr><button class="item">${ic("search")}Find a note…</button></div>`;
const composerFrame = (opts, over = "") => `<div class="app short"><div class="body"><div class="conv"><div class="transcript col">${lisbon.split('<div class="card">')[0]}</div>${composer(opts)}</div>${over}</div></div>`;
put("a1",
  fig(composerFrame({ pip: true, clipOpen: true, saved: true }, clipMenu),
    "<b>The paperclip offers it.</b> The line goes; a small violet dot on the paperclip says a note is on offer, and the menu lists the note you're on first, then recent notes. One click more than today, 26px back in every chat."),
);
put("a2",
  fig(composerFrame({ ghost: true, saved: true }),
    "<b>A ghost chip in the tool row.</b> The offer moves into the row that already has room, dashed until you tap it, then it becomes the filled chip. Stays one tap, costs no height; long titles cut off."),
);
put("a3",
  fig(composerFrame({ saved: true, lineExtra: `<span class="spacer"></span><button>${ic("plus", 12)}braindump of things…</button>` }),
    "<b>At the end of the model line.</b> The line that names the model also offers the note at its far end. One tap, no height, but it reads as part of the model setting."),
);
