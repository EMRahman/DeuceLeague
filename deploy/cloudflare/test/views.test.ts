import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { readChase, readLeagueViews } from "@deuceleague/db-d1";
import { daysRemaining, progressCounts } from "../../../packages/api/dist/league/progress.js";
import { tablesFromRecords } from "../../../packages/api/dist/league/tables.js";
import { playing, hash, completed } from "./result-helpers.ts";
import { fixture } from "./helpers.ts";
import { websiteFixture } from "./website-helpers.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function send(f: Fixture, path: string, method = "GET", body?: unknown, token = f.admin) {
  const r = await f.call(path, token, method, body);
  return { status: r.status, body: r.status === 204 ? null : await r.json() as any };
}
async function create(f: Fixture, path: string, body: object) {
  const r = await send(f, path, "POST", body); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
async function key(f: Fixture, scopes: string[]) { return (await create(f, "/v1/api-keys", { name: "Reader", scopes })).key as string; }
async function beat(f: Awaited<ReturnType<typeof playing>>, winner: number, loser: number, override = false) {
  const matches = (await f.send(`/v1/matches?competition_id=${f.ids.competition}`)).body.data;
  const m = matches.find((m: any) => m.sides.some((s: any) => s.entry_id === f.entries[winner]) && m.sides.some((s: any) => s.entry_id === f.entries[loser]));
  const games = m.sides[0].entry_id === f.entries[winner] ? [6, 1] : [1, 6];
  const r = await send(f, `/v1/matches/${m.id}/settle`, "POST", { outcome: "completed", score: { sets: [{ games }, { games }] }, override });
  assert.equal(r.status, 201, JSON.stringify(r.body)); return m.id as string;
}

test("D1 standings show point breakdowns and recompute after correction", async (t) => {
  const f = await playing(t, 4);
  for (const [i, name] of ["Ann", "Bea", "Cal", "Dee"].entries()) await send(f, `/v1/members/${f.members[i]![0]}`, "PATCH", { display_name: name });
  for (const [winner, loser] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3]]) await beat(f, winner!, loser!);
  const path = `/v1/competitions/${f.ids.competition}/standings`;
  const table = await send(f, path); assert.equal(table.status, 200, JSON.stringify(table.body));
  const rows = table.body.divisions[0].rows;
  assert.deepEqual(rows.map((r: any) => [r.position, r.label, r.points]), [[1, "Ann", 22], [2, "Bea", 16], [3, "Cal", 2], [4, "Dee", 2]]);
  assert.equal(rows[3].separated_by, "name"); assert.equal(rows[0].all_played_bonus, 1);
  for (const row of rows) assert.equal(row.matches.reduce((sum: number, m: any) => sum + m.points, row.all_played_bonus), row.points);
  await beat(f, 1, 0, true);
  assert.equal((await send(f, path)).body.divisions[0].rows[0].label, "Bea");
  assert.equal(JSON.stringify(table.body).includes("Private"), false);
  await send(f, `/v1/seasons/${f.ids.season}`, "PATCH", { results_deadline_at: new Date(Date.now() - 86_400_000).toISOString() });
  const final = (await send(f, path)).body; assert.equal(final.final, true);
  const cal = final.divisions[0].rows.find((r: any) => r.label === "Cal"); assert.deepEqual([cal.outstanding, cal.unplayed], [0, 1]);
  const progress = (await send(f, `/v1/competitions/${f.ids.competition}/progress`)).body;
  assert.equal(progress.outstanding, 1, "progress still reports the unresolved stored match");
});

