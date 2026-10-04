import { createRoute, z } from "@hono/zod-openapi";
import { CompetitionState, Discipline, TiebreakRule } from "@deuceleague/schema";
import { authProblems, IdParam, notFoundProblem, requires, Timestamp, validationProblem } from "./shared.js";

export const MatchLine = z
  .object({
    match_id: z.uuid(),
    opponent_entry_id: z.uuid(),
    result: z.enum(["won", "lost", "unplayed"]),
    outcome: z
      .enum(["completed", "retired", "walkover", "conceded"])
      .nullable()
      .openapi({ description: "Null for a match that never happened." }),
    points: z.number(),
    items: z
      .array(
        z.object({
          for: z.enum(["result", "sets", "close_loss", "convincing_win", "unplayed"]).openapi({
            description:
              "`result`: what the win or loss is worth, playing included. `sets`: for sets won. `close_loss` " +
              "and `convincing_win`: the margin bonuses. `unplayed`: a match that never happened.",
          }),
          points: z.number(),
        }),
      )
      .openapi({ description: "What earned the points, adding up to `points`." }),
  })
  .openapi("StandingsMatch", {
    description: "One match as it counts in an entry's row. Matches not yet in the ledger are not listed.",
  });

export const Row = z
  .object({
    position: z.number().int().nullable().openapi({ description: "1 is top. Null when unranked or withdrawn." }),
    standing: z.enum(["ranked", "unranked", "withdrawn"]).openapi({
      description: "Unranked: played fewer than the rules' minimum, so listed below the ranked. Withdrawn: listed last.",
    }),
    entry_id: z.uuid(),
    label: z.string().openapi({ example: "Sam K." }),
    points: z.number(),
    played: z.number().int().openapi({ description: "Matches it took the court for, or turned up ready to." }),
    won: z.number().int(),
    lost: z.number().int(),
    unplayed: z.number().int().openapi({ description: "Matches that never happened." }),
    outstanding: z.number().int().openapi({ description: "Matches not yet in the ledger; they count for nothing yet." }),
    sets_won: z.number().int(),
    sets_lost: z.number().int(),
    games_won: z.number().int(),
    games_lost: z.number().int(),
    separated_by: z
      .union([z.enum(["points", "games_won", "sets_won", "name"]), TiebreakRule])
      .nullable()
      .openapi({ description: "What put this entry below the one above it. Null at the top of each group." }),
    matches: z.array(MatchLine).openapi({
      description: "Where the points came from, match by match. With `all_played_bonus` they add up to `points`.",
    }),
    all_played_bonus: z.number().openapi({
      description: "For turning up to every match once all are in, if the rules give it; otherwise 0.",
    }),
    movement: z.enum(["promoted", "relegated"]).nullable().openapi({
      description:
        "Where the entry would go if the competition ended now, by its own movement rules — the same " +
        "suggestion placements would make. Null: held. The top division promotes nobody and the bottom " +
        "relegates nobody. Only ever a suggestion: the coach decides.",
    }),
  })
  .openapi("StandingsRow");

export const Standings = z
  .object({
    competition_id: z.uuid(),
    final: z.boolean().openapi({
      description:
        "True once the results deadline has passed or the competition is complete: matches still " +
        "outstanding then count as unplayed.",
    }),
    divisions: z.array(
      z.object({ division_id: z.uuid(), ordinal: z.number().int(), name: z.string(), rows: z.array(Row) }),
    ),
  })
  .openapi("Standings", { description: "Computed from the matches on every request, from the competition's rules." });

export const Counts = {
  matches: z.number().int(),
  played: z.number().int().openapi({ description: "In the ledger." }),
  outstanding: z.number().int().openapi({ description: "Not yet in the ledger: open, reported or disputed." }),
  reported: z.number().int().openapi({ description: "One side has claimed; waiting on the other." }),
  disputed: z.number().int().openapi({ description: "The two claims differ." }),
  percent_played: z.number().nullable(),
};

const BelowMinimum = z.number().int().openapi({
  description:
    "Active entries that have played fewer than `minimum_matches`, or than all their fixtures if they have " +
    "fewer. Played is counted as the tables count it.",
});

export const Progress = z
  .object({
    competition_id: z.uuid(),
    results_deadline_at: Timestamp.nullable(),
    days_remaining: z.number().int().nullable().openapi({
      description: "Whole days to the results deadline, on the club's own calendar.",
    }),
    active_entries: z.number().int(),
    ...Counts,
    minimum_matches: z.number().int().openapi({
      description: "How many matches each entry is expected to play: the competition's `minMatchesToPlay` rule.",
    }),
    below_minimum: BelowMinimum,
    divisions: z.array(
      z.object({
        division_id: z.uuid(),
        ordinal: z.number().int(),
        name: z.string(),
        active_entries: z.number().int(),
        ...Counts,
        below_minimum: BelowMinimum,
      }),
    ),
  })
  .openapi("Progress");

