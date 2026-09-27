import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { commitLeague, readLeague, StaleSnapshotError } from "@deuceleague/db-d1";
import { fixture, change } from "./helpers.ts";
import { playing, hash } from "./result-helpers.ts";

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function send(f: Fixture, path: string, method = "GET", body?: unknown, token = f.admin) {
  const r = await f.call(path, token, method, body);
  return { status: r.status, body: r.status === 204 ? null : await r.json() as any };
}
async function create(f: Fixture, path: string, body: object) {
  const r = await send(f, path, "POST", body); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body;
}
async function setup(f: Fixture, discipline = "singles", category = "open") {
  const season = await create(f, "/v1/seasons", { name: randomUUID() });
  const competition = await create(f, "/v1/competitions", { season_id: season.id, name: "League", discipline, category, match_format: "best_of_3_champions_tiebreak" });
  const division = await create(f, `/v1/competitions/${competition.id}/divisions`, {});
  return { season, competition, division };
}
async function activate(f: Fixture, s: Awaited<ReturnType<typeof setup>>) {
  assert.equal((await send(f, `/v1/seasons/${s.season.id}`, "PATCH", { state: "active", starts_on: "2026-01-01", ends_on: "2026-12-31" })).status, 200);
  assert.equal((await send(f, `/v1/competitions/${s.competition.id}`, "PATCH", { state: "active" })).status, 200);
}
async function enter(f: Fixture, s: Awaited<ReturnType<typeof setup>>, memberIds?: string[], extra = {}) {
  return create(f, `/v1/competitions/${s.competition.id}/entries`, { division_id: s.division.id, member_ids: memberIds ?? [await f.member()], ...extra });
}
async function events(f: Fixture, type: string) {
  return (await f.db.prepare("SELECT payload FROM event WHERE type = ? ORDER BY id").bind(type).all()).results.map((r) => JSON.parse(String(r.payload)));
}

test("seasons preserve nullable edits, validate dates and enforce adjacent states and active competitions", async (t) => {
  const f = await fixture(t); const s = await setup(f); const path = `/v1/seasons/${s.season.id}`;
  assert.equal((await send(f, path, "PATCH", { state: "complete" })).body.code, "invalid_transition");
  assert.equal((await send(f, path, "PATCH", { state: "active" })).body.code, "dates_needed");
  assert.equal((await send(f, path, "PATCH", { starts_on: "2026-03-01", ends_on: "2026-02-01" })).status, 400);
  await activate(f, s);
  assert.equal((await send(f, path, "PATCH", { ends_on: null })).body.code, "dates_needed");
  assert.equal((await send(f, path, "PATCH", { state: "complete" })).body.code, "competition_active");
  assert.equal((await send(f, path, "PATCH", { state: "planning" })).body.code, "competition_active");
  const deadline = "2026-07-01T12:00:00+01:00";
  const changed = await send(f, path, "PATCH", { year: 2026, kind: "summer", results_deadline_at: deadline });
  assert.equal(changed.body.results_deadline_at, "2026-07-01T11:00:00.000Z");
  assert.equal(changed.body.starts_on, "2026-01-01");
  assert.equal((await send(f, path, "PATCH", { year: null })).body.kind, "summer");
  const n = (await events(f, "season.updated")).length;
  await send(f, path, "PATCH", {}); assert.equal((await events(f, "season.updated")).length, n);
  await send(f, `/v1/competitions/${s.competition.id}`, "PATCH", { state: "complete" });
  assert.equal((await send(f, path, "PATCH", { state: "complete" })).status, 200);
  assert.equal((await send(f, "/v1/competitions", "POST", { season_id: s.season.id, name: "Late", discipline: "singles", match_format: "best_of_3_champions_tiebreak" })).body.code, "season_closed");
});

