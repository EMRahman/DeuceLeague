import {
  validateResult,
  type MatchFormat,
  type MatchOutcome,
  type MatchStatus,
  type RulesSpec,
  type Score,
  type SideIndex,
  type TiebreakRule,
} from "@deuceleague/schema";

/**
 * A division's table, computed from its matches every time it is asked for.
 * Nothing here is stored, which is what makes correcting an old score a
 * one-row change: the next read simply sees the new result. See
 * docs/DATA-MODEL.md.
 */

export type StandingsEntry = {
  id: string;
  /** How the entry is written on a results sheet. The last resort for ordering. */
  label: string;
  withdrawn: boolean;
};

/** A match as the ledger holds it. `side0` and `side1` are entry ids. */
export type StandingsMatch = {
  id: string;
  side0: string | null;
  side1: string | null;
  status: MatchStatus;
  outcome: MatchOutcome | null;
  winningSide: SideIndex | null;
  retiredSide: SideIndex | null;
  score: Score | null;
};

export type StandingsInput = {
  entries: readonly StandingsEntry[];
  matches: readonly StandingsMatch[];
  rules: RulesSpec;
  /** The competition's format, which says how a score's sets and games count. */
  format: MatchFormat;
  /** Once the results deadline has passed, a match still outstanding is unplayed. */
  deadlinePassed: boolean;
};

/** What put an entry below the one above it: the scoring mode, a tiebreak rule, or the name. */
export type Separator = RulesSpec["scoringMode"] | TiebreakRule | "name";

export type Tally = {
  points: number;
  /**
   * Matches this entry took the court for, or turned up ready to: a completed
   * or retired match counts for both sides, a walkover or concession only for
   * the side that was there.
   */
  played: number;
  won: number;
  lost: number;
  /** Matches never played, each worth rules.points.unplayedBoth to both sides. */
  unplayed: number;
  /** Matches not yet in the ledger. They count for nothing until they are. */
  outstanding: number;
  setsWon: number;
  setsLost: number;
  gamesWon: number;
  gamesLost: number;
};

/** What earned a match's points: its result, and then any bonus the rules give on top. */
export type PointsFor = "result" | "sets" | "close_loss" | "convincing_win" | "unplayed";

/**
 * One match as it counts in an entry's row: who it was against, how it went,
 * and each thing that earned a point. A match not yet in the ledger counts for
 * nothing and is not listed.
 */
export type MatchPoints = {
  matchId: string;
  opponentId: string;
  result: "won" | "lost" | "unplayed";
  /** Null for a match that never happened. */
  outcome: Exclude<MatchOutcome, "unplayed"> | null;
  points: number;
  items: { for: PointsFor; points: number }[];
};

export type StandingsRow = Tally & {
  entryId: string;
  label: string;
  /** 1 is top. Null for an entry that is unranked or withdrawn. */
  position: number | null;
  /**
   * Unranked: played fewer than rules.minMatchesForRanking, so listed after
   * the ranked entries. Withdrawn: listed last, whatever its results.
   */
  standing: "ranked" | "unranked" | "withdrawn";
  /** Why this entry is below the one above it. Null at the top of each group. */
  separatedBy: Separator | null;
  /**
   * Where the points came from, match by match, in order of match id — for
   * UUIDv7 ids, the order the matches were made. With allPlayedBonus they add up to `points`, always: the table is
   * computed by adding these very items.
   */
  matches: MatchPoints[];
  /** rules.points.allPlayed, if the entry turned up to every match and all are in; otherwise 0. */
  allPlayedBonus: number;
};

