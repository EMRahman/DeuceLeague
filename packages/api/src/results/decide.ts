import type { ClaimRecord, LedgerEntry, ResultContext, ResultMutation, ResultEvent } from "@deuceleague/db-d1";
import { compareClaims, judgeClaims } from "@deuceleague/engine";
import type { SideIndex } from "@deuceleague/schema";
import type { z } from "@hono/zod-openapi";
import type { NewClaim, Settlement } from "../contracts/matches.js";
import { iso } from "../contracts/shared.js";
import { problems } from "../problems.js";
import { asClaim, checkResult, ledgerClaim, ledgerEntry, liveClaims } from "./model.js";

export type ResultAction =
  | { type: "report"; body: z.infer<typeof NewClaim> }
  | { type: "settle"; body: z.infer<typeof Settlement> };

export function deadlinePassed(deadline: Date): never {
  throw problems.conflict("deadline_passed", "The results deadline has passed",
    `Results were taken until ${iso(deadline)}. The coach can settle this match, or move the season's deadline.`);
}

export function visibleToPlayer(competition: ResultContext["competition"]): boolean {
  return competition.visibility === "members" && competition.state !== "draft";
}

/** Pure, shared decision. Persistence supplies one consistent state and a new
 * id; the result describes all changes and events, or null for an exact retry.
 * A D1 conflict reruns this function with fresh state, never just its writes. */
export function decideResult(state: ResultContext, action: ResultAction, id: string): ResultMutation | null {
  const { match, competition, claims, memberId, ownSide, deadline, now } = state;
  if (memberId !== null && !visibleToPlayer(competition)) throw problems.notFound("match");
  if (competition.state !== "active") {
    throw problems.conflict("competition_not_active", `The competition is ${competition.state}`,
      "Results are recorded while a competition is active.");
  }
  const checkDeadline = () => { if (deadline !== null && deadline.getTime() <= now.getTime()) deadlinePassed(deadline); };
  const newClaim = (fields: Pick<ClaimRecord, "sideIndex" | "outcome" | "score" | "retiredSide" | "playedOn" | "state" | "source" | "rawInput" | "acceptsSubmissionId">): ClaimRecord => ({
    ...fields, id, clubId: match.clubId, matchId: match.id, submittedByMemberId: memberId,
    submittedAt: now, confirmedAt: fields.state === "confirmed" ? now : null,
  });
  const announce = (how: "agreed" | "settled", entry: LedgerEntry, replaces: string | null): ResultEvent => ({
    type: "match.result.confirmed",
    payload: {
      claim_id: entry.claimId, how, competition_id: match.competitionId, division_id: match.divisionId,
      outcome: entry.outcome, score: entry.score, winning_side: entry.winningSide,
      retired_side: entry.retiredSide, played_on: entry.playedOn, ...(replaces ? { replaces } : {}),
    },
  });
  const source = memberId === null ? "api" : "web";
  if (action.type === "report") {
    const { body } = action;
    let side: SideIndex;
    if (memberId === null) {
      if (body.side === undefined) throw problems.validation([{ path: "side", message: "required with an API key: the side the claim is for" }]);
      side = body.side;
    } else {
      if (ownSide === null) throw problems.notYourMatch();
      if (body.side !== undefined && body.side !== ownSide) {
        throw problems.notYourSide(`You play on side ${ownSide}; a player reports only for their own side.`);
      }
      side = ownSide as SideIndex;
    }
    checkDeadline();
    const { claim, checked } = checkResult(body, competition.matchFormat);
    if (match.status === "played") {
      if (compareClaims(ledgerClaim(match), claim).length === 0) return null;
      throw problems.conflict("already_played", "The result is already in the ledger",
        "Both sides agreed it, or the coach settled it. Only the coach can change it now.");
    }
    const live = liveClaims(claims);
    const mine = live[side];
    const theirs = live[side === 0 ? 1 : 0];
    if (mine && compareClaims(asClaim(mine), claim).length === 0 && (body.played_on ?? mine.playedOn) === mine.playedOn) return null;
    const created = newClaim({ sideIndex: side, ...claim, playedOn: body.played_on ?? null,
      state: "pending", acceptsSubmissionId: null, source: body.source ?? source, rawInput: body.raw_input ?? null });
    const other = theirs && asClaim(theirs);
    const verdict = side === 0 ? judgeClaims(claim, other) : judgeClaims(other, claim);
    const events: ResultEvent[] = [{ type: "match.claim.reported", payload: { claim_id: id, side, replaces: mine?.id ?? null } }];
    const ledger = verdict.status === "played" ? ledgerEntry(claim, checked, created.playedOn ?? theirs!.playedOn, id) : null;
    if (ledger) events.push(announce("agreed", ledger, null));
    else if (verdict.status === "disputed") events.push({ type: "match.disputed", payload: { differences: verdict.differences } });
    return {
      claim: created, supersede: mine ? [mine.id] : [], confirm: ledger ? [id, theirs!.id] : [],
      status: ledger ? "played" : verdict.status === "disputed" ? "disputed" : "reported",
      ledger, events, enforceDeadline: true,
    };
  }
  const { body } = action;
  const { claim, checked } = checkResult(body, competition.matchFormat);
  const playedOn = body.played_on ?? match.playedOn;
  if (match.status === "played" && compareClaims(ledgerClaim(match), claim).length === 0 && playedOn === match.playedOn) return null;
  if (match.status === "played" && !body.override) {
    throw problems.conflict("already_agreed", "This result is already confirmed",
      "Replacing a confirmed result requires an explicit coach override: send override: true.");
  }
  const created = newClaim({ sideIndex: null, ...claim, playedOn: body.played_on ?? null, state: "confirmed",
    acceptsSubmissionId: null, source: "coach_entry", rawInput: body.raw_input ?? null });
  const ledger = ledgerEntry(claim, checked, playedOn, id);
  const event = announce("settled", ledger, match.acceptedSubmissionId);
  return { claim: created, supersede: claims.filter((c) => c.state !== "superseded").map((c) => c.id), confirm: [],
    status: "played", ledger, events: [{ ...event, payload: { ...event.payload, ...(body.reason ? { reason: body.reason } : {}) } }], enforceDeadline: false };
}
