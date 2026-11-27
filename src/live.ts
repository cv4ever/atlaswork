// The live adapter: sends the engine's request snapshot to the agent function and reads its NDJSON stream back. When
// the function pauses for file tools (agents-design D47), it runs them on this device and sends the turns back. A chat
// reply is a job the function lands in the account itself (D76): the stream names it first and ends with the records
// it wrote, which the page takes in. The job is the truth: a reply whose connection failed but whose job the function
// holds is on its way, not failed.
import { isImage, limits } from "../supabase/functions/agent/logic.ts";
import type { ToolCall } from "../supabase/functions/agent/logic.ts";
import { warningsOf } from "../supabase/functions/agent/warnings.ts";
import type { AgentAdapter, EngineInfo } from "./atlas.ts";
import type { Backend } from "./cloud.ts";
import { locale } from "./dates.ts";
import { windowHere } from "./desktop.ts";
import { isToolUse } from "./model.ts";
import type { ToolUse } from "./model.ts";
import { recordsIn } from "./records.ts";

/**
 * Reads an NDJSON reply stream: `{progress, tool}` lines go to `onProgress`, and the last line is the result. A
 * `{job}` line goes to `onJob`. Throws on a broken stream.
 */
async function readReplyLines(response: Response, onProgress?: (text: string, tool?: string) => void, onJob?: (job: string) => void) {
  let result: Record<string, unknown> = {};
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    buffer += chunk.value;
    const complete = buffer.split("\n");
    buffer = complete.pop()!;
    for (const line of complete.filter((line) => line.trim())) {
      result = JSON.parse(line);
      if (typeof result.progress === "string") onProgress?.(result.progress, typeof result.tool === "string" ? result.tool : undefined);
      if (typeof result.job === "string") onJob?.(result.job);
    }
  }
  if (buffer.trim()) result = JSON.parse(buffer);
  return result;
}

const info: EngineInfo = { badge: "Live", maxRequest: limits.request };
const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
const isCall = (value: unknown): value is ToolCall => !!value && typeof value === "object" && "id" in value && typeof value.id === "string"
  && "function" in value && !!value.function && typeof value.function === "object" && "name" in value.function && typeof value.function.name === "string"
  && "arguments" in value.function && typeof value.function.arguments === "string";
/** What a leg says it read (D81), kept only as plain short items, at most 12 for a whole reply. */
const usedOf = (value: unknown): ToolUse[] => Array.isArray(value) ? value.filter(isToolUse).slice(0, 12) : [];
/** The model a reply says answered it, when it's a plain `{source, id}` (agents-design D45). */
const answeredBy = (value: unknown) => {
  const model = value as { source?: unknown; id?: unknown } | undefined;
  return model && typeof model === "object" && typeof model.source === "string" && typeof model.id === "string"
    ? { model: { source: model.source.slice(0, 300), id: model.id.slice(0, 200) } } : {};
};

/**
 * Agents answer through the `agent` Edge Function (docs/mvp-launch-plan.md, step 4) as the signed-in account, which
 * holds them to its plan and daily cap and answers on our model or the account's own (D16). `backend` may be any
 * endpoint that speaks the function's NDJSON (the dev ChatGPT bridge), with its own `badge`. It returns the function's
 * draft unchecked, for the engine to bind, what each leg read (`used`, D81) and the tokens the reply used across its
 * legs. A leg after a pause for files sends the turns back with the function's one-use `resume` token, so it isn't
 * counted as another reply (D47). With `backend.read`, a chat reply that fails here asks the account first whether the
 * function holds it as a job. `here` says where a chat reply is asked: the desktop app's window (`windowHere`, D78).
 */
