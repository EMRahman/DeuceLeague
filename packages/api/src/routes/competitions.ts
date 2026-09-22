import {
  countEntries,
  createCompetition,
  getCompetition,
  getSeason,
  listCompetitions,
  updateCompetition,
  type CompetitionChanges,
  type CompetitionRecord,
  type Tx,
} from "@deuceleague/db";
import {
  Category,
  CompetitionState,
  DEFAULT_RULES,
  Discipline,
  MATCH_FORMATS,
  MatchFormat,
  RulesSpec,
  Visibility,
} from "@deuceleague/schema";
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

type Preset = keyof typeof MATCH_FORMATS;
const presets = Object.keys(MATCH_FORMATS) as [Preset, ...Preset[]];

/** A match format, or the name of a preset — stored expanded, so the competition never depends on the preset. */
const MatchFormatInput = z.union([z.enum(presets), MatchFormat]).openapi({
  description: `What a legal score is: a format, or the name of a preset (${presets.join(", ")}).`,
});

function resolveFormat(input: z.infer<typeof MatchFormatInput>): MatchFormat {
  return typeof input === "string" ? MatchFormat.parse(MATCH_FORMATS[input]) : input;
}

const Competition = z
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
      description: "Who among the club may see it. Nothing is readable without a credential.",
    }),
    created_at: Timestamp,
    updated_at: Timestamp,
  })
  .openapi("Competition");

const NewCompetition = z
  .object({
    season_id: z.uuid(),
    name: z.string().trim().min(1).max(100),
    discipline: Discipline,
    category: Category.optional().openapi({ description: "Defaults to `open`." }),
    match_format: MatchFormatInput,
    rules: RulesSpec.optional().openapi({
      description: "Defaults to the standard rules: 3 for a win, 1 for turning up and losing.",
    }),
    sequence_in_season: z.number().int().min(1).max(50).optional(),
    previous_competition_id: z.uuid().nullable().optional(),
    visibility: Visibility.optional().openapi({ description: "Defaults to `members`." }),
  })
  .openapi("NewCompetition");

const CompetitionPatch = z
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

function toCompetition(c: CompetitionRecord): z.infer<typeof Competition> {
  return {
    id: c.id,
    season_id: c.seasonId,
    name: c.name,
    discipline: c.discipline as Discipline,
    category: c.category as Category,
    match_format: c.matchFormat,
    rules: c.rules,
    sequence_in_season: c.sequenceInSeason,
    previous_competition_id: c.previousCompetitionId,
    state: c.state as CompetitionState,
    visibility: c.visibility as Visibility,
    created_at: iso(c.createdAt),
    updated_at: iso(c.updatedAt),
  };
}

/** A complete or archived competition is a record of what happened, not a draft. */
const CLOSED: readonly string[] = ["complete", "archived"];

/**
 * The competition, if its structure can still change — a draft, or one being
 * played. Divisions and entries check here before they change anything.
 */
export async function openCompetition(tx: Tx, competitionId: string): Promise<CompetitionRecord> {
  const competition = await getCompetition(tx, competitionId);
  if (!competition) throw problems.notFound("competition");
  if (CLOSED.includes(competition.state)) {
    throw problems.conflict(
      "competition_closed",
      `The competition is ${competition.state}`,
      "Its divisions and entries are a record now. Move it back to active to change them.",
    );
  }
  return competition;
}

/** The previous competition must be another one in this club. */
async function checkPrevious(tx: Tx, previousId: string | null | undefined, selfId: string | null): Promise<void> {
  if (!previousId) return;
  if (previousId === selfId || !(await getCompetition(tx, previousId))) {
    throw problems.validation([
      { path: "previous_competition_id", message: "must be another competition in this club" },
    ]);
  }
}

const one = { content: { "application/json": { schema: Competition } } };

