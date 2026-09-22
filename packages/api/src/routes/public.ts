import {
  getClub,
  getCompetition,
  listDivisions,
  matchesIn,
  publicCompetitions,
  type PublicCompetition as PublicCompetitionRecord,
  type Tx,
} from "@deuceleague/db";
import { Category, CompetitionState, Discipline } from "@deuceleague/schema";
import { createRoute, z, type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { Problem, problems } from "../problems.js";
import { competitionTables } from "../standings.js";
import { iso, Timestamp, validationProblem } from "./shared.js";
import { Match, toMatch } from "./matches.js";
import { Standings, toStandings } from "./standings.js";

// Everything here is readable without a key, for a club's website to show its
// tables. Only competitions marked `public` and under way or finished appear,
// and nothing here carries more than display names: no claims, no typed-in
// text, no contact details. Each address is rate-limited.

const problemContent = { "application/problem+json": { schema: Problem } };
const publicProblems = {
  404: { description: "No club at that address, or no public competition with that id.", content: problemContent },
  429: { description: "Too many requests from one address; `Retry-After` says when to try again.", content: problemContent },
};

const Slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(40)
  .openapi({ example: "deuce-ltc", description: "The club's public address." });

const PublicCompetition = z
  .object({
    id: z.uuid(),
    name: z.string().openapi({ example: "Men's Singles" }),
    discipline: Discipline,
    category: Category,
    state: CompetitionState,
    season: z.object({
      name: z.string(),
      starts_on: z.iso.date().nullable(),
      ends_on: z.iso.date().nullable(),
      results_deadline_at: Timestamp.nullable(),
    }),
  })
  .openapi("PublicCompetition");

const PublicCompetitionDetail = PublicCompetition.extend({
  divisions: z.array(z.object({ id: z.uuid(), ordinal: z.number().int(), name: z.string() })),
}).openapi("PublicCompetitionDetail");

function toPublic(c: PublicCompetitionRecord): z.infer<typeof PublicCompetition> {
  return {
    id: c.id,
    name: c.name,
    discipline: c.discipline as Discipline,
    category: c.category as Category,
    state: c.state as CompetitionState,
    season: { name: c.seasonName, starts_on: c.startsOn, ends_on: c.endsOn, results_deadline_at: iso(c.resultsDeadlineAt) },
  };
}

/** The competition, if the public may read it. Anything else is simply not found. */
async function readable(tx: Tx, competitionId: string) {
  const [shown] = await publicCompetitions(tx, competitionId);
  if (!shown) throw problems.notFound("public competition");
  return shown;
}

const Params = z.object({ slug: Slug, id: z.uuid() });

const list = createRoute({
  method: "get",
  path: "/v1/public/{slug}/competitions",
  tags: ["Public"],
  summary: "A club's public competitions",
  description: "Needs no key. Competitions marked public that are under way or finished.",
  security: [],
  request: { params: z.object({ slug: Slug }) },
  responses: {
    200: {
      description: "The club's name and its public competitions.",
      content: {
        "application/json": {
          schema: z
            .object({ club: z.object({ slug: z.string(), name: z.string() }), data: z.array(PublicCompetition) })
            .openapi("PublicCompetitionList"),
        },
      },
    },
    ...validationProblem,
    ...publicProblems,
  },
});

const detail = createRoute({
  method: "get",
  path: "/v1/public/{slug}/competitions/{id}",
  tags: ["Public"],
  summary: "A public competition and its divisions",
  security: [],
  request: { params: Params },
  responses: {
    200: { description: "The competition.", content: { "application/json": { schema: PublicCompetitionDetail } } },
    ...validationProblem,
    ...publicProblems,
  },
});

const standings = createRoute({
  method: "get",
  path: "/v1/public/{slug}/competitions/{id}/standings",
  tags: ["Public"],
  summary: "A public competition's tables",
  security: [],
  request: { params: Params, query: z.object({ division_id: z.uuid().optional() }) },
  responses: {
    200: { description: "The tables.", content: { "application/json": { schema: Standings } } },
    ...validationProblem,
    ...publicProblems,
  },
});

const matches = createRoute({
  method: "get",
  path: "/v1/public/{slug}/competitions/{id}/matches",
  tags: ["Public"],
  summary: "A public competition's fixtures and results",
  description: "Every match, whole: a fixture is a match that is `open`. Results only — never the claims behind them.",
  security: [],
  request: { params: Params, query: z.object({ division_id: z.uuid().optional() }) },
  responses: {
    200: {
      description: "The matches.",
      content: { "application/json": { schema: z.object({ data: z.array(Match) }).openapi("PublicMatchList") } },
    },
    ...validationProblem,
    ...publicProblems,
  },
});

export function registerPublic(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const tx = c.get("tx");
    const club = (await getClub(tx, c.get("publicClubId")))!;
    const shown = await publicCompetitions(tx);
    return c.json({ club: { slug: club.slug, name: club.name }, data: shown.map(toPublic) }, 200);
  });

  app.openapi(detail, async (c) => {
    const tx = c.get("tx");
    const shown = await readable(tx, c.req.valid("param").id);
    const divisions = await listDivisions(tx, shown.id);
    return c.json(
      { ...toPublic(shown), divisions: divisions.map((d) => ({ id: d.id, ordinal: d.ordinal, name: d.name })) },
      200,
    );
  });

  app.openapi(standings, async (c) => {
    const tx = c.get("tx");
    const shown = await readable(tx, c.req.valid("param").id);
    const competition = (await getCompetition(tx, shown.id))!;
    const tables = await competitionTables(tx, competition, {
      divisionId: c.req.valid("query").division_id,
      now: new Date(),
    });
    return c.json(toStandings(shown.id, tables), 200);
  });

  app.openapi(matches, async (c) => {
    const tx = c.get("tx");
    const shown = await readable(tx, c.req.valid("param").id);
    const rows = await matchesIn(tx, shown.id, c.req.valid("query").division_id);
    return c.json({ data: rows.map(toMatch) }, 200);
  });
}
