// Results and the event feed through the API: claims, acceptance, disputes,
// the coach's settlement, and reading what happened. Run by `npm run db:verify`.

import { after, test } from "node:test";
import assert from "node:assert/strict";
import { closeAll, enter, eventsOf, keyWith, league, member, newClub, owner, send, type TestClub } from "./helpers.ts";

after(closeAll);

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** An active singles competition with `n` entries and their round robin, ready for results. */
async function playing(club: TestClub, n = 2) {
  const { seasonId, competitionId, divisionIds } = await league(club);
  const division = divisionIds[0]!;
  const entries: string[] = [];
  for (let i = 0; i < n; i++) entries.push(await enter(club, competitionId, division, [await member(club)]));
  assert.equal((await send("POST", `/v1/divisions/${division}/fixtures`, club.key)).status, 200);
  assert.equal((await send("PATCH", `/v1/competitions/${competitionId}`, club.key, { state: "active" })).status, 200);
  const listed = await send("GET", `/v1/matches?division_id=${division}`, club.key);
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  return {
    seasonId,
    competitionId,
    division,
    entries,
    matches: listed.body.data.map((m: { id: string }) => m.id) as string[],
  };
}

const score = (...sets: [number, number][]) => ({ sets: sets.map((games) => ({ games })) });

function report(club: TestClub, matchId: string, side: 0 | 1, sets: [number, number][], extra: object = {}) {
  return send("POST", `/v1/matches/${matchId}/claims`, club.key, {
    side,
    outcome: "completed",
    score: score(...sets),
    ...extra,
  });
}

// ──────────────────────────────────────────────── agreement enters the ledger ──

test("a score enters the ledger when both sides report the same, and waits for as long as it takes until then", async () => {
  const c = await newClub("agree");
  const { matches } = await playing(c);
  const m = matches[0]!;

  const first = await report(c, m, 0, [[6, 4], [6, 3]], { played_on: "2026-05-01" });
  assert.equal(first.status, 201);
  assert.equal(first.body.status, "reported");
  assert.equal(first.body.waiting_on, 1);
  assert.equal(first.body.result, null);

  const second = await report(c, m, 1, [[6, 4], [6, 3]], { played_on: "2026-05-02", source: "telegram" });
  assert.equal(second.status, 201);
  assert.equal(second.body.status, "played");
  const [a, b] = second.body.claims;
  assert.deepEqual([a.state, b.state], ["confirmed", "confirmed"]);
  assert.equal(b.source, "telegram");
  assert.equal(second.body.result.claim_id, b.id, "the second matching report settled it");
  assert.equal(second.body.result.winning_side, 0);
  assert.deepEqual(second.body.result.score, score([6, 4], [6, 3]));
  assert.equal(second.body.result.played_on, "2026-05-02", "the date is never compared, only recorded");

  const [confirmed] = await eventsOf(c.id, "match.result.confirmed");
  assert.equal(confirmed?.payload.how, "agreed");
  assert.deepEqual(confirmed?.payload.score, score([6, 4], [6, 3]));
  assert.equal((await eventsOf(c.id, "match.claim.reported")).length, 2);

  const [progress] = await owner`select played from division_progress where division_id = ${second.body.division_id}`;
  assert.equal(Number(progress?.played), 1, "progress follows the ledger");
});

test("sending the same claim twice changes nothing, so a retry is safe", async () => {
  const c = await newClub("retry");
  const { matches } = await playing(c);
  const m = matches[0]!;

  assert.equal((await report(c, m, 0, [[6, 1], [6, 2]])).status, 201);
  const again = await report(c, m, 0, [[6, 1], [6, 2]]);
  assert.equal(again.status, 200);
  assert.equal(again.body.claims.length, 1);

  await report(c, m, 1, [[6, 1], [6, 2]]);
  const late = await report(c, m, 1, [[6, 1], [6, 2]]);
  assert.equal(late.status, 200, "even after it is played");
  assert.equal((await eventsOf(c.id, "match.claim.reported")).length, 2);

  const changed = await report(c, m, 1, [[6, 1], [6, 3]]);
  assert.equal(changed.status, 409);
  assert.equal(changed.body.code, "already_played");
});

