import type { D1Database, D1Result } from "@cloudflare/workers-types";
import { readIdentity, type CredentialKind } from "./identity.js";
import { readLeague } from "./league.js";
import type { MatchFormat } from "@deuceleague/schema";
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
        own.entry_id,
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
      json_group_array(opponent_label ORDER BY opponent_label) AS waiting_on,
      sides.entry_id
    FROM sides JOIN member mb ON mb.id = sides.member_id AND mb.deleted_at IS NULL CROSS JOIN permission
    GROUP BY sides.competition_id, sides.division_id, mb.id
    ORDER BY outstanding_matches DESC, mb.display_name, sides.ordinal`).bind(competitionId ?? null, competitionId ?? null, hash),
    // What the tables are counted from, for each competition with a match outstanding:
    // how many each entry has played toward the minimum is the engine's to say.
    db.prepare(`SELECT c.id, c.rules, c.match_format FROM competition c
      WHERE (? IS NULL OR c.id = ?) AND EXISTS (SELECT 1 FROM match m
        WHERE m.competition_id = c.id AND m.status IN ('open', 'reported', 'disputed'))`).bind(competitionId ?? null, competitionId ?? null),
    db.prepare(`SELECT e.id, e.competition_id, e.division_id, e.state, el.label FROM entry e
      JOIN entry_label el ON el.entry_id = e.id
      WHERE (? IS NULL OR e.competition_id = ?) AND EXISTS (SELECT 1 FROM match m
        WHERE m.competition_id = e.competition_id AND m.status IN ('open', 'reported', 'disputed'))`)
      .bind(competitionId ?? null, competitionId ?? null),
    db.prepare(`SELECT m.id, m.competition_id, m.division_id, m.status, m.outcome, m.winning_side, m.retired_side, m.score,
      s0.entry_id AS side0, s1.entry_id AS side1 FROM match m
      LEFT JOIN match_side s0 ON s0.match_id = m.id AND s0.side_index = 0
      LEFT JOIN match_side s1 ON s1.match_id = m.id AND s1.side_index = 1
      WHERE (? IS NULL OR m.competition_id = ?) AND EXISTS (SELECT 1 FROM match o
        WHERE o.competition_id = m.competition_id AND o.status IN ('open', 'reported', 'disputed')) ORDER BY m.id`)
      .bind(competitionId ?? null, competitionId ?? null),
  ]);
  const rows = (identity.extraResults[0]!.results as Row[]).map((r) => ({
    competitionId: String(r.competition_id), competitionName: String(r.competition_name),
    divisionId: r.division_id as string, divisionName: r.division_name as string, divisionOrdinal: Number(r.ordinal ?? 0),
    memberId: String(r.member_id), displayName: String(r.display_name),
    ...(r.personal_json === null ? {} : JSON.parse(String(r.personal_json)) as { email: string | null }),
    outstandingMatches: Number(r.outstanding_matches), needsPlaying: Number(r.needs_playing), awaitingYou: Number(r.awaiting_you), awaitingThem: Number(r.awaiting_them),
    deadline: r.results_deadline_at === null ? null : new Date(Number(r.results_deadline_at)), timezone: String(r.timezone),
    waitingOn: JSON.parse(String(r.waiting_on)) as string[],
    entryId: String(r.entry_id),
  }));
  const [, competitions, entries, matches] = identity.extraResults.map((r) => r.results as Row[]);
  return {
    identity, rows,
    competitions: competitions!.map((c) => ({ id: String(c.id), rules: JSON.parse(String(c.rules)) as unknown,
      matchFormat: JSON.parse(String(c.match_format)) as MatchFormat })),
    entries: entries!.map((e) => ({ id: String(e.id), competitionId: String(e.competition_id), divisionId: String(e.division_id),
      state: String(e.state), label: String(e.label) })),
    ledger: ledgerRecords(identity.extraResults[3]!).map((m, i) => ({ ...m, competitionId: String(matches![i]!.competition_id) })),
  };
}

/** Everything a season's progress is counted from, in one snapshot: its competitions, their divisions and
 * entries, and each match's status. Scores are not read; progress counts matches, not results. */
export async function readSeasonProgress(db: D1Database, hash: string, kind: CredentialKind, seasonId: string) {
  const identity = await readIdentity(db, hash, kind, null, [
    db.prepare(`SELECT id, results_deadline_at FROM season
      WHERE id = ? AND club_id = (SELECT id FROM club WHERE singleton = 1)`).bind(seasonId),
    db.prepare(`SELECT id, name, discipline, state, visibility, rules, match_format FROM competition
      WHERE season_id = ? AND club_id = (SELECT id FROM club WHERE singleton = 1) ORDER BY id`).bind(seasonId),
    db.prepare(`SELECT d.id, d.competition_id, d.ordinal, d.name FROM division d
      JOIN competition c ON c.id = d.competition_id WHERE c.season_id = ? ORDER BY d.ordinal`).bind(seasonId),
    db.prepare(`SELECT e.id, e.competition_id, e.division_id, e.state, e.opted_out_at, el.label FROM entry e
      JOIN entry_label el ON el.entry_id = e.id JOIN competition c ON c.id = e.competition_id
      WHERE c.season_id = ? ORDER BY el.label, e.id`).bind(seasonId),
    db.prepare(`SELECT m.id, m.competition_id, m.division_id, m.status, m.outcome, m.winning_side, m.retired_side, m.score,
      s0.entry_id AS side0, s1.entry_id AS side1 FROM match m
      JOIN competition c ON c.id = m.competition_id
      LEFT JOIN match_side s0 ON s0.match_id = m.id AND s0.side_index = 0
      LEFT JOIN match_side s1 ON s1.match_id = m.id AND s1.side_index = 1
      WHERE c.season_id = ? ORDER BY m.id`).bind(seasonId),
    db.prepare("SELECT timezone FROM club WHERE singleton = 1"),
  ]);
  const [seasons, competitions, divisions, entries, matches, club] = identity.extraResults.map((r) => r.results as Row[]);
  const season = seasons![0];
  return {
    identity,
    season: season ? { id: String(season.id), deadline: season.results_deadline_at === null ? null : new Date(Number(season.results_deadline_at)) } : null,
    competitions: competitions!.map((c) => ({ id: String(c.id), name: String(c.name), discipline: String(c.discipline),
      state: String(c.state), visibility: String(c.visibility), rules: JSON.parse(String(c.rules)) as unknown,
      matchFormat: JSON.parse(String(c.match_format)) as MatchFormat })),
    divisions: divisions!.map((d) => ({ id: String(d.id), competitionId: String(d.competition_id), ordinal: Number(d.ordinal), name: String(d.name) })),
    entries: entries!.map((e) => ({ id: String(e.id), competitionId: String(e.competition_id), divisionId: String(e.division_id),
      state: String(e.state), optedOut: e.opted_out_at !== null, label: String(e.label) })),
    // Each match as the ledger holds it, for counting who has played how many.
    matches: ledgerRecords(identity.extraResults[4]!).map((m, i) => ({ ...m, competitionId: String(matches![i]!.competition_id) })),
    timezone: String(club![0]!.timezone),
  };
}
