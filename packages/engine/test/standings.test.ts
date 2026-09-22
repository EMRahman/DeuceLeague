import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  MATCH_FORMATS,
  validateResult,
  type MatchFormat,
  type MatchOutcome,
  type RulesSpec,
} from "@deuceleague/schema";
import { computeStandings, type StandingsEntry, type StandingsMatch } from "../dist/index.js";

// Every expected table here was worked out by hand first; the comments show
// the arithmetic. The rules are DEFAULT_RULES unless a test says otherwise:
// 3 for a win, 1 for a played loss, then head-to-head, set difference, game
// difference, matches won.

const format = MATCH_FORMATS.best_of_3_champions_tiebreak as MatchFormat;

const entries = (...ids: string[]): StandingsEntry[] => ids.map((id) => ({ id, label: id, withdrawn: false }));

/** A result from side 0's point of view: played("A", "B", "6-4 6-3") is A beating B. */
function played(
  side0: string,
  side1: string,
  score: string,
  outcome: MatchOutcome = "completed",
  retiredSide: 0 | 1 | null = null,
): StandingsMatch {
  const sets = score.split(" ").map((s) => ({ games: s.split("-").map(Number) as [number, number] }));
  const checked = validateResult({ outcome, score: { sets }, retiredSide }, format);
  assert.ok(checked.ok, `test data: ${score} — ${checked.errors.join("; ")}`);
  return { side0, side1, status: "played", outcome, winningSide: checked.winningSide, retiredSide, score: { sets } };
}
const open = (side0: string, side1: string): StandingsMatch => ({
  side0,
  side1,
  status: "open",
  outcome: null,
  winningSide: null,
  retiredSide: null,
  score: null,
});
const walkover = (side0: string, side1: string, noShow: 0 | 1): StandingsMatch => ({
  side0,
  side1,
  status: "played",
  outcome: "walkover",
  winningSide: noShow === 0 ? 1 : 0,
  retiredSide: noShow,
  score: null,
});

function table(input: { entries: StandingsEntry[]; matches: StandingsMatch[]; rules?: RulesSpec; deadlinePassed?: boolean }) {
  return computeStandings({
    entries: input.entries,
    matches: input.matches,
    rules: input.rules ?? DEFAULT_RULES,
    format,
    deadlinePassed: input.deadlinePassed ?? false,
  });
}
const order = (rows: { entryId: string }[]) => rows.map((r) => r.entryId);
const row = (rows: ReturnType<typeof table>, id: string) => {
  const found = rows.find((r) => r.entryId === id);
  assert.ok(found, id);
  return found;
};

test("three points for a win, one for turning up and losing", () => {
  const rows = table({
    entries: entries("A", "B", "C", "D"),
    matches: [
      played("A", "B", "6-4 6-3"),
      played("A", "C", "6-2 6-2"),
      played("B", "C", "6-4 3-6 10-8"),
      open("A", "D"),
      open("B", "D"),
      open("C", "D"),
    ],
  });
  // A: two wins = 6.  B: lost to A (1) + beat C (3) = 4.  C: two played losses = 2.  D: 0.
  assert.deepEqual(order(rows), ["A", "B", "C", "D"]);
  assert.deepEqual(rows.map((r) => r.points), [6, 4, 2, 0]);
  assert.deepEqual(rows.map((r) => r.position), [1, 2, 3, 4]);
  assert.deepEqual(rows.map((r) => r.separatedBy), [null, "points", "points", "points"]);

  const a = row(rows, "A");
  assert.deepEqual([a.played, a.won, a.lost, a.outstanding], [2, 2, 0, 1]);
  assert.deepEqual([a.setsWon, a.setsLost, a.gamesWon, a.gamesLost], [4, 0, 24, 11]);
  // B: 7-12 against A; 6-4 3-6 and a tiebreak won against C, which is 10-10 in games.
  const b = row(rows, "B");
  assert.deepEqual([b.setsWon, b.setsLost, b.gamesWon, b.gamesLost], [2, 3, 17, 22]);
  assert.equal(row(rows, "D").outstanding, 3);
});