export function computeStandings(input: StandingsInput): StandingsRow[] {
  const withdrawn = new Set(input.entries.filter((e) => e.withdrawn).map((e) => e.id));
  const tallies = new Map(input.entries.map((e) => [e.id, emptyTally()]));
  const ledgers = new Map<string, MatchPoints[]>(input.entries.map((e) => [e.id, []]));
  const bonuses = new Map<string, number>();
  const wins = new Map<string, number>(); // "winner|loser" → matches, for head-to-head
  const absent = new Set<string>(); // gave a walkover or conceded: forfeits the all-played bonus

  for (const match of input.matches) {
    const result = settle(match, withdrawn, input);
    if (result.kind === "ignore" || !match.side0 || !match.side1) continue;
    const sides = [tallies.get(match.side0), tallies.get(match.side1)] as const;
    if (!sides[0] || !sides[1]) continue; // an entry from outside this division
    const pair: [Tally, Tally] = [sides[0], sides[1]];

    if (result.kind === "outstanding") {
      pair[0].outstanding += 1;
      pair[1].outstanding += 1;
      continue;
    }

    // Each side's line for this match. Points reach the table only through
    // award(), so the lines always add up to it.
    const ids = [match.side0, match.side1] as const;
    const lines = ([0, 1] as const).map((i): MatchPoints => ({
      matchId: match.id,
      opponentId: ids[i === 0 ? 1 : 0],
      result: result.kind === "unplayed" ? "unplayed" : result.winner === i ? "won" : "lost",
      outcome: result.kind === "unplayed" ? null : result.outcome,
      points: 0,
      items: [],
    }));
    const award: Award = (side, reason, points) => {
      if (points === 0 && reason !== "result" && reason !== "unplayed") return;
      pair[side].points += points;
      lines[side]!.points += points;
      lines[side]!.items.push({ for: reason, points });
    };
    ledgers.get(ids[0])?.push(lines[0]!);
    ledgers.get(ids[1])?.push(lines[1]!);

    if (result.kind === "unplayed") {
      for (const side of [0, 1] as const) {
        pair[side].unplayed += 1;
        award(side, "unplayed", input.rules.points.unplayedBoth);
      }
    } else {
      apply(result, pair, input, award);
      const [winner, loser] = result.winner === 0 ? [match.side0, match.side1] : [match.side1, match.side0];
      wins.set(`${winner}|${loser}`, (wins.get(`${winner}|${loser}`) ?? 0) + 1);
      if (result.outcome === "walkover" || result.outcome === "conceded") absent.add(loser);
    }
  }

  // Turned up to every match, and every match is in: nothing outstanding,
  // nothing that never happened, no walkover given away.
  if (input.rules.points.allPlayed !== 0) {
    for (const [id, t] of tallies) {
      if (t.played > 0 && t.outstanding === 0 && t.unplayed === 0 && !absent.has(id)) {
        t.points += input.rules.points.allPlayed;
        bonuses.set(id, input.rules.points.allPlayed);
      }
    }
  }

  const criteria = criteriaFor(input.rules);
  const headToHead = (x: string, y: string) => (wins.get(`${x}|${y}`) ?? 0) - (wins.get(`${y}|${x}`) ?? 0);
  const labels = new Map(input.entries.map((e) => [e.id, e.label]));
  const tallyOf = (id: string) => tallies.get(id) ?? emptyTally();

  const byStanding = { ranked: [] as string[], unranked: [] as string[], withdrawn: [] as string[] };
  for (const e of input.entries) {
    const standing = e.withdrawn
      ? "withdrawn"
      : tallyOf(e.id).played >= input.rules.minMatchesForRanking
        ? "ranked"
        : "unranked";
    byStanding[standing].push(e.id);
  }

  const rows: StandingsRow[] = [];
  for (const standing of ["ranked", "unranked", "withdrawn"] as const) {
    const ordered = order(byStanding[standing], criteria, null, { tallyOf, headToHead, labels });
    ordered.forEach(({ id, separatedBy }, i) => {
      rows.push({
        entryId: id,
        label: labels.get(id) ?? "",
        position: standing === "ranked" ? i + 1 : null,
        standing,
        separatedBy,
        ...tallyOf(id),
        // By id, which for UUIDv7 is the order the matches were made, so the
        // lines read the same however the matches arrived.
        matches: (ledgers.get(id) ?? []).sort((x, y) => (x.matchId < y.matchId ? -1 : x.matchId > y.matchId ? 1 : 0)),
        allPlayedBonus: bonuses.get(id) ?? 0,
      });
    });
  }
  return rows;
}

// ── settling each match ─────────────────────────────────────────────────────

type Decided = {
  kind: "decided";
  outcome: Exclude<MatchOutcome, "unplayed">;
  winner: SideIndex;
  score: Score | null;
  retiredSide: SideIndex | null;
};
type Settled = { kind: "ignore" } | { kind: "outstanding" } | { kind: "unplayed" } | Decided;

