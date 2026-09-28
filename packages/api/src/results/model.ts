import type { MatchRecord, ClaimRecord } from "@deuceleague/db-d1";
import { judgeClaims, type Claim } from "@deuceleague/engine";
import { validateResult, type MatchOutcome, type MatchStatus, type Score, type SideIndex, type SubmissionSource, type SubmissionState, type MatchFormat, type ValidatedResult } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import type { Result, Match, ClaimOut, MatchDetail } from "../contracts/matches.js";
import { iso } from "../contracts/shared.js";
import { problems } from "../problems.js";

function toResult(m: MatchRecord): z.infer<typeof Result> | null {
  if (m.status !== "played" || !m.outcome || !m.acceptedSubmissionId) return null;
  return {
    outcome: m.outcome as MatchOutcome,
    score: m.score,
    winning_side: m.winningSide as SideIndex | null,
    retired_side: m.retiredSide as SideIndex | null,
    played_on: m.playedOn,
    claim_id: m.acceptedSubmissionId,
  };
}

export function toMatch(m: MatchRecord): z.infer<typeof Match> {
  return {
    id: m.id,
    competition_id: m.competitionId,
    division_id: m.divisionId,
    status: m.status as MatchStatus,
    sides: m.sides.map((s) => ({ side: s.sideIndex as SideIndex, entry_id: s.entryId, label: s.label })),
    result: toResult(m),
    created_at: iso(m.createdAt),
    updated_at: iso(m.updatedAt),
  };
}

/** A claim as the caller sees it. What was typed is kept from players: it can say anything, about anyone. */
function toClaim(c: ClaimRecord, forPlayer: boolean): z.infer<typeof ClaimOut> {
  return {
    id: c.id,
    side: c.sideIndex as SideIndex | null,
    outcome: c.outcome as MatchOutcome,
    score: c.score,
    retired_side: c.retiredSide as SideIndex | null,
    played_on: c.playedOn,
    state: c.state as SubmissionState,
    source: c.source as SubmissionSource,
    accepts_claim_id: c.acceptsSubmissionId,
    submitted_at: iso(c.submittedAt),
    confirmed_at: iso(c.confirmedAt),
    raw_input: forPlayer ? null : c.rawInput,
  };
}

/** A stored claim, as the engine compares it. */
export function asClaim(c: { outcome: string; score: Score | null; retiredSide: number | null }): Claim {
  return { outcome: c.outcome as MatchOutcome, score: c.score, retiredSide: c.retiredSide as SideIndex | null };
}

/** The result a played match holds, as the engine compares claims. */
export function ledgerClaim(m: MatchRecord): Claim {
  return asClaim({ outcome: m.outcome ?? "unplayed", score: m.score, retiredSide: m.retiredSide });
}

/** The two sides' live claims: each side holds at most one. */
export function liveClaims(claims: ClaimRecord[]): [ClaimRecord | null, ClaimRecord | null] {
  const live = (side: number) => claims.find((c) => c.state === "pending" && c.sideIndex === side) ?? null;
  return [live(0), live(1)];
}

export function checkResult(
  body: { outcome: MatchOutcome; score?: Score | null | undefined; retired_side?: SideIndex | null | undefined },
  format: MatchFormat,
): { claim: Claim; checked: ValidatedResult } {
  const claim: Claim = { outcome: body.outcome, score: body.score ?? null, retiredSide: body.retired_side ?? null };
  const checked = validateResult(claim, format);
  if (!checked.ok) throw problems.validation(checked.errors.map((message) => ({ path: "", message })));
  return { claim, checked };
}

/** What the ledger records for an agreed result. The score is kept only for a match that was played. */
export function ledgerEntry(claim: Claim, checked: ValidatedResult, playedOn: string | null, claimId: string) {
  const played = claim.outcome === "completed" || claim.outcome === "retired";
  return {
    outcome: claim.outcome,
    score: played ? claim.score : null,
    winningSide: checked.winningSide,
    retiredSide: claim.retiredSide,
    playedOn,
    claimId,
  };
}


export function matchDetail(match: MatchRecord, claims: ClaimRecord[], forPlayer: boolean): z.infer<typeof MatchDetail> {
  const [side0, side1] = liveClaims(claims);
  const verdict = match.status === "played" ? null : judgeClaims(side0 && asClaim(side0), side1 && asClaim(side1));
  return {
    ...toMatch(match), claims: claims.map((claim) => toClaim(claim, forPlayer)),
    waiting_on: verdict?.status === "reported" ? verdict.waitingOn : null,
    differences: verdict?.status === "disputed" ? verdict.differences : [],
  };
}
