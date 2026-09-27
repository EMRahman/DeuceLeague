import { chaseList, optedOutEntryIds, competitionProgress, entryProgress, getEntry } from "@deuceleague/db";
import { suggestPlacements } from "@deuceleague/engine";
import { RulesSpec } from "@deuceleague/schema";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../context.js";
import { standings, progress, entry, chase } from "../contracts/standings.js";
import { toStandings, toCounts, toChase } from "../league/views.js";
import { problems } from "../problems.js";
import { competitionTables } from "../standings.js";
import { iso, visibleCompetition } from "./shared.js";

export function registerStandings(app: OpenAPIHono<AppEnv>): void {
  app.openapi(standings, async (c) => {
    const { id } = c.req.valid("param");
    const { division_id } = c.req.valid("query");
    const tx = c.get("tx");
    const competition = await visibleCompetition(c, id);
    if (!competition) throw problems.notFound("competition");
    // Every division, even when one is asked for: who goes up depends on the division above.
    const tables = await competitionTables(tx, competition, { now: new Date() });
    const suggestions = suggestPlacements(
      tables.divisions.map(({ division, rows }) => ({ ordinal: division.ordinal, name: division.name, standings: rows })),
      RulesSpec.parse(competition.rules).movement,
      tables.divisions.map(({ division }) => ({ ordinal: division.ordinal, name: division.name })),
      new Set(await optedOutEntryIds(tx, id)),
    );
    const movement = new Map(
      suggestions.flatMap((s) => (s.reason === "promoted" || s.reason === "relegated" ? [[s.entryId, s.reason]] : [])),
    );
    const shown = { ...tables, divisions: tables.divisions.filter((d) => !division_id || d.division.id === division_id) };
    return c.json(toStandings(id, shown, movement), 200);
  });

  app.openapi(progress, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    if (!(await visibleCompetition(c, id))) throw problems.notFound("competition");
    const p = await competitionProgress(tx, id);
    const empty = { matches: 0, played: 0, outstanding: 0, reported: 0, disputed: 0, percentPlayed: null };
    return c.json(
      {
        competition_id: id,
        results_deadline_at: iso(p?.resultsDeadlineAt ?? null),
        days_remaining: p?.daysRemaining ?? null,
        active_entries: p?.activeEntries ?? 0,
        ...toCounts(p ?? empty),
        divisions: (p?.divisions ?? []).map((d) => ({
          division_id: d.divisionId,
          ordinal: d.ordinal,
          name: d.name,
          active_entries: d.activeEntries,
          ...toCounts(d),
        })),
      },
      200,
    );
  });

  app.openapi(entry, async (c) => {
    const { id } = c.req.valid("param");
    const tx = c.get("tx");
    const found = await getEntry(tx, id);
    if (!found || !(await visibleCompetition(c, found.competitionId))) throw problems.notFound("entry");
    const p = await entryProgress(tx, id);
    return c.json(
      { entry_id: id, matches: p?.matches ?? 0, played: p?.played ?? 0, outstanding: p?.outstanding ?? 0 },
      200,
    );
  });

  app.openapi(chase, async (c) => {
    const { competition_id, within_days } = c.req.valid("query");
    const rows = await chaseList(c.get("tx"), {
      competitionId: competition_id,
      withinDays: within_days,
      pii: c.get("auth").scopes.has("members:pii"),
    });
    return c.json({ data: rows.map(toChase) }, 200);
  });
}
