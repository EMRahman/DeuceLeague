import type { D1Database } from "@cloudflare/workers-types";
import { eventStatement } from "./identity.js";
import { uuidv7 } from "./ids.js";
import { leagueStatements } from "./league.js";
import type { EntryRecord, LeagueEvent, LeagueWrite } from "./league-types.js";
import type { ClaimRecord, LedgerEntry } from "./result-types.js";

export type SampleMatch = { id: string; competitionId: string; divisionId: string; pairingKey: string; side0: string; side1: string; createdAt: Date };
/** Where a sample match ended up after its claims: open matches have none. */
export type SampleOutcome = { matchId: string; status: "reported" | "disputed" | "played"; ledger: LedgerEntry | null; updatedAt: Date };

export type InstallationSample = {
  preset: string;
  members: { id: string; displayName: string; email: string | null; createdAt: Date }[];
  /** Season, competitions and divisions: a handful of records, written as ordinary league changes. */
  changes: LeagueWrite[];
  entries: EntryRecord[];
  matches: SampleMatch[];
  claims: ClaimRecord[];
  outcomes: SampleOutcome[];
  /** Named places for the forecast, so a trial shows weather without any setup. */
  courtLocations: { id: string; name: string; latitude: number; longitude: number; createdAt: Date }[];
  events: LeagueEvent[];
};

const ms = (date: Date | null) => date?.getTime() ?? null;

/**
 * Prepared only during initial bootstrap, never committed separately. Each
 * table is one bound bulk statement, so the statement count stays the same
 * however large the sample grows.
 */
