import assert from "node:assert/strict";
import { specsOf } from "../../../src/commands.ts";
import { atlasId } from "../../../src/model.ts";
import { normalize } from "../../../src/workspace.ts";
import { parseSnapshot, runAgent } from "./logic.ts";
import type { Completion, Message, Snapshot, ToolCall, Turn } from "./logic.ts";
import { plainName, tidyAskIn, tidyJobOf, tidyTarget, withFound, withTidy } from "./tidy.ts";

const data = normalize(null).data;
const atlas = data.agents.find((agent) => agent.id === atlasId)!;
const land = { threadId: "agent:atlas", messageId: "m1" };
const tidyFiles = specsOf({ agent: atlas, data, land }).find((command) => command.name === "tidy_files")!;
const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" };
const snapshot: Snapshot = {
  agent: { name: "Atlas", role: "Guide", instructions: "Be brief.", warmth: "Even", detail: "Brief" },
  tools: ["search_computer"], commands: [tidyFiles], places: ["Everyday"], notes: [], tasks: [], history: [],
  request: "Put my bank letters away", today: "2026-11-24", search: office,
};
const call = (name: string, args: unknown, id: string): ToolCall => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const answer = (text: string): Completion => ({ text, toolCalls: [], finish: "stop", neurons: 10 });
const tools = (...toolCalls: ToolCall[]): Completion => ({ text: "", toolCalls, finish: "tool_calls", neurons: 20 });
const names = (offered: unknown[] | undefined) => (offered ?? []).map((tool) => (tool as { function: { name: string } }).function.name);

Deno.test("tidy_files is offered to a reply that lands in a chat, crosses the boundary, and stays only for a computer whose tidying is on (D79)", () => {
  assert.ok(tidyFiles, "Atlas has every tool, so a chat reply of his is offered it");
  assert.ok(!specsOf({ agent: atlas, data }).some((command) => command.name === "tidy_files"), "nor a routine or anything else that lands nowhere");
  const keeper = { ...atlas, id: "keeper", tools: {} };
  assert.ok(!specsOf({ agent: keeper, data, land }).some((command) => command.name === "tidy_files"), "nor an agent with Tidy files off, as it starts");
  assert.deepEqual(parseSnapshot(JSON.stringify(snapshot))?.commands, [tidyFiles], "the function takes a command that waits for search_computer");
  assert.deepEqual(withTidy(snapshot, false).commands, [], "a computer that doesn't tidy keeps it out");
  assert.equal(withTidy(snapshot, true), snapshot, "and one that does keeps it");
});

Deno.test("a tidy waits for a search, and on the computer names only files that search found (D79)", async () => {
  let first: string[] = [];
  await runAgent(snapshot, (_messages, offered) => { first = names(offered); return Promise.resolve(answer("Where are they?")); }, () => {});
  assert.ok(first.includes("search_computer") && !first.includes("tidy_files"), `not before a search: ${first.join(", ")}`);
  const searched: Turn[] = [
    { role: "assistant", content: "", tool_calls: [call("search_computer", { query: "banco" }, "s")] },
    { role: "tool", tool_call_id: "s", content: "Files on Office PC that match “banco”, best first.\nDocuments/Banco/carta.docx (changed 2026-11-03)" },
  ];
  const moves = (file: string) => ({ moves: [{ file, folder: "Bank", why: "A bank letter" }] });
  const replies = [tools(call("tidy_files", moves("Documents/Banco/other.pdf"), "a")), tools(call("tidy_files", moves("documents/banco/CARTA.docx"), "b")),
    answer("I'll put it in Bank.")];
  const results: Message[] = [];
  const done = await runAgent(withFound({ ...snapshot, turns: searched }, ["Documents/Banco/carta.docx"]), (messages) => {
    results.splice(0, results.length, ...messages.filter((message) => message.role === "tool"));
    return Promise.resolve(replies.shift()!);
  }, () => {});
  assert.match(String(results.at(-1)?.content), /^Proposed tidy_files/);
  assert.match(String(results.at(-2)?.content), /No match for moves: Documents\/Banco\/other\.pdf/, "a file no search found is refused, by name");
  assert.ok("text" in done);
  assert.deepEqual(done.draft, { command: "tidy_files", args: { moves: [{ file: "Documents/Banco/carta.docx", folder: "Bank", why: "A bank letter" }] } },
    "the path as the search found it");
});

Deno.test("a tidy's folders and names are ones Windows takes, and the card says where each file goes (D79)", () => {
  for (const good of ["Bank", "Carta crédito 2026", "Saúde (família)"]) assert.equal(plainName(` ${good} `), good);
  for (const bad of ["", "a/b", "..\\x", "C:", "Bank.", "Bank . ", "CON", "nul.txt", "x".repeat(81), 7]) assert.equal(plainName(bad), undefined, String(bad));
  assert.equal(tidyTarget({ file: "Documents/Banco/carta.docx", folder: "Bank", name: "Carta 2026", why: "" }), "Documents\\Bank\\Carta 2026.docx");
  assert.equal(tidyTarget({ file: "Desktop/scan.pdf", folder: "Health", why: "" }), "Documents\\Health\\scan.pdf");
  assert.equal(tidyTarget({ file: "Desktop/Old/scan.pdf", name: "Seguro casa", why: "" }), "Desktop\\Old\\Seguro casa.pdf", "renamed where it is");
});

Deno.test("your Apply or Undo of a tidy, and the job it makes, carry only what they may (D79)", () => {
  const ask = { thread: "agent:keeper", message: "a1", proposal: "p1", action: "apply" };
  assert.deepEqual(tidyAskIn(JSON.stringify({ tidy: { ...ask, extra: "x" } })), ask);
  for (const bad of [JSON.stringify({ tidy: { ...ask, action: "delete" } }), JSON.stringify({ tidy: { ...ask, thread: "" } }), '{"tidy":', '{"agent":{}}'])
    assert.equal(tidyAskIn(bad), null, bad);
  const moves = [{ file: "Documents/scan.pdf", folder: "Bank", why: "A bank letter" }];
  assert.deepEqual(tidyJobOf(JSON.stringify({ proposal: "p1", undo: false, moves })), { proposal: "p1", undo: false, moves });
  assert.deepEqual(tidyJobOf(JSON.stringify({ proposal: "p1", undo: true })), { proposal: "p1", undo: true });
  for (const bad of [
    { proposal: "p1", undo: false, moves: [] },
    { proposal: "p1", undo: true, moves },
    { proposal: "p1", undo: false, moves: [{ file: "Documents/scan.pdf", folder: "..\\Windows", why: "x" }] },
    { proposal: "p1", undo: false, moves: [{ file: "Documents/scan.pdf", why: "Neither a folder nor a name" }] },
    { proposal: "p1", undo: false, moves: Array.from({ length: 21 }, () => moves[0]) },
  ]) assert.equal(tidyJobOf(JSON.stringify(bad)), null, JSON.stringify(bad).slice(0, 80));
});
