import { SeasonKind, SeasonState } from "@deuceleague/schema";
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

export const Season = z
  .object({
    id: z.uuid(),
    name: z.string().openapi({ example: "Summer 2026" }),
    kind: SeasonKind.nullable().openapi({ description: "An optional label for clubs that run quarterly." }),
    year: z.number().int().nullable(),
    starts_on: z.iso.date().nullable(),
    ends_on: z.iso.date().nullable(),
    results_deadline_at: Timestamp.nullable().openapi({
      description: "The one deadline for every competition in the season, counted in the club's time zone.",
    }),
    state: SeasonState,
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Season");

export const SeasonFields = z.object({
  name: z.string().trim().min(1).max(100),
  kind: SeasonKind.nullable().optional(),
  year: z.number().int().min(2000).max(2100).nullable().optional(),
  starts_on: z.iso.date().nullable().optional(),
  ends_on: z.iso.date().nullable().optional(),
  results_deadline_at: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const NewSeason = SeasonFields.openapi("NewSeason");

export const SeasonPatch = SeasonFields.partial()
  .extend({
    state: SeasonState.optional().openapi({
      description:
        "One step at a time, forward or back: planning, active, complete, archived. Activating needs " +
        "`starts_on` and `ends_on`; a season with an active competition stays active.",
    }),
  })
  .openapi("SeasonChanges");

export const one = { content: { "application/json": { schema: Season } } };

export const list = createRoute({
  method: "get",
  path: "/v1/seasons",
  tags: ["Seasons"],
  summary: "List seasons",
  description: "Oldest first.",
  ...requires.orPlayer("league:read"),
  request: { query: PageQuery.extend({ state: SeasonState.optional() }) },
  responses: {
    200: { description: "A page of seasons.", content: { "application/json": { schema: pageOf(Season, "SeasonPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

export const get = createRoute({
  method: "get",
  path: "/v1/seasons/{id}",
  tags: ["Seasons"],
  summary: "A season",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The season.", ...one }, ...authProblems, ...notFoundProblem },
});

export const create = createRoute({
  method: "post",
  path: "/v1/seasons",
  tags: ["Seasons"],
  summary: "Start planning a season",
  description: "A new season is `planning`. Its dates can wait until it is activated.",
  ...requires("league:write"),
  request: { body: { content: { "application/json": { schema: NewSeason } }, required: true } },
  responses: {
    201: { description: "The new season.", ...one },
    ...validationProblem,
    ...authProblems,
    ...conflictProblem("`name_taken`: the club already has a season with that name."),
  },
});

export const patch = createRoute({
  method: "patch",
  path: "/v1/seasons/{id}",
  tags: ["Seasons"],
  summary: "Change a season, or move it to another state",
  description: "Only the fields sent change; null clears one.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: SeasonPatch } }, required: true } },
  responses: {
    200: { description: "The season, changed.", ...one },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem(
      "`name_taken`; `invalid_transition`, a step too far; `dates_needed`, an active season without dates; or " +
        "`competition_active`, leaving active while a competition is.",
    ),
  },
});
