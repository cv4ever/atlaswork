// The admin page's routes (/dev/admin/, README "Admin page"), dev server only: Operations' figures from the hosted
// project and invites from its waitlist (ops.ts), Save, which writes an agent default back into its source file
// (source.ts), and the model cases (compare.ts). All sit behind the dev server's trust boundary (dev/trust.ts) with
// their own per-start token, which only the admin page is given.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import type { Plugin } from "vite";
import { createTrust, devOrigins, readBody, RequestError } from "../trust.ts";
import { runCases } from "./compare.ts";
import { invite, readOps } from "./ops.ts";
import { listingLimits } from "./limits.ts";
import { agentDefaultsIn, checkLine, checkPatch, checkTemplate, commandTextsIn, editAtlas, editCommandText, editLimit, editString, editSuggestion, limitsIn, stringsIn, suggestionNames } from "./source.ts";

/** What the page needs to know about this server: whether Workers AI can run cases, and Operations can read. */
export type AdminStatus = { workersAi: boolean; operations: boolean };

/** `texts`: the agent function's tunable words and limits; releases before 2026-11-21 held them in its logic.ts (`formerTexts`). */
const files = { suggestions: "src/suggestedAgents.ts", model: "src/model.ts", texts: "supabase/functions/agent/texts.ts" };
const formerTexts = "supabase/functions/agent/logic.ts";
/**
 * Where commands are defined: each `CommandDef` in src/commands/, and src/commands.ts, whose `commands` table held them
 * all in releases before 2026-11-21.
 */
