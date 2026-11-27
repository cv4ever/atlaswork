// The domain dialog: plant or tend a domain, with Describe it.
import type { CSSProperties } from "react";
import { Archive, ChevronDown, ChevronRight, Trash2, UserRound } from "lucide-react";
import * as crews from "../agents.ts";
import { useApp, useUi, useView } from "../appContext.ts";
import { DescribeIt } from "../DescribeIt.tsx";
import Dialog from "../Dialog.tsx";
import { domainRequest, filledDomain, unfilledDomain } from "../formFill.ts";
import type { DomainField } from "../formFill.ts";
import { atlasId, domainHues, kindOf } from "../model.ts";
import { usePortraitSrc } from "../crewStyle.ts";
import { hueOf } from "../look.ts";
import type { Agent } from "../model.ts";
import type { DomainForm } from "../ui.ts";
import { LookPicker } from "../LookPicker.tsx";
import { suggestedDomains } from "../onboarding.ts";
import { RoutineList } from "../RoutineViews.tsx";
import * as routines from "../routines.ts";
import { routineDate } from "../view.ts";
import { countUsage } from "../usage.ts";
import * as workspace from "../workspace.ts";
import type { DomainDraft } from "../workspace.ts";
import { Tip } from "../Popups.tsx";
import { useFill } from "./useFill.ts";
import { Emblem } from "../Emblem.tsx";

/**
 * Plant or tend a domain, in the order people answer: what it's called and what it's for (in the seed packet, whose
 * emblem opens the look), who looks after it (one line, the choices behind Change), then the rarely touched routines.
 * Above them, Describe it: tell Atlas what the domain is for and he fills the form; what he changed lights up (D63).
 */
