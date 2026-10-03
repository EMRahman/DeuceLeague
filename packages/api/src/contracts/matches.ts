import { MatchOutcome, MatchStatus, Score, SideIndex, SubmissionSource, SubmissionState } from "@deuceleague/schema";
import { createRoute, z } from "@hono/zod-openapi";
import { authProblems, conflictProblem, IdParam, notFoundProblem, PageQuery, pageOf, requires, Timestamp, validationProblem } from "./shared.js";

// ─────────────────────────────────────────────────────────────── shapes ──

export const Result = z
  .object({
    outcome: MatchOutcome,
    score: Score.nullable().meta({ description: "`[0]` is always side 0. Null unless completed or retired." }),
    winning_side: SideIndex.nullable().meta({ description: "Null only when unplayed." }),
    retired_side: SideIndex.nullable().meta({ description: "Who retired, conceded or failed to appear." }),
    played_on: z.iso.date().nullable(),
    claim_id: z.uuid().openapi({ description: "The claim that put this result in the ledger." }),
  })
  .openapi("Result");

export const Match = z
  .object({
    id: z.uuid(),
    competition_id: z.uuid(),
    division_id: z.uuid().nullable(),
    competition_name: z.string().openapi({ example: "Men's Singles", description: "What the competition is called now." }),
    division_name: z.string().nullable().openapi({ example: "Division 1", description: "What the division is called now." }),
    status: MatchStatus,
    sides: z
      .array(z.object({ side: SideIndex, entry_id: z.uuid().nullable(), label: z.string().nullable() }))
      .openapi({ description: "Side 0, then side 1. A match has no date, time or court." }),
    result: Result.nullable().openapi({ description: "What the ledger holds. Null until the match is played." }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Match");

export const ClaimOut = z
  .object({
    id: z.uuid(),
    side: SideIndex.nullable().meta({ description: "The side making the claim. Null for a coach's entry." }),
    outcome: MatchOutcome,
    score: Score.nullable(),
    retired_side: SideIndex.nullable(),
    played_on: z.iso.date().nullable().openapi({ description: "When this side says it was played. Never compared." }),
    state: SubmissionState.meta({
      description: "`pending` until agreed; `confirmed` once behind the ledger's result; `superseded` once replaced.",
    }),
    source: SubmissionSource,
    accepts_claim_id: z.uuid().nullable().openapi({
      description: "Historical acceptance reference. New submissions are entered independently and leave this null.",
    }),
    submitted_at: Timestamp,
    confirmed_at: Timestamp.nullable(),
    raw_input: z.string().nullable().openapi({
      description: "What was typed, when the claim came from free text. Never shown to a player's session.",
    }),
  })
  .openapi("Claim");

export const MatchDetail = Match.extend({
  claims: z.array(ClaimOut).openapi({ description: "For API keys: every submission and its history, oldest first. Player sessions see only their own side's submissions, including replacements. Opposing submissions and coach entries remain private; the final result is in result." }),
  waiting_on: SideIndex.nullable().meta({ description: "When reported: the side that still needs to enter its result." }),
  differences: z.array(z.string()).openapi({
    description: 'For API keys when disputed: what the two claims disagree on, e.g. "set 2: side 0 says 6-4, side 1 says 6-3". Always empty for player sessions.',
    example: ["set 2: side 0 says 6-4, side 1 says 6-3"],
  }),
}).openapi("MatchDetail");

/** An entry the settlement leaves short of its competition's minimum number of matches. */
export const ShortOfMinimum = z.object({
  entry_id: z.uuid(),
  label: z.string(),
  played: z.number().int().openapi({ description: "As the tables count it: a match against a no-show counts for the side that turned up." }),
  target: z.number().int().openapi({ description: "The competition's minimum, or all its fixtures if fewer." }),
  still_possible: z.boolean().openapi({
    description: "Whether its matches still to be played could bring it to the minimum before the season ends.",
  }),
});

/** What settling returns: the match, and for a match settled unplayed, who that leaves short of the minimum. */
export const SettledMatch = MatchDetail.extend({
  short_of_minimum: z.array(ShortOfMinimum).openapi({
    description:
      "Only for `outcome: unplayed`, which credits neither side: the entries in this match now short of the " +
      "competition's minimum, who are left out of next season's draft if they stay short once the tables are " +
      "final. Empty for any other outcome, and when neither side is short.",
  }),
}).openapi("SettledMatch");

/** Where a claim came from. A coach's entry comes only through /settle. */
const ClaimSource = z.enum(["api", "telegram", "web", "nl_parse"]);

const ResultFields = {
  outcome: MatchOutcome,
  score: Score.nullable().optional().meta({ description: "Required for completed and retired; `[0]` is side 0." }),
  retired_side: SideIndex.nullable()
    .optional()
    .meta({ description: "Required for retired, walkover and conceded: the side that stopped." }),
  played_on: z.iso.date().optional(),
  raw_input: z.string().max(2000).optional().openapi({ description: "What the player typed, if they typed it." }),
};

const SOURCE_DEFAULT = "Defaults to `web` for a player's session, `api` for an API key.";

export const NewClaim = z
  .object({
    side: SideIndex.optional().meta({
      description:
        "The side this claim speaks for. Required with an API key. A player's session speaks for its own " +
        "side only, and may leave it out.",
    }),
    ...ResultFields,
    source: ClaimSource.optional().meta({ description: SOURCE_DEFAULT }),
  })
  .openapi("NewClaim");

export const Settlement = z
  .object({
    ...ResultFields,
    reason: z.enum(["no_response", "conflicting_entries", "incorrect_result", "unreported_result", "injury_or_withdrawal"]).optional().openapi({
      description: "Why the coach decided the result. Recorded with the acting API key in the audit history; use a category rather than personal or medical details.",
    }),
    expected_version: z.string().regex(/^[a-f0-9]{64}$/).optional().openapi({
      description: "The version returned by settlement-preview. Refuses a changed match, division ledger, entries or rules so the coach can review the effect again.",
    }),
    override: z.boolean().optional().openapi({
      description:
        "Required to replace any confirmed result, including an earlier coach settlement. An identical retry or a match still open, reported or disputed does not need it.",
    }),
  })
  .openapi("Settlement");

export const SettlementPreview = z.object({
  version: z.string(),
  match: MatchDetail,
  result: Result.omit({ claim_id: true }),
  requires_override: z.boolean(),
  effects: z.array(z.object({
    side: SideIndex, entry_id: z.uuid().nullable(), label: z.string(),
    points_before: z.number(), points_after: z.number(),
    played_before: z.number().int(), played_after: z.number().int(),
    minimum: z.number().int(),
    withdrawn: z.boolean(),
  })),
}).openapi("SettlementPreview");

// ─────────────────────────────────────────────────────────────── routes ──

const matchDetail = { content: { "application/json": { schema: MatchDetail } } };

/** What refuses a claim from a player's session, on top of what refuses any credential. */
const playerRefusals = {
  403: {
    ...authProblems[403],
    description:
      `${authProblems[403].description} For a player's session: \`not_your_match\` when they are not ` +
      "playing in it, `not_your_side` when the claim is the other side's to make.",
  },
};

export const list = createRoute({
  method: "get",
  path: "/v1/matches",
  tags: ["Matches"],
  summary: "List matches",
  description:
    "Oldest first, or most recently changed first with `order=recent`. A fixture is simply a match that is `open`. A player's session sees the matches of " +
    "competitions open to members, once they are no longer drafts.",
  ...requires.orPlayer("league:read"),
  request: {
    query: PageQuery.extend({
      competition_id: z.uuid().optional(),
      division_id: z.uuid().optional(),
      entry_id: z.uuid().optional().openapi({ description: "Matches this entry was drawn in." }),
      member_id: z.uuid().optional().openapi({
        description: "Matches this member plays in, singles or doubles. With a player's own id, their matches.",
      }),
      status: MatchStatus.optional(),
      order: z.enum(["created", "recent"]).default("created").openapi({
        description:
          "`created`: oldest first. `recent`: most recently changed first, so `status=played` gives the latest " +
          "results; `after` carries on from that match, and a match changing while you page moves to the top.",
      }),
    }),
  },
  responses: {
    200: { description: "A page of matches.", content: { "application/json": { schema: pageOf(Match, "MatchPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

export const get = createRoute({
  method: "get",
  path: "/v1/matches/{id}",
  tags: ["Matches"],
  summary: "A match, with submissions visible to the caller",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The match.", ...matchDetail }, ...authProblems, ...notFoundProblem },
});

export const report = createRoute({
  method: "post",
  path: "/v1/matches/{id}/claims",
  tags: ["Matches"],
  summary: "Report a result for one side, or correct that side's report",
  description:
    "The score is checked against the competition's match format, then compared with the other side's " +
    "independently entered claim. Matching outcomes, set scores (including the deciding match tiebreak) " +
    "and affected sides put it in the ledger; a difference makes the match `disputed`, and no opposing entry " +
    "leaves it `reported` until the other side answers — however long that takes. A side's new claim " +
    "replaces its previous one, which is kept. Sending the same claim again changes nothing, so a retry " +
    "is safe. Once a match is played, only the coach can change it, and once the season's results deadline " +
    "has passed no new claim is taken. A player's session reports for its own side of its own matches, and " +
    "nothing else. Scores use the named-side order, with side 0 first regardless of the submitting side. " +
    "Players see only their own side's submissions and the waiting or mismatch status. On a mismatch, " +
    "speak outside the app and enter the agreed result; opposing submissions and differences remain private.",
  ...requires.orPlayer("results:write"),
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: NewClaim } }, required: true },
  },
  responses: {
    201: { description: "The claim was recorded; the match as it now stands.", ...matchDetail },
    200: { description: "The same claim was already standing; nothing changed.", ...matchDetail },
    ...validationProblem,
    ...authProblems,
    ...playerRefusals,
    ...notFoundProblem,
    ...conflictProblem("`already_played`, `competition_not_active`, or `deadline_passed`."),
  },
});

export const settle = createRoute({
  method: "post",
  path: "/v1/matches/{id}/settle",
  tags: ["Matches"],
  summary: "Settle a match as the coach",
  description:
    "Enters the result directly: for a dispute the players cannot resolve, a match nobody reported, or a " +
    "correction to one already played. Every earlier claim is kept, marked superseded. Settling with the " +
    "result already in the ledger changes nothing. Replacing any confirmed result needs " +
    "`override: true`, so the correction is deliberate. An optional reason records why the coach decided, " +
    "and expected_version checks the state reviewed in settlement-preview. The deadline does not stop a settlement. A match that " +
    "one side did not turn up to is a `walkover` with `retired_side` the absent side: the side that was there is " +
    "credited the points and a match played, and the other's row counts it as unplayed. `unplayed` credits " +
    "neither, and the response says who it leaves short of the competition's minimum.",
  ...requires("league:write"),
  request: {
    params: IdParam,
    body: { content: { "application/json": { schema: Settlement } }, required: true },
  },
  responses: {
    201: { description: "Settled; the match is played.", content: { "application/json": { schema: SettledMatch } } },
    200: { description: "The ledger already held this result; nothing changed.", content: { "application/json": { schema: SettledMatch } } },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`competition_not_active`, `already_agreed` without `override`, or `settlement_changed` when the preview is out of date."),
  },
});

export const previewSettlement = createRoute({
  method: "post",
  path: "/v1/matches/{id}/settlement-preview",
  tags: ["Matches"],
  summary: "Review a coach decision before saving it",
  description: "Validates the proposed result and computes both sides' division points and played credit before and after it, including withdrawal rules and all-played bonuses. The minimum is capped at the entry's fixture count. Does not submit a claim or change the ledger. Pass version as expected_version when settling; a change to the decision inputs requires another preview.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: Settlement } }, required: true } },
  responses: {
    200: { description: "The proposed result and its effect.", content: { "application/json": { schema: SettlementPreview } } },
    ...validationProblem, ...authProblems, ...notFoundProblem,
    ...conflictProblem("`competition_not_active`."),
  },
});
