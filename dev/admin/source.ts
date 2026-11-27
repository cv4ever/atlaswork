// Writes what the admin page (/dev/admin/) edits back into its source: an agent default (a suggestion in
// src/suggestedAgents.ts, or Atlas in src/model.ts), a ground rule (`groundRules` in the agent function's texts.ts)
// or a command's prompt line (a `CommandDef` in src/commands/). Edits go through the TypeScript syntax tree, so only the values
// change and the file keeps its layout. Replacing an agent default that HEAD committed retires it (`retired` and
// `retiredAtlas`), so `withCurrentRules` brings agents still holding it up to date (agents-design D41); a draft
// replaced before any commit was never shipped, so it isn't kept. It also reads all of these from a file's text, so
// the page can compare them with a release.
import ts from "typescript";
import { templateSlots } from "../../supabase/functions/agent/logic.ts";
import { lineLimit, listingLimits, patchLimits } from "./limits.ts";

export type WriteMode = "full" | "propose";
/** What the admin page may change. `warmth: null` removes it, so the agent follows every agent's tone. */
export type AgentPatch = { role?: string; instructions?: string; writeMode?: WriteMode; warmth?: number | null; why?: string; says?: string };

type Edit = { start: number; end: number; text: string };
const parse = (text: string) => ts.createSourceFile("source.ts", text, ts.ScriptTarget.Latest, true);
const literal = (value: string | number) => typeof value === "number" ? String(value) : JSON.stringify(value);
const keyOf = (name: ts.PropertyName) => ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : "";
const objectKey = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);

function apply(text: string, edits: Edit[]) {
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  return text;
}

/** The initializer of the top-level `const name`, through `as` and `satisfies`. */
function constant(file: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !declaration.initializer) continue;
      let value = declaration.initializer;
      while (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression;
      return value;
    }
  }
}

function properties(object: ts.ObjectLiteralExpression) {
  return new Map(object.properties.filter(ts.isPropertyAssignment).map((property) => [keyOf(property.name), property]));
}

const stringOf = (node: ts.Expression | undefined) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
const strings = (node: ts.Expression | undefined) => node && ts.isArrayLiteralExpression(node) ? node.elements.map(stringOf) : [];

/** The suggestion named `name` in suggestedAgents.ts's text. */
function suggestion(file: ts.SourceFile, name: string) {
  const list = constant(file, "suggestedAgents");
  if (!list || !ts.isArrayLiteralExpression(list)) return undefined;
  return list.elements.filter(ts.isObjectLiteralExpression).find((item) => stringOf(properties(item).get("name")?.initializer) === name);
}

/** The names suggestedAgents.ts suggests, in order. */
export function suggestionNames(text: string) {
  const list = constant(parse(text), "suggestedAgents");
  if (!list || !ts.isArrayLiteralExpression(list)) return [];
  return list.elements.filter(ts.isObjectLiteralExpression).map((item) => stringOf(properties(item).get("name")?.initializer) ?? "");
}

/** The single-line text a ground rule, tool description or command prompt may hold, trimmed, or a refusal. */
export function checkLine(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("A prompt line can't be empty.");
  if (text.length > lineLimit) throw new Error(`Keep a prompt line to ${lineLimit} characters.`);
  if (/[\r\n]/.test(text)) throw new Error("A prompt line is one paragraph: no line breaks.");
  return text;
}

/**
 * A line template's new wording, which may use only the slots the code fills for it (`templateSlots` in texts.ts):
 * leaving one out stops sending that value, an unknown one would reach the model as written.
 */
export function checkTemplate(name: string, value: unknown) {
  const allowed = (templateSlots as Record<string, string[]>)[name];
  if (!allowed) throw new Error(`There's no template called ${name}.`);
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error("A template can't be empty.");
  if (text.length > lineLimit) throw new Error(`Keep a template to ${lineLimit} characters.`);
  const unknown = [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).filter((slot) => !allowed.includes(slot));
  if (unknown.length) throw new Error(`Only these slots are filled in: ${allowed.map((slot) => `{${slot}}`).join(", ") || "none"}; ${unknown.map((slot) => `{${slot}}`).join(", ")} isn't.`);
  return text;
}

