import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import postgres from "postgres";

/**
 * Generates docs/SCHEMA.md from a migrated database.
 *
 * pg_catalog and information_schema are the source of truth here, not
 * schema.ts, so the file can never drift from what a migration actually
 * built — including the hand-written views, functions and COMMENT ONs that
 * schema.ts doesn't know about. See docs/DATA-MODEL.md for the reasoning
 * behind the shape; this file is only the column-by-column what.
 *
 * Run as `node dist/docs.js --write` or `--check`, with the database URL in
 * MIGRATION_DATABASE_URL. `npm run db:docs` points it at a fresh throwaway
 * database, the same way `npm run db:verify` does.
 */

type SqlClient = ReturnType<typeof postgres>;

/** docs/SCHEMA.md, resolved from the built file so it works from dist/. */
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const schemaDocPath = `${repoRoot}docs/SCHEMA.md`;

// The logical order from docs/DATA-MODEL.md § The shape. Anything not listed
// here — a table or view added later — still appears, alphabetically, after
// these, so a new one can never go undocumented merely by being unlisted.
const TABLE_ORDER = [
  "club",
  "member",
  "api_key",
  "access_grant",
  "season",
  "competition",
  "division",
  "entry",
  "entry_member",
  "match",
  "match_side",
  "match_participant",
  "result_submission",
  "event",
];
const VIEW_ORDER = [
  "entry_label",
  "division_progress",
  "competition_progress",
  "entry_progress",
  "outstanding_match",
  "member_chase_list",
  "event_feed",
];

function orderBy(names: string[], order: string[]): string[] {
  const rank = new Map(order.map((n, i) => [n, i]));
  return [...names].sort((a, b) => {
    const ra = rank.get(a) ?? order.length + 1;
    const rb = rank.get(b) ?? order.length + 1;
    return ra !== rb ? ra - rb : a.localeCompare(b);
  });
}

/** Escapes a Markdown table cell: the only character that breaks one is `|`. */
const esc = (s: string): string => s.replace(/\|/g, "\\|");

/**
 * Single-word type names for the ER diagram's entity blocks, which mermaid
 * requires (a type like `numeric(6,3)` or `text[]` is not valid there).
 */
function sanitizeType(pgType: string): string {
  if (pgType === "timestamp with time zone") return "timestamptz";
  if (pgType === "timestamp without time zone") return "timestamp";
  if (pgType.endsWith("[]")) return `${sanitizeType(pgType.slice(0, -2))}_array`;
  return pgType.replace(/\(.*\)$/, "").trim().replace(/\s+/g, "_");
}

function deleteAction(code: string | null): string {
  switch (code) {
    case "c":
      return "cascade";
    case "n":
      return "set null";
    case "d":
      return "set default";
    case "r":
      return "restrict";
    default:
      return "no action";
  }
}

/** regclass casts back to a schema-qualified name only when needed; strip it. */
function bareName(qualified: string | null): string | null {
  if (qualified === null) return null;
  const dot = qualified.lastIndexOf(".");
  return dot >= 0 ? qualified.slice(dot + 1) : qualified;
}

// ── queries ──────────────────────────────────────────────────────────────

interface RelationRow {
  name: string;
  comment: string | null;
}

async function fetchRelations(sql: SqlClient, kind: "r" | "v"): Promise<RelationRow[]> {
  return sql<RelationRow[]>`
    SELECT c.relname AS name, obj_description(c.oid, 'pg_class') AS comment
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = ${kind}
    ORDER BY c.relname
  `;
}

interface ColumnRow {
  name: string;
  type: string;
  notnull: boolean;
  default: string | null;
  comment: string | null;
}

async function fetchColumns(sql: SqlClient, relname: string): Promise<ColumnRow[]> {
  return sql<ColumnRow[]>`
    SELECT a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS notnull,
           pg_get_expr(d.adbin, d.adrelid) AS default,
           col_description(a.attrelid, a.attnum) AS comment
    FROM pg_attribute a
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = ${`public.${relname}`}::regclass
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `;
}

interface RlsInfo {
  enabled: boolean;
  policies: string[];
}

async function fetchRls(sql: SqlClient, relname: string): Promise<RlsInfo> {
  const rows = await sql<{ enabled: boolean }[]>`
    SELECT c.relrowsecurity AS enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ${relname}
  `;
  const policies = await sql<{ name: string }[]>`
    SELECT policyname AS name FROM pg_policies
    WHERE schemaname = 'public' AND tablename = ${relname}
    ORDER BY policyname
  `;
  return { enabled: rows[0]?.enabled ?? false, policies: policies.map((p) => p.name) };
}

interface ConstraintRow {
  name: string;
  contype: string;
  columns: string[] | null;
  ref_table: string | null;
  ref_columns: string[] | null;
  confdeltype: string | null;
  definition: string;
}

