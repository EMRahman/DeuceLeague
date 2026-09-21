import { test } from "node:test";
import assert from "node:assert/strict";
import { MATCH_FORMATS, validateResult, type MatchFormat, type Result } from "../dist/index.js";

const champsTb = MATCH_FORMATS.best_of_3_champions_tiebreak as MatchFormat;
const fullSets = MATCH_FORMATS.best_of_3_sets as MatchFormat;
const proSet = MATCH_FORMATS.pro_set_8 as MatchFormat;

const completed = (...sets: [number, number][]): Result => ({
  outcome: "completed",
  score: { sets: sets.map((games) => ({ games })) },
  retiredSide: null,
});

test("accepts an ordinary straight-sets win and totals it up", () => {
  const r = validateResult(completed([6, 4], [6, 3]), champsTb);
  assert.deepEqual(r.errors, []);
  assert.equal(r.winningSide, 0);
  assert.deepEqual(r.setsWon, [2, 0]);
  assert.deepEqual(r.gamesWon, [12, 7]);
});

test("accepts a champions tiebreak as the deciding set", () => {
  const r = validateResult(completed([6, 4], [3, 6], [10, 7]), champsTb);
  assert.ok(r.ok, r.errors.join("; "));
  assert.equal(r.winningSide, 0);
  assert.deepEqual(r.setsWon, [2, 1]);
});

test("rejects a full third set when the format calls for a champions tiebreak", () => {
  const r = validateResult(completed([6, 4], [3, 6], [6, 4]), champsTb);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /set 3/);
});

test("accepts 7-5 and 7-6 but not 6-5 or 8-6", () => {
  assert.ok(validateResult(completed([7, 5], [6, 2]), champsTb).ok);
  assert.ok(validateResult(completed([7, 6], [6, 2]), champsTb).ok);
  assert.equal(validateResult(completed([6, 5], [6, 2]), champsTb).ok, false);
  assert.equal(validateResult(completed([8, 6], [6, 2]), champsTb).ok, false);
});

test("catches a transposed digit rather than storing it", () => {
  // Someone meant 6-4 6-3 and typed 6-4 63-0.
  const r = validateResult(completed([6, 4], [63, 0]), champsTb);
  assert.equal(r.ok, false);
});

test("rejects a match where nobody actually won", () => {
  const r = validateResult(completed([6, 4]), champsTb);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /neither side won 2 sets/);
});

test("rejects more sets than the format allows", () => {
  const r = validateResult(completed([6, 4], [6, 4], [6, 4]), champsTb);
  assert.equal(r.ok, false);
});

test("a full-sets format allows a long deciding set", () => {
  assert.ok(validateResult(completed([6, 4], [3, 6], [7, 5]), fullSets).ok);
});

test("an 8-game pro set ends at 8, at 9-7, or 9-8 on a tiebreak", () => {
  assert.ok(validateResult(completed([8, 6]), proSet).ok);
  // 7-7 -> 8-7 -> either 9-7 by two, or 8-8 and a tiebreak.
  assert.ok(validateResult(completed([9, 7]), proSet).ok);
  assert.ok(validateResult(completed([9, 8]), proSet).ok);
  assert.equal(validateResult(completed([10, 8]), proSet).ok, false);
  assert.equal(validateResult(completed([8, 7]), proSet).ok, false);
  assert.equal(validateResult(completed([6, 4]), proSet).ok, false);
});

test("a retirement stands on an incomplete score, and the other side wins", () => {
  const r = validateResult(
    { outcome: "retired", score: { sets: [{ games: [6, 4] }, { games: [2, 1] }] }, retiredSide: 1 },
    champsTb,
  );
  assert.ok(r.ok, r.errors.join("; "));
  assert.equal(r.winningSide, 0);
  assert.deepEqual(r.gamesWon, [8, 5]);
});

test("a retirement may stop part-way through the opening set", () => {
  const r = validateResult(
    { outcome: "retired", score: { sets: [{ games: [3, 1] }] }, retiredSide: 1 },
    champsTb,
  );
  assert.ok(r.ok, r.errors.join("; "));
  assert.deepEqual(r.setsWon, [0, 0]);
  assert.deepEqual(r.gamesWon, [3, 1]);
});

test("a retirement still rejects an illegal completed set before it", () => {
  const r = validateResult(
    { outcome: "retired", score: { sets: [{ games: [6, 5] }, { games: [2, 1] }] }, retiredSide: 1 },
    champsTb,
  );
  assert.equal(r.ok, false);
  assert.match(r.errors.join(" "), /set 1/);
});

test("a retirement must say who retired", () => {
  const r = validateResult(
    { outcome: "retired", score: { sets: [{ games: [6, 4] }] }, retiredSide: null },
    champsTb,
  );
  assert.equal(r.ok, false);
});

test("walkovers and unplayed matches carry no score", () => {
  assert.ok(validateResult({ outcome: "walkover", score: null, retiredSide: 0 }, champsTb).ok);
  assert.equal(
    validateResult({ outcome: "walkover", score: { sets: [{ games: [6, 0] }] }, retiredSide: 0 }, champsTb).ok,
    false,
  );
  assert.ok(validateResult({ outcome: "unplayed", score: null, retiredSide: null }, champsTb).ok);
  assert.equal(
    validateResult({ outcome: "unplayed", score: { sets: [{ games: [6, 0] }] }, retiredSide: null }, champsTb).ok,
    false,
  );
});

test("a walkover awards the win to the side that turned up", () => {
  assert.equal(validateResult({ outcome: "walkover", score: null, retiredSide: 1 }, champsTb).winningSide, 0);
  assert.equal(validateResult({ outcome: "conceded", score: null, retiredSide: 0 }, champsTb).winningSide, 1);
});