export function DomainDialog() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const fill = useFill();
  const draft = useUi((state) => state.domainDraft);
  const routineOpen = useUi((state) => state.routineOpen);
  const data = useView((view) => view.data);
  const today = useView((view) => view.today);
  const clock = useView((view) => view.now);
  if (!draft) return null;
  const lit = (field: DomainField) => draft.filled?.fields.includes(field) || undefined;
  const { original, domain } = draft;
  const change = (patch: Partial<DomainDraft>) => actions.setUi({ domainDraft: { ...draft, domain: { ...domain, ...patch } } });
  const name = domain.name.trim();
  const taken = data.domains.some((item) => item.name !== original?.name && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const now = routineDate(clock);
  // A new domain's own agent (agents-design D51): the agent suggested for it, from the crew when it's there; a new agent
  // is always one of the choices, so a crew member suggested for the domain never hides hiring someone for it. A fill
  // may pick a suggested agent by their work (Tutor) or word a new one for the domain (D63).
  const worded = { start: draft.keeper?.start, role: draft.keeper?.role, instructions: draft.keeper?.instructions };
  const isWorded = !!(worded.start || worded.role || worded.instructions);
  const keeper = !original ? workspace.keeperFor(data, domain, { since: now.toISOString() }) : undefined;
  const fresh = keeper && (!keeper.isNew || isWorded)
    ? workspace.keeperFor(data, domain, { since: now.toISOString(), fresh: !keeper.isNew || undefined, ...worded }) : keeper;
  const offered = fresh?.agent;
  const steward = draft.keeper && keeper ? (draft.keeper.fresh || isWorded ? fresh! : keeper).agent.id : domain.agentId ?? "";
  const atlas = crews.agentById(data, atlasId)!;
  const choices = [...offered ? [offered] : [], atlas, ...data.agents.filter((agent) => !agent.archived && agent.id !== atlasId)];
  const chosen = choices.find((agent) => agent.id === (steward || atlasId)) ?? atlas;
  const improves = chosen.routines?.find((routine) => routine.kind === "improve" && !routine.paused);
  const undecided = !original && !name && !!draft.keeper && !draft.keeper.fresh && !isWorded;
  const often = improves && routines.repeatLabel(improves);
  const when = !often ? "" : often === "Every day" ? " every day" : ` on ${routines.longWeekdays.some((day) => often.startsWith(day)) ? often : often[0].toLocaleLowerCase() + often.slice(1)}`;
  const about = chosen === atlas ? "Atlas answers here and runs its routines"
    : `${chosen === offered ? `New ${chosen.role.trim()}` : chosen.role}${improves ? ` · suggests improvements${when}` : ""}`;
  const pick = (agent: Agent) => actions.setUi({ domainDraft: agent === offered
    ? { ...draft, keeper: { since: now.toISOString(), ...!keeper?.isNew && { fresh: true }, ...worded } }
    : agent === keeper?.agent ? { ...draft, keeper: { since: now.toISOString() } }
    : { original, domain: { ...domain, agentId: agent === atlas ? undefined : agent.id } } });
  const names = new Set(data.domains.map((item) => item.name.toLocaleLowerCase()));
  const suggestions = original || name ? [] : suggestedDomains.filter((item) => !names.has(item.name.toLocaleLowerCase())).slice(0, 6);
  const usedHues = new Set(data.domains.map((item) => item.hue));
  const close = () => actions.setUi({ domainDraft: null });
  return (
    <Dialog title={!original ? "Plant a new domain" : `Tend ${original.name}`} onClose={close}>
      <form className="task-form domain-form" style={{ "--hue": hueOf(domain) } as CSSProperties}
        onSubmit={(event) => { event.preventDefault(); if (name && !taken) actions.saveDomain(draft); }}>
        {fill && (
          <DescribeIt agent={atlas} placeholder={original ? `Tell Atlas what to change in ${original.name}` : "Tell Atlas what this part of your life is about"}
            ask={async (words, signal) => {
              const reply = await fill(atlas, { kind: "domain", editing: !!original }, domainRequest(draft, data, words), signal);
              if (reply.fill?.kind !== "domain") return { filled: false, said: reply.text.trim() || "Atlas didn't fill anything in. Say a little more." };
              const filledIn = reply.fill;
              let before: DomainForm | null = null, after: DomainForm | null = null;
              actions.setUi((state) => {
                before = state.domainDraft;
                after = before && filledDomain(before, filledIn, now.toISOString());
                return { domainDraft: after };
              });
              // Where an assumption's link goes (D63): the name and purpose fields, the steward's choices, the routines.
              const open = (id: string) => () => {
                const fold = document.getElementById(id);
                if (fold instanceof HTMLDetailsElement) fold.open = true; else fold?.focus();
              };
              const opens: Partial<Record<DomainField, () => void>> = { name: open("domain-name"), purpose: open("domain-purpose"), keeper: open("domain-steward"), routines: open("domain-routines") };
              // The fill's own words, not the reply's line: on Workers AI that line sometimes wandered off the form (measured 2026-11-18).
              return { filled: true, said: "Filled in. Check it, then plant it.",
                assumed: filledIn.assumed.map((choice) => ({ what: choice.what, open: choice.field && opens[choice.field] })),
                undo: () => actions.setUi((state) => ({ domainDraft: state.domainDraft && before && after
                  ? unfilledDomain(state.domainDraft, before, after) : state.domainDraft })) };
            }} />
        )}
        <div className="domain-preview" key={`packet-${draft.filled?.at}`}>
          <LookPicker id="domain-look" className={`domain-seed${lit("emoji") || lit("colour") ? " is-filled" : ""}`} emoji={domain.emoji} onEmoji={(emoji) => change({ emoji })}
            colour={domain.hue} onColour={(hue) => change({ hue })} onOpen={() => countUsage("domain_look_opened")}
            colours={[["Theme", ""], ...Object.entries(domainHues)].map(([label, hue]) => ({ value: hue, label, swatch: hue || "var(--skin-accent)",
              note: !hue ? "The theme's own accent" : usedHues.has(hue) && domain.hue !== hue ? `${label}, also on another domain` : undefined }))} />
          <div className="domain-packet-fields">
            <input id="domain-name" className="domain-name" required maxLength={40} placeholder="Name it" aria-label="Name" aria-invalid={taken || undefined}
              data-filled={lit("name")} value={domain.name} onChange={(event) => change({ name: event.target.value })} />
            {/* Two rows so the purpose reads as a line or two of its own; it's one line of text, so Enter still plants. */}
            <textarea id="domain-purpose" className="domain-about" rows={2} maxLength={120} placeholder="When it's well tended… (optional)" aria-label="When it's well tended"
              data-filled={lit("purpose")} value={domain.intention} onChange={(event) => change({ intention: event.target.value.replace(/\s*\n\s*/g, " ") })}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
          </div>
          <i /><i /><i />
        </div>
        {taken && <p className="field-error domain-field-note" role="alert">You already tend a domain called {name}.</p>}
        {suggestions.length > 0 && (
          <div className="domain-suggestions domain-form-suggestions" role="group" aria-label="Common domains">
            <small>Or start from</small>
            {suggestions.map((item) => (
              <Tip key={item.name} label={item.intention}><button type="button" style={{ "--hue": item.hue } as CSSProperties}
                onClick={() => change({ name: item.name, emoji: item.emoji, intention: item.intention, ...!usedHues.has(item.hue) && { hue: item.hue } })}>
                          <span aria-hidden="true"><Emblem emoji={item.emoji} /></span>{item.name}</button></Tip>
            ))}
          </div>
        )}
        <details id="domain-steward" className="steward-pick" key={`steward-${draft.filled?.at}`} data-filled={lit("keeper")}>
          <summary>
            {/* Before a new domain has a name or a fill, nobody is shown as chosen (the default keeper read as a choice Atlas
                kept, 2026-11-18); naming it, filling it or picking someone settles it. */}
            {undecided ? <span className="steward-undecided" aria-hidden="true"><UserRound size={18} /></span>
              : <img src={portraitSrc(chosen)} alt="" className={chosen === offered ? "is-new" : undefined} />}
            {undecided ? <span><small>Looked after by</small><strong>Chosen once you name it</strong><small>{fill ? "Or describe it above and Atlas picks someone" : "A keeper of its own, or someone you pick"}</small></span>
              : <span title={chosen === offered && isWorded ? chosen.instructions : undefined}>
                <small>Looked after by</small><strong>{chosen.name}</strong><small>{about}</small></span>}
            <span className="steward-pick-change">Change<ChevronDown size={14} aria-hidden="true" /></span>
          </summary>
          <fieldset className="steward-faces">
            <legend className="sr-only">Who looks after {name || "this domain"}</legend>
            {choices.map((agent) => (
              <Tip key={agent === offered ? "new" : agent.id} label={agent === offered ? `${agent.name}, new ${agent.role.trim()}` : `${agent.name}, ${agent.role}`}><label className={agent === offered ? "is-new" : undefined}>
              <input type="radio" name="domain-steward" checked={agent === chosen} aria-label={agent === offered ? `${agent.name}, new agent` : agent.name}
                onChange={() => pick(agent)} />
              <img src={portraitSrc(agent)} alt="" />
                            </label></Tip>
            ))}
          </fieldset>
          {!original && <Tip label={name ? `Atlas drafts an agent for ${name} from what it's for; Save there plants the domain too` : "Name the domain first"}><button type="button" className="quiet-button steward-ask" disabled={!name || taken} onClick={() => { actions.setUi({ domainDraft: null }); actions.askAtlasForAgent(`Someone to look after a new domain, ${name}${domain.intention.trim() ? `: ${domain.intention.trim()}` : ""}`); }}>
          <img src={portraitSrc(atlas)} alt="" />Ask Atlas for someone else</button></Tip>}
        </details>
        {(() => {
          const owner = { kind: "domain" as const, id: name };
          let draftData;
          try { draftData = workspace.saveDraft(data, { kind: "domain", ...draft }).data; }
          catch (cause) { return name && !taken ? <p role="status">{cause instanceof Error ? cause.message : "Cannot preview this domain."}</p> : null; }
          const list = draftData.domains.find((item) => item.name === name)!.routines ?? [];
          const on = list.filter((routine) => routines.readinessOf(draftData, { routine, owner }, now).enabled).length;
          return (
            <details id="domain-routines" className="task-fold domain-routines" open={!!routineOpen || undefined} key={`routines-${draft.filled?.at}`} data-filled={lit("routines")}>
              <summary><ChevronRight size={14} aria-hidden="true" />Routines for the whole domain
                <small>{list.length ? `${on} of ${list.length} on` : "none yet"}</small></summary>
              <div className="routine-fieldset">
                <RoutineList scene={{ data: draftData, notes: workspace.visible(draftData, name, today).notes.filter((note) => kindOf(note) === "note"), now, owner }}
                  list={list} open={routineOpen} onOpen={(id) => actions.setUi({ routineOpen: id })}
                  onChange={(list) => change({ routines: list })} />
              </div>
            </details>
          );
        })()}
        <div className="form-actions">
          {original && original.name !== data.domains[0].name && <>
            <Tip label="Delete it and everything in it"><button type="button" className="quiet-button domain-remove" onClick={() => actions.deleteForever({ kind: "domain", id: original.name }, original.name)}><Trash2 size={14} />Delete</button></Tip>
            <Tip label="Rest it in the Archive"><button type="button" className="quiet-button" onClick={() => actions.confirmArchive({ kind: "domain", id: original.name }, original.name)}><Archive size={14} />Archive</button></Tip>
          </>}
          <button type="button" className="quiet-button" onClick={close}>Cancel</button>
          <button className="primary-button domain-submit" type="submit" disabled={!name || taken}>
            {original ? "Save" : name ? `Plant ${name}` : "Plant it"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
