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

/**
 * A promotion or relegation place that nobody takes. Movement is decided by table position: the top
 * `promote` of a division are its promotion places, the bottom `relegate` its relegation places. An entry in
 * one that cannot move (it is not carried over, or played too few matches to go up) leaves the place empty.
 * The entry below does not move up to take it, since the coach knows who should; the engine only says who it
 * would suggest.
 */
export type Vacancy = {
  kind: "promotion" | "relegation";
  /** The division the place is in, and the one it leads to, by ordinal. */
  from: number;
  to: number;
  /** The entry that held the place in the table, and why it cannot move. */
  entryId: string;
  label: string;
  because: string;
  /**
   * Who to suggest instead: the best carried entry not moving, for a promotion; the worst, for a relegation.
   * Never one from the wrong half of the table: nobody in the top half is suggested to go down, nor anyone in
   * the bottom half to go up. The middle entry of an odd-sized division may go either way.
   */
  fill: { entryId: string; label: string; place: string } | null;
  explanation: string;
};

export type PlacementPlan = { suggestions: PlacementSuggestion[]; vacancies: Vacancy[] };

/** Same as {@link planPlacements}, for callers that only want where each entry goes. */
export function suggestPlacements(...args: Parameters<typeof planPlacements>): PlacementSuggestion[] {
  return planPlacements(...args).suggestions;
}

