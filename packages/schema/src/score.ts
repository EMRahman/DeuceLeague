import { z } from "zod";
import { MatchOutcome } from "./enums.js";

/** Side 0 or side 1. Every paired value in a score is ordered [side0, side1]. */
export const SideIndex = z.union([z.literal(0), z.literal(1)]);
export type SideIndex = z.infer<typeof SideIndex>;

const pair = z.tuple([z.number().int().min(0).max(99), z.number().int().min(0).max(99)]);

/**
 * One set. `games` is always [side0, side1]. `tiebreak` carries the points in a
 * tiebreak game when the club wants them recorded — the engine ignores it.
 */
export const SetScore = z.object({
  games: pair,
  tiebreak: pair.optional(),
});
export type SetScore = z.infer<typeof SetScore>;

export const Score = z.object({
  sets: z.array(SetScore).min(1).max(7),
});
export type Score = z.infer<typeof Score>;

/** How a set is won. `tiebreakAt: null` means an advantage set — play on until clear. */
export const StandardSetSpec = z.object({
  gamesToWin: z.number().int().min(1).max(20),
  clearBy: z.number().int().min(1).max(2),
  tiebreakAt: z.number().int().min(1).max(20).nullable(),
  tiebreakTo: z.number().int().min(1).max(30).nullable(),
});

/** A deciding set played as a tiebreak to N rather than a full set. */
export const ChampionsTiebreakSpec = z.object({
  type: z.literal("champions_tiebreak"),
  to: z.number().int().min(1).max(30),
  clearBy: z.number().int().min(1).max(2),
});

export const StandardFinalSetSpec = z.object({ type: z.literal("standard") });

/**
 * Defines what a legal score looks like. Stored per competition, so a club can
 * run short formats in the lower divisions and full sets at the top.
 */
export const MatchFormat = z.object({
  setsToWin: z.number().int().min(1).max(3),
  set: StandardSetSpec,
  finalSet: z.union([ChampionsTiebreakSpec, StandardFinalSetSpec]).default({ type: "standard" }),
});
export type MatchFormat = z.infer<typeof MatchFormat>;

/** What a player or coach submits: the outcome, and the score if there was one. */
export const Result = z.object({
  outcome: MatchOutcome,
  score: Score.nullable().default(null),
  /** Which side retired or conceded. Required for `retired`, `walkover`, `conceded`. */
  retiredSide: SideIndex.nullable().default(null),
});
export type Result = z.infer<typeof Result>;

export const MATCH_FORMATS = {
  /** Two tiebreak sets, 10-point champions tiebreak in place of a third. */
  best_of_3_champions_tiebreak: {
    setsToWin: 2,
    set: { gamesToWin: 6, clearBy: 2, tiebreakAt: 6, tiebreakTo: 7 },
    finalSet: { type: "champions_tiebreak", to: 10, clearBy: 2 },
  },
  /** Three full tiebreak sets. */
  best_of_3_sets: {
    setsToWin: 2,
    set: { gamesToWin: 6, clearBy: 2, tiebreakAt: 6, tiebreakTo: 7 },
    finalSet: { type: "standard" },
  },
  /** One 8-game pro set with a tiebreak at 8-all. */
  pro_set_8: {
    setsToWin: 1,
    set: { gamesToWin: 8, clearBy: 2, tiebreakAt: 8, tiebreakTo: 7 },
    finalSet: { type: "standard" },
  },
  /** One short set to 4. Common where court time is tight. */
  short_set_4: {
    setsToWin: 1,
    set: { gamesToWin: 4, clearBy: 2, tiebreakAt: 4, tiebreakTo: 7 },
    finalSet: { type: "standard" },
  },
} as const satisfies Record<string, z.input<typeof MatchFormat>>;

export type ValidatedResult = {
  ok: boolean;
  errors: string[];
  /** Sets won, [side0, side1]. Zero for walkovers and unplayed matches. */
  setsWon: [number, number];
  /**
   * Games won, [side0, side1]. Counts only sets that were actually played. A
   * champions tiebreak counts as one game to its winner, since it replaces a set.
   */
  gamesWon: [number, number];
  winningSide: SideIndex | null;
};

/**
 * Whether a set, or a tiebreak, could have finished at hi-lo. It ends the
 * moment one side reaches the target with a clear margin, so a winning score
 * past the target means it was close all the way: 7-5 and 8-6 are real, 7-4
 * and 7-0 are not, because the set was already over at 6-4 or 6-0.
 */
function couldEndAt(hi: number, lo: number, target: number, clearBy: number): boolean {
  if (hi === target) return hi - lo >= clearBy;
  // Past the target only by exactly the margin, and only if the loser was close
  // enough to keep it going. With a margin of one the first to the target wins.
  return hi > target && clearBy > 1 && hi - lo === clearBy && lo >= target - clearBy + 1;
}

