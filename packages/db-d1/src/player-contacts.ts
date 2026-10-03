import type { D1Database } from "@cloudflare/workers-types";
import { readIdentity } from "./identity.js";

/** Someone the signed-in player plays with or against, with what it takes to arrange a match. */
export type PlayerContact = {
  member_id: string; display_name: string; full_name: string | null; email: string | null; phone: string | null;
  /** Their entries the player shares a running competition's matches with, or partners in. */
  entry_ids: string[];
};

/**
 * The signed-in player's partners and opponents in competitions under way, with their contact details: the
 * people they need to reach to arrange their matches. Nobody else's details, and only while it is running.
 */
export async function readPlayerContacts(db: D1Database, hash: string) {
  const identity = await readIdentity(db, hash, "session", null, [
    // Someone who has left the club neither sees anyone's details nor has theirs shown.
    db.prepare(`WITH me AS (SELECT a.member_id, a.club_id FROM access_grant a
        JOIN member mm ON mm.id = a.member_id AND mm.deleted_at IS NULL AND mm.status <> 'left'
        WHERE a.token_hash = ? AND a.kind = 'session'),
      mine AS (SELECT em.entry_id FROM me
        JOIN entry_member em ON em.member_id = me.member_id
        JOIN entry e ON e.id = em.entry_id AND e.club_id = me.club_id AND e.state = 'active'
        JOIN competition c ON c.id = e.competition_id AND c.club_id = e.club_id AND c.state = 'active'
          AND c.visibility = 'members'),
      theirs AS (SELECT entry_id FROM mine
        UNION SELECT other.entry_id FROM mine
          JOIN match_side s ON s.entry_id = mine.entry_id
          JOIN match_side other ON other.match_id = s.match_id AND other.side_index <> s.side_index
          -- An opponent who has withdrawn has no match left to arrange.
          JOIN entry oe ON oe.id = other.entry_id AND oe.state = 'active')
      -- CROSS JOIN keeps this order: from the few entries found, through each one's members by key.
      SELECT m.id, m.display_name, m.full_name, m.email, m.phone, em.entry_id
      FROM theirs CROSS JOIN entry_member em ON em.entry_id = theirs.entry_id
      CROSS JOIN member m ON m.id = em.member_id AND m.deleted_at IS NULL AND m.status <> 'left'
      CROSS JOIN me ON m.club_id = me.club_id AND m.id <> me.member_id
      ORDER BY m.display_name, m.id`).bind(hash),
  ]);
  const byMember = new Map<string, PlayerContact>();
  for (const r of identity.extraResults[0]!.results as Record<string, string | null>[]) {
    const known = byMember.get(r.id!);
    if (known) known.entry_ids.push(r.entry_id!);
    else byMember.set(r.id!, { member_id: r.id!, display_name: r.display_name!, full_name: r.full_name ?? null,
      email: r.email ?? null, phone: r.phone ?? null, entry_ids: [r.entry_id!] });
  }
  return { identity, contacts: [...byMember.values()] };
}
