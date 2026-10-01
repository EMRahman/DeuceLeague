import type { DivisionRecord, EntryRecord, LeagueCompetitionRecord, LedgerMatch } from "@deuceleague/db-d1";
import { planPlacements } from "@deuceleague/engine";
import { RulesSpec } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import type { NotCarried } from "../contracts/placements.js";
import { problems } from "../problems.js";
import { towardMinimum } from "./progress.js";
import type { DivisionTable } from "./tables.js";

export function checkPlacementTarget(target: LeagueCompetitionRecord | null, entryCount: number, mustBeEmpty = true) {
  if (!target) throw problems.notFound("competition");
  if (target.state !== "draft") throw problems.conflict("not_draft", `The competition is ${target.state}`,
    "Placements fill a draft, which the coach adjusts and then activates.");
  if (!target.previousCompetitionId) throw problems.conflict("no_previous_competition", "The competition does not name a previous one",
    "Set previous_competition_id to the competition whose tables it should be filled from.");
  if (mustBeEmpty && entryCount > 0) throw problems.conflict("entries_exist", "The competition already has entries",
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

/**
 * The previous entries with a member who is no longer there: removed, left the club, or, for an entry made
 * before they said so, leaving the league altogether. The firmer reason is the one given.
 */
export function departedOf(entries: EntryRecord[], gone: ReadonlyMap<string, "removed" | "left" | "paused">) {
  return new Map(entries.flatMap((e) => {
    const how = e.members.map((m) => gone.get(m.id) ?? (m.paused ? "paused" as const : m.leaving ? "leaving" as const : undefined))
      .filter((g) => g !== undefined);
    // The firmer reason is the one given: removed, left, on a break, then leaving next season.
    const reason = (["removed", "left", "paused"] as const).find((r) => how.includes(r)) ?? (how.length ? "leaving" as const : null);
    return reason ? [[e.id, reason] as const] : [];
  }));
}

/** Shared placement/exclusion decision; persistence happens only after the complete plan exists. */
export function placementSelections(target: LeagueCompetitionRecord, tables: { divisions: DivisionTable[] },
  divisions: DivisionRecord[], previousEntries: EntryRecord[], gone: ReadonlyMap<string, "removed" | "left" | "paused">,
  short: ReadonlyMap<string, { played: number; target: number }>, breakingUp: ReadonlyMap<string, string> = new Map()) {
  const { suggestions, vacancies } = planPlacements(tables.divisions.map(({ division, rows }) => ({ ordinal: division.ordinal, name: division.name, standings: rows })),
    RulesSpec.parse(target.rules).movement, divisions.map((d) => ({ ordinal: d.ordinal, name: d.name })),
    new Set(previousEntries.filter((e) => e.optedOutAt !== null).map((e) => e.id)), short, breakingUp,
    departedOf(previousEntries, gone));
  const before = new Map(previousEntries.map((e) => [e.id, e]));
  const selected: { source: EntryRecord; division: DivisionRecord; reason: "promoted" | "relegated" | "held";
    label: string; from: { division: number; position: number | null }; explanation: string }[] = [];
  const notCarried: z.infer<typeof NotCarried>[] = [];
  for (const s of suggestions) {
    const source = before.get(s.entryId)!;
    if (s.to === null || s.reason === null) {
      notCarried.push({ previous_entry_id: s.entryId, label: s.label, explanation: s.explanation });
    } else {
      const division = divisions.find((d) => d.ordinal === s.to);
      if (!division) throw new Error("Placement engine selected a missing division");
      selected.push({ source, division, reason: s.reason, label: s.label, from: s.from, explanation: s.explanation });
    }
  }
  return { selected, notCarried, suggestions, vacancies };
}
