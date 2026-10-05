import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import { commitMutation, readSnapshot, type Snapshot } from "./atomic.js";

export async function checkHealth(db: D1Database): Promise<void> {
  await db.prepare("SELECT 1").first();
}

export type CredentialKind = "api_key" | "login_link" | "session";
export type CredentialRecord = {
  id: string; club_id: string; kind: CredentialKind; scopes: string;
  member_id: string | null; display_name: string | null;
  /** For a player's credential: when they said they are not playing next season at all. */
  leaving_at?: number | null;
  /** For a player's credential: their member status, `active` unless on a break or left. */
  member_status?: string | null;
  /** For a player's credential: what they want to play next season, if they have said. */
  member_plays?: string | null;
  name: string | null; prefix: string | null; last_used_at: number | null;
};
export type ClubRecord = { id: string; slug: string; name: string; timezone: string };
export type MemberIdentity = { id: string; display_name: string; deleted_at: number | null; status: string; email?: string | null };
export type IdentitySnapshot = {
  snapshot: Snapshot;
  hash: string;
  kind: CredentialKind;
  credential: CredentialRecord | null;
  club: ClubRecord | null;
  member: MemberIdentity | null;
  sessions: number;
  now: number;
  /** Domain reads supplied to readIdentity, from the same revision snapshot. */
  extraResults: D1Result[];
};

/** Authentication and all inputs to the identity operation share one revision. */
export async function readIdentity(
  db: D1Database, hash: string, kind: CredentialKind, memberId: string | null = null,
  reads: D1PreparedStatement[] = [],
): Promise<IdentitySnapshot> {
  const credential = kind === "api_key"
    ? db.prepare(`SELECT id, club_id, 'api_key' AS kind, scopes, name, prefix, last_used_at,
        NULL AS member_id, NULL AS display_name, NULL AS leaving_at, NULL AS member_status, NULL AS member_plays FROM api_key
        WHERE key_hash = ? AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > unixepoch('subsec') * 1000)`).bind(hash)
    : db.prepare(`SELECT a.id, a.club_id, a.kind, a.scopes, a.member_id, m.display_name, m.leaving_at, m.status AS member_status,
        m.plays AS member_plays,
        NULL AS name, NULL AS prefix, NULL AS last_used_at
        FROM access_grant a JOIN member m ON m.id = a.member_id AND m.club_id = a.club_id
        WHERE a.token_hash = ? AND a.kind = ? AND m.deleted_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > unixepoch('subsec') * 1000)`).bind(hash, kind);
  const snapshot = await readSnapshot(db, [
    credential,
    db.prepare("SELECT id, slug, name, timezone FROM club WHERE singleton = 1"),
    db.prepare(`SELECT id, display_name, deleted_at, status,
      CASE WHEN EXISTS (SELECT 1 FROM api_key k, json_each(k.scopes) s WHERE k.key_hash = ?
        AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > unixepoch('subsec') * 1000)
        AND s.value = 'members:pii') THEN email ELSE NULL END AS email
      FROM member WHERE id = ? AND club_id = (SELECT id FROM club WHERE singleton = 1)`).bind(hash, memberId),
    db.prepare(`SELECT count(*) AS n FROM access_grant WHERE member_id = ? AND kind = 'session'
      AND club_id = (SELECT id FROM club WHERE singleton = 1)`).bind(memberId),
    db.prepare("SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER) AS now"),
    ...reads,
  ]);
  return {
    snapshot, hash, kind,
    credential: (snapshot.results[0]!.results[0] as CredentialRecord | undefined) ?? null,
    club: (snapshot.results[1]!.results[0] as ClubRecord | undefined) ?? null,
    member: (snapshot.results[2]!.results[0] as MemberIdentity | undefined) ?? null,
    sessions: Number((snapshot.results[3]!.results[0] as { n: number }).n),
    now: Number((snapshot.results[4]!.results[0] as { now: number }).now),
    extraResults: snapshot.results.slice(5),
  };
}

export class CredentialExpiredError extends Error {}

export type IdentityChange =
  | { type: "read" }
  | { type: "mint"; id: string; memberId: string; hash: string; scopes: readonly string[]; expiresAt: number }
  | { type: "exchange"; id: string; hash: string; scopes: readonly string[] }
  | { type: "sign_out" }
  | { type: "sign_out_everywhere"; memberId: string };

/** SQL stays here. The API decides the operation, checks access, and generates tokens. */
export async function commitIdentity(db: D1Database, state: IdentitySnapshot, change: IdentityChange): Promise<void> {
  const credential = state.credential;
  if (!credential) throw new Error("An identity operation requires a credential");
  const writes: D1PreparedStatement[] = [];

  const actor = credential.kind === "api_key"
    ? { type: "api_key" as const, id: credential.id }
    : { type: "member" as const, id: credential.member_id! };
  const audit = (type: string, memberId: string, payload: object) =>
    eventStatement(db, credential.club_id, type, "member", memberId, actor, payload);
  if (change.type === "mint") {
    writes.push(
      db.prepare(`INSERT INTO access_grant (id, club_id, member_id, kind, token_hash, scopes, expires_at)
        VALUES (?, ?, ?, 'login_link', ?, ?, ?)`)
        .bind(change.id, credential.club_id, change.memberId, change.hash, JSON.stringify(change.scopes), change.expiresAt),
      audit("member.login_link.created", change.memberId, {
        login_link_id: change.id, expires_at: new Date(change.expiresAt).toISOString(),
      }),
    );
  } else if (change.type === "exchange") {
    writes.push(
      db.prepare("DELETE FROM access_grant WHERE id = ? AND club_id = ? AND kind = 'login_link'")
        .bind(credential.id, credential.club_id),
      db.prepare(`INSERT INTO access_grant (id, club_id, member_id, kind, token_hash, scopes)
        VALUES (?, ?, ?, 'session', ?, ?)`)
        .bind(change.id, credential.club_id, credential.member_id, change.hash, JSON.stringify(change.scopes)),
      audit("member.signed_in", credential.member_id!, { login_link_id: credential.id, session_id: change.id }),
    );
  } else if (change.type === "sign_out") {
    writes.push(
      db.prepare("DELETE FROM access_grant WHERE id = ? AND club_id = ? AND kind = 'session'")
        .bind(credential.id, credential.club_id),
      audit("member.signed_out", credential.member_id!, { session_id: credential.id }),
    );
  } else if (change.type === "sign_out_everywhere") {
    writes.push(
      db.prepare("DELETE FROM access_grant WHERE member_id = ? AND club_id = ?")
        .bind(change.memberId, credential.club_id),
      audit("member.signed_out_everywhere", change.memberId, { sessions_ended: state.sessions }),
    );
  }
  await commitAuthorized(db, state, writes);
}