/** The string values of the top-level object `name` (`groundRules`, `lineTemplates`, `toolTexts`) by key; empty when it has none. */
export function stringsIn(text: string, name: string): Record<string, string> {
  const table = constant(parse(text), name);
  if (!table || !ts.isObjectLiteralExpression(table)) return {};
  return Object.fromEntries([...properties(table)].flatMap(([key, property]) => stringOf(property.initializer) === undefined ? [] : [[key, stringOf(property.initializer)!]]));
}

/** `text` with `key` of the object `name` worded `value`; throws for a key it doesn't hold as a string. */
export function editString(text: string, name: string, key: string, value: string) {
  const table = constant(parse(text), name);
  const property = table && ts.isObjectLiteralExpression(table) ? properties(table).get(key) : undefined;
  if (!property || stringOf(property.initializer) === undefined) throw new Error(`There's no ${key} in ${name}.`);
  return apply(text, [{ start: property.initializer.getStart(), end: property.initializer.end, text: literal(value) }]);
}

/** A string literal, or literals joined with `+`, as one string; anything computed gives undefined. */
function joined(node: ts.Expression): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return joined(node.expression);
  if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.PlusToken) return undefined;
  const left = joined(node.left), right = joined(node.right);
  return left === undefined || right === undefined ? undefined : left + right;
}

/**
 * Each command's first `field` (`prompt`, the line it adds to the system prompt, or `description`, what its tool says
 * it does), by the command's name, where it is fixed text: a top-level `const <name>: CommandDef` (src/commands/), or
 * an entry of the `commands` table, where releases before 2026-11-21 held them all (src/commands.ts).
 */
function commandTexts(file: ts.SourceFile, field: "prompt" | "description") {
  const table = constant(file, "commands");
  const entries: [string, ts.Expression][] = table && ts.isObjectLiteralExpression(table) ? [...properties(table)].map(([name, property]) => [name, property.initializer]) : [];
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations)
      if (ts.isIdentifier(declaration.name) && declaration.type?.getText(file) === "CommandDef" && declaration.initializer) entries.push([declaration.name.text, declaration.initializer]);
  }
  const found = new Map<string, { node: ts.Expression; text: string }>();
  for (const [name, initializer] of entries) {
    let seen = false;
    const visit = (node: ts.Node): void => {
      if (seen) return;
      if (ts.isPropertyAssignment(node) && keyOf(node.name) === field) {
        seen = true;
        const text = joined(node.initializer);
        if (text !== undefined) found.set(name, { node: node.initializer, text });
      } else ts.forEachChild(node, visit);
    };
    visit(initializer);
  }
  return found;
}
export const commandTextsIn = (text: string, field: "prompt" | "description"): Record<string, string> =>
  Object.fromEntries([...commandTexts(parse(text), field)].map(([name, { text: value }]) => [name, value]));

/** A command file's text with the command `name`'s `field` worded `value`; throws for a command without fixed text there. */
export function editCommandText(text: string, name: string, field: "prompt" | "description", value: string) {
  const found = commandTexts(parse(text), field).get(name);
  if (!found) throw new Error(`There's no command called ${name} with a fixed ${field}.`);
  return apply(text, [{ start: found.node.getStart(), end: found.node.end, text: literal(value) }]);
}

/** The numbers in texts.ts's `limits`, by key. */
export function limitsIn(text: string): Record<string, number> {
  const table = constant(parse(text), "limits");
  if (!table || !ts.isObjectLiteralExpression(table)) return {};
  return Object.fromEntries([...properties(table)].flatMap(([key, property]) => ts.isNumericLiteral(property.initializer) ? [[key, Number(property.initializer.text.replaceAll("_", ""))]] : []));
}

/** texts.ts with the listing limit `key` set to `value`, within its range (limits.ts, `listingLimits`). */
export function editLimit(text: string, key: string, value: unknown) {
  const range = listingLimits[key as keyof typeof listingLimits];
  if (!range) throw new Error(`${key} isn't a limit the admin page changes.`);
  if (!Number.isInteger(value) || (value as number) < range.min || (value as number) > range.max) throw new Error(`${range.label} is a whole number from ${range.min} to ${range.max}.`);
  const table = constant(parse(text), "limits");
  const property = table && ts.isObjectLiteralExpression(table) ? properties(table).get(key) : undefined;
  if (!property || !ts.isNumericLiteral(property.initializer)) throw new Error(`texts.ts has no limit ${key}.`);
  return apply(text, [{ start: property.initializer.getStart(), end: property.initializer.end, text: String(value) }]);
}

