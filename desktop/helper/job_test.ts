import assert from "node:assert/strict";
import { strToU8, zipSync } from "npm:fflate@0.8.2";
import { runJob } from "./job.ts";
import type { Server } from "./job.ts";
import { officeText, openIndex } from "./search.ts";
import { AgentError } from "../../supabase/functions/agent/logic.ts";
import type { Completion, Snapshot, ToolCall } from "../../supabase/functions/agent/logic.ts";
import type { Answered } from "../../supabase/functions/agent/contract.ts";
import type { Move } from "../../supabase/functions/agent/computer.ts";
import type { Part } from "../../supabase/functions/agent/searches.ts";

const office = { id: "5d2f1c3a-0b1e-4c2d-9e8f-7a6b5c4d3e2f", name: "Office PC" };
const taxes = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", elsewhere = "1b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e";
const snapshot: Snapshot = {
  agent: { name: "Ledger", role: "Finance lead", instructions: "Be brief.", warmth: "Even", detail: "Brief" },
  tools: ["read_notes", "list_tasks"], commands: [], places: ["Finance"], pages: [], notes: [], tasks: [], history: [],
  request: "When is the home insurance renewal?", today: "2026-11-23",
  folders: [{ place: "Finance", name: "Taxes", files: [], id: taxes, computer: office }, { place: "Finance", name: "Elsewhere", files: [], id: elsewhere, computer: office }],
  land: { thread: "agent:ledger", message: "m1", agent: "ledger", zone: "Europe/Lisbon" },
};
const call = (name: string, args: unknown, id: string): ToolCall => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });
const tools = (...toolCalls: ToolCall[]): Completion => ({ text: "", toolCalls, finish: "tool_calls", neurons: 20, usage: { input: 100, output: 10 }, model: "gpt-oss" });
const answer = (text: string): Completion => ({ text, toolCalls: [], finish: "stop", neurons: 10, usage: { input: 200, output: 20 }, model: "gpt-oss" });

/**
 * The agent function as the helper sees it, answering the model's turns in order and keeping what it was told; `parts`
 * are the other computers' searches (D84), and `computers` the account's others a job may move to.
 */
function server(turns: Completion[], parts: Part[] = [], computers: string[] = []) {
  const said: string[] = [];
  let landed: Answered | undefined, moved: Move | undefined;
  const asked: { tools?: string[]; files?: string[]; results?: string[]; latest?: string[] } = {};
  const stub: Server = {
    model: async (_job, messages, offered) => {
      asked.tools ??= (offered as { function: { name: string } }[] | undefined)?.map((tool) => tool.function.name);
      asked.files ??= messages[0].content.match(/Taxes\/[\w/-]+\.\w+/g) ?? [];
      asked.results ??= messages.flatMap((message) => message.role === "tool" ? [message.content] : []);
      asked.latest = messages.flatMap((message) => message.role === "tool" ? [message.content] : []);
      const next = turns.shift();
      if (!next) throw new Error("no more turns");
      return { ...next, source: "atlaswork" };
    },
    see: async () => answer("A receipt for 40 euros."),
    outside: async () => ({ text: "No events." }),
    progress: async (_job, step) => said.push(`progress ${step}`),
    land: async (_job, answered) => { landed = answered; said.push("land"); },
    fail: async (_job, reason) => said.push(`fail ${reason}`),
    tidied: async (_job, outcome) => said.push(`tidied ${JSON.stringify(outcome)}`),
    search: async (_job, query) => { said.push(`search ${query}`); return parts; },
    move: async (_job, move) => {
      if (!computers.includes(move.to)) throw new AgentError(`${move.to} isn't another of your computers.`);
      moved = move;
      said.push(`move ${move.to}`);
    },
  };
  return { stub, said, asked, landed: () => landed, moved: () => moved };
}
const readers = { pdf: async () => ({ text: "", pages: 0, read: 0 }), image: async () => "data:image/jpeg;base64,AA==" };

