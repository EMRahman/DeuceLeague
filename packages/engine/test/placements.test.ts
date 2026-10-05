import { test } from "node:test";
import assert from "node:assert/strict";
import { planPlacements, suggestPlacements, type DivisionStandings, type StandingsRow } from "../dist/index.js";

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

test("someone who played too few for promotion is held, told why, and leaves their place empty", () => {
  const d2: DivisionStandings = {
    ordinal: 2,
    name: "Division 2",
    standings: [row("b1", 1, 1), row("b2", 2), row("b3", 3), row("b4", 4), row("b5", 5), row("b6", 6)],
  };
  const plan = planPlacements([division(1, ["a1", "a2", "a3"]), d2], movement, divisions(2));
  const s = byId(plan.suggestions);
  assert.deepEqual([s.b1?.to, s.b1?.reason], [2, "held"]);
  assert.equal(
    s.b1?.explanation,
    "1st in Division 2, but played 1 of the 2 matches needed for promotion: held in Division 2.",
  );
  // Only the top two positions are promotion places: b2 goes up, and b1's place is left for the coach.
  assert.deepEqual([s.b2?.reason, s.b3?.reason], ["promoted", "held"]);
  assert.deepEqual(plan.vacancies.map((v) => [v.kind, v.from, v.to, v.entryId, v.fill?.entryId]), [["promotion", 2, 1, "b1", "b3"]]);
  assert.match(plan.vacancies[0]!.explanation, /^A promotion place into Division 1 is unfilled: 1st in Division 2 \(b1\) is held back \(played 1 of the 2 matches needed for promotion\)\. Suggested instead: 3rd in Division 2, b3\.$/);
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

test("an entry that opted out is left out, and leaves their place empty", () => {
  const s = byId(
    suggestPlacements(
      [division(1, ["a1", "a2", "a3", "a4"]), division(2, ["b1", "b2", "b3", "b4"])],
      movement,
      divisions(2),
      new Set(["b1", "a4"]),
    ),
  );
  assert.deepEqual([s.b1?.to, s.b1?.reason], [null, null]);
  assert.match(s.b1?.explanation ?? "", /opted out of the next competition/);
  // Positions decide: 2nd goes up, 3rd does not take the empty place, and the same below.
  assert.deepEqual(["b2", "b3"].map((id) => s[id]?.reason), ["promoted", "held"], "b3 does not go up in b1's place");
  assert.deepEqual([s.a4?.to, s.a3?.reason, s.a2?.reason], [null, "relegated", "held"], "nor a2 down in a4's");
});

test("gaps in target ordinals move entries only to divisions that exist", () => {
  const target = [{ ordinal: 1, name: "Top" }, { ordinal: 4, name: "Bottom" }];
  const s = byId(suggestPlacements([division(1, ["a1", "a2"]), division(4, ["b1", "b2"])],
    { promote: 1, relegate: 1, minMatchesForPromotion: 0 }, target));
  assert.deepEqual([s.a1?.to, s.a2?.to, s.b1?.to, s.b2?.to], [1, 4, 1, 4]);
  assert.equal(s.a2?.reason, "relegated"); assert.equal(s.b1?.reason, "promoted");
});

test("a removed division folds into the nearest existing target, with ties toward the higher division", () => {
  const target = [{ ordinal: 1, name: "Top" }, { ordinal: 5, name: "Bottom" }];
  const s = byId(suggestPlacements([division(3, ["tie"]), division(4, ["closer"])],
    { promote: 0, relegate: 0, minMatchesForPromotion: 0 }, target));
  assert.equal(s.tie?.to, 1); assert.equal(s.closer?.to, 5);
});

test("someone who played too few to keep a place is not carried over, leaves their place empty, and is told why", () => {
  const s = byId(
    suggestPlacements(
      [division(1, ["a1", "a2", "a3", "a4", "a5"]), division(2, ["b1", "b2", "b3", "b4", "b5"])],
      movement,
      divisions(2),
      new Set(),
      // b1 tops Division 2 and a5 is bottom of Division 1, but neither played enough.
      new Map([["b1", { played: 1, target: 4 }], ["a5", { played: 3, target: 4 }]]),
    ),
  );
  assert.equal(s.b1!.to, null); assert.equal(s.a5!.to, null);
  assert.match(s.b1!.explanation, /^1st in Division 2, but played 1 of the 4 matches needed to keep a place, so not carried over/);
  // Their places stay empty: b2 goes up and a4 goes down, and b3 and a3 do not take the others'.
  assert.deepEqual([s.b2!.reason, s.b3!.reason, s.a3!.reason, s.a4!.reason], ["promoted", "held", "held", "relegated"]);
});

test("a pair breaking up is left out, told why, and leaves their place empty", () => {
  const s = byId(
    suggestPlacements(
      [division(1, ["a1", "a2", "a3", "a4"]), division(2, ["b1", "b2", "b3", "b4"])],
      movement,
      divisions(2),
      new Set(),
      new Map(),
      new Map([["b1", "Sam asked for a new partner"], ["a3", "Kim is not playing next season"]]),
    ),
  );
  assert.deepEqual([s.b1?.to, s.b1?.reason], [null, null]);
  assert.equal(s.b1?.explanation, "1st in Division 2, but Sam asked for a new partner, so the pair is not carried over. " +
    "Add them back if they stay together.");
  assert.deepEqual(["b2", "b3"].map((id) => s[id]?.reason), ["promoted", "held"], "b3 does not go up in b1's place");
  assert.deepEqual([s.a3?.to, s.a4?.reason, s.a2?.reason], [null, "relegated", "held"], "and a2 does not go down in a3's");
});

test("a 4th of 4 is never promoted because the three above left, nor suggested for their places: they are left empty", () => {
  const plan = planPlacements(
    [division(1, ["a1", "a2", "a3"]), division(2, ["b1", "b2", "b3", "b4"])],
    movement,
    divisions(2),
    new Set(["b1", "b2", "b3"]),
  );
  const s = byId(plan.suggestions);
  assert.deepEqual(["b1", "b2", "b3", "b4"].map((id) => s[id]?.reason), [null, null, null, "held"]);
  assert.deepEqual(plan.vacancies.map((v) => [v.entryId, v.fill?.entryId ?? null]), [["b1", null], ["b2", null]]);
  assert.match(plan.vacancies[0]!.explanation, /No suggestion: the next eligible entry, 4th in Division 2, finished too low\.$/);
});

test("a vacancy is never filled from the wrong half of the table", () => {
  const rules = { promote: 1, relegate: 1, minMatchesForPromotion: 0 };
  // Four in Division 1: the 4th and 3rd are both short, so only the top half is left to send down.
  let plan = planPlacements([division(1, ["a1", "a2", "a3", "a4"]), division(2, ["b1", "b2"])], rules, divisions(2),
    new Set(), new Map([["a3", { played: 1, target: 3 }], ["a4", { played: 1, target: 3 }]]));
  assert.deepEqual(plan.vacancies.map((v) => [v.kind, v.entryId, v.fill?.entryId ?? null]), [["relegation", "a4", null]]);
  assert.match(plan.vacancies[0]!.explanation, /No suggestion: the next eligible entry, 2nd in Division 1, finished too high\.$/);
  assert.equal(byId(plan.suggestions).a2?.reason, "held");
  // With only the 4th short, the 3rd is in the bottom half and is suggested.
  plan = planPlacements([division(1, ["a1", "a2", "a3", "a4"]), division(2, ["b1", "b2"])], rules, divisions(2),
    new Set(), new Map([["a4", { played: 1, target: 3 }]]));
  assert.deepEqual(plan.vacancies.map((v) => v.fill?.entryId ?? null), ["a3"]);
  // Going up, the same: the 2nd of four may fill the 1st's place; the 3rd may not.
  plan = planPlacements([division(1, ["a1", "a2"]), division(2, ["b1", "b2", "b3", "b4"])], rules, divisions(2), new Set(["b1"]));
  assert.deepEqual(plan.vacancies.map((v) => v.fill?.entryId ?? null), ["b2"]);
  plan = planPlacements([division(1, ["a1", "a2"]), division(2, ["b1", "b2", "b3", "b4"])], rules, divisions(2), new Set(["b1", "b2"]));
  assert.deepEqual(plan.vacancies.map((v) => v.fill?.entryId ?? null), [null]);
  // The middle of an odd-sized division may go either way.
  plan = planPlacements([division(1, ["a1", "a2", "a3", "a4", "a5"]), division(2, ["b1", "b2"])], rules, divisions(2),
    new Set(["a4", "a5"]));
  assert.deepEqual(plan.vacancies.map((v) => v.fill?.entryId ?? null), ["a3"]);
});

test("no entry is promoted from outside the top places or relegated from outside the bottom ones, whoever is left out", () => {
  const ids = ["b1", "b2", "b3", "b4", "b5", "b6"];
  const table = [division(1, ["a1", "a2", "a3", "a4", "a5", "a6"]), division(2, ids), division(3, ["c1", "c2", "c3", "c4", "c5", "c6"])];
  for (let mask = 0; mask < 64; mask++) {
    const out = new Set(ids.filter((_, i) => (mask >> i) & 1));
    const s = byId(suggestPlacements(table, { promote: 2, relegate: 2, minMatchesForPromotion: 0 }, divisions(3), out));
    for (const [i, id] of ids.entries()) {
      if (s[id]?.reason === "promoted") assert.ok(i < 2, `${id} promoted with ${[...out]} out`);
      if (s[id]?.reason === "relegated") assert.ok(i >= 4, `${id} relegated with ${[...out]} out`);
    }
  }
});

test("a withdrawn entry takes a relegation place, so the entry above it stays up", () => {
  const d1: DivisionStandings = { ordinal: 1, name: "Division 1", standings: [row("a1", 1), row("a2", 2), row("a3", 3), row("a4", 4),
    row("a5", null, 3, "unranked"), row("a6", null, 4, "withdrawn")] };
  const plan = planPlacements([d1, division(2, ["b1", "b2"])], { promote: 1, relegate: 2, minMatchesForPromotion: 0 }, divisions(2),
    new Set(["a5"]));
  const s = byId(plan.suggestions);
  // The bottom two places are a5's and a6's. a6 withdrew, so its place is taken; a5 opted out, so its place is
  // empty, and a4, the worst carried entry, is only suggested to fill it.
  assert.deepEqual(["a3", "a4", "a5", "a6"].map((id) => [s[id]?.to, s[id]?.reason]), [[1, "held"], [1, "held"], [null, null], [null, null]]);
  assert.match(s.a6?.explanation ?? "", /takes one of the relegation places to Division 2/);
  assert.deepEqual(plan.vacancies.map((v) => [v.kind, v.from, v.to, v.entryId, v.fill?.entryId]), [["relegation", 1, 2, "a5", "a4"]]);
});

test("under one down, a withdrawn pair is the one relegation: 5th of 6 stays up", () => {
  const d1: DivisionStandings = { ordinal: 1, name: "Division 1", standings: [row("a1", 1), row("a2", 2), row("a3", 3), row("a4", 4),
    row("a5", 5), row("a6", null, 2, "withdrawn")] };
  const s = byId(suggestPlacements([d1, division(2, ["b1", "b2", "b3"])], { promote: 1, relegate: 1, minMatchesForPromotion: 0 }, divisions(2)));
  assert.deepEqual([s.a5?.reason, s.a6?.to, s.b1?.reason], ["held", null, "promoted"]);
});

test("someone who has left the club or been removed leaves their place empty, and says so", () => {
  const plan = planPlacements([division(1, ["a1", "a2", "a3"]), division(2, ["b1", "b2", "b3", "b4"]), division(3, ["c1", "c2", "c3"])],
    movement, divisions(3), new Set(), new Map(), new Map(), new Map([["b1", "left"], ["b4", "removed"]] as const));
  const s = byId(plan.suggestions);
  assert.equal(s.b1?.explanation, "1st in Division 2, but a member has since left the club, so not carried over.");
  assert.equal(s.b4?.explanation, "4th in Division 2, but a member has since been removed from the club, so not carried over.");
  // b2 goes up and b3, in the last-but-one place, goes down: neither moves into b1's or b4's empty place.
  assert.deepEqual(["b2", "b3"].map((id) => s[id]?.reason), ["promoted", "relegated"]);
  assert.deepEqual(plan.vacancies.map((v) => [v.kind, v.entryId]), [["promotion", "b1"], ["relegation", "b4"]]);
});

test("a withdrawn pair breaking up still says it took the relegation place", () => {
  const d1: DivisionStandings = { ordinal: 1, name: "Division 1", standings: [row("a1", 1), row("a2", 2), row("a3", null, 2, "withdrawn")] };
  const s = byId(suggestPlacements([d1, division(2, ["b1", "b2"])], { promote: 1, relegate: 1, minMatchesForPromotion: 0 }, divisions(2),
    new Set(), new Map(), new Map([["a3", "Kim asked for a new partner"]])));
  assert.match(s.a3?.explanation ?? "", /^Withdrew from Division 1, so not carried over; it takes one of the relegation places to Division 2\./);
  assert.equal(s.a2?.reason, "held");
});
