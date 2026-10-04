import { readReportForm, type Competition, type MatchDetail, type ReportForm } from "@deuceleague/website";

export const REASONS = [
  { value: "no_response", label: "One side has not responded" },
  { value: "conflicting_entries", label: "The sides entered different results" },
  { value: "incorrect_result", label: "The confirmed result is incorrect" },
  { value: "unreported_result", label: "Neither side has entered the result" },
] as const;

export type CoachSettlement = ReportForm & { reason: typeof REASONS[number]["value"] };
export type SettlementPreview = {
  version: string;
  match: MatchDetail;
  result: Omit<NonNullable<MatchDetail["result"]>, "claim_id">;
  requires_override: boolean;
  effects: {
    side: 0 | 1; entry_id: string | null; label: string;
    points_before: number; points_after: number; played_before: number; played_after: number;
    minimum: number; withdrawn: boolean;
  }[];
};

export function readSettlementForm(form: Record<string, string>, competition: Competition):
  { ok: true; body: CoachSettlement } | { ok: false; errors: string[] } {
  const reason = REASONS.find((r) => r.value === form.reason);
  if (!reason) return { ok: false, errors: ["Choose why you are deciding this result."] };
  if (form.played_on && (!/^\d{4}-\d{2}-\d{2}$/.test(form.played_on)
    || !Number.isFinite(Date.parse(form.played_on)) || new Date(form.played_on).toISOString().slice(0, 10) !== form.played_on)) {
    return { ok: false, errors: ["Enter a valid date, or leave it blank."] };
  }
  const read = form.outcome === "unplayed"
    ? { ok: true as const, report: { outcome: "unplayed" as const, score: null, retired_side: null,
      ...(form.played_on ? { played_on: form.played_on } : {}) } }
    : readReportForm(form, 0, competition.match_format);
  return read.ok ? { ok: true, body: { ...read.report, reason: reason.value } } : read;
}

/** What the coach is told about two entries that are the same score reversed. */
export const MIRRORED = "These are the same score reversed: one side may have entered its own games first.";

type Entered = Pick<MatchDetail["claims"][number], "outcome" | "score" | "retired_side">;

/**
 * Whether two entries are the same score reversed: what one side writes when it
 * puts its own games first. Same outcome and stopped side, every set swapped,
 * and not simply equal.
 */
export function mirrored(a: Entered | undefined, b: Entered | undefined): boolean {
  if (!a?.score || !b?.score || a.outcome !== b.outcome || a.retired_side !== b.retired_side) return false;
  const [x, y] = [a.score.sets, b.score.sets];
  return x.length === y.length
    && x.every((set, i) => set.games[0] === y[i]!.games[1] && set.games[1] === y[i]!.games[0])
    && x.some((set) => set.games[0] !== set.games[1]);
}
