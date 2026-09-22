import type { MatchOutcome, Score, SideIndex } from "@deuceleague/schema";

/** What one side says happened, in the shape a claim is stored. */
export type Claim = {
  outcome: MatchOutcome;
  score: Score | null;
  /** Which side retired, conceded or failed to appear, for those outcomes. */
  retiredSide: SideIndex | null;
};

/**
 * Where a match stands, given each side's live claim.
 *
 *   neither side has claimed      → open
 *   one side has                  → reported, waiting on the other
 *   both have, and they agree     → played: the result enters the ledger
 *   both have, and they differ    → disputed, saying exactly what differs
 *
 * Nothing here looks at a clock: a claim with no answer stays reported for as
 * long as it takes. A coach's entry settles a match directly and never comes
 * through here.
 */
export type ClaimVerdict =
  | { status: "open" }
  | { status: "reported"; waitingOn: SideIndex }
  | { status: "played" }
  | { status: "disputed"; differences: string[] };

export function judgeClaims(side0: Claim | null, side1: Claim | null): ClaimVerdict {
  if (!side0 && !side1) return { status: "open" };
  if (!side1) return { status: "reported", waitingOn: 1 };
  if (!side0) return { status: "reported", waitingOn: 0 };
  const differences = compareClaims(side0, side1);
  return differences.length === 0 ? { status: "played" } : { status: "disputed", differences };
}

/**
 * What two claims disagree on, in words a player can act on: "set 2: side 0
 * says 6-3, side 1 says 6-2". Empty when they agree.
 *
 * Agreement is on the result: how the match ended, who stopped, and the games
 * in every set. Tiebreak points are not compared — the engine never uses them,
 * and nobody should be in dispute over whether a tiebreak went 7-5 or 7-4.
 * Neither is the date played.
 */
export function compareClaims(a: Claim, b: Claim): string[] {
  if (a.outcome !== b.outcome) {
    return [`how it ended: side 0 says ${a.outcome}, side 1 says ${b.outcome}`];
  }
  const differences: string[] = [];
  if (a.retiredSide !== b.retiredSide) {
    differences.push(
      `who ${stoppedVerb(a.outcome)}: side 0 says ${sideName(a.retiredSide)}, side 1 says ${sideName(b.retiredSide)}`,
    );
  }
  const setsA = a.score?.sets ?? [];
  const setsB = b.score?.sets ?? [];
  if (setsA.length !== setsB.length) {
    differences.push(`the score: side 0 says ${formatScore(a.score)}, side 1 says ${formatScore(b.score)}`);
    return differences;
  }
  setsA.forEach((set, i) => {
    const other = setsB[i];
    if (other && (set.games[0] !== other.games[0] || set.games[1] !== other.games[1])) {
      differences.push(`set ${i + 1}: side 0 says ${set.games.join("-")}, side 1 says ${other.games.join("-")}`);
    }
  });
  return differences;
}

/** A score as a results sheet shows it, from side 0's point of view: "6-4 3-6 10-8". */
export function formatScore(score: Score | null): string {
  if (!score || score.sets.length === 0) return "no score";
  return score.sets.map((s) => s.games.join("-")).join(" ");
}

function sideName(side: SideIndex | null): string {
  return side === null ? "nobody" : `side ${side}`;
}

function stoppedVerb(outcome: MatchOutcome): string {
  return outcome === "retired" ? "retired" : outcome === "conceded" ? "conceded" : "failed to appear";
}
