import type { Score } from "@deuceleague/schema";
export type LedgerMatch = { id: string; divisionId: string | null; side0: string | null; side1: string | null;
  status: string; outcome: string | null; winningSide: number | null; retiredSide: number | null; score: Score | null };
export type ProgressCounts = { matches: number; played: number; outstanding: number; reported: number; disputed: number; percentPlayed: number | null };
export type ChaseRow = { competitionId: string; competitionName: string; divisionId: string; divisionName: string;
  divisionOrdinal: number; memberId: string; displayName: string; email?: string | null; outstandingMatches: number;
  needsPlaying: number; awaitingYou: number; awaitingThem: number; daysRemaining: number | null; waitingOn: string[] };