test("movement includes surrounding divisions when filtering and honors next-season opt-outs", async (t) => {
  const f = await playing(t, 3);
  const competition = (await send(f, `/v1/competitions/${f.ids.competition}`)).body;
  await send(f, `/v1/competitions/${f.ids.competition}`, "PATCH", { rules: { ...competition.rules, movement: { promote: 1, relegate: 1, minMatchesForPromotion: 0 } } });
  const divs = [f.ids.division]; const middle: string[] = [];
  for (const group of ["B", "C"]) {
    const d = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {}); divs.push(d.id);
    for (let i = 1; i <= 3; i++) { const e = await create(f, `/v1/competitions/${f.ids.competition}/entries`, { division_id: d.id, member_ids: [await f.member(`${group}${i}`)] }); if (group === "B") middle.push(e.id); }
  }
  const path = `/v1/competitions/${f.ids.competition}/standings`;
  const all = (await send(f, path)).body;
  assert.deepEqual(all.divisions.map((d: any) => d.rows.map((r: any) => r.movement)), [[null, null, "relegated"], ["promoted", null, "relegated"], ["promoted", null, null]]);
  assert.deepEqual((await send(f, `${path}?division_id=${divs[1]}`)).body.divisions, [all.divisions[1]]);
  await send(f, `/v1/entries/${middle[0]}/opt-out`, "POST");
  const rows = (await send(f, `${path}?division_id=${divs[1]}`)).body.divisions[0].rows;
  assert.equal(rows[0].movement, null); assert.equal(rows[1].movement, "promoted");
  assert.deepEqual((await send(f, `${path}?division_id=${randomUUID()}`)).body.divisions, []);
});

test("withdrawal policies and changed scoring rules take effect without rewriting match results", async (t) => {
  const f = await playing(t, 3); const match = await beat(f, 0, 1);
  await send(f, `/v1/entries/${f.entries[1]}`, "PATCH", { state: "withdrawn" });
  const comp = (await send(f, `/v1/competitions/${f.ids.competition}`)).body;
  const path = `/v1/competitions/${f.ids.competition}/standings`;
  await send(f, `/v1/competitions/${f.ids.competition}`, "PATCH", { rules: { ...comp.rules, withdrawal: { playedMatches: "void", remainingMatches: "unplayed" } } });
  const table = (await send(f, path)).body; const winner = table.divisions[0].rows.find((r: any) => r.entry_id === f.entries[0]);
  assert.equal(winner.matches.some((m: any) => m.match_id === match), false);
  assert.equal(table.divisions[0].rows.at(-1).standing, "withdrawn");
  assert.equal((await send(f, `/v1/matches/${match}`)).body.status, "played");
  await send(f, `/v1/competitions/${f.ids.competition}`, "PATCH", { rules: { ...comp.rules, points: { ...comp.rules.points, win: 20 }, withdrawal: { playedMatches: "keep", remainingMatches: "walkover_to_opponent" } } });
  const changed = (await send(f, path)).body.divisions[0].rows.find((r: any) => r.entry_id === f.entries[0]);
  assert.ok(changed.points >= 20);
});

test("progress rolls up divisions, counts disputes once and computes entry totals and percentages", async (t) => {
  const f = await playing(t, 3); await beat(f, 0, 1);
  const remaining = (await f.send(`/v1/matches?competition_id=${f.ids.competition}&status=open`)).body.data;
  await f.report(remaining[0].id, 0);
  await f.report(remaining[1].id, 0); await f.report(remaining[1].id, 1, { score: { sets: [{ games: [1, 6] }, { games: [1, 6] }] } });
  const empty = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {});
  const p = await send(f, `/v1/competitions/${f.ids.competition}/progress`); assert.equal(p.status, 200, JSON.stringify(p.body));
  assert.deepEqual([p.body.matches, p.body.played, p.body.outstanding, p.body.reported, p.body.disputed, p.body.percent_played], [3, 1, 2, 1, 1, 33.3]);
  const blank = p.body.divisions.find((d: any) => d.division_id === empty.id); assert.equal(blank.matches, 0); assert.equal(blank.percent_played, null);
  const ep = (await send(f, `/v1/entries/${f.entries[0]}/progress`)).body;
  assert.deepEqual(ep, { entry_id: f.entries[0], matches: 2, played: 1, outstanding: 1 });
  await send(f, `/v1/entries/${f.entries[0]}`, "PATCH", { state: "withdrawn" });
  assert.equal((await send(f, `/v1/competitions/${f.ids.competition}/progress`)).body.active_entries, 2);
});

