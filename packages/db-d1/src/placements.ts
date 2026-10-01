import type { D1Database } from "@cloudflare/workers-types";
import { StaleSnapshotError } from "./atomic.js";
import { commitAuthorized, type CredentialKind } from "./identity.js";
import { readLeague } from "./league.js";
import type { DivisionRecord, EntryRecord, LeagueEvent } from "./league-types.js";
import { ledgerRead, ledgerRecords } from "./views.js";
import { partnerChoiceRecords } from "./partner-choices.js";

export async function readPlacements(db: D1Database, hash: string, kind: CredentialKind, targetId: string) {
  const snapshot = await readLeague(db, hash, kind, { competitionId: targetId, includePrevious: true }, [
    ledgerRead(db, null, null, targetId),
    db.prepare(`SELECT DISTINCT m.id, CASE WHEN m.deleted_at IS NOT NULL THEN 'removed' WHEN m.status = 'left' THEN 'left'
        ELSE 'paused' END AS how FROM member m JOIN entry_member em ON em.member_id = m.id
      WHERE em.competition_id = (SELECT previous_competition_id FROM competition WHERE id = ?)
        AND (m.deleted_at IS NOT NULL OR m.status IN ('left', 'paused'))`).bind(targetId),
    db.prepare(`SELECT * FROM partner_choice WHERE competition_id = (SELECT previous_competition_id FROM competition WHERE id = ?)`).bind(targetId),
  ]);
  return { ...snapshot, ledger: ledgerRecords(snapshot.extraResults[0]!), gone: new Map(snapshot.extraResults[1]!.results.map((r) => [String((r as { id: string }).id), (r as { how: "removed" | "left" | "paused" }).how])),
    partnerChoices: partnerChoiceRecords(snapshot.extraResults[2]!) };
}
export type PlacementSnapshot = Awaited<ReturnType<typeof readPlacements>>;
export type PlacementWrites = { previousId: string; final: boolean; divisions: DivisionRecord[]; entries: EntryRecord[]; events: LeagueEvent[] };

/** Fixed five statements for every draft size: clock check, divisions, entries, lineups, audits.
 * Credential/club revision guards wrap the whole batch; no partial chunks.
 */
export async function commitPlacements(db: D1Database, snapshot: PlacementSnapshot, plan: PlacementWrites) {
  const identity = snapshot.identity;
  const actor = identity.credential!;
  const divisions = JSON.stringify(plan.divisions);
  const entries = JSON.stringify(plan.entries);
  const lineups = JSON.stringify(plan.entries.flatMap((entry) => entry.members.map((member) => ({ entryId: entry.id, competitionId: entry.competitionId, memberId: member.id, role: member.role }))));
  const writes = [
    db.prepare(`INSERT INTO placement_deadline_guard (singleton, valid)
      SELECT 1, CASE WHEN EXISTS (SELECT 1 FROM competition c JOIN season s ON s.id = c.season_id
        WHERE c.id = ? AND (c.state IN ('complete', 'archived') OR coalesce(s.results_deadline_at <= unixepoch('subsec') * 1000, false)) = ?)
      THEN 1 ELSE 0 END WHERE true ON CONFLICT(singleton) DO UPDATE SET valid = excluded.valid`).bind(plan.previousId, plan.final ? 1 : 0),
    db.prepare(`INSERT INTO division (id, club_id, competition_id, ordinal, name, target_size, created_at, updated_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.competitionId'), json_extract(value, '$.ordinal'),
        json_extract(value, '$.name'), json_extract(value, '$.targetSize'), ?, ? FROM json_each(?)`)
      .bind(identity.club!.id, identity.now, identity.now, divisions),
    db.prepare(`INSERT INTO entry (id, club_id, competition_id, division_id, display_name, seed, state, placement_reason, previous_entry_id, created_at, updated_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.competitionId'), json_extract(value, '$.divisionId'),
        json_extract(value, '$.displayName'), NULL, 'active', json_extract(value, '$.placementReason'), json_extract(value, '$.previousEntryId'), ?, ?
      FROM json_each(?)`).bind(identity.club!.id, identity.now, identity.now, entries),
    db.prepare(`INSERT INTO entry_member (entry_id, member_id, competition_id, club_id, role)
      SELECT json_extract(value, '$.entryId'), json_extract(value, '$.memberId'), json_extract(value, '$.competitionId'), ?, json_extract(value, '$.role')
      FROM json_each(?)`).bind(identity.club!.id, lineups),
    db.prepare(`INSERT INTO event (club_id, type, subject_type, subject_id, actor_type, actor_id, payload)
      SELECT ?, json_extract(value, '$.type'), json_extract(value, '$.subjectType'), json_extract(value, '$.id'), ?, ?, json_extract(value, '$.payload')
      FROM json_each(?) ORDER BY CAST(key AS INTEGER)`)
      .bind(identity.club!.id, actor.kind === "api_key" ? "api_key" : "member", actor.kind === "api_key" ? actor.id : actor.member_id, JSON.stringify(plan.events)),
  ];
  try { await commitAuthorized(db, identity, writes); }
  catch (error) {
    const seen = new Set();
    for (let cause: unknown = error; cause instanceof Error && !seen.has(cause); cause = cause.cause) {
      seen.add(cause);
      if (/CHECK constraint failed: placement_deadline_current\b/.test(cause.message)) throw new StaleSnapshotError();
    }
    throw error;
  }
}