/**
 * What a match is worth to the table. A match involving a withdrawn entry
 * follows rules.withdrawal: its played results stand or are ignored, and its
 * remaining fixtures go unplayed or become
 * walkovers to the opponent. Anything else not yet in the ledger is
 * outstanding until the deadline passes, then unplayed.
 */
function settle(match: StandingsMatch, withdrawn: ReadonlySet<string>, input: StandingsInput): Settled {
  if (!match.side0 || !match.side1) return { kind: "ignore" };
  const inLedger = match.status === "played";
  const w0 = withdrawn.has(match.side0);
  const w1 = withdrawn.has(match.side1);

  if (w0 || w1) {
    if (inLedger) return input.rules.withdrawal.playedMatches === "void" ? { kind: "ignore" } : fromLedger(match);
    if (w0 && w1) return { kind: "unplayed" };
    if (input.rules.withdrawal.remainingMatches === "walkover_to_opponent") {
      return { kind: "decided", outcome: "walkover", winner: w0 ? 1 : 0, score: null, retiredSide: w0 ? 0 : 1 };
    }
    return { kind: "unplayed" };
  }
  if (inLedger) return fromLedger(match);
  return input.deadlinePassed ? { kind: "unplayed" } : { kind: "outstanding" };
}

function fromLedger(match: StandingsMatch): Settled {
  if (match.outcome === null || match.outcome === "unplayed" || match.winningSide === null) {
    return { kind: "unplayed" };
  }
  return {
    kind: "decided",
    outcome: match.outcome,
    winner: match.winningSide,
    score: match.score,
    retiredSide: match.retiredSide,
  };
}

/** Gives one side of the match being counted some points, and says what for. */
type Award = (side: SideIndex, reason: PointsFor, points: number) => void;

function apply(result: Decided, sides: [Tally, Tally], input: StandingsInput, award: Award): void {
  const p = input.rules.points;
  const pointsFor: Record<Decided["outcome"], [winner: number, loser: number]> = {
    completed: [p.win, p.lossPlayed],
    retired: [p.retiredWin, p.retiredLoss],
    walkover: [p.walkoverWin, p.walkoverLoss],
    conceded: [p.concededWin, p.concededLoss],
  };
  const [forWinner, forLoser] = pointsFor[result.outcome];
  const loserSide: SideIndex = result.winner === 0 ? 1 : 0;
  const winner = sides[result.winner];
  const loser = sides[loserSide];
  winner.won += 1;
  award(result.winner, "result", forWinner);
  loser.lost += 1;
  award(loserSide, "result", forLoser);

  if (result.outcome === "walkover" || result.outcome === "conceded") {
    // Only the side that was there played: the other never took the court.
    winner.played += 1;
    // What it is worth in sets and games is the club's to decide. `nominal`
    // awards the whitewash it stands for, so a walkover counts in the set and
    // game tiebreaks; `none` leaves both columns alone.
    if ((input.rules.walkoverScore ?? "nominal") === "nominal") {
      const sets = input.format.setsToWin;
      const games = sets * input.format.set.gamesToWin;
      winner.setsWon += sets;
      winner.gamesWon += games;
      loser.setsLost += sets;
      loser.gamesLost += games;
    }
    return;
  }
  winner.played += 1;
  loser.played += 1;
  if (!result.score) return;
  // The same arithmetic that validated the score when it was entered, so an
  // unfinished set wins nobody a set and a champions tiebreak is one game.
  const counted = validateResult(
    { outcome: result.outcome, score: result.score, retiredSide: result.retiredSide },
    input.format,
  );
  sides[0].setsWon += counted.setsWon[0];
  sides[0].setsLost += counted.setsWon[1];
  sides[1].setsWon += counted.setsWon[1];
  sides[1].setsLost += counted.setsWon[0];
  sides[0].gamesWon += counted.gamesWon[0];
  sides[0].gamesLost += counted.gamesWon[1];
  sides[1].gamesWon += counted.gamesWon[1];
  sides[1].gamesLost += counted.gamesWon[0];

  // A retirement earns only its flat amount; a match played out earns its sets and margin too.
  if (result.outcome !== "completed") return;
  award(0, "sets", p.perSetWon * counted.setsWon[0]);
  award(1, "sets", p.perSetWon * counted.setsWon[1]);
  const margin = counted.gamesWon[result.winner] - counted.gamesWon[loserSide];
  if (p.closeLoss && margin <= p.closeLoss.withinGames) award(loserSide, "close_loss", p.closeLoss.points);
  if (p.convincingWin && margin >= p.convincingWin.byGames) award(result.winner, "convincing_win", p.convincingWin.points);
}

