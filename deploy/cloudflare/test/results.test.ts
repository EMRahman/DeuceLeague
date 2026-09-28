import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { commitResult, CredentialExpiredError, ResultDeadlineError, StaleSnapshotError } from "@deuceleague/db-d1";
import { change } from "./helpers.ts";
import { completed, playing, prepareResult, score } from "./result-helpers.ts";

test("real D1 reports wait, agree, preserve dates/source and retry without duplicate claims/events", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  const first = await f.report(m, 0, { played_on: "2026-09-01" });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.deepEqual([first.body.status, first.body.waiting_on, first.body.result], ["reported", 1, null]);
  const retry = await f.report(m, 0);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.claims.length, 1);
  const second = await f.report(m, 1, { played_on: "2026-09-02", source: "telegram" });
  assert.equal(second.status, 201, JSON.stringify(second.body));
  assert.equal(second.body.status, "played");
  assert.deepEqual(second.body.claims.map((c: any) => c.state), ["confirmed", "confirmed"]);
  assert.equal(second.body.result.claim_id, second.body.claims[1].id);
  assert.equal(second.body.claims[1].source, "telegram");
  assert.equal(second.body.result.played_on, "2026-09-02");
  assert.equal(second.body.result.winning_side, 0);
  assert.equal((await f.report(m, 1)).status, 200);
  assert.equal((await f.report(m, 1, { score: score([6, 4], [6, 2]) })).body.code, "already_played");
  assert.equal((await f.events("match.claim.reported")).length, 2);
  assert.equal((await f.events("match.result.confirmed"))[0]!.payload.how, "agreed");
});

test("disputes preserve replaced claims, display differences and clear on a matching replacement", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  await f.report(m, 0);
  const disputed = await f.report(m, 1, { score: score([6, 4], [6, 2]) });
  assert.equal(disputed.body.status, "disputed");
  assert.deepEqual(disputed.body.differences, ["set 2: side 0 says 6-3, side 1 says 6-2"]);
  assert.deepEqual((await f.events("match.disputed"))[0]!.payload.differences, disputed.body.differences);
  const fixed = await f.report(m, 1);
  assert.equal(fixed.body.status, "played");
  assert.deepEqual(fixed.body.claims.map((c: any) => [c.side, c.state]), [[0, "confirmed"], [1, "superseded"], [1, "confirmed"]]);
  assert.equal((await f.events("match.claim.reported")).at(-1)!.payload.replaces, disputed.body.claims[1].id);
});

test("tiebreak points do not cause disputes, while a changed played date replaces a side's own claim", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  const a = { sets: [{ games: [7, 6], tiebreak: [7, 4] }, { games: [6, 3] }] };
  const b = { sets: [{ games: [7, 6], tiebreak: [9, 7] }, { games: [6, 3] }] };
  assert.equal((await f.report(m, 0, { score: a, played_on: "2026-09-01" })).status, 201);
  assert.equal((await f.report(m, 0, { score: b })).status, 200);
  const changed = await f.report(m, 0, { score: b, played_on: "2026-09-02" });
  assert.equal(changed.status, 201);
  assert.equal(changed.body.claims[0].state, "superseded");
  const agreed = await f.report(m, 1, { score: a });
  assert.equal(agreed.body.status, "played");
  assert.equal(agreed.body.result.played_on, "2026-09-02");
  assert.deepEqual(agreed.body.result.score, a);
});

