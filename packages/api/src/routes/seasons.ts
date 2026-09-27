import { createSeason, getSeason, listSeasons, seasonHasActiveCompetition, updateSeason } from "@deuceleague/db";
import { type OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { create, get, list, patch } from "../contracts/seasons.js";
import { checkSeasonChange } from "../league/rules.js";
import { checkDates, toChanges, toSeason } from "../league/seasons.js";
import { problems } from "../problems.js";
import { audit, sentFields } from "./shared.js";

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
    checkSeasonChange(existing, after, changes.state !== undefined && changes.state !== existing.state && existing.state === "active"
      ? await seasonHasActiveCompetition(tx, id) : false);
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
