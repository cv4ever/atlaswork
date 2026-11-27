import assert from "node:assert/strict";
import { appOn, runTidy } from "./tidy.ts";
import type { Server } from "./job.ts";
import type { TidyOutcome } from "../../src/tidying.ts";

/** The agent function, keeping only what the helper reports for a tidy. */
function server() {
  const reported: TidyOutcome[] = [];
  const none = () => Promise.reject(new Error("a tidy job asks nothing else"));
  const stub: Server = { model: none, see: none, outside: none, progress: none, land: none, fail: none, search: none, move: none,
    tidied: async (_job, outcome) => { reported.push(outcome); } };
  return { stub, reported };
}
const moves = [{ file: "Documents/scan_0412.docx", folder: "Bank", name: "Carta 2026", why: "A bank letter" }];
// As the function stores it: the request's JSON text.
const request = (order: unknown) => JSON.stringify(JSON.stringify(order));

Deno.test("a tidy job goes to the app as one line, and what the app answers on stdin is reported as it is (D79)", async () => {
  const lines: string[] = [];
  const app = appOn((line) => lines.push(line));
  const { stub, reported } = server();
  const running = runTidy({ id: "j1", kind: "tidy", request: JSON.parse(request({ proposal: "p1", undo: false, moves })) }, stub, app.ask);
  await Promise.resolve();
  assert.deepEqual(lines.map((line) => JSON.parse(line)), [{ tidy: { job: "j1", proposal: "p1", undo: false, moves } }]);
  app.heard({ job: "other", results: [] });
  app.heard({ job: "j1", results: [{ file: "Documents/scan_0412.docx" }] });
  assert.equal(await running, "moved 1 of 1");
  assert.deepEqual(reported, [{ results: [{ file: "Documents/scan_0412.docx" }] }], "only its own job's answer counts");
});

Deno.test("an Undo, an app that never answers and a request this computer can't read are each reported (D79)", async () => {
  const quiet = appOn(() => {}, 10);
  const { stub, reported } = server();
  assert.equal(await runTidy({ id: "j2", request: JSON.stringify({ proposal: "p1", undo: true }) }, stub, quiet.ask), "tidy failed");
  assert.equal(await runTidy({ id: "j3", request: JSON.stringify({ proposal: "p1", undo: false, moves: [{ file: "../x", why: "" }] }) }, stub, quiet.ask),
    "tidy failed");
  assert.deepEqual(reported, [
    { failed: "The Atlaswork app on this computer didn't answer. Try again." },
    { failed: "Its request couldn't be read on this computer. Ask again." },
  ]);
  const lines: string[] = [];
  const app = appOn((line) => lines.push(line));
  const undoing = runTidy({ id: "j4", request: JSON.stringify({ proposal: "p1", undo: true }) }, stub, app.ask);
  await Promise.resolve();
  app.heard({ job: "j4", results: [{ file: "Documents/scan_0412.docx", failed: "it changed since it moved" }] });
  assert.equal(await undoing, "put back 0 of 1");
  assert.deepEqual(JSON.parse(lines[0]), { tidy: { job: "j4", proposal: "p1", undo: true } });
});