test("acceptance names a live opponent claim, supersedes own report, and is idempotent", async (t) => {
  const f = await playing(t, 3);
  const [m, other] = f.matches;
  const first = await f.report(m!, 0);
  const old = first.body.claims[0].id;
  const replaced = await f.report(m!, 0, { score: score([6, 4], [6, 2]) });
  const live = replaced.body.claims[1].id;
  assert.equal((await f.send(`/v1/matches/${m}/claims/${old}/accept`, f.admin, "POST")).body.code, "claim_not_live");
  await f.report(m!, 1);
  const accepted = await f.send(`/v1/matches/${m}/claims/${live}/accept`, f.admin, "POST", { source: "web" });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  assert.deepEqual(accepted.body.claims.map((c: any) => c.state), ["superseded", "confirmed", "superseded", "confirmed"]);
  assert.equal(accepted.body.claims.at(-1).accepts_claim_id, live);
  assert.equal(accepted.body.result.claim_id, accepted.body.claims.at(-1).id);
  assert.equal((await f.send(`/v1/matches/${m}/claims/${live}/accept`, f.admin, "POST")).status, 200);
  assert.equal((await f.send(`/v1/matches/${other}/claims/${live}/accept`, f.admin, "POST")).status, 404);
  assert.equal((await f.events("match.result.confirmed"))[0]!.payload.how, "accepted");
});

test("coach settlement requires deliberate override, retains history/date and retries safely", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  await f.report(m, 0);
  await f.report(m, 1);
  const correction = { outcome: "completed", score: score([6, 4], [6, 2]), played_on: "2026-09-01" };
  const path = `/v1/matches/${m}/settle`;
  assert.equal((await f.send(path, f.admin, "POST", correction)).body.code, "already_agreed");
  const settled = await f.send(path, f.admin, "POST", { ...correction, override: true });
  assert.equal(settled.status, 201);
  const coach = settled.body.claims.at(-1);
  assert.deepEqual([coach.side, coach.source, coach.state], [null, "coach_entry", "confirmed"]);
  assert.deepEqual(settled.body.claims.slice(0, 2).map((c: any) => c.state), ["superseded", "superseded"]);
  const next = await f.send(path, f.admin, "POST", completed);
  assert.equal(next.status, 201);
  assert.equal(next.body.result.played_on, "2026-09-01");
  assert.equal((await f.events("match.result.confirmed")).at(-1)!.payload.replaces, coach.id);
  assert.equal((await f.send(path, f.admin, "POST", completed)).status, 200);
  assert.equal((await f.events("match.result.confirmed")).length, 3);
});

test("format validation rejects illegal results atomically and every outcome can enter the ledger", async (t) => {
  const f = await playing(t, 4);
  const m = f.matches[0]!;
  for (const bad of [
    { ...completed, score: score([7, 4], [6, 3]), side: 0 },
    { ...completed, score: score([6, 4]), side: 0 },
    { outcome: "completed", side: 0 }, { outcome: "walkover", side: 0 },
    { ...completed },
  ]) assert.equal((await f.send(`/v1/matches/${m}/claims`, f.admin, "POST", bad)).status, 400);
  assert.equal((await f.events()).length, 0);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM result_submission").first("n"), 0);
  const outcomes = [
    { outcome: "completed", score: score([6, 4], [3, 6], [10, 8]) },
    { outcome: "retired", score: score([2, 1]), retired_side: 0 },
    { outcome: "walkover", retired_side: 1 }, { outcome: "conceded", retired_side: 0 }, { outcome: "unplayed" },
  ];
  for (const [i, result] of outcomes.entries()) {
    const settled = await f.send(`/v1/matches/${f.matches[i]}/settle`, f.admin, "POST", result);
    assert.equal(settled.status, 201, JSON.stringify(settled.body));
    assert.equal(settled.body.result.outcome, result.outcome);
    assert.equal(settled.body.result.winning_side, [0, 1, 0, 1, null][i]);
  }
});

