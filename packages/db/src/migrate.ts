import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** The SQL files and meta/_journal.json, found relative to the built file. */
export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

type Journal = { entries: { tag: string; when: number }[] };

/**
 * Refuses a journal that drizzle would apply wrongly, and says why.
 *
 * Drizzle applies an entry only if its `when` is later than the newest
 * migration the database already has. An entry dated out of order is skipped
 * without a word — and only on upgrade, so a fresh database never shows it. A
 * .sql file missing from the journal is never applied at all. Both happen when
 * a hand-written migration is registered by hand, so check before every run.
 */
export function checkJournal(folder: string = migrationsFolder): void {
  const { entries } = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, "utf8")) as Journal;

  entries.forEach((entry, i) => {
    const previous = entries[i - 1];
    if (previous && entry.when <= previous.when) {
      throw new Error(
        `${entry.tag} is dated no later than ${previous.tag} in meta/_journal.json, ` +
          `so drizzle would skip it on any database that already has ${previous.tag}`,
      );
    }
  });

  const registered = new Set(entries.map((e) => e.tag));
  const unregistered = readdirSync(folder)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.slice(0, -".sql".length))
    .filter((tag) => !registered.has(tag));
  if (unregistered.length > 0) {
    throw new Error(`not registered in meta/_journal.json, so never applied: ${unregistered.join(", ")}`);
  }
}

/**
 * Applies every pending migration, in one transaction.
 *
 * Connect as the role that owns the tables, never as deuceleague_app: the app
 * role cannot create tables, and a role that owns them is exempt from
 * row-level security.
 */
export async function runMigrations(databaseUrl: string): Promise<void> {
  checkJournal();
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}

/** The role the application connects as. Migration 0002 creates it. */
const APP_ROLE = "deuceleague_app";

/**
 * Gives deuceleague_app the password the application connects with, so
 * DATABASE_URL is the one place it is set. Migration 0002 creates the role
 * with a placeholder, and a self-hoster should never have to change it by
 * hand. Does nothing unless DATABASE_URL connects as deuceleague_app.
 *
 * ALTER ROLE takes no bound parameters, so the password goes in as a setting
 * for this transaction, and Postgres quotes it itself with format('%L').
 */
export async function syncAppRolePassword(ownerUrl: string, appUrl: string): Promise<boolean> {
  const url = new URL(appUrl);
  if (decodeURIComponent(url.username) !== APP_ROLE || url.password === "") return false;
  const password = decodeURIComponent(url.password);
  const client = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    await client.begin(async (tx) => {
      await tx`select set_config('deuceleague.app_password', ${password}, true)`;
      await tx`do $$ begin
        execute format('alter role deuceleague_app password %L', current_setting('deuceleague.app_password'));
      end $$`;
    });
  } finally {
    await client.end();
  }
  return true;
}

// `npm run db:migrate` runs this file directly.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error("Set MIGRATION_DATABASE_URL to a connection as the role that owns the tables.");
    process.exit(1);
  }
  await runMigrations(url);
  console.log("migrations applied");
  const appUrl = process.env.DATABASE_URL;
  if (appUrl && (await syncAppRolePassword(url, appUrl))) {
    console.log(`${APP_ROLE}'s password set to the one in DATABASE_URL`);
  }
}
