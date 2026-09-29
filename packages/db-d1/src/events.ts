import type { D1Database } from "@cloudflare/workers-types";
import { commitMutation, readSnapshot } from "./atomic.js";
import { readIdentity, type CredentialKind } from "./identity.js";

export type EventPosition = { txId: string; id: string };
export type HistoryEvent = EventPosition & {
  type: string; subjectType: string; subjectId: string | null;
  actorType: "api_key" | "member" | "system"; actorId: string | null;
  occurredAt: Date; payload: Record<string, unknown>;
};
const MAX = 10n ** 20n - 1n;
function decimal(value: string): bigint {
  if (!/^\d{1,20}$/.test(value)) throw new Error("Invalid event position");
  return BigInt(value);
}
const padded = (value: string) => decimal(value).toString().padStart(20, "0");

/** An event as the feed reads it, with who did it and what to, named as they are now. */
export type FeedRecord = HistoryEvent & { actorName: string | null; subjectName: string | null };

/** Authentication and feed contents share one database snapshot. All event
 * inserts (including bulk writes) allocate their position in the same commit.
 * Newest first reads backwards from `after`, or from the end without one: it
 * is for showing people what happened, since a consumer reading forwards is
 * the one guaranteed never to skip an event. */
export async function readEventFeed(db: D1Database, hash: string, kind: CredentialKind,
  after: EventPosition | null, limit: number, order: "oldest" | "newest" = "oldest") {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid feed limit");
  const newest = order === "newest";
  const from = after ?? (newest ? { txId: MAX.toString(), id: MAX.toString() } : { txId: "0", id: "0" });
  const read = newest
    ? db.prepare(`SELECT ltrim(p.tx_id, '0') AS tx_id, ltrim(p.event_id, '0') AS event_id,
      e.type, e.subject_type, e.subject_id, e.actor_type, e.actor_id, e.occurred_at, e.payload, n.actor_name, n.subject_name
      FROM event_position p JOIN event e ON e.id = p.local_id JOIN event_name n ON n.event_id = e.id
      WHERE p.club_id = (SELECT id FROM club WHERE singleton = 1)
        AND (p.tx_id, p.event_id) < (?, ?)
      ORDER BY p.tx_id DESC, p.event_id DESC LIMIT ?`)
    : db.prepare(`SELECT ltrim(p.tx_id, '0') AS tx_id, ltrim(p.event_id, '0') AS event_id,
      e.type, e.subject_type, e.subject_id, e.actor_type, e.actor_id, e.occurred_at, e.payload, n.actor_name, n.subject_name
      FROM event_position p JOIN event e ON e.id = p.local_id JOIN event_name n ON n.event_id = e.id
      WHERE p.club_id = (SELECT id FROM club WHERE singleton = 1)
        AND (p.tx_id, p.event_id) > (?, ?)
      ORDER BY p.tx_id, p.event_id LIMIT ?`);
  const identity = await readIdentity(db, hash, kind, null, [read.bind(padded(from.txId), padded(from.id), limit)]);
  const events: FeedRecord[] = (identity.extraResults[0]!.results as Record<string, unknown>[]).map((r) => ({
    txId: String(r.tx_id), id: String(r.event_id), type: String(r.type),
    subjectType: String(r.subject_type), subjectId: r.subject_id as string | null,
    actorType: r.actor_type as HistoryEvent["actorType"], actorId: r.actor_id as string | null,
    occurredAt: new Date(r.occurred_at as number), payload: JSON.parse(r.payload as string) as Record<string, unknown>,
    actorName: r.actor_name as string | null, subjectName: r.subject_name as string | null,
  }));
  return { identity, events, from };
}

/** Offline import primitive, NOT an HTTP route or complete club importer.
 * The caller must freeze/drain the source, export its entire club history and
 * supply global transaction/event high-water marks from that frozen snapshot.
 * Run before creating any destination audits; it cannot merge/replace history.
 * One bounded JSON batch is atomic, including opening/closing the import gate.
 * A later club importer must handle D1 payload limits before calling this. */
export async function importEventHistory(db: D1Database, clubId: string, history: readonly HistoryEvent[],
  watermark: { txId: string; id: string }): Promise<void> {
  const tx = decimal(watermark.txId), id = decimal(watermark.id);
  if (tx >= MAX || id >= MAX) throw new Error("Event position space exhausted");
  const ids = new Set<string>();
  const rows = history.map((e) => {
    const eventTx = decimal(e.txId), eventId = decimal(e.id);
    if (eventTx === 0n || eventTx > tx || eventId === 0n || eventId > id || ids.has(eventId.toString())) {
      throw new Error("Invalid or duplicate imported event position");
    }
    if (!Number.isSafeInteger(e.occurredAt.getTime()) || !e.payload || typeof e.payload !== "object" || Array.isArray(e.payload)) {
      throw new Error("Invalid imported event data");
    }
    ids.add(eventId.toString());
    return { ...e, txId: padded(e.txId), id: padded(e.id), occurredAt: e.occurredAt.getTime() };
  });
  const snapshot = await readSnapshot(db, []);
  await commitMutation(db, snapshot, [
    db.prepare(`INSERT INTO event_import_guard (singleton, valid) SELECT 1, CASE WHEN
      NOT EXISTS (SELECT 1 FROM event) AND EXISTS (SELECT 1 FROM club WHERE id = ?)
      AND EXISTS (SELECT 1 FROM event_sequence WHERE singleton = 1 AND imported = 0 AND importing = 0)
      THEN 1 ELSE 0 END WHERE true ON CONFLICT(singleton) DO UPDATE SET valid = excluded.valid`).bind(clubId),
    db.prepare(`UPDATE event_sequence SET epoch = ?, high = ?, low = ?, importing = 1, imported = 1 WHERE singleton = 1`)
      .bind((tx + 1n).toString().padStart(20, "0"), Number(id / 10000000000n), Number(id % 10000000000n)),
    db.prepare(`INSERT INTO event (club_id, source_tx, source_id, type, subject_type, subject_id,
      actor_type, actor_id, occurred_at, payload)
      SELECT ?, json_extract(value, '$.txId'), json_extract(value, '$.id'), json_extract(value, '$.type'),
        json_extract(value, '$.subjectType'), json_extract(value, '$.subjectId'), json_extract(value, '$.actorType'),
        json_extract(value, '$.actorId'), json_extract(value, '$.occurredAt'), json_extract(value, '$.payload')
      FROM json_each(?) ORDER BY CAST(key AS INTEGER)`).bind(clubId, JSON.stringify(rows)),
    db.prepare("UPDATE event_sequence SET importing = 0 WHERE singleton = 1"),
  ]);
}
