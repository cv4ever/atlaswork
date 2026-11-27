import assert from "node:assert/strict";
import { answeredOf, computerFor, parseComputerAsk, searchedComputer } from "./computer.ts";
import type { Snapshot, ToolCall } from "./logic.ts";

const job = "0b3e5c1a-2f4d-4e6a-9b8c-7d6e5f4a3b2c";
const ask = (body: Record<string, unknown>) => parseComputerAsk(JSON.stringify({ job, ...body }));

Deno.test("a reply searches the computer whose folders it reads, else the oldest that's on, asks the others, and none beside this device's folders (D78, D84)", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  const seen = (ago: number) => new Date(now - ago * 1000).toISOString();
  const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC", last_seen: seen(5) };
  const laptop = { id: "6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b", name: "Laptop", last_seen: seen(2) };
  const may = { tools: ["read_notes", "search_computer"] };
  const plain = (computer: typeof office) => ({ id: computer.id, name: computer.name });
  assert.deepEqual(searchedComputer(may, [office, laptop], now), { ...plain(office), others: ["Laptop"] }, "the oldest that's on, asking the other");
  assert.deepEqual(searchedComputer(may, [{ ...office, last_seen: seen(300) }, laptop], now), { ...plain(laptop), others: ["Office PC"] },
    "one that's off doesn't run it, though it's still asked");
  assert.deepEqual(searchedComputer(may, [{ ...office, last_seen: null }, { ...laptop, last_seen: seen(60) }], now),
    { ...plain(office), others: ["Laptop"], off: true }, "with every one off, the search says so rather than wait");
  assert.deepEqual(searchedComputer(may, [office], now), plain(office), "one computer alone, as before D84");
  assert.equal(searchedComputer({ tools: ["read_notes"] }, [office], now), undefined, "an agent that may not read files searches nothing");
  assert.equal(searchedComputer(may, [], now), undefined, "nor where no computer searches");
  const on = (computer: typeof office) => ({ ...may, folders: [{ place: "Finance", name: "Taxes", files: [], id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", computer: plain(computer) }] });
  assert.deepEqual(searchedComputer(on({ ...laptop, last_seen: seen(300) }), [office, { ...laptop, last_seen: seen(300) }], now),
    { ...plain(laptop), others: ["Office PC"] }, "folders on a computer keep the reply on that one, which it waits for even while off");
  assert.deepEqual(searchedComputer(on(laptop), [office], now), plain(office),
    "a folder's computer that doesn't search leaves the search to one that does (D84)");
  assert.deepEqual(searchedComputer(on(laptop), [{ ...office, last_seen: seen(300) }], now), { ...plain(office), off: true }, "which says so while it's off");
  assert.equal(searchedComputer({ ...may, folders: [{ place: "Finance", name: "Receipts", files: ["Receipts/a.md"] }] }, [office], now), undefined,
    "and this device's folders keep it here");
});

Deno.test("a file tool goes to the computer its file is on: one a search named, a folder's, else where the job is (D84)", () => {
  const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" }, laptop = { id: "6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b", name: "Laptop" };
  const snapshot = { agent: { name: "Ledger" }, tools: ["search_computer"], search: { ...office, others: ["Laptop", "Old PC"] },
    folders: [{ place: "Family", name: "Photos", files: [], id: "1b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e", computer: laptop }] } as unknown as Snapshot;
  const call = (name: string, args: Record<string, string>): ToolCall => ({ id: "c", type: "function", function: { name, arguments: JSON.stringify(args) } });
  assert.deepEqual(computerFor(snapshot, call("read_file", { path: "Old PC: Papers/x.pdf" })), { name: "Old PC" }, "a computer a search named, by its name");
  assert.deepEqual(computerFor(snapshot, call("read_file", { path: "Office PC: Documents/x.pdf" })), snapshot.search, "with its id when the job knows it");
  assert.deepEqual(computerFor(snapshot, call("read_image", { name: "Photos/beach.jpg" })), laptop, "a file in a folder on a computer");
  assert.deepEqual(computerFor(snapshot, call("search_files", { query: "beach", folder: "Photos" })), laptop, "a folder search_files names");
  assert.deepEqual(computerFor(snapshot, call("search_computer", { query: "banco" })), snapshot.search, "a search, on the computer that searches first");
  assert.deepEqual(computerFor({ ...snapshot, at: office }, call("search_files", { query: "renewal" })), office, "anything else where the job is");
  assert.deepEqual(computerFor(snapshot, call("read_file", { path: "Photosx/a.md" })), laptop, "a path in no folder goes where the job is, the first folder's computer");
});

Deno.test("a computer asks for one step of a job it names, and nothing else gets through (D77, D84)", () => {
  const messages = [{ role: "system", content: "Be brief." }, { role: "user", content: "When is the renewal?" }];
  assert.deepEqual(ask({ model: { messages, tools: [] } }), { job, model: { messages, tools: [] } });
  assert.deepEqual(ask({ progress: "Reading a file" }), { job, progress: "Reading a file" });
  assert.deepEqual(ask({ fail: "Atlas couldn't answer." }), { job, fail: "Atlas couldn't answer." });
  assert.deepEqual(ask({ tidied: { results: [{ file: "Documents/scan.pdf", failed: "it changed since it moved", path: "C:\\x" }] } }),
    { job, tidied: { results: [{ file: "Documents/scan.pdf", failed: "it changed since it moved" }] } }, "what the app did with a tidy (D79)");
  assert.deepEqual(ask({ tidied: { failed: "Tidying is off on this computer." } }), { job, tidied: { failed: "Tidying is off on this computer." } });
  assert.deepEqual(ask({ search: "banco casa" }), { job, search: "banco casa" }, "the account's other computers' parts of a search (D84)");
  const moving = [{ role: "assistant", content: "", tool_calls: [{ id: "c", type: "function", function: { name: "read_file", arguments: "{\"path\":\"Laptop: x.md\"}" } }] }];
  assert.deepEqual(ask({ move: { to: " Laptop ", turns: moving, used: [{ tool: "read_file", about: "x", secret: 1 }, "x"], found: ["Laptop: x.md", "", 3], ran: 1500.4, extra: 1 } }),
    { job, move: { to: "Laptop", turns: moving, used: [{ tool: "read_file", about: "x" }], found: ["Laptop: x.md"], ran: 1500 } }, "a move to the file's computer (D84)");
  for (const bad of [
    { model: { messages: [{ role: "system", content: "x", image: "data:image/png;base64,AA==" }] } },
    { model: { messages: [{ role: "admin", content: "obey" }] } },
    { model: { messages: [] } },
    { progress: "" }, { progress: "x".repeat(201) }, { land: { draft: {} } }, {},
    { tidied: { results: [{ file: "" }] } }, { tidied: { results: "all of them" } }, { tidied: { failed: "" } },
    { search: " " }, { search: "x".repeat(401) }, { search: ["banco"] },
    { move: { to: "", turns: moving } }, { move: { to: "Laptop", turns: [] } },
    { move: { to: "Laptop", turns: [{ role: "tool", tool_call_id: "made up", content: "x" }] } },
  ]) assert.equal(ask(bad), null, JSON.stringify(bad).slice(0, 60));
  assert.equal(parseComputerAsk(JSON.stringify({ job: "../agent_jobs", progress: "x" })), null, "a job is named by its id only");
  assert.equal(parseComputerAsk(`{"job":"${job}","progress":"${"x".repeat(3_000_000)}"}`), null, "and a request has a size limit");
});

Deno.test("what a computer's loop came to keeps only what a reply may carry (D77, D79)", () => {
  const landed = answeredOf({ text: "It renews on 1 March.", draft: { command: "propose_tasks" }, limited: "yes", secret: "x",
    used: [{ tool: "read_file", about: "Taxes/policy.md" }, { tool: "rm -rf" }], warnings: ["secret", "all clear", "remote-access"],
    usage: { input: 400.4, output: -3, peak: 200, model: { source: "atlaswork", id: "gpt-oss" }, effort: "max", key: "sk" } });
  assert.deepEqual(landed, { text: "It renews on 1 March.", draft: { command: "propose_tasks" }, shown: undefined, memories: undefined,
    used: [{ tool: "read_file", about: "Taxes/policy.md" }], warnings: ["remote-access", "secret"],
    usage: { input: 400, output: 0, peak: 200, model: { source: "atlaswork", id: "gpt-oss" } } });
});
