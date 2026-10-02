import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import type { MatchFormat, RulesSpec, Score } from "@deuceleague/schema";
import { ledgerRecords } from "./views.js";
import type { LedgerMatch } from "./view-types.js";
import { commitAuthorized, eventStatement, readIdentity, type CredentialKind, type IdentitySnapshot } from "./identity.js";
import type { ClaimRecord, MatchRecord, ResultMutation } from "./result-types.js";

type Row = Record<string, unknown>;
const nullableString = (value: unknown): string | null => value === null ? null : String(value);
const nullableNumber = (value: unknown): number | null => value === null ? null : Number(value);
const score = (value: unknown): Score | null => value === null ? null : JSON.parse(String(value)) as Score;

function matchRecord(row: Row, sides: MatchRecord["sides"]): MatchRecord {
  return {
    id: String(row.id), clubId: String(row.club_id), competitionId: String(row.competition_id),
    divisionId: nullableString(row.division_id), competitionName: String(row.competition_name),
    divisionName: nullableString(row.division_name), status: String(row.status), outcome: nullableString(row.outcome),
    score: score(row.score), winningSide: nullableNumber(row.winning_side), retiredSide: nullableNumber(row.retired_side),
    playedOn: nullableString(row.played_on), acceptedSubmissionId: nullableString(row.accepted_submission_id),
    createdAt: new Date(Number(row.created_at)), updatedAt: new Date(Number(row.updated_at)), sides,
  };
}
function claimRecord(row: Row): ClaimRecord {
  return {
    id: String(row.id), clubId: String(row.club_id), matchId: String(row.match_id), sideIndex: nullableNumber(row.side_index),
    outcome: String(row.outcome), score: score(row.score), retiredSide: nullableNumber(row.retired_side),
    playedOn: nullableString(row.played_on), state: String(row.state), source: String(row.source),
    rawInput: nullableString(row.raw_input), submittedByMemberId: nullableString(row.submitted_by_member_id),
    acceptsSubmissionId: nullableString(row.accepts_submission_id), submittedAt: new Date(Number(row.submitted_at)),
    confirmedAt: row.confirmed_at === null ? null : new Date(Number(row.confirmed_at)),
  };
}

/** Exactly the same reads serve pre-decision snapshots and post-write responses. */
function resultReads(db: D1Database, matchId: string): D1PreparedStatement[] {
  return [
    db.prepare(`SELECT m.*, c.state AS competition_state, c.visibility, c.match_format, c.rules, s.results_deadline_at,
        c.name AS competition_name, d.name AS division_name
      FROM match m JOIN competition c ON c.id = m.competition_id AND c.club_id = m.club_id
      JOIN season s ON s.id = c.season_id AND s.club_id = c.club_id
      LEFT JOIN division d ON d.id = m.division_id AND d.competition_id = m.competition_id
      WHERE m.id = ? AND m.club_id = (SELECT id FROM club WHERE singleton = 1)`).bind(matchId),
    db.prepare(`SELECT s.side_index, s.entry_id,
      (SELECT label FROM entry_label el WHERE el.entry_id = s.entry_id AND el.club_id = s.club_id) AS label FROM match_side s
      WHERE s.match_id = ? AND s.club_id = (SELECT id FROM club WHERE singleton = 1) ORDER BY s.side_index`).bind(matchId),
    db.prepare(`SELECT * FROM result_submission
      WHERE match_id = ? AND club_id = (SELECT id FROM club WHERE singleton = 1) ORDER BY submitted_at, id`).bind(matchId),
  ];
}

export type ResultRecords = {
  match: MatchRecord | null;
  claims: ClaimRecord[];
  competition: { state: string; visibility: string; matchFormat: MatchFormat; rules: RulesSpec } | null;
  deadline: Date | null;
};
function resultRecords(results: D1Result[]): ResultRecords {
  const row = results[0]!.results[0] as Row | undefined;
  const sides = (results[1]!.results as Row[]).map((r) => ({ sideIndex: Number(r.side_index), entryId: nullableString(r.entry_id), label: nullableString(r.label) }));
  return {
    match: row ? matchRecord(row, sides) : null,
    claims: (results[2]!.results as Row[]).map(claimRecord),
    competition: row ? { state: String(row.competition_state), visibility: String(row.visibility), matchFormat: JSON.parse(String(row.match_format)) as MatchFormat,
      rules: JSON.parse(String(row.rules)) as RulesSpec } : null,
    deadline: row?.results_deadline_at == null ? null : new Date(Number(row.results_deadline_at)),
  };
}

