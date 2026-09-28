import type { D1Database } from "@cloudflare/workers-types";
import { commitMutation, readSnapshot, retryMutation } from "./atomic.js";

/** Shared by browser and direct bootstrap requests in the Worker. A fixed
 * per-installation minute bucket survives reloads and stores no visitor PII. */
export async function claimInstallerAttempt(db: D1Database): Promise<boolean> {
  return retryMutation(async () => {
    const snapshot = await readSnapshot(db, []);
    const [result] = await commitMutation(db, snapshot, [
      db.prepare(`INSERT INTO installer_rate_limit (singleton, window, attempts)
        VALUES (1, CAST(unixepoch() / 60 AS INTEGER), 1)
        ON CONFLICT(singleton) DO UPDATE SET window = max(installer_rate_limit.window, excluded.window),
          attempts = CASE WHEN installer_rate_limit.window < excluded.window THEN 1 ELSE installer_rate_limit.attempts + 1 END
        WHERE installer_rate_limit.window < excluded.window OR installer_rate_limit.attempts < 20
        RETURNING attempts`),
    ]);
    return result!.results.length === 1;
  });
}
