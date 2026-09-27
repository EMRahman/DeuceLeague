import type { D1Database } from "@cloudflare/workers-types";
import { commitLeague, LeagueConstraintError, readLeague, retryMutation, uuidv7,
  type LeagueSnapshot, type LeagueQuery, type LeagueWrite, type LeagueEvent,
  type SeasonRecord, type LeagueCompetitionRecord, type DivisionRecord, type EntryRecord } from "@deuceleague/db-d1";
import { roundRobin } from "@deuceleague/engine";
import { DEFAULT_RULES } from "@deuceleague/schema";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { Context } from "hono";
import { checkAccess } from "./access.js";
import { authFor, type CloudflareEnv } from "./cloudflare-auth.js";
import type { Auth } from "./context.js";
import * as seasons from "./contracts/seasons.js";
import * as competitions from "./contracts/competitions.js";
import * as divisions from "./contracts/divisions.js";
import * as entries from "./contracts/entries.js";
import { definedOnly, sentFields } from "./contracts/shared.js";
import { toSeason, toChanges as seasonChanges, checkDates } from "./league/seasons.js";
import { toCompetition, resolveFormat } from "./league/competitions.js";
import { toDivision } from "./league/divisions.js";
import { toEntry } from "./league/entries.js";
import { CLOSED, checkOpen, checkSeasonChange, checkCompetitionChange, checkLineup, hasMatches, overriddenPlacement, playerVisible } from "./league/rules.js";
import { problems } from "./problems.js";

type RequestState = LeagueSnapshot & { auth: Auth; writes: LeagueWrite[]; events: LeagueEvent[]; now: Date };
function record(s: RequestState) { return { id: uuidv7(), clubId: s.auth.clubId, createdAt: s.now, updatedAt: s.now }; }
function audit(s: RequestState, type: string, subjectType: string, id: string, payload: object = {}) { s.events.push({ type, subjectType, id, payload }); }
function findCompetition(s: RequestState, id: string, visible = false) {
  const found = s.data.competitions.find((c) => c.id === id);
  return found && (!visible || s.auth.credential.type !== "session" || playerVisible(found)) ? found : null;
}
function openCompetition(s: RequestState, id: string) {
  const found = findCompetition(s, id);
  if (!found) throw problems.notFound("competition");
  return checkOpen(found);
}
function openDivision(s: RequestState, id: string) {
  const found = s.data.divisions.find((d) => d.id === id);
  if (!found) throw problems.notFound("division");
  openCompetition(s, found.competitionId);
  return found;
}
function divisionIn(s: RequestState, competitionId: string, id: string) {
  const found = s.data.divisions.find((d) => d.id === id && d.competitionId === competitionId);
  if (!found) throw problems.validation([{ path: "division_id", message: "no division with that id in this competition" }]);
  return found;
}
function previousCompetition(s: RequestState, id: string | null | undefined, self: string | null) {
  if (id && (id === self || !findCompetition(s, id))) throw problems.validation([{ path: "previous_competition_id", message: "must be another competition in this club" }]);
}
function previousEntry(s: RequestState, id: string | null | undefined, competitionId: string) {
  if (id && !s.data.entries.some((e) => e.id === id && e.competitionId !== competitionId)) throw problems.validation([
    { path: "previous_entry_id", message: "must be an entry in another competition of this club" },
  ]);
}
function removeFixtures(s: RequestState) {
  if (s.data.matches.some((m) => m.status !== "open" || m.hasClaims)) throw hasMatches();
  const ids = s.data.matches.map((m) => m.id);
  if (ids.length) s.writes.push({ type: "deleteFixtures", ids });
  return ids;
}
function page<T extends { id: string }, R>(rows: T[], limit: number, map: (row: T) => R) {
  return { data: rows.slice(0, limit).map(map), next_cursor: rows.length > limit ? rows[limit - 1]!.id : null };
}
function stateEvent(before: { state: string }, after: { state: string }) {
  return before.state === after.state ? {} : { state: { from: before.state, to: after.state } };
}