/** Every suggestion's editable defaults, and Atlas's (who has no hook or line of his own), read from the two files' text. */
export function agentDefaultsIn(suggestions: string, model: string): Record<string, Record<string, string | number | undefined>> {
  const list = constant(parse(suggestions), "suggestedAgents");
  const atlas = constant(parse(model), "atlasAgent");
  const fields = ["role", "instructions", "writeMode", "warmth", "why", "says"];
  const valueOf = (node?: ts.Expression) => node && ts.isNumericLiteral(node) ? Number(node.text) : stringOf(node);
  const read = (item: ts.ObjectLiteralExpression, names: string[]) => Object.fromEntries(names.map((field) => [field, valueOf(properties(item).get(field)?.initializer)]));
  return {
    ...atlas && ts.isObjectLiteralExpression(atlas) ? { Atlas: read(atlas, fields.slice(0, 4)) } : {},
    ...Object.fromEntries((list && ts.isArrayLiteralExpression(list) ? list.elements.filter(ts.isObjectLiteralExpression) : []).map((item) => {
      const props = properties(item);
      return [stringOf(props.get("name")?.initializer) ?? "", Object.fromEntries(fields.map((field) => [field, valueOf(props.get(field)?.initializer)]))];
    })),
  };
}

/** Refuses a patch the app couldn't hold, naming the field; returns the patch with its texts trimmed. */
export function checkPatch(raw: unknown, atlas: boolean): AgentPatch {
  if (!raw || typeof raw !== "object") throw new Error("Nothing to save.");
  const patch: AgentPatch = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (atlas && (key === "why" || key === "says")) throw new Error("Atlas has no onboarding card, so no hook or line of his own.");
    if (key === "writeMode") {
      if (value !== "full" && value !== "propose") throw new Error("Write mode is Proactive or Asks first.");
      patch.writeMode = value;
    } else if (key === "warmth") {
      if (value !== null && !(Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 4)) throw new Error("Personality is 0 to 4, or the default.");
      patch.warmth = value as number | null;
    } else if (key in patchLimits) {
      const max = patchLimits[key as keyof typeof patchLimits];
      const text = typeof value === "string" ? value.trim() : "";
      if (!text) throw new Error(`The ${key === "why" ? "hook" : key === "instructions" ? "house rules" : key} can't be empty.`);
      if (text.length > max) throw new Error(`Keep the ${key === "why" ? "hook" : key === "instructions" ? "house rules" : key} to ${max} characters.`);
      patch[key as "role" | "instructions" | "why" | "says"] = text;
    } else throw new Error(`${key} isn't something the admin page changes.`);
  }
  return patch;
}

/** Appends `texts` to the string array `array`, after its last element: each on a line starting `line`, or inline without one. */
function append(array: ts.ArrayLiteralExpression, texts: string[], line = ""): Edit {
  const last = array.elements.at(-1);
  const items = texts.map(literal);
  return last ? { start: last.end, end: last.end, text: items.map((item) => line ? `,${line}${item}` : `, ${item}`).join("") }
    : { start: array.getStart() + 1, end: array.end - 1, text: items.join(", ") };
}

/** Retires `rule` and `role` for `name` in `retired`: appended to its entry, or a new entry at the end. */
function retire(file: ts.SourceFile, eol: string, name: string, rule?: string, role?: string): Edit[] {
  const table = constant(file, "retired");
  if (!table || !ts.isObjectLiteralExpression(table)) throw new Error("suggestedAgents.ts has no `retired` table.");
  const entry = properties(table).get(name)?.initializer;
  if (!entry || !ts.isObjectLiteralExpression(entry)) {
    const last = table.properties.at(-1);
    const fields = [`rules: [${rule === undefined ? "" : literal(rule)}]`, ...role === undefined ? [] : [`roles: [${literal(role)}]`]];
    const text = `${last ? "," : ""}${eol}  ${objectKey(name)}: { ${fields.join(", ")} }`;
    return [last ? { start: last.end, end: last.end, text } : { start: table.getStart() + 1, end: table.getStart() + 1, text: `${text},${eol}` }];
  }
  const fields = properties(entry);
  const edits: Edit[] = [];
  const rules = fields.get("rules")?.initializer;
  if (rule !== undefined && rules && ts.isArrayLiteralExpression(rules) && !strings(rules).includes(rule)) edits.push(append(rules, [rule], `${eol}    `));
  if (role !== undefined) {
    const roles = fields.get("roles")?.initializer;
    if (roles && ts.isArrayLiteralExpression(roles)) { if (!strings(roles).includes(role)) edits.push(append(roles, [role])); }
    else {
      const after = fields.get("rules") ?? entry.properties.at(-1)!;
      edits.push({ start: after.end, end: after.end, text: `, roles: [${literal(role)}]` });
    }
  }
  return edits;
}