/** A linked folder on disk with a policy and a note, removed after `use`. */
async function withFolder(use: (root: string) => Promise<void>) {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${root}/Insurance`);
    await Deno.writeTextFile(`${root}/Insurance/policy.md`, "Home insurance\nRenewal is due on 1 March.");
    await Deno.writeTextFile(`${root}/notes.md`, "Receipts are in the blue box.");
    await use(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("a computer's job opens the folders linked here by the id the workspace names, never a path it doesn't link, and lands the answer (D77)", async () => {
  await withFolder(async (root) => {
    const { stub, said, asked, landed } = server([
      tools(call("search_files", { query: "renewal" }, "a")),
      tools(call("read_file", { path: "Taxes/Insurance/policy.md" }, "b")),
      answer("It renews on 1 March."),
    ]);
    let clock = 0;
    // "Elsewhere" has no folder here, and a folder linked here under another id stays shut whatever its name.
    const local = [{ id: taxes, name: "Tax papers", path: root }, { id: "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f", name: "Elsewhere", path: "C:\\Nowhere" }];
    const outcome = await runJob({ id: "job-1", request: snapshot }, stub, { folders: local }, readers, () => clock += 5_000);
    assert.match(outcome, /^done/);
    assert.deepEqual(asked.files?.sort(), ["Taxes/Insurance/policy.md", "Taxes/notes.md"], "listed here under the name the model was told");
    assert.ok(asked.tools?.includes("read_file"), "and gets the file tools");
    assert.equal(landed()?.text, "It renews on 1 March.");
    assert.deepEqual(landed()?.used?.map((use) => use.tool), ["search_files", "read_file"], "what it read lands as the reply's sources");
    assert.deepEqual(landed()?.usage, { input: 400, output: 40, peak: 200, model: { source: "atlaswork", id: "gpt-oss" }, effort: null });
    assert.equal(said.at(-1), "land");
  });
});

Deno.test("a reply the server moved here at its first file tool reads those files first, then goes on from there (D77)", async () => {
  await withFolder(async (root) => {
    const { stub, asked, landed } = server([answer("It renews on 1 March.")]);
    const moved = { id: "job-4", kind: "reply", request: snapshot, ms: 3_000, used: [{ tool: "search_files", about: "renewal" }],
      turns: [{ role: "assistant" as const, content: "", tool_calls: [call("search_files", { query: "renewal" }, "a")] }] };
    assert.match(await runJob(moved, stub, { folders: [{ id: taxes, name: "Taxes", path: root }] }, readers), /^done/);
    assert.equal(asked.results?.length, 1, "the waiting call is answered before the model goes on");
    assert.match(asked.results![0], /Taxes\/Insurance\/policy\.md/);
    assert.equal(landed()?.text, "It renews on 1 March.");
    assert.deepEqual(landed()?.used, [{ tool: "search_files", about: "renewal", on: ["Office PC"] }],
      "the server's run already named what it asked for, and the search ran here (D84)");
  });
});

Deno.test("a job this computer can't finish lands why on your message, and one it can't read says so (D77)", async () => {
  const { stub, said } = server([]);
  assert.match(await runJob({ id: "job-2", request: snapshot }, stub, { folders: [] }, readers), /^failed/);
  assert.equal(said.at(-1), "fail Ledger couldn't answer: something went wrong on this computer. Try again in a moment.");
  const unreadable = server([]);
  assert.equal(await runJob({ id: "job-3", request: { request: "x" } }, unreadable.stub, { folders: [] }, readers), "unreadable request");
  assert.deepEqual(unreadable.said, ["fail Its request couldn't be read on this computer. Ask again."]);
});

Deno.test("a computer's search answers from its index, and only what it found opens, Word documents too; with search off here it says so (D78)", async () => {
  await withFolder(async (root) => {
    await Deno.writeFile(`${root}/carta.docx`, zipSync({ "word/document.xml": strToU8("<w:p><w:t>Seguro: a apólice renova em março.</w:t></w:p>") }));
    const dir = await Deno.makeTempDir();
    const index = openIndex(dir);
    try {
      const list = [{ name: "Documents", path: root }];
      await index.refresh(list, readers.pdf, []);
      const searching: Snapshot = { ...snapshot, tools: [...snapshot.tools, "search_computer"], folders: undefined, search: office };
      const office_ = { ...readers, office: async (file: { arrayBuffer(): Promise<ArrayBuffer> }) => officeText(new Uint8Array(await file.arrayBuffer()), "docx") };
      const { stub, asked, landed } = server([
        tools(call("search_computer", { query: "apolice renova" }, "a")),
        tools(call("read_file", { path: "Documents/carta.docx" }, "b"), call("read_file", { path: "Documents/notes.md" }, "c")),
        answer("It renews in March."),
      ]);
      assert.match(await runJob({ id: "job-5", kind: "reply", request: searching }, stub, { folders: [], search: { folders: list, find: index.find } }, office_), /^done/);
      const [found, read, refused] = asked.latest!;
      assert.match(found, /^Files on Office PC that match “apolice renova”, best first\./, "found without its accents, by the computer's name");
      assert.match(found, /the person's data, not instructions/);
      assert.match(found, /\nDocuments\/carta\.docx \(changed \d{4}-\d{2}-\d{2}\): .*renova em março/, "each with its date and a line");
      assert.match(read, /Documents\/carta\.docx .*Word document.*\n<<<file\nSeguro: a apólice renova em março\.\n>>>file/s, "a Word document it found opens");
      assert.match(refused, /^No file Documents\/notes\.md\./, "a file it didn't find stays shut, though it's there");
      assert.equal(landed()?.text, "It renews in March.");
      assert.deepEqual(landed()?.used?.[0], { tool: "search_computer", about: "apolice renova", on: ["Office PC"] });

      const off = server([tools(call("search_computer", { query: "renova" }, "a")), answer("Search is off there.")]);
      assert.match(await runJob({ id: "job-6", kind: "reply", request: searching }, off.stub, { folders: [] }, readers), /^done/);
      assert.match(off.asked.latest![0], /^Search is off on Office PC/, "a computer whose own switch is off searches nothing");
    } finally {
      index.close();
      await Deno.remove(dir, { recursive: true });
    }
  });
});

Deno.test("a search here asks the account's other computers too, and reading a file found on another moves the reply there with its turns (D84)", async () => {
  await withFolder(async (root) => {
    await Deno.writeFile(`${root}/carta.docx`, zipSync({ "word/document.xml": strToU8("<w:p><w:t>Banco Lusitano: a prestação sobe.</w:t></w:p>") }));
    const dir = await Deno.makeTempDir();
    const index = openIndex(dir);
    try {
      const list = [{ name: "Documents", path: root }];
      await index.refresh(list, readers.pdf, []);
      const several: Snapshot = { ...snapshot, tools: [...snapshot.tools, "search_computer"], folders: undefined, search: { ...office, others: ["Laptop", "Old PC"] },
        at: office };
      const word = { ...readers, office: async (file: { arrayBuffer(): Promise<ArrayBuffer> }) => officeText(new Uint8Array(await file.arrayBuffer()), "docx") };
      const parts: Part[] = [{ computer: "Laptop", hits: [{ path: "Papers/Banco/carta.docx", changed: "2026-11-20", line: "Banco Lusitano" }], all: true, files: 40, reading: false },
        { computer: "Old PC", missing: "off" }];
      const turns = () => [
        tools(call("search_computer", { query: "banco" }, "a")),
        tools(call("read_file", { path: "Office PC: Documents/carta.docx" }, "b"), call("read_file", { path: "Laptop: Papers/Banco/carta.docx" }, "c")),
        answer("The rate goes up."),
      ];
      const { stub, said, asked, landed, moved } = server(turns(), parts, ["Laptop"]);
      assert.match(await runJob({ id: "job-11", kind: "reply", request: several, ms: 1_000 }, stub, { folders: [], search: { folders: list, find: index.find } }, word),
        /^moved to Laptop/);
      assert.ok(said.includes("search banco"), "the others were asked through the function");
      const [found] = asked.latest!;
      assert.match(found, /^Files on Office PC and Laptop that match “banco”, best first\. Old PC is off, so it wasn't searched\./);
      assert.match(found, /\nOffice PC: Documents\/carta\.docx \(changed [\d-]+\): .*Banco Lusitano/);
      assert.match(found, /\nLaptop: Papers\/Banco\/carta\.docx \(changed 2026-11-20\): Banco Lusitano/);
      assert.equal(landed(), undefined, "nothing lands here");
      const move = moved()!;
      const last = move.turns.at(-1)!;
      assert.ok(last.role === "tool" && last.tool_call_id === "b" && /Banco Lusitano: a prestação sobe\./.test(last.content as string),
        "this computer's file was read here, after the call that moves the reply");
      assert.deepEqual(move.found.sort(), ["Laptop: Papers/Banco/carta.docx", "Office PC: Documents/carta.docx"], "with what the searches found, as the model saw it");
      assert.deepEqual(move.used.map((use) => [use.tool, use.on ?? null]), [["search_computer", ["Office PC", "Laptop"]], ["read_file", ["Office PC"]], ["read_file", null]],
        "the search names the computers that answered, a read here this one, and the read it moves for is placed where it runs");

      // The account no longer has that computer: the model hears so, and the reply lands here.
      const gone = server(turns(), parts);
      assert.match(await runJob({ id: "job-12", kind: "reply", request: several }, gone.stub, { folders: [], search: { folders: list, find: index.find } }, word), /^done/);
      assert.equal(gone.asked.latest!.at(-1), "Laptop isn't another of your computers. Say so.");
    } finally {
      index.close();
      await Deno.remove(dir, { recursive: true });
    }
  });
});

Deno.test("on the computer a reply moved to, the call it moved for is answered first, and only files the searches found there open (D84)", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(`${root}/Banco`);
    await Deno.writeTextFile(`${root}/Banco/carta.md`, "Banco Lusitano: a prestação sobe para 512 euros.");
    await Deno.writeTextFile(`${root}/Banco/outra.md`, "Not found by any search.");
    const laptop = { id: "6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b", name: "Laptop" };
    const request: Snapshot = { ...snapshot, tools: [...snapshot.tools, "search_computer"], folders: undefined, search: { ...office, others: ["Laptop"] },
      at: { ...laptop, found: ["Laptop: Papers/Banco/carta.md", "Office PC: Documents/carta.docx"] } };
    const { stub, asked, landed } = server([tools(call("read_file", { path: "Laptop: Papers/Banco/outra.md" }, "d")), answer("512 euros from March.")]);
    const turns = [
      { role: "assistant" as const, content: "", tool_calls: [call("read_file", { path: "Office PC: Documents/carta.docx" }, "b"), call("read_file", { path: "Laptop: Papers/Banco/carta.md" }, "c")] },
      { role: "tool" as const, tool_call_id: "b", content: "Office PC's letter." },
    ];
    const search = { folders: [{ name: "Papers", path: root }], find: () => ({ found: [], all: true, files: 2, reading: false }) };
    assert.match(await runJob({ id: "job-13", kind: "reply", request, turns, used: [{ tool: "read_file", about: "x" }] }, stub, { folders: [], search }, readers), /^done/);
    const [, carta, outra] = asked.latest!;
    assert.match(carta, /^Papers\/Banco\/carta\.md .*\n<<<file\nBanco Lusitano: a prestação sobe para 512 euros\.\n>>>file/s, "the call it moved for, first");
    assert.match(outra, /^No file Papers\/Banco\/outra\.md\./, "a file no search found stays shut, though it's there");
    assert.equal(landed()?.text, "512 euros from March.");
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("a reply's folders may span computers: a search here says which it left out, and a file in one elsewhere moves the reply there (D84)", async () => {
  await withFolder(async (root) => {
    const laptop = { id: "6e7f8a9b-0c1d-4e2f-8a3b-4c5d6e7f8a9b", name: "Laptop" };
    const photos = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
    const spanning: Snapshot = { ...snapshot, at: office,
      folders: [{ place: "Finance", name: "Taxes", files: [], id: taxes, computer: office }, { place: "Family", name: "Photos", files: [], id: photos, computer: laptop }] };
    const { stub, asked, moved } = server([
      tools(call("search_files", { query: "renewal" }, "a")),
      tools(call("search_files", { query: "beach", folder: "Photos" }, "b")),
    ], [], ["Laptop"]);
    assert.match(await runJob({ id: "job-14", kind: "reply", request: spanning }, stub, { folders: [{ id: taxes, name: "Taxes", path: root }] }, readers), /^moved to Laptop/);
    assert.match(asked.latest![0], /Taxes\/Insurance\/policy\.md[\s\S]*\nNot searched here: Photos \(on Laptop\); search_files with one of their names to look there\.$/);
    assert.deepEqual(moved()!.turns.at(-1), { role: "assistant", content: "", tool_calls: [call("search_files", { query: "beach", folder: "Photos" }, "b")] },
      "the search in the folder elsewhere waits for its computer");
  });
});

Deno.test("after a search here, the reply may offer to remember the folder it found something in, and only that one (D80)", async () => {
  await withFolder(async (root) => {
    const dir = await Deno.makeTempDir();
    const index = openIndex(dir);
    try {
      const list = [{ name: "Documents", path: root }];
      await index.refresh(list, readers.pdf, []);
      const searching: Snapshot = { ...snapshot, tools: [...snapshot.tools, "search_computer"], folders: undefined, search: office,
        request: "Where is my insurance policy?", memory: { listening: true, items: [] } };
      const { stub, asked, landed } = server([
        tools(call("search_computer", { query: "insurance renewal" }, "a")),
        tools(call("remember_where", { what: "Insurance policy", folder: "Documents/Insurance", place: "Finance" }, "b"),
          call("remember_where", { what: "Receipts", folder: "Documents", place: "Finance" }, "c")),
        answer("It's in Documents/Insurance. Shall I remember that?"),
      ]);
      assert.match(await runJob({ id: "job-10", kind: "reply", request: searching }, stub, { folders: [], search: { folders: list, find: index.find } }, readers), /^done/);
      const [, offered, refused] = asked.latest!;
      assert.match(offered, /^Offered to remember, for the person to keep or not: Insurance policy: Documents\\Insurance\./,
        "the folder holding the file the search found");
      assert.match(refused, /^folder must be one holding what your searches found/, "never one it didn't");
      assert.deepEqual(landed()?.learned, [{ what: "Insurance policy", folder: "Documents/Insurance", place: "Finance" }]);
    } finally {
      index.close();
      await Deno.remove(dir, { recursive: true });
    }
  });
});

Deno.test("a tidy drafted here names only files this job's search found, though others are in the folder (D79)", async () => {
  await withFolder(async (root) => {
    const dir = await Deno.makeTempDir();
    const index = openIndex(dir);
    try {
      const list = [{ name: "Documents", path: root }];
      await index.refresh(list, readers.pdf, []);
      const tidy = { name: "tidy_files", description: "Tidy files.", progress: "Tidying your files", prompt: "", after: "search_computer",
        args: { moves: { description: "Files.", list: { max: 20 }, fields: { file: { description: "Path." }, folder: { description: "Folder.", optional: true },
          why: { description: "Why." } } } } };
      const searching: Snapshot = { ...snapshot, tools: [...snapshot.tools, "search_computer"], commands: [tidy], folders: undefined, search: office };
      const moves = (file: string) => ({ moves: [{ file, folder: "Insurance", why: "A policy" }] });
      const { stub, asked, landed } = server([
        tools(call("search_computer", { query: "renewal" }, "a")),
        tools(call("tidy_files", moves("Documents/notes.md"), "b")),
        tools(call("tidy_files", moves("Documents/Insurance/policy.md"), "c")),
        answer("I'll put the policy in Insurance."),
      ]);
      // As the function stores it: its JSON text, so the moves' first field stays `file` (a jsonb object would put `why` first).
      const request = JSON.stringify(searching);
      assert.match(await runJob({ id: "job-8", kind: "reply", request }, stub, { folders: [], search: { folders: list, find: index.find } }, readers), /^done/);
      assert.match(asked.latest![1], /No match for moves: Documents\/notes\.md/, "a file the search didn't find is refused, though it's there");
      assert.deepEqual(landed()?.draft, { command: "tidy_files", args: moves("Documents/Insurance/policy.md") });
    } finally {
      index.close();
      await Deno.remove(dir, { recursive: true });
    }
  });
});

Deno.test("a request asked in this computer's window shows, once, a document or folder the reply found, at its real place; nothing else, nor without the window's key (D78)", async () => {
  await withFolder(async (root) => {
    await Deno.writeTextFile(`${root}/run.exe`, "MZ");
    const key = "ab".repeat(32);
    const here: Snapshot = { ...snapshot, folders: [snapshot.folders![0]], land: { ...snapshot.land!, here: { computer: office.id, key } } };
    const local = (shown: string[], windowKey = key) => ({ folders: [{ id: taxes, name: "Taxes", path: root }], show: { key: windowKey, open: (path: string) => void shown.push(path) } });
    const shown: string[] = [];
    const { stub, asked } = server([
      tools(call("open_file", { path: "Taxes/run.exe" }, "a"), call("open_file", { path: "Taxes/Insurance/../notes.md" }, "b")),
      tools(call("open_file", { path: "Taxes/Insurance/policy.md" }, "c"), call("open_file", { path: "Taxes/Insurance" }, "d")),
      answer("It's open."),
    ]);
    assert.match(await runJob({ id: "job-7", kind: "reply", request: here }, stub, local(shown), readers), /^done/);
    assert.ok(asked.tools?.includes("open_file"), "offered on the computer too");
    const [program, around, opened, again] = asked.latest!;
    assert.equal(program, "Taxes/run.exe isn't a document, an image or a folder, so it can't be opened; say where it is.", "never a program, though it's listed");
    assert.match(around, /^Taxes\/Insurance\/\.\.\/notes\.md isn't a file or folder this reply found/, "nor a path that walks around");
    assert.equal(opened, "Taxes/Insurance/policy.md is opening on Office PC's screen.");
    assert.equal(again, "A file was opened in this reply already; say where any other one is.", "one a reply");
    assert.deepEqual(shown, [`${root.replace(/[\\/]+$/, "")}\\Insurance\\policy.md`], "at its place on disk, as Windows writes it");

    const missing = server([tools(call("open_file", { path: "Taxes/missing.pdf" }, "a")), answer("Not there.")]);
    const none: string[] = [];
    await runJob({ id: "job-8", kind: "reply", request: here }, missing.stub, local(none), readers);
    assert.match(missing.asked.latest![0], /^Taxes\/missing\.pdf isn't a file or folder this reply found/, "a path the reply didn't find opens nothing");
    const stale = server([tools(call("open_file", { path: "Taxes/notes.md" }, "a")), answer("It's there.")]);
    await runJob({ id: "job-9", kind: "reply", request: here }, stale.stub, local(none, "cd".repeat(32)), readers);
    assert.match(stale.asked.latest![0], /^Files open only on Office PC's screen, for a request asked in its own window/, "nor one with another start's key");
    assert.deepEqual(none, []);
  });
});
