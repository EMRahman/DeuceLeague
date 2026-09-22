import type { MatchFormat, Outcome, Score, Side } from "./api.js";

/**
 * The score form, and scores read out. A player enters games as "mine" and
 * "theirs", which is how people remember a match; the API wants side 0 first,
 * so this turns one into the other. It checks only what a form can get wrong —
 * whether a score is legal is the API's to say, against the competition's format.
 */

/** One row per set that could be played, the last named for what it is. */
export function setRows(format: MatchFormat): { n: number; label: string }[] {
  const count = format.setsToWin * 2 - 1;
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    const final = n === count && count > 1;
    return { n, label: final && format.finalSet.type === "champions_tiebreak" ? "Match tiebreak" : `Set ${n}` };
  });
}

export const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "completed", label: "We played it out" },
  { value: "retired", label: "Someone retired part-way" },
  { value: "walkover", label: "Walkover: someone did not turn up" },
  { value: "conceded", label: "Someone conceded without playing" },
];

/** Which outcomes carry a score, and which need to say who stopped. */
const SCORED: Outcome[] = ["completed", "retired"];
const SOMEONE_STOPPED: Outcome[] = ["retired", "walkover", "conceded"];

export type ReportForm = {
  outcome: Outcome;
  score: Score | null;
  retired_side: Side | null;
  played_on?: string;
};

type Parsed = { ok: true; report: ReportForm } | { ok: false; errors: string[] };

/** Reads a submitted score form, for the side `mine`. */
export function readReportForm(form: Record<string, string>, mine: Side, format: MatchFormat): Parsed {
  const theirs: Side = mine === 0 ? 1 : 0;
  const outcome = OUTCOMES.find((o) => o.value === form.outcome)?.value;
  if (!outcome) return { ok: false, errors: ["Say how the match ended."] };

  const errors: string[] = [];
  let retired_side: Side | null = null;
  if (SOMEONE_STOPPED.includes(outcome)) {
    if (form.stopped === "me") retired_side = mine;
    else if (form.stopped === "them") retired_side = theirs;
    else errors.push("Say who retired, conceded or did not turn up.");
  }

  let score: Score | null = null;
  if (SCORED.includes(outcome)) {
    const sets: Score["sets"] = [];
    for (const { n, label } of setRows(format)) {
      const a = (form[`mine_${n}`] ?? "").trim();
      const b = (form[`theirs_${n}`] ?? "").trim();
      if (a === "" && b === "") continue;
      const my = Number(a);
      const their = Number(b);
      if (a === "" || b === "" || !Number.isInteger(my) || !Number.isInteger(their) || my < 0 || their < 0) {
        errors.push(`${label}: enter both scores, as whole numbers.`);
        continue;
      }
      sets.push({ games: mine === 0 ? [my, their] : [their, my] });
    }
    if (sets.length === 0 && outcome === "completed") errors.push("Enter the score.");
    // A match retired before a game was finished has no score to give.
    score = sets.length === 0 ? null : { sets };
  }

  const played_on = /^\d{4}-\d{2}-\d{2}$/.test(form.played_on ?? "") ? form.played_on : undefined;
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, report: { outcome, score, retired_side, ...(played_on ? { played_on } : {}) } };
}

/** A score from one side's point of view: "6-4, 3-6, 10-7". */
export function scoreLine(score: Score | null, from: Side = 0): string {
  if (!score) return "";
  return score.sets.map(({ games: [a, b] }) => (from === 0 ? `${a}-${b}` : `${b}-${a}`)).join(", ");
}

/** A result or claim in words, from one side's point of view. */
export function describe(
  claim: { outcome: Outcome; score: Score | null; retired_side: Side | null },
  from: Side,
  names: [string, string],
): string {
  const stopped = claim.retired_side === null ? "" : names[claim.retired_side];
  const line = scoreLine(claim.score, from);
  switch (claim.outcome) {
    case "completed":
      return line;
    case "retired":
      return `${line}${line ? ", " : ""}${stopped} retired`;
    case "walkover":
      return `Walkover: ${stopped} did not turn up`;
    case "conceded":
      return `${stopped} conceded`;
    case "unplayed":
      return "Not played";
  }
}

/** A played-on date as a player reads it: "14 Sep 2026". Dates are calendar days, so no time zone moves them. */
export function playedOn(date: string | null | undefined): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
