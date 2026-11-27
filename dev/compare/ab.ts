// Two versions of the agents on the same cases (agents-design D66): each side is a checkout, whose own compare.ts runs,
// or a `--json` file a run already wrote. Cases whose result differs are asked again on both sides (`--recheck`, 4
// runs unless set), since one run varies by a case or two; what's left differing is the change, not the noise.
//   node --experimental-strip-types dev/compare/ab.ts <before> <after> [chatgpt|workers-ai|…] [--cases=…] [--runs=…] [--recheck=4]
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CaseResult } from "./compare.ts";

const args = process.argv.slice(2);
const option = (name: string) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const [before, after, model = "chatgpt"] = args.filter((arg) => !arg.startsWith("--"));
if (!before || !after) throw new Error("Usage: ab.ts <before> <after> [model] [--cases=…] [--runs=…] [--recheck=4]");
const recheck = Number(option("recheck") ?? 4);
const work = mkdtempSync(join(tmpdir(), "wb-ab-"));

/** The results a `--json` file holds; compare.ts wrote it, so its shape is ours. */
function readResults(file: string): CaseResult[] {
  const written: { results: CaseResult[] } = JSON.parse(readFileSync(file, "utf8"));
  return written.results;
}

/** One side's results for `cases` (all when unset): read from a results file, or run in that checkout. */
async function resultsOf(side: string, label: string, cases?: string, runs?: string): Promise<CaseResult[]> {
  if (existsSync(side) && statSync(side).isFile()) {
    const all = readResults(side).filter((result) => result.model === model);
    const wanted = cases ? new Set(cases.split(",").map(Number)) : undefined;
    return wanted ? all.filter((result) => wanted.has(result.case)) : all;
  }
  const out = join(work, `${label}.json`);
  const flags = [...cases ? [`--cases=${cases}`] : [], ...runs ? [`--runs=${runs}`] : [], `--json=${out}`];
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const child = spawn(process.execPath, ["--experimental-strip-types", "dev/compare/compare.ts", model, ...flags], { cwd: side, stdio: ["ignore", "ignore", "inherit"] });
  child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${side}: compare.ts exited with ${code}`)));
  await promise;
  return readResults(out);
}

/** A case's results over every run of one side: passes, runs and the input tokens they read. */
type Tally = { pass: number; runs: number; input: number; key: string };
function tally(results: CaseResult[], into: Map<number, Tally> = new Map()) {
  for (const result of results) {
    const entry = into.get(result.case) ?? { pass: 0, runs: 0, input: 0, key: result.key };
    entry.pass += result.pass ? 1 : 0;
    entry.runs++;
    entry.input += result.input ?? 0;
    into.set(result.case, entry);
  }
  return into;
}

const cases = option("cases"), runs = option("runs");
const [first, second] = await Promise.all([resultsOf(before, "before", cases, runs), resultsOf(after, "after", cases, runs)]);
const a = tally(first), b = tally(second);
const rate = (entry?: Tally) => entry ? entry.pass / entry.runs : 0;
const differing = [...b.keys()].filter((key) => rate(a.get(key)) !== rate(b.get(key)));
if (differing.length && recheck > 0) {
  console.error(`Asking ${differing.length} differing cases again, ${recheck} runs each side`);
  const again = differing.join(",");
  // A results file can't be asked again: its side keeps the runs it has.
  const rerun = (side: string, label: string) => existsSync(side) && statSync(side).isFile() ? Promise.resolve([]) : resultsOf(side, label, again, String(recheck));
  const [more, moreAfter] = await Promise.all([rerun(before, "before-again"), rerun(after, "after-again")]);
  tally(more, a);
  tally(moreAfter, b);
}
const mean = (results: CaseResult[]) => Math.round(results.reduce((sum, result) => sum + (result.input ?? 0), 0) / (results.length || 1));
const right = (results: CaseResult[]) => results.filter((result) => result.pass).length;
console.log(`| | Right (first run) | Tokens in a reply |\n|---|---|---|\n| before | ${right(first)}/${first.length} | ${mean(first)} |\n| after | ${right(second)}/${second.length} | ${mean(second)} (${Math.round(100 * (mean(second) / (mean(first) || 1) - 1))}%) |`);
// A case counts as changed only when its pass rate moved by half or more over all its runs.
const changed = differing.filter((key) => Math.abs(rate(a.get(key)) - rate(b.get(key))) >= 0.5);
console.log(`\nDiffering after the first run: ${differing.length}; still apart by half or more: ${changed.length}`);
for (const key of differing) {
  const was = a.get(key), now = b.get(key)!;
  console.log(`${changed.includes(key) ? "CHANGED" : "noise  "} ${key} ${was ? `${was.pass}/${was.runs}` : "-"} → ${now.pass}/${now.runs} · ${now.key}`);
}
