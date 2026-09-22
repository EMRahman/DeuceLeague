import { and, arrayContains, asc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { accessGrant, apiKey } from "./schema.js";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { toPage, type Page, type PageRequest } from "./lists.js";

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

/** Everything about a key except its hash, which never leaves the database. */
const described = {
  id: apiKey.id,
  name: apiKey.name,
  prefix: apiKey.prefix,
  scopes: apiKey.scopes,
  lastUsedAt: apiKey.lastUsedAt,
  expiresAt: apiKey.expiresAt,
  revokedAt: apiKey.revokedAt,
  createdAt: apiKey.createdAt,
};

export type ApiKeyRecord = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

/** A key's own description. Needs the club set: it reads under row-level security. */
export async function getApiKey(tx: Tx, apiKeyId: string): Promise<ApiKeyRecord | null> {
  const [row] = await tx.select(described).from(apiKey).where(eq(apiKey.id, apiKeyId));
  return row ?? null;
}

/** The club's keys, revoked ones included, so a coach can see what was ever issued. */
export async function listApiKeys(tx: Tx, page: PageRequest): Promise<Page<ApiKeyRecord>> {
  const rows = await tx
    .select(described)
    .from(apiKey)
    .where(page.after ? gt(apiKey.id, page.after) : undefined)
    .orderBy(asc(apiKey.id))
    .limit(page.limit + 1);
  return toPage(rows, page.limit);
}

/** Stores a new key. The caller hashes it; the key itself never reaches the database. */
export async function createApiKey(
  tx: Tx,
  clubId: string,
  input: { name: string; hash: string; prefix: string; scopes: string[]; expiresAt: Date | null },
): Promise<ApiKeyRecord> {
  const [row] = await tx
    .insert(apiKey)
    .values({
      id: uuidv7(),
      clubId,
      name: input.name,
      keyHash: input.hash,
      prefix: input.prefix,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    })
    .returning(described);
  return row!;
}

/** Revokes a key from this moment on. Revoking one already revoked keeps the first time. */
export async function revokeApiKey(tx: Tx, apiKeyId: string): Promise<ApiKeyRecord | null> {
  const [row] = await tx
    .update(apiKey)
    .set({ revokedAt: sql`coalesce(${apiKey.revokedAt}, now())` })
    .where(eq(apiKey.id, apiKeyId))
    .returning(described);
  return row ?? null;
}

/**
 * Whether any live key carrying `admin` would be left if this one went.
 * Without one, nobody could make keys or change the club through the API.
 */
export async function anotherAdminKeyExists(tx: Tx, apiKeyId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(
      and(
        ne(apiKey.id, apiKeyId),
        arrayContains(apiKey.scopes, ["admin"]),
        isNull(apiKey.revokedAt),
        or(isNull(apiKey.expiresAt), gt(apiKey.expiresAt, sql`now()`)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// ─────────────────────────────────────────────────────────── player logins ──

/** What a live access grant resolves to: its club, its member, and what kind of grant it is. */
export type ResolvedAccessGrant = {
  clubId: string;
  accessGrantId: string;
  memberId: string;
  kind: "login_link" | "session";
  scopes: string[];
};

/**
 * Finds a live login link or session by the SHA-256 of its token, through
 * deuceleague_resolve_access_grant(): the other narrow door past row-level
 * security. Nothing for an expired link, one already exchanged, a session
 * that was signed out, or a member who has been removed.
 */
export async function resolveAccessGrant(tx: Tx, tokenHash: string): Promise<ResolvedAccessGrant | null> {
  const [row] = await tx.execute<{
    club_id: string;
    access_grant_id: string;
    member_id: string;
    kind: "login_link" | "session";
    scopes: string[];
  }>(
    sql`select club_id, access_grant_id, member_id, kind, scopes
        from deuceleague_resolve_access_grant(${tokenHash})`,
  );
  if (!row) return null;
  return {
    clubId: row.club_id,
    accessGrantId: row.access_grant_id,
    memberId: row.member_id,
    kind: row.kind,
    scopes: row.scopes,
  };
}

/** Stores a login link. The caller hashes its token; the token never reaches the database. */
export async function createLoginLink(
  tx: Tx,
  clubId: string,
  input: { memberId: string; hash: string; scopes: string[]; expiresAt: Date },
): Promise<{ id: string; expiresAt: Date }> {
  const [row] = await tx
    .insert(accessGrant)
    .values({
      id: uuidv7(),
      clubId,
      kind: "login_link",
      memberId: input.memberId,
      tokenHash: input.hash,
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    })
    .returning({ id: accessGrant.id, expiresAt: accessGrant.expiresAt });
  return { id: row!.id, expiresAt: row!.expiresAt! };
}

/**
 * Uses up a login link by deleting it, returning who it was for. This is what
 * makes a link work once: of two requests racing to exchange it, the second
 * waits for the first, then finds nothing to delete.
 */
export async function consumeLoginLink(tx: Tx, linkId: string): Promise<{ memberId: string; scopes: string[] } | null> {
  const [row] = await tx
    .delete(accessGrant)
    .where(and(eq(accessGrant.id, linkId), eq(accessGrant.kind, "login_link")))
    .returning({ memberId: accessGrant.memberId, scopes: accessGrant.scopes });
  return row ?? null;
}

/** Stores a session. It has no expiry: it lasts until it is signed out. */
export async function createSession(
  tx: Tx,
  clubId: string,
  input: { memberId: string; hash: string; scopes: string[] },
): Promise<{ id: string }> {
  const [row] = await tx
    .insert(accessGrant)
    .values({
      id: uuidv7(),
      clubId,
      kind: "session",
      memberId: input.memberId,
      tokenHash: input.hash,
      scopes: input.scopes,
      expiresAt: null,
    })
    .returning({ id: accessGrant.id });
  return row!;
}

/** Signs one session out. */
export async function endSession(tx: Tx, sessionId: string): Promise<void> {
  await tx.delete(accessGrant).where(and(eq(accessGrant.id, sessionId), eq(accessGrant.kind, "session")));
}

/**
 * Signs a member out everywhere: every session they hold, and any login link
 * not yet used, since that would start a new one. Returns how many sessions ended.
 */
export async function endMemberAccess(tx: Tx, memberId: string): Promise<number> {
  const rows = await tx
    .delete(accessGrant)
    .where(eq(accessGrant.memberId, memberId))
    .returning({ kind: accessGrant.kind });
  return rows.filter((r) => r.kind === "session").length;
}
