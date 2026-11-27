// The first-run flow (agents-design D34): four stepping stones in one dialog. Hello (you: your name and picture,
// firstRun/HelloYou.tsx), Domains (pick the parts of life, or name your own: firstRun/DomainsStep.tsx), Crew (pick
// agents: for your domains, for everything, for work, from the community: firstRun/CrewStep.tsx), Ready (what you'll
// open to, and which AI model answers, D48: firstRun/ReadyModel.tsx). How the picks move together is firstRun/picks.ts;
// the content and the one workspace edit live in onboarding.ts. dialogs/OnboardingHost.tsx shows it over an untouched
// workspace, from Settings → Profile → "Run setup again", or anywhere with `?onboarding`. Only its own buttons close it.
// Atlas is the guide on every step: his square portrait beside a speech bubble, larger on Hello, then a view transition
// carries it between his places. You are the round picture on Hello's own card, so his face never reads as yours
// (2026-11-18). Picks burst, cards tilt toward the pointer, and a trail with a growing plant links the stones (Carlos
// chose all four, 2026-11-07).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { ArrowLeft, ArrowRight, Moon, Sun } from "lucide-react";
import Dialog from "./Dialog.tsx";
import { agentFromShared, browseShared } from "./community.ts";
import type { SharedAgent } from "./community.ts";
import { auth, backend } from "./account.ts";
import { useApp } from "./appContext.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import { plantStages } from "./look.ts";
import type { YourPicture } from "./PicturePicker.tsx";
import { skin } from "./skin.ts";
import type { OnboardingPicks, OnboardingStart } from "./onboarding.ts";
import Plant from "./Plant.tsx";
import { countUsage } from "./usage.ts";
import { morph } from "./morph.ts";
import { Tip } from "./Popups.tsx";
import { CrewStep } from "./firstRun/CrewStep.tsx";
import { DomainsStep } from "./firstRun/DomainsStep.tsx";
import { HelloYou } from "./firstRun/HelloYou.tsx";
import type { ProfilePatch } from "./firstRun/HelloYou.tsx";
import { archiveOf, firstPicks, menuOf, pickedAgents } from "./firstRun/picks.ts";
import type { Picked, Picks } from "./firstRun/picks.ts";
import { ReadyModel } from "./firstRun/ReadyModel.tsx";
import type { ModelTab } from "./firstRun/ReadyModel.tsx";
import { Stack } from "./firstRun/Stack.tsx";
import { Emblem } from "./Emblem.tsx";

const stones = [
  { id: "hello", sticker: "👋", label: "Hello" },
  { id: "domains", sticker: "🗺️", label: "Your domains" },
  { id: "crew", sticker: "🤝", label: "Your crew" },
  { id: "ready", sticker: "🌱", label: "Ready" },
] as const;

/** Tilts the card under the pointer toward it; the variables fall back to 0 elsewhere. */
function tilt(event: MouseEvent<HTMLElement>) {
  const card = (event.target as HTMLElement).closest<HTMLElement>(".area-pick, .crew-pick");
  for (const other of event.currentTarget.querySelectorAll<HTMLElement>("[data-tilted]")) if (other !== card) { other.style.cssText = ""; delete other.dataset.tilted; }
  if (!card) return;
  const box = card.getBoundingClientRect();
  const x = (event.clientX - box.left) / box.width - 0.5;
  const y = (event.clientY - box.top) / box.height - 0.5;
  card.dataset.tilted = "";
  card.style.setProperty("--rx", `${(-y * 10).toFixed(1)}deg`);
  card.style.setProperty("--ry", `${(x * 10).toFixed(1)}deg`);
}

/** The picks so far, kept in this tab while OpenRouter's sign-in leaves the page, so the first run comes back to Ready. */
const draftKey = "atlaswork.onboarding-draft";
function readDraft(): Picks | null {
  try { return JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as Picks | null; } catch { return null; }
}

