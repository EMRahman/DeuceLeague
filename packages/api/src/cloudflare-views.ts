import type { D1Database } from "@cloudflare/workers-types";
import { commitIdentity, readLeagueViews, readChase, readSeasonProgress, retryMutation, type IdentitySnapshot,
  type LedgerMatch } from "@deuceleague/db-d1";
import { suggestPlacements } from "@deuceleague/engine";
import { RulesSpec, type MatchFormat } from "@deuceleague/schema";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import * as routes from "./contracts/standings.js";
import { iso } from "./contracts/shared.js";
import { daysRemaining, progressCounts, towardMinimum } from "./league/progress.js";
import { playerVisible } from "./league/rules.js";
import { tablesFromRecords } from "./league/tables.js";
import { toStandings, toCounts, toChase } from "./league/views.js";
import { problems } from "./problems.js";

type Views = Awaited<ReturnType<typeof readLeagueViews>>;

/**
 * A competition's progress as a rollup of its divisions': with no divisions it
 * has no deadline row, and matches without a division do not enter it.
 */
function competitionProgress(competition: { id: string; rules: unknown; matchFormat: MatchFormat },
  divisions: { id: string; ordinal: number; name: string }[],
  entries: { id: string; label: string; divisionId: string; state: string }[], matches: LedgerMatch[],
  seasonDeadline: Date | null, timezone: string, now: Date) {
  const deadline = divisions.length ? seasonDeadline : null;
  const ids = new Set(divisions.map((d) => d.id));
  const active = entries.filter((e) => e.state === "active");
  const rules = RulesSpec.parse(competition.rules);
  const toward = towardMinimum(rules, competition.matchFormat, entries.filter((e) => ids.has(e.divisionId)), matches);
  const activeIn = (divisionId: string) => active.filter((e) => e.divisionId === divisionId);
  const shortIn = (divisionId: string) => activeIn(divisionId).filter((e) => {
    const c = toward.get(e.id);
    return c !== undefined && c.played < c.target;
  }).length;
  return { competition_id: competition.id, results_deadline_at: iso(deadline), days_remaining: daysRemaining(deadline, timezone, now),
    active_entries: active.length, ...toCounts(progressCounts(matches.filter((m) => m.divisionId !== null && ids.has(m.divisionId)))),
    minimum_matches: rules.minMatchesToPlay, below_minimum: divisions.reduce((n, d) => n + shortIn(d.id), 0),
    divisions: divisions.map((d) => ({ division_id: d.id, ordinal: d.ordinal, name: d.name,
      active_entries: active.filter((e) => e.divisionId === d.id).length,
      ...toCounts(progressCounts(matches.filter((m) => m.divisionId === d.id))), below_minimum: shortIn(d.id) })) };
}
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
      const deadline = s.data.seasons.find((r) => r.id === competition.seasonId)?.resultsDeadlineAt ?? null;
      return competitionProgress(competition, s.data.divisions, s.data.entries, s.ledger, deadline, s.timezone, new Date(s.identity.now));
    }), 200);
  });
  app.openapi(routes.season, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, (i) => readSeasonProgress(db, i.hash, i.kind, id), (s) => {
      if (!s.season) throw problems.notFound("season");
      const now = new Date(s.identity.now);
      const shown = s.competitions.filter((x) => s.identity.kind === "api_key"
        || playerVisible(x as Parameters<typeof playerVisible>[0]));
      return { season_id: id, results_deadline_at: iso(s.season.deadline),
        days_remaining: daysRemaining(s.season.deadline, s.timezone, now),
        competitions: shown.map((x) => {
          const entries = s.entries.filter((e) => e.competitionId === x.id);
          return { ...competitionProgress(x, s.divisions.filter((d) => d.competitionId === x.id), entries,
            s.matches.filter((m) => m.competitionId === x.id), s.season!.deadline, s.timezone, now),
          name: x.name, discipline: x.discipline as "singles" | "doubles", state: x.state as "draft" | "active" | "complete" | "archived",
          opted_out: entries.filter((e) => e.optedOut).map((e) => ({ entry_id: e.id, label: e.label })) };
        }) };
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
    return c.json(await run(c, (i) => readChase(db, i.hash, i.kind, competition_id), (s) => {
      // Toward the minimum as the tables count it, the same as progress.
      const minimum = new Map(s.competitions.flatMap((x) => [...towardMinimum(RulesSpec.parse(x.rules), x.matchFormat,
        s.entries.filter((e) => e.competitionId === x.id), s.ledger.filter((m) => m.competitionId === x.id))]));
      return { data: s.rows.map((r) => ({ ...r,
        daysRemaining: daysRemaining(r.deadline, r.timezone, new Date(s.identity.now)),
      })).filter((r) => within_days === undefined || (r.daysRemaining !== null && r.daysRemaining <= within_days))
        .map((r) => toChase(r, minimum.get(r.entryId))) };
    }), 200);
  });
}