test("chase list distinguishes arranging, waiting and disputes for both doubles partners and omits removed members", async (t) => {
  const f = await playing(t, 2, true); const path = `/v1/chase-list?competition_id=${f.ids.competition}`;
  const open = await send(f, path); assert.equal(open.status, 200, JSON.stringify(open.body)); assert.equal(open.body.data.length, 4);
  assert.ok(open.body.data.every((r: any) => r.needs_playing === 1));
  const a = await f.sessionForSide(f.matches[0]!, 0); await f.send(`/v1/matches/${f.matches[0]}/claims`, a, "POST", completed);
  const reported = (await send(f, path)).body.data;
  assert.equal(reported.filter((r: any) => r.awaiting_you === 1).length, 2); assert.equal(reported.filter((r: any) => r.awaiting_them === 1).length, 2);
  await f.report(f.matches[0]!, 1, { score: { sets: [{ games: [1, 6] }, { games: [1, 6] }] } });
  const disputed = (await send(f, path)).body.data;
  assert.ok(disputed.every((r: any) => r.awaiting_you === 1 && r.awaiting_them === 0 && r.outstanding_matches === 1));
  await send(f, `/v1/members/${f.members[0]![1]}`, "DELETE"); assert.equal((await send(f, path)).body.data.length, 3);
  await send(f, `/v1/matches/${f.matches[0]}/settle`, "POST", { outcome: "unplayed" }); assert.deepEqual((await send(f, path)).body.data, []);
});

test("chase emails require live PII permission in D1 and members:read at the route", async (t) => {
  const f = await playing(t); const publicKey = await key(f, ["members:read"]);
  const r = await send(f, "/v1/chase-list", "GET", undefined, publicKey); assert.equal(r.status, 200);
  assert.ok(r.body.data.every((r: any) => !("email" in r)));
  const snapshot = await readChase(f.db, hash(publicKey), "api_key"); assert.ok(snapshot.rows.every((r) => !("email" in r)));
  const privateRows = (await send(f, "/v1/chase-list")).body.data; assert.ok(privateRows.every((r: any) => r.email.endsWith("@test.invalid")));
  assert.equal((await send(f, "/v1/chase-list", "GET", undefined, await key(f, ["league:read"]))).status, 403);
  assert.equal((await send(f, "/v1/chase-list?within_days=bad", "GET", undefined, await f.session(f.members[0]![0]!))).body.code, "credential_not_accepted");
});

test("chase filters handle null, future and past deadlines; the club zone changes the calendar count", async (t) => {
  const f = await playing(t); const path = `/v1/seasons/${f.ids.season}`;
  await send(f, path, "PATCH", { results_deadline_at: null });
  assert.equal((await send(f, "/v1/chase-list")).body.data[0].days_remaining, null);
  assert.deepEqual((await send(f, "/v1/chase-list?within_days=366")).body.data, []);
  const deadline = new Date(Date.now() + 10 * 86_400_000).toISOString();
  await send(f, path, "PATCH", { results_deadline_at: deadline });
  assert.equal((await send(f, "/v1/chase-list?within_days=30")).body.data.length, 2);
  assert.deepEqual((await send(f, "/v1/chase-list?within_days=5")).body.data, []);
  await send(f, "/v1/club", "PATCH", { timezone: "Pacific/Kiritimati" });
  assert.equal((await send(f, `/v1/competitions/${f.ids.competition}/progress`)).body.days_remaining, daysRemaining(new Date(deadline), "Pacific/Kiritimati", new Date()));
  await send(f, path, "PATCH", { results_deadline_at: new Date(Date.now() - 86_400_000).toISOString() });
  assert.equal((await send(f, "/v1/chase-list?within_days=0")).body.data.length, 2);
  assert.deepEqual((await send(f, `/v1/chase-list?competition_id=${randomUUID()}`)).body.data, []);
});

