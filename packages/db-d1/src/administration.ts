import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import { commitAuthorized, eventStatement, readIdentity, type CredentialKind, type IdentitySnapshot } from "./identity.js";
import type { ApiKeyRecord, FullClubRecord, MemberChanges, MemberRecord } from "./admin-types.js";

type Row = Record<string, unknown>;
const date = (value: unknown): Date | null => value === null ? null : new Date(Number(value));
const string = (value: unknown): string | null => value === null ? null : String(value);
const rows = (result: D1Result): Row[] => result.results as Row[];
export type AdminSnapshot<T> = { identity: IdentitySnapshot; rows: T[]; next: string | null };
export type AdminPage = { id?: string; limit?: number; after?: string | undefined };
export type MemberFilter = AdminPage & { status?: string | undefined; email?: string | undefined; includeRemoved?: boolean };

/** Keep three-decimal ratings: decimal ties round away from zero.
 * SQLite round() uses a binary float, which rounds e.g. 1.2345 differently.
 */
function rating(value: string | null | undefined): number | null {
  if (value == null) return null;
  const negative = value.startsWith("-");
  const [mantissa, exponent = "0"] = value.replace(/^-/, "").toLowerCase().split("e");
  const [whole, fraction = ""] = mantissa!.split(".");
  const digits = BigInt(whole! + fraction);
  const shift = Number(exponent) - fraction.length + 3;
  const divisor = 10n ** BigInt(Math.max(0, -shift));
  const scaled = shift >= 0 ? digits * 10n ** BigInt(shift)
    : digits / divisor + (digits % divisor * 2n >= divisor ? 1n : 0n);
  return Number(scaled) / 1000 * (negative ? -1 : 1);
}