// ──────────────────────────────────────────────────────────── disputes ──

test("different claims are a dispute that says what differs, cleared when a side re-enters", async () => {
  const c = await newClub("dispute");
  const { matches } = await playing(c);
  const m = matches[0]!;

  await report(c, m, 0, [[6, 4], [6, 4]]);
  const disputed = await report(c, m, 1, [[6, 4], [6, 3]]);
  assert.equal(disputed.body.status, "disputed");
  assert.deepEqual(disputed.body.differences, ["set 2: side 0 says 6-4, side 1 says 6-3"]);
  const [event] = await eventsOf(c.id, "match.disputed");
  assert.deepEqual(event?.payload.differences, disputed.body.differences);

  const fixed = await report(c, m, 1, [[6, 4], [6, 4]]);
  assert.equal(fixed.body.status, "played");
  assert.deepEqual(
    fixed.body.claims.map((cl: { side: number; state: string }) => [cl.side, cl.state]),
    [[0, "confirmed"], [1, "superseded"], [1, "confirmed"]],
    "the replaced claim is kept",
  );
});

test("a side accepts the other's claim by naming it, so nobody accepts a score they did not see", async () => {
  const c = await newClub("accept");
  const { matches } = await playing(c, 3);
  const [m1, m2] = matches as [string, string];

  const first = await report(c, m1, 0, [[6, 0], [6, 0]]);
  const replaced = first.body.claims[0].id;
  const corrected = await report(c, m1, 0, [[6, 0], [6, 1]]);
  const live = corrected.body.claims[1].id;

  const stale = await send("POST", `/v1/matches/${m1}/claims/${replaced}/accept`, c.key);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, "claim_not_live");

  const accepted = await send("POST", `/v1/matches/${m1}/claims/${live}/accept`, c.key);
  assert.equal(accepted.status, 201);
  assert.equal(accepted.body.status, "played");
  const acceptance = accepted.body.claims.at(-1);
  assert.deepEqual([acceptance.side, acceptance.accepts_claim_id, acceptance.state], [1, live, "confirmed"]);
  assert.equal(accepted.body.result.claim_id, acceptance.id, "the acceptance settled it");
  assert.deepEqual(accepted.body.result.score, score([6, 0], [6, 1]));
  assert.equal((await send("POST", `/v1/matches/${m1}/claims/${live}/accept`, c.key)).status, 200, "idempotent");
  const [event] = await eventsOf(c.id, "match.result.confirmed");
  assert.equal(event?.payload.how, "accepted");

  // Accepting also ends a dispute: the accepting side's own claim is replaced.
  await report(c, m2, 0, [[7, 6], [6, 4]]);
  const theirs = (await report(c, m2, 1, [[6, 7], [4, 6]])).body.claims[1].id;
  const settled = await send("POST", `/v1/matches/${m2}/claims/${theirs}/accept`, c.key, { source: "web" });
  assert.equal(settled.status, 201);
  assert.equal(settled.body.result.winning_side, 1);
  assert.deepEqual(
    settled.body.claims.map((cl: { side: number; state: string }) => [cl.side, cl.state]),
    [[0, "superseded"], [1, "confirmed"], [0, "confirmed"]],
  );
  assert.equal(settled.body.claims[2].source, "web");

  assert.equal((await send("POST", `/v1/matches/${m2}/claims/${live}/accept`, c.key)).status, 404, "a claim on another match");
});

// ─────────────────────────────────────────────────────── checked at entry ──