async function fetchConstraints(sql: SqlClient, relname: string): Promise<ConstraintRow[]> {
  return sql<ConstraintRow[]>`
    SELECT
      con.conname AS name,
      con.contype AS contype,
      (SELECT array_agg(att.attname ORDER BY k.ord)
         FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
      ) AS columns,
      NULLIF(con.confrelid, 0)::regclass::text AS ref_table,
      (SELECT array_agg(att.attname ORDER BY k.ord)
         FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute att ON att.attrelid = con.confrelid AND att.attnum = k.attnum
      ) AS ref_columns,
      NULLIF(con.confdeltype::text, ' ') AS confdeltype,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    WHERE con.conrelid = ${`public.${relname}`}::regclass
    ORDER BY con.contype, con.conname
  `;
}

interface IndexRow {
  name: string;
  definition: string;
}

async function fetchIndexes(sql: SqlClient, relname: string): Promise<IndexRow[]> {
  return sql<IndexRow[]>`
    SELECT c.relname AS name, pg_get_indexdef(i.indexrelid) AS definition
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE t.relname = ${relname} AND n.nspname = 'public'
    ORDER BY c.relname
  `;
}

interface FunctionRow {
  name: string;
  args: string;
  returns: string;
  secdef: boolean;
  comment: string | null;
}

async function fetchFunctions(sql: SqlClient): Promise<FunctionRow[]> {
  return sql<FunctionRow[]>`
    SELECT p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS returns,
           p.prosecdef AS secdef,
           obj_description(p.oid, 'pg_proc') AS comment
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'deuceleague\_%' ESCAPE '\'
    ORDER BY p.proname, args
  `;
}

// ── assembling one table's worth of catalog data ────────────────────────

interface TableDoc {
  name: string;
  comment: string | null;
  columns: ColumnRow[];
  rls: RlsInfo;
  pk: ConstraintRow | null;
  fks: ConstraintRow[];
  uniques: ConstraintRow[];
  checks: ConstraintRow[];
  indexes: IndexRow[];
}

async function gatherTables(sql: SqlClient): Promise<TableDoc[]> {
  const relations = await fetchRelations(sql, "r");
  const byName = new Map(relations.map((r) => [r.name, r]));
  const docs: TableDoc[] = [];
  for (const name of orderBy(relations.map((r) => r.name), TABLE_ORDER)) {
    const relation = byName.get(name);
    if (!relation) continue;
    const [columns, rls, constraints, indexes] = await Promise.all([
      fetchColumns(sql, name),
      fetchRls(sql, name),
      fetchConstraints(sql, name),
      fetchIndexes(sql, name),
    ]);
    docs.push({
      name,
      comment: relation.comment,
      columns,
      rls,
      pk: constraints.find((c) => c.contype === "p") ?? null,
      fks: constraints.filter((c) => c.contype === "f"),
      uniques: constraints.filter((c) => c.contype === "u"),
      checks: constraints.filter((c) => c.contype === "c"),
      indexes,
    });
  }
  return docs;
}

interface IncomingRef {
  table: string;
  columns: string[];
  name: string;
}

function referencedBy(docs: TableDoc[], tableName: string): IncomingRef[] {
  const refs: IncomingRef[] = [];
  for (const doc of docs) {
    for (const fk of doc.fks) {
      if (bareName(fk.ref_table) === tableName) {
        refs.push({ table: doc.name, columns: fk.columns ?? [], name: fk.name });
      }
    }
  }
  return refs.sort((a, b) => a.name.localeCompare(b.name));
}

// ── the ER diagram ───────────────────────────────────────────────────────
//
// One edge per (child, parent) pair, after two things Mermaid can't express
// directly: several foreign keys between the same two tables collapse into
// one edge, and the plain club_id → club.id edge every table has is left out
// entirely (see the caption printed above the diagram) so the picture stays
// readable. A constraint only actually forces the relationship to exist if
// none of its own columns can be null (Postgres skips FK checking otherwise);
// an edge merged from several constraints is "required" if any one of them is.

interface Edge {
  parent: string;
  child: string;
  nullable: boolean;
  names: string[];
}

function buildEdges(docs: TableDoc[]): Edge[] {
  const notNullByTable = new Map(docs.map((d) => [d.name, new Map(d.columns.map((c) => [c.name, c.notnull]))]));
  const byKey = new Map<string, Edge>();
  for (const doc of docs) {
    const notNull = notNullByTable.get(doc.name);
    for (const fk of doc.fks) {
      const parent = bareName(fk.ref_table);
      if (!parent || parent === "club") continue;
      const cols = fk.columns ?? [];
      const constraintOptional = cols.some((c) => !(notNull?.get(c) ?? true));
      const key = `${doc.name}\u0000${parent}`;
      const existing = byKey.get(key);
      if (existing) {
        existing.nullable = existing.nullable && constraintOptional;
        existing.names.push(fk.name);
      } else {
        byKey.set(key, { parent, child: doc.name, nullable: constraintOptional, names: [fk.name] });
      }
    }
  }
  return [...byKey.values()].sort((a, b) => a.child.localeCompare(b.child) || a.parent.localeCompare(b.parent));
}

