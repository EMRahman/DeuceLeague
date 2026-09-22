import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { toPage, type Page, type PageRequest } from "./lists.js";
import { competition, season } from "./schema.js";

export type SeasonRecord = typeof season.$inferSelect;

export type SeasonChanges = Partial<{
  name: string;
  kind: string | null;
  year: number | null;
  startsOn: string | null;
  endsOn: string | null;
  resultsDeadlineAt: Date | null;
  state: string;
}>;

export async function listSeasons(
  tx: Tx,
  options: { state: string | undefined } & PageRequest,
): Promise<Page<SeasonRecord>> {
  const rows = await tx
    .select()
    .from(season)
    .where(
      and(
        options.after ? gt(season.id, options.after) : undefined,
        options.state ? eq(season.state, options.state) : undefined,
      ),
    )
    .orderBy(asc(season.id))
    .limit(options.limit + 1);
  return toPage(rows, options.limit);
}

export async function getSeason(tx: Tx, seasonId: string): Promise<SeasonRecord | null> {
  const [row] = await tx.select().from(season).where(eq(season.id, seasonId));
  return row ?? null;
}

export async function createSeason(
  tx: Tx,
  clubId: string,
  input: SeasonChanges & { name: string },
): Promise<SeasonRecord> {
  const [row] = await tx
    .insert(season)
    .values({ ...input, id: uuidv7(), clubId })
    .returning();
  return row!;
}

export async function updateSeason(tx: Tx, seasonId: string, changes: SeasonChanges): Promise<SeasonRecord> {
  const [row] = await tx
    .update(season)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(eq(season.id, seasonId))
    .returning();
  return row!;
}

/** Whether a competition in this season is being played, which pins the season to `active`. */
export async function seasonHasActiveCompetition(tx: Tx, seasonId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: competition.id })
    .from(competition)
    .where(and(eq(competition.seasonId, seasonId), eq(competition.state, "active")))
    .limit(1);
  return row !== undefined;
}
