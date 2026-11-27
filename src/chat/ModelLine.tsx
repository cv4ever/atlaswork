// The message box's model line (agents-design D82): "Atlas on Claude Sonnet 4.5 · Balanced", in words above what you
// type. Either half opens one picker: the provider's models under their vendors' marks, with search and price classes,
// and Thinking as a growing plant. A pick changes this chat only; "Make it … usual" saves it as the agent's own (D44).
// Where the provider allows no choice, the line says what answers and the picker says why.
import { useId, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent, ToggleEvent } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { chatModelOf, inChat, modelName, priceClass, vendorNames, vendorOf } from "../chatModel.ts";
import type { ChatModel, Vendor } from "../chatModel.ts";
import { answersOn, useCatalogue, useModelState } from "../modelMenu.ts";
import type { ModelSource } from "../modelMenu.ts";
import type { Agent, Thread } from "../model.ts";
import { effortLabels } from "../ownModel.ts";
import type { Effort } from "../../supabase/functions/agent/responses.ts";
import { ThinkingGlyph } from "./ThinkingGlyph.tsx";
import { VendorMark } from "./VendorMark.tsx";
import { Tip } from "../Popups.tsx";

/** Vendor tabs in the order people look for them; a vendor with no models in the catalogue gets no tab. */
const vendorOrder: Vendor[] = ["claude", "openai", "gemini", "deepseek", "mistral", "meta", "other"];
const levels: (Effort | null)[] = [null, "low", "medium", "high"];
const levelHints: Record<Effort, string> = { low: "Quick answers, the cheapest", medium: "Most chats", high: "Plans and hard questions, slower" };
/** How many rows a tab draws; search narrows the rest. */
const shownRows = 60;