export default function Onboarding({ name, you, start, onProfile, onTheme, onFinish, onModel, onSkip }: {
  name: string;
  you: YourPicture;
  /** What the workspace already has (`onboardingStart`): shown ticked and fixed. */
  start: OnboardingStart;
  onProfile: (patch: ProfilePatch) => void; onTheme: (theme: "light" | "dark") => void;
  /** `start`: the domain whose first project the first morning opens on. */
  onFinish: (picks: OnboardingPicks, start?: string) => void;
  /** Finishes with the picks, then opens Settings on `tab`. */
  onModel: (picks: OnboardingPicks, tab: ModelTab) => void;
  onSkip: () => void;
}) {
  const portraitSrc = usePortraitSrc();
  const theme = useSyncExternalStore(skin.subscribe, skin.getTheme);
  const { signedIn } = useApp();
  // A Google sign-in already knows your first name: Hello starts with it, unless you've typed one.
  const typedName = useRef(false);
  useEffect(() => {
    if (name.trim() || !signedIn || !auth) return;
    void auth.getSession().then(({ data }) => {
      const meta = data.session?.user.user_metadata as { given_name?: string; full_name?: string; name?: string } | undefined;
      const given = (meta?.given_name ?? meta?.full_name ?? meta?.name ?? "").trim().split(/\s+/)[0];
      if (given && !typedName.current) onProfile({ profileName: given.slice(0, 40) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the first run opens
  }, []);
  // Back from OpenRouter's sign-in on Ready: the picks made before it, and Ready again.
  const [draft] = useState(readDraft);
  useEffect(() => { try { sessionStorage.removeItem(draftKey); } catch { /* blocked: nothing was kept */ } }, []);
  const [step, setStep] = useState(draft ? stones.length - 1 : 0);
  const [picks, setPicks] = useState(() => firstPicks(start, draft));
  const { crew } = start;
  const { yours, isYours, allDomains, everyday } = menuOf(start, picks.own);
  /** How many times each pick was ticked on, so a burst plays per tick. */
  const [bursts, setBursts] = useState<Record<string, number>>({});
  /** Atlas hops once per pick, the guide answering what you did. */
  const [hops, setHops] = useState(0);
  const onPicked = ({ picks: next, burst }: Picked) => {
    setPicks(next);
    if (!burst) return;
    setBursts((current) => ({ ...current, [burst]: (current[burst] ?? 0) + 1 }));
    setHops((count) => count + 1);
  };
  // null until the community answers; [] when this build has no backend or nobody shared anything.
  const [community, setCommunity] = useState<SharedAgent[] | null>(backend ? null : []);
  useEffect(() => { if (backend) void browseShared().then(setCommunity); }, []);
  // Each step counts once per showing, so the counts read as a funnel (usage.ts).
  const reached = useRef(new Set<number>());
  useEffect(() => {
    if (reached.current.has(step)) return;
    reached.current.add(step);
    countUsage((["onboarding_shown", "onboarding_domains", "onboarding_crew", "onboarding_ready"] as const)[step]);
  }, [step]);
  /** The domains picked when Crew opened: they sort its groups, so a tile ticked further down stays where it is. */
  const [crewFrom, setCrewFrom] = useState<string[]>(() => picks.domains);
  /** Steps change inside a view transition, so Atlas's portrait travels between its two places instead of jumping. */
  const go = (next: number) => morph(() => { if (next === 2) setCrewFrom(picks.domains); setStep(next); });
  const skip = () => { countUsage("onboarding_skipped"); onSkip(); };
  const agents = pickedAgents(start, picks);
  const pickedShared = (community ?? []).filter((item) => picks.shared.includes(item.id));
  const archive = archiveOf(start, picks);
  const stone = stones[step];
  const last = step === stones.length - 1;
  const finished = (): OnboardingPicks => {
    countUsage("onboarding_finished");
    for (const domain of picks.own) if (picks.domains.includes(domain.name)) countUsage("own_domain_added");
    return { domains: picks.domains, own: picks.own, agents, shared: pickedShared.map(agentFromShared), archive };
  };
  /** The first new domain you picked: Ready offers to start its first project. */
  const firstDomain = allDomains.find((domain) => domain.name === picks.domains.find((item) => !isYours(item)));
  const crewSize = agents.length + pickedShared.length;
  /** Everyone who'll work here after Ready, besides Atlas, who is always there and never on the list. */
  const team = [...crew.filter((agent) => picks.keeping.includes(agent.id)), ...agents, ...pickedShared];
  const first = name.trim();
  const pages = 1 + picks.domains.length;
  const fresh = picks.domains.filter((domain) => !isYours(domain)).length;
  const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
  /** "1 to archive" after a second run's counts, when you unticked something you had. */
  const archiving = (count: number) => count ? `, ${count} to archive` : "";
  /** What Atlas says on each step: its title and one line, with this run's own numbers so nothing needs counting. */
  const bubble = [
    { title: first ? `Hi ${first}, I'm Atlas` : "Hi, I'm Atlas", line: "Your guide for the next minute, and after that one of your crew. First, tell me who you are." },
    { title: "Your domains", line: yours.length
      ? `${picks.domains.length - fresh} of yours kept, ${fresh} new${archiving(archive.domains.length)}. Untick one to archive it; Archive brings it back.`
      : `${picks.domains.length} picked, plus Everyday, which I look after: ${plural(pages, "page")}. Add or rename any time.` },
    { title: "Your crew", line: crew.length
      ? `${picks.keeping.length} staying, ${crewSize} new${archiving(archive.agentIds.length)}. The arrow on a card shows what they'd do.`
      : !crewSize ? "Just me for now. The arrow on a card shows what they'd do; you can add them later."
      : `${crewSize} ticked. Each suggests improvements once a week, on a weekday of their own; I check your notes every morning. The arrow on a card shows what they'd do.` },
    { title: first ? `You're set, ${first}` : "You're set", line: "Nothing an agent proposes happens until you say so. First move: write one note, attach it to me, ask for next steps." },
  ][step];
  // Atlas walks the dialog: larger on Hello, then left, right, and centre stage on Ready; the one view transition name
  // morphs his portrait between the places, so he travels rather than jumps.
  const pose = (["hello", "start", "end", "centre"] as const)[step];
  const head = (
    <div className="guide-head" data-pose={pose}>
      <span className={`guide-face${hops ? " is-hopping" : ""}`} key={hops}><img className="atlas-guide" src={portraitSrc({ portrait: "atlas" })} alt="Atlas" /></span>
      <div className="guide-bubble" key={stone.id}><strong>{bubble.title}</strong><p>{bubble.line}</p></div>
    </div>
  );
  return (
    <Dialog className="onboarding-dialog" title="Welcome to Atlaswork" onClose={skip} persistent
      actions={<Tip label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}><button type="button" className="icon-button" role="switch" aria-checked={theme === "dark"} aria-label="Dark mode" onClick={() => onTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button></Tip>}>
      <ol className="onboarding-stones" aria-label="Setup steps" style={{ "--progress": step / (stones.length - 1) } as CSSProperties}>
        {stones.map((item, index) => (
          <li key={item.id} data-state={index === step ? "current" : index < step ? "done" : undefined}>
            <button type="button" disabled={index > step} aria-current={index === step ? "step" : undefined} onClick={() => go(index)}>
              <span aria-hidden="true">{index < step ? "✓" : item.sticker}</span>{item.label}
            </button>
          </li>
        ))}
        <li className="onboarding-plant" aria-hidden="true" key={step}><Plant stage={plantStages[step]} /></li>
      </ol>
      <div className="onboarding-page" key={stone.id} onMouseMove={tilt}>
        {head}
        {step === 0 && <HelloYou name={name} you={you} onProfile={onProfile} onTyped={() => { typedName.current = true; }} onEnter={() => go(1)} />}
        {step === 1 && <DomainsStep start={start} picks={picks} bursts={bursts} onPicked={onPicked} />}
        {step === 2 && <CrewStep start={start} picks={picks} crewFrom={crewFrom} community={community} bursts={bursts} onPicked={onPicked} />}
        {step === 3 && (
          <div className="onboarding-ready">
            <section className="ready-summary" aria-label="What you'll open to">
              <Tip label="Change your domains"><button type="button" className="ready-seal" onClick={() => go(1)}>
                <Stack items={allDomains.filter((domain) => everyday(domain.name) || picks.domains.includes(domain.name)).map((domain, index) =>
                  <i key={index} style={{ "--n": index } as CSSProperties}><Emblem emoji={domain.emoji} /></i>)} />
                <span className="ready-seal-copy"><strong>{plural(pages, "domain")}</strong><small>{yours.length ? `${fresh} new${archiving(archive.domains.length)}` : "Everyday included"} · <u>Change</u></small></span>
              </button></Tip>
              <Tip label="Change your crew"><button type="button" className="ready-seal" onClick={() => go(2)}>
                <Stack items={(team.length ? team : [{ portrait: "atlas" }]).map((agent, index) =>
                  <img key={index} src={portraitSrc(agent)} alt="" style={{ "--n": index } as CSSProperties} />)} />
                <span className="ready-seal-copy"><strong>{team.length ? plural(team.length, "agent") : "Just Atlas"}</strong><small>{[team.length ? "Plus Atlas" : "Add agents any time",
                  crew.length ? `${crewSize} new${archiving(archive.agentIds.length)}` : !crewSize ? "" : "one weekday each"].filter(Boolean).join(" · ")} · <u>Change</u></small></span>
              </button></Tip>
            </section>
            <ReadyModel onModel={(tab) => onModel(finished(), tab)}
              onLeave={() => {
                try { sessionStorage.setItem(draftKey, JSON.stringify(picks satisfies Picks)); } catch { /* blocked: the first run starts over */ }
              }} />
          </div>
        )}
      </div>
      <div className="form-actions onboarding-actions">
        {!last && <button type="button" className="quiet-button" onClick={skip}>Skip setup</button>}
        {step > 0 && <button type="button" className="secondary-button" onClick={() => go(step - 1)}><ArrowLeft size={16} />Back</button>}
        {last && firstDomain && <button type="button" className="secondary-button" onClick={() => onFinish(finished())}>Open my workspace</button>}
        {last ? <button type="button" className="primary-button" onClick={() => onFinish(finished(), firstDomain?.name)}>
          {firstDomain ? `Start ${firstDomain.name}'s first project` : "Open my workspace"}<ArrowRight size={16} /></button>
          : <button type="button" className="primary-button" onClick={() => go(step + 1)}>{step === 2 && !crewSize && !picks.keeping.length ? "Just Atlas for now" : `Next: ${stones[step + 1].label}`}<ArrowRight size={16} /></button>}
      </div>
    </Dialog>
  );
}