test("competitions expand presets, validate previous links and protect closed structure and discipline", async (t) => {
  const f = await fixture(t); const s = await setup(f); const path = `/v1/competitions/${s.competition.id}`;
  assert.equal(typeof s.competition.match_format, "object"); assert.ok(s.competition.rules.points);
  assert.equal((await send(f, path, "PATCH", { state: "active" })).body.code, "season_not_active");
  assert.equal((await send(f, path, "PATCH", { previous_competition_id: s.competition.id })).status, 400);
  assert.equal((await send(f, path, "PATCH", { previous_competition_id: randomUUID() })).status, 400);
  const other = await setup(f);
  assert.equal((await send(f, path, "PATCH", { previous_competition_id: other.competition.id })).status, 200);
  assert.equal((await send(f, path, "PATCH", { previous_competition_id: null })).body.previous_competition_id, null);
  await enter(f, s); assert.equal((await send(f, path, "PATCH", { discipline: "doubles" })).body.code, "entries_exist");
  await activate(f, s); await send(f, path, "PATCH", { state: "complete" });
  assert.equal((await send(f, path, "PATCH", { name: "Changed", state: "active" })).body.code, "competition_closed");
  assert.equal((await send(f, path, "PATCH", { visibility: "private" })).status, 200);
  assert.equal((await send(f, `/v1/competitions/${s.competition.id}/divisions`, "POST", {})).body.code, "competition_closed");
  assert.equal((await send(f, `/v1/divisions/${s.division.id}/fixtures`, "POST")).body.code, "competition_closed");
  assert.equal((await send(f, path, "PATCH", { state: "active" })).status, 200);
});

test("concurrent season and competition names produce a single complete creation and a 409", async (t) => {
  const f = await fixture(t);
  const rs = await Promise.all([1, 2].map(() => send(f, "/v1/seasons", "POST", { name: "Summer" })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]); assert.equal(rs.find((r) => r.status === 409)!.body.code, "name_taken");
  assert.equal((await events(f, "season.created")).length, 1);
  const season = rs.find((r) => r.status === 201)!.body.id;
  const cs = await Promise.all([1, 2].map(() => send(f, "/v1/competitions", "POST", { season_id: season, name: "Singles", discipline: "singles", match_format: "best_of_3_champions_tiebreak" })));
  assert.deepEqual(cs.map((r) => r.status).sort(), [201, 409]); assert.equal((await events(f, "competition.created")).length, 1);
});

test("season and competition pagination filters correctly, including player visibility before pagination", async (t) => {
  const f = await fixture(t); const player = await f.session(await f.member()); const ids: string[] = [];
  for (let i = 0; i < 3; i++) { const s = await setup(f); await activate(f, s); ids.push(s.season.id);
    if (i === 0) await send(f, `/v1/competitions/${s.competition.id}`, "PATCH", { visibility: "private" }); }
  let after = ""; const seen: string[] = [];
  do { const r = await send(f, `/v1/seasons?limit=1&state=active${after ? `&after=${after}` : ""}`);
    seen.push(...r.body.data.map((s: any) => s.id)); after = r.body.next_cursor; } while (after);
  assert.deepEqual(seen.sort(), ids.sort());
  const first = await send(f, "/v1/competitions?limit=1&state=active", "GET", undefined, player);
  assert.equal(first.body.data.length, 1); assert.ok(first.body.next_cursor);
  const second = await send(f, `/v1/competitions?limit=1&state=active&after=${first.body.next_cursor}`, "GET", undefined, player);
  assert.equal(second.body.data.length, 1); assert.equal(second.body.next_cursor, null);
  const scoped = await send(f, `/v1/competitions?season_id=${ids[1]}`); assert.equal(scoped.body.data.length, 1);
});

test("players cannot discover draft/private league records or call structural writes", async (t) => {
  const f = await fixture(t); const s = await setup(f); const e = await enter(f, s); const player = await f.session(e.members[0].id);
  const paths = [`/v1/competitions/${s.competition.id}`, `/v1/competitions/${s.competition.id}/divisions`, `/v1/competitions/${s.competition.id}/entries`, `/v1/divisions/${s.division.id}`, `/v1/entries/${e.id}`];
  for (const path of paths) assert.equal((await send(f, path, "GET", undefined, player)).status, 404, path);
  assert.equal((await send(f, "/v1/seasons/not-an-id", "PATCH", {}, player)).body.code, "credential_not_accepted");
  await activate(f, s);
  for (const path of paths) assert.equal((await send(f, path, "GET", undefined, player)).status, 200, path);
  await send(f, `/v1/competitions/${s.competition.id}`, "PATCH", { visibility: "private" });
  for (const path of paths) assert.equal((await send(f, path, "GET", undefined, player)).status, 404, path);
});