test("players report only their own singles/doubles side and never receive raw input or member PII", async (t) => {
  const f = await playing(t, 2, true);
  const m = f.matches[0]!;
  const a = await f.sessionForSide(m, 0, true);
  const b = await f.sessionForSide(m, 1);
  const outsider = await f.session(await f.member("Spectator"));
  assert.equal((await f.report(m, 1, {}, a)).body.code, "not_your_side");
  assert.equal((await f.send(`/v1/matches/${m}/claims`, outsider, "POST", completed)).body.code, "not_your_match");
  const first = await f.send(`/v1/matches/${m}/claims`, a, "POST", { ...completed, raw_input: "Private contact details" });
  assert.equal(first.status, 201);
  assert.equal(first.body.claims[0].side, 0);
  assert.equal(first.body.claims[0].source, "web");
  assert.equal(first.body.claims[0].raw_input, null);
  const claim = first.body.claims[0].id;
  assert.equal((await f.send(`/v1/matches/${m}/claims/${claim}/accept`, a, "POST")).body.code, "not_your_side");
  assert.equal((await f.send(`/v1/matches/${m}/claims/${claim}/accept`, outsider, "POST")).body.code, "not_your_match");
  const accepted = await f.send(`/v1/matches/${m}/claims/${claim}/accept`, b, "POST");
  assert.equal(accepted.status, 201);
  assert.ok(!JSON.stringify(accepted.body).includes("Private"));
  assert.match(accepted.body.sides[0].label, /^Player \d \/ Partner \d$/);
  assert.equal((await f.send(`/v1/matches/${m}`)).body.claims[0].raw_input, "Private contact details");
  assert.equal((await f.send(`/v1/matches/${m}/settle`, a, "POST", {})).body.code, "credential_not_accepted");
  assert.ok((await f.events()).every((event) => event.actor_type === "member"));
});

test("private/draft competitions are hidden from players; closed competitions refuse changes", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  const session = await f.sessionForSide(m, 0);
  const claim = (await f.report(m, 1)).body.claims[0].id;
  for (const [state, visibility] of [["active", "private"], ["draft", "members"]]) {
    await change(f.db, [f.db.prepare("UPDATE competition SET state = ?, visibility = ? WHERE id = ?").bind(state, visibility, f.ids.competition)]);
    for (const [path, method, body] of [
      [`/v1/matches/${m}`, "GET", undefined], [`/v1/matches/${m}/claims`, "POST", completed],
      [`/v1/matches/${m}/claims/${claim}/accept`, "POST", undefined],
    ] as const) assert.equal((await f.send(path, session, method, body)).status, 404);
    assert.equal((await f.send("/v1/matches", session)).body.data.length, 0);
    assert.equal((await f.send(`/v1/matches/${m}`)).status, 200);
  }
  await change(f.db, [f.db.prepare("UPDATE competition SET state = 'complete'")]);
  assert.equal((await f.report(m, 0)).body.code, "competition_not_active");
  assert.equal((await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", { outcome: "unplayed" })).body.code, "competition_not_active");
});

test("match pagination/filters cover a 12-player division without missing fixtures or duplicating sides", async (t) => {
  const f = await playing(t, 12);
  const seen: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await f.send(`/v1/matches?limit=7${cursor ? `&after=${cursor}` : ""}`);
    assert.equal(page.status, 200, JSON.stringify(page.body));
    seen.push(...page.body.data.map((m: any) => m.id));
    for (const m of page.body.data) assert.deepEqual(m.sides.map((s: any) => s.side), [0, 1]);
    cursor = page.body.next_cursor;
  } while (cursor);
  assert.equal(seen.length, 66);
  assert.equal(new Set(seen).size, 66);
  for (const filter of [`entry_id=${f.entries[0]}`, `member_id=${f.members[0]![0]}`]) {
    assert.equal((await f.send(`/v1/matches?${filter}`)).body.data.length, 11);
  }
  assert.equal((await f.send(`/v1/matches?competition_id=${f.ids.competition}&division_id=${f.ids.division}&limit=200`)).body.data.length, 66);
  await f.report(f.matches[0]!, 0);
  assert.deepEqual((await f.send("/v1/matches?status=reported")).body.data.map((m: any) => m.id), [f.matches[0]]);
  assert.equal((await f.send(`/v1/matches?competition_id=${randomUUID()}`)).body.data.length, 0);
  assert.equal((await f.send("/v1/matches?limit=201")).status, 400);
});