function erdEntityColumns(doc: TableDoc): { type: string; name: string; keys: string[] }[] {
  const pkCols = new Set(doc.pk?.columns ?? []);
  const fkCols = new Set<string>();
  for (const fk of doc.fks) {
    const parent = bareName(fk.ref_table);
    if (parent && parent !== "club") {
      for (const c of fk.columns ?? []) fkCols.add(c);
    }
  }
  return doc.columns
    .filter((c) => pkCols.has(c.name) || fkCols.has(c.name))
    .map((c) => {
      const keys: string[] = [];
      if (pkCols.has(c.name)) keys.push("PK");
      if (fkCols.has(c.name)) keys.push("FK");
      return { type: sanitizeType(c.type), name: c.name, keys };
    });
}

function renderErd(docs: TableDoc[]): string {
  const lines: string[] = ["erDiagram"];
  for (const doc of docs) {
    lines.push(`    ${doc.name} {`);
    for (const c of erdEntityColumns(doc)) {
      lines.push(`        ${c.type} ${c.name}${c.keys.length > 0 ? ` ${c.keys.join(", ")}` : ""}`);
    }
    lines.push("    }");
  }
  for (const e of buildEdges(docs)) {
    const parentSymbol = e.nullable ? "|o" : "||";
    lines.push(`    ${e.parent} ${parentSymbol}--o{ ${e.child} : "${e.names.join(", ")}"`);
  }
  return lines.join("\n");
}

// ── rendering ────────────────────────────────────────────────────────────

const HEADER = `# Schema reference

Generated from the migrated database by \`npm run db:docs\`. Do not edit this
file by hand: descriptions come from the \`COMMENT ON\` statements in the
migrations, so change those, then regenerate. See
[docs/DATA-MODEL.md](DATA-MODEL.md) for the reasoning behind this shape; this
file is only the column-by-column reference.`;

function renderErdSection(docs: TableDoc[]): string {
  return [
    "## Entity relationship diagram",
    "",
    "Every table also carries a `club_id` that scopes it to one club, enforced " +
      "by row-level security; the plain foreign key from each table's `club_id` " +
      "to `club.id` is omitted below to keep the diagram readable.",
    "",
    "```mermaid",
    renderErd(docs),
    "```",
  ].join("\n");
}

function renderTable(doc: TableDoc, refs: IncomingRef[]): string {
  const out: string[] = [`## ${doc.name}`, "", doc.comment ?? "*(no comment)*", ""];

  const policies = doc.rls.policies.length > 0 ? doc.rls.policies.map((p) => `\`${p}\``).join(", ") : "none";
  out.push(`**Row-level security:** ${doc.rls.enabled ? "enabled" : "disabled"} (policies: ${policies})`, "");

  out.push("| Column | Type | Nullable | Default | Description |", "| --- | --- | --- | --- | --- |");
  for (const c of doc.columns) {
    const def = c.default ? `\`${esc(c.default)}\`` : "—";
    out.push(`| \`${c.name}\` | \`${c.type}\` | ${c.notnull ? "no" : "yes"} | ${def} | ${esc(c.comment ?? "*(no comment)*")} |`);
  }
  out.push("");

  out.push(
    doc.pk
      ? `**Primary key:** \`${doc.pk.name}\` (${(doc.pk.columns ?? []).map((c) => `\`${c}\``).join(", ")})`
      : "**Primary key:** none — see the unique constraints below.",
    "",
  );

  if (doc.fks.length > 0) {
    out.push("**Foreign keys:**", "");
    for (const fk of doc.fks) {
      const cols = (fk.columns ?? []).map((c) => `\`${c}\``).join(", ");
      const refCols = (fk.ref_columns ?? []).map((c) => `\`${c}\``).join(", ");
      out.push(
        `- (${cols}) → \`${bareName(fk.ref_table)}\` (${refCols}), ON DELETE ${deleteAction(fk.confdeltype)} — \`${fk.name}\``,
      );
    }
    out.push("");
  }

  if (doc.uniques.length > 0) {
    out.push("**Unique constraints:**", "");
    for (const u of doc.uniques) {
      out.push(`- \`${u.name}\`: (${(u.columns ?? []).map((c) => `\`${c}\``).join(", ")})`);
    }
    out.push("");
  }

  if (doc.indexes.length > 0) {
    out.push("**Indexes:**", "");
    for (const ix of doc.indexes) {
      out.push(`- \`${ix.name}\`: \`${esc(ix.definition)}\``);
    }
    out.push("");
  }

  if (doc.checks.length > 0) {
    out.push("**Check constraints:**", "");
    for (const ck of doc.checks) {
      out.push(`- \`${ck.name}\`: \`${esc(ck.definition)}\``);
    }
    out.push("");
  }

  out.push("**Referenced by:**", "");
  if (refs.length === 0) {
    out.push("- (nothing)");
  } else {
    for (const r of refs) {
      out.push(`- \`${r.table}\` (${r.columns.map((c) => `\`${c}\``).join(", ")}) via \`${r.name}\``);
    }
  }

  return out.join("\n");
}

