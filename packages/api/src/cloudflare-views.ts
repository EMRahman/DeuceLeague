import type { D1Database } from "@cloudflare/workers-types";
import { commitIdentity, readLeagueViews, readChase, retryMutation, type IdentitySnapshot } from "@deuceleague/db-d1";
import { suggestPlacements } from "@deuceleague/engine";
import { RulesSpec } from "@deuceleague/schema";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import * as routes from "./contracts/standings.js";
import { iso } from "./contracts/shared.js";
import { daysRemaining, progressCounts } from "./league/progress.js";
import { playerVisible } from "./league/rules.js";
import { tablesFromRecords } from "./league/tables.js";
import { toStandings, toCounts, toChase } from "./league/views.js";
import { problems } from "./problems.js";

type Views = Awaited<ReturnType<typeof readLeagueViews>>;
function visible(s: Views, id: string) {
  const found = s.data.competitions.find((c) => c.id === id);
  return found && (s.identity.kind === "api_key" || playerVisible(found)) ? found : null;
}
export function registerCloudflareViews(app: OpenAPIHono<CloudflareEnv>, db: D1Database) {
  async function run<S extends { identity: IdentitySnapshot }, T>(c: Context<CloudflareEnv>,
    read: (initial: IdentitySnapshot) => Promise<S>, render: (s: S) => T): Promise<T> {
    return retryMutation(async () => {
      const s = await read(c.get("identity"));
      const access = c.get("requiredAccess");
      if (!access) throw problems.credentialNotAccepted(["api_key"]);
      checkAccess(authFor(s.identity), access);
      const result = render(s);
      await commitIdentity(db, s.identity, { type: "read" });
      return result;
    });
  }
  app.openapi(routes.standings, async (c) => {
    const { id } = c.req.valid("param"); const { division_id } = c.req.valid("query");
    return c.json(await run(c, (i) => readLeagueViews(db, i.hash, i.kind, { competitionId: id }), (s) => {
      const competition = visible(s, id);
      if (!competition) throw problems.notFound("competition");
      const deadline = s.data.seasons.find((r) => r.id === competition.seasonId)?.resultsDeadlineAt ?? null;
      const tables = tablesFromRecords(competition, s.data.divisions, s.data.entries, s.ledger, deadline, new Date(s.identity.now));
      const suggestions = suggestPlacements(tables.divisions.map(({ division, rows }) => ({ ordinal: division.ordinal, name: division.name, standings: rows })),
        RulesSpec.parse(competition.rules).movement, s.data.divisions.map((d) => ({ ordinal: d.ordinal, name: d.name })),
        new Set(s.data.entries.filter((e) => e.optedOutAt !== null).map((e) => e.id)));
      const movement = new Map(suggestions.flatMap((p) => p.reason === "promoted" || p.reason === "relegated" ? [[p.entryId, p.reason]] : []));
      return toStandings(id, { ...tables, divisions: tables.divisions.filter((d) => !division_id || d.division.id === division_id) }, movement);
    }), 200);
  });
  app.openapi(routes.progress, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (i) => readLeagueViews(db, i.hash, i.kind, { competitionId: id }), (s) => {
      const competition = visible(s, id);
      if (!competition) throw problems.notFound("competition");
      // Competition progress is a rollup of division progress:
      // with no divisions it has no row, and matches without divisions do not enter it.
      const deadline = s.data.divisions.length ? s.data.seasons.find((r) => r.id === competition.seasonId)?.resultsDeadlineAt ?? null : null;
      const ids = new Set(s.data.divisions.map((d) => d.id));
      const active = s.data.entries.filter((e) => e.state === "active");
      return { competition_id: id, results_deadline_at: iso(deadline), days_remaining: daysRemaining(deadline, s.timezone, new Date(s.identity.now)),
        active_entries: active.length, ...toCounts(progressCounts(s.ledger.filter((m) => m.divisionId !== null && ids.has(m.divisionId)))),
        divisions: s.data.divisions.map((d) => ({ division_id: d.id, ordinal: d.ordinal, name: d.name,
          active_entries: active.filter((e) => e.divisionId === d.id).length,
          ...toCounts(progressCounts(s.ledger.filter((m) => m.divisionId === d.id))) })) };
    }), 200);
  });
  app.openapi(routes.entry, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (i) => readLeagueViews(db, i.hash, i.kind, { entryId: id }), (s) => {
      const entry = s.data.entries.find((e) => e.id === id);
      if (!entry || !visible(s, entry.competitionId)) throw problems.notFound("entry");
      const p = progressCounts(s.ledger.filter((m) => m.side0 === id || m.side1 === id));
      return { entry_id: id, matches: p.matches, played: p.played, outstanding: p.outstanding };
    }), 200);
  });
  app.openapi(routes.chase, async (c) => {
    const { competition_id, within_days } = c.req.valid("query");
    return c.json(await run(c, (i) => readChase(db, i.hash, i.kind, competition_id), (s) => ({ data: s.rows.map((r) => ({ ...r,
      daysRemaining: daysRemaining(r.deadline, r.timezone, new Date(s.identity.now)),
    })).filter((r) => within_days === undefined || (r.daysRemaining !== null && r.daysRemaining <= within_days)).map(toChase) })), 200);
  });
}