export function registerCloudflareLeague(app: OpenAPIHono<CloudflareEnv>, db: D1Database) {
  async function run<T>(c: Context<CloudflareEnv>, query: LeagueQuery, decide: (s: RequestState) => T): Promise<T> {
    return retryMutation(async () => {
      const initial = c.get("identity");
      const snapshot = await readLeague(db, initial.hash, initial.kind, query);
      const auth = authFor(snapshot.identity);
      const access = c.get("requiredAccess");
      if (!access) throw problems.credentialNotAccepted(["api_key"]);
      checkAccess(auth, access);
      const state: RequestState = { ...snapshot, auth, writes: [], events: [], now: new Date(snapshot.identity.now) };
      const response = decide(state);
      try { await commitLeague(db, state, state.writes, state.events); }
      catch (error) {
        if (error instanceof LeagueConstraintError) {
          const messages = {
            seasonName: ["name_taken", "The club already has a season with that name"],
            competitionName: ["name_taken", "The season already has a competition with that name"],
            ordinal: ["ordinal_taken", "The competition already has a division with that ordinal"],
            memberEntered: ["already_entered", "A member is already entered in this competition"],
          } as const;
          const [code, title] = messages[error.constraint];
          throw problems.conflict(code, title);
        }
        throw error;
      }
      // Records returned here contain exactly the values written by this batch,
      // with timestamps reserved in the snapshot; no later read can race the response.
      return response;
    });
  }

  app.openapi(seasons.list, async (c) => {
    const q = c.req.valid("query");
    return c.json(await run(c, { ...q, list: "seasons" }, (s) => page(s.data.seasons, q.limit, toSeason)), 200);
  });
  app.openapi(seasons.get, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, { seasonId: id }, (s) => {
      const found = s.data.seasons.find((r) => r.id === id);
      if (!found) throw problems.notFound("season");
      return toSeason(found);
    }), 200);
  });
  app.openapi(seasons.create, async (c) => {
    const body = c.req.valid("json");
    return c.json(await run(c, {}, (s) => {
      checkDates(body.starts_on ?? null, body.ends_on ?? null);
      const row: SeasonRecord = { ...record(s), name: body.name, kind: null, year: null, startsOn: null, endsOn: null,
        resultsDeadlineAt: null, state: "planning", ...seasonChanges(body) };
      s.writes.push({ type: "season", record: row, create: true });
      audit(s, "season.created", "season", row.id, { name: row.name });
      return toSeason(row);
    }), 201);
  });
  app.openapi(seasons.patch, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json");
    return c.json(await run(c, { seasonId: id }, (s) => {
      const before = s.data.seasons.find((r) => r.id === id);
      if (!before) throw problems.notFound("season");
      const after = { ...before, ...seasonChanges(body), updatedAt: s.now };
      checkSeasonChange(before, after, s.data.competitions.some((r) => r.seasonId === id && r.state === "active"));
      const changed = sentFields(body);
      if (!changed.length) return toSeason(before);
      s.writes.push({ type: "season", record: after, create: false });
      audit(s, "season.updated", "season", id, { changed, ...stateEvent(before, after) });
      return toSeason(after);
    }), 200);
  });
  app.openapi(competitions.list, async (c) => {
    const q = c.req.valid("query");
    return c.json(await run(c, { list: "competitions", ...definedOnly({ seasonId: q.season_id, state: q.state, after: q.after }), limit: q.limit },
      (s) => page(s.data.competitions, q.limit, toCompetition)), 200);
  });
  app.openapi(competitions.get, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, { competitionId: id }, (s) => {
      const found = findCompetition(s, id, true);
      if (!found) throw problems.notFound("competition");
      return toCompetition(found);
    }), 200);
  });
  app.openapi(competitions.create, async (c) => {
    const body = c.req.valid("json");
    return c.json(await run(c, { seasonId: body.season_id, ...definedOnly({ previousCompetitionId: body.previous_competition_id }) }, (s) => {
      const season = s.data.seasons.find((r) => r.id === body.season_id);
      if (!season) throw problems.validation([{ path: "season_id", message: "no season with that id in this club" }]);
      if (CLOSED.includes(season.state)) throw problems.conflict("season_closed", `The season is ${season.state}`);
      previousCompetition(s, body.previous_competition_id, null);
      const row: LeagueCompetitionRecord = { ...record(s), seasonId: season.id, name: body.name, discipline: body.discipline,
        category: body.category ?? "open", matchFormat: resolveFormat(body.match_format), rules: body.rules ?? DEFAULT_RULES,
        sequenceInSeason: body.sequence_in_season ?? 1, previousCompetitionId: body.previous_competition_id ?? null,
        state: "draft", visibility: body.visibility ?? "members" };
      s.writes.push({ type: "competition", record: row, create: true });
      audit(s, "competition.created", "competition", row.id, { name: row.name, season_id: season.id });
      return toCompetition(row);
    }), 201);
  });
  app.openapi(competitions.patch, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json");
    return c.json(await run(c, { competitionId: id, ...definedOnly({ previousCompetitionId: body.previous_competition_id }) }, (s) => {
      const before = findCompetition(s, id);
      if (!before) throw problems.notFound("competition");
      const changed = sentFields(body);
      const after: LeagueCompetitionRecord = { ...before, ...definedOnly({ name: body.name, discipline: body.discipline,
        category: body.category, matchFormat: body.match_format === undefined ? undefined : resolveFormat(body.match_format),
        rules: body.rules, sequenceInSeason: body.sequence_in_season, previousCompetitionId: body.previous_competition_id,
        state: body.state, visibility: body.visibility }), updatedAt: s.now };
      checkCompetitionChange(before, after, changed, s.data.entries.filter((e) => e.competitionId === id).length,
        s.data.seasons.find((r) => r.id === before.seasonId)?.state);
      previousCompetition(s, body.previous_competition_id, id);
      if (!changed.length) return toCompetition(before);
      s.writes.push({ type: "competition", record: after, create: false });
      audit(s, "competition.updated", "competition", id, { changed, ...stateEvent(before, after) });
      return toCompetition(after);
    }), 200);
  });
  app.openapi(divisions.list, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, { competitionId: id }, (s) => {
      if (!findCompetition(s, id, true)) throw problems.notFound("competition");
      return { data: s.data.divisions.map(toDivision) };
    }), 200);
  });
  app.openapi(divisions.get, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, { divisionId: id }, (s) => {
      const found = s.data.divisions.find((r) => r.id === id);
      if (!found || !findCompetition(s, found.competitionId, true)) throw problems.notFound("division");
      return toDivision(found);
    }), 200);
  });
  app.openapi(divisions.create, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json");
    return c.json(await run(c, { competitionId: id }, (s) => {
      openCompetition(s, id);
      const ordinal = body.ordinal ?? Math.max(0, ...s.data.divisions.map((d) => d.ordinal)) + 1;
      const row: DivisionRecord = { ...record(s), competitionId: id, ordinal, name: body.name ?? `Division ${ordinal}`, targetSize: body.target_size ?? null };
      s.writes.push({ type: "division", record: row, create: true });
      audit(s, "division.created", "division", row.id, { competition_id: id, ordinal, name: row.name });
      return toDivision(row);
    }), 201);
  });
  app.openapi(divisions.patch, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json");
    return c.json(await run(c, { divisionId: id }, (s) => {
      const before = openDivision(s, id); const changed = sentFields(body);
      if (!changed.length) return toDivision(before);
      const row = { ...before, ...definedOnly({ ordinal: body.ordinal, name: body.name, targetSize: body.target_size }), updatedAt: s.now };
      s.writes.push({ type: "division", record: row, create: false });
      audit(s, "division.updated", "division", id, { changed });
      return toDivision(row);
    }), 200);
  });
  app.openapi(divisions.remove, async (c) => {
    const { id } = c.req.valid("param");
    await run(c, { divisionId: id }, (s) => {
      const row = openDivision(s, id);
      if (s.data.entries.some((e) => e.divisionId === id) || s.data.matches.length) throw problems.conflict("division_in_use", "The division has entries or matches",
        "Move or delete its entries first. A division that has had matches keeps them, so it stays.");
      s.writes.push({ type: "deleteDivision", id });
      audit(s, "division.deleted", "division", id, { competition_id: row.competitionId, name: row.name });
    });
    return c.body(null, 204);
  });
  app.openapi(divisions.fixtures, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, { divisionId: id }, (s) => {
      const division = openDivision(s, id);
      const pairings = roundRobin(s.data.entries.filter((e) => e.divisionId === id && e.state === "active").map((e) => e.id));
      const existing = new Set(s.data.matches.map((m) => m.pairingKey));
      const created = pairings.filter((p) => !existing.has(p.pairingKey)).map((p) => ({ ...p, matchId: uuidv7() }));
      if (created.length) {
        s.writes.push({ type: "fixtures", competitionId: division.competitionId, divisionId: id, fixtures: created });
        audit(s, "division.fixtures_generated", "division", id, { match_ids: created.map((m) => m.matchId) });
      }
      return { division_id: id, created: created.map((m) => ({ match_id: m.matchId, side0_entry_id: m.side0, side1_entry_id: m.side1 })), pairings: pairings.length };
    }), 200);
  });
  app.openapi(entries.list, async (c) => {
    const { id } = c.req.valid("param"); const q = c.req.valid("query");
    return c.json(await run(c, { competitionId: id }, (s) => {
      if (!findCompetition(s, id, true)) throw problems.notFound("competition");
      return { data: s.data.entries.filter((e) => (!q.division_id || e.divisionId === q.division_id) && (!q.state || e.state === q.state)).map(toEntry) };
    }), 200);
  });
  app.openapi(entries.get, async (c) => {
    const { id } = c.req.valid("param");
    return c.json(await run(c, { entryId: id }, (s) => {
      const row = s.data.entries.find((e) => e.id === id);
      if (!row || !findCompetition(s, row.competitionId, true)) throw problems.notFound("entry");
      return toEntry(row);
    }), 200);
  });
  app.openapi(entries.create, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json");
    return c.json(await run(c, { competitionId: id, memberIds: body.member_ids, ...definedOnly({ previousEntryId: body.previous_entry_id }) }, (s) => {
      const competition = openCompetition(s, id);
      divisionIn(s, id, body.division_id);
      const entered = s.data.entries.filter((e) => e.competitionId === id).flatMap((e) => e.members.map((m) => m.id)).filter((id) => body.member_ids.includes(id));
      const warnings = checkLineup(competition, body.member_ids, s.data.members, entered, s.auth.scopes.has("members:pii"));
      previousEntry(s, body.previous_entry_id, id);
      const members = body.member_ids.map((id, i) => ({ id, displayName: s.data.members.find((m) => m.id === id)!.displayName!, role: i === 0 ? "player" : "partner" }));
      const row: EntryRecord = { ...record(s), competitionId: id, divisionId: body.division_id, displayName: body.display_name ?? null,
        label: body.display_name ?? members.map((m) => m.displayName).join(" / "), members, seed: body.seed ?? null, state: "active",
        placementReason: body.placement_reason ?? null, previousEntryId: body.previous_entry_id ?? null, withdrawnAt: null, optedOutAt: null };
      s.writes.push({ type: "entry", record: row, create: true });
      audit(s, "entry.created", "entry", row.id, { competition_id: id, division_id: row.divisionId, member_ids: body.member_ids, placement_reason: row.placementReason });
      return { ...toEntry(row), warnings };
    }), 201);
  });
  app.openapi(entries.patch, async (c) => {
    const { id } = c.req.valid("param"); const body = c.req.valid("json");
    return c.json(await run(c, { entryId: id, ...definedOnly({ previousEntryId: body.previous_entry_id }) }, (s) => {
      const before = s.data.entries.find((e) => e.id === id);
      if (!before) throw problems.notFound("entry");
      openCompetition(s, before.competitionId);
      const changed = sentFields(body);
      if (!changed.length) return toEntry(before);
      const moving = body.division_id !== undefined && body.division_id !== before.divisionId;
      let removedFixtures: string[] = [];
      if (moving) { divisionIn(s, before.competitionId, body.division_id!); removedFixtures = removeFixtures(s); }
      previousEntry(s, body.previous_entry_id, before.competitionId);
      const overridden = overriddenPlacement(before, moving, body.placement_reason);
      const after = { ...before, ...definedOnly({ divisionId: body.division_id, displayName: body.display_name, seed: body.seed,
        state: body.state, placementReason: overridden ? "manual" : body.placement_reason, previousEntryId: body.previous_entry_id }), updatedAt: s.now };
      if (body.state !== undefined) after.withdrawnAt = body.state === "withdrawn" ? before.withdrawnAt ?? s.now : null;
      after.label = after.displayName ?? after.members.map((m) => m.displayName).join(" / ");
      s.writes.push({ type: "entry", record: after, create: false });
      audit(s, "entry.updated", "entry", id, { changed, ...stateEvent(before, after),
        ...(moving ? { division: { from: before.divisionId, to: after.divisionId }, removed_fixtures: removedFixtures } : {}),
        ...(overridden ? { placement_reason: "manual" } : {}) });
      return toEntry(after);
    }), 200);
  });
  app.openapi(entries.remove, async (c) => {
    const { id } = c.req.valid("param");
    await run(c, { entryId: id }, (s) => {
      const row = s.data.entries.find((e) => e.id === id);
      if (!row) throw problems.notFound("entry");
      openCompetition(s, row.competitionId);
      const removedFixtures = removeFixtures(s);
      if (s.data.referencedEntries.length) throw problems.conflict("entry_referenced", "A later entry names this one as its previous entry");
      s.writes.push({ type: "deleteEntry", id });
      audit(s, "entry.deleted", "entry", id, { competition_id: row.competitionId, division_id: row.divisionId,
        member_ids: row.members.map((m) => m.id), removed_fixtures: removedFixtures });
    });
    return c.body(null, 204);
  });
  for (const [route, optedOut] of [[entries.optOut, true], [entries.optIn, false]] as const) {
    app.openapi(route, async (c) => {
      const { id } = c.req.valid("param");
      return c.json(await run(c, { entryId: id }, (s) => {
        const row = s.data.entries.find((e) => e.id === id);
        if (!row || !findCompetition(s, row.competitionId, true)) throw problems.notFound("entry");
        const credential = s.auth.credential;
        if (credential.type === "session" && !row.members.some((m) => m.id === credential.memberId)) throw problems.notYourEntry();
        if ((row.optedOutAt !== null) === optedOut) return toEntry(row);
        const after = { ...row, optedOutAt: optedOut ? s.now : null, updatedAt: s.now };
        s.writes.push({ type: "entry", record: after, create: false });
        audit(s, optedOut ? "entry.opt_out.recorded" : "entry.opt_out.cleared", "entry", id, { competition_id: row.competitionId });
        return toEntry(after);
      }), 200);
    });
  }
}