test("divisions assign ordinals under contention, handle explicit collisions and delete only when empty", async (t) => {
  const f = await fixture(t); const s = await setup(f); const path = `/v1/competitions/${s.competition.id}/divisions`;
  const added = await Promise.all([1, 2].map(() => send(f, path, "POST", {})));
  assert.deepEqual(added.map((r) => r.body.ordinal).sort(), [2, 3]);
  assert.equal((await send(f, path, "POST", { ordinal: 1 })).body.code, "ordinal_taken");
  assert.equal((await send(f, `/v1/divisions/${added[0]!.body.id}`, "PATCH", { ordinal: 1 })).body.code, "ordinal_taken");
  const edited = await send(f, `/v1/divisions/${s.division.id}`, "PATCH", { name: "Top", target_size: 12 }); assert.equal(edited.body.target_size, 12);
  assert.equal((await send(f, `/v1/divisions/${s.division.id}`, "PATCH", { target_size: null })).body.name, "Top");
  await enter(f, s); assert.equal((await send(f, `/v1/divisions/${s.division.id}`, "DELETE")).body.code, "division_in_use");
  assert.equal((await send(f, `/v1/divisions/${added[0]!.body.id}`, "DELETE")).status, 204);
  const list = await send(f, path); assert.deepEqual(list.body.data.map((d: any) => d.ordinal), [1, added[1]!.body.ordinal]);
});

test("entry lineups enforce discipline, membership, removal and one entry per competition under contention", async (t) => {
  const f = await fixture(t); const s = await setup(f); const member = await f.member(); const path = `/v1/competitions/${s.competition.id}/entries`;
  assert.equal((await send(f, path, "POST", { division_id: s.division.id, member_ids: [member, await f.member()] })).status, 400);
  assert.equal((await send(f, path, "POST", { division_id: s.division.id, member_ids: [randomUUID()] })).status, 400);
  const removed = await f.member(); await send(f, `/v1/members/${removed}`, "DELETE");
  assert.equal((await send(f, path, "POST", { division_id: s.division.id, member_ids: [removed] })).status, 400);
  const rs = await Promise.all([1, 2].map(() => send(f, path, "POST", { division_id: s.division.id, member_ids: [member] })));
  assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]); assert.equal(rs.find((r) => r.status === 409)!.body.code, "already_entered");
  assert.equal((await events(f, "entry.created")).length, 1);
  const another = await setup(f); const div = another.division.id;
  assert.equal((await send(f, path, "POST", { division_id: div, member_ids: [await f.member()] })).status, 400);
});

test("mixed doubles warnings require PII permission and entry labels keep player/partner order", async (t) => {
  const f = await fixture(t); const s = await setup(f, "doubles", "mixed");
  const members = [];
  for (const name of ["Zoe", "Amy", "Zed", "Al"]) { const m = await create(f, "/v1/members", { display_name: name, gender: "female" }); members.push(m.id); }
  const full = await enter(f, s, members.slice(0, 2)); assert.equal(full.warnings[0].code, "mixed_pair");
  assert.equal(full.label, "Zoe / Amy"); assert.deepEqual(full.members.map((m: any) => m.role), ["player", "partner"]);
  const key = await create(f, "/v1/api-keys", { name: "League only", scopes: ["league:write", "league:read"] });
  const noPii = await send(f, `/v1/competitions/${s.competition.id}/entries`, "POST", { division_id: s.division.id, member_ids: members.slice(2) }, key.key);
  assert.equal(noPii.status, 201); assert.deepEqual(noPii.body.warnings, []);
  const snap = await readLeague(f.db, hash(key.key), "api_key", { competitionId: s.competition.id, memberIds: members });
  assert.ok(snap.data.members.every((m) => m.gender === null));
  assert.equal((await send(f, `/v1/entries/${full.id}`)).body.label, full.label);
});

