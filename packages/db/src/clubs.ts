import { eq } from "drizzle-orm";
import { apiKey, club } from "./schema.js";
import { setClub, type Db, type Tx } from "./client.js";
import { recordEvent, SYSTEM } from "./events.js";
import { uuidv7 } from "./ids.js";

export type NewClub = {
  slug: string;
  name: string;
  timezone: string;
  /** The club's first key. Hashed by the caller; the key itself never reaches the database. */
  adminKey: { name: string; hash: string; prefix: string; scopes: string[] };
};

/**
 * Creates a club and its first API key in one transaction. This is how every
 * club begins: every endpoint needs a key, so the first one cannot come from
 * the API. It runs as deuceleague_app like everything else — the club context
 * is set to the new club's id first, and row-level security accepts the rows
 * because they belong to it.
 */
export async function createClub(db: Db, input: NewClub): Promise<{ clubId: string; apiKeyId: string }> {
  return db.transaction(async (tx) => {
    const clubId = uuidv7();
    const apiKeyId = uuidv7();
    await setClub(tx, clubId);
    await tx.insert(club).values({ id: clubId, slug: input.slug, name: input.name, timezone: input.timezone });
    await tx.insert(apiKey).values({
      id: apiKeyId,
      clubId,
      name: input.adminKey.name,
      keyHash: input.adminKey.hash,
      prefix: input.adminKey.prefix,
      scopes: input.adminKey.scopes,
    });
    await recordEvent(tx, clubId, {
      type: "club.created",
      subjectType: "club",
      subjectId: clubId,
      actor: SYSTEM,
      payload: { slug: input.slug },
    });
    await recordEvent(tx, clubId, {
      type: "api_key.created",
      subjectType: "api_key",
      subjectId: apiKeyId,
      actor: SYSTEM,
      payload: { name: input.adminKey.name, scopes: input.adminKey.scopes },
    });
    return { clubId, apiKeyId };
  });
}

/** The current club. Needs the club set: it reads under row-level security. */
export async function getClub(tx: Tx, clubId: string) {
  const [row] = await tx
    .select({ id: club.id, slug: club.slug, name: club.name, timezone: club.timezone })
    .from(club)
    .where(eq(club.id, clubId));
  return row ?? null;
}

/**
 * The name of the unique constraint a Postgres error violated, if it was one.
 * Drizzle wraps the driver's error, so the Postgres one is its `cause`.
 */
export function violatedUniqueConstraint(error: unknown): string | null {
  const e = ((error as { cause?: unknown })?.cause ?? error) as { code?: string; constraint_name?: string };
  return e?.code === "23505" ? (e.constraint_name ?? "") : null;
}