test("expired deadlines refuse reports/acceptances but allow coach settlement and reopening", async (t) => {
  const f = await playing(t, 3);
  const m = f.matches[0]!;
  const claim = (await f.report(m, 0)).body.claims[0].id;
  await change(f.db, [f.db.prepare("UPDATE season SET results_deadline_at = ?").bind(Date.now() - 1000)]);
  assert.equal((await f.report(m, 1)).body.code, "deadline_passed");
  assert.equal((await f.send(`/v1/matches/${m}/claims/${claim}/accept`, f.admin, "POST")).body.code, "deadline_passed");
  assert.equal((await f.send(`/v1/matches/${m}/settle`, f.admin, "POST", completed)).status, 201);
  await change(f.db, [f.db.prepare("UPDATE season SET results_deadline_at = NULL")]);
  assert.equal((await f.report(f.matches[1]!, 0)).status, 201);
});

for (const agree of [true, false]) {
  test(`simultaneous ${agree ? "matching" : "conflicting"} reports retain both claims and commit the right status`, async (t) => {
    const f = await playing(t);
    const m = f.matches[0]!;
    const responses = await Promise.all([f.report(m, 0), f.report(m, 1, agree ? {} : { score: score([6, 4], [6, 2]) })]);
    assert.deepEqual(responses.map((r) => r.status), [201, 201]);
    const current = (await f.send(`/v1/matches/${m}`)).body;
    assert.equal(current.status, agree ? "played" : "disputed");
    assert.equal(current.claims.length, 2);
    assert.equal((await f.events("match.result.confirmed")).length, agree ? 1 : 0);
    assert.equal((await f.events("match.claim.reported")).length, 2);
  });
}

test("two simultaneous acceptances confirm once and the retry returns 200", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  const claim = (await f.report(m, 0)).body.claims[0].id;
  const responses = await Promise.all([1, 2].map(() => f.send(`/v1/matches/${m}/claims/${claim}/accept`, f.admin, "POST")));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 201]);
  assert.equal((await f.events("match.claim.accepted")).length, 1);
  assert.equal((await f.events("match.result.confirmed")).length, 1);
});

for (const competitor of ["replacement", "settlement"] as const) {
  test(`acceptance racing a ${competitor} never accepts an unseen replacement or silently overrides agreement`, async (t) => {
    const f = await playing(t);
    const m = f.matches[0]!;
    const claim = (await f.report(m, 0)).body.claims[0].id;
    const changed = { outcome: "completed", score: score([6, 1], [6, 1]) };
    const responses = await Promise.all([
      f.send(`/v1/matches/${m}/claims/${claim}/accept`, f.admin, "POST"),
      competitor === "replacement" ? f.report(m, 0, changed) : f.send(`/v1/matches/${m}/settle`, f.admin, "POST", changed),
    ]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    assert.equal((await f.events("match.result.confirmed")).length, competitor === "settlement" || responses[0]!.status === 201 ? 1 : 0);
  });
}

test("simultaneous coach corrections return their own committed result and preserve the intervening history", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  const path = `/v1/matches/${m}/settle`;
  const identical = await Promise.all([1, 2].map(() => f.send(path, f.admin, "POST", completed)));
  assert.deepEqual(identical.map((r) => r.status).sort(), [200, 201]);
  const bodies = [score([6, 1], [6, 1]), score([6, 2], [6, 2])];
  const responses = await Promise.all(bodies.map((s) => f.send(path, f.admin, "POST", { outcome: "completed", score: s })));
  for (const [i, response] of responses.entries()) {
    assert.equal(response.status, 201);
    assert.deepEqual(response.body.result.score, bodies[i]);
  }
  assert.deepEqual(responses.map((r) => r.body.claims.length).sort(), [2, 3]);
  assert.equal((await f.events("match.result.confirmed")).length, 3);
});

