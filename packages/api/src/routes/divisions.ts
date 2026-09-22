import {
  activeEntryIds,
  createDivision,
  deleteDivision,
  divisionInUse,
  getCompetition,
  getDivision,
  insertFixtures,
  listDivisions,
  nextOrdinal,
  updateDivision,
  type DivisionRecord,
  type Tx,
} from "@deuceleague/db";
import { roundRobin } from "@deuceleague/engine";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { problems } from "../problems.js";
import { openCompetition } from "./competitions.js";
import {
  audit,
  authProblems,
  conflictProblem,
  definedOnly,
  IdParam,
  iso,
  notFoundProblem,
  requires,
  sentFields,
  Timestamp,
  validationProblem,
} from "./shared.js";

const Division = z
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

const DivisionFields = z.object({
  ordinal: z.number().int().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  target_size: z.number().int().min(2).max(100).nullable(),
});
const NewDivision = DivisionFields.partial()
  .openapi({ description: 'Everything is optional: a new division goes below the lowest, named "Division N".' })
  .openapi("NewDivision");
const DivisionPatch = DivisionFields.partial().openapi("DivisionChanges");

const Fixtures = z
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

function toDivision(d: DivisionRecord): z.infer<typeof Division> {
  return {
    id: d.id,
    competition_id: d.competitionId,
    ordinal: d.ordinal,
    name: d.name,
    target_size: d.targetSize,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
  };
}

/** The division, if its competition can still change. */
async function openDivision(tx: Tx, divisionId: string) {
  const division = await getDivision(tx, divisionId);
  if (!division) throw problems.notFound("division");
  const competition = await openCompetition(tx, division.competitionId);
  return { division, competition };
}

const one = { content: { "application/json": { schema: Division } } };

const list = createRoute({
  method: "get",
  path: "/v1/competitions/{id}/divisions",
  tags: ["Divisions"],
  summary: "A competition's divisions",
  description: "Top first. Not paged: a competition has a handful.",
  ...requires("league:read"),
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

const get = createRoute({
  method: "get",
  path: "/v1/divisions/{id}",
  tags: ["Divisions"],
  summary: "A division",
  ...requires("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The division.", ...one }, ...authProblems, ...notFoundProblem },
});

const create = createRoute({
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

const patch = createRoute({
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

const remove = createRoute({
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

const fixtures = createRoute({
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

export function registerDivisions(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    if (!(await getCompetition(tx, id))) throw problems.notFound("competition");
    return c.json({ data: (await listDivisions(tx, id)).map(toDivision) }, 200);
  });

  app.openapi(get, async (c) => {
    const division = await getDivision(c.get("tx"), c.req.valid("param").id);
    if (!division) throw problems.notFound("division");
    return c.json(toDivision(division), 200);
  });

  app.openapi(create, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const competition = await openCompetition(tx, id);
    const ordinal = body.ordinal ?? (await nextOrdinal(tx, competition.id));
    const division = await createDivision(tx, c.get("auth").clubId, {
      competitionId: competition.id,
      ordinal,
      name: body.name ?? `Division ${ordinal}`,
      targetSize: body.target_size ?? null,
    });
    await audit(c, "division.created", { type: "division", id: division.id }, {
      competition_id: competition.id,
      ordinal,
      name: division.name,
    });
    return c.json(toDivision(division), 201);
  });

  app.openapi(patch, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const { division: existing } = await openDivision(tx, id);
    const changed = sentFields(body);
    if (changed.length === 0) return c.json(toDivision(existing), 200);

    const division = await updateDivision(
      tx,
      id,
      definedOnly({ ordinal: body.ordinal, name: body.name, targetSize: body.target_size }),
    );
    await audit(c, "division.updated", { type: "division", id }, { changed });
    return c.json(toDivision(division), 200);
  });

  app.openapi(remove, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const { division } = await openDivision(tx, id);
    if (await divisionInUse(tx, id)) {
      throw problems.conflict(
        "division_in_use",
        "The division has entries or matches",
        "Move or delete its entries first. A division that has had matches keeps them, so it stays.",
      );
    }
    await deleteDivision(tx, id);
    await audit(c, "division.deleted", { type: "division", id }, {
      competition_id: division.competitionId,
      name: division.name,
    });
    return c.body(null, 204);
  });

  app.openapi(fixtures, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const { division } = await openDivision(tx, id);
    const pairings = roundRobin(await activeEntryIds(tx, id));
    const created = await insertFixtures(
      tx,
      { clubId: c.get("auth").clubId, competitionId: division.competitionId, divisionId: id },
      pairings,
    );
    if (created.length > 0) {
      await audit(c, "division.fixtures_generated", { type: "division", id }, {
        match_ids: created.map((m) => m.matchId),
      });
    }
    return c.json(
      {
        division_id: id,
        created: created.map((m) => ({ match_id: m.matchId, side0_entry_id: m.side0, side1_entry_id: m.side1 })),
        pairings: pairings.length,
      },
      200,
    );
  });
}
