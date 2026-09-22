import type { Score } from "@deuceleague/schema";
import { and, asc, eq, gt, inArray, ne, sql, type SQL } from "drizzle-orm";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { toPage, type Page, type PageRequest } from "./lists.js";
import { match, matchSide, resultSubmission } from "./schema.js";

export type MatchRecord = typeof match.$inferSelect & {
  /** Side 0 then side 1: the entry drawn to play each, and how it is written. */
  sides: { sideIndex: number; entryId: string | null; label: string | null }[];
};

/** A claim, as result_submission stores it. */
export type ClaimRecord = typeof resultSubmission.$inferSelect;

async function withSides(tx: Tx, rows: (typeof match.$inferSelect)[]): Promise<MatchRecord[]> {
  if (rows.length === 0) return [];
  const sides = await tx
    .select({
      matchId: matchSide.matchId,
      sideIndex: matchSide.sideIndex,
      entryId: matchSide.entryId,
      // Written out rather than interpolated: drizzle renders a lone column unqualified, and
      // entry_label has an entry_id of its own, which the subquery would compare with itself.
      label: sql<string | null>`(select el.label from entry_label el where el.entry_id = match_side.entry_id)`,
    })
    .from(matchSide)
    .where(inArray(matchSide.matchId, rows.map((m) => m.id)))
    .orderBy(asc(matchSide.sideIndex));
  return rows.map((m) => ({
    ...m,
    sides: sides
      .filter((s) => s.matchId === m.id)
      .map((s) => ({ sideIndex: s.sideIndex, entryId: s.entryId, label: s.label })),
  }));
}

export async function listMatches(
  tx: Tx,
  options: {
    competitionId: string | undefined;
    divisionId: string | undefined;
    entryId: string | undefined;
    status: string | undefined;
  } & PageRequest,
): Promise<Page<MatchRecord>> {
  const where: (SQL | undefined)[] = [
    options.after ? gt(match.id, options.after) : undefined,
    options.competitionId ? eq(match.competitionId, options.competitionId) : undefined,
    options.divisionId ? eq(match.divisionId, options.divisionId) : undefined,
    options.status ? eq(match.status, options.status) : undefined,
    options.entryId
      ? inArray(match.id, tx.select({ id: matchSide.matchId }).from(matchSide).where(eq(matchSide.entryId, options.entryId)))
      : undefined,
  ];
  const rows = await tx
    .select()
    .from(match)
    .where(and(...where))
    .orderBy(asc(match.id))
    .limit(options.limit + 1);
  const page = toPage(rows, options.limit);
  return { rows: await withSides(tx, page.rows), next: page.next };
}

/**
 * One match. With `lock`, the row stays locked until the transaction ends, so
 * two claims on the same match are judged one after the other: without it,
 * both sides reporting at once would each miss the other's claim.
 */
export async function getMatch(tx: Tx, matchId: string, options: { lock?: boolean } = {}): Promise<MatchRecord | null> {
  const query = tx.select().from(match).where(eq(match.id, matchId));
  const [row] = options.lock ? await query.for("update") : await query;
  if (!row) return null;
  const [withSidesRow] = await withSides(tx, [row]);
  return withSidesRow ?? null;
}

/** Every claim ever made about a match, oldest first. */
export async function listClaims(tx: Tx, matchId: string): Promise<ClaimRecord[]> {
  return tx
    .select()
    .from(resultSubmission)
    .where(eq(resultSubmission.matchId, matchId))
    .orderBy(asc(resultSubmission.submittedAt), asc(resultSubmission.id));
}

export type NewClaim = {
  matchId: string;
  /** Null only for a coach entry, which speaks for the match. */
  sideIndex: number | null;
  outcome: string;
  score: Score | null;
  retiredSide: number | null;
  playedOn: string | null;
  state: "pending" | "confirmed";
  acceptsSubmissionId: string | null;
  source: string;
  rawInput: string | null;
  submittedByMemberId: string | null;
};

export async function insertClaim(tx: Tx, clubId: string, claim: NewClaim): Promise<ClaimRecord> {
  const [row] = await tx
    .insert(resultSubmission)
    .values({
      ...claim,
      id: uuidv7(),
      clubId,
      confirmedAt: claim.state === "confirmed" ? sql`now()` : null,
    })
    .returning();
  return row!;
}

/** Confirms claims: they are what put the result in the ledger. */
export async function confirmClaims(tx: Tx, claimIds: string[]): Promise<void> {
  if (claimIds.length === 0) return;
  await tx
    .update(resultSubmission)
    .set({ state: "confirmed", confirmedAt: sql`now()` })
    .where(inArray(resultSubmission.id, claimIds));
}

/** Marks claims replaced. They are kept: nothing about a result is ever deleted. */
export async function supersedeClaims(tx: Tx, claimIds: string[]): Promise<void> {
  if (claimIds.length === 0) return;
  await tx.update(resultSubmission).set({ state: "superseded" }).where(inArray(resultSubmission.id, claimIds));
}

/** Every claim on a match still standing, pending or confirmed — what a coach entry replaces. */
export async function standingClaimIds(tx: Tx, matchId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: resultSubmission.id })
    .from(resultSubmission)
    .where(and(eq(resultSubmission.matchId, matchId), ne(resultSubmission.state, "superseded")));
  return rows.map((r) => r.id);
}

/** A match still out of the ledger: waiting on one side, or disputed. */
export async function setMatchStatus(tx: Tx, matchId: string, status: "reported" | "disputed"): Promise<void> {
  await tx.update(match).set({ status, updatedAt: sql`now()` }).where(eq(match.id, matchId));
}

/**
 * Puts a result in the ledger. `claimId` is the claim that settled it — the
 * second of two matching reports, an acceptance, or a coach entry — and the
 * database refuses a played match without one.
 */
export async function recordResult(
  tx: Tx,
  matchId: string,
  result: {
    outcome: string;
    score: Score | null;
    winningSide: number | null;
    retiredSide: number | null;
    playedOn: string | null;
    claimId: string;
  },
): Promise<void> {
  await tx
    .update(match)
    .set({
      status: "played",
      outcome: result.outcome,
      score: result.score,
      winningSide: result.winningSide,
      retiredSide: result.retiredSide,
      playedOn: result.playedOn,
      acceptedSubmissionId: result.claimId,
      updatedAt: sql`now()`,
    })
    .where(eq(match.id, matchId));
}
