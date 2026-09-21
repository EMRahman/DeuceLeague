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

export const PointsSpec = z.object({
  win: z.number(),
  lossPlayed: z.number(),
  retiredWin: z.number(),
  retiredLoss: z.number(),
  walkoverWin: z.number(),
  walkoverLoss: z.number(),
  concededWin: z.number(),
  concededLoss: z.number(),
  /** Awarded to each side when a match is never played. */
  unplayedBoth: z.number(),
  /** Awarded when blame for an unplayed match is assigned to one side. */
  unplayedBlamed: z.number(),
  unplayedNotBlamed: z.number(),
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

/** How unplayed fixtures are treated once the deadline passes. */
export const DeadlineSpec = z.object({
  /**
   * `no_points` treats every unplayed match alike.
   * `assign_blame` uses the arrangement record to decide who failed to engage.
   */
  onUnplayed: z.enum(["no_points", "assign_blame"]),
  blame: z.object({
    /** A side that never proposed a time and never answered a proposal. */
    noProposalMade: z.enum(["blame", "shared"]),
    /** A side that received a proposal and never responded. */
    ignoredProposal: z.enum(["blame", "shared"]),
    /** Both sides proposed or responded but never landed on a slot. */
    bothEngaged: z.enum(["shared"]),
    /** Neither side used the system at all, so there is no evidence either way. */
    bothSilent: z.enum(["shared", "blame"]),
  }),
});

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
  deadline: DeadlineSpec,
  /** Units below this many played matches are listed but marked unranked. */
  minMatchesForRanking: z.number().int().min(0).max(50).default(0),
});
export type RulesSpec = z.infer<typeof RulesSpec>;

/**
 * Sensible starting point: 3 points a win, 1 for turning up and losing, nothing
 * for a match that never happened. No walkovers — a withdrawn unit's played
 * results stand and its remaining fixtures simply go unplayed.
 */
export const DEFAULT_RULES: RulesSpec = {
  version: 1,
  scoringMode: "points",
  points: {
    win: 3,
    lossPlayed: 1,
    retiredWin: 3,
    retiredLoss: 1,
    walkoverWin: 3,
    walkoverLoss: 0,
    concededWin: 3,
    concededLoss: 0,
    unplayedBoth: 0,
    unplayedBlamed: 0,
    unplayedNotBlamed: 1,
  },
  tiebreaks: ["points", "head_to_head", "set_difference", "game_difference", "matches_won"],
  movement: { promote: 2, relegate: 2, minMatchesForPromotion: 2 },
  withdrawal: { playedMatches: "keep", remainingMatches: "unplayed" },
  deadline: {
    onUnplayed: "no_points",
    blame: {
      noProposalMade: "blame",
      ignoredProposal: "blame",
      bothEngaged: "shared",
      bothSilent: "shared",
    },
  },
  minMatchesForRanking: 0,
};
