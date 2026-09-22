import type { Score } from "@deuceleague/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "./client.js";
import { match, matchSide, season } from "./schema.js";

// The progress and chase views answer the questions asked all season. They
// are views rather than queries here so a coach's own SQL gets the same
// answers; these functions only read them. Counts come back from Postgres as
// bigint or numeric, which arrive as strings, so each is turned into a number.

const n = (v: unknown): number => Number(v ?? 0);
const nOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export type ProgressCounts = {
  matches: number;
  played: number;
  outstanding: number;
  reported: number;
  disputed: number;
  percentPlayed: number | null;
};

export type CompetitionProgress = ProgressCounts & {
  competitionId: string;
  resultsDeadlineAt: Date | null;
  daysRemaining: number | null;
  activeEntries: number;
  divisions: (ProgressCounts & { divisionId: string; ordinal: number; name: string; activeEntries: number })[];
};

function counts(r: Record<string, unknown>): ProgressCounts {
  return {
    matches: n(r.matches),
    played: n(r.played),
    outstanding: n(r.outstanding),
    reported: n(r.reported),
    disputed: n(r.disputed),
    percentPlayed: nOrNull(r.percent_played),
  };
}

/** How far through a competition is, overall and by division. Null if it has no divisions yet. */
export async function competitionProgress(tx: Tx, competitionId: string): Promise<CompetitionProgress | null> {
  const [whole] = await tx.execute<Record<string, unknown>>(
    sql`select * from competition_progress where competition_id = ${competitionId}`,
  );
  if (!whole) return null;
  const divisions = await tx.execute<Record<string, unknown>>(
    sql`select * from division_progress where competition_id = ${competitionId} order by division_ordinal`,
  );
  return {
    ...counts(whole),
    competitionId,
    resultsDeadlineAt: whole.results_deadline_at ? new Date(whole.results_deadline_at as string) : null,
    daysRemaining: nOrNull(whole.days_remaining),
    activeEntries: n(whole.active_entries),
    divisions: divisions.map((d) => ({
      ...counts(d),
      divisionId: d.division_id as string,
      ordinal: n(d.division_ordinal),
      name: d.division_name as string,
      activeEntries: n(d.active_entries),
    })),
  };
}

export type EntryProgress = { entryId: string; matches: number; played: number; outstanding: number };

/** Played and outstanding for one entry. */
export async function entryProgress(tx: Tx, entryId: string): Promise<EntryProgress | null> {
  const [row] = await tx.execute<Record<string, unknown>>(
    sql`select entry_id, matches, played, outstanding from entry_progress where entry_id = ${entryId}`,
  );
  return row
    ? { entryId: row.entry_id as string, matches: n(row.matches), played: n(row.played), outstanding: n(row.outstanding) }
    : null;
}

export type ChaseRow = {
  competitionId: string;
  competitionName: string;
  divisionId: string;
  divisionName: string;
  divisionOrdinal: number;
  memberId: string;
  displayName: string;
  /** Present only when asked for with `pii`. */
  email?: string | null;
  outstandingMatches: number;
  needsPlaying: number;
  awaitingYou: number;
  awaitingThem: number;
  daysRemaining: number | null;
  waitingOn: string[];
};

/**
 * Who has matches outstanding, from member_chase_list: one row per member
 * per division, most outstanding first. The email column is selected only
 * with `pii`, so otherwise it never leaves the database.
 */
export async function chaseList(
  tx: Tx,
  options: { competitionId: string | undefined; withinDays: number | undefined; pii: boolean },
): Promise<ChaseRow[]> {
  const rows = await tx.execute<Record<string, unknown>>(sql`
    select competition_id, competition_name, division_id, division_name, division_ordinal,
           member_id, display_name, outstanding_matches, needs_playing, awaiting_you,
           awaiting_them, days_remaining, waiting_on
           ${options.pii ? sql`, email` : sql``}
    from member_chase_list
    where ${options.competitionId ? sql`competition_id = ${options.competitionId}` : sql`true`}
      and ${options.withinDays === undefined ? sql`true` : sql`days_remaining <= ${options.withinDays}`}
    order by outstanding_matches desc, display_name, division_ordinal`);
  return rows.map((r) => ({
    competitionId: r.competition_id as string,
    competitionName: r.competition_name as string,
    divisionId: r.division_id as string,
    divisionName: r.division_name as string,
    divisionOrdinal: n(r.division_ordinal),
    memberId: r.member_id as string,
    displayName: r.display_name as string,
    ...(options.pii ? { email: (r.email as string | null) ?? null } : {}),
    outstandingMatches: n(r.outstanding_matches),
    needsPlaying: n(r.needs_playing),
    awaitingYou: n(r.awaiting_you),
    awaitingThem: n(r.awaiting_them),
    daysRemaining: nOrNull(r.days_remaining),
    waitingOn: (r.waiting_on as string[] | null) ?? [],
  }));
}

/** A match as the standings engine reads it: the two entries and what the ledger holds. */
export type LedgerMatch = {
  id: string;
  divisionId: string | null;
  side0: string | null;
  side1: string | null;
  status: string;
  outcome: string | null;
  winningSide: number | null;
  retiredSide: number | null;
  score: Score | null;
};

/** Every match in a competition, or one division of it, for computing standings. */
export async function ledgerMatches(tx: Tx, competitionId: string, divisionId?: string): Promise<LedgerMatch[]> {
  const s0 = alias(matchSide, "s0");
  const s1 = alias(matchSide, "s1");
  return tx
    .select({
      id: match.id,
      divisionId: match.divisionId,
      side0: s0.entryId,
      side1: s1.entryId,
      status: match.status,
      outcome: match.outcome,
      winningSide: match.winningSide,
      retiredSide: match.retiredSide,
      score: match.score,
    })
    .from(match)
    .leftJoin(s0, and(eq(s0.matchId, match.id), eq(s0.sideIndex, 0)))
    .leftJoin(s1, and(eq(s1.matchId, match.id), eq(s1.sideIndex, 1)))
    .where(and(eq(match.competitionId, competitionId), divisionId ? eq(match.divisionId, divisionId) : undefined))
    .orderBy(asc(match.id));
}

/** The results deadline a competition's season sets, if it has one. */
export async function seasonDeadline(tx: Tx, seasonId: string): Promise<Date | null> {
  const [row] = await tx
    .select({ deadline: season.resultsDeadlineAt })
    .from(season)
    .where(eq(season.id, seasonId));
  return row?.deadline ?? null;
}
