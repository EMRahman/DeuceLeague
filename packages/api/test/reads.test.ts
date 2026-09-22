// Standings, progress, the chase list, placements, keeping everything behind a
// credential, and the demo seed. Run by `npm run db:verify`.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";
import { APP_URL, closeAll, enter, eventsOf, keyWith, league, member, newClub, send, type TestClub } from "./helpers.ts";

after(closeAll);

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** An active competition with one division per list of names, each entry named, and its fixtures. */
async function competitionOf(club: TestClub, divisions: string[][], extra: object = {}) {
  const { seasonId, competitionId, divisionIds } = await league(club, { discipline: "singles", ...extra }, divisions.length);
  await send("PATCH", `/v1/seasons/${seasonId}`, club.key, { results_deadline_at: inDays(365) });
  const entries: Record<string, string> = {};
  for (const [i, names] of divisions.entries()) {
    for (const name of names) {
      entries[name] = await enter(club, competitionId, divisionIds[i]!, [await member(club, { display_name: name })]);
    }
    await send("POST", `/v1/divisions/${divisionIds[i]}/fixtures`, club.key);
  }
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { state: "active" })).status, 200);
  const matches = (await send("GET", `/v1/matches?competition_id=${competitionId}&limit=200`, club.key)).body.data;
  return { seasonId, competitionId, divisionIds, entries, matches };
}

type MatchRow = { id: string; sides: { entry_id: string }[] };