/** Shared credential/usage guard for any D1 domain operation. Additional reads
 * may follow writes in the batch so the response represents that exact commit. */
export async function commitAuthorized(db: D1Database, state: IdentitySnapshot, writes: D1PreparedStatement[]): Promise<D1Result[]> {
  const credential = state.credential;
  if (!credential) throw new Error("An operation requires a credential");
  const touch = credential.kind === "api_key"
    && (credential.last_used_at === null || credential.last_used_at < state.now - 60_000);
  if (writes.length === 0 && !touch) return [];
  const guards: D1PreparedStatement[] = [
    // Time passing doesn't change the revision. This guard runs at commit,
    // before consuming the link or making any state/audit/usage changes.
    db.prepare(`INSERT INTO credential_guard (singleton, valid) SELECT 1, CASE WHEN
      (? = 'api_key' AND EXISTS (SELECT 1 FROM api_key WHERE key_hash = ? AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > unixepoch('subsec') * 1000)))
      OR (? <> 'api_key' AND EXISTS (
        SELECT 1 FROM access_grant a JOIN member m ON m.id = a.member_id AND m.club_id = a.club_id
        WHERE a.token_hash = ? AND a.kind = ? AND m.deleted_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at > unixepoch('subsec') * 1000)))
      THEN 1 ELSE 0 END WHERE true
      ON CONFLICT(singleton) DO UPDATE SET valid = excluded.valid`)
      .bind(state.kind, state.hash, state.kind, state.hash, state.kind),
  ];
  if (touch) guards.push(db.prepare(`UPDATE api_key SET last_used_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
    WHERE id = ? AND club_id = ?`).bind(credential.id, credential.club_id));

  try {
    const results = await commitMutation(db, state.snapshot, [...guards, ...writes]);
    return results.slice(guards.length);
  } catch (error) {
    for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
      if (/CHECK constraint failed: credential_still_valid\b/.test(cause.message)) throw new CredentialExpiredError();
    }
    throw error;
  }
}

export function eventStatement(
  db: D1Database, clubId: string, type: string, subjectType: string, subjectId: string,
  actor: { type: "system" | "api_key" | "member"; id: string | null }, payload: object,
): D1PreparedStatement {
  return db.prepare(`INSERT INTO event (club_id, type, subject_type, subject_id, actor_type, actor_id, payload)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(clubId, type, subjectType, subjectId, actor.type, actor.id, JSON.stringify(payload));
}

export async function readInstallation(db: D1Database) {
  const snapshot = await readSnapshot(db, [
    db.prepare("SELECT id FROM club WHERE singleton = 1"),
    // The append-only event commits last with the whole sample. It remains a
    // completion marker even if the owner later edits or archives the sample.
    db.prepare(`SELECT 1 AS complete FROM event WHERE club_id = (SELECT id FROM club WHERE singleton = 1)
      AND type = 'installation.sample.created' LIMIT 1`),
  ]);
  return { snapshot, initialized: snapshot.results[0]!.results.length !== 0,
    sampleCreated: snapshot.results[1]!.results.length !== 0 };
}

export async function initializeClub(
  db: D1Database, snapshot: Snapshot,
  club: ClubRecord, key: { id: string; hash: string; prefix: string; scopes: readonly string[] },
  websiteKey?: { id: string; hash: string; prefix: string; scopes: readonly string[] },
  initialData: D1PreparedStatement[] = [],
): Promise<void> {
  await commitMutation(db, snapshot, [
    db.prepare("INSERT INTO club (id, slug, name, timezone) VALUES (?, ?, ?, ?)")
      .bind(club.id, club.slug, club.name, club.timezone),
    db.prepare("INSERT INTO api_key (id, club_id, name, key_hash, prefix, scopes) VALUES (?, ?, 'Admin key (from setup)', ?, ?, ?)")
      .bind(key.id, club.id, key.hash, key.prefix, JSON.stringify(key.scopes)),
    eventStatement(db, club.id, "club.created", "club", club.id, { type: "system", id: null }, {}),
    eventStatement(db, club.id, "api_key.created", "api_key", key.id, { type: "system", id: null }, { scopes: key.scopes }),
    ...(websiteKey ? [
      db.prepare("INSERT INTO api_key (id, club_id, name, key_hash, prefix, scopes) VALUES (?, ?, 'Website', ?, ?, ?)")
        .bind(websiteKey.id, club.id, websiteKey.hash, websiteKey.prefix, JSON.stringify(websiteKey.scopes)),
      eventStatement(db, club.id, "api_key.created", "api_key", websiteKey.id, { type: "system", id: null }, { scopes: websiteKey.scopes }),
    ] : []),
    ...initialData,
  ]);
}
