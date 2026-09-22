import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RULES,
  MATCH_FORMATS,
  validateResult,
  type MatchFormat,
  type MatchOutcome,
  RulesSpec,
} from "@deuceleague/schema";
import { computeStandings, type StandingsEntry, type StandingsMatch } from "../dist/index.js";

// Every expected table here was worked out by hand first; the comments show
// the arithmetic. Most tests are about ordering and odd results rather than
// points, so unless one says otherwise they use FLAT: DEFAULT_RULES with a
// plain 3 for a win and 1 for a loss on court, and no bonuses. Then
// head-to-head, set difference, game difference, matches won.

const FLAT: RulesSpec = {
  ...DEFAULT_RULES,
  tiebreaks: ["points", "head_to_head", "set_difference", "game_difference", "matches_won"],
  points: {
    win: 3,
    lossPlayed: 1,
    retiredWin: 3,
    retiredLoss: 1,
    walkoverWin: 3,
    walkoverLoss: 0,
    concededWin: 3,
    concededLoss: 0,
    unplayedBoth: 0,
    perSetWon: 0,
    closeLoss: null,
    convincingWin: null,
    allPlayed: 0,
  },
};

const format = MATCH_FORMATS.best_of_3_champions_tiebreak as MatchFormat;

let made = 0;
/** A match id, in the order the test makes them. */
const nextId = () => `m${++made}`;

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
  return {
    id: nextId(),
    side0,
    side1,
    status: "played",
    outcome,
    winningSide: checked.winningSide,
    retiredSide,
    score: { sets },
  };
}
const open = (side0: string, side1: string): StandingsMatch => ({
  id: nextId(),
  side0,
  side1,
  status: "open",
  outcome: null,
  winningSide: null,
  retiredSide: null,
  score: null,
});
const walkover = (side0: string, side1: string, noShow: 0 | 1): StandingsMatch => ({
  id: nextId(),
  side0,
  side1,
  status: "played",
  outcome: "walkover",
  winningSide: noShow === 0 ? 1 : 0,
  retiredSide: noShow,
  score: null,
});

