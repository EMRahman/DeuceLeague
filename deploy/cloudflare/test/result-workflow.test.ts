import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { ResultContext, ResultMutation } from "@deuceleague/db-d1";
import { DEFAULT_RULES, MATCH_FORMATS } from "@deuceleague/schema";
import { decideResult } from "../../../packages/api/dist/results/decide.js";
import { matchDetail } from "../../../packages/api/dist/results/model.js";
import { MatchPage } from "../../../adapters/website/dist/views.js";
import { readReportForm } from "../../../adapters/website/dist/score.js";

const format = MATCH_FORMATS.best_of_3_champions_tiebreak;
const now = new Date("2026-10-02T12:00:00Z");
const games = { outcome: "completed" as const, score: { sets: [{ games: [6, 4] as [number, number] }, { games: [6, 3] as [number, number] }] } };

function context(): ResultContext {
  return {
    match: { id: randomUUID(), clubId: randomUUID(), competitionId: randomUUID(), divisionId: null,
      competitionName: "Singles", divisionName: null, status: "open", outcome: null, score: null,
      winningSide: null, retiredSide: null, playedOn: null, acceptedSubmissionId: null,
      createdAt: now, updatedAt: now,
      sides: [{ sideIndex: 0, entryId: randomUUID(), label: "Alex" }, { sideIndex: 1, entryId: randomUUID(), label: "Bailey" }] },
    competition: { state: "active", visibility: "members", matchFormat: format },
    claims: [], deadline: null, ownSide: 0, memberId: randomUUID(), now,
  };
}

function apply(state: ResultContext, change: ResultMutation) {
  state.claims.push(change.claim);
  for (const c of state.claims) {
    if (change.supersede.includes(c.id)) c.state = "superseded";
    if (change.confirm.includes(c.id)) { c.state = "confirmed"; c.confirmedAt = now; }
  }
  state.match.status = change.status;
  if (change.ledger) {
    const l = change.ledger;
    Object.assign(state.match, { outcome: l.outcome, score: l.score, winningSide: l.winningSide,
      retiredSide: l.retiredSide, playedOn: l.playedOn, acceptedSubmissionId: l.claimId });
  }
}

for (const firstSide of [0, 1] as const) {
  test(`reversed player forms confirm with side ${firstSide} first, and retries do not confirm twice`, () => {
    const state = context();
    for (const side of [firstSide, 1 - firstSide] as (0 | 1)[]) {
      state.ownSide = side;
      state.memberId = randomUUID();
      const report = readReportForm({ outcome: "completed", mine_1: side === 0 ? "6" : "4",
        theirs_1: side === 0 ? "4" : "6", mine_2: side === 0 ? "6" : "3", theirs_2: side === 0 ? "3" : "6" }, side, format);
      assert.ok(report.ok);
      assert.deepEqual(report.report.score, games.score);
      const change = decideResult(state, { type: "report", body: report.report }, randomUUID());
      assert.ok(change);
      assert.equal(change.ledger !== null, side !== firstSide);
      assert.equal(change.events.filter((e) => e.type === "match.result.confirmed").length, side === firstSide ? 0 : 1);
      apply(state, change);
    }
    assert.equal(state.match.status, "played");
    assert.equal(state.match.winningSide, 0);
    assert.equal(decideResult(state, { type: "report", body: games }, randomUUID()), null);
    assert.throws(() => decideResult(state, { type: "report", body: { ...games,
      score: { sets: [{ games: [6, 1] }, { games: [6, 1] }] } } }, randomUUID()), /already in the ledger/);
  });
}

test("mismatches and opposing history stay private before and after coach settlement", () => {
  const state = context();
  apply(state, decideResult(state, { type: "report", body: { ...games, raw_input: "private text" } }, randomUUID())!);
  assert.deepEqual(matchDetail(state.match, state.claims, 1).claims, []);
  state.ownSide = 1;
  apply(state, decideResult(state, { type: "report", body: { ...games,
    score: { sets: [{ games: [6, 2] }, { games: [6, 2] }] } } }, randomUUID())!);
  assert.equal(state.match.status, "disputed");
  for (const side of [0, 1, null]) {
    const detail = matchDetail(state.match, state.claims, side);
    assert.deepEqual(detail.differences, []);
    assert.ok(detail.claims.every((c) => c.side === side && c.raw_input === null));
    assert.equal(detail.result, null);
  }
  const coach = matchDetail(state.match, state.claims, undefined);
  assert.equal(coach.claims.length, 2);
  assert.ok(coach.differences.length > 0);
  assert.equal(coach.claims[0]!.raw_input, "private text");
  state.memberId = null;
  apply(state, decideResult(state, { type: "settle", body: games }, randomUUID())!);
  assert.deepEqual(matchDetail(state.match, state.claims, null).claims, []);
  assert.deepEqual(matchDetail(state.match, state.claims, null).result?.score, games.score);
  assert.equal(matchDetail(state.match, state.claims, undefined).claims.length, 3);
});