export function createLiveEngine(backend: Pick<Backend, "agent"> & Partial<Pick<Backend, "read">>, badge = info, here = windowHere): AgentAdapter {
  /**
   * Whether the function holds the chat reply to `messageId` as a job (D76) though this connection said otherwise: one
   * created since the page asked (a minute's slack for the clocks), at work on the server or one of the account's
   * computers, or done, so it lands or fails in the account by itself. A job waiting for this device's files doesn't
   * count: only this page could resume it.
   */
  async function held(messageId: string, since: number): Promise<boolean> {
    if (!backend.read) return false;
    const after = new Date(since - 60_000).toISOString();
    const rows = await backend.read(`agent_jobs?select=state,runs_on&message_id=eq.${encodeURIComponent(messageId)}`
      + `&created_at=gte.${encodeURIComponent(after)}&order=created_at.desc&limit=1`).catch(() => []);
    const job = rows[0];
    return !!job && (job.state === "done" || (job.state === "running" || job.state === "waiting") && !String(job.runs_on).startsWith("device:"));
  }
  const answer: AgentAdapter["reply"] = async (request, snapshot, files) => {
    if (request.request.length > limits.request)
      throw new Error(`Live agents read up to ${limits.request.toLocaleString(locale)} characters at a time. Shorten your message and send it again.`);
    const failed = `${request.agent.name} couldn't answer. Try again in a moment.`;
    const plain = snapshot();
    // A chat reply asked in the desktop app's own window says so with that start's window key (D78), so what it finds on
    // this computer may be shown here; handed-off work lands later, when the person may be elsewhere, so it never does.
    const at = plain.land && !plain.land.background ? await here() : undefined;
    const body = at ? { ...plain, land: { ...plain.land!, here: at } } : plain;
    const spent = { input: 0, output: 0, peak: 0 };
    const used: ToolUse[] = [];
    let resumed: { turns: unknown[]; resume?: string } | undefined;
    for (let leg = 0; ; leg++) {
      let response: Response;
      try {
        response = await backend.agent(JSON.stringify(resumed ? { ...body, ...resumed } : body), request.signal);
      } catch (cause) {
        if (request.signal?.aborted) throw request.signal.reason;
        throw cause instanceof Error && cause.message.startsWith("You're signed out") ? cause : new Error(failed);
      }
      let result: Record<string, unknown>;
      let job = false;
      try {
        result = await readReplyLines(response, request.onProgress, () => { job = true; });
      } catch {
        if (request.signal?.aborted) throw request.signal.reason;
        // The function holds it as a job (D76): it lands in the account whatever became of this connection.
        if (job) return { text: "", onItsWay: true };
        throw new Error(response.ok ? "The connection dropped before the reply finished. Try again." : failed);
      }
      const landed = recordsIn(result.landed);
      // A failure the function landed on your message, for Retry.
      if (result.error && landed) return { text: "", landed, failed: typeof result.error === "string" ? result.error : failed };
      if (!response.ok || result.error) throw new Error(typeof result.error === "string" ? result.error : failed);
      // Handed-off work (D73): the function took it and lands the result in the account itself.
      if (result.background === true) return { text: "", background: true };
      // A chat reply the function landed (D76): the page takes in what it wrote.
      if (landed) return { text: "", landed };
      // A stream that ends without its result after the function took the job: it still lands, or fails, in the account.
      if (job && result.text === undefined && !Array.isArray(result.pending)) return { text: "", onItsWay: true };
      const usage = result.usage as { input?: unknown; output?: unknown; peak?: unknown } | undefined;
      if (usage && typeof usage === "object") {
        spent.input += count(usage.input);
        spent.output += count(usage.output);
        spent.peak = Math.max(spent.peak, count(usage.peak));
      }
      const total = usage && typeof usage === "object" ? { usage: { ...spent, ...answeredBy(result.model) } } : {};
      used.push(...usedOf(result.used));
      if (Array.isArray(result.pending) && Array.isArray(result.turns)) {
        // The function pauses at most once per file tool, so more legs than that mean something is wrong.
        if (!files || leg >= limits.fileReads || !result.pending.every(isCall)) throw new Error(failed);
        // A shrunken image (D58) goes back whole; text is cut to what the function takes.
        const read = await Promise.all(result.pending.map(async (call) => {
          const content = await files(call);
          return { role: "tool", tool_call_id: call.id, content: isImage(content) ? content : content.slice(0, limits.text) };
        }));
        resumed = { turns: [...result.turns, ...read], ...typeof result.resume === "string" ? { resume: result.resume } : {} };
        continue;
      }
      if (typeof result.text !== "string" || !result.text.trim()) throw new Error(failed);
      const warnings = warningsOf(result.warnings);
      return { text: result.text, draft: result.proposal, ...result.shown !== undefined && { shown: result.shown },
        ...result.memories !== undefined && { memories: result.memories }, ...used.length && { used: used.slice(0, 12) },
        ...warnings.length && { warnings }, ...total };
    }
  };
  return {
    about: () => badge,
    async reply(request, snapshot, files) {
      const asked = Date.now();
      try {
        return await answer(request, snapshot, files);
      } catch (cause) {
        // A Stop, a sign-out or anything but a chat reply fails as it is; a chat reply the function holds is on its way.
        if (request.signal?.aborted || !request.land || cause instanceof Error && cause.message.startsWith("You're signed out")) throw cause;
        if (await held(request.land.messageId, asked)) return { text: "", onItsWay: true };
        throw cause;
      }
    },
  };
}