test("a late audit failure rolls back claims, ledger, credential usage and revision", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  await f.report(m, 0);
  await change(f.db, [f.db.prepare("UPDATE api_key SET last_used_at = NULL")]);
  const revision = await f.db.prepare("SELECT revision FROM mutation_clock").first("revision");
  await f.db.prepare(`CREATE TRIGGER fail_result BEFORE INSERT ON event WHEN NEW.type = 'match.result.confirmed'
    BEGIN SELECT RAISE(ABORT, 'test_result_failure'); END`).run();
  assert.equal((await f.report(m, 1)).status, 500);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), revision);
  assert.equal(await f.db.prepare("SELECT last_used_at FROM api_key").first("last_used_at"), null);
  assert.equal(await f.db.prepare("SELECT status FROM match").first("status"), "reported");
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM result_submission").first("n"), 1);
  assert.equal((await f.events("match.result.confirmed")).length, 0);
  await f.db.prepare("DROP TRIGGER fail_result").run();
  assert.equal((await f.report(m, 1)).body.status, "played");
});

test("deadline crossing the commit boundary rolls back both reports and acceptances", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  const claim = (await f.report(m, 0)).body.claims[0].id;
  await change(f.db, [f.db.prepare("UPDATE season SET results_deadline_at = ?").bind(Date.now() + 400)]);
  const report = await prepareResult(f, m, f.admin, { type: "report", body: { side: 1, ...completed } });
  const accept = await prepareResult(f, m, f.admin, { type: "accept", claimId: claim, body: {} });
  await setTimeout(450);
  for (const { state, decision } of [report, accept]) await assert.rejects(commitResult(f.db, state, decision), ResultDeadlineError);
  assert.equal(await f.db.prepare("SELECT revision FROM mutation_clock").first("revision"), report.state.identity.snapshot.revision);
  assert.equal(await f.db.prepare("SELECT count(*) AS n FROM result_submission").first("n"), 1);
  assert.equal((await f.events("match.result.confirmed")).length, 0);
});

test("credential expiry crossing commit aborts even a coach settlement that ignores the results deadline", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  await change(f.db, [f.db.prepare("UPDATE api_key SET expires_at = ?").bind(Date.now() + 400)]);
  const prepared = await prepareResult(f, m, f.admin, { type: "settle", body: completed });
  await setTimeout(450);
  await assert.rejects(commitResult(f.db, prepared.state, prepared.decision), CredentialExpiredError);
  assert.equal(await f.db.prepare("SELECT status FROM match").first("status"), "open");
  assert.equal((await f.events()).length, 0);
});

test("changed scopes, membership, visibility and deadlines invalidate prepared writes and are checked again", async (t) => {
  const f = await playing(t);
  const m = f.matches[0]!;
  const session = await f.sessionForSide(m, 0);
  const cases = [
    { token: f.admin, write: f.db.prepare("UPDATE api_key SET scopes = '[\"league:read\"]'"), status: 403, code: "insufficient_scope" },
    { token: session, write: f.db.prepare("UPDATE competition SET visibility = 'private'"), status: 404, code: "not_found" },
  ];
  for (const c of cases) {
    const prepared = await prepareResult(f, m, c.token, { type: "report", body: { ...completed, side: 0 } });
    await change(f.db, [c.write]);
    await assert.rejects(commitResult(f.db, prepared.state, prepared.decision), StaleSnapshotError);
    const response = await f.report(m, 0, {}, c.token);
    assert.equal(response.status, c.status);
    assert.equal(response.body.code, c.code);
  }
  await change(f.db, [f.db.prepare("UPDATE competition SET visibility = 'members'")]);
  const beforeDeadline = await prepareResult(f, m, session, { type: "report", body: completed });
  await change(f.db, [f.db.prepare("UPDATE season SET results_deadline_at = ?").bind(Date.now() - 1000)]);
  await assert.rejects(commitResult(f.db, beforeDeadline.state, beforeDeadline.decision), StaleSnapshotError);
  assert.equal((await f.report(m, 0, {}, session)).body.code, "deadline_passed");
  await change(f.db, [f.db.prepare("UPDATE season SET results_deadline_at = NULL")]);
  const prepared = await prepareResult(f, m, session, { type: "report", body: completed });
  await change(f.db, [f.db.prepare("UPDATE member SET deleted_at = ?").bind(Date.now())]);
  await assert.rejects(commitResult(f.db, prepared.state, prepared.decision), StaleSnapshotError);
  assert.equal((await f.report(m, 0, {}, session)).status, 401);
  assert.equal((await f.events()).length, 0);
});

