import type { D1Database, D1Result } from "@cloudflare/workers-types";
import type { PartnerChoiceRecord } from "./league-types.js";

/** A competition's partner choices, found through the table's key: one read however long the club's history. */
export function partnerChoicesRead(db: D1Database, competitionId: string) {
  return db.prepare(`SELECT * FROM partner_choice WHERE competition_id = ? ORDER BY member_id`).bind(competitionId);
}

export function partnerChoiceRecords(result: D1Result): PartnerChoiceRecord[] {
  return (result.results as Record<string, any>[]).map((r) => ({ clubId: r.club_id, competitionId: r.competition_id,
    memberId: r.member_id, choice: r.choice, partnerId: r.partner_id,
    confirmedAt: r.confirmed_at === null ? null : new Date(Number(r.confirmed_at)),
    createdAt: new Date(Number(r.created_at)), updatedAt: new Date(Number(r.updated_at)) }));
}
