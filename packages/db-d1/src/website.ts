import type { D1Database } from "@cloudflare/workers-types";
import { commitMutation, readSnapshot, retryMutation } from "./atomic.js";

/** Reserve before member lookup or sending. SQL time and a conditional upsert
 * arbitrate across isolates. Email is sent once, outside any mutation retry.
 * A failed/ambiguous delivery keeps its reservation until the minute expires. */
export async function claimWebsiteLogin(db: D1Database, recipientHash: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(recipientHash)) throw new Error("Invalid cooldown key");
  return retryMutation(async () => {
    const snapshot = await readSnapshot(db, []);
    const results = await commitMutation(db, snapshot, [
      db.prepare("DELETE FROM website_login_cooldown WHERE expires_at <= unixepoch('subsec') * 1000"),
      db.prepare(`INSERT INTO website_login_cooldown (recipient_hash, expires_at)
        VALUES (?, CAST(unixepoch('subsec') * 1000 AS INTEGER) + 60000)
        ON CONFLICT(recipient_hash) DO NOTHING RETURNING recipient_hash`).bind(recipientHash),
    ]);
    return results[1]!.results.length === 1;
  });
}

/**
 * Reserve one of today's join requests, for the club as a whole and for this
 * connection (a keyed hash; null when the platform gives no address). Days are
 * UTC days. Reserved before the request is sent to the API, so a burst cannot
 * slip past the limit; one that then fails still counts, as a login does.
 */
export async function claimWebsiteJoin(db: D1Database, connectionHash: string | null,
  limits: { perDay: number; perConnection: number }): Promise<true | "club" | "ip"> {
  if (connectionHash !== null && !/^[a-f0-9]{64}$/.test(connectionHash)) throw new Error("Invalid connection key");
  return retryMutation(async () => {
    const snapshot = await readSnapshot(db, [
      db.prepare("SELECT CAST(unixepoch() / 86400 AS INTEGER) AS day"),
      db.prepare(`SELECT bucket, count FROM website_join_limit WHERE bucket IN ('club', ?)
        AND day = CAST(unixepoch() / 86400 AS INTEGER)`).bind(connectionHash ?? "club"),
    ]);
    const day = Number((snapshot.results[0]!.results[0] as { day: number }).day);
    const counts = new Map((snapshot.results[1]!.results as { bucket: string; count: number }[]).map((r) => [r.bucket, r.count]));
    if ((counts.get("club") ?? 0) >= limits.perDay) return "club";
    if (connectionHash !== null && (counts.get(connectionHash) ?? 0) >= limits.perConnection) return "ip";
    const count = (bucket: string) => db.prepare(`INSERT INTO website_join_limit (bucket, day, count) VALUES (?, ?, 1)
      ON CONFLICT(bucket) DO UPDATE SET count = CASE WHEN website_join_limit.day = excluded.day
        THEN website_join_limit.count + 1 ELSE 1 END, day = excluded.day`).bind(bucket, day);
    await commitMutation(db, snapshot, [
      db.prepare("DELETE FROM website_join_limit WHERE day < ?").bind(day),
      count("club"),
      ...(connectionHash === null ? [] : [count(connectionHash)]),
    ]);
    return true;
  });
}
