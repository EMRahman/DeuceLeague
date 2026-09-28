import {
  activeEntryIds,
  createDivision,
  deleteDivision,
  divisionInUse,
  getDivision,
  insertFixtures,
  listDivisions,
  nextOrdinal,
  updateDivision,
  type Tx,
} from "@deuceleague/db";
import { roundRobin } from "@deuceleague/engine";
import { type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { create, fixtures, get, list, patch, remove } from "../contracts/divisions.js";
import { toDivision } from "../league/divisions.js";
import { problems } from "../problems.js";
import { openCompetition } from "./competitions.js";
import { audit, definedOnly, sentFields, visibleCompetition } from "./shared.js";

/** The division, if its competition can still change. */
async function openDivision(tx: Tx, divisionId: string) {
  const division = await getDivision(tx, divisionId);
  if (!division) throw problems.notFound("division");
  const competition = await openCompetition(tx, division.competitionId);
  return { division, competition };
}

export function registerDivisions(app: OpenAPIHono<AppEnv>): void {
  app.openapi(list, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    if (!(await visibleCompetition(c, id))) throw problems.notFound("competition");
    return c.json({ data: (await listDivisions(tx, id)).map(toDivision) }, 200);
  });

  app.openapi(get, async (c) => {
    const division = await getDivision(c.get("tx"), c.req.valid("param").id);
    if (!division || !(await visibleCompetition(c, division.competitionId))) throw problems.notFound("division");
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