function renderView(name: string, comment: string | null, columns: ColumnRow[]): string {
  const out: string[] = [`## ${name}`, "", comment ?? "*(no comment)*", ""];
  out.push("| Column | Type | Description |", "| --- | --- | --- |");
  for (const c of columns) {
    out.push(`| \`${c.name}\` | \`${c.type}\` | ${esc(c.comment ?? "")} |`);
  }
  return out.join("\n");
}

function renderFunction(f: FunctionRow): string {
  const security = f.secdef ? " SECURITY DEFINER." : "";
  return [
    `### \`${f.name}(${f.args})\``,
    "",
    `Returns \`${f.returns}\`.${security}`,
    "",
    f.comment ?? "*(no comment)*",
  ].join("\n");
}

// ── top level: gather everything, note what has no comment, render ──────

export async function generate(sql: SqlClient): Promise<{ markdown: string; missing: string[] }> {
  const missing: string[] = [];

  const tables = await gatherTables(sql);
  for (const t of tables) {
    if (!t.comment) missing.push(`table ${t.name}`);
    for (const c of t.columns) {
      if (!c.comment) missing.push(`column ${t.name}.${c.name}`);
    }
  }

  const viewRelations = await fetchRelations(sql, "v");
  const viewByName = new Map(viewRelations.map((v) => [v.name, v]));
  const views: { name: string; comment: string | null; columns: ColumnRow[] }[] = [];
  for (const name of orderBy(viewRelations.map((v) => v.name), VIEW_ORDER)) {
    const rel = viewByName.get(name);
    if (!rel) continue;
    if (!rel.comment) missing.push(`view ${name}`);
    views.push({ name, comment: rel.comment, columns: await fetchColumns(sql, name) });
  }

  const functions = await fetchFunctions(sql);
  for (const f of functions) {
    if (!f.comment) missing.push(`function ${f.name}(${f.args})`);
  }

  const sections: string[] = [HEADER, renderErdSection(tables), "## Tables"];
  for (const t of tables) sections.push(renderTable(t, referencedBy(tables, t.name)));
  sections.push("## Views");
  for (const v of views) sections.push(renderView(v.name, v.comment, v.columns));
  sections.push("## Functions");
  for (const f of functions) sections.push(renderFunction(f));

  const markdown = `${sections.join("\n\n")}\n`;
  return { markdown, missing };
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    console.error("Usage: node dist/docs.js --write | --check");
    process.exit(1);
  }
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("Set MIGRATION_DATABASE_URL to a connection as the role that owns the tables.");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const { markdown, missing } = await generate(sql);

    if (mode === "--write") {
      writeFileSync(schemaDocPath, markdown);
      console.log(`wrote ${schemaDocPath}`);
      return;
    }

    let ok = true;

    if (missing.length > 0) {
      ok = false;
      console.error(`no COMMENT ON for ${missing.length} object${missing.length === 1 ? "" : "s"}:`);
      for (const m of missing) console.error(`  ${m}`);
    }

    const existing = existsSync(schemaDocPath) ? readFileSync(schemaDocPath, "utf8") : null;
    if (existing !== markdown) {
      ok = false;
      console.error("docs/SCHEMA.md is out of date — run npm run db:docs");
      const oldLines = (existing ?? "").split("\n");
      const newLines = markdown.split("\n");
      for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
        if (oldLines[i] !== newLines[i]) {
          console.error(`  first differing line ${i + 1}:`);
          console.error(`    committed:  ${oldLines[i] ?? "(file ends here)"}`);
          console.error(`    generated:  ${newLines[i] ?? "(file ends here)"}`);
          break;
        }
      }
    }

    if (!ok) process.exit(1);
    console.log("docs/SCHEMA.md is up to date");
  } finally {
    await sql.end();
  }
}

// `node dist/docs.js` runs this file directly; `npm run db:docs` is what
// scripts/db-verify.sh calls it through.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