export type SettlementStanding = {
  entries: { id: string; label: string; state: string }[];
  ledger: LedgerMatch[];
};
export type ResultSnapshot = ResultRecords & { identity: IdentitySnapshot; ownSide: number | null; standings?: SettlementStanding };
export async function readResult(db: D1Database, hash: string, kind: CredentialKind, matchId: string, withStandings = false): Promise<ResultSnapshot> {
  const identity = await readIdentity(db, hash, kind, null, [
    ...resultReads(db, matchId),
    db.prepare(`SELECT s.side_index FROM match_side s
      JOIN entry_member em ON em.entry_id = s.entry_id AND em.club_id = s.club_id
      JOIN access_grant a ON a.member_id = em.member_id AND a.club_id = em.club_id
      WHERE s.match_id = ? AND a.token_hash = ? AND a.kind = 'session'
        AND s.club_id = (SELECT id FROM club WHERE singleton = 1)`).bind(matchId, hash),
    ...(withStandings ? [
      db.prepare(`SELECT e.id, e.state, (SELECT label FROM entry_label WHERE entry_id = e.id) AS label
        FROM entry e WHERE e.division_id = (SELECT division_id FROM match WHERE id = ?)
        ORDER BY e.id`).bind(matchId),
      db.prepare(`SELECT m.id, m.division_id, m.status, m.outcome, m.winning_side, m.retired_side, m.score,
        s0.entry_id AS side0, s1.entry_id AS side1 FROM match m
        LEFT JOIN match_side s0 ON s0.match_id = m.id AND s0.side_index = 0
        LEFT JOIN match_side s1 ON s1.match_id = m.id AND s1.side_index = 1
        WHERE m.division_id = (SELECT division_id FROM match WHERE id = ?) ORDER BY m.id`).bind(matchId),
    ] : []),
  ]);
  const extra = identity.extraResults;
  const side = extra[3]!.results[0] as Row | undefined;
  return { identity, ...resultRecords(extra), ownSide: side ? Number(side.side_index) : null,
    ...(withStandings ? { standings: {
      entries: (extra[4]!.results as Row[]).map((r) => ({ id: String(r.id), label: String(r.label), state: String(r.state) })),
      ledger: ledgerRecords(extra[5]!),
    } } : {}) };
}

export class ResultDeadlineError extends Error {}

/** All claims, ledger changes, events and response reads share one guarded
 * batch. A response never accidentally includes a later coach correction. */
