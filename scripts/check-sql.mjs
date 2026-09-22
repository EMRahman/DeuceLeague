// Fails if any source file builds SQL from text instead of binding its values.
//
// Every query here goes through drizzle's sql`…` tag or postgres-js's tagged
// template, both of which send values separately from the SQL, so input can
// never become SQL. That is what stops injection — not the database, and not
// a firewall in front of it. These are the ways round it, each of which can
// paste text straight into a query:
//
//   sql.raw(…)            drizzle: splices a string in as SQL
//   sql.identifier(…)     drizzle: splices a name in as SQL
//   .unsafe(…)            postgres-js: runs a string as SQL
//   .execute("…")         drizzle: runs a plain string rather than an sql`…` query
//
// A line that genuinely needs one says why in a `sql-safe:` comment, on the
// line itself or the one above, which puts the exception in front of whoever
// reviews it. Run by `npm test` and `npm run db:verify`.

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
for (const pkg of readdirSync(join(root, "packages"))) {
  let files;
  try {
    files = [...sourceFiles(join(root, "packages", pkg, "src"))];
  } catch {
    continue; // a package with no src/
  }
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
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

if (findings.length > 0) {
  console.log("  FAIL  SQL built from text. Bind values with sql`…` instead, or say why");
  console.log("        it is safe in a `sql-safe:` comment:");
  for (const f of findings) console.log(`          ${f}`);
  process.exit(1);
}
console.log("  PASS  every query binds its values; none is built from text");