test("calendar days follow local midnight through DST, leap day and date-line zones", () => {
  for (const [now, deadline, zone, expected] of [
    ["2026-03-28T23:30:00Z", "2026-03-29T23:30:00Z", "Europe/London", 2],
    ["2026-10-24T23:30:00Z", "2026-10-25T23:30:00Z", "Europe/London", 0],
    ["2028-02-28T23:59:00Z", "2028-03-01T00:01:00Z", "UTC", 2],
    ["2026-06-30T10:30:00Z", "2026-06-30T23:30:00Z", "Pacific/Kiritimati", 0],
    ["2026-06-30T10:30:00Z", "2026-06-30T23:30:00Z", "America/Los_Angeles", 0],
    ["2026-07-01T01:00:00Z", "2026-06-29T01:00:00Z", "Asia/Kathmandu", -2],
  ] as const) assert.equal(daysRemaining(new Date(deadline), zone, new Date(now)), expected, zone);
  assert.equal(daysRemaining(null, "Europe/London", new Date()), null);
});

test("players see all three public views but cannot discover private or draft competitions", async (t) => {
  const f = await playing(t); const player = await f.session(f.members[0]![0]!);
  const paths = [`/v1/competitions/${f.ids.competition}/standings`, `/v1/competitions/${f.ids.competition}/progress`, `/v1/entries/${f.entries[0]}/progress`];
  for (const path of paths) { const r = await send(f, path, "GET", undefined, player); assert.equal(r.status, 200); assert.equal(JSON.stringify(r.body).includes("test.invalid"), false); }
  for (const change of [{ visibility: "private" }, { visibility: "members", state: "draft" }]) {
    await send(f, `/v1/competitions/${f.ids.competition}`, "PATCH", change);
    for (const path of paths) assert.equal((await send(f, path, "GET", undefined, player)).status, 404);
    assert.equal((await send(f, "/v1/chase-list")).body.data.length, 2, "coach still sees private/draft outstanding matches");
  }
});