function emptyTally(): Tally {
  return {
    points: 0,
    played: 0,
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

// ── ordering ────────────────────────────────────────────────────────────────

type Criterion =
  | { name: Separator; kind: "value"; value: (t: Tally) => number }
  | { name: "head_to_head"; kind: "head_to_head" };

/** A share, won ÷ (won + lost), so it is defined even for an entry that never lost one. */
const share = (won: number, lost: number) => (won + lost === 0 ? 0 : won / (won + lost));

const VALUES: Record<Exclude<TiebreakRule, "head_to_head">, (t: Tally) => number> = {
  points: (t) => t.points,
  matches_won: (t) => t.won,
  matches_played: (t) => t.played,
  sets_won: (t) => t.setsWon,
  set_difference: (t) => t.setsWon - t.setsLost,
  set_ratio: (t) => share(t.setsWon, t.setsLost),
  games_won: (t) => t.gamesWon,
  game_difference: (t) => t.gamesWon - t.gamesLost,
  game_ratio: (t) => share(t.gamesWon, t.gamesLost),
};

const PRIMARY: Record<RulesSpec["scoringMode"], (t: Tally) => number> = {
  points: (t) => t.points,
  games_won: (t) => t.gamesWon,
  sets_won: (t) => t.setsWon,
};

/** The scoring mode first, then the club's tiebreaks in the order it listed them. */
function criteriaFor(rules: RulesSpec): Criterion[] {
  return [
    { name: rules.scoringMode, kind: "value", value: PRIMARY[rules.scoringMode] },
    ...rules.tiebreaks.map(
      (rule): Criterion =>
        rule === "head_to_head" ? { name: rule, kind: "head_to_head" } : { name: rule, kind: "value", value: VALUES[rule] },
    ),
  ];
}

type Ordering = {
  tallyOf: (id: string) => Tally;
  headToHead: (x: string, y: string) => number;
  labels: ReadonlyMap<string, string>;
};

const collator = new Intl.Collator("en-GB");

/**
 * Orders a group of entries that are level so far. Each criterion splits the
 * group into level sub-groups, highest first, and the next criterion orders
 * within those. Head-to-head applies only to a two-way tie; with three or more
 * level it is skipped. When nothing separates them, the name does, so a table
 * never reorders itself between two reads.
 */
function order(
  group: readonly string[],
  criteria: readonly Criterion[],
  firstSeparatedBy: Separator | null,
  o: Ordering,
): { id: string; separatedBy: Separator | null }[] {
  if (group.length <= 1) return group.map((id) => ({ id, separatedBy: firstSeparatedBy }));

  const [criterion, ...rest] = criteria;
  if (!criterion) {
    const byName = [...group].sort(
      (a, b) => collator.compare(o.labels.get(a) ?? "", o.labels.get(b) ?? "") || (a < b ? -1 : 1),
    );
    return byName.map((id, i) => ({ id, separatedBy: i === 0 ? firstSeparatedBy : "name" }));
  }

  if (criterion.kind === "head_to_head") {
    const [x, y] = group;
    const edge = group.length === 2 && x && y ? o.headToHead(x, y) : 0;
    if (edge === 0) return order(group, rest, firstSeparatedBy, o);
    const [first, second] = edge > 0 ? [x!, y!] : [y!, x!];
    return [
      { id: first, separatedBy: firstSeparatedBy },
      { id: second, separatedBy: "head_to_head" },
    ];
  }

  const levels = new Map<number, string[]>();
  for (const id of group) {
    const v = criterion.value(o.tallyOf(id));
    levels.set(v, [...(levels.get(v) ?? []), id]);
  }
  return [...levels.entries()]
    .sort(([a], [b]) => b - a)
    .flatMap(([, level], i) => order(level, rest, i === 0 ? firstSeparatedBy : criterion.name, o));
}
