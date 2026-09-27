import { createRoute, z } from "@hono/zod-openapi";
import {
  authProblems,
  conflictProblem,
  IdParam,
  notFoundProblem,
  requires,
  Timestamp,
  validationProblem,
} from "./shared.js";

export const Division = z
  .object({
    id: z.uuid(),
    competition_id: z.uuid(),
    ordinal: z.number().int().openapi({ description: "1 is the top division." }),
    name: z.string().openapi({ example: "Division 1" }),
    target_size: z.number().int().nullable().openapi({
      description: "Advisory: informs placement suggestions, never enforced.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Division");

export const DivisionFields = z.object({
  ordinal: z.number().int().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  target_size: z.number().int().min(2).max(100).nullable(),
});

export const NewDivision = DivisionFields.partial()
  .openapi({ description: 'Everything is optional: a new division goes below the lowest, named "Division N".' })
  .openapi("NewDivision");

export const DivisionPatch = DivisionFields.partial().openapi("DivisionChanges");

export const Fixtures = z
  .object({
    division_id: z.uuid(),
    created: z
      .array(z.object({ match_id: z.uuid(), side0_entry_id: z.uuid(), side1_entry_id: z.uuid() }))
      .openapi({ description: "The matches this call added. Empty if the division had every pairing already." }),
    pairings: z.number().int().openapi({
      description: "How many pairings the division's active entries make: n entries make n(n-1)/2.",
    }),
  })
  .openapi("Fixtures");

export const one = { content: { "application/json": { schema: Division } } };

export const list = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/divisions",
  tags: ["Divisions"],
  summary: "A competition's divisions",
  description: "Top first. Not paged: a competition has a handful.",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: {
    200: {
      description: "The divisions.",
      content: { "application/json": { schema: z.object({ data: z.array(Division) }).openapi("DivisionList") } },
    },
    ...authProblems,
    ...notFoundProblem,
  },
});

export const get = createRoute({
  method: "get",
  path: "/v1/divisions/{id}",
  tags: ["Divisions"],
  summary: "A division",
  ...requires.orPlayer("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The division.", ...one }, ...authProblems, ...notFoundProblem },
});

export const create = createRoute({
  method: "post",
  path: "/v1/competitions/{id}/divisions",
  tags: ["Divisions"],
  summary: "Add a division to a competition",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: NewDivision } }, required: true } },
  responses: {
    201: { description: "The new division.", ...one },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`ordinal_taken`, or `competition_closed`."),
  },
});

export const patch = createRoute({
  method: "patch",
  path: "/v1/divisions/{id}",
  tags: ["Divisions"],
  summary: "Change a division",
  description: "Only the fields sent change. To swap two divisions' ordinals, move one out of the way first.",
  ...requires("league:write"),
  request: { params: IdParam, body: { content: { "application/json": { schema: DivisionPatch } }, required: true } },
  responses: {
    200: { description: "The division, changed.", ...one },
    ...validationProblem,
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`ordinal_taken`, or `competition_closed`."),
  },
});

export const remove = createRoute({
  method: "delete",
  path: "/v1/divisions/{id}",
  tags: ["Divisions"],
  summary: "Delete an empty division",
  description: "Only a division with no entries and no matches, so nothing is ever lost with it.",
  ...requires("league:write"),
  request: { params: IdParam },
  responses: {
    204: { description: "Deleted." },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`division_in_use`, or `competition_closed`."),
  },
});

export const fixtures = createRoute({
  method: "post",
  path: "/v1/divisions/{id}/fixtures",
  tags: ["Divisions"],
  summary: "Generate a division's round robin",
  description:
    "Adds an open match for every pairing of the division's active entries that it does not have yet. " +
    "Safe to run again, after a late entry for instance: only the missing pairings are added, and a " +
    "pairing already there, played or not, is left alone. Matches have no dates; arranging them is up to the players.",
  ...requires("league:write"),
  request: { params: IdParam },
  responses: {
    200: { description: "What was added.", content: { "application/json": { schema: Fixtures } } },
    ...authProblems,
    ...notFoundProblem,
    ...conflictProblem("`competition_closed`."),
  },
});
