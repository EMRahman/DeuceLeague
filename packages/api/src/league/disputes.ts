import type { DisputeEvent, DisputeSide } from "@deuceleague/db-d1";

/** How a dispute ended, from the events of its match. */
export type Ending =
  | { kind: "agreed"; gaveWay: 0 | 1 }
  | { kind: "coach" }
  | { kind: "open" };

/**
 * How the latest dispute on a match ended. Once the two reports differ, the match is settled one of three
 * ways: a side accepts the other's score or reports its own again to match it, and gives way; the coach
 * settles it; or it is still stuck. Who gave way is the side that made the report that ended it.
 */
export function endingOf(events: DisputeEvent[]): Ending {
  const disputed = events.map((e) => e.type).lastIndexOf("match.disputed");
  const after = events.slice(disputed + 1);
  const confirmed = after.findIndex((e) => e.type === "match.result.confirmed");
  if (confirmed < 0) return { kind: "open" };
  const how = after[confirmed]!.payload.how;
  if (how === "settled") return { kind: "coach" };
  // The report or acceptance made just before the match was agreed is what agreed it.
  const closing = after.slice(0, confirmed).reverse()
    .find((e) => e.type === (how === "accepted" ? "match.claim.accepted" : "match.claim.reported"));
  const side = closing?.payload.side;
  return side === 0 || side === 1 ? { kind: "agreed", gaveWay: side } : { kind: "open" };
}

export type DisputeCounts = { disputes: number; gave_way: number; held: number; settled_by_coach: number; unresolved: number };
export type DisputeRow = { member_id: string; display_name: string; this_season: DisputeCounts; earlier: DisputeCounts };

const none = (): DisputeCounts => ({ disputes: 0, gave_way: 0, held: 0, settled_by_coach: 0, unresolved: 0 });

/**
 * Each member's disputes: this season's and earlier ones, and how they ended for that member. Both
 * players are in every dispute, so the count alone does not say who is at fault: a player who keeps
 * giving way, or whose score others keep accepting, stands out from one caught up in someone else's.
 * Most disputes first, then who gave way most.
 */
export function disputeHistory(events: DisputeEvent[], sides: DisputeSide[]): DisputeRow[] {
  const byMatch = new Map<string, DisputeEvent[]>();
  for (const e of events) byMatch.set(e.matchId, [...(byMatch.get(e.matchId) ?? []), e]);
  const rows = new Map<string, DisputeRow>();
  for (const s of sides) {
    const row = rows.get(s.memberId) ?? { member_id: s.memberId, display_name: s.displayName, this_season: none(), earlier: none() };
    rows.set(s.memberId, row);
    const counts = s.seasonState === "active" ? row.this_season : row.earlier;
    const ending = endingOf(byMatch.get(s.matchId) ?? []);
    counts.disputes += 1;
    if (ending.kind === "coach") counts.settled_by_coach += 1;
    else if (ending.kind === "open") counts.unresolved += 1;
    else if (ending.gaveWay === s.side) counts.gave_way += 1;
    else counts.held += 1;
  }
  const total = (r: DisputeRow, key: keyof DisputeCounts) => r.this_season[key] + r.earlier[key];
  return [...rows.values()].sort((a, b) => total(b, "disputes") - total(a, "disputes")
    || total(b, "gave_way") - total(a, "gave_way") || a.display_name.localeCompare(b.display_name));
}