const list = createRoute({
  method: "get",
  path: "/v1/competitions",
  tags: ["Competitions"],
  summary: "List competitions",
  description: "Oldest first.",
  ...requires("league:read"),
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

const get = createRoute({
  method: "get",
  path: "/v1/competitions/{id}",
  tags: ["Competitions"],
  summary: "A competition",
  ...requires("league:read"),
  request: { params: IdParam },
  responses: { 200: { description: "The competition.", ...one }, ...authProblems, ...notFoundProblem },
});

const create = createRoute({
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

const patch = createRoute({
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

export function registerCompetitions(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { season_id, state, limit, after } = c.req.valid("query");
    const page = await listCompetitions(c.get("tx"), { seasonId: season_id, state, limit, after });
    return c.json({ data: page.rows.map(toCompetition), next_cursor: page.next }, 200);
  });

  app.openapi(get, async (c) => {
    const competition = await getCompetition(c.get("tx"), c.req.valid("param").id);
    if (!competition) throw problems.notFound("competition");
    return c.json(toCompetition(competition), 200);
  });

  app.openapi(create, async (c) => {
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const season = await getSeason(tx, body.season_id);
    if (!season) throw problems.validation([{ path: "season_id", message: "no season with that id in this club" }]);
    if (CLOSED.includes(season.state)) {
      throw problems.conflict("season_closed", `The season is ${season.state}`);
    }
    await checkPrevious(tx, body.previous_competition_id, null);

    const competition = await createCompetition(tx, c.get("auth").clubId, {
      ...definedOnly({
        category: body.category,
        sequenceInSeason: body.sequence_in_season,
        previousCompetitionId: body.previous_competition_id,
        visibility: body.visibility,
      }),
      seasonId: season.id,
      name: body.name,
      discipline: body.discipline,
      matchFormat: resolveFormat(body.match_format),
      rules: body.rules ?? DEFAULT_RULES,
    });
    await audit(c, "competition.created", { type: "competition", id: competition.id }, {
      name: competition.name,
      season_id: season.id,
    });
    return c.json(toCompetition(competition), 201);
  });

  app.openapi(patch, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const tx = c.get("tx");
    const existing = await getCompetition(tx, id);
    if (!existing) throw problems.notFound("competition");
    const changed = sentFields(body);

    if (CLOSED.includes(existing.state) && changed.some((f) => f !== "state" && f !== "visibility")) {
      throw problems.conflict(
        "competition_closed",
        `The competition is ${existing.state}`,
        "Only its state and visibility can change. Move it back to active to change anything else.",
      );
    }
    if (body.discipline && body.discipline !== existing.discipline && (await countEntries(tx, id)) > 0) {
      throw problems.conflict(
        "entries_exist",
        "The discipline cannot change once there are entries",
        "A singles entry has one member and a doubles entry two; changing it would leave every entry wrong.",
      );
    }
    if (body.state && body.state !== existing.state) {
      checkStep("competition", CompetitionState.options, existing.state, body.state);
      if (body.state === "active") {
        const season = await getSeason(tx, existing.seasonId);
        if (season?.state !== "active") {
          throw problems.conflict(
            "season_not_active",
            "A competition can only be active in an active season",
            "Activate the season first; it needs its dates for that.",
          );
        }
      }
    }
    await checkPrevious(tx, body.previous_competition_id, id);
    if (changed.length === 0) return c.json(toCompetition(existing), 200);

    const changes: CompetitionChanges = definedOnly({
      name: body.name,
      discipline: body.discipline,
      category: body.category,
      matchFormat: body.match_format === undefined ? undefined : resolveFormat(body.match_format),
      rules: body.rules,
      sequenceInSeason: body.sequence_in_season,
      previousCompetitionId: body.previous_competition_id,
      state: body.state,
      visibility: body.visibility,
    });
    const competition = await updateCompetition(tx, id, changes);
    await audit(c, "competition.updated", { type: "competition", id }, {
      changed,
      ...(competition.state === existing.state ? {} : { state: { from: existing.state, to: competition.state } }),
    });
    return c.json(toCompetition(competition), 200);
  });
}