export const SeasonProgress = z
  .object({
    season_id: z.uuid(),
    results_deadline_at: Timestamp.nullable(),
    days_remaining: z.number().int().nullable().openapi({
      description: "Whole days to the results deadline, on the club's own calendar.",
    }),
    competitions: z.array(
      Progress.extend({
        name: z.string(),
        discipline: Discipline,
        state: CompetitionState,
        opted_out: z
          .array(z.object({ entry_id: z.uuid(), label: z.string(),
            said_by: z.string().nullable().openapi({ description: "Who said so, by display name: the players leaving, " +
              "on a break or not playing it, else the player who opted the entry out. Null when the coach did." }) }))
          .openapi({ description: "Entries whose players said they are not playing in the next competition." }),
      }),
    ),
  })
  .openapi("SeasonProgress");

export const EntryProgress = z
  .object({
    entry_id: z.uuid(),
    matches: z.number().int(),
    played: z.number().int(),
    outstanding: z.number().int(),
  })
  .openapi("EntryProgress");

export const ChaseEntry = z
  .object({
    competition_id: z.uuid(),
    competition_name: z.string(),
    division_id: z.uuid(),
    division_name: z.string(),
    member_id: z.uuid(),
    display_name: z.string(),
    email: z.string().nullable().optional().openapi({
      description: "PII. Present only for a credential holding `members:pii`.",
    }),
    outstanding_matches: z.number().int().openapi({ description: "Always needs_playing + awaiting_you + awaiting_them." }),
    needs_playing: z.number().int().openapi({ description: "Nobody has reported a result: go and arrange it." }),
    awaiting_you: z.number().int().openapi({
      description: "The opponent has a score in that this member has not agreed to: one click clears it.",
    }),
    awaiting_them: z.number().int().openapi({ description: "This member has claimed; the opponent has not answered." }),
    days_remaining: z.number().int().nullable(),
    waiting_on: z.array(z.string()).openapi({ description: "The opponents, as written on a results sheet." }),
    matches_played: z.number().int().openapi({ description: "As the tables count it." }),
    minimum_matches: z.number().int().openapi({
      description: "What this member is expected to play: the competition's `minMatchesToPlay`, or every fixture if fewer.",
    }),
    matches_short: z.number().int().openapi({ description: "How many more to reach `minimum_matches`; 0 once reached." }),
  })
  .openapi("ChaseEntry");

export const standings = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/standings",
  tags: ["Standings and progress"],
  summary: "A competition's tables",
  description:
    "Every division's table, top division first, computed now from the competition's rules: points, then " +
    "its tiebreaks in order, then the name, so a table never reorders itself. Each row says what separated " +
    "it from the one above.",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam, query: z.object({ division_id: z.uuid().optional() }) },
  responses: {
    200: { description: "The tables.", content: { "application/json": { schema: Standings } } },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
  },
});

export const progress = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/progress",
  tags: ["Standings and progress"],
  summary: "How far through a competition is",
  description: "Overall and by division: how much is played, waiting on a reply or disputed, and how long is left.",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: {
    200: { description: "The competition's progress.", content: { "application/json": { schema: Progress } } },
    ...authProblems,
    ...notFoundProblem,
  },
});

export const season = createRoute({
  method: "get",
  path: "/v1/seasons/{id}/progress",
  tags: ["Standings and progress"],
  summary: "How far through a season each competition is",
  description:
    "Every competition in the season, oldest first, with the same counts as its own progress and who has " +
    "opted out of the next one: a whole season's dashboard in one read. A player's session sees the " +
    "competitions open to members, once they are no longer drafts.",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: {
    200: { description: "The season's progress.", content: { "application/json": { schema: SeasonProgress } } },
    ...authProblems,
    ...notFoundProblem,
  },
});

export const entry = createRoute({
  method: "get",
  path: "/v1/entries/{id}/progress",
  tags: ["Standings and progress"],
  summary: "How far through its matches an entry is",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: {
    200: { description: "The entry's progress.", content: { "application/json": { schema: EntryProgress } } },
    ...authProblems,
    ...notFoundProblem,
  },
});

export const chase = createRoute({
  method: "get",
  path: "/v1/chase-list",
  tags: ["Standings and progress"],
  summary: "Who has matches outstanding",
  description:
    "One row per member per division, most outstanding first, split by what is needed from them. Only the " +
    "running season is listed: a finished season's matches cannot be settled, so nothing would clear them. A " +
    "match against a withdrawn entry, or one whose members have all left the club, is outstanding for no one " +
    "until the entry returns. " +
    "`within_days` is the whole reminder workflow: 30 a month out, 14 a fortnight later. Emails appear only " +
    "for a credential holding `members:pii`. What gets sent, and to whom, is the coach's decision — the " +
    "core sends nothing.",
  ...requires("members:read"),
  request: {
    query: z.object({
      competition_id: z.uuid().optional(),
      within_days: z.coerce.number().int().min(0).max(366).optional().openapi({
        description: "Only competitions whose deadline is at most this many days away.",
      }),
    }),
  },
  responses: {
    200: {
      description: "The list.",
      content: { "application/json": { schema: z.object({ data: z.array(ChaseEntry) }).openapi("ChaseList") } },
    },
    ...validationProblem,
    ...authProblems,
  },
});