test("a result the format rules out is refused when it is entered", async () => {
  const c = await newClub("format");
  const { matches } = await playing(c);
  const m = matches[0]!;

  const impossible = await report(c, m, 0, [[7, 4], [6, 3]]);
  assert.equal(impossible.status, 400);
  assert.match(impossible.body.detail, /set 1: 7-4 is not a legal set/);
  assert.equal((await report(c, m, 0, [[6, 4]])).status, 400, "one set is not a finished best of three");
  const noScore = await send("POST", `/v1/matches/${m}/claims`, c.key, { side: 0, outcome: "completed" });
  assert.equal(noScore.status, 400);
  const noSide = await send("POST", `/v1/matches/${m}/claims`, c.key, { side: 0, outcome: "walkover" });
  assert.match(noSide.body.detail, /which side did not play/);

  const tiebreak = await report(c, m, 0, [[6, 4], [3, 6], [10, 8]]);
  assert.equal(tiebreak.status, 201, "a champions tiebreak in place of the third set");
  const walkover = await send("POST", `/v1/matches/${m}/claims`, c.key, { side: 1, outcome: "walkover", retired_side: 0 });
  assert.equal(walkover.body.status, "disputed");
  assert.deepEqual(walkover.body.differences, ["how it ended: side 0 says completed, side 1 says walkover"]);
});

// ──────────────────────────────────────────────────────────── the coach ──

test("the coach settles any match, replacing every earlier claim and deleting none", async () => {
  const c = await newClub("settle");
  const { matches } = await playing(c, 3);
  const [disputedMatch, unreported] = matches as [string, string];
  const reporter = await keyWith(c, "results:write");

  await report(c, disputedMatch, 0, [[6, 3], [6, 3]]);
  await send("POST", `/v1/matches/${disputedMatch}/claims`, c.key, { side: 1, outcome: "walkover", retired_side: 0 });
  const refused = await send("POST", `/v1/matches/${disputedMatch}/settle`, reporter, { outcome: "completed", score: score([6, 3], [6, 3]) });
  assert.equal(refused.status, 403, "settling needs league:write");

  const settled = await send("POST", `/v1/matches/${disputedMatch}/settle`, c.key, {
    outcome: "completed",
    score: score([6, 3], [6, 3]),
    played_on: "2026-05-10",
  });
  assert.equal(settled.status, 201);
  assert.equal(settled.body.status, "played");
  const coach = settled.body.claims.at(-1);
  assert.deepEqual([coach.side, coach.source, coach.state], [null, "coach_entry", "confirmed"]);
  assert.deepEqual(
    settled.body.claims.slice(0, 2).map((cl: { state: string }) => cl.state),
    ["superseded", "superseded"],
  );

  const correction = await send("POST", `/v1/matches/${disputedMatch}/settle`, c.key, {
    outcome: "completed",
    score: score([6, 3], [6, 4]),
  });
  assert.equal(correction.status, 201);
  assert.equal(correction.body.result.played_on, "2026-05-10", "a correction keeps the date unless given one");
  assert.equal(correction.body.claims.length, 4);
  const events = await eventsOf(c.id, "match.result.confirmed");
  assert.equal(events.at(-1)?.payload.replaces, coach.id, "a correction says what it replaced");
  const same = await send("POST", `/v1/matches/${disputedMatch}/settle`, c.key, { outcome: "completed", score: score([6, 3], [6, 4]) });
  assert.equal(same.status, 200);

  const unplayed = await send("POST", `/v1/matches/${unreported}/settle`, c.key, { outcome: "unplayed" });
  assert.equal(unplayed.body.result.outcome, "unplayed");
  assert.equal(unplayed.body.result.winning_side, null);
  assert.equal((await report(c, unreported, 0, [[6, 0], [6, 0]])).body.code, "already_played");
});

test("results are recorded only while the competition is active", async () => {
  const c = await newClub("inactive");
  const { competitionId, matches } = await playing(c);
  const m = matches[0]!;
  await send("PATCH", `/v1/competitions/${competitionId}`, c.key, { state: "complete" });
  const closed = await report(c, m, 0, [[6, 0], [6, 0]]);
  assert.equal(closed.status, 409);
  assert.equal(closed.body.code, "competition_not_active");
  assert.equal((await send("POST", `/v1/matches/${m}/settle`, c.key, { outcome: "unplayed" })).status, 409);
});

test("both sides reporting at the same moment still agree", async () => {
  const c = await newClub("race");
  const { matches } = await playing(c, 4);
  await Promise.all(
    matches.flatMap((m) => [report(c, m, 0, [[6, 2], [6, 2]]), report(c, m, 1, [[6, 2], [6, 2]])]),
  );
  for (const m of matches) {
    const res = await send("GET", `/v1/matches/${m}`, c.key);
    assert.equal(res.body.status, "played", `match ${m} was left ${res.body.status}`);
  }
});