test("head-to-head settles a two-way tie, ahead of better game difference", () => {
  const rows = table({
    entries: entries("A", "B", "C", "D"),
    matches: [
      played("A", "B", "7-6 7-6"),
      played("A", "C", "0-6 0-6"),
      played("A", "D", "6-1 6-1"),
      played("B", "C", "6-0 6-0"),
      played("B", "D", "6-1 6-1"),
      played("C", "D", "4-6 4-6"),
    ],
  });
  // A 7 = beat B, lost to C, beat D.  B 7 = lost to A, beat C, beat D.
  // C 5 = beat A, lost to B, lost to D.  D 5 = lost to A, lost to B, beat C.
  // B has far the better games (+20 to 0), but A beat B, and head-to-head
  // comes first. Likewise D beat C.
  assert.deepEqual(order(rows), ["A", "B", "D", "C"]);
  assert.deepEqual(rows.map((r) => r.separatedBy), [null, "head_to_head", "points", "head_to_head"]);
});

test("with three level, head-to-head is skipped and the next rule that splits them decides", () => {
  const rows = table({
    entries: entries("A", "B", "C"),
    matches: [played("A", "B", "6-0 6-0"), played("B", "C", "6-4 6-4"), played("C", "A", "6-3 6-3")],
  });
  // Each won one and lost one: 4 points, two sets up and two down, and each
  // beat one of the others, so head-to-head cannot separate three.
  // Games: A 18-12 (+6), C 20-18 (+2), B 12-20 (-8).
  assert.deepEqual(order(rows), ["A", "C", "B"]);
  assert.deepEqual(rows.map((r) => r.separatedBy), [null, "game_difference", "game_difference"]);
});

test("when nothing else separates them, the name does — and the table says so", () => {
  const rows = table({
    entries: [
      { id: "e1", label: "M. Doyle", withdrawn: false },
      { id: "e2", label: "J. Abbott", withdrawn: false },
    ],
    matches: [open("e1", "e2")],
  });
  assert.deepEqual(order(rows), ["e2", "e1"]);
  assert.deepEqual(rows.map((r) => r.separatedBy), [null, "name"]);
});

test("the same results give the same table, whatever order they arrive in", () => {
  const matches = [
    played("A", "B", "6-4 6-3"),
    played("C", "A", "6-4 6-4"),
    played("B", "C", "7-5 6-4"),
    open("A", "D"),
    played("D", "B", "6-2 6-2"),
  ];
  const once = table({ entries: entries("A", "B", "C", "D"), matches });
  const again = table({ entries: entries("D", "C", "B", "A"), matches: [...matches].reverse() });
  assert.deepEqual(again, once);
});

test("an outstanding match counts for nothing until the deadline, then as unplayed", () => {
  const rules: RulesSpec = { ...DEFAULT_RULES, points: { ...DEFAULT_RULES.points, unplayedBoth: 1 } };
  const before = table({ entries: entries("A", "B"), matches: [open("A", "B")], rules });
  assert.deepEqual(before.map((r) => [r.points, r.outstanding, r.unplayed]), [[0, 1, 0], [0, 1, 0]]);

  const after = table({ entries: entries("A", "B"), matches: [open("A", "B")], rules, deadlinePassed: true });
  assert.deepEqual(after.map((r) => [r.points, r.outstanding, r.unplayed, r.played]), [[1, 0, 1, 0], [1, 0, 1, 0]]);
});

test("a retirement: the unfinished set's games count, the set itself does not", () => {
  const rows = table({ entries: entries("A", "B"), matches: [played("A", "B", "6-4 2-1", "retired", 1)] });
  const [a, b] = [row(rows, "A"), row(rows, "B")];
  // Default points: 3 for the win, 1 for the side that retired.
  assert.deepEqual([a.points, a.setsWon, a.setsLost, a.gamesWon, a.gamesLost, a.played], [3, 1, 0, 8, 5, 1]);
  assert.deepEqual([b.points, b.setsWon, b.setsLost, b.gamesWon, b.gamesLost, b.played], [1, 0, 1, 5, 8, 1]);
});