export function planPlacements(
  previous: readonly DivisionStandings[],
  movement: RulesSpec["movement"],
  target: readonly TargetDivision[],
  /** Entries whose players have said they are not playing in the next competition. */
  optedOut: ReadonlySet<string> = new Set(),
  /** Entries that played fewer matches than the competition expected: how many they played, of how many. */
  tooFewToStay: ReadonlyMap<string, { played: number; target: number }> = new Map(),
  /**
   * Doubles pairs that are breaking up, with why in a clause: "Sam is not playing next season",
   * "Sam asked for a new partner".
   */
  breakingUp: ReadonlyMap<string, string> = new Map(),
  /**
   * Entries with a member who has left the club or been removed from it, or who has said they are leaving
   * the league altogether (`leaving`), which takes every entry they hold out of the draft.
   */
  departed: ReadonlyMap<string, "left" | "removed" | "leaving" | "paused"> = new Map(),
): PlacementPlan {
  const ordinals = target.map((d) => d.ordinal).sort((a, b) => a - b);
  if (ordinals.length === 0) return { suggestions: [], vacancies: [] };
  // A division that no longer exists folds into the nearest existing one,
  // preferring the higher division on an equal distance. Ordinals may have gaps.
  const nearest = (ordinal: number) => ordinals.reduce((best, next) =>
    Math.abs(next - ordinal) < Math.abs(best - ordinal) ? next : best);
  const nameOf = (ordinal: number) => target.find((d) => d.ordinal === ordinal)?.name ?? `Division ${ordinal}`;

  const suggestions: PlacementSuggestion[] = [];
  const vacancies: Vacancy[] = [];
  const notCarried = (id: string) => optedOut.has(id) || breakingUp.has(id) || tooFewToStay.has(id) || departed.has(id);
  for (const division of [...previous].sort((a, b) => a.ordinal - b.ordinal)) {
    const here = nearest(division.ordinal);
    const up = ordinals.filter((n) => n < division.ordinal).at(-1) ?? here;
    const down = ordinals.find((n) => n > division.ordinal) ?? here;
    // Movement is by table position. A withdrawn entry has no final position, so it holds no place.
    const inTable = division.standings.filter((r) => r.standing !== "withdrawn");
    const promotionPlaces = up < here ? inTable.filter((r) => r.standing === "ranked").slice(0, movement.promote) : [];
    const inPromotion = new Set(promotionPlaces.map((r) => r.entryId));
    // Never the same entry as a promotion place, in a division too small for both. An unranked entry can go
    // down but never up.
    const relegationPlaces = down > here && movement.relegate > 0
      ? inTable.filter((r) => !inPromotion.has(r.entryId)).slice(-movement.relegate) : [];

    const promoted = new Set<string>();
    const relegated = new Set<string>();
    const tooFewToGoUp = new Set<string>();
    const open: { kind: Vacancy["kind"]; row: StandingsRow; because: string; held: boolean }[] = [];
    for (const row of promotionPlaces) {
      if (notCarried(row.entryId)) open.push({ kind: "promotion", row, because: notCarriedBecause(row.entryId), held: false });
      else if (row.played < movement.minMatchesForPromotion) {
        tooFewToGoUp.add(row.entryId);
        open.push({ kind: "promotion", row, held: true, because:
          `played ${row.played} of the ${movement.minMatchesForPromotion} matches needed for promotion` });
      } else promoted.add(row.entryId);
    }
    for (const row of relegationPlaces) {
      if (notCarried(row.entryId)) open.push({ kind: "relegation", row, because: notCarriedBecause(row.entryId), held: false });
      else relegated.add(row.entryId);
    }

    // Who to suggest for each empty place: the best entry that is carried over, is not moving and could go
    // up, for a promotion; the worst that is carried over and not moving, for a relegation. Only from the
    // half of the table the place belongs to: a vacancy is no reason to send down someone who finished in
    // the top half, or up someone who finished in the bottom half.
    const suggested = new Set<string>();
    const staying = (r: StandingsRow) => !notCarried(r.entryId) && !promoted.has(r.entryId) && !relegated.has(r.entryId)
      && !suggested.has(r.entryId);
    const half = (r: StandingsRow, kind: Vacancy["kind"]) => {
      const i = inTable.indexOf(r);
      return kind === "promotion" ? i < Math.ceil(inTable.length / 2) : i >= Math.floor(inTable.length / 2);
    };
    for (const { kind, row, because, held } of [...open.filter((o) => o.kind === "promotion"), ...open.filter((o) => o.kind === "relegation")]) {
      const eligible = kind === "promotion"
        ? inTable.find((r) => r.standing === "ranked" && r.played >= movement.minMatchesForPromotion && staying(r))
        : [...inTable].reverse().find(staying);
      const pick = eligible && half(eligible, kind) ? eligible : undefined;
      if (pick) suggested.add(pick.entryId);
      const to = kind === "promotion" ? up : down;
      const fill = pick ? { entryId: pick.entryId, label: pick.label, place: describePlace(pick, division.name) } : null;
      vacancies.push({
        kind, from: division.ordinal, to, entryId: row.entryId, label: row.label, because, fill,
        explanation: `A ${kind} place ${kind === "promotion" ? "into" : "down to"} ${nameOf(to)} is unfilled: ` +
          `${describePlace(row, division.name)} (${row.label}) is ${held ? "held back" : "not carried over"} (${because}). ` +
          (fill ? `Suggested instead: ${fill.place}, ${fill.label}.`
            : eligible ? `No suggestion: the next eligible entry, ${describePlace(eligible, division.name)}, finished too ` +
              `${kind === "promotion" ? "low" : "high"}.`
            : `Nobody else in ${division.name} can take it.`),
      });
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
      } else if (breakingUp.has(row.entryId)) {
        suggestions.push({
          ...base,
          to: null,
          reason: null,
          explanation:
            `${place}, but ${breakingUp.get(row.entryId)}, so the pair is not carried over. ` +
            "Add them back if they stay together.",
        });
      } else if (tooFewToStay.has(row.entryId) && row.standing !== "withdrawn") {
        const { played, target } = tooFewToStay.get(row.entryId)!;
        suggestions.push({
          ...base,
          to: null,
          reason: null,
          explanation:
            `${place}, but played ${played} of the ${target} ${target === 1 ? "match" : "matches"} needed to keep ` +
            "a place, so not carried over. Add them back if they are staying.",
        });
      } else if (row.standing === "withdrawn") {
        suggestions.push({
          ...base,
          to: null,
          reason: null,
          explanation: `Withdrew from ${division.name}, so not carried over. Add them back if they are returning.`,
        });
      } else if (departed.has(row.entryId)) {
        suggestions.push({
          ...base,
          to: null,
          reason: null,
          explanation: `${place}, but ${departedClause(departed.get(row.entryId)!)}, so not carried over.`,
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

    /** Why an entry in a movement place is not carried over, as a clause that follows its name. */
    function notCarriedBecause(id: string): string {
      if (optedOut.has(id)) return "opted out of the next competition";
      if (breakingUp.has(id)) return breakingUp.get(id)!;
      if (tooFewToStay.has(id)) {
        const { played, target } = tooFewToStay.get(id)!;
        return `played ${played} of the ${target} ${target === 1 ? "match" : "matches"} needed to keep a place`;
      }
      return departedClause(departed.get(id)!);
    }
  }
  return { suggestions, vacancies };
}

const departedClause = (how: "left" | "removed" | "leaving" | "paused") =>
  how === "leaving" ? "a member is leaving the league" : how === "paused" ? "a member is taking a break"
    : `a member has since ${how === "removed" ? "been removed from" : "left"} the club`;

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