function page<T extends { id: string }>(identity: IdentitySnapshot, records: T[], limit: number): AdminSnapshot<T> {
  const selected = records.slice(0, limit);
  return { identity, rows: selected, next: records.length > limit ? selected.at(-1)!.id : null };
}
function clubRecord(r: Row): FullClubRecord {
  return { id: String(r.id), slug: String(r.slug), name: String(r.name), timezone: String(r.timezone),
    branding: JSON.parse(String(r.branding)), createdAt: date(r.created_at)!, updatedAt: date(r.updated_at)! };
}
function keyRecord(r: Row): ApiKeyRecord {
  return { id: String(r.id), name: String(r.name), prefix: String(r.prefix), scopes: JSON.parse(String(r.scopes)) as string[],
    lastUsedAt: date(r.last_used_at), expiresAt: date(r.expires_at), revokedAt: date(r.revoked_at), createdAt: date(r.created_at)! };
}
function memberRecord(r: Row): MemberRecord {
  return { id: String(r.id), displayName: String(r.display_name), status: String(r.status), rating: string(r.rating),
    ratingSystem: string(r.rating_system), level: r.level === null ? null : Number(r.level), joinedOn: string(r.joined_on), deletedAt: date(r.deleted_at),
    signedInAt: date(r.signed_in_at), createdAt: date(r.created_at)!, updatedAt: date(r.updated_at)!,
    ...(r.personal_json === null ? {} : JSON.parse(String(r.personal_json)) as object) };
}
function clubRead(db: D1Database) {
  return db.prepare("SELECT id, slug, name, timezone, branding, created_at, updated_at FROM club WHERE singleton = 1");
}
function keysRead(db: D1Database, q: AdminPage) {
  return db.prepare(`SELECT id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at FROM api_key
    WHERE club_id = (SELECT id FROM club WHERE singleton = 1)
      AND (? IS NULL OR id = ?) AND (? IS NULL OR id > ?) ORDER BY id LIMIT ?`)
    .bind(q.id ?? null, q.id ?? null, q.after ?? null, q.after ?? null, (q.limit ?? 1) + 1);
}
function membersRead(db: D1Database, hash: string, filter: MemberFilter) {
  // Personal fields only leave D1 if the requesting key still holds the scope
  // in THIS snapshot. A stale middleware permission cannot fetch private data.
  return db.prepare(`WITH q AS (SELECT ? AS filter), permission AS (
    SELECT EXISTS (SELECT 1 FROM api_key k, json_each(k.scopes) s WHERE k.key_hash = ?
      AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > unixepoch('subsec') * 1000)
      AND s.value = 'members:pii') AS pii
    ) SELECT m.id, m.display_name, m.status, m.rating, m.rating_system, m.level, m.joined_on,
      m.deleted_at, m.created_at, m.updated_at,
      -- Sessions are deleted when they end, so this is the newest one still signed in.
      (SELECT max(g.created_at) FROM access_grant g WHERE g.member_id = m.id AND g.club_id = m.club_id
        AND g.kind = 'session') AS signed_in_at,
      CASE WHEN permission.pii THEN json_object('fullName', m.full_name, 'email', m.email, 'phone', m.phone,
        'dateOfBirth', m.date_of_birth, 'gender', m.gender, 'ageGroup', m.age_group, 'notes', m.notes) ELSE NULL END AS personal_json
    FROM member m, q, permission WHERE m.club_id = (SELECT id FROM club WHERE singleton = 1)
      AND (json_extract(q.filter, '$.id') IS NULL OR m.id = json_extract(q.filter, '$.id'))
      AND (json_extract(q.filter, '$.after') IS NULL OR m.id > json_extract(q.filter, '$.after'))
      AND (json_extract(q.filter, '$.status') IS NULL OR m.status = json_extract(q.filter, '$.status'))
      AND (json_extract(q.filter, '$.email') IS NULL OR lower(m.email) = lower(json_extract(q.filter, '$.email')))
      AND (json_extract(q.filter, '$.includeRemoved') = 1 OR m.deleted_at IS NULL)
    ORDER BY m.id LIMIT ?`)
    .bind(JSON.stringify({ ...filter, includeRemoved: filter.includeRemoved ?? Boolean(filter.id) }), hash, (filter.limit ?? 1) + 1);
}
export async function readClubAdmin(db: D1Database, hash: string, kind: CredentialKind) {
  const identity = await readIdentity(db, hash, kind, null, [clubRead(db)]);
  return { identity, club: clubRecord(rows(identity.extraResults[0]!)[0]!) };
}
export async function readKeysAdmin(db: D1Database, hash: string, kind: CredentialKind, q: AdminPage) {
  const identity = await readIdentity(db, hash, kind, null, [keysRead(db, q),
    db.prepare(`SELECT EXISTS (SELECT 1 FROM api_key k, json_each(k.scopes) s
      WHERE k.club_id = (SELECT id FROM club WHERE singleton = 1) AND k.id <> ? AND s.value = 'admin'
        AND k.revoked_at IS NULL AND (k.expires_at IS NULL OR k.expires_at > unixepoch('subsec') * 1000)) AS live`)
      .bind(q.id ?? null),
  ]);
  return { ...page(identity, rows(identity.extraResults[0]!).map(keyRecord), q.limit ?? 1),
    anotherAdmin: Boolean(rows(identity.extraResults[1]!)[0]!.live) };
}
/** Return current usage timestamps, including the requesting key's first use. */
export async function finishKeysRead(db: D1Database, state: AdminSnapshot<ApiKeyRecord>, q: AdminPage) {
  const key = state.identity.credential!;
  if (key.kind !== "api_key" || (key.last_used_at !== null && key.last_used_at >= state.identity.now - 60_000)) return state;
  const result = await commitAuthorized(db, state.identity, [keysRead(db, q)]);
  return page(state.identity, rows(result.at(-1)!).map(keyRecord), q.limit ?? 1);
}
export async function readMembersAdmin(db: D1Database, hash: string, kind: CredentialKind, q: MemberFilter) {
  const identity = await readIdentity(db, hash, kind, null, [membersRead(db, hash, q)]);
  return page(identity, rows(identity.extraResults[0]!).map(memberRecord), q.limit ?? 1);
}
function audit(db: D1Database, state: IdentitySnapshot, type: string, subjectType: string, id: string, payload: object = {}) {
  const credential = state.credential!;
  return eventStatement(db, credential.club_id, type, subjectType, id,
    credential.kind === "api_key" ? { type: "api_key", id: credential.id } : { type: "member", id: credential.member_id! }, payload);
}
export async function updateClubAdmin(db: D1Database, state: IdentitySnapshot, changes: { name?: string; timezone?: string; branding?: Record<string, unknown> }) {
  const result = await commitAuthorized(db, state, [
    db.prepare(`UPDATE club SET name = coalesce(?, name), timezone = coalesce(?, timezone), branding = coalesce(?, branding), updated_at = ?
      WHERE id = ?`).bind(changes.name ?? null, changes.timezone ?? null,
        changes.branding === undefined ? null : JSON.stringify(changes.branding), state.now, state.club!.id),
    audit(db, state, "club.updated", "club", state.club!.id, { changed: Object.keys(changes) }), clubRead(db),
  ]);
  return clubRecord(rows(result.at(-1)!)[0]!);
}