test("a second teammate only replaces their own side; deciding match tiebreak differences remain unresolved", () => {
  const state = context();
  const score = { sets: [{ games: [6, 4] as [number, number] }, { games: [3, 6] as [number, number] }, { games: [10, 8] as [number, number] }] };
  apply(state, decideResult(state, { type: "report", body: { ...games, score } }, randomUUID())!);
  state.memberId = randomUUID(); // A teammate still has ownSide = 0.
  assert.equal(decideResult(state, { type: "report", body: { ...games, score } }, randomUUID()), null);
  assert.equal(state.match.status, "reported");
  state.ownSide = 1;
  const otherScore = { sets: [...score.sets.slice(0, 2), { games: [10, 7] as [number, number] }] };
  const mismatch = decideResult(state, { type: "report", body: { ...games, score: otherScore } }, randomUUID())!;
  assert.equal(mismatch.status, "disputed");
  assert.equal(mismatch.ledger, null);
  apply(state, mismatch);
  const fixed = decideResult(state, { type: "report", body: { ...games, score } }, randomUUID())!;
  assert.equal(fixed.status, "played");
  apply(state, fixed);
  assert.deepEqual(state.claims.map((c) => c.state), ["confirmed", "superseded", "confirmed"]);
});

for (const outcome of ["retired", "walkover", "conceded"] as const) {
  test(`${outcome} waits for agreement on the affected side`, () => {
    const state = context();
    const result = { outcome, retired_side: 1 as const,
      score: outcome === "retired" ? { sets: [{ games: [2, 1] as [number, number] }] } : null };
    const first = decideResult(state, { type: "report", body: result }, randomUUID())!;
    assert.equal(first.ledger, null);
    apply(state, first);
    state.ownSide = 1;
    const mismatch = decideResult(state, { type: "report", body: { ...result, retired_side: 0 } }, randomUUID())!;
    assert.equal(mismatch.ledger, null);
    assert.equal(mismatch.status, "disputed");
    apply(state, mismatch);
    const agreed = decideResult(state, { type: "report", body: result }, randomUUID())!;
    assert.equal(agreed.ledger!.retiredSide, 1);
    assert.equal(agreed.ledger!.winningSide, 0);
    assert.equal(agreed.status, "played");
  });
}


test("the player match page starts blank, shows only its own mismatch, and directs confirmed corrections to the coach", () => {
  const state = context();
  const competition = { id: state.match.competitionId, season_id: randomUUID(), name: "Singles",
    discipline: "singles" as const, match_format: format, rules: DEFAULT_RULES, state: "active" as const };
  const render = () => String(MatchPage({ frame: { club: "Test club", player: "Bailey" },
    match: matchDetail(state.match, state.claims, 1), competition, reportingClosed: false,
    division: null, mine: 1, names: ["Alex", "Bailey"], earned: null,
    today: "2026-10-02", messages: [], done: null, sent: null }));
  apply(state, decideResult(state, { type: "report", body: games }, randomUUID())!);
  const blank = render();
  assert.match(blank, /Enter yours independently/);
  assert.doesNotMatch(blank, /6-4, 6-3|Accept theirs|action="[^"]*accept|<option value="[0-9]+" selected/);
  state.ownSide = 1;
  apply(state, decideResult(state, { type: "report", body: { ...games,
    score: { sets: [{ games: [6, 3] }, { games: [6, 2] }] } } }, randomUUID())!);
  const mismatch = render();
  assert.match(mismatch, /Speak outside the app/);
  assert.match(mismatch, /3-6, 2-6/);
  assert.doesNotMatch(mismatch, /6-4, 6-3|Accept theirs/);
  assert.match(mismatch, /Filled in with your score/);
  state.memberId = null;
  apply(state, decideResult(state, { type: "settle", body: games }, randomUUID())!);
  const final = render();
  assert.match(final, /Bailey v Alex/);
  assert.match(final, /4-6, 3-6/);
  assert.match(final, /Ask the coach if this result needs correcting/);
  assert.doesNotMatch(final, /class="card report"/);
});
