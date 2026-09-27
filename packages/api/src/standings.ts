import {
  ledgerMatches,
  listDivisions,
  listEntries,
  seasonDeadline,
  type CompetitionRecord,
  type Tx,
} from "@deuceleague/db";
import { tablesFromRecords, type DivisionTable } from "./league/tables.js";
export type { DivisionTable } from "./league/tables.js";

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
  const divisions = (await listDivisions(tx, competition.id)).filter(
    (d) => !options.divisionId || d.id === options.divisionId,
  );
  const entries = await listEntries(tx, competition.id, { divisionId: options.divisionId, state: undefined });
  const matches = await ledgerMatches(tx, competition.id, options.divisionId);

  return tablesFromRecords(competition, divisions, entries, matches, deadline, options.now);
}