test("moving an untouched entry removes only its fixtures and overrides suggested placement", async (t) => {
  const f = await playing(t, 3); const target = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {});
  const id = f.entries[0]!; await send(f, `/v1/entries/${id}`, "PATCH", { placement_reason: "promoted" });
  const moved = await send(f, `/v1/entries/${id}`, "PATCH", { division_id: target.id });
  assert.equal(moved.status, 200); assert.equal(moved.body.placement_reason, "manual");
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 1);
  const event = (await events(f, "entry.updated")).at(-1); assert.equal(event.removed_fixtures.length, 2);
  const back = await send(f, `/v1/entries/${id}`, "PATCH", { division_id: f.ids.division, placement_reason: "held" });
  assert.equal(back.body.placement_reason, "held");
  assert.equal((await send(f, `/v1/divisions/${f.ids.division}/fixtures`, "POST")).body.created.length, 2);
});

test("reports prevent moving or deleting entries; withdrawal preserves matches and its original timestamp", async (t) => {
  const f = await playing(t); const target = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {});
  await f.report(f.matches[0]!, 0); const path = `/v1/entries/${f.entries[0]}`;
  assert.equal((await send(f, path, "PATCH", { division_id: target.id })).body.code, "entry_has_matches");
  assert.equal((await send(f, path, "DELETE")).body.code, "entry_has_matches");
  const withdrawn = await send(f, path, "PATCH", { state: "withdrawn" }); assert.ok(withdrawn.body.withdrawn_at);
  assert.equal((await send(f, path, "PATCH", { state: "withdrawn" })).body.withdrawn_at, withdrawn.body.withdrawn_at);
  assert.equal((await send(f, `/v1/divisions/${f.ids.division}/fixtures`, "POST")).body.pairings, 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 1);
  assert.equal((await send(f, path, "PATCH", { state: "active" })).body.withdrawn_at, null);
});

test("deleting an entry removes its untouched fixtures and lineup but refuses previous-entry references", async (t) => {
  const f = await playing(t, 3); const s = await setup(f); const id = f.entries[0]!;
  const next = await enter(f, s, undefined, { previous_entry_id: id });
  assert.equal((await send(f, `/v1/entries/${id}`, "DELETE")).body.code, "entry_referenced");
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 3);
  assert.equal((await send(f, `/v1/entries/${next.id}`, "PATCH", { previous_entry_id: next.id })).status, 400);
  await send(f, `/v1/entries/${next.id}`, "PATCH", { previous_entry_id: null });
  assert.equal((await send(f, `/v1/entries/${id}`, "DELETE")).status, 204);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 1);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM entry_member WHERE entry_id = ?").bind(id).first("n"), 0);
});

test("fixtures are atomic and idempotent under simultaneous generation; late entries add only missing pairings", async (t) => {
  const f = await fixture(t); const s = await setup(f); for (let i = 0; i < 4; i++) await enter(f, s);
  const path = `/v1/divisions/${s.division.id}/fixtures`;
  const rs = await Promise.all([1, 2].map(() => send(f, path, "POST")));
  assert.deepEqual(rs.map((r) => r.status), [200, 200]); assert.deepEqual(rs.map((r) => r.body.created.length).sort(), [0, 6]);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match_side").first("n"), 12);
  assert.equal((await events(f, "division.fixtures_generated")).length, 1);
  await enter(f, s); const late = await send(f, path, "POST"); assert.equal(late.body.pairings, 10); assert.equal(late.body.created.length, 4);
});

test("late fixture audit failure rolls back all matches, sides, usage and revision", async (t) => {
  const f = await fixture(t); const s = await setup(f); for (let i = 0; i < 3; i++) await enter(f, s);
  await change(f.db, [f.db.prepare("UPDATE api_key SET last_used_at = NULL"),
    f.db.prepare("CREATE TRIGGER fail_fixtures BEFORE INSERT ON event WHEN NEW.type = 'division.fixtures_generated' BEGIN SELECT RAISE(ABORT, 'fixture audit failed'); END")]);
  const revision = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  assert.equal((await send(f, `/v1/divisions/${s.division.id}/fixtures`, "POST")).status, 500);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match_side").first("n"), 0);
  assert.equal(await f.db.prepare("SELECT last_used_at FROM api_key").first("last_used_at"), null);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), revision);
});

