import { asc, eq, max, sql } from "drizzle-orm";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { division, entry, match } from "./schema.js";

export type DivisionRecord = typeof division.$inferSelect;

export type DivisionChanges = Partial<{ ordinal: number; name: string; targetSize: number | null }>;

/** A competition's divisions, top first. A handful at most, so never paged. */
export async function listDivisions(tx: Tx, competitionId: string): Promise<DivisionRecord[]> {
  return tx.select().from(division).where(eq(division.competitionId, competitionId)).orderBy(asc(division.ordinal));
}

export async function getDivision(tx: Tx, divisionId: string): Promise<DivisionRecord | null> {
  const [row] = await tx.select().from(division).where(eq(division.id, divisionId));
  return row ?? null;
}

/** The ordinal a new division takes when none is given: one below the lowest. */
export async function nextOrdinal(tx: Tx, competitionId: string): Promise<number> {
  const [row] = await tx
    .select({ lowest: max(division.ordinal) })
    .from(division)
    .where(eq(division.competitionId, competitionId));
  return (row?.lowest ?? 0) + 1;
}

export async function createDivision(
  tx: Tx,
  clubId: string,
  input: { competitionId: string; ordinal: number; name: string; targetSize: number | null },
): Promise<DivisionRecord> {
  const [row] = await tx
    .insert(division)
    .values({ ...input, id: uuidv7(), clubId })
    .returning();
  return row!;
}

export async function updateDivision(tx: Tx, divisionId: string, changes: DivisionChanges): Promise<DivisionRecord> {
  const [row] = await tx
    .update(division)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(eq(division.id, divisionId))
    .returning();
  return row!;
}

/** Whether anything sits in a division: an entry or a match. */
export async function divisionInUse(tx: Tx, divisionId: string): Promise<boolean> {
  const [used] = await tx
    .select({ id: entry.id })
    .from(entry)
    .where(eq(entry.divisionId, divisionId))
    .union(tx.select({ id: match.id }).from(match).where(eq(match.divisionId, divisionId)))
    .limit(1);
  return used !== undefined;
}

/** Deletes a division. Only ever one with nothing in it: see divisionInUse. */
export async function deleteDivision(tx: Tx, divisionId: string): Promise<void> {
  await tx.delete(division).where(eq(division.id, divisionId));
}
