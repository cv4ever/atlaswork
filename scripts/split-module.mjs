// Splits a module: moves named top-level declarations into new files, each carrying exactly the imports its code uses
// (paths re-pointed, `import type` kept, the source's extension style kept, `import("./x")` re-pointed too) and
// importing what it needs from the source and from its sibling targets. A moved name something else uses becomes
// exported; the source imports what it still uses and drops imports it no longer needs. Leading comments move with
// their declaration. Importers elsewhere are not rewritten: run move-exports.mjs for each moved export, then the
// type-check. Usage: node scripts/split-module.mjs <spec.json>, where the spec is
// { "source": "src/Big.tsx", "targets": [{ "file": "src/big/Part.tsx", "header": "// What Part owns.", "names": ["Part", "helper"] }] }
// A target file is written whole, so name only new files.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import ts from "typescript";

const spec = JSON.parse(readFileSync(process.argv[2], "utf8"));
const sourceFile = resolve(spec.source);
const text = readFileSync(sourceFile, "utf8").replace(/\r\n/g, "\n");
const kind = (file) => (file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const source = ts.createSourceFile(sourceFile, text, ts.ScriptTarget.Latest, true, kind(sourceFile));

const declared = (statement) => {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap((d) => (ts.isIdentifier(d.name) ? [d.name.text] : []));
  const named = ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
    || ts.isInterfaceDeclaration(statement) || ts.isEnumDeclaration(statement);
  return named && statement.name ? [statement.name.text] : [];
};
const isType = (statement) => ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement);
const has = (statement, kind) => !!statement.modifiers?.some((modifier) => modifier.kind === kind);
/** Identifiers the statements refer to; property names after a dot or before a colon aren't references. */
function referenced(statements) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const property = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isPropertyAssignment(parent) && parent.name === node);
      if (!property) names.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  for (const statement of statements) ts.forEachChild(statement, visit);
  return names;
}

const imports = [];
for (const statement of source.statements) {
  if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
  const module = statement.moduleSpecifier.text, clause = statement.importClause, typeOnly = clause.isTypeOnly;
  if (clause.name) imports.push({ local: clause.name.text, module, kind: "default", typeOnly });
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) imports.push({ local: bindings.name.text, module, kind: "namespace", typeOnly });
  if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements)
    imports.push({ local: element.name.text, imported: (element.propertyName ?? element.name).text, module, kind: "named", typeOnly: typeOnly || element.isTypeOnly });
}
const sideEffects = source.statements.filter((statement) => ts.isImportDeclaration(statement) && !statement.importClause);
const withExtensions = imports.some((entry) => /\.tsx?$/.test(entry.module));

const body = source.statements.filter((statement) => !ts.isImportDeclaration(statement));
const owner = new Map(body.map((statement) => [statement, -1]));
const statementOf = new Map(body.flatMap((statement) => declared(statement).map((name) => [name, statement])));
const ownerOf = new Map([...statementOf.keys()].map((name) => [name, -1]));
spec.targets.forEach((target, index) => target.names.forEach((name) => {
  const statement = statementOf.get(name);
  if (!statement) throw new Error(`${spec.source} has no top-level ${name}`);
  owner.set(statement, index);
  for (const other of declared(statement)) ownerOf.set(other, index);
}));
const fileOf = (index) => (index === -1 ? sourceFile : resolve(spec.targets[index].file));
const relativeTo = (from, to) => {
  const path = relative(dirname(from), to).replaceAll("\\", "/").replace(/\.tsx?$/, "") + (withExtensions ? extname(to) : "");
  return path.startsWith(".") ? path : `./${path}`;
};
const repoint = (module, from) => {
  if (!module.startsWith(".")) return module;
  const path = relative(dirname(from), resolve(dirname(sourceFile), module)).replaceAll("\\", "/");
  return path.startsWith(".") ? path : `./${path}`;
};

const mustExport = new Set();
const plans = [-1, ...spec.targets.map((_, index) => index)].map((index) => {
  const file = fileOf(index);
  const statements = body.filter((statement) => owner.get(statement) === index);
  const names = referenced(statements);
  const own = new Set(statements.flatMap(declared));
  const byModule = new Map();
  const add = (module, entry) => {
    const group = byModule.get(module) ?? { named: new Map() };
    byModule.set(module, group);
    if (entry.kind === "default") group.default = entry; else if (entry.kind === "namespace") group.namespace = entry; else group.named.set(entry.local, entry);
  };
  for (const entry of imports) if (names.has(entry.local)) add(repoint(entry.module, file), entry);
  for (const name of names) {
    if (own.has(name) || !ownerOf.has(name)) continue;
    const statement = statementOf.get(name);
    mustExport.add(name);
    const module = relativeTo(file, fileOf(ownerOf.get(name)));
    add(module, has(statement, ts.SyntaxKind.DefaultKeyword) ? { local: name, kind: "default" } : { local: name, imported: name, kind: "named", typeOnly: isType(statement) });
  }
  const lines = index === -1 ? sideEffects.map((statement) => statement.getText(source)) : [];
  for (const [module, group] of byModule) {
    const named = (entry) => (entry.imported && entry.imported !== entry.local ? `${entry.imported} as ${entry.local}` : entry.local);
    const values = [...group.named.values()].filter((entry) => !entry.typeOnly), types = [...group.named.values()].filter((entry) => entry.typeOnly);
    if (group.namespace) lines.push(`import ${group.namespace.typeOnly ? "type " : ""}* as ${group.namespace.local} from "${module}";`);
    if (group.default || values.length)
      lines.push(`import ${group.default ? group.default.local + (values.length ? ", " : " ") : ""}${values.length ? `{ ${values.map(named).join(", ")} } ` : ""}from "${module}";`);
    if (types.length) lines.push(`import type { ${types.map(named).join(", ")} } from "${module}";`);
  }
  return { index, file, statements, lines };
});

const leading = (statement) => {
  const comments = text.slice(statement.getFullStart(), statement.getStart(source)).replace(/^\n+/, "");
  return comments.trim() ? comments.replace(/^[ \t]*\n/gm, "") : "";
};
const render = (statement, file) => {
  const exported = !has(statement, ts.SyntaxKind.ExportKeyword) && declared(statement).some((name) => mustExport.has(name)) ? "export " : "";
  return (leading(statement) + exported + statement.getText(source))
    .replace(/import\((["'])(\.[^"']+)\1\)/g, (_, quote, module) => `import(${quote}${repoint(module, file)}${quote})`);
};
const firstImport = source.statements.find((statement) => ts.isImportDeclaration(statement));
const sourceHeader = firstImport ? text.slice(0, firstImport.getStart(source)) : "";
for (const { index, file, statements, lines } of plans) {
  const header = index === -1 ? sourceHeader : `${spec.targets[index].header.trimEnd()}\n`;
  let previousEnd = null;
  const blocks = statements.map((statement) => {
    const between = previousEnd === null ? "" : text.slice(previousEnd, statement.getStart(source)).replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
    previousEnd = statement.end;
    return (/\n\s*\n/.test(between) ? "\n" : "") + render(statement, file);
  });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${header}${lines.join("\n")}\n\n${blocks.join("\n")}\n`);
  console.log(`wrote ${relative(process.cwd(), file)}: ${statements.length} statements`);
}
