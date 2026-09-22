import type { MatchFormat, RulesSpec } from "@deuceleague/schema";
import { and, asc, count, eq, gt, ne, sql, type SQL } from "drizzle-orm";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { toPage, type Page, type PageRequest } from "./lists.js";
import { competition, entry } from "./schema.js";

export type CompetitionRecord = typeof competition.$inferSelect;

export type CompetitionChanges = Partial<{
  name: string;
  discipline: string;
  category: string;
  matchFormat: MatchFormat;
  rules: RulesSpec;
  sequenceInSeason: number;
  previousCompetitionId: string | null;
  state: string;
  visibility: string;
}>;

/**
 * The competitions a player's session may see: those open to members, once
 * the coach has activated them. A private one is the coach's alone, and a
 * draft is the coach's working copy — next season's placements before the
 * coach has decided them.
 */
export function visibleToPlayers(): SQL {
  return and(eq(competition.visibility, "members"), ne(competition.state, "draft"))!;
}

/** Whether a player's session may see this competition. The same rule as visibleToPlayers(). */
export function isVisibleToPlayers(c: Pick<CompetitionRecord, "visibility" | "state">): boolean {
  return c.visibility === "members" && c.state !== "draft";
}

export async function listCompetitions(
  tx: Tx,
  options: { seasonId: string | undefined; state: string | undefined; forPlayer: boolean } & PageRequest,
): Promise<Page<CompetitionRecord>> {
  const rows = await tx
    .select()
    .from(competition)
    .where(
      and(
        options.after ? gt(competition.id, options.after) : undefined,
        options.seasonId ? eq(competition.seasonId, options.seasonId) : undefined,
        options.state ? eq(competition.state, options.state) : undefined,
        options.forPlayer ? visibleToPlayers() : undefined,
      ),
    )
    .orderBy(asc(competition.id))
    .limit(options.limit + 1);
  return toPage(rows, options.limit);
}

export async function getCompetition(tx: Tx, competitionId: string): Promise<CompetitionRecord | null> {
  const [row] = await tx.select().from(competition).where(eq(competition.id, competitionId));
  return row ?? null;
}

export async function createCompetition(
  tx: Tx,
  clubId: string,
  input: CompetitionChanges & {
    seasonId: string;
    name: string;
    discipline: string;
    matchFormat: MatchFormat;
    rules: RulesSpec;
  },
): Promise<CompetitionRecord> {
  const [row] = await tx
    .insert(competition)
    .values({ ...input, id: uuidv7(), clubId })
    .returning();
  return row!;
}

export async function updateCompetition(
  tx: Tx,
  competitionId: string,
  changes: CompetitionChanges,
): Promise<CompetitionRecord> {
  const [row] = await tx
    .update(competition)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(eq(competition.id, competitionId))
    .returning();
  return row!;
}

/** How many entries a competition has, withdrawn ones included. */
export async function countEntries(tx: Tx, competitionId: string): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(entry).where(eq(entry.competitionId, competitionId));
  return row?.n ?? 0;
}
