import type { RulesSpec } from "@deuceleague/schema";
import type { StandingsRow } from "./standings.js";

/**
 * Suggests where each entry of the last competition should play in the next.
 * Only suggests: the coach edits and confirms, and only then are entries
 * written. Coaches know things the table does not — an injury, someone moving
 * away, a player who would be miserable in Division 1 — so every suggestion
 * says why, in a sentence they can check against the table.
 */

export type DivisionStandings = {
  ordinal: number;
  name: string;
  /** In table order, as computeStandings returns it. */
  standings: readonly StandingsRow[];
};

export type TargetDivision = { ordinal: number; name: string };

export type PlacementSuggestion = {
  entryId: string;
  label: string;
  from: { division: number; position: number | null };
  /** The division in the new competition, by ordinal, or null: not carried over. */
  to: number | null;
  /** As written to entry.placement_reason once the coach confirms. */
  reason: "promoted" | "relegated" | "held" | null;
  explanation: string;
};

export function suggestPlacements(
  previous: readonly DivisionStandings[],
  movement: RulesSpec["movement"],
  target: readonly TargetDivision[],
  /** Entries whose players have said they are not playing in the next competition. */
  optedOut: ReadonlySet<string> = new Set(),
): PlacementSuggestion[] {
  const ordinals = target.map((d) => d.ordinal);
  if (ordinals.length === 0) return [];
  const top = Math.min(...ordinals);
  const bottom = Math.max(...ordinals);
  // A division that no longer exists folds into the nearest one that does.
  const clamp = (ordinal: number) => Math.min(Math.max(ordinal, top), bottom);
  const nameOf = (ordinal: number) => target.find((d) => d.ordinal === ordinal)?.name ?? `Division ${ordinal}`;

  const suggestions: PlacementSuggestion[] = [];
  for (const division of [...previous].sort((a, b) => a.ordinal - b.ordinal)) {
    const here = clamp(division.ordinal);
    const up = clamp(division.ordinal - 1);
    const down = clamp(division.ordinal + 1);
    // Someone who has opted out is out of the reckoning: they take no
    // promotion place from the entry below them, and no relegation place
    // from the one above.
    const active = division.standings.filter((r) => r.standing !== "withdrawn" && !optedOut.has(r.entryId));

    // Promotion: the top of the ranked table, passing over anyone who played
    // too few matches — their place goes to the next entry down.
    const promoted = new Set<string>();
    const tooFewToGoUp = new Set<string>();
    if (up < here) {
      for (const row of active) {
        if (promoted.size >= movement.promote || row.standing !== "ranked") break;
        if (row.played < movement.minMatchesForPromotion) tooFewToGoUp.add(row.entryId);
        else promoted.add(row.entryId);
      }
    }

    // Relegation: the bottom of the table, unranked entries included, never
    // an entry just promoted.
    const relegated = new Set<string>();
    if (down > here) {
      for (const row of [...active].reverse()) {
        if (relegated.size >= movement.relegate) break;
        if (!promoted.has(row.entryId)) relegated.add(row.entryId);
      }
    }

    for (const row of division.standings) {
      const place = describePlace(row, division.name);
      const base = { entryId: row.entryId, label: row.label, from: { division: division.ordinal, position: row.position } };
      if (optedOut.has(row.entryId)) {
        suggestions.push({
          ...base,
          to: null,
          reason: null,
          explanation:
            `${place}, but opted out of the next competition, so not carried over. ` +
            "Add them back if they change their mind.",
        });
      } else if (row.standing === "withdrawn") {
        suggestions.push({
          ...base,
          to: null,
          reason: null,
          explanation: `Withdrew from ${division.name}, so not carried over. Add them back if they are returning.`,
        });
      } else if (promoted.has(row.entryId)) {
        suggestions.push({ ...base, to: up, reason: "promoted", explanation: `${place}: promoted to ${nameOf(up)}.` });
      } else if (relegated.has(row.entryId)) {
        suggestions.push({ ...base, to: down, reason: "relegated", explanation: `${place}: relegated to ${nameOf(down)}.` });
      } else if (tooFewToGoUp.has(row.entryId)) {
        suggestions.push({
          ...base,
          to: here,
          reason: "held",
          explanation:
            `${place}, but played ${row.played} of the ${movement.minMatchesForPromotion} matches needed ` +
            `for promotion: held in ${nameOf(here)}.`,
        });
      } else {
        suggestions.push({ ...base, to: here, reason: "held", explanation: `${place}: held in ${nameOf(here)}.` });
      }
    }
  }
  return suggestions;
}

function describePlace(row: StandingsRow, divisionName: string): string {
  return row.position === null
    ? `Unranked in ${divisionName} (played ${row.played})`
    : `${nth(row.position)} in ${divisionName}`;
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
function nth(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}