/** Settles the match between two entries as a straight-sets win for the first. */
async function beats(club: TestClub, matches: MatchRow[], winner: string, loser: string) {
  const m = matches.find((x) => x.sides.some((s) => s.entry_id === winner) && x.sides.some((s) => s.entry_id === loser))!;
  const side = m.sides[0]!.entry_id === winner ? 0 : 1;
  const games = side === 0 ? [6, 1] : [1, 6];
  const res = await send("POST", `/v1/matches/${m.id}/settle`, club.key, {
    outcome: "completed",
    score: { sets: [{ games }, { games }] },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return m.id;
}

// ───────────────────────────────────────────────────────────── standings ──

test("standings are computed from the matches on every read, and outstanding matches count once the deadline passes", async () => {
  const c = await newClub("standings");
  const { seasonId, competitionId, entries: e, matches } = await competitionOf(c, [["Ann", "Bea", "Cal", "Dee"]]);
  await beats(c, matches, e.Ann!, e.Bea!);
  await beats(c, matches, e.Ann!, e.Cal!);
  await beats(c, matches, e.Ann!, e.Dee!);
  await beats(c, matches, e.Bea!, e.Cal!);
  await beats(c, matches, e.Bea!, e.Dee!);

  const table = await send("GET", `/v1/competitions/${competitionId}/standings`, c.key);
  assert.equal(table.status, 200);
  assert.equal(table.body.final, false);
  const rows = table.body.divisions[0].rows;
  assert.deepEqual(
    rows.map((r: { label: string; points: number; position: number }) => [r.position, r.label, r.points]),
    [[1, "Ann", 9], [2, "Bea", 7], [3, "Cal", 2], [4, "Dee", 2]],
  );
  assert.deepEqual([rows[2].outstanding, rows[3].outstanding], [1, 1], "Cal v Dee is still to play");
  assert.equal(rows[3].separated_by, "name", "level on everything else until they meet");

  await send("PATCH", `/v1/seasons/${seasonId}`, c.key, { results_deadline_at: inDays(-1) });
  const after = await send("GET", `/v1/competitions/${competitionId}/standings`, c.key);
  assert.equal(after.body.final, true);
  const cal = after.body.divisions[0].rows.find((r: { label: string }) => r.label === "Cal");
  assert.deepEqual([cal.outstanding, cal.unplayed], [0, 1], "past the deadline, an outstanding match is unplayed");
});

test("progress counts what is played, waiting and disputed, by competition, division and entry", async () => {
  const c = await newClub("progress");
  const { competitionId, entries: e, matches } = await competitionOf(c, [["Ann", "Bea", "Cal"]]);
  await beats(c, matches, e.Ann!, e.Bea!);
  const waiting = matches.find((m: MatchRow) => !m.sides.some((s) => s.entry_id === e.Bea))!;
  await send("POST", `/v1/matches/${waiting.id}/claims`, c.key, {
    side: 0,
    outcome: "completed",
    score: { sets: [{ games: [6, 2] }, { games: [6, 2] }] },
  });

  const p = await send("GET", `/v1/competitions/${competitionId}/progress`, c.key);
  assert.equal(p.status, 200);
  assert.deepEqual(
    [p.body.matches, p.body.played, p.body.reported, p.body.outstanding, p.body.percent_played],
    [3, 1, 1, 2, 33.3],
  );
  assert.equal(p.body.divisions.length, 1);
  assert.ok(p.body.days_remaining > 300);
  const ann = await send("GET", `/v1/entries/${e.Ann}/progress`, c.key);
  assert.deepEqual([ann.body.matches, ann.body.played, ann.body.outstanding], [2, 1, 1]);
});

test("the chase list says who to nudge and why, with email only for members:pii", async () => {
  const c = await newClub("chase");
  const ann = await member(c, { display_name: "Ann", email: "ann@example.org" });
  const bea = await member(c, { display_name: "Bea", email: "bea@example.org" });
  const { seasonId, competitionId, divisionIds } = await league(c);
  const a = await enter(c, competitionId, divisionIds[0]!, [ann]);
  await enter(c, competitionId, divisionIds[0]!, [bea]);
  await send("POST", `/v1/divisions/${divisionIds[0]}/fixtures`, c.key);
  await send("PATCH", `/v1/competitions/${competitionId}`, c.key, { state: "active" });
  await send("PATCH", `/v1/seasons/${seasonId}`, c.key, { results_deadline_at: inDays(10) });
  const [m] = (await send("GET", `/v1/matches?competition_id=${competitionId}`, c.key)).body.data;
  const annSide = m.sides[0].entry_id === a ? 0 : 1;
  await send("POST", `/v1/matches/${m.id}/claims`, c.key, {
    side: annSide,
    outcome: "completed",
    score: { sets: [{ games: [6, 3] }, { games: [6, 3] }] },
  });

  const reader = await keyWith(c, "members:read");
  const plain = await send("GET", `/v1/chase-list?competition_id=${competitionId}`, reader);
  assert.equal(plain.status, 200);
  const byName = Object.fromEntries(plain.body.data.map((r: { display_name: string }) => [r.display_name, r]));
  assert.deepEqual([byName.Ann.awaiting_them, byName.Ann.awaiting_you], [1, 0]);
  assert.deepEqual([byName.Bea.awaiting_you, byName.Bea.waiting_on], [1, ["Ann"]], "one click clears Bea's");
  assert.equal(JSON.stringify(plain.body).includes("@example.org"), false);
  assert.equal("email" in byName.Ann, false);

  const full = await send("GET", `/v1/chase-list?competition_id=${competitionId}`, c.key);
  assert.ok(full.body.data.some((r: { email: string }) => r.email === "bea@example.org"));
  assert.equal((await send("GET", `/v1/chase-list?within_days=30`, c.key)).body.data.length, 2);
  assert.equal((await send("GET", `/v1/chase-list?within_days=5`, c.key)).body.data.length, 0, "too early to chase");
  assert.equal((await send("GET", "/v1/chase-list", await keyWith(c, "league:read"))).status, 403);
});

// ───────────────────────────────────────────────────────────── placements ──

test("placements fill next season's draft from the final tables — three up, three down — for the coach to adjust", async () => {
  const c = await newClub("placements");
  const top = ["A1", "A2", "A3", "A4"];
  const bottom = ["B1", "B2", "B3", "B4", "B5"];
  const last = await competitionOf(c, [top, bottom]);
  const e = last.entries;
  assert.equal((await send("GET", `/v1/competitions/${last.competitionId}`, c.key)).body.rules.movement.promote, 3);
  await send("PATCH", `/v1/entries/${e.B5}`, c.key, { state: "withdrawn" });
  // Each division finishes in the order its names are listed.
  for (const names of [top, ["B1", "B2", "B3", "B4"]]) {
    for (const [i, winner] of names.entries()) {
      for (const loser of names.slice(i + 1)) await beats(c, last.matches, e[winner]!, e[loser]!);
    }
  }
  await send("PATCH", `/v1/competitions/${last.competitionId}`, c.key, { state: "complete" });

  const season = (await send("POST", "/v1/seasons", c.key, { name: "Next", starts_on: "2027-04-01", ends_on: "2027-06-30" })).body;
  const next = (
    await send("POST", "/v1/competitions", c.key, {
      season_id: season.id,
      name: "Men's Singles",
      discipline: "singles",
      match_format: "best_of_3_sets",
      previous_competition_id: last.competitionId,
    })
  ).body;

  const filled = await send("POST", `/v1/competitions/${next.id}/placements`, c.key);
  assert.equal(filled.status, 201, JSON.stringify(filled.body));
  assert.equal(filled.body.divisions_copied, true);
  assert.equal(filled.body.final, true);
  const divisions = (await send("GET", `/v1/competitions/${next.id}/divisions`, c.key)).body.data;
  const where = Object.fromEntries(
    filled.body.placed.map((p: { label: string; division_id: string; reason: string }) => [
      p.label,
      [divisions.find((d: { id: string }) => d.id === p.division_id).ordinal, p.reason],
    ]),
  );
  assert.deepEqual(where, {
    A1: [1, "held"],
    A2: [2, "relegated"],
    A3: [2, "relegated"],
    A4: [2, "relegated"],
    B1: [1, "promoted"],
    B2: [1, "promoted"],
    B3: [1, "promoted"],
    B4: [2, "held"],
  });
  assert.deepEqual(filled.body.not_carried.map((n: { label: string }) => n.label), ["B5"], "withdrawn last time");
  assert.match(filled.body.placed.find((p: { label: string }) => p.label === "B1").explanation, /promoted/);

  const entries = (await send("GET", `/v1/competitions/${next.id}/entries`, c.key)).body.data;
  const b1 = entries.find((x: { label: string }) => x.label === "B1");
  assert.deepEqual([b1.placement_reason, b1.previous_entry_id], ["promoted", e.B1]);
  assert.equal((await send("POST", `/v1/competitions/${next.id}/placements`, c.key)).body.code, "entries_exist");

  // The coach disagrees about B3, and keeps B3 down: the record says so.
  const moved = await send("PATCH", `/v1/entries/${entries.find((x: { label: string }) => x.label === "B3").id}`, c.key, {
    division_id: divisions[1].id,
  });
  assert.equal(moved.body.placement_reason, "manual");

  // Submitting is activating the draft, once its season is under way.
  await send("PATCH", `/v1/seasons/${season.id}`, c.key, { state: "active" });
  assert.equal((await send("PATCH", `/v1/competitions/${next.id}`, c.key, { state: "active" })).status, 200);
  assert.equal((await send("POST", `/v1/competitions/${next.id}/placements`, c.key)).body.code, "not_draft");
  const [event] = await eventsOf(c.id, "competition.placements_filled");
  assert.deepEqual([event?.payload.placed, event?.payload.not_carried], [8, 1]);
  const placedEvents = (await eventsOf(c.id, "entry.created")).filter((ev) => ev.payload.competition_id === next.id);
  assert.equal(placedEvents.length, 8, "each placed entry is in the feed like any other");
});

test("placements need a draft that names its previous competition", async () => {
  const c = await newClub("placements-refused");
  const { competitionId } = await league(c);
  const refused = await send("POST", `/v1/competitions/${competitionId}/placements`, c.key);
  assert.equal(refused.body.code, "no_previous_competition");
  assert.equal((await send("POST", `/v1/competitions/${competitionId}/placements`, await keyWith(c, "league:read"))).status, 403);
});

// ─────────────────────────────────────────────────────── no anonymous access ──

test("nothing about a competition can be read without a credential", async () => {
  const c = await newClub("anonymous");
  const { competitionId } = await competitionOf(c, [["Ann", "Bea"]]);
  for (const path of [
    "/v1/competitions",
    `/v1/competitions/${competitionId}`,
    `/v1/competitions/${competitionId}/standings`,
    `/v1/matches?competition_id=${competitionId}`,
    `/v1/public/${c.slug}/competitions`,
  ]) {
    const res = await send("GET", path);
    assert.equal(res.status, 401, `${path} answered ${res.status}`);
    assert.equal(res.body.code, "missing_credential");
  }
});

// ────────────────────────────────────────────────────────────── the demo ──

test("demo:seed builds the demo through the API, with read keys that stay the same", () => {
  const cli = fileURLToPath(new URL("../dist/cli/demo-seed.js", import.meta.url));
  const run = () =>
    spawnSync(process.execPath, [cli], {
      env: { ...process.env, DATABASE_URL: APP_URL, DEMO_KEY_SEED: "test-seed" },
      encoding: "utf8",
    });

  const seeded = run();
  assert.equal(seeded.status, 0, seeded.stderr);
  const expected = "dl_" + createHmac("sha256", "test-seed").update("demo-deuce").digest("base64url");
  assert.ok(seeded.stdout.includes(expected), "the published key comes out the same every rebuild");

  return (async () => {
    const me = await send("GET", "/v1/me", expected);
    assert.deepEqual(me.body.credential.scopes, ["league:read"]);
    assert.equal((await send("POST", "/v1/seasons", expected, { name: "Vandalism" })).status, 403, "read-only");

    const list = await send("GET", "/v1/competitions", expected);
    assert.equal(list.body.data.length, 4, "spring and summer, singles and doubles");
    const summer = list.body.data.find((x: { state: string; name: string }) => x.state === "active" && x.name === "Men's Singles");
    const table = await send("GET", `/v1/competitions/${summer.id}/standings`, expected);
    assert.equal(table.body.divisions.length, 2);
    assert.equal(table.body.divisions[1].rows.length, 7, "six placed, and a newcomer");
    const matches = (await send("GET", `/v1/matches?competition_id=${summer.id}&limit=200`, expected)).body.data;
    const statuses = new Set(matches.map((x: { status: string }) => x.status));
    for (const s of ["open", "played"]) assert.ok(statuses.has(s), `some matches ${s}`);

    const again = run();
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/);
  })();
});

// ─────────────────────────────────────────────────────────────── the spec ──

test("the spec lists the read routes with the scopes they need", async () => {
  const spec = (await send("GET", "/openapi.json")).body;
  const security = (path: string) => spec.paths[path]?.get?.security ?? spec.paths[path]?.post?.security;
  assert.deepEqual(security("/v1/competitions/{id}/standings"), [{ apiKey: ["league:read"] }]);
  assert.deepEqual(security("/v1/chase-list"), [{ apiKey: ["members:read"] }]);
  assert.deepEqual(security("/v1/competitions/{id}/placements"), [{ apiKey: ["league:write"] }]);
  assert.equal(Object.keys(spec.paths).some((p) => p.startsWith("/v1/public")), false, "no routes without a credential");
  assert.match(spec.components.schemas.ChaseEntry.properties.email.description, /^PII/);
});
