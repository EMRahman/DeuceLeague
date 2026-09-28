import type { DivisionRecord, EntryRecord, LeagueCompetitionRecord, LedgerMatch } from "@deuceleague/db-d1";
import { computeStandings, type StandingsMatch, type StandingsRow } from "@deuceleague/engine";
import { RulesSpec } from "@deuceleague/schema";
export type DivisionTable = { division: DivisionRecord; rows: StandingsRow[] };

/** Corrections affect the next read, never a stored table. */
export function tablesFromRecords(competition: LeagueCompetitionRecord, divisions: DivisionRecord[], entries: EntryRecord[],
  matches: LedgerMatch[], deadline: Date | null, now: Date): { final: boolean; divisions: DivisionTable[] } {
  const final = competition.state === "complete" || competition.state === "archived" || (deadline !== null && deadline.getTime() <= now.getTime());
  return { final, divisions: divisions.map((division) => ({ division,
    rows: computeStandings({
      entries: entries.filter((e) => e.divisionId === division.id).map((e) => ({ id: e.id, label: e.label, withdrawn: e.state === "withdrawn" })),
      matches: matches.filter((m) => m.divisionId === division.id) as StandingsMatch[],
      rules: RulesSpec.parse(competition.rules), format: competition.matchFormat, deadlinePassed: final,
    }),
  })) };
}