test("moving with an audit failure restores fixtures, sides, entry and its placement", async (t) => {
  const f = await playing(t); const target = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {});
  await change(f.db, [f.db.prepare("CREATE TRIGGER fail_move BEFORE INSERT ON event WHEN NEW.type = 'entry.updated' BEGIN SELECT RAISE(ABORT, 'move audit failed'); END")]);
  assert.equal((await send(f, `/v1/entries/${f.entries[0]}`, "PATCH", { division_id: target.id })).status, 500);
  assert.equal((await send(f, `/v1/entries/${f.entries[0]}`)).body.division_id, f.ids.division);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match_side").first("n"), 2);
});

test("a season completion racing competition activation cannot leave an active competition in a closed season", async (t) => {
  const f = await fixture(t); const s = await setup(f);
  await send(f, `/v1/seasons/${s.season.id}`, "PATCH", { state: "active", starts_on: "2026-01-01", ends_on: "2026-12-31" });
  const rs = await Promise.all([send(f, `/v1/seasons/${s.season.id}`, "PATCH", { state: "complete" }), send(f, `/v1/competitions/${s.competition.id}`, "PATCH", { state: "active" })]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
  const season = (await send(f, `/v1/seasons/${s.season.id}`)).body; const comp = (await send(f, `/v1/competitions/${s.competition.id}`)).body;
  assert.ok(comp.state !== "active" || season.state === "active");
});

test("a report racing entry movement keeps every started match with its original entry division", async (t) => {
  const f = await playing(t); const target = await create(f, `/v1/competitions/${f.ids.competition}/divisions`, {});
  const rs = await Promise.all([send(f, `/v1/entries/${f.entries[0]}`, "PATCH", { division_id: target.id }), f.report(f.matches[0]!, 0)]);
  const statuses = rs.map((r) => r.status); assert.ok(statuses[0] === 200 ? statuses[1] === 404 : statuses[0] === 409 && statuses[1] === 201, String(statuses));
  const mismatches = await f.db.prepare(`SELECT count(*) AS n FROM match m JOIN match_side ms ON ms.match_id = m.id JOIN entry e ON e.id = ms.entry_id WHERE m.division_id <> e.division_id`).first("n");
  assert.equal(mismatches, 0);
});

test("entry opt-outs are own-entry only, idempotent, reversible and leave current results untouched", async (t) => {
  const f = await playing(t, 2, true); const entry = f.entries[0]!; const path = `/v1/entries/${entry}/opt-out`;
  const partner = await f.session(f.members[0]![1]!); const other = await f.session(f.members[1]![0]!);
  assert.equal((await send(f, path, "POST", undefined, other)).body.code, "not_your_entry");
  const first = await send(f, path, "POST", undefined, partner); assert.equal(first.status, 200); assert.ok(first.body.opted_out_at);
  assert.equal((await send(f, path, "POST", undefined, partner)).body.opted_out_at, first.body.opted_out_at);
  assert.equal((await events(f, "entry.opt_out.recorded")).length, 1);
  assert.equal((await f.report(f.matches[0]!, 0)).status, 201);
  assert.equal((await send(f, path, "DELETE", undefined, partner)).body.opted_out_at, null);
  await send(f, `/v1/competitions/${f.ids.competition}`, "PATCH", { visibility: "private" });
  assert.equal((await send(f, path, "POST", undefined, partner)).status, 404);
});

test("stale prepared league writes cannot undo a closed competition or revoked credential", async (t) => {
  const f = await playing(t);
  const snapshot = await readLeague(f.db, hash(f.admin), "api_key", { competitionId: f.ids.competition });
  const row = snapshot.data.divisions[0]!;
  await send(f, `/v1/competitions/${f.ids.competition}`, "PATCH", { state: "complete" });
  await assert.rejects(commitLeague(f.db, snapshot, [{ type: "division", record: { ...row, name: "Stale" }, create: false }], []), StaleSnapshotError);
  assert.equal((await send(f, `/v1/divisions/${row.id}`)).body.name, row.name);
  const backup = await create(f, "/v1/api-keys", { name: "Backup", scopes: ["admin"] });
  const authorized = await readLeague(f.db, hash(f.admin), "api_key", { competitionId: f.ids.competition });
  const originalKey = authorized.identity.credential!.id;
  assert.equal((await send(f, `/v1/api-keys/${originalKey}/revoke`, "POST", undefined, backup.key)).status, 200);
  await assert.rejects(commitLeague(f.db, authorized, [{ type: "division", record: { ...row, name: "Revoked" }, create: false }], []), StaleSnapshotError);
  assert.equal((await send(f, `/v1/divisions/${row.id}`)).status, 401);
});

test("foreign installation credentials and record ids cannot reach league state", async (t) => {
  const f = await fixture(t); const other = await fixture(t); const s = await setup(f); const foreign = await setup(other);
  assert.equal((await send(f, `/v1/seasons/${s.season.id}`, "GET", undefined, other.admin)).status, 401);
  assert.equal((await send(f, `/v1/competitions/${foreign.competition.id}`)).status, 404);
  assert.equal((await send(f, `/v1/divisions/${foreign.division.id}/fixtures`, "POST")).status, 404);
  assert.equal((await send(f, "/v1/competitions", "POST", { season_id: foreign.season.id, name: "Bad", discipline: "singles", match_format: "best_of_3_champions_tiebreak" })).status, 400);
});

test("fixture generation racing a move leaves neither duplicate pairings nor matches in the wrong division", async (t) => {
  const f = await fixture(t); const s = await setup(f); const entries = [await enter(f, s), await enter(f, s), await enter(f, s)];
  const target = await create(f, `/v1/competitions/${s.competition.id}/divisions`, {});
  const results = await Promise.all([send(f, `/v1/divisions/${s.division.id}/fixtures`, "POST"),
    send(f, `/v1/entries/${entries[0].id}`, "PATCH", { division_id: target.id })]);
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 1);
  assert.equal(await f.db.prepare(`SELECT count(*) AS n FROM match m JOIN match_side ms ON ms.match_id = m.id
    JOIN entry e ON e.id = ms.entry_id WHERE e.division_id <> m.division_id`).first("n"), 0);
});

