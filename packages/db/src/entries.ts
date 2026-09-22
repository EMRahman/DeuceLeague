import { and, asc, desc, eq, inArray, ne, notExists, sql, type SQL } from "drizzle-orm";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { entry, entryMember, match, matchSide, member, resultSubmission } from "./schema.js";

export type EntryRecord = typeof entry.$inferSelect & {
  /** As the entry_label view writes it: the entry's own name, or its members' display names. */
  label: string;
  /** Player first, then partner, in the same order as the label. */
  members: { id: string; displayName: string; role: string }[];
};

export type EntryChanges = Partial<{
  divisionId: string;
  displayName: string | null;
  seed: number | null;
  state: string;
  placementReason: string | null;
  previousEntryId: string | null;
}>;

async function select(tx: Tx, where: SQL | undefined): Promise<EntryRecord[]> {
  const rows = await tx
    .select({
      entry,
      label: sql<string>`(select el.label from entry_label el where el.entry_id = ${entry.id})`,
    })
    .from(entry)
    .where(where)
    .orderBy(asc(entry.id));
  if (rows.length === 0) return [];

  const people = await tx
    .select({
      entryId: entryMember.entryId,
      id: member.id,
      displayName: member.displayName,
      role: entryMember.role,
    })
    .from(entryMember)
    .innerJoin(member, eq(member.id, entryMember.memberId))
    .where(inArray(entryMember.entryId, rows.map((r) => r.entry.id)))
    // The same order entry_label uses, so the list reads like the label.
    .orderBy(desc(entryMember.role), asc(member.displayName));

  return rows.map((r) => ({
    ...r.entry,
    label: r.label,
    members: people
      .filter((p) => p.entryId === r.entry.id)
      .map((p) => ({ id: p.id, displayName: p.displayName, role: p.role })),
  }));
}

/** A competition's entries, in the order they were made. A few dozen at most, so never paged. */
export async function listEntries(
  tx: Tx,
  competitionId: string,
  options: { divisionId: string | undefined; state: string | undefined },
): Promise<EntryRecord[]> {
  return select(
    tx,
    and(
      eq(entry.competitionId, competitionId),
      options.divisionId ? eq(entry.divisionId, options.divisionId) : undefined,
      options.state ? eq(entry.state, options.state) : undefined,
    ),
  );
}

export async function getEntry(tx: Tx, entryId: string): Promise<EntryRecord | null> {
  const [row] = await select(tx, eq(entry.id, entryId));
  return row ?? null;
}

/** Which of these members already play in the competition, in any division. */
export async function alreadyEntered(tx: Tx, competitionId: string, memberIds: string[]): Promise<string[]> {
  const rows = await tx
    .select({ id: entryMember.memberId })
    .from(entryMember)
    .where(and(eq(entryMember.competitionId, competitionId), inArray(entryMember.memberId, memberIds)));
  return rows.map((r) => r.id);
}

/**
 * Makes an entry and its line-up together. The first member is the player,
 * the second their partner. How many members an entry needs is the caller's
 * to check: the database cannot count them.
 */
export async function createEntry(
  tx: Tx,
  clubId: string,
  input: {
    competitionId: string;
    divisionId: string;
    memberIds: string[];
    displayName: string | null;
    seed: number | null;
    placementReason: string | null;
    previousEntryId: string | null;
  },
): Promise<string> {
  const { memberIds, ...fields } = input;
  const id = uuidv7();
  await tx.insert(entry).values({ ...fields, id, clubId });
  await tx.insert(entryMember).values(
    memberIds.map((memberId, i) => ({
      entryId: id,
      memberId,
      competitionId: input.competitionId,
      clubId,
      role: i === 0 ? "player" : "partner",
    })),
  );
  return id;
}

/** Changes an entry. Withdrawing one records when; reinstating it clears that. */
export async function updateEntry(tx: Tx, entryId: string, changes: EntryChanges): Promise<void> {
  const withdrawnAt =
    changes.state === undefined
      ? {}
      : { withdrawnAt: changes.state === "withdrawn" ? sql`coalesce(${entry.withdrawnAt}, now())` : null };
  await tx
    .update(entry)
    .set({ ...changes, ...withdrawnAt, updatedAt: sql`now()` })
    .where(eq(entry.id, entryId));
}

/** Deletes an entry and its line-up. Only ever one with no match under way: see startedMatches. */
export async function deleteEntry(tx: Tx, entryId: string): Promise<void> {
  await tx.delete(entry).where(eq(entry.id, entryId));
}

/**
 * How many of an entry's matches have got anywhere: a claim, a result, or
 * being voided. Only a match still `open` is a mere fixture, safe to remove.
 */
export async function startedMatches(tx: Tx, entryId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(matchSide)
    .innerJoin(match, eq(match.id, matchSide.matchId))
    .where(and(eq(matchSide.entryId, entryId), ne(match.status, "open")));
  return row?.n ?? 0;
}

/**
 * Deletes an entry's fixtures that nobody has touched — `open` matches, with
 * no claim against them — and returns their ids. For when an entry leaves its
 * division before playing: generating fixtures again puts back whatever the
 * division then needs.
 */
export async function deleteOpenFixtures(tx: Tx, entryId: string): Promise<string[]> {
  const rows = await tx
    .delete(match)
    .where(
      and(
        eq(match.status, "open"),
        // An open match has no claims; this makes sure deleting one never takes a claim with it.
        notExists(tx.select({ id: resultSubmission.id }).from(resultSubmission).where(eq(resultSubmission.matchId, match.id))),
        inArray(
          match.id,
          tx.select({ id: matchSide.matchId }).from(matchSide).where(eq(matchSide.entryId, entryId)),
        ),
      ),
    )
    .returning({ id: match.id });
  return rows.map((r) => r.id);
}

/** The entries still playing in a division: the ones a round robin pairs up. */
export async function activeEntryIds(tx: Tx, divisionId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: entry.id })
    .from(entry)
    .where(and(eq(entry.divisionId, divisionId), eq(entry.state, "active")));
  return rows.map((r) => r.id);
}
