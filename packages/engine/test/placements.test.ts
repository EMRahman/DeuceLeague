import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestPlacements, type DivisionStandings, type StandingsRow } from "../dist/index.js";

const movement = { promote: 2, relegate: 2, minMatchesForPromotion: 2 };
const divisions = (n: number) => Array.from({ length: n }, (_, i) => ({ ordinal: i + 1, name: `Division ${i + 1}` }));

function row(id: string, position: number | null, played = 10, standing: StandingsRow["standing"] = "ranked"): StandingsRow {
  return {
    entryId: id,
    label: id,
    position,
    standing,
    separatedBy: null,
    points: 0,
    played,
    won: 0,
    lost: 0,
    unplayed: 0,
    outstanding: 0,
    setsWon: 0,
    setsLost: 0,
    gamesWon: 0,
    gamesLost: 0,
  };
}
const division = (ordinal: number, ids: string[]): DivisionStandings => ({
  ordinal,
  name: `Division ${ordinal}`,
  standings: ids.map((id, i) => row(id, i + 1)),
});
const byId = (suggestions: ReturnType<typeof suggestPlacements>) =>
  Object.fromEntries(suggestions.map((s) => [s.entryId, s]));

test("two up and two down between each pair of divisions, and every division keeps its size", () => {
  const s = byId(
    suggestPlacements(
      [
        division(1, ["a1", "a2", "a3", "a4", "a5"]),
        division(2, ["b1", "b2", "b3", "b4", "b5"]),
        division(3, ["c1", "c2", "c3", "c4", "c5"]),
      ],
      movement,
      divisions(3),
    ),
  );
  const moves = (ids: string[]) => ids.map((id) => [s[id]?.to, s[id]?.reason]);
  assert.deepEqual(moves(["a1", "a2", "a3", "a4", "a5"]), [
    [1, "held"], [1, "held"], [1, "held"], [2, "relegated"], [2, "relegated"],
  ]);
  assert.deepEqual(moves(["b1", "b2", "b3", "b4", "b5"]), [
    [1, "promoted"], [1, "promoted"], [2, "held"], [3, "relegated"], [3, "relegated"],
  ]);
  assert.deepEqual(moves(["c1", "c2", "c3", "c4", "c5"]), [
    [2, "promoted"], [2, "promoted"], [3, "held"], [3, "held"], [3, "held"],
  ]);
  for (const d of [1, 2, 3]) {
    assert.equal(Object.values(s).filter((x) => x.to === d).length, 5, `Division ${d} keeps five`);
  }
  assert.equal(s.b1?.explanation, "1st in Division 2: promoted to Division 1.");
  assert.equal(s.a5?.explanation, "5th in Division 1: relegated to Division 2.");
});

test("someone who played too few is passed over for promotion, told why, and the next one goes up", () => {
  const d2: DivisionStandings = {
    ordinal: 2,
    name: "Division 2",
    standings: [row("b1", 1, 1), row("b2", 2), row("b3", 3), row("b4", 4)],
  };
  const s = byId(suggestPlacements([division(1, ["a1", "a2", "a3"]), d2], movement, divisions(2)));
  assert.deepEqual([s.b1?.to, s.b1?.reason], [2, "held"]);
  assert.equal(
    s.b1?.explanation,
    "1st in Division 2, but played 1 of the 2 matches needed for promotion: held in Division 2.",
  );
  assert.deepEqual([s.b2?.reason, s.b3?.reason], ["promoted", "promoted"]);
});

test("an unranked entry can go down but never up", () => {
  const d2: DivisionStandings = {
    ordinal: 2,
    name: "Division 2",
    standings: [row("b1", 1), row("b2", 2), row("b3", 3), row("b4", null, 0, "unranked")],
  };
  const s = byId(
    suggestPlacements(
      [division(1, ["a1", "a2", "a3"]), d2, division(3, ["c1", "c2"])],
      { promote: 1, relegate: 1, minMatchesForPromotion: 0 },
      divisions(3),
    ),
  );
  assert.deepEqual([s.b1?.reason, s.b4?.reason, s.b4?.to], ["promoted", "relegated", 3]);
  assert.equal(s.b4?.explanation, "Unranked in Division 2 (played 0): relegated to Division 3.");
});

test("a withdrawn entry is not carried over", () => {
  const d1: DivisionStandings = {
    ordinal: 1,
    name: "Division 1",
    standings: [row("a1", 1), row("a2", 2), row("a3", null, 3, "withdrawn")],
  };
  const s = byId(suggestPlacements([d1], movement, divisions(1)));
  assert.deepEqual([s.a3?.to, s.a3?.reason], [null, null]);
  assert.match(s.a3?.explanation ?? "", /not carried over/);
});

test("a small division never promotes and relegates the same entry", () => {
  const s = byId(
    suggestPlacements(
      [division(1, ["a1", "a2"]), division(2, ["b1", "b2", "b3"]), division(3, ["c1", "c2"])],
      movement,
      divisions(3),
    ),
  );
  assert.deepEqual(
    ["b1", "b2", "b3"].map((id) => s[id]?.reason),
    ["promoted", "promoted", "relegated"],
  );
});

test("with fewer divisions next time, the missing one folds into the nearest", () => {
  const s = byId(
    suggestPlacements(
      [division(1, ["a1", "a2", "a3"]), division(2, ["b1", "b2", "b3"]), division(3, ["c1", "c2", "c3"])],
      { promote: 1, relegate: 1, minMatchesForPromotion: 0 },
      divisions(2),
    ),
  );
  // Division 3 is gone, so its entries join Division 2 and nobody drops out of Division 2.
  assert.deepEqual(["c1", "c2", "c3"].map((id) => s[id]?.to), [2, 2, 2]);
  assert.deepEqual([s.b1?.reason, s.b3?.reason, s.b3?.to], ["promoted", "held", 2]);
});
