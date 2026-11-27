// The admin page's source edits (source.ts) on the real files: values change, the file still parses, and only
// shipped defaults are retired.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { agentDefaultsIn, checkLine, checkPatch, checkTemplate, commandTextsIn, editAtlas, editCommandText, editLimit, editString, editSuggestion, limitsIn, stringsIn, suggestionNames } from "./source.ts";
import { lineTemplates, slotsOf, templateSlots } from "../../supabase/functions/agent/logic.ts";

const suggestions = readFileSync("src/suggestedAgents.ts", "utf8");
const model = readFileSync("src/model.ts", "utf8");
const parses = (text: string) => assert.deepEqual(ts.transpileModule(text, { reportDiagnostics: true }).diagnostics, []);
/** The current value of `key` in `name`'s suggestion, read the way the file writes it. */
const valueOf = (text: string, name: string, key: string) => {
  const line = text.split("\n").findIndex((row) => row.includes(`{ name: "${name}"`));
  const block = text.split("\n").slice(line, line + 4).join("\n");
  return JSON.parse(block.match(new RegExp(`${key}: ("(?:[^"\\\\]|\\\\.)*")`))![1]) as string;
};

test("new house rules replace the old ones, which are retired when HEAD shipped them", () => {
  const old = valueOf(suggestions, "Polyglot", "instructions");
  const next = editSuggestion(suggestions, suggestions, "Polyglot", { instructions: "Practise \"out loud\" for ten minutes." }).text;
  parses(next);
  assert.equal(valueOf(next, "Polyglot", "instructions"), "Practise \"out loud\" for ten minutes.");
  assert.ok(next.includes(`Polyglot: { rules: [${JSON.stringify(old)}] }`), "a new retired entry holds the shipped rules");
  assert.deepEqual(suggestionNames(next), suggestionNames(suggestions));
});

test("an existing retired entry gets the shipped rules and role appended", () => {
  const rules = valueOf(suggestions, "Kin", "instructions");
  const role = valueOf(suggestions, "Kin", "role");
  const next = editSuggestion(suggestions, suggestions, "Kin", { instructions: "Keep the family's dates.", role: "Family keeper" }).text;
  parses(next);
  const entry = next.slice(next.indexOf("  Kin: {"), next.indexOf("  Ledger: {"));
  assert.ok(entry.includes(JSON.stringify(rules)) && entry.includes(`"Family specialist", ${JSON.stringify(role)}`));
});

test("a role without a roles list starts one", () => {
  const next = editSuggestion(suggestions, suggestions, "Chef", { role: "Cook" }).text;
  parses(next);
  assert.match(next.slice(next.indexOf("  Chef: {")), /^ {2}Chef: \{ rules: \[[^\]]*\], roles: \["Meal planner"\] \}/);
});

test("a draft nobody committed is replaced without being retired", () => {
  const draft = editSuggestion(suggestions, suggestions, "Scout", { instructions: "First draft." });
  const second = editSuggestion(draft.text, suggestions, "Scout", { instructions: "Second draft." });
  const next = second.text;
  assert.deepEqual([draft.retired, second.retired], [true, false]);
  parses(next);
  assert.ok(!next.includes("First draft."));
  assert.equal(next.split(JSON.stringify(valueOf(suggestions, "Scout", "instructions"))).length, 2, "the shipped rules: retired once, nowhere else");
});

test("personality is set, changed and cleared without touching the other fields", () => {
  const added = editSuggestion(suggestions, suggestions, "Chef", { warmth: 2 }).text;
  assert.match(added, /name: "Chef",[^\n]*writeMode: "propose", warmth: 2,/);
  const cleared = editSuggestion(suggestions, suggestions, "Vital", { warmth: null }).text;
  assert.match(cleared, /name: "Vital",[^\n]*writeMode: "propose",\r?\n/);
  parses(cleared);
  assert.equal(editSuggestion(suggestions, suggestions, "Chef", { warmth: null }).text, suggestions);
});

test("Atlas's rules change in model.ts and the shipped ones join retiredAtlas", () => {
  const old = model.match(/instructions: ("(?:[^"\\]|\\.)*"), writeMode: "full"/)![1];
  const next = editAtlas(model, model, suggestions, { instructions: "Help me pick one thing." });
  parses(next.model);
  parses(next.suggestions);
  assert.ok(next.model.includes(`instructions: "Help me pick one thing.", writeMode: "full"`));
  assert.ok(next.suggestions.slice(next.suggestions.indexOf("retiredAtlas")).startsWith(`retiredAtlas = [`));
  assert.ok(next.suggestions.replaceAll("\r\n", "\n").includes(`,\n  ${old}];`));
});

test("Atlas's role, write mode and tone change like anyone's, and his shipped role is retired", () => {
  const next = editAtlas(model, model, suggestions, { role: "Your chief of staff", writeMode: "propose", warmth: 1 });
  parses(next.model);
  parses(next.suggestions);
  assert.match(next.model, /id: atlasId, name: "Atlas", portrait: "atlas", role: "Your chief of staff",/);
  assert.match(next.model, /writeMode: "propose", warmth: 1,/);
  assert.match(next.suggestions, /retiredAtlasRoles: string\[\] = \["Your thinking partner"\];/);
  assert.equal(next.retired, true);
  const tone = editAtlas(model, model, suggestions, { warmth: 3 });
  assert.equal(tone.suggestions, suggestions, "a tone change retires nothing");
});

