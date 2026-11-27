// Everything your crew does on its own (agents-design D68 and D70, after Herdr's scheduled jobs panel): one sentence of
// how it's going, the next seven days as faces on stems, filters, then every routine as one row. A row opens its sheet
// beside the list (the editor, last runs, Run now and Remove), and the list keeps its order while you work in it. What
// it lists and says is routinesPage/listing.ts; the row, filters, sheet and New routine are their own files there.
import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { useApp, useUi, useView } from "./appContext.ts";
import { atlasId, kindOf } from "./model.ts";
import { usePortraitSrc } from "./crewStyle.ts";
import type { Routine, RoutineKind, WorkspaceData } from "./model.ts";
import { RoutineWeek } from "./RoutineViews.tsx";
import type { WeekRun } from "./RoutineViews.tsx";
import * as routines from "./routines.ts";
import { routineDate, todayDate } from "./view.ts";
import { PageBand } from "./PageBand.tsx";
import { Tip } from "./Popups.tsx";
import { linesOf, ordered, outcomeOf, untilLabel, whatOf } from "./routinesPage/listing.ts";
import type { Filters, Line } from "./routinesPage/listing.ts";
import { NewRoutine } from "./routinesPage/NewRoutine.tsx";
import { RoutineFilters } from "./routinesPage/RoutineFilters.tsx";
import { RoutineRow } from "./routinesPage/RoutineRow.tsx";
import { RoutineSheet } from "./routinesPage/RoutineSheet.tsx";

const weekMs = 7 * 864e5;

