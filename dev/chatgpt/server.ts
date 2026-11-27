// Dev server only (README.md here): agents answer on Carlos's ChatGPT plan through this computer. The browser never
// sees a token; it calls these routes with the page's per-start token, and this process signs in, refreshes and calls
// OpenAI's Responses API through the same agent loop as the Edge Function.
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { AgentError, limits, parseSnapshot, parseTest, runAgent } from "../../supabase/functions/agent/logic.ts";
import { isToolUse } from "../../src/model.ts";
import { completeOnResponses, efforts } from "../../supabase/functions/agent/responses.ts";
import type { Effort } from "../../supabase/functions/agent/responses.ts";
import type { Model, Outside } from "../../supabase/functions/agent/logic.ts";
import { withCalendar } from "../../supabase/functions/agent/calendar.ts";
import { createChatGptAuth, SignInError } from "./oauth.ts";
import type { ChatGptAuth } from "./oauth.ts";
import { createTrust, devOrigins, readBody, RequestError } from "../trust.ts";

/** A ChatGPT model the signed-in account may use, in OpenAI's order. */
export type PlanModel = { slug: string; name: string };

async function planModels(auth: ChatGptAuth): Promise<PlanModel[]> {
  const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${await auth.accessToken()}` } });
  if (!response.ok) throw new RequestError(502, `ChatGPT didn't list its models (HTTP ${response.status}).`);
  const { models = [] } = await response.json() as { models?: { slug: string; display_name?: string; visibility?: string }[] };
  return models.filter((model) => model.visibility === "list").map((model) => ({ slug: model.slug, name: model.display_name ?? model.slug }));
}

/**
 * The HTTP trust boundary is `createTrust` (dev/trust.ts). The OAuth callback is a top-level GET on 127.0.0.1,
 * checked by its one-time `state` instead.
 */
