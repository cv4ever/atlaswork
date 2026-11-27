// The Agents section's two ways to see a draft behave before saving it. Try it sends one message, with the prompt the
// page shows, through the dev ChatGPT plan bridge (dev/chatgpt/server.ts), and shows the reply, its proposal and what it
// remembered. Cases runs the model comparison's cases that cover the agent (compare.ts here, dev/compare/) on the
// draft, against that model's saved baseline. Both use Carlos's plan or Workers AI, never anyone's account.
import { useEffect, useState } from "react";
import { Check, CircleAlert, Play, Send, X } from "lucide-react";
import { keyOf } from "../compare/cases.ts";
import type { CaseResult } from "../compare/compare.ts";
import { post, stream } from "./api.ts";
import { casesFor, requestFor } from "./catalogue.ts";
import type { Draft, Entry, Sample, Seed, Wording } from "./catalogue.ts";
import type { CompareModel } from "./compare.ts";
import type { AdminStatus } from "./server.ts";

type Reply = { message: string; draft: boolean; steps: string[]; text?: string; proposal?: unknown; memories?: { text: string }[];
  usage?: { input: number; output: number }; model?: { id: string }; ms?: number; error?: string };
type Line = { progress?: string; text?: string; proposal?: unknown; memories?: { text: string }[]; usage?: Reply["usage"]; model?: Reply["model"]; pending?: unknown; error?: string };
type PlanStatus = { connected?: boolean; plan?: boolean; email?: string; model?: string };
const number = new Intl.NumberFormat("en");

export function TryIt({ entry, draft, dirty: agentDirty, seed, sample, wording }: { entry: Entry; draft: Draft; dirty: boolean; seed: Seed; sample: Sample; wording: Wording }) {
  // Unsaved commands' prompt lines and descriptions go with the request; unsaved ground rules, templates and built-in
  // tool descriptions can't (catalogue.ts, `requestFor`).
  const dirty = agentDirty || Object.keys(wording.commands).length > 0 || Object.keys(wording.tools).length > 0;
  const [plan, setPlan] = useState<PlanStatus | null>(null);
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<Reply[]>([]);
  const busy = replies[0] && !replies[0].text && !replies[0].error;
  useEffect(() => { post<PlanStatus>("/api/chatgpt/status", {}, "bridge").then(setPlan, () => setPlan({})); }, []);
  const picks = casesFor(entry).filter(({ item }) => item.request && !item.history && !item.askedBy).slice(0, 4).map(({ item }) => item.request);

  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    const started = performance.now();
    const update = (patch: Partial<Reply>) => setReplies(([first, ...rest]) => [{ ...first, ...patch }, ...rest]);
    setReplies((now) => [{ message: text, draft: dirty, steps: [] }, ...now]);
    try {
      await stream<Line>({ route: "/api/chatgpt/agent", via: "bridge" }, requestFor(entry, draft, seed, sample, wording, text), (line) => {
        if (line.progress) setReplies(([first, ...rest]) => [{ ...first, steps: [...first.steps, line.progress!] }, ...rest]);
        else if (line.error) update({ error: line.error });
        else if (line.pending) update({ error: "It wanted to read linked files, which the admin page doesn't link." });
        else update({ text: line.text ?? "", proposal: line.proposal, memories: line.memories, usage: line.usage, model: line.model, ms: performance.now() - started });
      });
    } catch (cause) {
      update({ error: cause instanceof Error ? cause.message : "The bridge failed." });
    }
  };

  if (plan && !plan.plan) return (
    <p className="admin-note">Try it answers on your ChatGPT plan through this dev server. Sign in from the app first: Settings → AI model → ChatGPT plan{plan.connected ? ", and allow plan use" : ""}.</p>
  );
  return (
    <section className="admin-try" aria-label="Try a message">
      <p className="admin-lede">One message to {entry.suggestion.name} from {sample.name.trim() || "the sample person"} with {dirty ? "your unsaved draft" : "the saved defaults"}, in the {seed === "demo" ? "demo workspace" : "new person's workspace"}, on {plan?.model ?? "your ChatGPT plan"}. Nothing is applied: proposals show as drafts.</p>
      <form className="admin-try-form" onSubmit={(event) => { event.preventDefault(); void ask(message); }}>
        <textarea rows={2} value={message} maxLength={4000} placeholder={`Ask ${entry.suggestion.name} something`} aria-label="Message"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void ask(message); } }} />
        <button type="submit" className="primary-button" disabled={!message.trim() || !!busy}><Send size={16} aria-hidden="true" />Send</button>
      </form>
      {picks.length > 0 && <div className="admin-picks">{picks.map((pick) => (
        <button key={pick} type="button" className="quiet-button" disabled={!!busy} onClick={() => { setMessage(pick); void ask(pick); }}>{pick}</button>))}</div>}
      <ol className="admin-replies">
        {replies.map((reply, index) => (
          <li key={replies.length - index}>
            <p className="admin-asked"><span>{reply.draft ? "Draft" : "Saved"}</span>{reply.message}</p>
            {reply.error ? <p className="admin-status" data-error>{reply.error}</p>
              : reply.text === undefined ? <p className="admin-status" role="status">{reply.steps.at(-1) ?? "Thinking…"}</p>
              : <>
                <p className="admin-said">{reply.text}</p>
                {reply.steps.length > 0 && <p className="admin-status">Used: {[...new Set(reply.steps)].join(", ")}</p>}
                {reply.proposal !== undefined && reply.proposal !== null && <details open><summary>Proposal</summary><pre>{JSON.stringify(reply.proposal, null, 2)}</pre></details>}
                {!!reply.memories?.length && <p className="admin-status">Remembered: {reply.memories.map((memory) => memory.text).join("; ")}</p>}
                <p className="admin-status">{[reply.model?.id, reply.ms && `${(reply.ms / 1000).toFixed(1)} s`,
                  reply.usage && `${number.format(reply.usage.input)} tokens in, ${number.format(reply.usage.output)} out`].filter(Boolean).join(" · ")}</p>
              </>}
          </li>
        ))}
      </ol>
    </section>
  );
}

