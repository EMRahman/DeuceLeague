import type { D1Database } from "@cloudflare/workers-types";
import { commitMutation, readSnapshot, retryMutation } from "./atomic.js";
import { commitAuthorized, eventStatement, readIdentity, type CredentialKind, type IdentitySnapshot } from "./identity.js";

/** How long a join request waits for the coach before it is deleted, unread. */
export const JOIN_REQUEST_DAYS = 30;
const WAIT_MS = JOIN_REQUEST_DAYS * 86_400_000;

export type JoinRequestRecord = {
  id: string; firstName: string; surname: string; email: string | null; phone: string | null;
  privacyNotice: string; createdAt: Date;
  /** A member already on the club's list with the same email address. */
  member: { id: string; displayName: string } | null;
};
export type NewJoinRequest = {
  id: string; firstName: string; surname: string; email: string | null; phone: string | null; privacyNotice: string;
};
export class JoinRequestExistsError extends Error {}

type Row = Record<string, unknown>;
function requestRecord(r: Row): JoinRequestRecord {
  return { id: String(r.id), firstName: String(r.first_name), surname: String(r.surname),
    email: r.email === null ? null : String(r.email), phone: r.phone === null ? null : String(r.phone),
    privacyNotice: String(r.privacy_notice), createdAt: new Date(Number(r.created_at)),
    member: r.member_json === null ? null : JSON.parse(String(r.member_json)) as JoinRequestRecord["member"] };
}

export type JoinRequestFilter = { id?: string; email?: string; after?: string | undefined; limit?: number };

/** Waiting requests, oldest first. One that has waited too long is gone, whether or not it is pruned yet. */
function requestsRead(db: D1Database, q: JoinRequestFilter) {
  return db.prepare(`SELECT r.id, r.first_name, r.surname, r.email, r.phone, r.privacy_notice, r.created_at,
      (SELECT json_object('id', m.id, 'displayName', m.display_name) FROM member m
        WHERE m.club_id = r.club_id AND lower(m.email) = lower(r.email) AND m.email IS NOT NULL
          AND m.deleted_at IS NULL) AS member_json
    FROM join_request r
    WHERE r.club_id = (SELECT id FROM club WHERE singleton = 1)
      AND r.created_at > CAST(unixepoch('subsec') * 1000 AS INTEGER) - ?
      AND (? IS NULL OR r.id = ?) AND (? IS NULL OR r.id > ?)
      AND (? IS NULL OR (r.email IS NOT NULL AND lower(r.email) = lower(?)))
    ORDER BY r.id LIMIT ?`)
    .bind(WAIT_MS, q.id ?? null, q.id ?? null, q.after ?? null, q.after ?? null, q.email ?? null, q.email ?? null,
      (q.limit ?? 1) + 1);
}

export async function readJoinRequests(db: D1Database, hash: string, kind: CredentialKind, q: JoinRequestFilter) {
  const identity = await readIdentity(db, hash, kind, null, [requestsRead(db, q)]);
  const records = (identity.extraResults[0]!.results as Row[]).map(requestRecord);
  const limit = q.limit ?? 1;
  const rows = records.slice(0, limit);
  return { identity, rows, next: records.length > limit ? rows.at(-1)!.id : null };
}

function actor(state: IdentitySnapshot) {
  const credential = state.credential!;
  return credential.kind === "api_key" ? { type: "api_key" as const, id: credential.id }
    : { type: "member" as const, id: credential.member_id! };
}

/**
 * Takes a request, and deletes those that have waited too long. The caller
 * has checked in its snapshot that nobody is waiting with the same email;
 * the unique index settles a race with another request.
 */
export async function createJoinRequest(db: D1Database, state: IdentitySnapshot, input: NewJoinRequest) {
  const clubId = state.club!.id;
  try {
    const result = await commitAuthorized(db, state, [
      db.prepare("DELETE FROM join_request WHERE created_at <= ?").bind(state.now - WAIT_MS),
      db.prepare(`INSERT INTO join_request (id, club_id, first_name, surname, email, phone, privacy_notice, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(input.id, clubId, input.firstName, input.surname, input.email, input.phone, input.privacyNotice, state.now),
      // Which fields they gave, never the values: the log cannot be erased.
      eventStatement(db, clubId, "join_request.received", "join_request", input.id, actor(state), {
        fields: ["first_name", "surname", ...(input.email ? ["email"] : []), ...(input.phone ? ["phone"] : [])],
        privacy_notice: input.privacyNotice,
      }),
      requestsRead(db, { id: input.id }),
    ]);
    return requestRecord((result.at(-1)!.results as Row[])[0]!);
  } catch (error) {
    for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
      if (/UNIQUE constraint failed: index ['"]join_request_email_uq['"]/.test(cause.message)) throw new JoinRequestExistsError();
    }
    throw error;
  }
}

/** Declining deletes the request: nothing they sent is kept. */
export async function declineJoinRequest(db: D1Database, state: IdentitySnapshot, id: string) {
  const clubId = state.club!.id;
  await commitAuthorized(db, state, [
    db.prepare("DELETE FROM join_request WHERE id = ? AND club_id = ?").bind(id, clubId),
    eventStatement(db, clubId, "join_request.declined", "join_request", id, actor(state), {}),
  ]);
}

/**
 * Deletes what the club promised not to keep: join requests nobody decided
 * within 30 days, and the website's join counts from before today, which hold
 * scrambled connection addresses. Run on a schedule, so nothing waits for the
 * next request to be cleared. Writes nothing when there is nothing to delete.
 */
export async function purgeExpired(db: D1Database): Promise<{ joinRequests: number; joinCounts: number }> {
  return retryMutation(async () => {
    const snapshot = await readSnapshot(db, [
      db.prepare("SELECT CAST(unixepoch('subsec') * 1000 AS INTEGER) AS now, CAST(unixepoch() / 86400 AS INTEGER) AS day"),
      db.prepare(`SELECT EXISTS (SELECT 1 FROM join_request WHERE created_at <= CAST(unixepoch('subsec') * 1000 AS INTEGER) - ?)
        OR EXISTS (SELECT 1 FROM website_join_limit WHERE day < CAST(unixepoch() / 86400 AS INTEGER)) AS due`).bind(WAIT_MS),
    ]);
    const { now, day } = snapshot.results[0]!.results[0] as { now: number; day: number };
    if (!(snapshot.results[1]!.results[0] as { due: number }).due) return { joinRequests: 0, joinCounts: 0 };
    const [requests, counts] = await commitMutation(db, snapshot, [
      db.prepare("DELETE FROM join_request WHERE created_at <= ?").bind(now - WAIT_MS),
      db.prepare("DELETE FROM website_join_limit WHERE day < ?").bind(day),
    ]);
    return { joinRequests: requests!.meta.changes, joinCounts: counts!.meta.changes };
  });
}
