// Draws every mockup frame from a few parts, so the three options share one transcript, one composer and one catalogue.
const icon = (name, size = "") => `<svg class="icon ${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const mark = (vendor, size = "") => vendor === "atlaswork"
  ? `<img class="mark ${size}" src="/icon.svg" alt="">`
  : `<svg class="mark ${size}" data-vendor="${vendor}" viewBox="0 0 24 24" aria-hidden="true"><path d="${window.MARKS[vendor]}"/></svg>`;

// Thinking as a plant: a seed for Fast, a sprout for Balanced, a full stem for Thorough; Default a dashed ring.
const glyphs = {
  default: `<circle stroke-dasharray="2.4 2.4" cx="12" cy="12" r="7"/>`,
  fast: `<path d="M12 19c-3 0-5-2.3-5-5.2S9.4 7.6 12 5.5c2.6 2.1 5 5.4 5 8.3S15 19 12 19Z"/><path d="M12 9.5v6"/>`,
  balanced: `<path d="M12 21v-8"/><path d="M12 15c-4 0-6.5-2.4-6.5-6 3.8 0 6.5 2.2 6.5 6Z"/><path d="M12 13c0-4 2.6-6.8 6.5-6.8 0 4-2.7 6.8-6.5 6.8Z"/>`,
  thorough: `<path d="M12 22V3.5"/><path d="M12 18c-3.4 0-5.6-2-5.6-5.2 3.3 0 5.6 2 5.6 5.2Z"/><path d="M12 14c0-3.3 2.2-5.6 5.6-5.6 0 3.3-2.3 5.6-5.6 5.6Z"/><path d="M12 9.5C9.5 9.5 8 8 8 5.6c2.4 0 4 1.5 4 3.9Z"/><path d="M12 21c0-2.4 1.6-4 4-4 0 2.4-1.6 4-4 4Z"/>`,
};
const glyph = (level, size = "") => `<svg class="glyph ${size}" viewBox="0 0 24 24" aria-hidden="true">${glyphs[level]}</svg>`;
const levels = [["default", "Default", "Atlas's usual: Balanced"], ["fast", "Fast", "Quick answers, cheapest"], ["balanced", "Balanced", "Most chats"], ["thorough", "Thorough", "Plans and hard questions, slower"]];

// A sample OpenRouter catalogue: short names, a plain hint and a price class from the real price per million tokens.
const models = {
  claude: [["Claude Opus 4.5", "Deepest thinker", 3, "$5 / $25"], ["Claude Sonnet 4.5", "Strong all-rounder", 2, "$3 / $15"], ["Claude Haiku 4.5", "Quick and light", 1, "$1 / $5"]],
  openai: [["GPT-5.1", "Strong all-rounder", 2, "$1.25 / $10"], ["GPT-5.1 Codex", "Code, files and tools", 2, "$1.25 / $10"], ["GPT-5 mini", "Quick and light", 1, "$0.25 / $2"]],
  gemini: [["Gemini 3 Pro", "Long documents", 2, "$2 / $12"], ["Gemini 2.5 Flash", "Fast and cheap", 1, "$0.30 / $2.50"]],
  deepseek: [["DeepSeek V3.2", "Cheapest strong model", 1, "$0.28 / $0.42"]],
  mistral: [["Mistral Medium 3.1", "European, mid-price", 1, "$0.40 / $2"]],
};
const vendorNames = { claude: "Anthropic", openai: "OpenAI", gemini: "Google", deepseek: "DeepSeek", mistral: "Mistral" };
const cost = (n) => `<span class="cost" title="Sample price per million tokens">${"$$$".split("").map((d, i) => i < n ? `<b>${d}</b>` : d).join("")}</span>`;
const row = (vendor, [name, hint, price], { on = false, hover = false, tag = "", end = "" } = {}) => `
  <button class="row${on ? " on" : ""}${hover ? " hover" : ""}" role="option" aria-selected="${on}">${mark(vendor, "s16")}
    <span class="name"><b>${name}</b><small>${hint}</small></span>${tag ? `<span class="tag">${tag}</span>` : ""}${end || cost(price)}${on ? `<span class="check">${icon("check", "s14")}</span>` : ""}
  </button>`;

const portrait = { atlas: "/atlas.webp", muse: "/agents/artist.webp", ledger: "/agents/bookkeeper.webp" };
const transcript = (extra = "") => `
  <div class="transcript">
    <div class="msg you">Help me plan this week, the dentist is on Thursday.</div>
    <div class="msg agent"><div class="meta"><img src="${portrait.atlas}" alt=""><b>Atlas</b> 14:02</div>
      <p>Thursday morning is the dentist, so I kept it light: the report draft moves to Wednesday and the gym to Friday. Three tasks are ready to review.</p></div>
    ${extra}
  </div>`;
const head = (title = "Atlas", sub = "Planning the week") => `<div class="panel-head"><h4>${title}</h4><small>${sub}</small></div>`;
const composer = ({ before = "", inBox = "", tools = "", text = "Make Friday lighter too", focus = true, after = "" } = {}) => `
  <div class="composer">${before}
    <div class="box${focus ? " focus" : ""}">${inBox}
      <div class="text${text ? "" : " empty"}">${text || "Message Atlas…"}</div>
      <div class="tools"><span class="tool">${icon("paperclip")}</span><span class="tool">${icon("mic")}</span>${tools}
        <span class="meter"><i></i>Context</span><span class="send">${icon("arrow-up", "s18")}</span></div>
      ${after}
    </div>
  </div>`;
const panel = (body) => `<div class="panel">${body}</div>`;
const tip = (text, style) => `<span class="tip" style="${style}">${text}</span>`;
const thinkTrack = (current = "balanced", { disabled = false, words = true } = {}) => `
  <div class="think" role="radiogroup" aria-label="Thinking"${disabled ? ' aria-disabled="true"' : ""}>
    ${levels.map(([id, word, hint]) => `<button role="radio" aria-checked="${!disabled && id === current}" title="${word}: ${hint}">${glyph(id)}${words ? word : ""}</button>`).join("")}
  </div>`;

// ---------- O1: one chip, one popover ----------
const o1chip = (vendor, level, { open = false, reveal = false, custom = false, label = "Sonnet 4.5 · Balanced" } = {}) => `
  <button class="chip${open ? " open" : ""}${reveal ? " reveal" : ""}${custom ? " custom" : ""}" aria-haspopup="dialog" aria-expanded="${open}" aria-label="Model and thinking: ${label}">
    ${mark(vendor)}${level ? glyph(level, "s14") : ""}<span class="label">${label}</span></button>`;
const o1pop = `
  <div class="pop" role="dialog" aria-label="Model and thinking" style="bottom: 128px">
    <div class="pop-section"><p class="pop-label">Thinking</p>
      ${thinkTrack("thorough")}<p class="think-note">Thorough: plans and hard questions. Slower, about 2× the cost.</p></div>
    <hr>
    <div class="search">${icon("search", "s14")}Search 312 models on OpenRouter</div>
    <div class="group-label">Recent</div>
    ${row("claude", models.claude[1], { on: true, tag: "Atlas's usual" })}
    ${row("openai", models.openai[1], { hover: true })}
    <div class="group-label">${mark("gemini", "s12")} Google</div>
    ${row("gemini", models.gemini[0])}
    <hr>
    <div class="pop-foot"><span>Applies to</span><span class="scope" role="group" aria-label="Applies to"><button aria-pressed="true">This chat</button><button aria-pressed="false">Atlas always</button></span></div>
  </div>`;
const o1 = [
  ["At rest", "An icon pair after the mic: the vendor's mark and the plant for Thinking. The words show on hover or focus.",
    panel(head() + transcript() + composer({ tools: o1chip("claude", "balanced") + tip("Claude Sonnet 4.5 · Balanced", "left:38px;bottom:48px;--arrow:30%") }))],
  ["Open", "One popover: Thinking on top, then recent models, search and vendor groups. Changes this chat unless you pick Atlas always.",
    panel(head() + transcript() + o1pop + composer({ tools: o1chip("claude", "thorough", { open: true }) }))],
  ["Changed for this chat", "A dot on the chip says this chat runs off Atlas's usual. The reply that used it is stamped.",
    panel(head() + transcript(`<div class="switch-line"><span>${mark("openai", "s12")} GPT-5.1 Codex · ${glyph("thorough", "s14")} Thorough, this chat</span></div>
      <div class="msg agent"><div class="meta"><img src="${portrait.atlas}" alt=""><b>Atlas</b> 14:05<span class="model-stamp">${mark("openai", "s12")} Codex</span></div><p>Friday now holds only the gym and the call with Sam.</p></div>`)
      + composer({ text: "", focus: false, tools: o1chip("openai", "thorough", { custom: true, label: "GPT-5.1 Codex · Thorough" }) }))],
];

// ---------- O2: a mark and a dial ----------
const dial = (level, n) => `<button class="dial" aria-label="Thinking: ${level}">${glyph(level)}<span class="ticks">${[1, 2, 3].map((i) => `<i class="${i <= n ? "on" : ""}"></i>`).join("")}</span></button>`;
const o2tools = (vendor, level, n, { tipText = "" } = {}) => `<span style="flex:1"></span><button class="tool" data-vendor="${vendor}" aria-label="Model">${mark(vendor, "s16")}</button>${dial(level, n)}${tipText}`;
const o2menu = `
  <div class="menu" role="listbox" aria-label="Pinned models">
    <div class="group-label">${icon("pin", "s12")} Pinned</div>
    ${row("claude", models.claude[1], { on: true, end: " " })}
    ${row("openai", models.openai[1], { hover: true, end: `<span class="pin on">${icon("pin", "s12")}</span>` })}
    ${row("claude", models.claude[0], { end: " " })}
    ${row("gemini", models.gemini[1], { end: " " })}
    <hr><button class="row"><span class="name"><b>All models…</b></span>${icon("chevron-right", "s14")}</button>
  </div>`;
const o2sheet = `
  <div class="sheet" role="dialog" aria-label="All models">
    <div class="sheet-head"><h5>Atlas's model</h5><button class="tool" aria-label="Close">${icon("x")}</button></div>
    <div class="vendors" role="tablist"><button role="tab" aria-selected="false">All</button><button role="tab" aria-selected="true">${mark("claude")}Claude</button><button role="tab" aria-selected="false">${mark("openai")}OpenAI</button><button role="tab" aria-selected="false">${mark("gemini")}Gemini</button><button role="tab" aria-selected="false">More</button></div>
    <div class="search" style="margin:8px 12px 2px">${icon("search", "s14")}Search Claude models</div>
    <div class="sheet-list">
      ${row("claude", models.claude[0], { end: `<span class="price">${models.claude[0][3]}</span><span class="pin on">${icon("pin", "s12")}</span>` })}
      ${row("claude", models.claude[1], { on: true, end: `<span class="price">${models.claude[1][3]}</span><span class="pin on">${icon("pin", "s12")}</span>` })}
      ${row("claude", models.claude[2], { hover: true, end: `<span class="price">${models.claude[2][3]}</span><span class="pin">${icon("pin", "s12")}</span>` })}
      ${row("claude", ["Claude Sonnet 4", "Older, steady", 2], { end: `<span class="price">$3 / $15</span><span class="pin">${icon("pin", "s12")}</span>` })}
      <p class="empty-note">${icon("info", "s14")}Prices per million words in and out, roughly. Pin the ones you switch between.</p>
    </div>
    <div class="sheet-foot"><button class="btn quiet">Atlas always</button><button class="btn primary">Use in this chat</button></div>
  </div>`;
const o2 = [
  ["At rest", "Two buttons on the right, beside Send. Tap the plant to step Thinking up (Fast, Balanced, Thorough); the dots count the steps.",
    panel(head() + transcript() + composer({ tools: o2tools("claude", "balanced", 2, { tipText: tip("Thinking: Balanced. Tap for Thorough", "right:44px;bottom:48px;--arrow:78%") }) }))],
  ["Model button", "A short list of pinned models for one-tap switching, and All models… for the rest.",
    panel(head() + transcript() + o2menu + composer({ tools: o2tools("claude", "balanced", 2) }))],
  ["All models", "A sheet over the chat: vendor tabs with their marks, real prices, pins, and a clear this-chat or always choice.",
    panel(head() + transcript() + composer({ tools: o2tools("claude", "balanced", 2) }) + o2sheet)],
];

// ---------- O3: a line in the box ----------
const o3line = (who, vendor, name, level, word, { openModel = false, openThink = false } = {}) => `
  <div class="line">${who ? `<span class="who">${who} on</span>` : ""}<button class="${openModel ? "open" : ""}" aria-haspopup="dialog">${mark(vendor, "s12")}${name}${icon("chevron-down", "s12")}</button>
    <span class="sep">·</span><button class="${openThink ? "open" : ""}" aria-haspopup="dialog">${glyph(level, "s14")}${word}</button></div>`;
const o3pop = `
  <div class="pop" role="dialog" aria-label="Model" style="bottom: 150px">
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="false">${mark("claude", "s18")}Claude</button><button role="tab" aria-selected="true">${mark("openai", "s18")}OpenAI</button>
      <button role="tab" aria-selected="false">${mark("gemini", "s18")}Gemini</button><button role="tab" aria-selected="false">${mark("deepseek", "s18")}DeepSeek</button><button role="tab" aria-selected="false">${icon("search", "s18")}Search</button>
    </div>
    ${row("openai", models.openai[0])}
    ${row("openai", models.openai[1], { on: true })}
    ${row("openai", models.openai[2], { hover: true })}
    <hr>
    <div class="pop-section"><p class="pop-label">Thinking <small>Thorough: slower, about 2× the cost</small></p>
      <div class="slider"><span class="track"></span><span class="fill" style="width:100%"></span>
        ${["default", "fast", "balanced", "thorough"].map((id, i) => `<span class="stop${id === "thorough" ? " on" : ""}" style="left:${i * 33.333}%">${glyph(id, "s14")}</span>`).join("")}</div>
      <div class="slider-labels"><span>Default</span><span>Fast</span><span>Balanced</span><b>Thorough</b></div></div>
    <div class="pop-foot"><span>For this chat</span><button>Make it Atlas's usual</button></div>
  </div>`;
const o3room = `
  <div class="to" role="group" aria-label="Send to"><span>To</span>
    <button aria-pressed="false"><img src="${portrait.atlas}" alt=""><span class="badge">${mark("claude")}</span>Atlas</button>
    <button aria-pressed="true"><img src="${portrait.muse}" alt=""><span class="badge">${mark("gemini")}</span>Muse</button>
    <button aria-pressed="false"><img src="${portrait.ledger}" alt=""><span class="badge">${mark("deepseek")}</span>Ledger</button>
  </div>`;
const o3 = [
  ["At rest", "The box says who answers and how, in words. Each half opens its own picker.",
    panel(head() + transcript() + composer({ inBox: o3line("Atlas", "claude", "Sonnet 4.5", "balanced", "Balanced") }))],
  ["Model open", "Vendors as tabs with their marks, then that vendor's models. Thinking sits under them as a growing plant.",
    panel(head() + transcript() + o3pop + composer({ inBox: o3line("Atlas", "openai", "GPT-5.1 Codex", "thorough", "Thorough", { openModel: true }) }))],
  ["In a room", "Every face in To carries its model's mark. The line follows whoever you address.",
    panel(head("Home front", "Room · 3 agents") + transcript() + composer({ before: o3room, inBox: o3line("Muse", "gemini", "Gemini 3 Pro", "fast", "Fast"), text: "Ideas for Sunday lunch?" }))],
];

// ---------- Goes with any option: providers that limit the choice ----------
const hostedPop = `
  <div class="pop" role="dialog" style="bottom: 128px">
    <div class="notice">${mark("atlaswork", "s18")}<span><b>Atlaswork picks the model.</b> Pro answers on a model Atlaswork chooses and keeps current.</span>
      <span>Connect OpenRouter, an API key or your ChatGPT plan to choose models and thinking per chat.</span>
      <button class="btn quiet" style="justify-self:start">Connect your own model</button></div>
  </div>`;
const claudeKeyPop = `
  <div class="pop" role="dialog" style="bottom: 128px">
    <div class="pop-section"><p class="pop-label">Thinking <small>Not through an Anthropic key</small></p>${thinkTrack("default", { disabled: true })}
      <p class="think-note">Claude answers through your Anthropic key at its own pace. OpenRouter or OpenAI let you choose.</p></div>
    <hr><div class="group-label">${mark("claude", "s12")} Your Anthropic key</div>
    ${row("claude", models.claude[0])}${row("claude", models.claude[1], { on: true })}${row("claude", models.claude[2])}
  </div>`;
const chatgptPop = `
  <div class="pop" role="dialog" style="bottom: 128px">
    <div class="pop-section"><p class="pop-label">Thinking</p>${thinkTrack("thorough")}</div>
    <hr><div class="group-label">${mark("openai", "s12")} Your ChatGPT plan</div>
    ${row("openai", ["GPT-5.1", "Strong all-rounder", 0], { end: '<span class="tag">in plan</span>' })}${row("openai", ["GPT-5.1 Codex", "Code, files and tools", 0], { on: true, end: '<span class="tag">in plan</span>' })}${row("openai", ["GPT-5.1 Codex mini", "Quick and light", 0], { end: '<span class="tag">in plan</span>' })}
  </div>`;
const shared = [
  ["Atlaswork's hosted model", "Nothing to pick: the chip shows the Atlaswork icon, and opening it explains why and how to choose.",
    panel(head() + transcript() + hostedPop + composer({ tools: o1chip("atlaswork", null, { open: true, label: "Atlaswork" }) }))],
  ["Your Anthropic key", "Only Claude models. Thinking is shown but off, with the reason, instead of vanishing.",
    panel(head() + transcript() + claudeKeyPop + composer({ tools: o1chip("claude", "default", { open: true }) }))],
  ["Your ChatGPT plan", "OpenAI models only, Codex included, at no extra cost: no prices, an 'in plan' note.",
    panel(head() + transcript() + chatgptPop + composer({ tools: o1chip("openai", "thorough", { open: true, label: "Codex · Thorough" }) }))],
];

const draw = (id, frames) => {
  document.getElementById(id).innerHTML = frames.map(([title, caption, html], i) =>
    `<figure class="frame-wrap" data-shot="${id}-${i + 1}">${html}<figcaption><b>${title}.</b> ${caption}</figcaption></figure>`).join("");
};
draw("o1", o1); draw("o2", o2); draw("o3", o3); draw("shared", shared);

document.querySelectorAll("[data-theme-pick]").forEach((button) => button.addEventListener("click", () => {
  document.documentElement.dataset.theme = button.dataset.themePick;
  document.querySelectorAll("[data-theme-pick]").forEach((other) => other.setAttribute("aria-pressed", String(other === button)));
}));
