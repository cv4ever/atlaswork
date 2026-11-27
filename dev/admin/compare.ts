// The admin page's model cases (/dev/admin/, README "Admin page"): runs the comparison's cases that cover one agent
// (dev/compare/compare.ts) as a child process, with the agent's unsaved draft when there is one, and streams NDJSON
// back: `{progress}` per case, then `{done: {results, baseline}}` or `{error}`. One run at a time; closing the page stops it.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cases } from "../compare/cases.ts";
import { RequestError } from "../trust.ts";

/** Models the page may run on: Carlos's ChatGPT plan (free), and Workers AI when this server has its token (the allocation production shares). */
export const compareModels = { chatgpt: "ChatGPT plan", "workers-ai": "Workers AI" } as const;
export type CompareModel = keyof typeof compareModels;
type Draft = { name: string; role: string; instructions: string; writeMode: "full" | "propose"; warmth: number | null };
let running = false;

function checked(body: string): { picked: number[]; model: CompareModel; draft?: Draft } {
  const { cases: picked, model, draft } = JSON.parse(body || "{}") as { cases?: unknown; model?: unknown; draft?: Draft };
  if (!Array.isArray(picked) || !picked.length || picked.length > 30 || !picked.every((index) => Number.isInteger(index) && index >= 1 && index <= cases.length))
    throw new RequestError(400, "Pick between 1 and 30 cases.");
  if (typeof model !== "string" || !(model in compareModels)) throw new RequestError(400, "Pick the ChatGPT plan or Workers AI.");
  if (model === "workers-ai" && !process.env.WORKERS_AI_TOKEN) throw new RequestError(400, "This dev server has no WORKERS_AI_TOKEN.");
  if (draft !== undefined && !(typeof draft === "object" && typeof draft.name === "string" && typeof draft.role === "string"
    && typeof draft.instructions === "string" && (draft.writeMode === "full" || draft.writeMode === "propose")
    && (draft.warmth === null || (Number.isInteger(draft.warmth) && draft.warmth >= 0 && draft.warmth <= 4))))
    throw new RequestError(400, "That draft isn't one the page makes.");
  return { picked: picked as number[], model: model as CompareModel, draft };
}

export async function runCases(root: string, body: string, res: ServerResponse) {
  const { picked, model, draft } = checked(body);
  if (running) throw new RequestError(409, "A comparison is already running. Wait for it, or close the page that started it.");
  running = true;
  const dir = mkdtempSync(join(tmpdir(), "wb-admin-cases-"));
  const send = (line: unknown) => { if (!res.writableEnded) res.write(`${JSON.stringify(line)}\n`); };
  let stop = () => {};
  try {
    const out = join(dir, "results.json");
    if (draft) writeFileSync(join(dir, "draft.json"), JSON.stringify(draft));
    const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", "dev/compare/compare.ts", model, `--cases=${picked.join(",")}`, `--json=${out}`,
      ...draft ? [`--draft=${join(dir, "draft.json")}`] : []], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    stop = () => { if (!res.writableEnded) child.kill(); };
    res.on("close", stop);
    // The comparison prints one `i/N model ms` line per case to stderr; the rest is kept for an error message.
    let tail = "", partial = "";
    child.stdout.resume();
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
      tail = (tail + chunk).slice(-2000);
      const lines = (partial + chunk).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) if (/^\d+\/\d+ /.test(line)) send({ progress: line.trim() });
    });
    const [code] = await once(child, "close") as [number | null];
    if (code === 0 && existsSync(out)) send({ done: JSON.parse(readFileSync(out, "utf8")) });
    else send({ error: `The comparison stopped (exit ${code}): ${tail.trim().split("\n").slice(-3).join(" ") || "no output"}` });
  } catch (cause) {
    send({ error: `The comparison couldn't start: ${cause instanceof Error ? cause.message : cause}` });
  } finally {
    running = false;
    res.off("close", stop);
    rmSync(dir, { recursive: true, force: true });
    res.end();
  }
}
