import {
  createSeason,
  getSeason,
  listSeasons,
  seasonHasActiveCompetition,
  updateSeason,
  type SeasonChanges,
  type SeasonRecord,
} from "@deuceleague/db";
import { SeasonKind, SeasonState } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { problems } from "../problems.js";
import {
  audit,
  authProblems,
  checkStep,
  conflictProblem,
  definedOnly,
  IdParam,
  iso,
  notFoundProblem,
  PageQuery,
  pageOf,
  requires,
  sentFields,
  Timestamp,
  validationProblem,
} from "./shared.js";

const Season = z
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

const SeasonFields = z.object({
  name: z.string().trim().min(1).max(100),
  kind: SeasonKind.nullable().optional(),
  year: z.number().int().min(2000).max(2100).nullable().optional(),
  starts_on: z.iso.date().nullable().optional(),
  ends_on: z.iso.date().nullable().optional(),
  results_deadline_at: z.iso.datetime({ offset: true }).nullable().optional(),
});
const NewSeason = SeasonFields.openapi("NewSeason");
const SeasonPatch = SeasonFields.partial()
  .extend({
    state: SeasonState.optional().openapi({
      description:
        "One step at a time, forward or back: planning, active, complete, archived. Activating needs " +
        "`starts_on` and `ends_on`; a season with an active competition stays active.",
    }),
  })
  .openapi("SeasonChanges");

function toSeason(s: SeasonRecord): z.infer<typeof Season> {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind as SeasonKind | null,
    year: s.year,
    starts_on: s.startsOn,
    ends_on: s.endsOn,
    results_deadline_at: iso(s.resultsDeadlineAt),
    state: s.state as SeasonState,
    created_at: iso(s.createdAt),
    updated_at: iso(s.updatedAt),
  };
}

function toChanges(body: z.infer<typeof SeasonPatch>): SeasonChanges {
  return definedOnly({
    name: body.name,
    kind: body.kind,
    year: body.year,
    startsOn: body.starts_on,
    endsOn: body.ends_on,
    resultsDeadlineAt:
      body.results_deadline_at === undefined || body.results_deadline_at === null
        ? body.results_deadline_at
        : new Date(body.results_deadline_at),
    state: body.state,
  });
}

/** The database refuses an end before the start too; this says which field is wrong. */
function checkDates(startsOn: string | null, endsOn: string | null): void {
  if (startsOn && endsOn && endsOn < startsOn) {
    throw problems.validation([{ path: "ends_on", message: "must not be before starts_on" }]);
  }
}

const one = { content: { "application/json": { schema: Season } } };

const list = createRoute({
  method: "get",
  path: "/v1/seasons",
  tags: ["Seasons"],
  summary: "List seasons",
  description: "Oldest first.",
  ...requires("league:read"),
  request: { query: PageQuery.extend({ state: SeasonState.optional() }) },
  responses: {
    200: { description: "A page of seasons.", content: { "application/json": { schema: pageOf(Season, "SeasonPage") } } },
    ...validationProblem,
    ...authProblems,
  },
});

const get = createRoute({
  method: "get",
  path: "/v1/seasons/{id}",
  tags: ["Seasons"],
  summary: "A season",
  ...requires("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The season.", ...one }, ...authProblems, ...notFoundProblem },
});

const create = createRoute({
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

const patch = createRoute({
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

export function registerSeasons(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { state, limit, after } = c.req.valid("query");
    const page = await listSeasons(c.get("tx"), { state, limit, after });
    return c.json({ data: page.rows.map(toSeason), next_cursor: page.next }, 200);
  });

  app.openapi(get, async (c) => {
    const season = await getSeason(c.get("tx"), c.req.valid("param").id);
    if (!season) throw problems.notFound("season");
    return c.json(toSeason(season), 200);
  });

  app.openapi(create, async (c) => {
    const body = c.req.valid("json");
    checkDates(body.starts_on ?? null, body.ends_on ?? null);
    const season = await createSeason(c.get("tx"), c.get("auth").clubId, { ...toChanges(body), name: body.name });
    await audit(c, "season.created", { type: "season", id: season.id }, { name: season.name });
    return c.json(toSeason(season), 201);
  });

  app.openapi(patch, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const existing = await getSeason(tx, id);
    if (!existing) throw problems.notFound("season");
    const changes = toChanges(body);
    const after = { ...existing, ...changes };
    checkDates(after.startsOn, after.endsOn);

    if (changes.state && changes.state !== existing.state) {
      checkStep("season", SeasonState.options, existing.state, changes.state);
      if (existing.state === "active" && (await seasonHasActiveCompetition(tx, id))) {
        throw problems.conflict(
          "competition_active",
          "A competition in this season is still active",
          "Complete its competitions, or move them back to draft, first.",
        );
      }
    }
    // On the way in, and for as long as it is active: deadlines are counted from these.
    if (after.state === "active" && !(after.startsOn && after.endsOn)) {
      throw problems.conflict(
        "dates_needed",
        "An active season needs its dates",
        "Set starts_on and ends_on, in this request or before it, and keep them while it is active.",
      );
    }
    const changed = sentFields(body);
    if (changed.length === 0) return c.json(toSeason(existing), 200);

    const season = await updateSeason(tx, id, changes);
    await audit(c, "season.updated", { type: "season", id }, {
      changed,
      ...(season.state === existing.state ? {} : { state: { from: existing.state, to: season.state } }),
    });
    return c.json(toSeason(season), 200);
  });
}