function table(input: {
  entries: StandingsEntry[];
  matches: StandingsMatch[];
  rules?: RulesSpec;
  format?: MatchFormat;
  deadlinePassed?: boolean;
}) {
  return computeStandings({
    entries: input.entries,
    matches: input.matches,
    rules: input.rules ?? FLAT,
    format: input.format ?? format,
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
  const rules: RulesSpec = { ...FLAT, points: { ...FLAT.points, unplayedBoth: 1 } };
  const before = table({ entries: entries("A", "B"), matches: [open("A", "B")], rules });
  assert.deepEqual(before.map((r) => [r.points, r.outstanding, r.unplayed]), [[0, 1, 0], [0, 1, 0]]);

  const after = table({ entries: entries("A", "B"), matches: [open("A", "B")], rules, deadlinePassed: true });
  assert.deepEqual(after.map((r) => [r.points, r.outstanding, r.unplayed, r.played]), [[1, 0, 1, 0], [1, 0, 1, 0]]);
});

test("a retirement: the unfinished set's games count, the set itself does not", () => {
  const rows = table({ entries: entries("A", "B"), matches: [played("A", "B", "6-4 2-1", "retired", 1)] });
  const [a, b] = [row(rows, "A"), row(rows, "B")];
  // Flat points: 3 for the win, 1 for the side that retired.
  assert.deepEqual([a.points, a.setsWon, a.setsLost, a.gamesWon, a.gamesLost, a.played], [3, 1, 0, 8, 5, 1]);
  assert.deepEqual([b.points, b.setsWon, b.setsLost, b.gamesWon, b.gamesLost, b.played], [1, 0, 1, 5, 8, 1]);
});

test("a walkover counts as played only for the side that turned up, and scores the whitewash it stands for", () => {
  const rows = table({ entries: entries("A", "B"), matches: [walkover("A", "B", 1)] });
  const [a, b] = [row(rows, "A"), row(rows, "B")];
  // Two sets to love in this format, so 12 games to none: a walkover counts in
  // the set and game tiebreaks, as the club's rules now say by default.
  assert.deepEqual([a.points, a.won, a.played, a.setsWon, a.gamesWon], [3, 1, 1, 2, 12]);
  assert.deepEqual([b.points, b.lost, b.played, b.setsLost, b.gamesLost], [0, 1, 0, 2, 12]);
  assert.deepEqual([a.setsLost, a.gamesLost, b.setsWon, b.gamesWon], [0, 0, 0, 0]);
});

test("a club can say a walkover moves no sets or games", () => {
  const rules: RulesSpec = { ...FLAT, walkoverScore: "none" };
  const rows = table({ entries: entries("A", "B"), matches: [walkover("A", "B", 1)], rules });
  const [a, b] = [row(rows, "A"), row(rows, "B")];
  assert.deepEqual([a.points, a.won, a.played, a.setsWon, a.gamesWon], [3, 1, 1, 0, 0]);
  assert.deepEqual([b.setsLost, b.gamesLost], [0, 0], "the points are all it is worth");
});

test("a walkover's nominal score follows the competition's format", () => {
  const rows = table({
    entries: entries("A", "B"),
    matches: [walkover("A", "B", 1)],
    format: { setsToWin: 1, set: { gamesToWin: 8, clearBy: 2, tiebreakAt: 8, tiebreakTo: 7 }, finalSet: { type: "standard" } },
  });
  assert.deepEqual([row(rows, "A").setsWon, row(rows, "A").gamesWon], [1, 8], "an 8-game pro set is 8-0");
});

test("a champions tiebreak counts as one game, not its points", () => {
  const rows = table({ entries: entries("A", "B"), matches: [played("A", "B", "6-4 3-6 10-8")] });
  // 6+3+1 against 4+6+0.
  assert.deepEqual([row(rows, "A").gamesWon, row(rows, "A").gamesLost], [10, 10]);
});

test("an entry that played too few is listed after the ranked ones, unranked", () => {
  const rows = table({
    entries: entries("A", "B", "C", "D"),
    rules: { ...FLAT, minMatchesForRanking: 2 },
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
  const rules: RulesSpec = { ...FLAT, withdrawal: { playedMatches: "void", remainingMatches: "walkover_to_opponent" } };
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
  const rules: RulesSpec = { ...FLAT, scoringMode: "games_won", tiebreaks: ["points"] };
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


// ── the default points ──────────────────────────────────────────────────────

test("by default: 1 for playing, 3 for winning, 1 a set, and 1 for a close loss or a big win", () => {
  const rows = table({
    entries: entries("A", "B", "C"),
    matches: [played("A", "B", "6-4 6-3"), played("A", "C", "6-1 6-1"), played("B", "C", "6-4 3-6 10-8")],
    rules: DEFAULT_RULES,
  });
  // A beat B 12-7 in games:  A 1 + 3 + 2 sets = 6;  B lost by 5, not close: 1.
  // A beat C 12-2, by 10:    A 1 + 3 + 2 + 1 convincing = 7;  C 1.
  // B beat C 10-10 in games (the tiebreak is one game), so C lost by 0:
  //                          B 1 + 3 + 2 = 6;  C 1 + 1 set + 1 close = 3.
  // Every match is in and everyone turned up: 1 more each.
  assert.deepEqual(order(rows), ["A", "B", "C"]);
  assert.deepEqual(rows.map((r) => r.points), [6 + 7 + 1, 1 + 6 + 1, 1 + 3 + 1]);
});

test("by default: a retirement, walkover or concession is 3 in all to the winner and nothing to the loser", () => {
  const rows = table({
    entries: entries("A", "B"),
    matches: [played("A", "B", "6-4 2-1", "retired", 1)],
    rules: { ...DEFAULT_RULES, points: { ...DEFAULT_RULES.points, allPlayed: 0 } },
  });
  // A won a set, but nothing was played out: no set, margin or playing points.
  assert.deepEqual([row(rows, "A").points, row(rows, "B").points], [3, 0]);
  const walked = table({ entries: entries("A", "B"), matches: [walkover("A", "B", 1)], rules: DEFAULT_RULES });
  assert.deepEqual([row(walked, "A").points, row(walked, "B").points], [3 + 1, 0], "A also turned up to every match");
});

test("the bonus for turning up to every match waits for the last one, and a walkover given away forfeits it", () => {
  const matches = [walkover("A", "B", 1), played("A", "C", "6-4 2-1", "retired", 1)];
  const early = table({ entries: entries("A", "B", "C"), matches: [...matches, open("B", "C")], rules: DEFAULT_RULES });
  // A's matches are both in, and A turned up to each: 3 + 3 + 1.
  // B and C still have one to play, so neither has it yet.
  assert.deepEqual([row(early, "A").points, row(early, "B").points, row(early, "C").points], [7, 0, 0]);

  const done = table({
    entries: entries("A", "B", "C"),
    matches: [...matches, played("B", "C", "6-2 6-2")],
    rules: DEFAULT_RULES,
  });
  // B beat C 12-4 in games, by 8: B 1 + 3 + 2 + 1 convincing = 7, but B gave A
  // a walkover, so no bonus. C: 1 for playing; C retired against A, but turned
  // up, so the bonus: 1.
  assert.deepEqual([row(done, "A").points, row(done, "B").points, row(done, "C").points], [7, 7, 2]);
});

test("rules saved before the bonuses existed score as they always did", () => {
  const { perSetWon, closeLoss, convincingWin, allPlayed, ...before } = FLAT.points;
  const rules = RulesSpec.parse({ ...FLAT, points: before });
  const rows = table({ entries: entries("A", "B"), matches: [played("A", "B", "6-0 6-0")], rules });
  assert.deepEqual([row(rows, "A").points, row(rows, "B").points], [3, 1]);
});

// ── where the points came from ──────────────────────────────────────────────

test("each row says what every match earned it, and the lines add up to its points", () => {
  const ab = played("A", "B", "6-4 6-3");
  const ac = played("A", "C", "6-1 6-1");
  const bc = played("B", "C", "6-4 3-6 10-8");
  const rows = table({ entries: entries("A", "B", "C"), matches: [ab, ac, bc], rules: DEFAULT_RULES });

  const a = row(rows, "A");
  assert.deepEqual(
    a.matches.map((m) => [m.matchId, m.opponentId, m.result, m.points, m.items.map((i) => `${i.for} ${i.points}`)]),
    [
      [ab.id, "B", "won", 6, ["result 4", "sets 2"]],
      [ac.id, "C", "won", 7, ["result 4", "sets 2", "convincing_win 1"]],
    ],
  );
  assert.equal(a.allPlayedBonus, 1);
  const c = row(rows, "C");
  assert.deepEqual(
    c.matches.map((m) => [m.opponentId, m.result, m.items.map((i) => `${i.for} ${i.points}`)]),
    [
      ["A", "lost", ["result 1"]],
      ["B", "lost", ["result 1", "sets 1", "close_loss 1"]],
    ],
  );

  // Whatever the results, the lines are the table.
  const mixed = table({
    entries: [...entries("A", "B", "C", "D"), { id: "E", label: "E", withdrawn: true }],
    matches: [
      played("A", "B", "6-4 2-1", "retired", 1),
      walkover("C", "D", 0),
      played("B", "C", "7-6 6-7 10-8"),
      open("A", "D"),
      played("E", "A", "6-0 6-0"),
      open("E", "B"),
    ],
    rules: { ...DEFAULT_RULES, points: { ...DEFAULT_RULES.points, unplayedBoth: 1 } },
    deadlinePassed: true,
  });
  for (const r of mixed) {
    const sum = r.matches.reduce((total, m) => total + m.points, 0) + r.allPlayedBonus;
    assert.equal(sum, r.points, `${r.entryId}'s lines add up to its points`);
    for (const m of r.matches) {
      assert.equal(m.items.reduce((t, i) => t + i.points, 0), m.points, `${r.entryId}: ${m.matchId}`);
    }
  }
});

test("a match not yet in the ledger is not listed, and one never played is", () => {
  const rows = table({ entries: entries("A", "B"), matches: [open("A", "B")], rules: DEFAULT_RULES });
  assert.deepEqual(row(rows, "A").matches, []);
  const after = table({ entries: entries("A", "B"), matches: [open("A", "B")], rules: DEFAULT_RULES, deadlinePassed: true });
  assert.deepEqual(
    row(after, "A").matches.map((m) => [m.result, m.outcome, m.points]),
    [["unplayed", null, 0]],
  );
});

test("by default, entries level on points are split by games difference before head-to-head", () => {
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
    // The default order, with flat points so the arithmetic matches the head-to-head test above.
    rules: { ...DEFAULT_RULES, points: FLAT.points },
  });
  // A and B on 7, C and D on 5, as above. A beat B, but on games B is 38-18
  // (+20) and A 26-26 (0). C is 20-24 (-4), D 16-32 (-16).
  assert.deepEqual(order(rows), ["B", "A", "C", "D"]);
  assert.deepEqual(rows.map((r) => r.separatedBy), [null, "game_difference", "points", "game_difference"]);
});