// ───────────────────────────────────────────────────────────── reading ──

test("matches can be listed by division, entry and status", async () => {
  const c = await newClub("listing");
  const { division, entries, matches } = await playing(c, 3);
  await report(c, matches[0]!, 0, [[6, 1], [6, 1]]);

  const all = await send("GET", `/v1/matches?division_id=${division}`, c.key);
  assert.equal(all.body.data.length, 3);
  assert.ok(all.body.data.every((m: { sides: { label: string | null }[] }) => m.sides.every((s) => s.label)));
  const reported = await send("GET", `/v1/matches?division_id=${division}&status=reported`, c.key);
  assert.deepEqual(reported.body.data.map((m: { id: string }) => m.id), [matches[0]]);
  const mine = await send("GET", `/v1/matches?entry_id=${entries[0]}`, c.key);
  assert.equal(mine.body.data.length, 2);
  const reader = await keyWith(c, "league:read");
  assert.equal((await report({ ...c, key: reader }, matches[1]!, 0, [[6, 1], [6, 1]])).status, 403);
});

/**
 * Reads the feed onward from `cursor` until it holds `expected` events. The
 * feed holds an event back while any older transaction is still open — here,
 * another test file's request — so it can lag a moment behind a commit.
 */
async function readFeedUntil(key: string, cursor: string | undefined, expected: number, limit = 3) {
  const seen: { cursor: string; type: string; subject_id: string | null }[] = [];
  const deadline = Date.now() + 5000;
  while (seen.length < expected && Date.now() < deadline) {
    const res = await send("GET", `/v1/events?limit=${limit}${cursor ? `&after=${cursor}` : ""}`, key);
    assert.equal(res.status, 200);
    assert.ok(res.body.next_cursor, "always a place to carry on from");
    if (res.body.data.length === 0) {
      assert.equal(res.body.next_cursor, cursor ?? "0.0", "an empty page keeps its place");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    seen.push(...res.body.data);
    cursor = res.body.next_cursor;
  }
  return { seen, cursor };
}

test("the event feed pages in the order events became visible, and never ends", async () => {
  const c = await newClub("feed");
  const { matches } = await playing(c);
  const reader = await keyWith(c, "league:read");

  const [count] = await owner`select count(*) from event where club_id = ${c.id}`;
  const all = await readFeedUntil(reader, undefined, Number(count?.count));
  assert.equal(all.seen.length, Number(count?.count), "every event, once");
  assert.equal(new Set(all.seen.map((e) => e.cursor)).size, all.seen.length);
  assert.equal(all.seen[0]?.type, "club.created");

  const empty = await send("GET", `/v1/events?after=${all.cursor}`, reader);
  assert.deepEqual([empty.body.data.length, empty.body.next_cursor], [0, all.cursor], "caught up: nothing new yet");

  await report(c, matches[0]!, 0, [[6, 2], [6, 2]]);
  const next = await readFeedUntil(reader, all.cursor, 1);
  assert.deepEqual(next.seen.map((e) => e.type), ["match.claim.reported"]);
  assert.equal(next.seen[0]?.subject_id, matches[0]);
  assert.equal((await send("GET", "/v1/events?after=not-a-cursor", reader)).status, 400);
});

// ───────────────────────────────────────────────────────────── tenancy ──

test("club A's key can neither read nor record results in club B", async () => {
  const a = await newClub("results-a");
  const b = await newClub("results-b");
  const theirs = await playing(b);
  const m = theirs.matches[0]!;
  const claim = (await report(b, m, 0, [[6, 3], [6, 3]])).body.claims[0].id;

  const attempts: [string, string, unknown?][] = [
    ["GET", `/v1/matches/${m}`],
    ["POST", `/v1/matches/${m}/claims`, { side: 1, outcome: "completed", score: score([6, 3], [6, 3]) }],
    ["POST", `/v1/matches/${m}/claims/${claim}/accept`],
    ["POST", `/v1/matches/${m}/settle`, { outcome: "unplayed" }],
  ];
  for (const [method, path, body] of attempts) {
    const res = await send(method, path, a.key, body);
    assert.equal(res.status, 404, `${method} ${path} answered ${res.status}`);
  }
  const listed = JSON.stringify((await send("GET", "/v1/matches", a.key)).body);
  assert.equal(listed.includes(m), false);
  const feed = JSON.stringify((await send("GET", "/v1/events?limit=500", a.key)).body);
  assert.equal(feed.includes(m) || feed.includes(b.id), false, "the feed holds only the club's own events");

  const [row] = await owner`select status from match where id = ${m}`;
  assert.equal(row?.status, "reported", "B's match is as B left it");
});

test("the spec lists the result routes with the scopes they need", async () => {
  const spec = (await send("GET", "/openapi.json")).body;
  const scopes = (path: string, method: string) => spec.paths[path]?.[method]?.security?.[0]?.apiKey;
  assert.deepEqual(scopes("/v1/matches", "get"), ["league:read"]);
  assert.deepEqual(scopes("/v1/matches/{id}/claims", "post"), ["results:write"]);
  assert.deepEqual(scopes("/v1/matches/{id}/claims/{claim_id}/accept", "post"), ["results:write"]);
  assert.deepEqual(scopes("/v1/matches/{id}/settle", "post"), ["league:write"]);
  assert.deepEqual(scopes("/v1/events", "get"), ["league:read"]);
});

test("the results deadline is a cut-off: after it the coach settles what is left", async () => {
  const c = await newClub("cut-off");
  const { seasonId, matches } = await playing(c, 3);
  const [waiting, untouched] = matches as [string, string];
  const reported = await report(c, waiting, 0, [[6, 4], [6, 4]]);
  assert.equal(reported.status, 201, "in time");
  const claimId = reported.body.claims[0].id;

  const moved = await send("PATCH", `/v1/seasons/${seasonId}`, c.key, { results_deadline_at: inDays(-1) });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));

  const late = await report(c, untouched, 0, [[6, 0], [6, 0]]);
  assert.equal(late.status, 409);
  assert.equal(late.body.code, "deadline_passed");
  const accepted = await send("POST", `/v1/matches/${waiting}/claims/${claimId}/accept`, c.key);
  assert.equal(accepted.status, 409, "nor is an answer to a claim still standing");
  assert.equal(accepted.body.code, "deadline_passed");

  const settled = await send("POST", `/v1/matches/${waiting}/settle`, c.key, {
    outcome: "completed",
    score: score([6, 4], [6, 4]),
  });
  assert.equal(settled.status, 201, "the coach still settles it");
  assert.equal(settled.body.status, "played");

  const extended = await send("PATCH", `/v1/seasons/${seasonId}`, c.key, { results_deadline_at: inDays(7) });
  assert.equal(extended.status, 200);
  assert.equal((await report(c, untouched, 0, [[6, 0], [6, 0]])).status, 201, "moving the deadline reopens it");
});

test("overruling a result the two players agreed is deliberate", async () => {
  const c = await newClub("override");
  const { matches } = await playing(c);
  const m = matches[0]!;
  await report(c, m, 0, [[6, 4], [6, 4]]);
  assert.equal((await report(c, m, 1, [[6, 4], [6, 4]])).body.status, "played", "they agree");

  const correction = { outcome: "completed", score: score([6, 4], [6, 3]) };
  const refused = await send("POST", `/v1/matches/${m}/settle`, c.key, correction);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "already_agreed");
  const [ledger] = await owner`select accepted_submission_id from match where id = ${m}`;
  assert.ok(ledger?.accepted_submission_id, "their result stands until the coach says otherwise");

  const settled = await send("POST", `/v1/matches/${m}/settle`, c.key, { ...correction, override: true });
  assert.equal(settled.status, 201, JSON.stringify(settled.body));
  assert.deepEqual(settled.body.result.score, score([6, 4], [6, 3]));

  const typo = await send("POST", `/v1/matches/${m}/settle`, c.key, { outcome: "completed", score: score([6, 4], [6, 2]) });
  assert.equal(typo.status, 201, "correcting the coach's own entry needs no override");
});
