// Avatar pack mockups: the same six faces drawn in eight packs, the crew page in any of them, and three ways to pick
// a pack. Faces: faces/<pack>-<name>.webp, cut from one generated 3×2 sheet per pack (prompts.json has the prompts).
const ic = (name, size = 16) => `<svg class="icon s${size}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
/** The single-file copy sent for review inlines every image as `window.IMAGES[path]`. */
const src = (path) => window.IMAGES?.[path] ?? path;

const cast = {
  atlas: { name: "Atlas", role: "Your thinking partner" },
  hearth: { name: "Hearth", role: "Housekeeper", hue: "--home", place: "Home front" },
  vital: { name: "Vital", role: "Health coach", hue: "--health", place: "Health" },
  kin: { name: "Kin", role: "Family organiser", hue: "--family", place: "Family" },
  ledger: { name: "Ledger", role: "Bookkeeper", hue: "--finance", place: "Finance" },
  compass: { name: "Compass", role: "Career guide", hue: "--career", place: "Career" },
};
const order = Object.keys(cast);

const packs = [
  { id: "storybook", code: "P0", name: "Storybook", now: true, short: "Gouache and ink, today's faces",
    line: "Warm gouache, fine ink outlines, paper grain. Every face in the app today.",
    pro: "Matches the garden world, the landing page's cast and Atlas.", con: "Stays the default in every option below." },
  { id: "manga", code: "P1", name: "Manga", short: "Anime cel shading",
    line: "Anime cel shading, big glossy eyes, a screentone ground.",
    pro: "Big eyes and clean shapes hold up at 20px.", con: "Cooler and flatter than the garden look, and the nearest to avatar apps everyone has seen." },
  { id: "heroes", code: "P2", name: "Heroes", short: "Masks, capes, halftone",
    line: "Original masked heroes, the emblem as a chest symbol, 1960s comic halftone.",
    pro: "The chest emblem names the domain at a glance: house, heartbeat, rings, coin, compass.",
    con: "Masks cover the eyes, a face's strongest cue in a 20px tab. Costumes must stay original, never a lookalike of a Marvel or DC hero." },
  { id: "villains", code: "P8", name: "Villains", short: "The heroes' dark twins",
    line: "The heroes' original supervillain twins: sharp collars, sly smirks, corrupted emblems, a dark halftone burst.",
    pro: "The cracked house, flatline heartbeat and broken rings still name each domain, so the joke reads at a glance.",
    con: "Dark grounds and purple capes sit heavier on the page than any other pack; the masks hide the eyes, as in Heroes." },
  { id: "pixel", code: "P3", name: "Pixel", short: "16-bit game portraits",
    line: "16-bit role-playing game portraits.",
    pro: "Playful and crisp; nothing says “game” faster.", con: "Pixel art is drawn for one size. Scaled to 32 or 20px its pixels blur, so small sizes need their own cut." },
  { id: "animals", code: "P4", name: "Animals", short: "Fox, badger, hare, bear, owl, wolf",
    line: "Fox, badger, hare, bear, owl and wolf in the same gouache, wearing the same clothes.",
    pro: "Closest to the garden world, and nobody mistakes an animal for themselves: agents read as helpers, never as you.",
    con: "An animal brings its own character (a fox reads sly), so each role needs a fitting one. Human hair on the owl reads odd." },
  { id: "ink", code: "P5", name: "Ink", short: "Black line, no colour",
    line: "Black line on warm paper, no colour.",
    pro: "The calmest pack; pairs with the Graphite and Paper themes.", con: "Without colour, agents differ only by hair and glasses. Dark mode needs a light-on-dark cut." },
  { id: "clay", code: "P6", name: "Clay", short: "Stop-motion plasticine",
    line: "Stop-motion plasticine figures under a warm studio light.",
    pro: "Tactile and handmade, the warmest of the new packs.", con: "Photographic texture turns to mush at 20px." },
  { id: "fantasy", code: "P7", name: "Fantasy", short: "A guild in cloaks",
    line: "An adventuring guild: cloaks, brooches, lantern light.",
    pro: "Each agent gets a class: wayfinder, hearth druid, monk, bard, alchemist, ranger.",
    con: "The closest to Storybook, so the least new; the costume sits below the shoulders and is cropped away in small faces." },
];
const packOf = (id) => packs.find((p) => p.id === id);

/** Today's 54 portraits (look.ts), for the Storybook shelf. */
const catalogue = ["hearth", "vital", "kin", "ledger", "compass", "spark", "muse", "scout", "quill", "forge",
  "gardener", "coach", "bookkeeper", "scholar", "chef", "traveler", "artist", "musician", "mentor", "guide", "homekeeper", "planner", "helm", "counsel",
  "mei", "cedar", "anika", "sylvie", "rami", "rowan", "amara", "hiro", "finn", "lina", "noor", "mateo",
  "imani", "ellis", "arjun", "zuri", "owen", "yuna", "clara", "malik", "vera", "minh", "eden", "hugo",
  "silhouette-pine", "silhouette-clay", "silhouette-navy", "silhouette-plum", "silhouette-ochre", "silhouette-teal"];

const state = { pack: "storybook", shelf: "heroes", own: "heroes" };
const face = (id, pack = state.pack) => src(`faces/${pack}-${id}.webp`);
const img = (id, size, pack, cls = "round", extra = "") =>
  `<img class="${cls}" src="${face(id, pack)}" width="${size}" height="${size}" alt="" ${extra}>`;
/** An avatar stack: faces overlap by 0.38 × size, as AvatarStack.tsx draws them. */
const stack = (faces, size) => `<span class="stack">${faces.map(([id, pack], i) =>
  `<img src="${face(id, pack)}" width="${size}" height="${size}" alt="" style="${i ? `margin-left:${-Math.round(size * 0.38)}px` : ""}">`).join("")}</span>`;
const hue = (id) => cast[id].hue ? `style="--hue: var(${cast[id].hue})"` : "";

// ---------- The packs ----------
const packCard = (p) => `
  <article class="pack" id="pack-${p.id}">
    <header><span class="code">${p.code}</span><b>${p.name}${p.now ? ` <span class="now">· today</span>` : ""}</b><span class="line">${p.line}</span></header>
    <div class="tiles">${order.map((id) => `<img src="${face(id, p.id)}" alt="${cast[id].name} in ${p.name}" loading="lazy">`).join("")}</div>
    <div class="sizes">
      ${[118, 72, 32, 20].map((size) => `<span class="at">${img("kin", size, p.id)}${size}px</span>`).join("")}
      <span class="at">${stack(order.map((id) => [id, p.id]), 24)}stack</span>
    </div>
    <ul class="tradeoffs"><li><b>For:</b> ${p.pro}</li><li><b>Against:</b> ${p.con}</li></ul>
  </article>`;

// ---------- Your crew page ----------
const row = (id, line, when, on = false, pack) => `
  <div class="row${on ? " on" : ""}">${img(id, 36, pack)}<span class="who"><b>${cast[id].name}</b><small>${line}</small></span>${when ? `<time>${when}</time>` : ""}</div>`;
const crewCard = (id) => `
  <div class="ccard" ${hue(id)}>${img(id, 80)}<b>${cast[id].name}</b><small>${cast[id].role}</small><span class="chip"><i></i>${cast[id].place}</span></div>`;
const crewPage = () => `
  <figure class="wide"><div class="scroll"><div class="app crew-app">
    <aside class="side">
      <div class="seg"><span>Projects</span><span class="on">Agents</span></div>
      ${row("atlas", "2 to approve", "", true)}
      <div class="glabel">Everyone else</div>
      ${row("vital", "Asked: Move Friday's session to 07:30", "18:16")}
      ${row("ledger", "I can't cancel it for you, but…", "Sat")}
      ${row("kin", "You: Perfect. Booking it.", "23 Oct")}
      ${row("hearth", "Bins go out tonight, not Friday", "21 Oct")}
      ${row("compass", "One topic a month, not four", "12 Oct")}
    </aside>
    <section class="main">
      <div class="ptitle">Your crew</div>
      <p class="psub">Each one sees only where you put them. Atlas sees everything.</p>
      <div class="atlas-card">${img("atlas", 76)}<div><b>Atlas</b><p>Your thinking partner. He answers wherever nobody else is assigned, and can join any crew.</p></div></div>
      <div class="cards">${["vital", "kin", "ledger", "compass"].map(crewCard).join("")}</div>
    </section>
  </div></div>
  <figcaption><b>The Agents page in ${packOf(state.pack).name}.</b> Chat rows at 36px, crew cards at 80, Atlas at 76.</figcaption></figure>`;

const pickBar = () => `<span>Show the frames in</span>${packs.map((p) =>
  `<button class="pick" data-pick="${p.id}" aria-pressed="${state.pack === p.id}">${img("vital", 24, p.id, "")}${p.name}</button>`).join("")}`;

// ---------- The agent dialog's badge ----------
const badge = (id, faceSrc, body) => `
  <div class="badge" ${hue(id)}>
    <div class="bface">${ic("chevron-left", 18)}<img class="round" src="${faceSrc}" width="118" height="118" alt="">${ic("chevron-right", 18)}</div>
    <div class="bname">${cast[id].name}</div>
    <div class="brole">${cast[id].role}</div>
    ${body}
  </div>`;

// O1: every pack is its own shelf of faces; each agent wears a face from any shelf.
const mixed = { atlas: "storybook", vital: "heroes", kin: "pixel", ledger: "ink", compass: "clay", hearth: "animals" };
const o1Badge = () => {
  const shelf = packOf(state.shelf);
  const faces = shelf.id === "storybook"
    ? catalogue.slice(0, 20).map((key) => `<img class="round" src="${src(`/agents/${key}.webp`)}" alt="" loading="lazy">`).join("")
    : order.filter((id) => id !== "atlas").map((id) => {
      const mine = id === "vital" && mixed.vital === shelf.id;
      const taken = id !== "vital" && mixed[id] === shelf.id;
      return `<img class="round${mine ? " on" : ""}${taken ? " taken" : ""}" src="${face(id, shelf.id)}" alt="" title="${taken ? `${cast[id].name} wears this one` : ""}">`;
    }).join("");
  return badge("vital", face("vital", mixed.vital), `
    <div class="drawer">
      <div class="sum">All faces <small>${shelf.id === "storybook" ? "45 of 54 free" : "8 packs"}</small> ${ic("chevron-down", 12)}</div>
      <div class="shelves" role="group" aria-label="Packs">${packs.map((p) =>
        `<button class="shelf" data-shelf="${p.id}" aria-pressed="${state.shelf === p.id}" title="${p.name}" aria-label="${p.name}">${img("vital", 22, p.id, "")}</button>`).join("")}</div>
      <div class="shelf-name"><b>${shelf.name}</b><span>${shelf.id === "storybook" ? "54 faces" : "24 faces"}</span></div>
      <div class="grid">${faces}</div>
      <div class="more">${shelf.id === "storybook" ? "+ 34 more" : "6 of 24 drawn for this mockup"}</div>
    </div>`);
};
const mixedCrew = () => `
  <div class="app mini" style="flex-direction:column">
    <div class="tabrow">
      <span class="tab on">${stack([["vital", mixed.vital], ["kin", mixed.kin], ["atlas", mixed.atlas]], 20)}Wellbeing crew</span>
      <span class="tab">${img("ledger", 20, mixed.ledger)}Ledger</span>
    </div>
    ${order.slice(1).map((id) => row(id, `${cast[id].role} · ${packOf(mixed[id]).name}`, "", false, mixed[id])).join("")}
  </div>`;

// O2: one crew style in Settings → Appearance, beside Theme and Mode.
const appearance = () => `
  <div class="app settings">
    <div class="shead"><span class="sticker" aria-hidden="true">🎨</span><span><b>Appearance</b><small>Pick a theme and how your crew is drawn. Hover one to try it on.</small></span></div>
    <div class="group">Theme</div>
    <div class="themes"><span class="theme">Garden <small>Forest on cream</small></span><span class="theme on">Graphite <small>Black, grey, violet</small></span><span class="theme">Paper <small>Warm grey</small></span></div>
    <div class="group">Crew style <span class="new">Every agent, Atlas, and a face you wear</span></div>
    <div class="styles">${packs.map((p) => `
      <button class="style" data-pick="${p.id}" aria-pressed="${state.pack === p.id}">
        ${stack([["atlas", p.id], ["vital", p.id], ["kin", p.id]], 34)}
        <b>${p.name}${state.pack === p.id ? ic("check", 14) : ""}</b><small>${p.short}</small>
      </button>`).join("")}</div>
    <div class="group">Light or dark</div>
    <div class="mode"><span>Mode<small>Following your device: light right now.</small></span><span class="segm"><span class="on">${ic("monitor", 14)}Auto</span><span>${ic("sun", 14)}Light</span><span>${ic("moon", 14)}Dark</span></span></div>
  </div>`;
const o2Badge = () => badge("vital", face("vital"), `
  <div class="drawer">
    <div class="sum">All faces <small>45 of 54 free</small> ${ic("chevron-down", 12)}</div>
    <div class="grid">${order.filter((id) => id !== "atlas").map((id) =>
      `<img class="round${id === "vital" ? " on" : " taken"}" src="${face(id)}" alt="">`).join("")}</div>
    <div class="more">+ 49 more, all in ${packOf(state.pack).name}</div>
    <div class="more">Your crew is drawn in <b>${packOf(state.pack).name}</b> · <span class="link">Change</span></div>
  </div>`);

// O3: the crew style, and one agent may differ.
const o3Badge = () => {
  const own = state.own === state.pack ? null : packOf(state.own);
  return badge("vital", face("vital", own?.id ?? state.pack), `
    <div class="drawn">
      <div class="lbl"><span>Drawn as <b>${own ? own.name : `Crew style · ${packOf(state.pack).name}`}</b></span>${own ? `<span class="only">only Vital</span>` : ""}</div>
      <div class="opts" role="group" aria-label="Vital's style">${packs.map((p) =>
        `<button class="shelf" data-own="${p.id}" aria-pressed="${(own?.id ?? state.pack) === p.id}" title="${p.id === state.pack ? `Crew style (${p.name})` : p.name}" aria-label="${p.name}">${img("vital", 22, p.id, "")}</button>`).join("")}</div>
    </div>
    <div class="drawer"><div class="sum">All faces <small>45 of 54 free</small> ${ic("chevron-right", 12)}</div></div>`);
};
const o3Crew = () => {
  const vital = state.own;
  return `
  <div class="app mini" style="flex-direction:column">
    <div class="tabrow">
      <span class="tab on">${stack([["vital", vital], ["kin", state.pack], ["atlas", state.pack]], 20)}Wellbeing crew</span>
      <span class="tab">${img("ledger", 20)}Ledger</span>
    </div>
    ${order.slice(1).map((id) => row(id, cast[id].role, "", false, id === "vital" ? vital : state.pack)).join("")}
  </div>`;
};

// ---------- Render ----------
const put = (id, html) => { document.getElementById(id).innerHTML = html; };
function render() {
  put("pickbar", pickBar());
  put("crew", crewPage());
  put("o1", `<figure>${o1Badge()}<figcaption><b>The badge's drawer, one shelf per pack.</b> Each face is the pack's Vital; the open shelf names itself. Pick any shelf, then any face in it.</figcaption></figure>
    <figure>${mixedCrew()}<figcaption><b>A crew picked from six shelves.</b> In a room's stack and the chat list the styles clash, and two agents can wear the same person drawn two ways (pixel Kin on Kin, manga Kin on someone new).</figcaption></figure>`);
  put("o2", `<figure>${appearance()}<figcaption><b>Settings → Appearance, a new Crew style group under Theme.</b> Three of the crew show each pack. Tap one here (or use the bar above): every frame on this page follows.</figcaption></figure>
    <figure>${o2Badge()}<figcaption><b>The agent dialog stays as it is.</b> The drawer draws every face in the crew's style and says so, with a way to Appearance.</figcaption></figure>`);
  put("o3", `<figure>${o3Badge()}<figcaption><b>A style row under the face.</b> The first face is the crew style; any other dresses only this agent. Tap one.</figcaption></figure>
    <figure>${o3Crew()}<figcaption><b>The room and the chat list</b> with Vital as the exception.</figcaption></figure>`);
}

put("packs", packs.map(packCard).join(""));
document.getElementById("today").src = src("today.webp");
render();
document.addEventListener("click", (event) => {
  const pick = event.target.closest("[data-pick]");
  const shelf = event.target.closest("[data-shelf]");
  const own = event.target.closest("[data-own]");
  if (pick) state.pack = pick.dataset.pick;
  if (shelf) state.shelf = shelf.dataset.shelf;
  if (own) state.own = own.dataset.own;
  if (pick || shelf || own) render();
});