const commandFiles = (root: string) => ["src/commands.ts",
  ...readdirSync(join(root, "src/commands")).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts")).map((name) => `src/commands/${name}`)];
/** What Save answers: which files changed, and whether a shipped default was kept for agents still holding it. */
export type Saved = { files: string[]; retired: boolean };
/** What the admin page edits besides agent defaults: a ground rule, a line template, a tool description, a command's prompt line, or a listing limit. */
export type LineKind = "rule" | "template" | "tool" | "command" | "limit";
/**
 * What differs between the source now (saved, committed or not) and the last release (the newest `release-*` tag):
 * agent defaults by field, and the wording and listing limits by name. `before` is absent for something new, or when
 * the release held it inline in other words.
 */
export type Changes = { release: { tag: string; date: string } | null;
  agents: { name: string; field: string; before?: string | number; after?: string | number; added: boolean }[];
  lines: { kind: LineKind; name: string; before?: string; after: string }[] };

/** `path` as `ref` committed it, or "" outside git or before the file existed, so nothing counts as shipped. */
function committed(root: string, path: string, ref = "HEAD") {
  try { return execFileSync("git", ["show", `${ref}:${path}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; }
}

/**
 * Saves one piece of wording or a listing limit: `{kind, name, text}` (`value` for a limit). A tool description goes
 * to texts.ts's `toolTexts` for a built-in tool, else to its command's file in src/commands/.
 */
function saveLine(root: string, body: string): Saved {
  const { kind, name, text, value } = JSON.parse(body || "{}") as { kind?: LineKind; name?: unknown; text?: unknown; value?: unknown };
  if (typeof name !== "string" || !["rule", "template", "tool", "command", "limit"].includes(kind ?? "")) throw new RequestError(400, "Say which line to save.");
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const logic = read(files.texts);
  const builtIn = kind === "tool" && name in stringsIn(logic, "toolTexts");
  const field = kind === "tool" ? "description" : "prompt";
  const path = kind === "command" || (kind === "tool" && !builtIn)
    ? commandFiles(root).find((file) => name in commandTextsIn(read(file), field)) ?? "src/commands.ts" : files.texts;
  const before = read(path);
  const after = kind === "rule" ? editString(before, "groundRules", name, checkLine(text))
    : kind === "template" ? editString(before, "lineTemplates", name, checkTemplate(name, text))
    : kind === "limit" ? editLimit(before, name, value)
    : builtIn ? editString(before, "toolTexts", name, checkLine(text))
    : editCommandText(before, name, field, checkLine(text));
  if (after === before) return { files: [], retired: false };
  writeFileSync(join(root, path), after);
  return { files: [path], retired: false };
}

/** Listing limits that were fixed in src/agentRequest.ts before they became settings (2026-11-15), so a release without them held these. */
const formerLimits: Record<string, number> = { pages: 40, pageLine: 600 };

function changes(root: string): Changes {
  const now = (path: string) => readFileSync(join(root, path), "utf8");
  let tag = "", date = "";
  try {
    [tag = "", date = ""] = execFileSync("git", ["tag", "--list", "release-*", "--sort=-creatordate", "--format=%(refname:short) %(creatordate:iso-strict)"],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n")[0].trim().split(" ");
  } catch { /* no git: nothing was released from here */ }
  if (!tag) return { release: null, agents: [], lines: [] };
  const then = (path: string) => committed(root, path, tag);
  const agents: Changes["agents"] = [];
  const before = agentDefaultsIn(then(files.suggestions), then(files.model)), after = agentDefaultsIn(now(files.suggestions), now(files.model));
  for (const [name, fields] of Object.entries(after))
    for (const [field, value] of Object.entries(fields)) if (before[name]?.[field] !== value) agents.push({ name, field, before: before[name]?.[field], after: value, added: !before[name] });
  const lines: Changes["lines"] = [];
  const releasedLogic = then(files.texts) || then(formerTexts), currentLogic = now(files.texts);
  // A release from before these tables held the same lines inline, and the next release holds the tables, so this only
  // matters once: a rule or tool description counts as released when its exact wording was there; a template, whose
  // line was split around code, when every word of its fixed text was.
  const inline = (kind: "rule" | "template" | "tool", text: string) => kind !== "template" ? releasedLogic.includes(JSON.stringify(text))
    : (text.replace(/\{\w+\}/g, " ").match(/\p{L}{4,}/gu) ?? []).every((word) => releasedLogic.includes(word));
  for (const [kind, table] of [["rule", "groundRules"], ["template", "lineTemplates"], ["tool", "toolTexts"]] as const) {
    const released = stringsIn(releasedLogic, table);
    for (const [name, text] of Object.entries(stringsIn(currentLogic, table))) {
      const was = released[name] ?? (Object.keys(released).length || !inline(kind, text) ? undefined : text);
      if (was !== text) lines.push({ kind, name, before: was, after: text });
    }
  }
  for (const [kind, field] of [["command", "prompt"], ["tool", "description"]] as const) {
    const texts = (read: (path: string) => string) => Object.assign({}, ...commandFiles(root).map((path) => commandTextsIn(read(path), field))) as Record<string, string>;
    const released = texts(then);
    for (const [name, text] of Object.entries(texts(now)))
      if (released[name] !== text) lines.push({ kind, name, before: released[name], after: text });
  }
  const releasedLimits = limitsIn(releasedLogic), currentLimits = limitsIn(currentLogic);
  for (const name of Object.keys(listingLimits)) {
    const was = releasedLimits[name] ?? formerLimits[name];
    if (was !== currentLimits[name]) lines.push({ kind: "limit", name, before: was === undefined ? undefined : String(was), after: String(currentLimits[name]) });
  }
  return { release: { tag, date }, agents, lines };
}

function save(root: string, body: string): Saved {
  const { name, patch: raw } = JSON.parse(body || "{}") as { name?: unknown; patch?: unknown };
  if (typeof name !== "string") throw new RequestError(400, "Say which agent to save.");
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const suggestions = read(files.suggestions);
  if (name === "Atlas") {
    const patch = checkPatch(raw, true);
    if (!Object.keys(patch).length) throw new RequestError(400, "Nothing to save.");
    const model = read(files.model);
    const next = editAtlas(model, committed(root, files.model), suggestions, patch);
    const changed = [...next.model === model ? [] : [files.model], ...next.suggestions === suggestions ? [] : [files.suggestions]];
    if (changed.includes(files.model)) writeFileSync(join(root, files.model), next.model);
    if (changed.includes(files.suggestions)) writeFileSync(join(root, files.suggestions), next.suggestions);
    return { files: changed, retired: next.retired };
  }
  if (!suggestionNames(suggestions).includes(name)) throw new RequestError(404, `${name} isn't one of the suggested agents.`);
  const next = editSuggestion(suggestions, committed(root, files.suggestions), name, checkPatch(raw, false));
  if (next.text !== suggestions) writeFileSync(join(root, files.suggestions), next.text);
  return { files: next.text === suggestions ? [] : [files.suggestions], retired: next.retired };
}

/** Registers the routes in `vite serve` only; `logins` are the Tailscale accounts allowed through `tailscale serve`. */
export function adminPlugin(logins: string[], tailnetHost?: string): Plugin {
  const token = randomBytes(32).toString("hex");
  return {
    name: "workbench-admin",
    apply: "serve",
    transformIndexHtml: (_html, context) => context.path.startsWith("/dev/admin/")
      ? [{ tag: "meta", attrs: { name: "workbench-admin-token", content: token }, injectTo: "head" }] : undefined,
    configureServer(server) {
      const root = server.config.root;
      const trust = createTrust({ origins: devOrigins(server.config.server.port ?? 5173, tailnetHost), token, logins,
        header: "x-admin-token", refusal: "Reload the admin page and try again." });
      const handle = async (req: IncomingMessage, res: ServerResponse, route: string) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        try {
          trust(req);
          const body = await readBody(req, 64_000);
          const base = process.env.VITE_SUPABASE_URL ?? "", key = process.env.WORKBENCH_SUPABASE_SECRET_KEY;
          if (route === "/api/admin/status")
            return void res.end(JSON.stringify({ workersAi: !!process.env.WORKERS_AI_TOKEN, operations: !!(base && key) } satisfies AdminStatus));
          if (route === "/api/admin/ops") return void res.end(JSON.stringify(await readOps(base, key)));
          if (route === "/api/admin/invite") {
            const { email } = JSON.parse(body || "{}") as { email?: unknown };
            if (typeof email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new RequestError(400, "That isn't an email address.");
            return void res.end(JSON.stringify(await invite(base, key, email)));
          }
          if (route === "/api/admin/agent") return void res.end(JSON.stringify(save(root, body)));
          if (route === "/api/admin/line") return void res.end(JSON.stringify(saveLine(root, body)));
          if (route === "/api/admin/changes") return void res.end(JSON.stringify(changes(root)));
          if (route === "/api/admin/cases") return await runCases(root, body, res);
          throw new RequestError(404, "Unknown admin route.");
        } catch (cause) {
          res.statusCode = cause instanceof RequestError ? cause.status : 400;
          res.end(JSON.stringify({ error: cause instanceof Error ? cause.message : "The admin route failed." }));
        }
      };
      server.middlewares.use((req, res, next) => {
        const route = req.url?.split("?", 1)[0] ?? "";
        if (!route.startsWith("/api/admin/")) return next();
        void handle(req, res, route);
      });
    },
  };
}
