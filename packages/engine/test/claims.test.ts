import { test } from "node:test";
import assert from "node:assert/strict";
import { formatScore, judgeClaims, type Claim } from "../dist/index.js";

const completed = (...sets: [number, number][]): Claim => ({
  outcome: "completed",
  score: { sets: sets.map((games) => ({ games })) },
  retiredSide: null,
});
const walkover = (noShow: 0 | 1): Claim => ({ outcome: "walkover", score: null, retiredSide: noShow });

test("with no claims, the match is open", () => {
  assert.deepEqual(judgeClaims(null, null), { status: "open" });
});

test("one claim waits on the other side, however long it takes", () => {
  assert.deepEqual(judgeClaims(completed([6, 4], [6, 3]), null), { status: "reported", waitingOn: 1 });
  assert.deepEqual(judgeClaims(null, completed([6, 4], [6, 3])), { status: "reported", waitingOn: 0 });
});

test("the same result from both sides is agreed", () => {
  assert.deepEqual(judgeClaims(completed([6, 4], [3, 6], [10, 8]), completed([6, 4], [3, 6], [10, 8])), {
    status: "played",
  });
  assert.deepEqual(judgeClaims(walkover(1), walkover(1)), { status: "played" });
});

test("tiebreak points never cause a dispute", () => {
  const a: Claim = { ...completed(), score: { sets: [{ games: [7, 6], tiebreak: [7, 5] }, { games: [6, 3] }] } };
  const b: Claim = { ...completed(), score: { sets: [{ games: [7, 6], tiebreak: [7, 4] }, { games: [6, 3] }] } };
  const c: Claim = completed([7, 6], [6, 3]);
  assert.equal(judgeClaims(a, b).status, "played");
  assert.equal(judgeClaims(a, c).status, "played");
});

test("a different set score is a dispute that names the set", () => {
  assert.deepEqual(judgeClaims(completed([6, 4], [6, 3]), completed([6, 4], [6, 2])), {
    status: "disputed",
    differences: ["set 2: side 0 says 6-3, side 1 says 6-2"],
  });
});

test("a different ending is a dispute about how it ended", () => {
  const verdict = judgeClaims(completed([6, 4], [6, 3]), walkover(0));
  assert.equal(verdict.status, "disputed");
  assert.deepEqual(verdict.status === "disputed" && verdict.differences, [
    "how it ended: side 0 says completed, side 1 says walkover",
  ]);
});

test("agreeing on a walkover but not on who failed to appear is still a dispute", () => {
  const verdict = judgeClaims(walkover(0), walkover(1));
  assert.deepEqual(verdict.status === "disputed" && verdict.differences, [
    "who failed to appear: side 0 says side 0, side 1 says side 1",
  ]);
});

test("a different number of sets is a dispute over the whole score", () => {
  const verdict = judgeClaims(completed([6, 4], [6, 3]), completed([6, 4], [3, 6], [10, 8]));
  assert.deepEqual(verdict.status === "disputed" && verdict.differences, [
    "the score: side 0 says 6-4 6-3, side 1 says 6-4 3-6 10-8",
  ]);
});

test("a score reads as it would on a results sheet", () => {
  assert.equal(formatScore({ sets: [{ games: [6, 4] }, { games: [3, 6] }, { games: [10, 8] }] }), "6-4 3-6 10-8");
  assert.equal(formatScore(null), "no score");
});