export async function commitResult(db: D1Database, state: ResultSnapshot, change: ResultMutation): Promise<ResultRecords> {
  if (!state.match) throw new Error("A result mutation requires a match");
  const { id: matchId, clubId } = state.match;
  const writes: D1PreparedStatement[] = [];
  if (change.enforceDeadline) {
    writes.push(db.prepare(`INSERT INTO result_deadline_guard (singleton, valid) SELECT 1, CASE WHEN EXISTS (
      SELECT 1 FROM match m JOIN competition c ON c.id = m.competition_id AND c.club_id = m.club_id
      JOIN season s ON s.id = c.season_id AND s.club_id = c.club_id
      WHERE m.id = ? AND m.club_id = ? AND (s.results_deadline_at IS NULL OR s.results_deadline_at > unixepoch('subsec') * 1000)
    ) THEN 1 ELSE 0 END WHERE true ON CONFLICT(singleton) DO UPDATE SET valid = excluded.valid`).bind(matchId, clubId));
  }
  // One bound JSON array avoids both dynamic SQL and SQLite's bind-variable
  // limit when a coach supersedes a long claim history.
  if (change.supersede.length) writes.push(db.prepare(`UPDATE result_submission SET state = 'superseded'
    WHERE match_id = ? AND club_id = ? AND id IN (SELECT value FROM json_each(?))`)
    .bind(matchId, clubId, JSON.stringify(change.supersede)));
  const c = change.claim;
  writes.push(db.prepare(`INSERT INTO result_submission
    (id, club_id, match_id, side_index, submitted_by_member_id, submitted_at, score, outcome,
      retired_side, played_on, state, confirmed_at, accepts_submission_id, source, raw_input)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(c.id, clubId, matchId, c.sideIndex, c.submittedByMemberId, c.submittedAt.getTime(),
      c.score === null ? null : JSON.stringify(c.score), c.outcome, c.retiredSide, c.playedOn,
      c.state, c.confirmedAt?.getTime() ?? null, c.acceptsSubmissionId, c.source, c.rawInput));
  if (change.confirm.length) writes.push(db.prepare(`UPDATE result_submission SET state = 'confirmed', confirmed_at = ?
    WHERE match_id = ? AND club_id = ? AND id IN (SELECT value FROM json_each(?))`)
    .bind(state.identity.now, matchId, clubId, JSON.stringify(change.confirm)));
  const ledger = change.ledger;
  if (ledger) {
    writes.push(db.prepare(`UPDATE match SET status = 'played', outcome = ?, score = ?, winning_side = ?, retired_side = ?,
      played_on = ?, accepted_submission_id = ?, updated_at = ? WHERE id = ? AND club_id = ?`)
      .bind(ledger.outcome, ledger.score === null ? null : JSON.stringify(ledger.score), ledger.winningSide, ledger.retiredSide,
        ledger.playedOn, ledger.claimId, state.identity.now, matchId, clubId));
  } else writes.push(db.prepare("UPDATE match SET status = ?, updated_at = ? WHERE id = ? AND club_id = ?")
    .bind(change.status, state.identity.now, matchId, clubId));
  const credential = state.identity.credential!;
  const actor = credential.kind === "api_key" ? { type: "api_key" as const, id: credential.id }
    : { type: "member" as const, id: credential.member_id! };
  for (const event of change.events) writes.push(eventStatement(db, clubId, event.type, "match", matchId, actor, event.payload));
  try {
    const result = await commitAuthorized(db, state.identity, [...writes, ...resultReads(db, matchId)]);
    return resultRecords(result.slice(writes.length));
  } catch (error) {
    for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
      if (/CHECK constraint failed: result_deadline_current\b/.test(cause.message)) throw new ResultDeadlineError();
    }
    throw error;
  }
}

export type MatchFilters = {
  limit: number; after?: string | undefined; competitionId?: string | undefined; divisionId?: string | undefined;
  entryId?: string | undefined; memberId?: string | undefined; status?: string | undefined;
  /** `created`, the default: oldest first. `recent`: most recently changed first, continuing after the `after` match. */
  order?: "created" | "recent" | undefined;
};
export async function readMatchPage(db: D1Database, hash: string, kind: CredentialKind, q: MatchFilters) {
  // Most recently changed first carries on after the `after` match's own place in that order.
  const recent = q.order === "recent"
    ? db.prepare(`SELECT m.*, (
      SELECT json_group_array(json_object('sideIndex', s.side_index, 'entryId', s.entry_id,
        'label', (SELECT label FROM entry_label el WHERE el.entry_id = s.entry_id AND el.club_id = s.club_id)) ORDER BY s.side_index)
      FROM match_side s WHERE s.match_id = m.id AND s.club_id = m.club_id
    ) AS sides_json, c.name AS competition_name, d.name AS division_name
    FROM match m JOIN competition c ON c.id = m.competition_id AND c.club_id = m.club_id
    LEFT JOIN division d ON d.id = m.division_id AND d.competition_id = m.competition_id
    WHERE m.club_id = (SELECT id FROM club WHERE singleton = 1)
      AND (? IS NULL OR (m.updated_at, m.id) < (SELECT a.updated_at, a.id FROM match a WHERE a.id = ?))
      AND (? IS NULL OR m.competition_id = ?) AND (? IS NULL OR m.division_id = ?)
      AND (? IS NULL OR m.status = ?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM match_side s WHERE s.match_id = m.id AND s.club_id = m.club_id AND s.entry_id = ?))
      AND (? IS NULL OR EXISTS (SELECT 1 FROM match_side s JOIN entry_member em ON em.entry_id = s.entry_id AND em.club_id = s.club_id
        WHERE s.match_id = m.id AND s.club_id = m.club_id AND em.member_id = ?))
      AND (? = 0 OR (c.visibility = 'members' AND c.state <> 'draft'))
    ORDER BY m.updated_at DESC, m.id DESC LIMIT ?`)
    : null;
  // Oldest first starts from the matches its most selective filter names, found by index,
  // rather than every match the club has had. The filters below still decide the page.
  const oldest = db.prepare(`WITH by_side(id) AS (
      SELECT s.match_id FROM entry_member em JOIN match_side s ON s.entry_id = em.entry_id AND s.club_id = em.club_id
        WHERE em.member_id = ?1
      UNION ALL SELECT match_id FROM match_side WHERE ?1 IS NULL AND entry_id = ?2
    ), by_match(id) AS (
      SELECT id FROM match WHERE ?1 IS NULL AND ?2 IS NULL AND division_id = ?3
      UNION ALL SELECT id FROM match WHERE ?1 IS NULL AND ?2 IS NULL AND ?3 IS NULL AND competition_id = ?4
      UNION ALL SELECT id FROM match WHERE ?1 IS NULL AND ?2 IS NULL AND ?3 IS NULL AND ?4 IS NULL AND status = ?5
    ), candidate(id) AS (
      SELECT id FROM by_side UNION ALL SELECT id FROM by_match
      UNION ALL SELECT id FROM match WHERE ?1 IS NULL AND ?2 IS NULL AND ?3 IS NULL AND ?4 IS NULL AND ?5 IS NULL
    ) SELECT m.*, (
      SELECT json_group_array(json_object('sideIndex', s.side_index, 'entryId', s.entry_id,
        'label', (SELECT label FROM entry_label el WHERE el.entry_id = s.entry_id AND el.club_id = s.club_id)) ORDER BY s.side_index)
      FROM match_side s WHERE s.match_id = m.id AND s.club_id = m.club_id
    ) AS sides_json, c.name AS competition_name, d.name AS division_name
    FROM match m JOIN competition c ON c.id = m.competition_id AND c.club_id = m.club_id
    LEFT JOIN division d ON d.id = m.division_id AND d.competition_id = m.competition_id
    WHERE m.id IN candidate AND m.club_id = (SELECT id FROM club WHERE singleton = 1)
      AND (?6 IS NULL OR m.id > ?6)
      AND (?4 IS NULL OR m.competition_id = ?4) AND (?3 IS NULL OR m.division_id = ?3)
      AND (?5 IS NULL OR m.status = ?5)
      AND (?2 IS NULL OR EXISTS (SELECT 1 FROM match_side s WHERE s.match_id = m.id AND s.club_id = m.club_id AND s.entry_id = ?2))
      AND (?1 IS NULL OR EXISTS (SELECT 1 FROM match_side s JOIN entry_member em ON em.entry_id = s.entry_id AND em.club_id = s.club_id
        WHERE s.match_id = m.id AND s.club_id = m.club_id AND em.member_id = ?1))
      AND (?7 = 0 OR (c.visibility = 'members' AND c.state <> 'draft'))
    ORDER BY m.id LIMIT ?8`);
  const session = kind === "session" ? 1 : 0;
  const identity = await readIdentity(db, hash, kind, null, [
    recent
      ? recent.bind(q.after ?? null, q.after ?? null, q.competitionId ?? null, q.competitionId ?? null,
        q.divisionId ?? null, q.divisionId ?? null, q.status ?? null, q.status ?? null, q.entryId ?? null, q.entryId ?? null,
        q.memberId ?? null, q.memberId ?? null, session, q.limit + 1)
      : oldest.bind(q.memberId ?? null, q.entryId ?? null, q.divisionId ?? null, q.competitionId ?? null,
        q.status ?? null, q.after ?? null, session, q.limit + 1),
  ]);
  const rows = (identity.extraResults[0]!.results as Row[]).map((r) => matchRecord(r, JSON.parse(String(r.sides_json)) as MatchRecord["sides"]));
  const more = rows.length > q.limit;
  const page = rows.slice(0, q.limit);
  return { identity, rows: page, next: more ? page.at(-1)!.id : null };
}
