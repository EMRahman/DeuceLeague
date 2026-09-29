import type { ChaseRow, ProgressCounts } from "@deuceleague/db-d1";
import type { z } from "@hono/zod-openapi";
import { DEFAULT_RULES } from "@deuceleague/schema";
import type { Standings, ChaseEntry } from "../contracts/standings.js";
import type { DivisionTable } from "./tables.js";

export function toStandings(
  competitionId: string,
  tables: { final: boolean; divisions: DivisionTable[] },
  movement: ReadonlyMap<string, "promoted" | "relegated">,
): z.infer<typeof Standings> {
  return {
    competition_id: competitionId,
    final: tables.final,
    divisions: tables.divisions.map(({ division, rows }) => ({
      division_id: division.id,
      ordinal: division.ordinal,
      name: division.name,
      rows: rows.map((r) => ({
        position: r.position,
        standing: r.standing,
        entry_id: r.entryId,
        label: r.label,
        points: r.points,
        played: r.played,
        won: r.won,
        lost: r.lost,
        unplayed: r.unplayed,
        outstanding: r.outstanding,
        sets_won: r.setsWon,
        sets_lost: r.setsLost,
        games_won: r.gamesWon,
        games_lost: r.gamesLost,
        separated_by: r.separatedBy,
        matches: r.matches.map((m) => ({
          match_id: m.matchId,
          opponent_entry_id: m.opponentId,
          result: m.result,
          outcome: m.outcome,
          points: m.points,
          items: m.items,
        })),
        all_played_bonus: r.allPlayedBonus,
        movement: movement.get(r.entryId) ?? null,
      })),
    })),
  };
}

export function toCounts(p: ProgressCounts) {
  return {
    matches: p.matches,
    played: p.played,
    outstanding: p.outstanding,
    reported: p.reported,
    disputed: p.disputed,
    percent_played: p.percentPlayed,
  };
}

export function toChase(r: ChaseRow): z.infer<typeof ChaseEntry> {
  return {
    competition_id: r.competitionId,
    competition_name: r.competitionName,
    division_id: r.divisionId,
    division_name: r.divisionName,
    member_id: r.memberId,
    display_name: r.displayName,
    ...(r.email === undefined ? {} : { email: r.email }),
    outstanding_matches: r.outstandingMatches,
    needs_playing: r.needsPlaying,
    awaiting_you: r.awaitingYou,
    awaiting_them: r.awaitingThem,
    days_remaining: r.daysRemaining,
    waiting_on: r.waitingOn,
    ...toMinimum(r),
  };
}

/** Where a chase row stands against the competition's minimum; a rule saved before it existed means the default. */
function toMinimum(r: ChaseRow) {
  const minimum = Math.min(r.minRule ?? DEFAULT_RULES.minMatchesToPlay, r.fixtures);
  return { matches_played: r.played, minimum_matches: minimum, matches_short: Math.max(0, minimum - r.played) };
}