test("composite keys prevent drawing an entry from another competition or drawing it against itself", async (t) => {
  const f = await playing(t);
  const competition = randomUUID(), division = randomUUID(), entry = randomUUID();
  await change(f.db, [
    f.db.prepare(`INSERT INTO competition (id, club_id, season_id, name, discipline, match_format, rules)
      SELECT ?, club_id, season_id, 'Other league', discipline, match_format, rules FROM competition WHERE id = ?`)
      .bind(competition, f.ids.competition),
    f.db.prepare("INSERT INTO division (id, club_id, competition_id, ordinal, name) VALUES (?, ?, ?, 1, 'Other')")
      .bind(division, f.clubId, competition),
    f.db.prepare("INSERT INTO entry (id, club_id, competition_id, division_id) VALUES (?, ?, ?, ?)")
      .bind(entry, f.clubId, competition, division),
  ]);
  await assert.rejects(f.db.prepare("UPDATE match_side SET entry_id = ? WHERE match_id = ? AND side_index = 0")
    .bind(entry, f.matches[0]).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(f.db.prepare("UPDATE match SET division_id = ? WHERE id = ?").bind(division, f.matches[0]).run(), /FOREIGN KEY constraint failed/);
  const sameEntry = await f.db.prepare("SELECT entry_id FROM match_side WHERE match_id = ? AND side_index = 1").bind(f.matches[0]).first("entry_id");
  await assert.rejects(f.db.prepare("UPDATE match_side SET entry_id = ? WHERE match_id = ? AND side_index = 0")
    .bind(sameEntry, f.matches[0]).run(), /UNIQUE constraint failed/);
});

test("real schema rejects cross-match references, duplicate live claims and inconsistent ledger state", async (t) => {
  const f = await playing(t, 3);
  const [m, other] = f.matches;
  const claim = (await f.report(m!, 0)).body.claims[0].id;
  await assert.rejects(f.db.prepare(`INSERT INTO result_submission
    (id, club_id, match_id, side_index, outcome, score, source) VALUES (?, ?, ?, 0, 'completed', ?, 'api')`)
    .bind(randomUUID(), f.clubId, m, JSON.stringify(completed.score)).run(), /UNIQUE constraint failed/);
  await assert.rejects(f.db.prepare(`INSERT INTO result_submission
    (id, club_id, match_id, side_index, outcome, score, source, state, accepts_submission_id)
    VALUES (?, ?, ?, 1, 'completed', ?, 'api', 'confirmed', ?)`)
    .bind(randomUUID(), f.clubId, other, JSON.stringify(completed.score), claim).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(f.db.prepare(`UPDATE match SET status = 'played', outcome = 'completed', score = ?, winning_side = 0,
    accepted_submission_id = ? WHERE id = ?`).bind(JSON.stringify(completed.score), claim, other).run(), /FOREIGN KEY constraint failed/);
  await assert.rejects(f.db.prepare("UPDATE match SET status = 'played' WHERE id = ?").bind(other).run(), /CHECK constraint failed/);
  await assert.rejects(f.db.prepare("UPDATE match_side SET side_index = 2 WHERE match_id = ?").bind(other).run(), /CHECK constraint failed/);
});

test("credentials from another installation cannot read or change this club's results", async (t) => {
  const a = await playing(t);
  const b = await playing(t);
  const m = b.matches[0]!;
  assert.equal((await b.send(`/v1/matches/${m}`, a.admin)).status, 401);
  assert.equal((await b.report(m, 0, {}, a.admin)).status, 401);
  assert.equal((await a.send(`/v1/matches/${m}`)).status, 404);
  assert.equal((await a.report(m, 0)).status, 404);
  assert.equal((await b.send(`/v1/matches/${m}`)).body.status, "open");
});
