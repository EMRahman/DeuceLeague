/**
 * One page of a list, in id order. Ids are UUIDv7, so that is creation order,
 * and "everything after this id" is a cursor that never skips or repeats a
 * row, however many are added in between.
 */
export type Page<T> = { rows: T[]; next: string | null };

/** How much of a list to read: at most `limit` rows, starting after `after`. */
export type PageRequest = { limit: number; after: string | undefined };

/**
 * Turns `limit + 1` rows into a page: the extra row, if it came back, only
 * says there is more, and the cursor is the last row actually returned.
 */
export function toPage<T extends { id: string }>(rows: T[], limit: number): Page<T> {
  if (rows.length <= limit) return { rows, next: null };
  const page = rows.slice(0, limit);
  return { rows: page, next: page[page.length - 1]!.id };
}
