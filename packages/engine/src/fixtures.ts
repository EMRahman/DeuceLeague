/** One pairing in a round robin, and the key that makes generating it idempotent. */
export type Pairing = { side0: string; side1: string; pairingKey: string };

/**
 * Every pairing of a division's entries, each exactly once: n entries play
 * n(n-1)/2 matches, so a division of eleven has fifty-five.
 *
 * Deterministic: the same entries give the same pairings in the same order,
 * whatever order they arrive in. The pairing key — the two ids, sorted — is
 * held unique per division by the database, so re-running this after a late
 * entry and inserting with ON CONFLICT DO NOTHING adds only the new pairings.
 *
 * There are no dates or rounds. Arranging a match is up to the players.
 */
export function roundRobin(entryIds: readonly string[]): Pairing[] {
  const ids = [...new Set(entryIds)].sort();
  const pairings: Pairing[] = [];
  ids.forEach((a, i) => {
    for (const b of ids.slice(i + 1)) {
      pairings.push({ side0: a, side1: b, pairingKey: pairingKey(a, b) });
    }
  });
  return pairings;
}

/** The same for either order of the two entries. */
export function pairingKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