test("patches the app couldn't hold are refused", () => {
  assert.throws(() => editSuggestion(suggestions, suggestions, "Nobody", { role: "x" }), /isn't one of the suggested agents/);
  assert.throws(() => checkPatch({ role: "  " }, false), /role can't be empty/);
  assert.throws(() => checkPatch({ instructions: "x".repeat(401) }, false), /400 characters/);
  assert.throws(() => checkPatch({ warmth: 5 }, false), /0 to 4/);
  assert.throws(() => checkPatch({ writeMode: "auto" }, false), /Proactive or Asks first/);
  assert.throws(() => checkPatch({ says: "Hi" }, true), /no onboarding card/);
  assert.deepEqual(checkPatch({ role: " Boss ", writeMode: "propose" }, true), { role: "Boss", writeMode: "propose" });
  assert.throws(() => checkPatch({ name: "Other" }, false), /isn't something/);
  assert.deepEqual(checkPatch({ instructions: "  Trim me. ", warmth: null }, false), { instructions: "Trim me.", warmth: null });
});

const logic = readFileSync("supabase/functions/agent/texts.ts", "utf8");
// Every command file as one text: ES modules allow imports between statements, so it parses as one file.
const commands = readdirSync("src/commands").filter((name) => !name.endsWith(".test.ts")).map((name) => readFileSync(`src/commands/${name}`, "utf8")).join("\n");

test("a ground rule, template or tool description changes and nothing else does", () => {
  for (const [table, key] of [["groundRules", "format"], ["lineTemplates", "notes"], ["toolTexts", "read_notes"]] as const) {
    const next = editString(logic, table, key, "Reply in \"plain\" text: {notes}.");
    parses(next);
    assert.deepEqual(stringsIn(next, table), { ...stringsIn(logic, table), [key]: "Reply in \"plain\" text: {notes}." });
  }
  assert.throws(() => editString(logic, "groundRules", "nonsense", "x"), /no nonsense in groundRules/);
  assert.deepEqual(stringsIn("const other = 1;", "groundRules"), {}, "a version from before groundRules has none");
});

test("a command's prompt line and its tool description change, and the other commands keep theirs", () => {
  const prompts = commandTextsIn(commands, "prompt"), descriptions = commandTextsIn(commands, "description");
  assert.ok(prompts.propose_tasks && prompts.ask_agent && prompts.arrange_page, "nested and plain specs are both found");
  assert.match(descriptions.arrange_page, /top to bottom\. Keep a block/, "a description joined with + reads as one");
  const next = editCommandText(commands, "ask_agent", "prompt", "Ask the agent whose places hold the answer.");
  parses(next);
  assert.deepEqual(commandTextsIn(next, "prompt"), { ...prompts, ask_agent: "Ask the agent whose places hold the answer." });
  const joined = editCommandText(commands, "arrange_page", "description", "Propose a page's blocks in order.");
  parses(joined);
  assert.deepEqual(commandTextsIn(joined, "description"), { ...descriptions, arrange_page: "Propose a page's blocks in order." });
  assert.throws(() => editCommandText(commands, "fly", "prompt", "x"), /no command called fly/);
});

test("listing limits change within their ranges, and templates use only the slots the code fills", () => {
  const next = editLimit(logic, "titles", 10);
  parses(next);
  assert.deepEqual(limitsIn(next), { ...limitsIn(logic), titles: 10 });
  assert.equal(limitsIn(logic).body, 2_000_000, "underscored numbers read whole");
  assert.throws(() => editLimit(logic, "titles", 101), /from 0 to 100/);
  assert.throws(() => editLimit(logic, "body", 5), /isn't a limit the admin page changes/);
  assert.equal(checkTemplate("notesAndOlder", " Read {older} more after {notes}. "), "Read {older} more after {notes}.");
  assert.equal(checkTemplate("noteItem", "“{title}”"), "“{title}”", "leaving out {place} stops sending it");
  assert.throws(() => checkTemplate("notes", "Notes: {notes} {extra}."), /\{extra\} isn't/);
  assert.throws(() => checkTemplate("nonsense", "x"), /no template called nonsense/);
  for (const [name, template] of Object.entries(lineTemplates))
    assert.deepEqual([...new Set(slotsOf(template))].sort(), [...templateSlots[name as keyof typeof templateSlots]].sort(), `${name} fills every slot it declares`);
});

test("prompt lines and agent defaults are read and checked as the page needs them", () => {
  assert.equal(checkLine("  One line.  "), "One line.");
  assert.throws(() => checkLine(" "), /can't be empty/);
  assert.throws(() => checkLine("Two\nlines"), /no line breaks/);
  const defaults = agentDefaultsIn(suggestions, model);
  assert.equal(defaults.Vital.role, "Health coach");
  assert.equal(defaults.Vital.warmth, 3);
  assert.match(String(defaults.Atlas.instructions), /next step/);
});
