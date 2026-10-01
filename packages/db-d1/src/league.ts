import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
import { commitAuthorized, eventStatement, readIdentity, type CredentialKind, type IdentitySnapshot } from "./identity.js";
import type { LeagueData, LeagueQuery, LeagueWrite, LeagueEvent, SeasonRecord, LeagueCompetitionRecord, DivisionRecord, EntryRecord } from "./league-types.js";
import { uuidv7 } from "./ids.js";

type Row = Record<string, any>;
const date = (v: unknown): Date | null => v === null ? null : new Date(Number(v));
const base = (r: Row) => ({ id: r.id as string, clubId: r.club_id as string, createdAt: date(r.created_at)!, updatedAt: date(r.updated_at)! });
const season = (r: Row): SeasonRecord => ({ ...base(r), name: r.name, kind: r.kind, year: r.year, startsOn: r.starts_on,
  endsOn: r.ends_on, resultsDeadlineAt: date(r.results_deadline_at), state: r.state });
const competition = (r: Row): LeagueCompetitionRecord => ({ ...base(r), seasonId: r.season_id, name: r.name, discipline: r.discipline,
  category: r.category, matchFormat: JSON.parse(r.match_format), rules: JSON.parse(r.rules), sequenceInSeason: r.sequence_in_season,
  previousCompetitionId: r.previous_competition_id, state: r.state, visibility: r.visibility });
const division = (r: Row): DivisionRecord => ({ ...base(r), competitionId: r.competition_id, ordinal: r.ordinal, name: r.name, targetSize: r.target_size });
const entry = (r: Row): EntryRecord => ({ ...base(r), competitionId: r.competition_id, divisionId: r.division_id, label: r.label,
  displayName: r.display_name, members: JSON.parse(r.members), seed: r.seed, state: r.state, placementReason: r.placement_reason,
  previousEntryId: r.previous_entry_id, withdrawnAt: date(r.withdrawn_at), optedOutAt: date(r.opted_out_at) });
export type LeagueSnapshot = { identity: IdentitySnapshot; extraResults: D1Result[]; data: LeagueData };

/** Scope the snapshot to the requested competition and its dependencies, not the club's history.
 * Every SELECT, including authorization, is in the same batch. JSON parameters are data only.
 */