export function createChatGptHandler({ auth, origins, token, logins, port }: { auth: ChatGptAuth; origins: string[]; token: string; logins: string[]; port: number }) {
  const trust = createTrust({ origins, token, logins, header: "x-workbench-token", refusal: "Reload Atlaswork and try again from its own page." });
  const redirect = `http://127.0.0.1:${port}/auth/callback`;

  async function callback(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    let message: string;
    try {
      const status = await auth.finish(new URL(req.url!, redirect).searchParams);
      message = status.plan ? `Connected as ${status.email ?? "your ChatGPT account"}. Go back to Atlaswork; you can close this tab.`
        : "Signed in, but ChatGPT plan use wasn't allowed. Go back to Atlaswork and continue with ChatGPT again to allow it.";
    } catch (cause) {
      res.statusCode = 400;
      message = cause instanceof SignInError ? cause.message : "Signing in to ChatGPT failed. Go back to Atlaswork and try again.";
    }
    const text = message.replace(/[&<>]/g, (character) => `&#${character.charCodeAt(0)};`);
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Atlaswork · ChatGPT</title><p style="font:16px system-ui;margin:3rem auto;max-width:32rem">${text}</p>`);
  }

  /**
   * The calendar tools (agents-design D74) for this reply: run by the hosted connectors function as the signed-in
   * account whose session the page sent, since only the server holds the Google grant. Without a session they go.
   */
  const calendarThrough = (session: string, zone: string, today: string, calendars?: string[]): Outside => async (toolCall) => {
    const url = process.env.VITE_SUPABASE_URL, key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const response = await fetch(`${url}/functions/v1/connectors`, { method: "POST",
      headers: { apikey: key ?? "", Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      body: JSON.stringify({ tool: { name: toolCall.function.name, arguments: toolCall.function.arguments }, zone, today, ...calendars && { calendars } }) }).catch(() => null);
    const answer: unknown = await response?.json().catch(() => null);
    if (!answer || typeof answer !== "object" || !("result" in answer) || typeof answer.result !== "string")
      return { text: "Google Calendar didn't answer. Say you couldn't read it this time.", used: { tool: toolCall.function.name, failed: "unanswered" } };
    return { text: answer.result, ..."used" in answer && isToolUse(answer.used) && { used: answer.used } };
  };

  /** One reply through the agent loop, streamed as the Edge Function does: `{progress, tool}` lines, then `{text, proposal, used}`, `{pending, turns, used}` (D47) or `{error}`. */
  async function reply(text: string, res: ServerResponse, signal: AbortSignal, session?: string) {
    const test = parseTest(text);
    const snapshot = test ? null : parseSnapshot(text);
    if (!test && !snapshot) throw new RequestError(400, "That request was too large or malformed.");
    // An agent's own plan model and effort (agents-design D44) win; OpenAI refuses a model the plan doesn't offer, with its own message.
    const chosen = snapshot ?? test!;
    const model = (chosen.model?.source === "chatgpt" ? chosen.model.id : undefined) ?? auth.status().model ?? (await planModels(auth))[0]?.slug;
    if (!model) throw new RequestError(502, "ChatGPT offered no model for this account.");
    const effort = chosen.effort ?? auth.status().effort;
    const call: Model = async (messages, tools) => completeOnResponses({ key: await auth.accessToken(), model, effort, plan: true }, messages, tools, signal);
    if (test) {
      const started = Date.now();
      const completion = await call([{ role: "user", content: "Reply with the single word OK." }], undefined);
      res.end(JSON.stringify({ text: completion.text.trim().slice(0, 200), ms: Date.now() - started, model }));
      return;
    }
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    const send = (line: unknown) => { if (!signal.aborted) res.write(`${JSON.stringify(line)}\n`); };
    try {
      // The plan's models take images, so the same model describes them (agents-design D58).
      const { asked, outside } = await withCalendar(snapshot!, async () => session && process.env.VITE_SUPABASE_URL
        ? calendarThrough(session, snapshot!.zone ?? snapshot!.land?.zone ?? "UTC", snapshot!.today, snapshot!.calendars) : null);
      const result = await runAgent(asked, call, (progress, tool) => send({ progress, ...tool && { tool } }), call, outside ? { outside } : {});
      const spent = { calls: result.calls, usage: result.usage, model: { source: "chatgpt", id: model } };
      send("pending" in result ? { pending: result.pending, turns: result.turns, used: result.used, ...spent }
        : { text: result.text, proposal: result.draft, shown: result.shown, memories: result.memories, used: result.used, ...spent });
    } catch (cause) {
      send({ error: `${snapshot!.agent.name} couldn't answer: ${cause instanceof AgentError || cause instanceof SignInError ? cause.message : "something went wrong."}` });
    }
    res.end();
  }

  return async function handle(req: IncomingMessage, res: ServerResponse, route: string) {
    if (route === "/auth/callback") return callback(req, res);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    const controller = new AbortController();
    const disconnect = () => { if (!res.writableEnded) controller.abort(); };
    try {
      if (req.method !== "POST") res.setHeader("Allow", "POST");
      const { forwarded } = trust(req);
      const text = await readBody(req, limits.body);
      res.on("close", disconnect);
      if (route === "/api/chatgpt/status") return void res.end(JSON.stringify(auth.status()));
      if (route === "/api/chatgpt/login") {
        // The callback returns to 127.0.0.1, which only reaches the browser on this computer.
        if (forwarded) throw new RequestError(409, "Continue with ChatGPT from this computer's browser, at 127.0.0.1.");
        return void res.end(JSON.stringify({ url: auth.begin(redirect) }));
      }
      if (route === "/api/chatgpt/logout") return void res.end(JSON.stringify(await auth.signOut()));
      if (route === "/api/chatgpt/welcome") { auth.welcome(); return void res.end("{}"); }
      if (route === "/api/chatgpt/models") return void res.end(JSON.stringify(await planModels(auth)));
      if (route === "/api/chatgpt/model") {
        const { model, effort } = JSON.parse(text || "{}") as { model?: unknown; effort?: unknown };
        if (model !== undefined && (typeof model !== "string" || !(await planModels(auth)).some((item) => item.slug === model)))
          throw new RequestError(400, "Pick a model from the list.");
        if (effort !== undefined && !efforts.includes(effort as Effort)) throw new RequestError(400, "Pick Fast, Balanced or Thorough.");
        auth.choose({ ...model ? { model: model as string } : {}, ...effort ? { effort: effort as Effort } : {} });
        return void res.end(JSON.stringify(auth.status()));
      }
      if (route === "/api/chatgpt/agent") {
        const session = req.headers["x-atlaswork-session"];
        return await reply(text, res, controller.signal, typeof session === "string" && session.length < 4000 ? session : undefined);
      }
      throw new RequestError(404, "Unknown ChatGPT route.");
    } catch (cause) {
      if (!res.destroyed && !res.headersSent) {
        res.statusCode = cause instanceof RequestError ? cause.status : cause instanceof SignInError ? 401 : 502;
        res.end(JSON.stringify({ error: cause instanceof RequestError || cause instanceof SignInError || cause instanceof AgentError ? cause.message : "The ChatGPT bridge failed." }));
      } else if (!res.writableEnded) res.end();
      req.resume();
    } finally {
      res.off("close", disconnect);
    }
  };
}

/** Registers the routes in `vite serve` only; `logins` are the Tailscale accounts allowed through `tailscale serve`. */
export function chatGptPlugin(logins: string[], tailnetHost?: string): Plugin {
  const token = randomBytes(32).toString("hex");
  return {
    name: "workbench-chatgpt-plan",
    apply: "serve",
    transformIndexHtml: () => [{ tag: "meta", attrs: { name: "workbench-chatgpt-token", content: token }, injectTo: "head" }],
    configureServer(server) {
      const port = server.config.server.port ?? 5173;
      const handle = createChatGptHandler({ auth: createChatGptAuth(), token, logins, port,
        origins: devOrigins(port, tailnetHost) });
      server.middlewares.use((req, res, next) => {
        const route = req.url?.split("?", 1)[0] ?? "";
        if (route !== "/auth/callback" && !route.startsWith("/api/chatgpt/")) return next();
        void handle(req, res, route);
      });
    },
  };
}
