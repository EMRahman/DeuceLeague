import {
  Category,
  CompetitionState,
  Discipline,
  MATCH_FORMATS,
  MatchFormat,
  RulesSpec,
  Visibility,
} from "@deuceleague/schema";
import { createRoute, z } from "@hono/zod-openapi";
import {
  authProblems,
  conflictProblem,
  IdParam,
  notFoundProblem,
  pageOf,
  PageQuery,
  requires,
  Timestamp,
  validationProblem,
} from "./shared.js";

export type Preset = keyof typeof MATCH_FORMATS;

export const presets = Object.keys(MATCH_FORMATS) as [Preset, ...Preset[]];

/** Expand a named preset before saving so existing competitions never depend on changing presets. */
export const MatchFormatInput = z.union([z.enum(presets), MatchFormat]).openapi({
  description: `What a legal score is: a format, or the name of a preset (${presets.join(", ")}).`,
});

export const Competition = z
  .object({
    id: z.uuid(),
    season_id: z.uuid(),
    name: z.string().openapi({ example: "Men's Singles" }),
    discipline: Discipline,
    // .meta(), not .openapi(): the shared schemas are built before @hono/zod-openapi adds
    // .openapi() to new ones, and zod copies methods onto a schema when it is built.
    category: Category.meta({ description: "Advisory: an unusual pairing is warned about, never refused." }),
    match_format: MatchFormat,
    rules: RulesSpec,
    sequence_in_season: z.number().int().openapi({
      description: "For clubs running several rounds in one season; most leave it at 1.",
    }),
    previous_competition_id: z.uuid().nullable().openapi({
      description: "Where promotion and relegation are suggested from.",
    }),
    state: CompetitionState,
    visibility: Visibility.meta({
      description:
        "`members`: every member of the club who signs in. `private`: only the coach's credentials, never a " +
        "player's login. Nothing is readable without a credential.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Competition");

export const NewCompetition = z
  .object({
    season_id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    discipline: Discipline,
    category: Category.optional().openapi({ description: "Defaults to `open`." }),
    match_format: MatchFormatInput,
    rules: RulesSpec.optional().openapi({
      description:
        "Defaults to the standard rules: 1 for playing, 3 more for winning and 1 per set won; 1 for losing " +
        "by 4 games or fewer or winning by 8 or more; 1 for turning up to every match; 3 in total for a " +
        "win by retirement, walkover or concession, and 0 for that loss. Everyone is expected to play at least 4 " +
        "matches (`minMatchesToPlay`), or all their fixtures if fewer.",
    }),
    sequence_in_season: z.number().int().min(1).max(50).optional(),
    previous_competition_id: z.uuid().nullable().optional(),
    visibility: Visibility.optional().openapi({ description: "Defaults to `members`." }),
  })
  .openapi("NewCompetition");

export const CompetitionPatch = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    discipline: Discipline.optional().openapi({ description: "Only while the competition has no entries." }),
    category: Category.optional(),
    match_format: MatchFormatInput.optional(),
    rules: RulesSpec.optional().openapi({
      description: "Replaces the rules whole. Standings follow at once: they are computed on every read.",
    }),
    sequence_in_season: z.number().int().min(1).max(50).optional(),
    previous_competition_id: z.uuid().nullable().optional(),
    state: CompetitionState.optional().openapi({
      description:
        "One step at a time, forward or back: draft, active, complete, archived. Only a competition in " +
        "an active season can be activated. A complete or archived competition changes only its state " +
        "and visibility.",
    }),
    visibility: Visibility.optional(),
  })
  .openapi("CompetitionChanges");

export const one = { content: { "application/json": { schema: Competition } } };

export const list = createRoute({
  method: "get",
  path: "/v1/competitions",
  tags: ["Competitions"],
  summary: "List competitions",
  description: "Oldest first. A player's session sees those open to members, once they are no longer drafts.",
  ...requires.orPlayer("league:read"),
  request: { query: PageQuery.extend({ season_id: z.uuid().optional(), state: CompetitionState.optional() }) },
  responses: {
    200: {
      description: "A page of competitions.",
      content: { "application/json": { schema: pageOf(Competition, "CompetitionPage") } },
    },
    ...validationProblem,
    ...authProblems,
  },
});

export const get = createRoute({
  method: "get",
  path: "/v1/competitions/{id}",
  tags: ["Competitions"],
  summary: "A competition",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The competition.", ...one }, ...authProblems, ...notFoundProblem },
});

export const create = createRoute({
  method: "post",
  path: "/v1/competitions",
  tags: ["Competitions"],
  summary: "Create a competition",
  description:
    "A new competition is a `draft`. Its match format and rules are checked now, because rules are data: " +
    "a mistake here would otherwise surface at the end of the season.",
  ...requires("league:write"),
  request: { body: { content: { "application/json": { schema: NewCompetition } }, required: true } },
  responses: {
    201: { description: "The new competition.", ...one },
    ...validationProblem,
    ...authProblems,
    ...conflictProblem("`name_taken`, or `season_closed`: the season is complete or archived."),
  },
});

export const patch = createRoute({
  method: "patch",
  path: "/v1/competitions/{id}",
  tags: ["Competitions"],
  summary: "Change a competition, or move it to another state",
  description: "Only the fields sent change.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: CompetitionPatch } }, required: true } },
  responses: {
    200: { description: "The competition, changed.", ...one },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem(
      "`name_taken`; `invalid_transition`; `season_not_active`; `competition_closed`; or `entries_exist`, " +
        "changing the discipline of a competition with entries.",
    ),
  },
});