export async function readLeague(db: D1Database, hash: string, kind: CredentialKind, query: LeagueQuery, extraReads: D1PreparedStatement[] = []): Promise<LeagueSnapshot> {
  const q = JSON.stringify(query);
  const identity = await readIdentity(db, hash, kind, null, [
    db.prepare(`WITH q AS (SELECT ? AS j), scope AS (
      SELECT coalesce(json_extract(j, '$.competitionId'),
        (SELECT competition_id FROM division WHERE id = json_extract(j, '$.divisionId')),
        (SELECT competition_id FROM entry WHERE id = json_extract(j, '$.entryId'))) AS competition_id FROM q
    ) SELECT s.* FROM season s, q, scope WHERE s.club_id = (SELECT id FROM club WHERE singleton = 1) AND (
      (json_extract(j, '$.list') = 'seasons' AND (json_extract(j, '$.state') IS NULL OR s.state = json_extract(j, '$.state'))
        AND (json_extract(j, '$.after') IS NULL OR s.id > json_extract(j, '$.after')))
      OR (json_extract(j, '$.list') IS NULL AND (s.id = json_extract(j, '$.seasonId')
        OR s.id = (SELECT season_id FROM competition WHERE id = scope.competition_id)
        OR (json_extract(j, '$.includePrevious') = 1 AND s.id = (SELECT season_id FROM competition WHERE id =
          (SELECT previous_competition_id FROM competition WHERE id = scope.competition_id))))))
      ORDER BY s.id LIMIT ?`).bind(q, (query.limit ?? 200) + 1),
    db.prepare(`WITH q AS (SELECT ? AS j), scope AS (
      SELECT coalesce(json_extract(j, '$.competitionId'),
        (SELECT competition_id FROM division WHERE id = json_extract(j, '$.divisionId')),
        (SELECT competition_id FROM entry WHERE id = json_extract(j, '$.entryId'))) AS competition_id FROM q
    ) SELECT c.* FROM competition c, q, scope WHERE c.club_id = (SELECT id FROM club WHERE singleton = 1) AND (
      (json_extract(j, '$.list') = 'competitions'
        AND (json_extract(j, '$.seasonId') IS NULL OR c.season_id = json_extract(j, '$.seasonId'))
        AND (json_extract(j, '$.state') IS NULL OR c.state = json_extract(j, '$.state'))
        AND (json_extract(j, '$.after') IS NULL OR c.id > json_extract(j, '$.after'))
        AND (? = 'api_key' OR (c.visibility = 'members' AND c.state <> 'draft')))
      OR (json_extract(j, '$.list') IS NULL AND (c.id = scope.competition_id OR c.id = json_extract(j, '$.previousCompetitionId')
        OR c.season_id = json_extract(j, '$.seasonId')
        OR (json_extract(j, '$.includePrevious') = 1 AND c.id = (SELECT previous_competition_id FROM competition WHERE id = scope.competition_id)))))
      ORDER BY c.id LIMIT ?`).bind(q, kind, query.list === "competitions" ? (query.limit ?? 50) + 1 : -1),
    db.prepare(`WITH q AS (SELECT ? AS j), scope AS (
      SELECT coalesce(json_extract(j, '$.competitionId'),
        (SELECT competition_id FROM division WHERE id = json_extract(j, '$.divisionId')),
        (SELECT competition_id FROM entry WHERE id = json_extract(j, '$.entryId'))) AS competition_id FROM q
    ) SELECT d.* FROM division d, scope, q WHERE d.competition_id = scope.competition_id
      OR (json_extract(j, '$.includePrevious') = 1 AND d.competition_id = (SELECT previous_competition_id FROM competition WHERE id = scope.competition_id))
      ORDER BY d.ordinal`).bind(q),
    db.prepare(`WITH q AS (SELECT ? AS j), scope AS (
      SELECT coalesce(json_extract(j, '$.competitionId'),
        (SELECT competition_id FROM division WHERE id = json_extract(j, '$.divisionId')),
        (SELECT competition_id FROM entry WHERE id = json_extract(j, '$.entryId'))) AS competition_id FROM q
    ) SELECT e.*, (SELECT label FROM entry_label WHERE entry_id = e.id) AS label,
      (SELECT json_group_array(json_object('id', m.id, 'displayName', m.display_name, 'role', em.role,
         'leaving', json(CASE WHEN m.leaving_at IS NOT NULL AND e.created_at <= m.leaving_at THEN 'true' ELSE 'false' END),
         'paused', json(CASE WHEN m.status = 'paused' THEN 'true' ELSE 'false' END)) ORDER BY em.role DESC, m.display_name)
       FROM entry_member em JOIN member m ON m.id = em.member_id WHERE em.entry_id = e.id) AS members
      FROM entry e, scope, q
      WHERE (e.competition_id = scope.competition_id OR e.id = json_extract(j, '$.previousEntryId')
      OR (json_extract(j, '$.includePrevious') = 1 AND e.competition_id = (SELECT previous_competition_id FROM competition WHERE id = scope.competition_id)))
      AND EXISTS (SELECT 1 FROM entry_member em WHERE em.entry_id = e.id) ORDER BY e.id`).bind(q),
    db.prepare(`SELECT m.id, m.display_name, m.deleted_at, m.status, CASE WHEN EXISTS (
      SELECT 1 FROM api_key k, json_each(k.scopes) s WHERE k.key_hash = ? AND k.revoked_at IS NULL
      AND (k.expires_at IS NULL OR k.expires_at > unixepoch('subsec') * 1000) AND s.value = 'members:pii'
      ) THEN m.gender ELSE NULL END AS gender FROM member m
      WHERE m.id IN (SELECT value FROM json_each(?, '$.memberIds'))`).bind(hash, q),
    db.prepare(`WITH q AS (SELECT ? AS j) SELECT m.id, m.division_id, m.status, m.pairing_key,
      EXISTS (SELECT 1 FROM result_submission r WHERE r.match_id = m.id) AS has_claims,
      (SELECT json_group_array(entry_id) FROM match_side WHERE match_id = m.id) AS entry_ids
      FROM match m, q WHERE m.division_id = json_extract(j, '$.divisionId')
      OR m.id IN (SELECT match_id FROM match_side WHERE entry_id = json_extract(j, '$.entryId'))`).bind(q),
    db.prepare(`SELECT previous_entry_id FROM entry WHERE previous_entry_id = ?`).bind(query.entryId ?? null),
    ...extraReads,
  ]);
  const r = identity.extraResults.map((result) => result.results as Row[]);
  return { identity, extraResults: identity.extraResults.slice(7), data: { seasons: r[0]!.map(season), competitions: r[1]!.map(competition), divisions: r[2]!.map(division),
    entries: r[3]!.map(entry), members: r[4]!.map((m) => ({ id: m.id, displayName: m.display_name, deletedAt: date(m.deleted_at), status: m.status, gender: m.gender })),
    matches: r[5]!.map((m) => ({ id: m.id, divisionId: m.division_id, status: m.status, pairingKey: m.pairing_key,
      hasClaims: Boolean(m.has_claims), entryIds: JSON.parse(m.entry_ids) })), referencedEntries: r[6]!.map((r) => r.previous_entry_id) } };
}

