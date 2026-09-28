// Fails if any source file builds SQL from text instead of binding its values.
//
// Queries use drizzle/postgres-js tagged templates or D1 fixed SQL literals
// with bind(). Values travel separately from SQL. The checks below catch text
// construction that could turn input into executable SQL:
//
//   sql.raw(…)            drizzle: splices a string in as SQL
//   sql.identifier(…)     drizzle: splices a name in as SQL
//   .unsafe(…)            postgres-js: runs a string as SQL
//   .execute("…")         drizzle: runs a plain string rather than an sql`…` query
//   .prepare(expression) D1: requires a fixed literal, never interpolated text
//
// A line that genuinely needs one says why in a `sql-safe:` comment, on the
// line itself or the one above, which puts the exception in front of whoever
// reviews it. D1 prepare() has no escape hatch: use a literal and bind().
// Run by `npm test` and `npm run db:verify`.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));

const rules = [
  [/sql\.raw\(/g, "sql.raw() splices a string in as SQL"],
  [/sql\.identifier\(/g, "sql.identifier() splices a name in as SQL"],
  [/\.unsafe\(/g, ".unsafe() runs a string as SQL"],
  // Allows a type argument, e.g. execute<{ id: string }>(, and a line break
  // before the string — both of which a line-by-line search would miss.
  [/\.execute\s*(<[^()]*?>)?\s*\(\s*["'`]/g, ".execute() of a plain string, not an sql`…` query"],
];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (entry.name.endsWith(".ts")) yield path;
  }
}

const findings = [];
for (const area of ["packages", "adapters", "deploy"]) {
  for (const pkg of readdirSync(join(root, area))) {
    let files;
    try {
      files = [...sourceFiles(join(root, area, pkg, "src"))];
    } catch {
      continue; // a package with no src/
    }
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      const lines = text.split("\n");
      // D1 accepts SQL text. Only fixed literals may reach prepare(); values
      // belong in bind(). Parse the AST so multiline interpolation, variables,
      // and concatenation cannot hide from the old line-oriented rules.
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      function visit(node) {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
            && node.expression.name.text === "prepare") {
          const argument = node.arguments[0];
          if (!argument || !(ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
            const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
            findings.push(`${relative(root, file)}:${line}  D1 prepare() requires a fixed SQL literal; use bind() for values`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
      for (const [pattern, why] of rules) {
        for (const match of text.matchAll(pattern)) {
          const line = text.slice(0, match.index).split("\n").length;
          const here = lines[line - 1] ?? "";
          const above = lines[line - 2] ?? "";
          if (here.includes("sql-safe:") || above.includes("sql-safe:")) continue;
          findings.push(`${relative(root, file)}:${line}  ${why}\n            ${here.trim()}`);
        }
      }
    }
  }
}

if (findings.length > 0) {
  console.log("  FAIL  SQL built from text. Bind values with sql`…` instead, or say why");
  console.log("        it is safe in a `sql-safe:` comment:");
  for (const f of findings) console.log(`          ${f}`);
  process.exit(1);
}
console.log("  PASS  every query binds its values; none is built from text");
