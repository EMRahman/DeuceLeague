import type { ActorType } from "@deuceleague/schema";
import { sql } from "drizzle-orm";
import { event } from "./schema.js";
import type { Tx } from "./client.js";

/** Who caused a change. A system actor, such as a CLI command, has no id. */
export type Actor = { type: ActorType; id: string | null };

export const SYSTEM: Actor = { type: "system", id: null };

/**
 * Appends to the event log, inside the caller's transaction, so a change and
 * its event commit together or not at all. Payloads carry ids and names,
 * never personal data: the log is append-only, so nothing written here can be
 * erased later.
 */
export async function recordEvent(
  tx: Tx,
  clubId: string,
  e: { type: string; subjectType: string; subjectId: string | null; actor: Actor; payload?: object },
): Promise<void> {
  await tx.insert(event).values({
    clubId,
    type: e.type,
    subjectType: e.subjectType,
    subjectId: e.subjectId,
    actorType: e.actor.type,
    actorId: e.actor.id,
    payload: e.payload ?? {},
  });
}

/** A place in the event feed: the transaction that wrote an event, then its id. */
export type FeedPosition = { txId: string; id: string };

export type FeedEvent = FeedPosition & {
  type: string;
  subjectType: string;
  subjectId: string | null;
  actorType: string;
  actorId: string | null;
  occurredAt: Date;
  payload: unknown;
};

/**
 * Up to `limit` events after `after`, from event_feed in (tx_id, id) order —
 * never by id alone, which skips an event whose transaction committed late.
 * The feed holds each event back until nothing older can still appear, so
 * reading onward from the last position returned never misses one.
 */
export async function readFeed(tx: Tx, after: FeedPosition | null, limit: number): Promise<FeedEvent[]> {
  const rows = await tx.execute<{
    id: string;
    tx_id: string;
    type: string;
    subject_type: string;
    subject_id: string | null;
    actor_type: string;
    actor_id: string | null;
    occurred_at: Date | string;
    payload: unknown;
  }>(sql`
    select id, tx_id, type, subject_type, subject_id, actor_type, actor_id, occurred_at, payload
    from event_feed
    where ${after ? sql`(tx_id, id) > (${after.txId}::xid8, ${after.id}::bigint)` : sql`true`}
    order by tx_id, id
    limit ${limit}`);
  return rows.map((r) => ({
    id: String(r.id),
    txId: String(r.tx_id),
    type: r.type,
    subjectType: r.subject_type,
    subjectId: r.subject_id,
    actorType: r.actor_type,
    actorId: r.actor_id,
    occurredAt: new Date(r.occurred_at),
    payload: r.payload,
  }));
}
