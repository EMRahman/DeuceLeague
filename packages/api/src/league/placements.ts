import type { DivisionRecord, EntryRecord, LeagueCompetitionRecord, LedgerMatch } from "@deuceleague/db-d1";
import { suggestPlacements } from "@deuceleague/engine";
import { RulesSpec } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import type { NotCarried } from "../contracts/placements.js";
import { problems } from "../problems.js";
import { towardMinimum } from "./progress.js";
import type { DivisionTable } from "./tables.js";

export function checkPlacementTarget(target: LeagueCompetitionRecord | null, entryCount: number) {
  if (!target) throw problems.notFound("competition");
  if (target.state !== "draft") throw problems.conflict("not_draft", `The competition is ${target.state}`,
    "Placements fill a draft, which the coach adjusts and then activates.");
  if (!target.previousCompetitionId) throw problems.conflict("no_previous_competition", "The competition does not name a previous one",
    "Set previous_competition_id to the competition whose tables it should be filled from.");
  if (entryCount > 0) throw problems.conflict("entries_exist", "The competition already has entries",
    "Adjust them with the entry routes, or delete them all to fill it again.");
  return target;
}
export function checkPlacementSource(target: LeagueCompetitionRecord, previous: LeagueCompetitionRecord) {
  if (previous.discipline !== target.discipline) throw problems.conflict("discipline_mismatch",
    `The previous competition is ${previous.discipline}, this one ${target.discipline}`,
    "An entry moves as a unit, so both must be singles or both doubles.");
}

/**
 * The entries of a competition that played fewer matches than it expected of them —
 * its own minimum, or all their fixtures if fewer — which are not carried into
 * the next one.
 */
export function tooFewToStay(competition: LeagueCompetitionRecord, entries: EntryRecord[], ledger: LedgerMatch[]) {
  const counts = towardMinimum(RulesSpec.parse(competition.rules), competition.matchFormat, entries, ledger);
  return new Map([...counts].filter(([, c]) => c.played < c.target));
}

/** Shared placement/exclusion decision; persistence happens only after the complete plan exists. */
export function placementSelections(target: LeagueCompetitionRecord, tables: { divisions: DivisionTable[] },
  divisions: DivisionRecord[], previousEntries: EntryRecord[], removed: ReadonlySet<string>,
  short: ReadonlyMap<string, { played: number; target: number }>) {
  const suggestions = suggestPlacements(tables.divisions.map(({ division, rows }) => ({ ordinal: division.ordinal, name: division.name, standings: rows })),
    RulesSpec.parse(target.rules).movement, divisions.map((d) => ({ ordinal: d.ordinal, name: d.name })),
    new Set(previousEntries.filter((e) => e.optedOutAt !== null).map((e) => e.id)), short);
  const before = new Map(previousEntries.map((e) => [e.id, e]));
  const selected: { source: EntryRecord; division: DivisionRecord; reason: "promoted" | "relegated" | "held";
    label: string; from: { division: number; position: number | null }; explanation: string }[] = [];
  const notCarried: z.infer<typeof NotCarried>[] = [];
  for (const s of suggestions) {
    const source = before.get(s.entryId)!;
    if (s.to === null || s.reason === null) {
      notCarried.push({ previous_entry_id: s.entryId, label: s.label, explanation: s.explanation });
    } else if (source.members.some((m) => removed.has(m.id))) {
      notCarried.push({ previous_entry_id: s.entryId, label: s.label,
        explanation: `${s.explanation} Not carried over: a member has since been removed from the club.` });
    } else {
      const division = divisions.find((d) => d.ordinal === s.to);
      if (!division) throw new Error("Placement engine selected a missing division");
      selected.push({ source, division, reason: s.reason, label: s.label, from: s.from, explanation: s.explanation });
    }
  }
  return { selected, notCarried };
}
