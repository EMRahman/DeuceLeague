import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";
/** A decision must be recomputed; none of its writes have committed. */
export class StaleSnapshotError extends Error {
  constructor() {
    super("The club changed while this operation was being prepared");
    this.name = "StaleSnapshotError";
  }
}

export type Snapshot = { revision: number; results: D1Result[] };

/**
 * Read the revision AND all decision inputs in one database batch. Separate
 * awaits could otherwise mix records from before and after a concurrent write.
 * Callers provide SELECT statements only. These are trusted persistence code,
 * never SQL accepted from an API caller.
 */
export async function readSnapshot(db: D1Database, reads: D1PreparedStatement[]): Promise<Snapshot> {
  const [clock, ...results] = await db.batch<Record<string, unknown>>([
    db.prepare("SELECT revision FROM mutation_clock WHERE singleton = 1"),
    ...reads,
  ]);
  const revision = clock?.results[0]?.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("The database mutation clock is missing or invalid");
  }
  return { revision, results };
}

/**
 * Commit a previously computed decision, or fail without writing anything.
 * EVERY write to state used by decisions must use this boundary, including
 * credential revocation, deadlines, membership changes, and audit events.
 * Time passing is not a write: expiry/deadline predicates also need checking
 * inside the batch. Do not send email or return success before this resolves.
 */
export async function commitMutation(
  db: D1Database,
  snapshot: Pick<Snapshot, "revision">,
  writes: D1PreparedStatement[],
): Promise<D1Result[]> {
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0) {
    throw new Error("Invalid mutation revision");
  }
  try {
    const [guard, ...results] = await db.batch([
      db.prepare(`UPDATE mutation_clock
        SET revision = CASE WHEN revision = ? THEN revision + 1 ELSE -1 END
        WHERE singleton = 1`).bind(snapshot.revision),
      ...writes,
    ]);
    // The migration's singleton/check/trigger make this invariant structural.
    if (guard?.meta.changes !== 1) throw new Error("The mutation clock was not advanced");
    return results;
  } catch (error) {
    if (isRevisionConflict(error)) throw new StaleSnapshotError();
    // A timeout can mean the response was lost after commit. Retrying blindly
    // could duplicate a mutation. Only the definitive CHECK failure retries.
    throw error;
  }
}

/** Re-run the whole read/decide/commit operation, never just its write batch. */
export async function retryMutation<T>(operation: () => Promise<T>, attempts = 4): Promise<T> {
  if (!Number.isInteger(attempts) || attempts < 1) throw new Error("Invalid mutation attempt count");
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof StaleSnapshotError) || attempt === attempts) throw error;
    }
  }
}

function isRevisionConflict(error: unknown): boolean {
  // D1 may wrap the SQLite diagnostic in an Error cause. Match our own named
  // constraint only; a different failed constraint is not a stale snapshot.
  const seen = new Set<unknown>();
  let current = error;
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if (/CHECK constraint failed: mutation_revision_current(?:\b|$)/.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