export function ModelLine({ agent, thread, engine, disabled, recentOf, onChoose, onKeep, onModel }: {
  /** Who the line is about: the chat's agent, or in a room whoever "To" names. */
  agent: Agent;
  thread: Thread;
  engine: ModelSource;
  disabled?: boolean;
  /** The models replies used lately on a catalogue, newest first (`recentModels`), for the Recent rows. */
  recentOf?: (source: string) => string[];
  onChoose: (choice: ChatModel) => void;
  /** Makes this chat's choice the agent's own (Profile → Model). */
  onKeep: () => void;
  /** Opens Settings → AI model. */
  onModel?: () => void;
}) {
  const state = useModelState(engine);
  const popover = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Vendor | null>(null);
  const menu = state.status === "ready" ? state.menu : null;
  const catalogue = useCatalogue(engine, state, open && !!menu);
  const here = inChat(agent, thread);
  const on = answersOn(here, state);
  const chosen = !!chatModelOf(thread, agent.id);
  const nameOf = (id: string) => modelName(id, catalogue?.models.find((model) => model.id === id)?.name);
  // Vendors in the catalogue, with the current model's first open.
  const byVendor = useMemo(() => {
    const groups = new Map<Vendor, { id: string; name: string }[]>();
    for (const model of catalogue?.models ?? []) {
      const vendor = vendorOf(model.id);
      groups.set(vendor, [...groups.get(vendor) ?? [], model]);
    }
    return groups;
  }, [catalogue]);
  const vendors = vendorOrder.filter((vendor) => byVendor.has(vendor));
  const shownTab = tab && byVendor.has(tab) ? tab : on && byVendor.has(on.vendor) ? on.vendor : vendors[0];
  const needle = query.trim().toLocaleLowerCase();
  const rows = needle ? (catalogue?.models ?? []).filter((model) => `${model.id} ${model.name}`.toLocaleLowerCase().includes(needle))
    : byVendor.get(shownTab) ?? [];
  const typed = needle && !rows.some((model) => model.id.toLocaleLowerCase() === needle) && /^[\w.:/@+-]+$/.test(query.trim()) ? query.trim() : "";

  if (state.status === "ready" && state.provider.using === "none") return null;
  const recent = open && menu && !needle ? recentOf?.(menu.source) ?? [] : [];
  const who = agent.name;
  const toggle = (event: ToggleEvent<HTMLDivElement>) => {
    setOpen(event.newState === "open");
    if (event.newState === "open") { setQuery(""); setTab(null); }
  };
  const pick = (id: string | null) => onChoose({ model: id && menu ? { source: menu.source, id } : null });
  // One Tab stop each for the makers, the search and the models: arrows move within them (D82).
  const keys = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const box = event.currentTarget.closest(".model-picker")!;
    if (target.getAttribute("role") === "tab" && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const tabs = [...box.querySelectorAll<HTMLElement>("[role=tab]")];
      const next = tabs[(tabs.indexOf(target) + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      event.preventDefault();
      next.click();
      next.focus();
      return;
    }
    const rows = [...box.querySelectorAll<HTMLElement>(".model-row")];
    const at = rows.indexOf(target);
    const search = box.querySelector<HTMLInputElement>(".model-search input");
    const to = event.key === "ArrowDown" ? (at < 0 ? target === search ? rows[0] : undefined : rows[Math.min(at + 1, rows.length - 1)])
      : event.key === "ArrowUp" && at >= 0 ? (at === 0 ? search : rows[at - 1])
      : event.key === "Home" && at >= 0 ? rows[0] : event.key === "End" && at >= 0 ? rows.at(-1) : undefined;
    if (!to) return;
    event.preventDefault();
    to.focus();
  };

  const trigger = (label: string, extra?: string) => ({ type: "button" as const, popoverTarget: popover, disabled, "aria-label": `${label}${extra ? `: ${extra}` : ""}. Change for this chat` });
  const line = state.status === "loading" ? <span className="model-line-note" role="status">{who} · finding the model…</span>
    : state.status === "error" ? <button {...trigger(`${who}'s model is unavailable`)}>{who}'s model is unavailable</button>
    : !menu ? <button {...trigger(`${who} answers on Atlaswork's model`)}><img className="vendor-mark" src="/icon.svg" alt="" />Atlaswork</button>
    : <>
      <button {...trigger(`${who} answers on ${nameOf(on!.id)}`, chosen ? "chosen for this chat" : undefined)} className="model-line-model" data-chosen={chosen || undefined}>
        <VendorMark vendor={on!.vendor} size={12} /><span>{nameOf(on!.id)}</span><ChevronDown size={12} aria-hidden="true" />
      </button>
      {on!.effort !== undefined && <>
        <span className="model-line-sep" aria-hidden="true">·</span>
        <Tip label={`Thinking: ${on!.effort ? effortLabels[on!.effort] : "the account's setting"}`}>
          <button {...trigger(`Thinking ${on!.effort ? effortLabels[on!.effort] : "as the account sets it"}`)}>
            <ThinkingGlyph effort={on!.effort} /><span className="model-line-word">{on!.effort ? effortLabels[on!.effort] : "Default"}</span>
          </button>
        </Tip>
      </>}
    </>;

  return (
    <div className="model-line">
      {state.status === "ready" && <span className="model-line-who">{who} on</span>}
      {line}
      <div id={popover} popover="auto" className="model-picker" aria-label={`${who}'s model in this chat`} onToggle={toggle}>
        {state.status === "error" ? <p className="model-picker-note" role="alert">{state.message}{" "}
          <button type="button" className="text-button" onClick={engine.models.reload}>Retry</button></p>
        : state.status === "loading" ? <p className="model-picker-note" role="status">Finding the model…</p>
        : !menu ? <div className="model-picker-note">
          <p><b>Atlaswork picks the model.</b> Every agent answers on the model Atlaswork runs and keeps current.</p>
          <p>Connect OpenRouter, an API key or your ChatGPT plan to choose models and thinking for each chat.</p>
          {onModel && <button type="button" className="secondary-button" onClick={onModel}>Connect your own model</button>}
        </div>
        : <>
          {vendors.length > 1 && !needle && (
            <div className="model-vendors" role="tablist" aria-label="Makers" tabIndex={-1} onKeyDown={keys}>
              {vendors.map((vendor) => (
                <button key={vendor} type="button" role="tab" aria-selected={vendor === shownTab} tabIndex={vendor === shownTab ? 0 : -1} onClick={() => setTab(vendor)}>
                  <VendorMark vendor={vendor} size={16} />{vendorNames[vendor]}
                </button>
              ))}
            </div>
          )}
          <label className="model-search"><Search size={14} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={keys} spellCheck={false} autoComplete="off"
              placeholder={catalogue ? `Search ${catalogue.models.length} models on ${menu.label}` : `Search ${menu.label}`} aria-label="Search models" />
          </label>
          <div className="model-rows" role="listbox" aria-label="Models" tabIndex={-1} onKeyDown={keys}>
            {recent.length > 0 && <>
              <p className="model-group">Recent</p>
              {recent.map((id) => <ModelRow key={`recent ${id}`} name={nameOf(id)} vendor={vendorOf(id)} cost={catalogue?.prices?.[id]}
                selected={!on!.isDefault && on!.id === id} onPick={() => pick(id)} />)}
              <p className="model-group">{vendors.length > 1 && shownTab ? vendorNames[shownTab] : menu.label}</p>
            </>}
            {!needle && <ModelRow name={`${menu.label} default`} hint={nameOf(menu.current)} vendor={vendorOf(menu.current)}
              selected={on!.isDefault} onPick={() => pick(null)} />}
            {!catalogue ? <p className="model-picker-note" role="status">Loading models…</p>
              : rows.slice(0, shownRows).map((model) => (
                <ModelRow key={model.id} name={modelName(model.id, model.name)} vendor={vendorOf(model.id)}
                  selected={!on!.isDefault && on!.id === model.id} cost={catalogue.prices?.[model.id]} onPick={() => pick(model.id)} />
              ))}
            {catalogue && rows.length > shownRows && <p className="model-picker-note">{rows.length - shownRows} more: search to narrow them.</p>}
            {typed && <ModelRow name={`Use “${typed}”`} hint="A model id this list doesn't show" vendor={vendorOf(typed)} selected={false} onPick={() => pick(typed)} />}
            {catalogue && !rows.length && !typed && <p className="model-picker-note">No model matches.</p>}
          </div>
          <Thinking menuLabel={menu.label} effort={menu.efforts ? on!.effort ?? null : undefined} account={menu.efforts?.current ?? null}
            onChoose={(effort) => onChoose({ effort })} />
          <p className="model-picker-foot">
            {chosen ? <>
              <span>Only this chat</span>
              <button type="button" className="text-button" onClick={() => onChoose({ model: agent.model ?? null, effort: agent.effort ?? null })}>Use {who}'s usual</button>
              <button type="button" className="text-button" onClick={onKeep}>Make it {who}'s usual</button>
            </> : <span>A change here is for this chat only.</span>}
          </p>
        </>}
      </div>
    </div>
  );
}

function ModelRow({ name, hint, vendor, selected, cost, onPick }: { name: string; hint?: string; vendor: Vendor; selected: boolean;
  cost?: { input: number; output: number }; onPick: () => void }) {
  const tier = cost && priceClass(cost);
  return (
    <button type="button" role="option" aria-selected={selected} tabIndex={selected ? 0 : -1} className="model-row" onClick={onPick}>
      <VendorMark vendor={vendor} size={16} />
      <span className="model-row-name"><b>{name}</b>{hint && <small>{hint}</small>}</span>
      {cost && <span className="model-cost" title={`$${cost.input.toFixed(2)} in, $${cost.output.toFixed(2)} out per million tokens`}>
        {tier === 0 ? "Free" : <><b>{"$".repeat(tier!)}</b>{"$".repeat(3 - tier!)}</>}
      </span>}
      {selected && <Check size={14} aria-hidden="true" />}
    </button>
  );
}

/** Thinking's four stops on one track, the plant growing with each; shown but off, with why, where the provider takes none. */
function Thinking({ menuLabel, effort, account, onChoose }: { menuLabel: string; effort: Effort | null | undefined; account: Effort | null;
  onChoose: (effort: Effort | null) => void }) {
  const off = effort === undefined;
  const name = useId();
  const at = off ? 0 : levels.indexOf(effort);
  return (
    <fieldset className="model-thinking" disabled={off}>
      <legend>Thinking <small>{off ? `Not through ${menuLabel}` : effort ? levelHints[effort] : `The account's setting: ${account ? effortLabels[account] : "the model's own"}`}</small></legend>
      <div className="thinking-track" style={{ "--at": at } as CSSProperties}>
        {levels.map((level) => (
          <label key={level ?? "default"}>
            <input type="radio" name={name} checked={!off && level === effort} onChange={() => onChoose(level)} />
            <span className="thinking-stop"><ThinkingGlyph effort={level} /></span>
            {level ? effortLabels[level] : "Default"}
          </label>
        ))}
      </div>
      {off && <p className="model-picker-note">{menuLabel} thinks at its own pace here. OpenRouter, OpenAI and Anthropic take a Thinking level.</p>}
    </fieldset>
  );
}
