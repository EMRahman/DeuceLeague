import { z } from "zod";

/**
 * Tiebreak criteria, applied in the order listed until the tie is broken.
 * `head_to_head` only resolves two-way ties; with three or more units level it
 * is skipped and the next criterion applies.
 */
export const TiebreakRule = z.enum([
  "points",
  "head_to_head",
  "matches_won",
  "matches_played",
  "sets_won",
  "set_difference",
  "set_ratio",
  "games_won",
  "game_difference",
  "game_ratio",
]);
export type TiebreakRule = z.infer<typeof TiebreakRule>;

/** How a unit's league position is earned. */
export const ScoringMode = z.enum(["points", "games_won", "sets_won"]);

/**
 * What each result is worth. A completed match earns `win` or `lossPlayed`,
 * plus the per-set and margin bonuses below. A retirement, walkover or
 * concession earns only its flat amount: nothing was played out, so there is
 * no score to reward. The bonuses are optional and off unless set, so rules
 * saved before they existed keep scoring exactly as they did.
 */
export const PointsSpec = z.object({
  win: z.number(),
  lossPlayed: z.number(),
  retiredWin: z.number(),
  retiredLoss: z.number(),
  walkoverWin: z.number(),
  walkoverLoss: z.number(),
  concededWin: z.number(),
  concededLoss: z.number(),
  /**
   * Awarded to each side when a match is never played. The system does not try
   * to work out whose fault that was — see docs/DATA-MODEL.md § No scheduling.
   * A coach who judges one side at fault records a walkover instead.
   */
  unplayedBoth: z.number(),
  /** Added for each set a side wins in a completed match, winner or loser. */
  perSetWon: z.number().default(0),
  /**
   * Added to the loser of a completed match who lost by at most this many
   * games. Games are counted across every set, a champions tiebreak as one.
   */
  closeLoss: z.object({ withinGames: z.number().int().min(0).max(99), points: z.number() }).nullable().default(null),
  /** Added to the winner of a completed match who won by at least this many games. */
  convincingWin: z.object({ byGames: z.number().int().min(1).max(99), points: z.number() }).nullable().default(null),
  /**
   * Added once every one of an entry's matches is in the ledger and it turned
   * up to each: played out, retired (either side), or won by walkover or
   * concession. A walkover given away, or a match never played, forfeits it,
   * so nobody holds it until their last match is in.
   */
  allPlayed: z.number().default(0),
});

/**
 * What happens to a unit's fixtures when it withdraws mid-season.
 * Clubs disagree sharply here, which is exactly why it is data.
 */
export const WithdrawalSpec = z.object({
  /** `keep` leaves already-played results standing; `void` removes them from the table. */
  playedMatches: z.enum(["keep", "void"]),
  /** What becomes of fixtures the withdrawn unit never got to. */
  remainingMatches: z.enum(["unplayed", "walkover_to_opponent"]),
});

/**
 * What a walkover or concession is worth in the sets and games columns.
 * `nominal` awards the side that turned up the score it would have had to
 * play out — every set to love — so walkovers count in set and game
 * tiebreaks. `none` leaves both columns untouched, and the points are all a
 * walkover is worth.
 */
export const WalkoverScore = z.enum(["nominal", "none"]);

export const MovementSpec = z.object({
  /** How many units the engine suggests promoting from each division. */
  promote: z.number().int().min(0).max(10),
  /** How many it suggests relegating. */
  relegate: z.number().int().min(0).max(10),
  /** A unit that played fewer than this is not suggested for promotion. */
  minMatchesForPromotion: z.number().int().min(0).max(50),
});

/**
 * The complete rule set for one competition. Stored as JSON so a club can change
 * how its league works without anyone shipping code.
 *
 * Ranking is always: scoringMode value first, then `tiebreaks` in order, then
 * display name as a final deterministic fallback so standings never flicker.
 */
export const RulesSpec = z.object({
  version: z.literal(1),
  scoringMode: ScoringMode,
  points: PointsSpec,
  tiebreaks: z.array(TiebreakRule).min(1),
  movement: MovementSpec,
  withdrawal: WithdrawalSpec,
  /** Units below this many played matches are listed but marked unranked. */
  minMatchesForRanking: z.number().int().min(0).max(50).default(0),
  /** What a walkover or concession does to the sets and games columns. */
  walkoverScore: WalkoverScore.default("nominal"),
});
export type RulesSpec = z.infer<typeof RulesSpec>;

/**
 * Sensible starting point, as a points table a club would pin up:
 *
 *   1 for playing a match, 3 more for winning it, and 1 for each set won;
 *   1 more for losing close (by 4 games or fewer) or winning big (by 8 or more);
 *   1 bonus for turning up to every match;
 *   3 in total for a win by retirement, walkover or concession, 0 for the loss.
 *
 * So a 6-4 6-3 win is worth 1 + 3 + 2 = 6 to the winner and 1 + 1 = 2 to the
 * loser, who lost by only 5 games — one short of the close-loss bonus.
 * Nothing for a match that never happened. A walkover scores as the whitewash it
 * stands for in the sets and games columns. Entries level on points are split
 * by games difference, then head-to-head. The top three of each division are suggested for promotion and
 * the bottom three for relegation. A withdrawn unit's played results stand and
 * its remaining fixtures simply go unplayed.
 */
export const DEFAULT_RULES: RulesSpec = {
  version: 1,
  scoringMode: "points",
  points: {
    win: 4,
    lossPlayed: 1,
    retiredWin: 3,
    retiredLoss: 0,
    walkoverWin: 3,
    walkoverLoss: 0,
    concededWin: 3,
    concededLoss: 0,
    unplayedBoth: 0,
    perSetWon: 1,
    closeLoss: { withinGames: 4, points: 1 },
    convincingWin: { byGames: 8, points: 1 },
    allPlayed: 1,
  },
  // Level on points: games difference first, then who won when they met.
  tiebreaks: ["points", "game_difference", "head_to_head", "set_difference", "matches_won"],
  movement: { promote: 3, relegate: 3, minMatchesForPromotion: 2 },
  withdrawal: { playedMatches: "keep", remainingMatches: "unplayed" },
  minMatchesForRanking: 0,
  walkoverScore: "nominal",
};