test("empty competitions preserve the no-division progress response", async (t) => {
  const f = await fixture(t);
  const season = await create(f, "/v1/seasons", { name: "Empty", results_deadline_at: new Date().toISOString() });
  const c = await create(f, "/v1/competitions", { name: "Empty", season_id: season.id, discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  assert.deepEqual((await send(f, `/v1/competitions/${c.id}/progress`)).body,
    { competition_id: c.id, results_deadline_at: null, days_remaining: null, active_entries: 0, matches: 0, played: 0, outstanding: 0, reported: 0, disputed: 0, percent_played: null,
      minimum_matches: 4, below_minimum: 0, divisions: [] });
  assert.deepEqual((await send(f, `/v1/competitions/${c.id}/standings`)).body, { competition_id: c.id, final: true, divisions: [] });
  const division = await create(f, `/v1/competitions/${c.id}/divisions`, {});
  const entry = await create(f, `/v1/competitions/${c.id}/entries`, { division_id: division.id, member_ids: [await f.member()] });
  assert.deepEqual((await send(f, `/v1/entries/${entry.id}/progress`)).body, { entry_id: entry.id, matches: 0, played: 0, outstanding: 0 });
});

test("view snapshots keep rules, deadlines, identity and ledger together while later corrections change subsequent reads", async (t) => {
  const f = await playing(t); const old = await readLeagueViews(f.db, hash(f.admin), "api_key", { competitionId: f.ids.competition });
  await beat(f, 0, 1);
  await send(f, `/v1/seasons/${f.ids.season}`, "PATCH", { results_deadline_at: new Date(Date.now() - 1000).toISOString() });
  const before = tablesFromRecords(old.data.competitions[0]!, old.data.divisions, old.data.entries, old.ledger, old.data.seasons[0]!.resultsDeadlineAt, new Date(old.identity.now));
  assert.equal(before.final, false); assert.equal(progressCounts(old.ledger).played, 0);
  const fresh = await readLeagueViews(f.db, hash(f.admin), "api_key", { competitionId: f.ids.competition });
  assert.equal(progressCounts(fresh.ledger).played, 1); assert.ok(fresh.identity.snapshot.revision > old.identity.snapshot.revision);
});

test("foreign credentials and identifiers cannot expose another installation's league views", async (t) => {
  const f = await playing(t); const other = await playing(t);
  for (const path of [`/v1/competitions/${other.ids.competition}/standings`, `/v1/competitions/${other.ids.competition}/progress`, `/v1/entries/${other.entries[0]}/progress`]) assert.equal((await send(f, path)).status, 404);
  assert.equal((await send(f, "/v1/chase-list", "GET", undefined, other.admin)).status, 401);
  assert.deepEqual((await send(f, `/v1/chase-list?competition_id=${other.ids.competition}`)).body.data, []);
});

test("a season's progress gives every competition's counts and opt-outs in one read", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const draft = await f.create("/v1/competitions", { season_id: season.id, name: "Next singles", discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const whole = await f.api(`/v1/seasons/${season.id}/progress`, f.admin);
  assert.equal(whole.status, 200, JSON.stringify(whole.body));
  // Oldest first: the sample's two share a millisecond, so only the new one's place is fixed.
  assert.deepEqual(whole.body.competitions.map((c: { name: string }) => c.name).sort(), ["Next singles", "Sample doubles", "Sample singles"]);
  assert.equal(whole.body.competitions[2].name, "Next singles");
  const named = (name: string) => whole.body.competitions.find((c: { name: string }) => c.name === name);
  for (const c of whole.body.competitions.slice(0, 2)) {
    const { name, discipline, state, opted_out, ...counts } = c;
    assert.deepEqual(counts, (await f.api(`/v1/competitions/${c.competition_id}/progress`, f.admin)).body, `${name}: the same as its own progress`);
  }
  assert.equal(named("Sample singles").opted_out.length, 2); assert.equal(named("Sample doubles").opted_out.length, 0);
  assert.equal(named("Next singles").state, "draft");
  const alex = (await f.api("/v1/members?limit=200", f.admin)).body.data.find((m: { display_name: string }) => m.display_name === "Sample Alex");
  const link = (await f.api(`/v1/members/${alex.id}/login-link`, f.admin, "POST")).body.token;
  const session = (await f.api("/v1/session", link, "POST")).body.token;
  const player = await f.api(`/v1/seasons/${season.id}/progress`, session);
  assert.equal(player.status, 200);
  assert.ok(!player.body.competitions.some((c: { competition_id: string }) => c.competition_id === draft.id), "a player sees no draft");
  assert.equal((await f.api("/v1/seasons/01a0537c-583c-7067-8cd3-ac5e00807376/progress", f.admin)).status, 404);
});

test("a match names its competition and division, listed or read alone", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const listed = (await f.api("/v1/matches?limit=200", f.admin)).body.data as { id: string; competition_name: string; division_name: string }[];
  assert.ok(listed.every((m) => /^Sample (singles|doubles)$/.test(m.competition_name) && /^Division \d$/.test(m.division_name)));
  const one = (await f.api(`/v1/matches/${listed[0]!.id}`, f.admin)).body;
  assert.equal(one.competition_name, listed[0]!.competition_name); assert.equal(one.division_name, listed[0]!.division_name);
});

test("progress and the chase list count who is short of the minimum, as the tables count played", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const season = (await f.api("/v1/seasons?state=active", f.admin)).body.data[0];
  const whole = (await f.api(`/v1/seasons/${season.id}/progress`, f.admin)).body;
  const chase = (await f.api("/v1/chase-list", f.admin)).body.data as
    { competition_id: string; division_id: string; display_name: string; matches_played: number; minimum_matches: number; matches_short: number }[];
  for (const c of whole.competitions) {
    assert.equal(c.minimum_matches, 4, "the default");
    const standings = (await f.api(`/v1/competitions/${c.competition_id}/standings`, f.admin)).body;
    // Every sample division is a round robin of five: four fixtures each, so the target is four.
    for (const d of standings.divisions) {
      const short = d.rows.filter((r: { played: number }) => r.played < 4);
      assert.equal(c.divisions.find((x: { division_id: string }) => x.division_id === d.division_id).below_minimum, short.length, d.name);
      for (const row of d.rows) {
        for (const r of chase.filter((x) => x.division_id === d.division_id && row.label.split(" / ").includes(x.display_name))) {
          assert.deepEqual([r.matches_played, r.minimum_matches, r.matches_short], [row.played, 4, Math.max(0, 4 - row.played)], r.display_name);
        }
      }
    }
    assert.equal(c.below_minimum, c.divisions.reduce((n: number, d: { below_minimum: number }) => n + d.below_minimum, 0));
  }
  assert.ok(whole.competitions.some((c: { below_minimum: number }) => c.below_minimum > 0), "the sample is mid-season");

  // A club's own minimum, and a rule saved before the minimum existed, which reads as the default.
  const singles = whole.competitions.find((c: { name: string }) => c.name === "Sample singles");
  const rules = (await f.api(`/v1/competitions/${singles.competition_id}`, f.admin)).body.rules;
  assert.equal((await f.api(`/v1/competitions/${singles.competition_id}`, f.admin, "PATCH", { rules: { ...rules, minMatchesToPlay: 1 } })).status, 200);
  const one = (await f.api(`/v1/competitions/${singles.competition_id}/progress`, f.admin)).body;
  assert.equal(one.minimum_matches, 1);
  const standings = (await f.api(`/v1/competitions/${singles.competition_id}/standings`, f.admin)).body;
  assert.equal(one.below_minimum, standings.divisions.flatMap((d: { rows: { played: number }[] }) => d.rows).filter((r: { played: number }) => r.played < 1).length);
  await f.db.prepare("UPDATE competition SET rules = json_remove(rules, '$.minMatchesToPlay') WHERE id = ?").bind(singles.competition_id).run();
  assert.equal((await f.api(`/v1/competitions/${singles.competition_id}/progress`, f.admin)).body.minimum_matches, 4);
  assert.equal((await f.api(`/v1/competitions/${singles.competition_id}`, f.admin)).body.rules.minMatchesToPlay, 4);
});

test("an entry with fewer fixtures than the minimum is expected to play them all", async (t) => {
  const f = await websiteFixture(t);
  const season = await f.create("/v1/seasons", { name: "Small", starts_on: "2026-01-01", ends_on: "2026-12-31",
    results_deadline_at: new Date(Date.now() + 30 * 86400_000).toISOString() });
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const comp = await f.create("/v1/competitions", { season_id: season.id, name: "Three", discipline: "singles", match_format: "best_of_3_champions_tiebreak" });
  const division = await f.create(`/v1/competitions/${comp.id}/divisions`, {});
  for (const name of ["A", "B", "C"]) {
    const member = await f.create("/v1/members", { display_name: name });
    await f.create(`/v1/competitions/${comp.id}/entries`, { division_id: division.id, member_ids: [member.id] });
  }
  assert.equal((await f.api(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/competitions/${comp.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const rows = (await f.api(`/v1/chase-list?competition_id=${comp.id}`, f.admin)).body.data;
  assert.deepEqual(rows.map((r: { minimum_matches: number; matches_short: number }) => [r.minimum_matches, r.matches_short]), [[2, 2], [2, 2], [2, 2]]);
  assert.equal((await f.api(`/v1/competitions/${comp.id}/progress`, f.admin)).body.below_minimum, 3);
});

test("the chase list counts toward the minimum as the tables do when a player withdraws", async (t) => {
  const f = await websiteFixture(t);
  const season = await f.create("/v1/seasons", { name: "Withdrawals", starts_on: "2026-01-01", ends_on: "2026-12-31",
    results_deadline_at: new Date(Date.now() + 30 * 86400_000).toISOString() });
  assert.equal((await f.api(`/v1/seasons/${season.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const defaults = (await f.create("/v1/competitions", { season_id: season.id, name: "Probe", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak" })).rules;
  // Results against a player who withdraws are void, and their remaining fixtures are walkovers to the opponents.
  const comp = await f.create("/v1/competitions", { season_id: season.id, name: "Four", discipline: "singles",
    match_format: "best_of_3_champions_tiebreak",
    rules: { ...defaults, withdrawal: { playedMatches: "void", remainingMatches: "walkover_to_opponent" } } });
  const division = await f.create(`/v1/competitions/${comp.id}/divisions`, {});
  const entries: Record<string, string> = {};
  for (const name of ["A", "B", "C", "D"]) {
    const member = await f.create("/v1/members", { display_name: name });
    entries[name] = (await f.create(`/v1/competitions/${comp.id}/entries`, { division_id: division.id, member_ids: [member.id] })).id;
  }
  assert.equal((await f.api(`/v1/divisions/${division.id}/fixtures`, f.admin, "POST")).status, 200);
  assert.equal((await f.api(`/v1/competitions/${comp.id}`, f.admin, "PATCH", { state: "active" })).status, 200);
  const matches = (await f.api(`/v1/matches?competition_id=${comp.id}`, f.admin)).body.data as { id: string; sides: { entry_id: string }[] }[];
  const between = (x: string, y: string) => matches.find((m) => [x, y].every((e) => m.sides.some((s) => s.entry_id === entries[e])))!;
  for (const [x, y] of [["A", "B"], ["A", "C"]]) {
    assert.equal((await f.api(`/v1/matches/${between(x, y).id}/settle`, f.admin, "POST",
      { outcome: "completed", score: { sets: [{ games: [6, 1] }, { games: [6, 1] }] } })).status, 201);
  }
  assert.equal((await f.api(`/v1/entries/${entries.B}`, f.admin, "PATCH", { state: "withdrawn" })).status, 200);

  const table = (await f.api(`/v1/competitions/${comp.id}/standings`, f.admin)).body.divisions[0].rows as
    { label: string; played: number; standing: string }[];
  const played = Object.fromEntries(table.map((r) => [r.label, r.played]));
  // A's win over B is void; C and D each get a walkover from B.
  assert.deepEqual([played.A, played.C, played.D], [1, 2, 1]);
  const chase = (await f.api(`/v1/chase-list?competition_id=${comp.id}`, f.admin)).body.data as
    { display_name: string; matches_played: number; minimum_matches: number; matches_short: number }[];
  assert.ok(chase.length > 0);
  for (const r of chase) {
    const target = r.display_name === "B" ? 0 : 3;
    assert.deepEqual([r.matches_played, r.minimum_matches, r.matches_short],
      [played[r.display_name], target, Math.max(0, target - played[r.display_name]!)], r.display_name);
  }
  const progress = (await f.api(`/v1/competitions/${comp.id}/progress`, f.admin)).body;
  assert.equal(progress.below_minimum, ["A", "C", "D"].filter((n) => played[n]! < 3).length);
});

test("each division says what its entries are expected to play: the minimum, or all their fixtures if fewer", async (t) => {
  const f = await websiteFixture(t, { sample: true });
  const singles = (await f.api("/v1/competitions", f.admin)).body.data.find((c: { name: string }) => c.name === "Sample singles");
  const targets = async () => {
    const p = (await f.api(`/v1/competitions/${singles.id}/progress`, f.admin)).body;
    return [p.minimum_matches, ...p.divisions.map((d: { minimum_matches: number }) => d.minimum_matches)];
  };
  assert.deepEqual(await targets(), [4, 4, 4, 4], "divisions of five: four fixtures each");
  for (const [minimum, expected] of [[5, [5, 4, 4, 4]], [2, [2, 2, 2, 2]], [0, [0, 0, 0, 0]]] as const) {
    const rules = (await f.api(`/v1/competitions/${singles.id}`, f.admin)).body.rules;
    assert.equal((await f.api(`/v1/competitions/${singles.id}`, f.admin, "PATCH", { rules: { ...rules, minMatchesToPlay: minimum } })).status, 200);
    assert.deepEqual(await targets(), expected, `minimum ${minimum}`);
  }
});
