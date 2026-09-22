import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { apiKey } from "./schema.js";
import type { Tx } from "./client.js";

/** What a live API key resolves to: its club, and what it may do there. */
export type ResolvedApiKey = { clubId: string; apiKeyId: string; scopes: string[] };

/**
 * Finds a live key by the SHA-256 of what was presented. This runs before the
 * club is known, so it goes through deuceleague_resolve_api_key(), the one
 * narrow door past row-level security; it returns nothing for a revoked or
 * expired key, or one that never existed.
 */
export async function resolveApiKey(tx: Tx, keyHash: string): Promise<ResolvedApiKey | null> {
  const [row] = await tx.execute<{ club_id: string; api_key_id: string; scopes: string[] }>(
    sql`select club_id, api_key_id, scopes from deuceleague_resolve_api_key(${keyHash})`,
  );
  return row ? { clubId: row.club_id, apiKeyId: row.api_key_id, scopes: row.scopes } : null;
}

/**
 * Records that a key was used, at most once a minute. Writing on every
 * request would turn every read into a write for the sake of a timestamp
 * nobody needs to the second.
 */
export async function touchApiKey(tx: Tx, apiKeyId: string): Promise<void> {
  await tx
    .update(apiKey)
    .set({ lastUsedAt: sql`now()` })
    .where(
      and(
        eq(apiKey.id, apiKeyId),
        or(isNull(apiKey.lastUsedAt), lt(apiKey.lastUsedAt, sql`now() - interval '1 minute'`)),
      ),
    );
}

/** A key's own description. Needs the club set: it reads under row-level security. */
export async function getApiKey(tx: Tx, apiKeyId: string) {
  const [row] = await tx
    .select({ id: apiKey.id, name: apiKey.name, prefix: apiKey.prefix, scopes: apiKey.scopes })
    .from(apiKey)
    .where(eq(apiKey.id, apiKeyId));
  return row ?? null;
}
