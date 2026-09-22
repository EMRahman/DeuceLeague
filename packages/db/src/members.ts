import { and, asc, eq, gt, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { Tx } from "./client.js";
import { uuidv7 } from "./ids.js";
import { toPage, type Page, type PageRequest } from "./lists.js";
import { accessGrant, entry, entryMember, member, resultSubmission } from "./schema.js";

/** What anyone allowed to see the member list sees: the name they play under, never who they are. */
const listed = {
  id: member.id,
  displayName: member.displayName,
  status: member.status,
  rating: member.rating,
  ratingSystem: member.ratingSystem,
  joinedOn: member.joinedOn,
  deletedAt: member.deletedAt,
  createdAt: member.createdAt,
  updatedAt: member.updatedAt,
};

/**
 * Personal data, selected only for a caller holding members:pii — so for
 * anyone else it never leaves the database, rather than being dropped later.
 */
const personal = {
  fullName: member.fullName,
  email: member.email,
  phone: member.phone,
  dateOfBirth: member.dateOfBirth,
  gender: member.gender,
  notes: member.notes,
};

export type PersonalFields = {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  notes: string | null;
};

export type MemberRecord = {
  id: string;
  displayName: string;
  status: string;
  rating: string | null;
  ratingSystem: string | null;
  joinedOn: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} & Partial<PersonalFields>;

/** What a member may be given or changed to. Absent fields are left alone; null clears one. */
export type MemberChanges = Partial<
  {
    displayName: string;
    status: string;
    rating: string | null;
    ratingSystem: string | null;
    joinedOn: string | null;
  } & PersonalFields
>;

/** Who a caller erasing a member leaves in their place. Their results keep the id. */
export const ERASED_DISPLAY_NAME = "Erased member";

async function select(
  tx: Tx,
  pii: boolean,
  where: SQL | undefined,
  limit: number,
): Promise<MemberRecord[]> {
  const query = pii ? tx.select({ ...listed, ...personal }) : tx.select(listed);
  return query.from(member).where(where).orderBy(asc(member.id)).limit(limit);
}

/**
 * The club's members in the order they were added. Removed members only when
 * asked for. An email matches regardless of case, as the unique index on
 * lower(email) does — only a caller holding members:pii may ask by one.
 */
export async function listMembers(
  tx: Tx,
  options: {
    pii: boolean;
    status: string | undefined;
    email: string | undefined;
    includeRemoved: boolean;
  } & PageRequest,
): Promise<Page<MemberRecord>> {
  const rows = await select(
    tx,
    options.pii,
    and(
      options.after ? gt(member.id, options.after) : undefined,
      options.status ? eq(member.status, options.status) : undefined,
      options.email ? sql`lower(${member.email}) = lower(${options.email})` : undefined,
      options.includeRemoved ? undefined : isNull(member.deletedAt),
    ),
    options.limit + 1,
  );
  return toPage(rows, options.limit);
}

/** One member, removed or not: their id still appears on old results. */
export async function getMember(tx: Tx, memberId: string, pii: boolean): Promise<MemberRecord | null> {
  const [row] = await select(tx, pii, eq(member.id, memberId), 1);
  return row ?? null;
}

export async function createMember(
  tx: Tx,
  clubId: string,
  input: MemberChanges & { displayName: string },
): Promise<string> {
  const id = uuidv7();
  await tx.insert(member).values({ ...input, id, clubId });
  return id;
}

/** Applies the changes to a member who has not been removed. False if there is none. */
export async function updateMember(tx: Tx, memberId: string, changes: MemberChanges): Promise<boolean> {
  const rows = await tx
    .update(member)
    .set({ ...changes, updatedAt: sql`now()` })
    .where(and(eq(member.id, memberId), isNull(member.deletedAt)))
    .returning({ id: member.id });
  return rows.length > 0;
}

/**
 * Removes a member from the club's list. Their results stay, under their
 * display name, and any login they hold stops working — the resolver refuses
 * a removed member's grants.
 */
export async function removeMember(tx: Tx, memberId: string): Promise<boolean> {
  const rows = await tx
    .update(member)
    .set({ deletedAt: sql`coalesce(${member.deletedAt}, now())`, updatedAt: sql`now()` })
    .where(eq(member.id, memberId))
    .returning({ id: member.id });
  return rows.length > 0;
}

/**
 * Erases a member's personal data and keeps their results, which is what an
 * erasure request under GDPR asks for. Their display name goes too — it is
 * their name — and so does anything else that could say who they were: an
 * entry name that may spell it out, what they typed when reporting scores,
 * and their logins. The row stays so every match they played still adds up.
 */
export async function eraseMember(tx: Tx, memberId: string): Promise<boolean> {
  const rows = await tx
    .update(member)
    .set({
      displayName: ERASED_DISPLAY_NAME,
      fullName: null,
      email: null,
      phone: null,
      dateOfBirth: null,
      gender: null,
      notes: null,
      rating: null,
      ratingSystem: null,
      joinedOn: null,
      status: "left",
      deletedAt: sql`coalesce(${member.deletedAt}, now())`,
      updatedAt: sql`now()`,
    })
    .where(eq(member.id, memberId))
    .returning({ id: member.id });
  if (rows.length === 0) return false;

  await tx.delete(accessGrant).where(eq(accessGrant.memberId, memberId));
  await tx
    .update(entry)
    .set({ displayName: null, updatedAt: sql`now()` })
    .where(
      and(
        isNotNull(entry.displayName),
        inArray(
          entry.id,
          tx.select({ id: entryMember.entryId }).from(entryMember).where(eq(entryMember.memberId, memberId)),
        ),
      ),
    );
  await tx
    .update(resultSubmission)
    .set({ rawInput: null })
    .where(eq(resultSubmission.submittedByMemberId, memberId));
  return true;
}

/** What entering members needs to know about them: that they exist, are still here, and — for a warning only — their gender. */
export async function membersForEntry(tx: Tx, memberIds: string[]) {
  return tx
    .select({ id: member.id, deletedAt: member.deletedAt, gender: member.gender })
    .from(member)
    .where(inArray(member.id, memberIds));
}
