import {
  ledgerMatches,
  listDivisions,
  listEntries,
  seasonDeadline,
  type CompetitionRecord,
  type DivisionRecord,
  type Tx,
} from "@deuceleague/db";
import { computeStandings, type StandingsMatch, type StandingsRow } from "@deuceleague/engine";
import { RulesSpec } from "@deuceleague/schema";

export type DivisionTable = { division: DivisionRecord; rows: StandingsRow[] };

/**
 * A competition's tables, computed now from its matches — never stored, so a
 * corrected score shows in the very next read. The engine has no clock: this
 * decides whether the results deadline has passed, and passes that in.
 *
 * `final` is true once the deadline has passed or the competition is
 * complete. From then on a match still outstanding counts as unplayed.
 */
export async function competitionTables(
  tx: Tx,
  competition: CompetitionRecord,
  options: { divisionId?: string | undefined; now: Date },
): Promise<{ final: boolean; divisions: DivisionTable[] }> {
  const deadline = await seasonDeadline(tx, competition.seasonId);
  const final =
    competition.state === "complete" ||
    competition.state === "archived" ||
    (deadline !== null && deadline.getTime() <= options.now.getTime());

  const divisions = (await listDivisions(tx, competition.id)).filter(
    (d) => !options.divisionId || d.id === options.divisionId,
  );
  const entries = await listEntries(tx, competition.id, { divisionId: options.divisionId, state: undefined });
  const matches = await ledgerMatches(tx, competition.id, options.divisionId);

  return {
    final,
    divisions: divisions.map((division) => ({
      division,
      rows: computeStandings({
        entries: entries
          .filter((e) => e.divisionId === division.id)
          .map((e) => ({ id: e.id, label: e.label, withdrawn: e.state === "withdrawn" })),
        matches: matches.filter((m) => m.divisionId === division.id) as StandingsMatch[],
        // Parsed, not cast: rules saved before a field existed get its default.
        rules: RulesSpec.parse(competition.rules),
        format: competition.matchFormat,
        deadlinePassed: final,
      }),
    })),
  };
}
