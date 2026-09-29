import type { ChaseRow, ProgressCounts } from "@deuceleague/db-d1";
import type { z } from "@hono/zod-openapi";
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

export function toChase(r: ChaseRow, minimum: { played: number; target: number } | undefined): z.infer<typeof ChaseEntry> {
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
    matches_played: minimum?.played ?? 0,
    minimum_matches: minimum?.target ?? 0,
    matches_short: Math.max(0, (minimum?.target ?? 0) - (minimum?.played ?? 0)),
  };
}
