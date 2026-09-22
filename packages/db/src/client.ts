import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

/**
 * The one way the application talks to Postgres.
 *
 * Connect as deuceleague_app. Row-level security does not apply to a role
 * that owns the tables or bypasses it, so connecting as one of those would
 * turn tenancy off without a sound — assertRowLevelSecurityApplies() below
 * refuses to let that happen.
 */
export function connect(databaseUrl: string) {
  const client = postgres(databaseUrl, { onnotice: () => {} });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export type Db = ReturnType<typeof connect>["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Scopes everything that follows in this transaction to one club. The same as
 * `SET LOCAL app.club_id`, but set_config() takes the id as a bound parameter
 * rather than spliced into the SQL. It ends with the transaction, so a pooled
 * connection never carries one request's club into the next.
 */
export async function setClub(tx: Tx, clubId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.club_id', ${clubId}, true)`);
}

/** Throws unless the database answers. For health checks. */
export async function ping(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}

/**
 * Refuses a connection that row-level security would not apply to: a
 * superuser, a role with BYPASSRLS, or the role that owns the tables. Call it
 * once at start-up, before serving anything.
 */
export async function assertRowLevelSecurityApplies(db: Db): Promise<void> {
  const [role] = await db.execute<{ name: string; bypasses: boolean; owns: boolean }>(sql`
    select current_user as name,
           (r.rolsuper or r.rolbypassrls) as bypasses,
           exists (select 1 from pg_tables
                    where schemaname = 'public' and tableowner = current_user) as owns
    from pg_roles r
    where r.rolname = current_user`);
  if (!role) throw new Error("could not read the current database role");
  if (role.bypasses || role.owns) {
    throw new Error(
      `connected as ${role.name}, which ${role.owns ? "owns the tables" : "bypasses row-level security"}; ` +
        "row-level security would not apply and every club could see every other. " +
        "Connect as deuceleague_app — see docs/DATA-MODEL.md § Tenancy enforcement.",
    );
  }
}
