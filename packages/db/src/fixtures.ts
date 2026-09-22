import { sql } from "drizzle-orm";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { match, matchSide } from "./schema.js";

/** A fixture to store: the two entries, and the key that makes storing it idempotent. */
export type NewFixture = { side0: string; side1: string; pairingKey: string };

/**
 * Stores fixtures as open matches, each with its two sides, and returns the
 * ones that were new. A pairing the division already has — played, open or
 * void — is left alone: the pairing key is unique per division, so running
 * this again after a late entry adds only the missing pairings.
 */
export async function insertFixtures(
  tx: Tx,
  scope: { clubId: string; competitionId: string; divisionId: string },
  fixtures: readonly NewFixture[],
): Promise<(NewFixture & { matchId: string })[]> {
  if (fixtures.length === 0) return [];
  const inserted = await tx
    .insert(match)
    .values(fixtures.map((f) => ({ ...scope, id: uuidv7(), status: "open", pairingKey: f.pairingKey })))
    .onConflictDoNothing({ target: [match.divisionId, match.pairingKey], where: sql`pairing_key is not null` })
    .returning({ id: match.id, pairingKey: match.pairingKey });

  const byKey = new Map(fixtures.map((f) => [f.pairingKey, f]));
  const created = inserted.map((m) => ({ ...byKey.get(m.pairingKey!)!, matchId: m.id }));
  if (created.length === 0) return [];

  await tx.insert(matchSide).values(
    created.flatMap((f) => [
      { id: uuidv7(), clubId: scope.clubId, matchId: f.matchId, competitionId: scope.competitionId, sideIndex: 0, entryId: f.side0 },
      { id: uuidv7(), clubId: scope.clubId, matchId: f.matchId, competitionId: scope.competitionId, sideIndex: 1, entryId: f.side1 },
    ]),
  );
  return created;
}
