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
import { DEFAULT_RULES } from "@deuceleague/schema";
import { type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { create, get, list, patch } from "../contracts/competitions.js";
import { resolveFormat, toCompetition } from "../league/competitions.js";
import { checkCompetitionChange, checkOpen, CLOSED } from "../league/rules.js";
import { problems } from "../problems.js";
import { audit, definedOnly, playerOf, sentFields, visibleCompetition } from "./shared.js";

/**
 * The competition, if its structure can still change — a draft, or one being
 * played. Divisions and entries check here before they change anything.
 */
export async function openCompetition(tx: Tx, competitionId: string): Promise<CompetitionRecord> {
  const competition = await getCompetition(tx, competitionId);
  if (!competition) throw problems.notFound("competition");
  return checkOpen(competition);
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

export function registerCompetitions(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { season_id, state, limit, after } = c.req.valid("query");
    const page = await listCompetitions(c.get("tx"), {
      seasonId: season_id,
      state,
      forPlayer: playerOf(c) !== null,
      limit,
      after,
    });
    return c.json({ data: page.rows.map(toCompetition), next_cursor: page.next }, 200);
  });

  app.openapi(get, async (c) => {
    const competition = await visibleCompetition(c, c.req.valid("param").id);
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

    checkCompetitionChange(existing, { ...existing, ...definedOnly({ discipline: body.discipline, state: body.state }) }, changed,
      body.discipline && body.discipline !== existing.discipline ? await countEntries(tx, id) : 0,
      body.state === "active" && body.state !== existing.state ? (await getSeason(tx, existing.seasonId))?.state : undefined);
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