/**
 * The edits that give the agent literal `item` the values in `patch`, and the role and house rules they replace when
 * `shipped` (the same agent as HEAD committed it) held them, so they can be retired.
 */
function fieldEdits(item: ts.ObjectLiteralExpression, patch: AgentPatch, shipped?: ts.ObjectLiteralExpression) {
  const fields = properties(item);
  const shippedValue = (key: string) => shipped && stringOf(properties(shipped).get(key)?.initializer);
  const edits: Edit[] = [];
  let rule: string | undefined, role: string | undefined;
  for (const key of ["role", "instructions", "writeMode", "why", "says"] as const) {
    const value = patch[key];
    const property = fields.get(key);
    if (value === undefined || !property) continue;
    const current = stringOf(property.initializer);
    if (current === value) continue;
    edits.push({ start: property.initializer.getStart(), end: property.initializer.end, text: literal(value) });
    if (key === "instructions" && current !== undefined && current === shippedValue(key)) rule = current;
    if (key === "role" && current !== undefined && current === shippedValue(key)) role = current;
  }
  if (patch.warmth !== undefined) {
    const property = fields.get("warmth");
    if (patch.warmth === null) {
      if (property) {
        const before = item.properties[item.properties.indexOf(property) - 1];
        edits.push({ start: before ? before.end : property.getStart(), end: property.end, text: "" });
      }
    } else if (property) edits.push({ start: property.initializer.getStart(), end: property.initializer.end, text: literal(patch.warmth) });
    else {
      const after = fields.get("writeMode") ?? item.properties.at(-1)!;
      edits.push({ start: after.end, end: after.end, text: `, warmth: ${patch.warmth}` });
    }
  }
  return { edits, rule, role };
}

/**
 * suggestedAgents.ts with `name`'s suggestion changed by `patch`. `head` is the file as HEAD committed it: a role or
 * house rules it shipped are retired when replaced (`retired`). Throws when `name` isn't suggested.
 */
export function editSuggestion(text: string, head: string, name: string, patch: AgentPatch) {
  const file = parse(text);
  const item = suggestion(file, name);
  if (!item) throw new Error(`${name} isn't one of the suggested agents.`);
  const { edits, rule, role } = fieldEdits(item, patch, head ? suggestion(parse(head), name) : undefined);
  if (rule !== undefined || role !== undefined) edits.push(...retire(file, text.includes("\r\n") ? "\r\n" : "\n", name, rule, role));
  return { text: apply(text, edits), retired: rule !== undefined || role !== undefined };
}

/**
 * Atlas's new defaults: model.ts with `atlasAgent` changed by `patch`, and suggestedAgents.ts with the house rules
 * and role HEAD shipped added to `retiredAtlas` and `retiredAtlasRoles` (`retired`).
 */
export function editAtlas(model: string, modelHead: string, suggestions: string, patch: AgentPatch) {
  const atlasOf = (text: string) => {
    const value = constant(parse(text), "atlasAgent");
    return value && ts.isObjectLiteralExpression(value) ? value : undefined;
  };
  const item = atlasOf(model);
  if (!item) throw new Error("model.ts has no `atlasAgent`.");
  const { edits, rule, role } = fieldEdits(item, patch, modelHead ? atlasOf(modelHead) : undefined);
  const nextModel = apply(model, edits);
  if (rule === undefined && role === undefined) return { model: nextModel, suggestions, retired: false };
  const file = parse(suggestions);
  const line = `${suggestions.includes("\r\n") ? "\r\n" : "\n"}  `;
  const retiring: Edit[] = [];
  for (const [list, value] of [["retiredAtlas", rule], ["retiredAtlasRoles", role]] as const) {
    if (value === undefined) continue;
    const retired = constant(file, list);
    if (!retired || !ts.isArrayLiteralExpression(retired)) throw new Error(`suggestedAgents.ts has no \`${list}\` list.`);
    if (!strings(retired).includes(value)) retiring.push(append(retired, [value], line));
  }
  return { model: nextModel, suggestions: apply(suggestions, retiring), retired: true };
}
