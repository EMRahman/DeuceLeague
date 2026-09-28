import type { D1Database, D1Result } from "@cloudflare/workers-types";
import { readIdentity, type CredentialKind } from "./identity.js";
import { readLeague } from "./league.js";
import type { LedgerMatch } from "./view-types.js";

type Row = Record<string, unknown>;
const string = (v: unknown) => v === null ? null : String(v);
const number = (v: unknown) => v === null ? null : Number(v);

/** Fixed SQL shared by normal table reads and previous-competition placement reads. */
export function ledgerRead(db: D1Database, competitionId: string | null, entryId: string | null = null, previousOf: string | null = null) {
  return db.prepare(`SELECT m.id, m.division_id, m.status, m.outcome, m.winning_side, m.retired_side, m.score,
    s0.entry_id AS side0, s1.entry_id AS side1 FROM match m
    LEFT JOIN match_side s0 ON s0.match_id = m.id AND s0.side_index = 0
    LEFT JOIN match_side s1 ON s1.match_id = m.id AND s1.side_index = 1
    WHERE m.competition_id = coalesce(?, (SELECT competition_id FROM entry WHERE id = ?),
      (SELECT previous_competition_id FROM competition WHERE id = ?)) ORDER BY m.id`).bind(competitionId, entryId, previousOf);
}
export function ledgerRecords(result: D1Result): LedgerMatch[] {
  return (result.results as Row[]).map((r) => ({ id: String(r.id), divisionId: string(r.division_id), side0: string(r.side0), side1: string(r.side1),
    status: String(r.status), outcome: string(r.outcome), winningSide: number(r.winning_side), retiredSide: number(r.retired_side),
    score: r.score === null ? null : JSON.parse(String(r.score)) }));
}

/** League structure, accepted ledger, credential and clock from one snapshot. */
export async function readLeagueViews(db: D1Database, hash: string, kind: CredentialKind, query: { competitionId: string } | { entryId: string }) {
  const snapshot = await readLeague(db, hash, kind, query, [
    ledgerRead(db, "competitionId" in query ? query.competitionId : null, "entryId" in query ? query.entryId : null),
    db.prepare("SELECT timezone FROM club WHERE singleton = 1"),
  ]);
  return { ...snapshot, ledger: ledgerRecords(snapshot.extraResults[0]!), timezone: String((snapshot.extraResults[1]!.results[0] as Row).timezone) };
}

/** No email leaves D1 without the requesting live key's PII scope in this snapshot.
 * Aggregate only outstanding matches; duplicates in waiting_on are intentional.
 */
export async function readChase(db: D1Database, hash: string, kind: CredentialKind, competitionId?: string) {
  const identity = await readIdentity(db, hash, kind, null, [
    db.prepare(`WITH sides AS (
      SELECT m.competition_id, c.name AS competition_name, m.division_id, d.name AS division_name, d.ordinal,
        season.results_deadline_at, cl.timezone, em.member_id, opponent.label AS opponent_label,
        EXISTS (SELECT 1 FROM result_submission r WHERE r.match_id = m.id AND r.side_index = own.side_index AND r.state = 'pending') AS claimed,
        EXISTS (SELECT 1 FROM result_submission r WHERE r.match_id = m.id AND r.side_index <> own.side_index AND r.state = 'pending') AS opponent_claimed
      FROM match m JOIN competition c ON c.id = m.competition_id JOIN season ON season.id = c.season_id
      JOIN club cl ON cl.id = m.club_id LEFT JOIN division d ON d.id = m.division_id
      JOIN match_side own ON own.match_id = m.id JOIN entry_member em ON em.entry_id = own.entry_id
      LEFT JOIN match_side other ON other.match_id = m.id AND other.side_index <> own.side_index
      LEFT JOIN entry_label opponent ON opponent.entry_id = other.entry_id
      WHERE m.status IN ('open', 'reported', 'disputed') AND (? IS NULL OR m.competition_id = ?)
    ), permission AS (
      SELECT EXISTS (SELECT 1 FROM api_key k, json_each(k.scopes) s WHERE k.key_hash = ? AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at > unixepoch('subsec') * 1000) AND s.value = 'members:pii') AS pii
    ) SELECT sides.competition_id, sides.competition_name, sides.division_id, sides.division_name, sides.ordinal,
      sides.results_deadline_at, sides.timezone, mb.id AS member_id, mb.display_name,
      CASE WHEN permission.pii THEN json_object('email', mb.email) ELSE NULL END AS personal_json,
      count(*) AS outstanding_matches,
      sum(NOT claimed AND NOT opponent_claimed) AS needs_playing,
      sum(opponent_claimed) AS awaiting_you,
      sum(claimed AND NOT opponent_claimed) AS awaiting_them,
      json_group_array(opponent_label ORDER BY opponent_label) AS waiting_on
    FROM sides JOIN member mb ON mb.id = sides.member_id AND mb.deleted_at IS NULL CROSS JOIN permission
    GROUP BY sides.competition_id, sides.division_id, mb.id
    ORDER BY outstanding_matches DESC, mb.display_name, sides.ordinal`).bind(competitionId ?? null, competitionId ?? null, hash),
  ]);
  const rows = (identity.extraResults[0]!.results as Row[]).map((r) => ({
    competitionId: String(r.competition_id), competitionName: String(r.competition_name),
    divisionId: r.division_id as string, divisionName: r.division_name as string, divisionOrdinal: Number(r.ordinal ?? 0),
    memberId: String(r.member_id), displayName: String(r.display_name),
    ...(r.personal_json === null ? {} : JSON.parse(String(r.personal_json)) as { email: string | null }),
    outstandingMatches: Number(r.outstanding_matches), needsPlaying: Number(r.needs_playing), awaitingYou: Number(r.awaiting_you), awaitingThem: Number(r.awaiting_them),
    deadline: r.results_deadline_at === null ? null : new Date(Number(r.results_deadline_at)), timezone: String(r.timezone),
    waitingOn: JSON.parse(String(r.waiting_on)) as string[],
  }));
  return { identity, rows };
}
