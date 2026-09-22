import {
  chaseList,
  competitionProgress,
  entryProgress,
  getEntry,
  type ChaseRow,
  type ProgressCounts,
} from "@deuceleague/db";
import { TiebreakRule } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { problems } from "../problems.js";
import { competitionTables, type DivisionTable } from "../standings.js";
import {
  authProblems,
  IdParam,
  iso,
  notFoundProblem,
  requires,
  Timestamp,
  validationProblem,
  visibleCompetition,
} from "./shared.js";

// ────────────────────────────────────────────────────────────── standings ──

const MatchLine = z
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

const Row = z
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
  })
  .openapi("StandingsRow");

const Standings = z
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

function toStandings(
  competitionId: string,
  tables: { final: boolean; divisions: DivisionTable[] },
): z.infer<typeof Standings> {
  return {
    competition_id: competitionId,
    final: tables.final,
    divisions: tables.divisions.map(({ division, rows }) => ({
      division_id: division.id,
      ordinal: division.ordinal,
      name: division.name,
      rows: rows.map((r) => ({
        position: r.position,
        standing: r.standing,
        entry_id: r.entryId,
        label: r.label,
        points: r.points,
        played: r.played,
        won: r.won,
        lost: r.lost,
        unplayed: r.unplayed,
        outstanding: r.outstanding,
        sets_won: r.setsWon,
        sets_lost: r.setsLost,
        games_won: r.gamesWon,
        games_lost: r.gamesLost,
        separated_by: r.separatedBy,
        matches: r.matches.map((m) => ({
          match_id: m.matchId,
          opponent_entry_id: m.opponentId,
          result: m.result,
          outcome: m.outcome,
          points: m.points,
          items: m.items,
        })),
        all_played_bonus: r.allPlayedBonus,
      })),
    })),
  };
}

// ─────────────────────────────────────────────────────────────── progress ──

const Counts = {
  matches: z.number().int(),
  played: z.number().int().openapi({ description: "In the ledger." }),
  outstanding: z.number().int().openapi({ description: "Not yet in the ledger: open, reported or disputed." }),
  reported: z.number().int().openapi({ description: "One side has claimed; waiting on the other." }),
  disputed: z.number().int().openapi({ description: "The two claims differ." }),
  percent_played: z.number().nullable(),
};

const Progress = z
  .object({
    competition_id: z.uuid(),
    results_deadline_at: Timestamp.nullable(),
    days_remaining: z.number().int().nullable().openapi({
      description: "Whole days to the results deadline, on the club's own calendar.",
    }),
    active_entries: z.number().int(),
    ...Counts,
    divisions: z.array(
      z.object({
        division_id: z.uuid(),
        ordinal: z.number().int(),
        name: z.string(),
        active_entries: z.number().int(),
        ...Counts,
      }),
    ),
  })
  .openapi("Progress");

const EntryProgress = z
  .object({
    entry_id: z.uuid(),
    matches: z.number().int(),
    played: z.number().int(),
    outstanding: z.number().int(),
  })
  .openapi("EntryProgress");

function toCounts(p: ProgressCounts) {
  return {
    matches: p.matches,
    played: p.played,
    outstanding: p.outstanding,
    reported: p.reported,
    disputed: p.disputed,
    percent_played: p.percentPlayed,
  };
}

// ─────────────────────────────────────────────────────────────── chasing ──

const ChaseEntry = z
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
  })
  .openapi("ChaseEntry");

function toChase(r: ChaseRow): z.infer<typeof ChaseEntry> {
  return {
    competition_id: r.competitionId,
    competition_name: r.competitionName,
    division_id: r.divisionId,
    division_name: r.divisionName,
    member_id: r.memberId,
    display_name: r.displayName,
    ...(r.email === undefined ? {} : { email: r.email }),
    outstanding_matches: r.outstandingMatches,
    needs_playing: r.needsPlaying,
    awaiting_you: r.awaitingYou,
    awaiting_them: r.awaitingThem,
    days_remaining: r.daysRemaining,
    waiting_on: r.waitingOn,
  };
}

// ───────────────────────────────────────────────────────────────── routes ──

const standings = createRoute({
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

const progress = createRoute({
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

const entry = createRoute({
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

const chase = createRoute({
  method: "get",
  path: "/v1/chase-list",
  tags: ["Standings and progress"],
  summary: "Who has matches outstanding",
  description:
    "One row per member per division, most outstanding first, split by what is needed from them. " +
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

export function registerStandings(app: OpenAPIHono<AppEnv>): void {
  app.openapi(standings, async (c) => {
    const { id } = c.req.valid("param");
    const { division_id } = c.req.valid("query");
    const tx = c.get("tx");
    const competition = await visibleCompetition(c, id);
    if (!competition) throw problems.notFound("competition");
    const tables = await competitionTables(tx, competition, { divisionId: division_id, now: new Date() });
    return c.json(toStandings(id, tables), 200);
  });

  app.openapi(progress, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    if (!(await visibleCompetition(c, id))) throw problems.notFound("competition");
    const p = await competitionProgress(tx, id);
    const empty = { matches: 0, played: 0, outstanding: 0, reported: 0, disputed: 0, percentPlayed: null };
    return c.json(
      {
        competition_id: id,
        results_deadline_at: iso(p?.resultsDeadlineAt ?? null),
        days_remaining: p?.daysRemaining ?? null,
        active_entries: p?.activeEntries ?? 0,
        ...toCounts(p ?? empty),
        divisions: (p?.divisions ?? []).map((d) => ({
          division_id: d.divisionId,
          ordinal: d.ordinal,
          name: d.name,
          active_entries: d.activeEntries,
          ...toCounts(d),
        })),
      },
      200,
    );
  });

  app.openapi(entry, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const found = await getEntry(tx, id);
    if (!found || !(await visibleCompetition(c, found.competitionId))) throw problems.notFound("entry");
    const p = await entryProgress(tx, id);
    return c.json(
      { entry_id: id, matches: p?.matches ?? 0, played: p?.played ?? 0, outstanding: p?.outstanding ?? 0 },
      200,
    );
  });

  app.openapi(chase, async (c) => {
    const { competition_id, within_days } = c.req.valid("query");
    const rows = await chaseList(c.get("tx"), {
      competitionId: competition_id,
      withinDays: within_days,
      pii: c.get("auth").scopes.has("members:pii"),
    });
    return c.json({ data: rows.map(toChase) }, 200);
  });
}