export class LastAdminError extends Error {}
export class DuplicateEmailError extends Error {}
function errorMatches(error: unknown, pattern: RegExp): boolean {
  const seen = new Set<unknown>();
  for (let cause: unknown = error; cause instanceof Error && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (pattern.test(cause.message)) return true;
  }
  return false;
}
export async function createKeyAdmin(db: D1Database, state: IdentitySnapshot, input: {
  id: string; name: string; hash: string; prefix: string; scopes: string[]; expiresAt: Date | null;
}) {
  const result = await commitAuthorized(db, state, [
    db.prepare(`INSERT INTO api_key (id, club_id, name, key_hash, prefix, scopes, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(input.id, state.club!.id, input.name, input.hash, input.prefix, JSON.stringify(input.scopes), input.expiresAt?.getTime() ?? null),
    audit(db, state, "api_key.created", "api_key", input.id, { name: input.name, scopes: input.scopes, expires_at: input.expiresAt?.toISOString() ?? null }),
    keysRead(db, { id: input.id }),
  ]);
  return keyRecord(rows(result.at(-1)!)[0]!);
}
export async function revokeKeyAdmin(db: D1Database, state: IdentitySnapshot, key: ApiKeyRecord) {
  const writes: D1PreparedStatement[] = [];
  if (key.scopes.includes("admin")) writes.push(db.prepare(`INSERT INTO admin_guard (singleton, valid)
    SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM api_key k, json_each(k.scopes) s
      WHERE k.club_id = ? AND k.id <> ? AND s.value = 'admin' AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > unixepoch('subsec') * 1000)) THEN 1 ELSE 0 END
    WHERE true ON CONFLICT(singleton) DO UPDATE SET valid = excluded.valid`).bind(state.club!.id, key.id));
  writes.push(
    db.prepare("UPDATE api_key SET revoked_at = coalesce(revoked_at, ?) WHERE id = ? AND club_id = ?").bind(state.now, key.id, state.club!.id),
    audit(db, state, "api_key.revoked", "api_key", key.id, { name: key.name }), keysRead(db, { id: key.id }),
  );
  try {
    const result = await commitAuthorized(db, state, writes);
    return keyRecord(rows(result.at(-1)!)[0]!);
  } catch (error) {
    if (errorMatches(error, /CHECK constraint failed: admin_survives\b/)) throw new LastAdminError();
    throw error;
  }
}

export type MemberMutation =
  | { type: "create"; changes: MemberChanges & { displayName: string }; fields: string[];
      /** The join request this member came from, deleted as they are added. */
      joinRequest?: { id: string; privacyNotice: string } }
  | { type: "patch"; changes: MemberChanges; fields: string[] }
  | { type: "remove" }
  | { type: "erase" };
export async function mutateMemberAdmin(db: D1Database, state: IdentitySnapshot, id: string, mutation: MemberMutation): Promise<MemberRecord> {
  const clubId = state.club!.id;
  const writes: D1PreparedStatement[] = [];
  if (mutation.type === "create") {
    const c = mutation.changes;
    writes.push(db.prepare(`INSERT INTO member (id, club_id, display_name, status, rating, rating_system, level, joined_on,
      full_name, email, phone, date_of_birth, gender, age_group, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, clubId, c.displayName, c.status ?? "active", rating(c.rating), c.ratingSystem ?? null, c.level ?? null, c.joinedOn ?? null,
        c.fullName ?? null, c.email ?? null, c.phone ?? null, c.dateOfBirth ?? null, c.gender ?? null, c.ageGroup ?? null, c.notes ?? null),
      audit(db, state, "member.created", "member", id, { fields: mutation.fields,
        ...(mutation.joinRequest ? { join_request_id: mutation.joinRequest.id, privacy_notice: mutation.joinRequest.privacyNotice } : {}) }));
    // Its member.created event, naming the request, is the record that it was approved.
    if (mutation.joinRequest) {
      writes.push(db.prepare("DELETE FROM join_request WHERE id = ? AND club_id = ?").bind(mutation.joinRequest.id, clubId));
    }
  } else if (mutation.type === "patch") {
    writes.push(db.prepare(`UPDATE member SET
      display_name = CASE WHEN json_type(input.changes, '$.displayName') IS NULL THEN display_name ELSE json_extract(input.changes, '$.displayName') END,
      status = CASE WHEN json_type(input.changes, '$.status') IS NULL THEN status ELSE json_extract(input.changes, '$.status') END,
      rating = CASE WHEN json_type(input.changes, '$.rating') IS NULL THEN rating ELSE json_extract(input.changes, '$.rating') END,
      rating_system = CASE WHEN json_type(input.changes, '$.ratingSystem') IS NULL THEN rating_system ELSE json_extract(input.changes, '$.ratingSystem') END,
      level = CASE WHEN json_type(input.changes, '$.level') IS NULL THEN level ELSE json_extract(input.changes, '$.level') END,
      joined_on = CASE WHEN json_type(input.changes, '$.joinedOn') IS NULL THEN joined_on ELSE json_extract(input.changes, '$.joinedOn') END,
      full_name = CASE WHEN json_type(input.changes, '$.fullName') IS NULL THEN full_name ELSE json_extract(input.changes, '$.fullName') END,
      email = CASE WHEN json_type(input.changes, '$.email') IS NULL THEN email ELSE json_extract(input.changes, '$.email') END,
      phone = CASE WHEN json_type(input.changes, '$.phone') IS NULL THEN phone ELSE json_extract(input.changes, '$.phone') END,
      date_of_birth = CASE WHEN json_type(input.changes, '$.dateOfBirth') IS NULL THEN date_of_birth ELSE json_extract(input.changes, '$.dateOfBirth') END,
      gender = CASE WHEN json_type(input.changes, '$.gender') IS NULL THEN gender ELSE json_extract(input.changes, '$.gender') END,
      age_group = CASE WHEN json_type(input.changes, '$.ageGroup') IS NULL THEN age_group ELSE json_extract(input.changes, '$.ageGroup') END,
      notes = CASE WHEN json_type(input.changes, '$.notes') IS NULL THEN notes ELSE json_extract(input.changes, '$.notes') END,
      updated_at = ? FROM (SELECT ? AS changes) input WHERE id = ? AND club_id = ? AND deleted_at IS NULL`)
      .bind(state.now, JSON.stringify({ ...mutation.changes,
        ...(mutation.changes.rating === undefined ? {} : { rating: rating(mutation.changes.rating) }) }), id, clubId),
      audit(db, state, "member.updated", "member", id, { changed: mutation.fields }));
  } else {
    if (mutation.type === "remove") writes.push(db.prepare(`UPDATE member SET deleted_at = coalesce(deleted_at, ?), updated_at = ?
      WHERE id = ? AND club_id = ?`).bind(state.now, state.now, id, clubId));
    else writes.push(
      db.prepare(`UPDATE member SET display_name = 'Erased member', full_name = NULL, email = NULL, phone = NULL,
        date_of_birth = NULL, gender = NULL, age_group = NULL, notes = NULL, rating = NULL, rating_system = NULL, level = NULL, joined_on = NULL,
        status = 'left', deleted_at = coalesce(deleted_at, ?), updated_at = ? WHERE id = ? AND club_id = ?`)
        .bind(state.now, state.now, id, clubId),
      db.prepare(`UPDATE entry SET display_name = NULL, updated_at = ? WHERE club_id = ? AND display_name IS NOT NULL
        AND id IN (SELECT entry_id FROM entry_member WHERE member_id = ? AND club_id = ?)`)
        .bind(state.now, clubId, id, clubId),
      db.prepare("UPDATE result_submission SET raw_input = NULL WHERE submitted_by_member_id = ? AND club_id = ?").bind(id, clubId),
      // Who they would partner, and who asked them: a choice is only ever made in a competition they play in.
      db.prepare(`DELETE FROM partner_choice WHERE member_id = ? AND club_id = ?
        AND competition_id IN (SELECT competition_id FROM entry_member WHERE member_id = ?)`).bind(id, clubId, id),
      db.prepare(`UPDATE partner_choice SET partner_id = NULL, confirmed_at = NULL, updated_at = ? WHERE partner_id = ? AND club_id = ?`)
        .bind(state.now, id, clubId),
    );
    writes.push(db.prepare("DELETE FROM access_grant WHERE member_id = ? AND club_id = ?").bind(id, clubId),
      audit(db, state, mutation.type === "erase" ? "member.erased" : "member.removed", "member", id));
  }
  try {
    const result = await commitAuthorized(db, state, [...writes, membersRead(db, state.hash, { id })]);
    return memberRecord(rows(result.at(-1)!)[0]!);
  } catch (error) {
    if (errorMatches(error, /UNIQUE constraint failed: index ['"]member_club_email_uq['"]/)) throw new DuplicateEmailError();
    throw error;
  }
}
