// Fails if a D1 query builds SQL from text instead of binding values.
//
// D1 receives fixed SQL literals through prepare() and values through bind().
// A prepare() call has no escape hatch: its argument must be a literal.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));

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
    }
  }
}

if (findings.length > 0) {
  console.log("  FAIL  SQL built from text. Bind values with prepare().bind().");
  for (const finding of findings) console.log(`          ${finding}`);
  process.exit(1);
}
console.log("  PASS  every D1 query binds its values");