export function sampleStatements(db: D1Database, clubId: string, sample: InstallationSample) {
  const entries = sample.entries.map((e) => ({ ...e, createdAt: ms(e.createdAt), updatedAt: ms(e.updatedAt),
    withdrawnAt: ms(e.withdrawnAt), optedOutAt: ms(e.optedOutAt) }));
  const members = sample.members.map((m) => ({ ...m, createdAt: ms(m.createdAt) }));
  const matches = sample.matches.map((m) => ({ ...m, createdAt: ms(m.createdAt),
    side0Id: uuidv7(m.createdAt.getTime()), side1Id: uuidv7(m.createdAt.getTime()) }));
  const claims = sample.claims.map((c) => ({ ...c, submittedAt: ms(c.submittedAt), confirmedAt: ms(c.confirmedAt) }));
  const courts = sample.courtLocations.map((c) => ({ ...c, createdAt: ms(c.createdAt) }));
  const outcomes = sample.outcomes.map((o) => ({ matchId: o.matchId, status: o.status, updatedAt: ms(o.updatedAt),
    outcome: o.ledger?.outcome ?? null, score: o.ledger?.score ?? null, winningSide: o.ledger?.winningSide ?? null,
    retiredSide: o.ledger?.retiredSide ?? null, playedOn: o.ledger?.playedOn ?? null, claimId: o.ledger?.claimId ?? null }));
  return [
    db.prepare(`INSERT INTO member (id, club_id, display_name, email, created_at, updated_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.displayName'), json_extract(value, '$.email'),
        json_extract(value, '$.createdAt'), json_extract(value, '$.createdAt') FROM json_each(?)`).bind(clubId, JSON.stringify(members)),
    ...leagueStatements(db, clubId, sample.changes),
    db.prepare(`INSERT INTO entry (id, club_id, competition_id, division_id, display_name, seed, state, placement_reason,
        previous_entry_id, withdrawn_at, opted_out_at, created_at, updated_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.competitionId'), json_extract(value, '$.divisionId'),
        json_extract(value, '$.displayName'), json_extract(value, '$.seed'), json_extract(value, '$.state'),
        json_extract(value, '$.placementReason'), json_extract(value, '$.previousEntryId'), json_extract(value, '$.withdrawnAt'),
        json_extract(value, '$.optedOutAt'), json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt')
      FROM json_each(?)`).bind(clubId, JSON.stringify(entries)),
    db.prepare(`INSERT INTO entry_member (entry_id, member_id, competition_id, club_id, role, created_at)
      SELECT json_extract(e.value, '$.id'), json_extract(m.value, '$.id'), json_extract(e.value, '$.competitionId'), ?,
        json_extract(m.value, '$.role'), json_extract(e.value, '$.createdAt')
      FROM json_each(?) e, json_each(json_extract(e.value, '$.members')) m`).bind(clubId, JSON.stringify(entries)),
    // Matches start open, as fixtures do. Claims can then refer to them, and
    // the ledger can refer to the claims it accepted.
    db.prepare(`INSERT INTO match (id, club_id, competition_id, division_id, pairing_key, created_at, updated_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.competitionId'), json_extract(value, '$.divisionId'),
        json_extract(value, '$.pairingKey'), json_extract(value, '$.createdAt'), json_extract(value, '$.createdAt')
      FROM json_each(?)`).bind(clubId, JSON.stringify(matches)),
    db.prepare(`INSERT INTO match_side (id, club_id, match_id, competition_id, side_index, entry_id, created_at)
      SELECT CASE side.n WHEN 0 THEN json_extract(f.value, '$.side0Id') ELSE json_extract(f.value, '$.side1Id') END,
        ?, json_extract(f.value, '$.id'), json_extract(f.value, '$.competitionId'), side.n,
        CASE side.n WHEN 0 THEN json_extract(f.value, '$.side0') ELSE json_extract(f.value, '$.side1') END,
        json_extract(f.value, '$.createdAt')
      FROM json_each(?) f CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1) side`).bind(clubId, JSON.stringify(matches)),
    db.prepare(`INSERT INTO result_submission (id, club_id, match_id, side_index, submitted_by_member_id, submitted_at,
        score, outcome, retired_side, played_on, state, confirmed_at, accepts_submission_id, source, raw_input)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.matchId'), json_extract(value, '$.sideIndex'),
        json_extract(value, '$.submittedByMemberId'), json_extract(value, '$.submittedAt'), json_extract(value, '$.score'),
        json_extract(value, '$.outcome'), json_extract(value, '$.retiredSide'), json_extract(value, '$.playedOn'),
        json_extract(value, '$.state'), json_extract(value, '$.confirmedAt'), json_extract(value, '$.acceptsSubmissionId'),
        json_extract(value, '$.source'), json_extract(value, '$.rawInput')
      FROM json_each(?) ORDER BY CAST(key AS INTEGER)`).bind(clubId, JSON.stringify(claims)),
    db.prepare(`UPDATE match SET status = json_extract(o.value, '$.status'), outcome = json_extract(o.value, '$.outcome'),
        score = json_extract(o.value, '$.score'), winning_side = json_extract(o.value, '$.winningSide'),
        retired_side = json_extract(o.value, '$.retiredSide'), played_on = json_extract(o.value, '$.playedOn'),
        accepted_submission_id = json_extract(o.value, '$.claimId'), updated_at = json_extract(o.value, '$.updatedAt')
      FROM json_each(?) o WHERE match.id = json_extract(o.value, '$.matchId') AND match.club_id = ?`)
      .bind(JSON.stringify(outcomes), clubId),
    db.prepare(`INSERT INTO court_location (id, club_id, name, latitude, longitude, created_at, updated_at)
      SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.name'), json_extract(value, '$.latitude'),
        json_extract(value, '$.longitude'), json_extract(value, '$.createdAt'), json_extract(value, '$.createdAt')
      FROM json_each(?)`).bind(clubId, JSON.stringify(courts)),
    // One bound bulk insert preserves event order without spending a D1 query
    // per sample record. Allocation triggers still run for every event, within
    // the same bootstrap transaction as all records and the completion marker.
    db.prepare(`INSERT INTO event (club_id, type, subject_type, subject_id, actor_type, actor_id, payload)
      SELECT ?, json_extract(value, '$.type'), json_extract(value, '$.subjectType'), json_extract(value, '$.id'),
        'system', NULL, json_extract(value, '$.payload') FROM json_each(?) ORDER BY CAST(key AS INTEGER)`)
      .bind(clubId, JSON.stringify(sample.events)),
    eventStatement(db, clubId, "installation.sample.created", "club", clubId, { type: "system", id: null }, {
      preset: sample.preset, members: sample.members.length,
      competitions: sample.changes.filter((c) => c.type === "competition").length, matches: sample.matches.length,
      court_locations: sample.courtLocations.length,
    }),
  ];
}
