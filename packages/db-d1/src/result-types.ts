import type { MatchFormat, Score } from "@deuceleague/schema";

/** Persistence records used by the shared result decision and response code. */
export type MatchRecord = {
  id: string; clubId: string; competitionId: string; divisionId: string | null;
  competitionName: string; divisionName: string | null;
  status: string; outcome: string | null; score: Score | null;
  winningSide: number | null; retiredSide: number | null; playedOn: string | null;
  acceptedSubmissionId: string | null; createdAt: Date; updatedAt: Date;
  sides: { sideIndex: number; entryId: string | null; label: string | null }[];
};
export type ClaimRecord = {
  id: string; clubId: string; matchId: string; sideIndex: number | null;
  outcome: string; score: Score | null; retiredSide: number | null; playedOn: string | null;
  state: string; source: string; rawInput: string | null; submittedByMemberId: string | null;
  acceptsSubmissionId: string | null; submittedAt: Date; confirmedAt: Date | null;
};
export type ResultContext = {
  match: MatchRecord;
  claims: ClaimRecord[];
  competition: { state: string; visibility: string; matchFormat: MatchFormat };
  deadline: Date | null;
  ownSide: number | null;
  memberId: string | null;
  now: Date;
};
export type LedgerEntry = {
  outcome: string; score: Score | null; winningSide: number | null;
  retiredSide: number | null; playedOn: string | null; claimId: string;
};
export type ResultEvent = { type: string; payload: object };
export type ResultMutation = {
  claim: ClaimRecord;
  supersede: string[];
  confirm: string[];
  status: "reported" | "disputed" | "played";
  ledger: LedgerEntry | null;
  events: ResultEvent[];
  /** Only side submissions obey the season deadline. */
  enforceDeadline: boolean;
};