test("the club's 17 divisions generate 933 unique fixtures through production APIs and safely regenerate", async (t) => {
  const f = await fixture(t);
  const men: string[] = [], women: string[] = [];
  // Sixty of each allows 30 distinct doubles pairs as well as four 12-player singles divisions.
  for (let i = 0; i < 60; i++) { men.push(await f.member(`Man ${i}`)); women.push(await f.member(`Woman ${i}`)); }
  const season = await create(f, "/v1/seasons", { name: "Full club" });
  const cases = [
    { name: "Men's singles", discipline: "singles", category: "mens", divisions: 4, size: 12, members: men.slice(0, 48).map((m) => [m]) },
    { name: "Women's singles", discipline: "singles", category: "womens", divisions: 4, size: 12, members: women.slice(0, 48).map((m) => [m]) },
    { name: "Men's doubles", discipline: "doubles", category: "mens", divisions: 3, size: 10, members: Array.from({ length: 30 }, (_, i) => [men[i * 2]!, men[i * 2 + 1]!]) },
    { name: "Women's doubles", discipline: "doubles", category: "womens", divisions: 3, size: 10, members: Array.from({ length: 30 }, (_, i) => [women[i * 2]!, women[i * 2 + 1]!]) },
    { name: "Mixed doubles", discipline: "doubles", category: "mixed", divisions: 3, size: 10, members: Array.from({ length: 30 }, (_, i) => [men[i]!, women[i]!]) },
  ];
  let total = 0;
  const previous: { id: string; config: typeof cases[number] }[] = [];
  for (const config of cases) {
    const competition = await create(f, "/v1/competitions", { season_id: season.id, name: config.name,
      discipline: config.discipline, category: config.category, match_format: "best_of_3_champions_tiebreak" });
    previous.push({ id: competition.id, config });
    for (let d = 0; d < config.divisions; d++) {
      const division = await create(f, `/v1/competitions/${competition.id}/divisions`, { target_size: config.size });
      for (const members of config.members.slice(d * config.size, (d + 1) * config.size)) {
        await create(f, `/v1/competitions/${competition.id}/entries`, { division_id: division.id, member_ids: members });
      }
      const path = `/v1/divisions/${division.id}/fixtures`;
      const generated = await send(f, path, "POST");
      assert.equal(generated.status, 200, JSON.stringify(generated.body));
      assert.equal(generated.body.created.length, config.size * (config.size - 1) / 2);
      assert.equal((await send(f, path, "POST")).body.created.length, 0);
      total += generated.body.created.length;
    }
    const table = await send(f, `/v1/competitions/${competition.id}/standings`);
    assert.equal(table.status, 200, JSON.stringify(table.body));
    assert.equal(table.body.divisions.length, config.divisions);
    assert.ok(table.body.divisions.every((d: any) => d.rows.length === config.size));
    const progress = await send(f, `/v1/competitions/${competition.id}/progress`);
    assert.equal(progress.status, 200);
    assert.equal(progress.body.matches, config.divisions * config.size * (config.size - 1) / 2);
    assert.equal(progress.body.played, 0);
  }
  const chase = await send(f, "/v1/chase-list");
  assert.equal(chase.status, 200);
  assert.equal(chase.body.data.length, 276);
  assert.equal(chase.body.data.reduce((sum: number, r: any) => sum + r.outstanding_matches, 0), 2676);
  assert.equal(total, 933);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM division").first("n"), 17);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 933);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match_side").first("n"), 1866);
  assert.equal((await events(f, "division.fixtures_generated")).length, 17);
  let after = ""; const seen = new Set<string>();
  do {
    const page = await send(f, `/v1/matches?limit=200${after ? `&after=${after}` : ""}`);
    assert.equal(page.status, 200);
    for (const match of page.body.data) { assert.equal(seen.has(match.id), false); seen.add(match.id); }
    after = page.body.next_cursor;
  } while (after);
  assert.equal(seen.size, 933);
  let carried = 0;
  for (const { id, config } of previous) {
    const draft = await create(f, "/v1/competitions", { season_id: season.id, name: `${config.name} next`,
      discipline: config.discipline, match_format: "best_of_3_champions_tiebreak", previous_competition_id: id });
    const fill = await send(f, `/v1/competitions/${draft.id}/placements`, "POST");
    assert.equal(fill.status, 201, JSON.stringify(fill.body));
    assert.equal(fill.body.placed.length, config.divisions * config.size);
    assert.equal(fill.body.divisions_copied, true);
    assert.equal((await send(f, `/v1/competitions/${draft.id}`)).body.state, "draft");
    const entries = (await send(f, `/v1/competitions/${draft.id}/entries`)).body.data;
    assert.ok(entries.every((e: any) => e.members.length === (config.discipline === "singles" ? 1 : 2)));
    carried += fill.body.placed.length;
  }
  assert.equal(carried, 186);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM match").first("n"), 933, "draft filling creates no fixtures");
  const eventIds = new Set<string>(); let cursor = "0.0";
  for (;;) {
    const p = await send(f, `/v1/events?after=${cursor}&limit=100`);
    assert.equal(p.status, 200);
    if (!p.body.data.length) { assert.equal(p.body.next_cursor, cursor); break; }
    for (const e of p.body.data) { assert.equal(eventIds.has(e.id), false); eventIds.add(e.id); }
    cursor = p.body.next_cursor;
  }
  assert.equal(eventIds.size, await f.db.prepare("SELECT count(*) AS n FROM event").first("n"));
});

test("a discipline change racing entry creation cannot leave a singles lineup in doubles", async (t) => {
  const f = await fixture(t); const s = await setup(f); const member = await f.member();
  const results = await Promise.all([
    send(f, `/v1/competitions/${s.competition.id}`, "PATCH", { discipline: "doubles" }),
    send(f, `/v1/competitions/${s.competition.id}/entries`, "POST", { division_id: s.division.id, member_ids: [member] }),
  ]);
  const statuses = results.map((r) => r.status);
  assert.ok(statuses[0] === 200 ? statuses[1] === 400 : statuses[0] === 409 && statuses[1] === 201, String(statuses));
  const current = (await send(f, `/v1/competitions/${s.competition.id}`)).body;
  const entries = (await send(f, `/v1/competitions/${s.competition.id}/entries`)).body.data;
  assert.ok(entries.every((e: any) => e.members.length === (current.discipline === "doubles" ? 2 : 1)));
});