export default function RoutinesPage() {
  const portraitSrc = usePortraitSrc();
  const { actions } = useApp();
  const data = useView((view) => view.data);
  const liveNotes = useView((view) => view.visible.notes);
  const liveDomains = useView((view) => view.visible.domains);
  const domains = useView((view) => view.domains);
  const clock = useView((view) => view.now);
  const routineOpen = useUi((state) => state.routineOpen);
  const runAway = useUi((state) => state.runAway);
  const push = useUi((state) => state.pushState);
  const offerDismissed = useView((view) => view.session.awayOfferDismissed);
  const [filters, setFilters] = useState<Filters>({ status: "all", sort: "next", who: [], pinned: null });
  const [adding, setAdding] = useState(false);
  /**
   * The order the list had when you first changed something in it (D70): switching a routine off, editing or running
   * it never moves its row from under the pointer, and a row that stops matching the filter stays until you filter,
   * sort, press Sort again or come back to the page.
   */
  const [held, setHeld] = useState<string[] | null>(null);
  /** The row just switched off (its agent dozes off) or on (wakes up), for its one animation. */
  const [stirred, setStirred] = useState<{ key: string; to: "sleep" | "wake" } | null>(null);
  /** Whose routine "Add" makes; it remembers the last one you picked. */
  const [routineFor, setRoutineFor] = useState(routines.ownerKey({ kind: "agent", id: atlasId }));
  const now = routineDate(clock);
  const notes = liveNotes.filter((note) => kindOf(note) === "note");
  const lines = linesOf(data, now);
  const due = lines.filter((line) => line.due);
  const on = lines.filter((line) => line.enabled);
  const runners = [...new Map(lines.map((line) => [line.runner.id, line.runner])).values()];
  const filtering = filters.status !== "all" || filters.who.length > 0 || !!filters.pinned;
  const { sorted, resorted } = ordered(lines, filters, held);
  const hold = () => { if (!held) setHeld(sorted.map((line) => line.key)); };
  const upNext = on.filter((line) => line.next).sort((a, b) => a.next!.getTime() - b.next!.getTime())[0];
  const week: WeekRun[] = on.flatMap((line) => routines.runsBetween(line.routine, now, new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
    .map((at) => ({ id: line.routine.id, runner: line.runner, what: whatOf(data, line), due: at })));
  const setOpen = (id: string | null) => actions.setUi({ routineOpen: id });
  // Filtering or sorting asks for a new order, so it lets go of the held one.
  const refilter = (patch: Partial<Filters>) => { setHeld(null); setFilters({ ...filters, ...patch }); };
  const clearFilters = () => refilter({ status: "all", who: [], pinned: null });
  // Routines answer through the model, so a run takes a moment; the toast says what happened once they're back.
  const runDue = async () => {
    hold();
    actions.toast("Running what's due…");
    const run = await actions.runRoutines();
    actions.toast(run.ran || run.offline ? `${run.ran ? `${run.ran} ${run.ran === 1 ? "routine" : "routines"} ran. ` : ""}${outcomeOf(run, "All quiet, nothing new.")}`
      : upNext?.next ? `Nothing due. Next: ${whatOf(data, upNext)}, ${routines.whenLabel(upNext.next, now)}.` : "Nothing due.");
  };
  const runNow = async (line: Line) => {
    hold();
    actions.toast(`${line.runner.name} is on it…`);
    const run = await actions.runRoutines(line.routine.id);
    actions.toast(!run.ran && !run.offline ? "Nothing new to run." : outcomeOf(run, `${line.runner.name} ran it and found nothing new.`));
  };
  const listOf = (line: Line) => routines.ownerOf(data, line.owner).routines;
  const change = (line: Line, list: Routine[]) => { hold(); actions.saveRoutines(line.owner, list); };
  const edit = (line: Line, routine: Routine) => change(line, listOf(line).map((item) => item.id === routine.id ? routine : item));
  const toggle = (line: Line, isOn: boolean) => {
    setStirred({ key: line.key, to: isOn ? "wake" : "sleep" });
    edit(line, { ...line.routine, paused: !isOn || undefined });
  };
  const remove = (line: Line) => {
    setOpen(null);
    change(line, listOf(line).filter((item) => item.id !== line.routine.id));
    actions.toast(`Removed ${whatOf(data, line)} and its results.`);
  };
  const add = (kind: RoutineKind) => {
    const owner = routines.ownerFromKey(routineFor);
    const routine = routines.newRoutine(kind, todayDate().toISOString());
    actions.saveRoutines(owner, [...routines.ownerOf(data, owner).routines, routine]);
    setAdding(false);
    clearFilters();
    setOpen(routine.id);
  };
  const openLine = lines.find((line) => line.routine.id === routineOpen);
  const at = openLine ? sorted.indexOf(openLine) : -1;
  return (
    <div className="collection-page routines-page" data-sheet={openLine ? "" : undefined}>
      <PageBand title="Routines"
        line={runAway ? "Each runs on time, even while the app is closed." : "Each runs once its time has passed, the next time you open the workspace."}
        actions={<>
          <Tip label="New routine"><button type="button" className="icon-button" aria-label="New routine" aria-expanded={adding} onClick={() => setAdding(!adding)}>
            <Plus size={18} /></button></Tip>
          <Tip label="Runs every routine whose time has passed and hasn't run yet; each run that asks the model uses one of the day's live replies">
            <button className="primary-button" disabled={!due.length} onClick={runDue}><CalendarClock size={16} />{due.length ? `Run ${due.length} due` : "Nothing due"}</button>
          </Tip>
        </>} />
      {/* After routines have run here, Atlas offers to keep them running while you're away (agents-design D54), and asks
          for this device's notifications in the same step (D55). */}
      {runAway === false && !offerDismissed && Object.keys(data.routineRuns).length > 0 && (
        <div className="routine-away" role="region" aria-label="Routines while you're away">
          <img src={portraitSrc({ portrait: "atlas" })} alt="" />
          <p><strong>Shall we keep going while you're away?</strong> Routines would run on time even with the app closed, and we'd tap you
            on this device when one has something for you. Each run is one of the day's live replies.</p>
          <div>
            <button className="primary-button" onClick={async () => {
              await actions.setRunAway(true);
              if (push === "off") await actions.setPush(true);
            }}>Turn on</button>
            <button className="quiet-button" onClick={() => void actions.updateSession({ awayOfferDismissed: true })}>Not now</button>
          </div>
        </div>
      )}
      {adding && <NewRoutine data={data} liveDomains={liveDomains} domains={domains} owner={routineFor} onOwner={setRoutineFor} onAdd={add} />}
      <Glance data={data} lines={lines} on={on.length} due={due.length} upNext={upNext} now={now}
        missed={runAway ? routines.lateRuns(data.runs, now).length : 0} onNeedsYou={() => refilter({ status: "attention" })} />
      <RoutineWeek runs={week} now={now} pinned={filters.pinned?.at ?? null}
        onPin={(pinAt, ids) => refilter({ pinned: pinAt === null ? null : { at: pinAt, ids } })} />
      <RoutineFilters lines={lines} runners={runners} who={filters.who} status={filters.status} sort={filters.sort} resorted={resorted}
        onWho={(who) => refilter({ who })} onStatus={(status) => refilter({ status })} onSort={(sort) => refilter({ sort })} onResort={() => setHeld(null)} />
      {filtering && (
        <p className="routine-filtered">{sorted.length} of {lines.length} shown{filters.pinned ? ", picked on the week" : ""}.
          <button type="button" className="quiet-button" onClick={clearFilters}>Clear filters</button></p>
      )}
      {!lines.length ? <p className="empty-state">No routines yet. New routine gives one to any agent, domain or project.</p> : (
        <ul className="routine-lines">
          {sorted.map((line) => {
            const open = routineOpen === line.routine.id;
            return <RoutineRow key={line.key} line={line} data={data} now={now} open={open} stir={stirred?.key === line.key ? stirred.to : undefined}
              onOpen={() => setOpen(open ? null : line.routine.id)} onRunNow={() => void runNow(line)} onToggle={(isOn) => toggle(line, isOn)} />;
          })}
          {!sorted.length && <li className="routine-none"><p>No routine matches these filters.</p>
            <button type="button" className="secondary-button" onClick={clearFilters}>Clear filters</button></li>}
        </ul>
      )}
      {openLine && (
        <RoutineSheet key={openLine.key} line={openLine} data={data} notes={notes} now={now} position={at >= 0 ? { at, count: sorted.length } : null}
          onStep={(step) => setOpen(sorted[at + step].routine.id)} onClose={() => setOpen(null)}
          // The switch in the sheet dozes or wakes the row's face as the row's own switch does.
          onEdit={(routine) => routine.paused !== openLine.routine.paused ? toggle(openLine, !routine.paused) : edit(openLine, routine)}
          onRunNow={() => void runNow(openLine)} onRemove={() => remove(openLine)} onChat={() => actions.chatWith(routines.threadFor(data, openLine.owner))} />
      )}
    </div>
  );
}

/**
 * How it's going in one sentence (the filters below count each state): what's on, what's due, who's next and how
 * soon; then what went wrong this week, what it cost (D69: each model call is one of the day's live replies), and runs
 * that waited for you to open the app while routines were meant to run away.
 */
function Glance({ data, lines, on, due, upNext, now, missed, onNeedsYou }: {
  data: WorkspaceData; lines: Line[]; on: number; due: number; upNext?: Line; now: Date; missed: number; onNeedsYou: () => void;
}) {
  const portraitSrc = usePortraitSrc();
  const failedWeek = lines.filter((line) => line.results.some((result) => result.outcome === "failed" && now.getTime() - Date.parse(result.at) < weekMs)).length;
  const weekReplies = data.runs.filter((result) => now.getTime() - Date.parse(result.at) < weekMs).reduce((sum, result) => sum + (result.replies ?? 0), 0);
  return (
    <div className="routine-glance">
      {upNext?.next && <img src={portraitSrc(upNext.runner)} alt="" />}
      <p><strong>{on} of {lines.length} on</strong>{due > 0 && <>, <strong className="routine-due-count">{due} due now</strong></>}.
        {upNext?.next && <> Next up: {whatOf(data, upNext)}, {routines.whenLabel(upNext.next, now)} ({untilLabel(upNext.next, now)}).</>}</p>
      {failedWeek > 0 && <Tip label="Show the routines that need you"><button type="button" className="routine-failed" onClick={onNeedsYou}>
        {failedWeek} failed this week</button></Tip>}
      {weekReplies > 0 && <Tip label="Each routine run that asks the model uses one of the day's live replies; a run with nothing new uses none.">
        <span className="routine-spend">{weekReplies} {weekReplies === 1 ? "reply" : "replies"} in the last 7 days</span></Tip>}
      {missed > 0 && <Tip label={"With routines running while you're away, each runs within 15 minutes of its time. These ran only when you opened the app, "
        + "so the server may have stopped running them."}>
        <span className="routine-missed">{missed} {missed === 1 ? "run" : "runs"} waited for you this week</span></Tip>}
    </div>
  );
}
