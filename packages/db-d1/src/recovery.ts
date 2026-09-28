import type { D1Database } from "@cloudflare/workers-types";
import { Scope } from "@deuceleague/schema";
import { commitMutation, readSnapshot, retryMutation } from "./atomic.js";
import { eventStatement, type ClubRecord } from "./identity.js";

/** Account-owner tooling only: deliberately not exported by the Worker entry point. */
export async function inspectRecovery(db: D1Database) {
  const snapshot = await readSnapshot(db, [db.prepare("SELECT id, slug, name, timezone FROM club WHERE singleton = 1")]);
  return { revision: snapshot.revision, club: (snapshot.results[0]!.results[0] as ClubRecord | undefined) ?? null };
}

export class RecoveryError extends Error {}

/** A saved recovery file identifies one operation. Replay confirms its result,
 * never resurrects a revoked/expired key and never retries ambiguous failures. */
export async function recoverAdministrator(db: D1Database, input: {
  clubId: string; slug: string; id: string; hash: string; prefix: string;
}) {
  if (!/^[0-9a-f-]{36}$/.test(input.clubId) || !/^[0-9a-f-]{36}$/.test(input.id)
    || !/^[0-9a-f]{64}$/.test(input.hash) || !/^dl_[A-Za-z0-9_-]{6}$/.test(input.prefix)) {
    throw new RecoveryError("Invalid recovery key metadata");
  }
  return retryMutation(async () => {
    const snapshot = await readSnapshot(db, [
      db.prepare("SELECT id, slug FROM club WHERE singleton = 1"),
      db.prepare(`SELECT id, key_hash, club_id, scopes,
        revoked_at IS NULL AND (expires_at IS NULL OR expires_at > unixepoch('subsec') * 1000) AS live,
        EXISTS (SELECT 1 FROM event e WHERE e.club_id = api_key.club_id
          AND e.type = 'api_key.recovered' AND e.subject_id = api_key.id) AS recovered
        FROM api_key WHERE id = ? OR key_hash = ?`).bind(input.id, input.hash),
    ]);
    const club = snapshot.results[0]!.results[0] as { id: string; slug: string } | undefined;
    if (!club || club.id !== input.clubId || club.slug !== input.slug) throw new RecoveryError("Club identity does not match; nothing changed");
    const keys = snapshot.results[1]!.results as { id: string; key_hash: string; club_id: string;
      scopes: string; live: number; recovered: number }[];
    if (keys.length) {
      const key = keys[0]!;
      if (keys.length !== 1 || key.id !== input.id || key.key_hash !== input.hash || key.club_id !== input.clubId || !key.recovered) {
        throw new RecoveryError("Recovery key conflicts with an existing credential; nothing changed");
      }
      const scopes = JSON.parse(String(key.scopes)) as string[];
      if (!key.live || Scope.options.some((s) => !scopes.includes(s))) throw new RecoveryError("This recovery key is no longer usable; prepare a new recovery file");
      return { id: input.id, status: "already_applied" as const };
    }
    await commitMutation(db, snapshot, [
      db.prepare(`INSERT INTO api_key (id, club_id, name, key_hash, prefix, scopes)
        VALUES (?, ?, 'Account-owner recovery', ?, ?, ?)`)
        .bind(input.id, input.clubId, input.hash, input.prefix, JSON.stringify(Scope.options)),
      eventStatement(db, input.clubId, "api_key.created", "api_key", input.id,
        { type: "system", id: null }, { scopes: Scope.options, recovery: true }),
      eventStatement(db, input.clubId, "api_key.recovered", "api_key", input.id,
        { type: "system", id: null }, { method: "account_owner_cli" }),
    ]);
    return { id: input.id, status: "created" as const };
  });
}