export class LeagueConstraintError extends Error {
  constructor(public readonly constraint: "seasonName" | "competitionName" | "ordinal" | "memberEntered") { super(constraint); }
}
function constraint(error: unknown) {
  const seen = new Set();
  for (let e = error; e instanceof Error && !seen.has(e); e = e.cause) {
    seen.add(e);
    for (const [text, name] of [
      ["season.club_id, season.name", "seasonName"], ["competition.season_id, competition.name", "competitionName"],
      ["division.competition_id, division.ordinal", "ordinal"], ["entry_member.competition_id, entry_member.member_id", "memberEntered"],
    ] as const) if (e.message.includes(`UNIQUE constraint failed: ${text}`)) return new LeagueConstraintError(name);
  }
  return error;
}

/** Reuse the same bound writes for normal league edits and atomic installation. */
export function leagueStatements(db: D1Database, clubId: string, changes: LeagueWrite[]): D1PreparedStatement[] {
  const writes: D1PreparedStatement[] = [];
  for (const change of changes) {
    switch (change.type) {
      case "season": {
        const r = change.record;
        if (change.create) writes.push(db.prepare(`INSERT INTO season
          (id, club_id, name, kind, year, starts_on, ends_on, results_deadline_at, state, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(r.id, r.clubId, r.name, r.kind, r.year, r.startsOn, r.endsOn, r.resultsDeadlineAt?.getTime() ?? null, r.state, r.createdAt.getTime(), r.updatedAt.getTime()));
        else writes.push(db.prepare(`UPDATE season SET name = ?, kind = ?, year = ?, starts_on = ?, ends_on = ?, results_deadline_at = ?, state = ?, updated_at = ? WHERE id = ? AND club_id = ?`)
          .bind(r.name, r.kind, r.year, r.startsOn, r.endsOn, r.resultsDeadlineAt?.getTime() ?? null, r.state, r.updatedAt.getTime(), r.id, r.clubId));
        break;
      }
      case "competition": {
        const r = change.record;
        if (change.create) writes.push(db.prepare(`INSERT INTO competition
          (id, club_id, season_id, name, discipline, category, match_format, rules, sequence_in_season, previous_competition_id, state, visibility, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(r.id, r.clubId, r.seasonId, r.name, r.discipline, r.category, JSON.stringify(r.matchFormat), JSON.stringify(r.rules), r.sequenceInSeason, r.previousCompetitionId, r.state, r.visibility, r.createdAt.getTime(), r.updatedAt.getTime()));
        else writes.push(db.prepare(`UPDATE competition SET name = ?, discipline = ?, category = ?, match_format = ?, rules = ?, sequence_in_season = ?, previous_competition_id = ?, state = ?, visibility = ?, updated_at = ? WHERE id = ? AND club_id = ?`)
          .bind(r.name, r.discipline, r.category, JSON.stringify(r.matchFormat), JSON.stringify(r.rules), r.sequenceInSeason, r.previousCompetitionId, r.state, r.visibility, r.updatedAt.getTime(), r.id, r.clubId));
        break;
      }
      case "division": {
        const r = change.record;
        if (change.create) writes.push(db.prepare(`INSERT INTO division (id, club_id, competition_id, ordinal, name, target_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
          .bind(r.id, r.clubId, r.competitionId, r.ordinal, r.name, r.targetSize, r.createdAt.getTime(), r.updatedAt.getTime()));
        else writes.push(db.prepare(`UPDATE division SET ordinal = ?, name = ?, target_size = ?, updated_at = ? WHERE id = ? AND club_id = ?`)
          .bind(r.ordinal, r.name, r.targetSize, r.updatedAt.getTime(), r.id, r.clubId));
        break;
      }
      case "entry": {
        const r = change.record;
        if (change.create) {
          writes.push(db.prepare(`INSERT INTO entry (id, club_id, competition_id, division_id, display_name, seed, state, placement_reason, previous_entry_id, withdrawn_at, opted_out_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .bind(r.id, r.clubId, r.competitionId, r.divisionId, r.displayName, r.seed, r.state, r.placementReason, r.previousEntryId, r.withdrawnAt?.getTime() ?? null, r.optedOutAt?.getTime() ?? null, r.createdAt.getTime(), r.updatedAt.getTime()));
          writes.push(db.prepare(`INSERT INTO entry_member (entry_id, member_id, competition_id, club_id, role)
            SELECT ?, json_extract(value, '$.id'), ?, ?, json_extract(value, '$.role') FROM json_each(?)`)
            .bind(r.id, r.competitionId, r.clubId, JSON.stringify(r.members)));
        } else writes.push(db.prepare(`UPDATE entry SET division_id = ?, display_name = ?, seed = ?, state = ?, placement_reason = ?, previous_entry_id = ?, withdrawn_at = ?, opted_out_at = ?, updated_at = ? WHERE id = ? AND club_id = ?`)
          .bind(r.divisionId, r.displayName, r.seed, r.state, r.placementReason, r.previousEntryId, r.withdrawnAt?.getTime() ?? null, r.optedOutAt?.getTime() ?? null, r.updatedAt.getTime(), r.id, r.clubId));
        break;
      }
      case "deleteDivision": writes.push(db.prepare("DELETE FROM division WHERE id = ? AND club_id = ?").bind(change.id, clubId)); break;
      case "deleteEntry": writes.push(db.prepare("DELETE FROM entry WHERE id = ? AND club_id = ?").bind(change.id, clubId)); break;
      case "deleteFixtures": writes.push(db.prepare(`DELETE FROM match WHERE id IN (SELECT value FROM json_each(?)) AND status = 'open'
        AND NOT EXISTS (SELECT 1 FROM result_submission r WHERE r.match_id = match.id)`).bind(JSON.stringify(change.ids))); break;
      case "partnerChoices": {
        // One statement however many change together: agreeing to a pair changes two.
        const records = change.records.map((r) => ({ ...r, confirmedAt: r.confirmedAt?.getTime() ?? null,
          createdAt: r.createdAt.getTime(), updatedAt: r.updatedAt.getTime() }));
        writes.push(db.prepare(`INSERT INTO partner_choice (club_id, competition_id, member_id, choice, partner_id, confirmed_at, created_at, updated_at)
          SELECT ?, json_extract(value, '$.competitionId'), json_extract(value, '$.memberId'), json_extract(value, '$.choice'),
            json_extract(value, '$.partnerId'), json_extract(value, '$.confirmedAt'), json_extract(value, '$.createdAt'), json_extract(value, '$.updatedAt')
          FROM json_each(?) WHERE true
          ON CONFLICT (competition_id, member_id) DO UPDATE SET choice = excluded.choice, partner_id = excluded.partner_id,
            confirmed_at = excluded.confirmed_at, updated_at = excluded.updated_at`).bind(clubId, JSON.stringify(records)));
        break;
      }
      case "deletePartnerChoice": writes.push(db.prepare("DELETE FROM partner_choice WHERE competition_id = ? AND member_id = ? AND club_id = ?")
        .bind(change.competitionId, change.memberId, clubId)); break;
      case "fixtures": {
        // Two bulk statements regardless of division size: no per-fixture query or placeholder growth.
        const fixtures = change.fixtures.map((f) => ({ ...f, side0Id: uuidv7(), side1Id: uuidv7() }));
        writes.push(db.prepare(`INSERT INTO match (id, club_id, competition_id, division_id, pairing_key)
          SELECT json_extract(value, '$.matchId'), ?, ?, ?, json_extract(value, '$.pairingKey') FROM json_each(?)`)
          .bind(clubId, change.competitionId, change.divisionId, JSON.stringify(fixtures)));
        writes.push(db.prepare(`INSERT INTO match_side (id, club_id, match_id, competition_id, side_index, entry_id)
          SELECT CASE side.n WHEN 0 THEN json_extract(f.value, '$.side0Id') ELSE json_extract(f.value, '$.side1Id') END,
            ?, json_extract(f.value, '$.matchId'), ?, side.n,
            CASE side.n WHEN 0 THEN json_extract(f.value, '$.side0') ELSE json_extract(f.value, '$.side1') END
          FROM json_each(?) f CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1) side`)
          .bind(clubId, change.competitionId, JSON.stringify(fixtures)));
        break;
      }
    }
  }
  return writes;
}

/** Apply the already-decided structure change and its audits in one guarded batch. */
export async function commitLeague(db: D1Database, state: LeagueSnapshot, changes: LeagueWrite[], events: LeagueEvent[]) {
  const clubId = state.identity.club!.id;
  const writes = leagueStatements(db, clubId, changes);
  const credential = state.identity.credential!;
  for (const event of events) writes.push(eventStatement(db, clubId, event.type, event.subjectType, event.id,
    credential.kind === "api_key" ? { type: "api_key", id: credential.id } : { type: "member", id: credential.member_id! }, event.payload));
  try { await commitAuthorized(db, state.identity, writes); }
  catch (error) { throw constraint(error); }
}