function validateSet(
  games: readonly [number, number],
  spec: z.infer<typeof StandardSetSpec>,
): { winner: SideIndex | null; error?: string } {
  const [a, b] = games;
  if (a === b) return { winner: null, error: `${a}-${b} is not a completed set` };
  const winner: SideIndex = a > b ? 0 : 1;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);

  if (hi < spec.gamesToWin) {
    return { winner, error: `${a}-${b}: neither side reached ${spec.gamesToWin} games` };
  }
  // Decided by a tiebreak, e.g. 7-6 where the tiebreak is played at 6-all.
  if (spec.tiebreakAt !== null && hi === spec.tiebreakAt + 1 && lo === spec.tiebreakAt) {
    return { winner };
  }
  // A tiebreak also caps how long a set can run: with one at 6-all, 8-6 cannot happen.
  const pastTiebreak = spec.tiebreakAt !== null && hi > spec.tiebreakAt + 1;
  if (!pastTiebreak && couldEndAt(hi, lo, spec.gamesToWin, spec.clearBy)) {
    return { winner };
  }
  return { winner, error: `${a}-${b} is not a legal set for this format` };
}

function validateChampionsTiebreak(
  games: readonly [number, number],
  spec: z.infer<typeof ChampionsTiebreakSpec>,
): { winner: SideIndex | null; error?: string } {
  const [a, b] = games;
  if (a === b) return { winner: null, error: `${a}-${b} is not a completed tiebreak` };
  const winner: SideIndex = a > b ? 0 : 1;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < spec.to) return { winner, error: `${a}-${b}: neither side reached ${spec.to}` };
  if (!couldEndAt(hi, lo, spec.to, spec.clearBy)) {
    return { winner, error: `${a}-${b} is not a legal tiebreak score` };
  }
  return { winner };
}

/**
 * Checks a submitted result against the competition's match format and derives
 * the totals the standings engine needs. Catches transposed digits and
 * impossible scores at the point of entry rather than at the end of the season.
 */
export function validateResult(result: Result, format: MatchFormat): ValidatedResult {
  const errors: string[] = [];
  const setsWon: [number, number] = [0, 0];
  const gamesWon: [number, number] = [0, 0];

  // Outcomes with no score to check.
  if (result.outcome === "unplayed") {
    if (result.score) errors.push("an unplayed match cannot carry a score");
    return { ok: errors.length === 0, errors, setsWon, gamesWon, winningSide: null };
  }
  if (result.outcome === "walkover" || result.outcome === "conceded") {
    if (result.score) errors.push(`a ${result.outcome} cannot carry a score`);
    if (result.retiredSide === null) {
      errors.push(`a ${result.outcome} must record which side did not play`);
      return { ok: false, errors, setsWon, gamesWon, winningSide: null };
    }
    const winningSide: SideIndex = result.retiredSide === 0 ? 1 : 0;
    return { ok: errors.length === 0, errors, setsWon, gamesWon, winningSide };
  }

  if (!result.score) {
    errors.push(`outcome "${result.outcome}" requires a score`);
    return { ok: false, errors, setsWon, gamesWon, winningSide: null };
  }

  const { sets } = result.score;
  const maxSets = format.setsToWin * 2 - 1;
  if (sets.length > maxSets) {
    errors.push(`${sets.length} sets recorded but this format is at most ${maxSets}`);
  }

  // A retirement stops the match wherever it stood, so its last set is allowed
  // to be incomplete. Every earlier set must still be a legal, finished set.
  const isRetirement = result.outcome === "retired";

  sets.forEach((set, i) => {
    // Nothing is played once a side has the sets it needs.
    if (setsWon[0] === format.setsToWin || setsWon[1] === format.setsToWin) {
      errors.push(`set ${i + 1}: the match was already won`);
      return;
    }
    const finalSet = format.finalSet;
    const isChampionsTiebreak = i === maxSets - 1 && finalSet.type === "champions_tiebreak";
    const check = isChampionsTiebreak
      ? validateChampionsTiebreak(set.games, finalSet)
      : validateSet(set.games, format.set);
    if (isChampionsTiebreak) {
      // It stands in for the final set, so it counts as one game to whoever won
      // it: a 10-8 match tiebreak is not eighteen games of tennis.
      if (!check.error && check.winner !== null) gamesWon[check.winner] += 1;
    } else {
      gamesWon[0] += set.games[0];
      gamesWon[1] += set.games[1];
    }
    if (check.error) {
      if (!(isRetirement && i === sets.length - 1)) {
        errors.push(`set ${i + 1}: ${check.error}`);
      }
      // An unfinished or illegal set wins nobody a set.
      return;
    }
    if (check.winner !== null) setsWon[check.winner] += 1;
  });

  if (result.outcome === "retired") {
    if (result.retiredSide === null) {
      errors.push("a retirement must record which side retired");
      return { ok: false, errors, setsWon, gamesWon, winningSide: null };
    }
    const winningSide: SideIndex = result.retiredSide === 0 ? 1 : 0;
    return { ok: errors.length === 0, errors, setsWon, gamesWon, winningSide };
  }

  // outcome === "completed"
  const winningSide: SideIndex | null =
    setsWon[0] === format.setsToWin ? 0 : setsWon[1] === format.setsToWin ? 1 : null;
  if (winningSide === null) {
    errors.push(
      `neither side won ${format.setsToWin} sets (${setsWon[0]}-${setsWon[1]}) — ` +
        `record this as retired, conceded or unplayed instead`,
    );
  }
  return { ok: errors.length === 0, errors, setsWon, gamesWon, winningSide };
}