test("a walkover counts as played only for the side that turned up", () => {
  const rows = table({ entries: entries("A", "B"), matches: [walkover("A", "B", 1)] });
  const [a, b] = [row(rows, "A"), row(rows, "B")];
  assert.deepEqual([a.points, a.won, a.played, a.setsWon, a.gamesWon], [3, 1, 1, 0, 0]);
  assert.deepEqual([b.points, b.lost, b.played], [0, 1, 0]);
});

test("a champions tiebreak counts as one game, not its points", () => {
  const rows = table({ entries: entries("A", "B"), matches: [played("A", "B", "6-4 3-6 10-8")] });
  // 6+3+1 against 4+6+0.
  assert.deepEqual([row(rows, "A").gamesWon, row(rows, "A").gamesLost], [10, 10]);
});

test("an entry that played too few is listed after the ranked ones, unranked", () => {
  const rows = table({
    entries: entries("A", "B", "C", "D"),
    rules: { ...DEFAULT_RULES, minMatchesForRanking: 2 },
    matches: [
      played("A", "B", "6-1 6-1"),
      played("A", "C", "6-1 6-1"),
      played("B", "C", "6-1 6-1"),
      played("D", "C", "6-1 6-1"),
      open("A", "D"),
      open("B", "D"),
    ],
  });
  // D has 3 points, ahead of C, but has played only once.
  assert.deepEqual(order(rows), ["A", "B", "C", "D"]);
  assert.deepEqual(rows.map((r) => r.position), [1, 2, 3, null]);
  assert.equal(row(rows, "D").standing, "unranked");
  assert.equal(row(rows, "D").separatedBy, null, "the top of its own group");
});

test("a withdrawal, by default: results already played stand, the rest go unplayed", () => {
  const rows = table({
    entries: [...entries("A", "B"), { id: "C", label: "C", withdrawn: true }],
    matches: [played("A", "C", "6-0 6-0"), open("B", "C"), open("A", "B")],
  });
  assert.deepEqual(order(rows), ["A", "B", "C"]);
  assert.equal(row(rows, "A").points, 3, "the win over C stands");
  assert.deepEqual([row(rows, "B").points, row(rows, "B").unplayed], [0, 1]);
  assert.deepEqual([row(rows, "C").standing, row(rows, "C").position], ["withdrawn", null]);
});

test("a withdrawal, when a club voids it: results go, and the rest become walkovers", () => {
  const rules: RulesSpec = { ...DEFAULT_RULES, withdrawal: { playedMatches: "void", remainingMatches: "walkover_to_opponent" } };
  const rows = table({
    entries: [...entries("A", "B"), { id: "C", label: "C", withdrawn: true }],
    matches: [played("A", "C", "6-0 6-0"), open("B", "C"), open("A", "B")],
    rules,
  });
  // A's win over C is voided; B's unplayed match against C becomes a walkover.
  assert.deepEqual(order(rows), ["B", "A", "C"]);
  assert.deepEqual([row(rows, "A").points, row(rows, "A").played], [0, 0]);
  assert.deepEqual([row(rows, "B").points, row(rows, "B").won, row(rows, "B").played], [3, 1, 1]);
});

test("scoring by games won orders by games, then the club's tiebreaks", () => {
  const rules: RulesSpec = { ...DEFAULT_RULES, scoringMode: "games_won", tiebreaks: ["points"] };
  const rows = table({
    entries: entries("A", "B", "C"),
    matches: [played("A", "B", "6-4 6-4"), played("B", "C", "7-6 7-6")],
    rules,
  });
  // Games: B 8 + 14 = 22, A 12, C 12. A and C are level on games; A has the
  // win (3 points) and C the played loss (1).
  assert.deepEqual(order(rows), ["B", "A", "C"]);
  assert.deepEqual(rows.map((r) => r.separatedBy), [null, "games_won", "points"]);
});

