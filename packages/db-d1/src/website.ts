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