type Run = { done?: { results: CaseResult[]; baseline: Record<string, Record<string, { pass: number; runs: number }>> }; progress: string[]; error?: string };
const side = (score?: { pass: number; runs: number }) => !score ? "new" : score.pass === score.runs ? "passed" : score.pass === 0 ? "failed" : "varied";

export function Cases({ entry, draft, dirty }: { entry: Entry; draft: Draft; dirty: boolean }) {
  const covered = casesFor(entry);
  const [status, setStatus] = useState<AdminStatus | null>(null);
  const [model, setModel] = useState<CompareModel>("chatgpt");
  const [run, setRun] = useState<Run | null>(null);
  useEffect(() => { post<AdminStatus>("/api/admin/status").then(setStatus, () => setStatus(null)); }, []);
  const running = run && !run.done && !run.error;

  const start = async () => {
    setRun({ progress: [] });
    const body = { cases: covered.map(({ number }) => number), model,
      ...dirty && { draft: { name: entry.suggestion.name, role: draft.role, instructions: draft.instructions, writeMode: draft.writeMode, warmth: draft.warmth ?? null } } };
    try {
      await stream<{ progress?: string; done?: Run["done"]; error?: string }>({ route: "/api/admin/cases" }, body, (line) => setRun((now) => ({
        ...now!, ...line.progress && { progress: [...now!.progress, line.progress] }, ...line.done && { done: line.done }, ...line.error && { error: line.error } })));
    } catch (cause) {
      setRun((now) => ({ ...now!, error: cause instanceof Error ? cause.message : "The comparison failed." }));
    }
  };

  if (!covered.length) return <p className="admin-note">No comparison case covers {entry.kind === "template" ? "the steward template" : entry.suggestion.name} yet. Add one to <code>dev/compare/cases.ts</code>.</p>;
  const results = run?.done?.results ?? [];
  const passed = results.filter((result) => result.pass).length;
  const baseline = run?.done?.baseline[model] ?? {};
  return (
    <section className="admin-cases" aria-label="Model cases">
      <p className="admin-lede">{covered.length === 1 ? "The one case" : `The ${covered.length} cases`} of <code>dev/compare</code> that {covered.length === 1 ? "runs" : "run"} {entry.suggestion.name}, with {dirty ? "your unsaved draft" : "the saved defaults"}, judged as the comparison judges them and set against that model&rsquo;s saved baseline. Save a new baseline from the command line (<code>--save</code>).</p>
      <div className="admin-cases-bar">
        <div className="segmented-control" role="radiogroup" aria-label="Model">
          <button type="button" role="radio" aria-checked={model === "chatgpt"} onClick={() => setModel("chatgpt")}>ChatGPT plan</button>
          <button type="button" role="radio" aria-checked={model === "workers-ai"} disabled={!status?.workersAi} onClick={() => setModel("workers-ai")}
            title={status?.workersAi ? "Spends the daily allocation production shares" : "Start the dev server with WORKERS_AI_TOKEN to use it"}>Workers AI</button>
        </div>
        <button type="button" className="primary-button" disabled={!!running} onClick={() => void start()}><Play size={16} aria-hidden="true" />{running ? "Running…" : `Run ${covered.length === 1 ? "it" : `all ${covered.length}`}`}</button>
        {running && <span className="admin-status" role="status">{run.progress.length} of {covered.length} done</span>}
        {run?.done && <span className="admin-status" role="status"><b>{passed} of {results.length}</b> pass; {Object.keys(baseline).length
          ? `the baseline passed ${covered.filter(({ item }) => side(baseline[keyOf(item)]) === "passed").length}.` : `no ${model === "chatgpt" ? "ChatGPT plan" : "Workers AI"} baseline is saved yet.`}
          {results.some((result) => result.input) && ` A reply read about ${number.format(Math.round(results.reduce((sum, result) => sum + (result.input ?? 0), 0) / results.length))} tokens over all its calls${
            results.some((result) => result.cached) ? `, ${Math.round(100 * results.reduce((sum, result) => sum + (result.cached ?? 0), 0) / results.reduce((sum, result) => sum + (result.input ?? 0), 0))}% from cache` : ""}.`}</span>}
      </div>
      {run?.error && <p className="admin-status" data-error>{run.error}</p>}
      <ol className="admin-case-list">
        {covered.map(({ number, item }) => {
          const result = results.find((each) => each.case === number);
          const before = side(result && baseline[result.key]);
          return (
            <li key={number} data-result={result ? result.pass ? "pass" : "fail" : undefined}>
              <span className="admin-case-mark" aria-hidden="true">{result ? result.pass ? <Check size={14} /> : <X size={14} /> : <CircleAlert size={14} />}</span>
              <div>
                <p><b>#{number}</b> {item.routine ? `${item.routine.kind} routine for ${item.routine.owner.id}` : item.request}
                  {item.history && <small> after {item.history.length} earlier turns</small>}{item.askedBy && <small> asked by {item.askedBy}</small>}</p>
                {result && <>
                  <small>{result.pass ? "Passes" : result.misses.join("; ")}{result && ` · baseline ${before}`}{before !== "new" && (before === "passed") !== result.pass && <b> · changed side</b>}</small>
                  {result.text && <details><summary>Reply</summary><p className="admin-said">{result.text}</p>{result.draft && <pre>{JSON.stringify(result.draft, null, 2)}</pre>}</details>}
                </>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
