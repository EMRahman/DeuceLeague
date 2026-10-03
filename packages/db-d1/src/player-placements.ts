import type { D1Database } from "@cloudflare/workers-types";
import { readIdentity } from "./identity.js";

export type PlacementSeason = { id: string; name: string; starts_on: string | null; ends_on: string | null };
type PlacementRow = {
  season_id: string; season_name: string; starts_on: string | null; ends_on: string | null;
  competition_id: string; competition_name: string; division_name: string;
  partner_id: string | null; partner_name: string | null; provisional: number; fixtures_ready: number;
};
export type PlayerPlacement = {
  season: PlacementSeason;
  competition_id: string; competition_name: string; division_name: string;
  partner: { id: string; display_name: string } | null;
  provisional: boolean; fixtures_ready: boolean;
};

/**
 * Only the signed-in member's lineup, once the coach has started their competition: drafts, other
 * competitors and private competitions stay private.
 */
export async function readPlayerPlacements(db: D1Database, hash: string) {
  const identity = await readIdentity(db, hash, "session", null, [
    // A place in a draft not yet started does not count: a newcomer placed there is still waiting.
    db.prepare(`SELECT EXISTS (SELECT 1 FROM entry_member em
      JOIN access_grant a ON a.member_id = em.member_id
      JOIN entry e ON e.id = em.entry_id AND e.club_id = a.club_id
      JOIN competition c ON c.id = e.competition_id AND c.club_id = e.club_id
      WHERE a.token_hash = ? AND a.kind = 'session' AND c.state <> 'draft') AS has_entries`).bind(hash),
    db.prepare(`SELECT id, name, starts_on, ends_on FROM season
      WHERE club_id = (SELECT id FROM club WHERE singleton = 1) AND state = 'planning'
      ORDER BY starts_on IS NULL, starts_on, id LIMIT 1`),
    db.prepare(`SELECT s.id AS season_id, s.name AS season_name, s.starts_on, s.ends_on,
        c.id AS competition_id, c.name AS competition_name, d.name AS division_name,
        partner.id AS partner_id, partner.display_name AS partner_name,
        (s.state <> 'active' OR c.state <> 'active') AS provisional,
        EXISTS (SELECT 1 FROM match_side ms WHERE ms.entry_id = e.id) AS fixtures_ready
      FROM access_grant a
      JOIN entry_member own ON own.member_id = a.member_id
      JOIN entry e ON e.id = own.entry_id AND e.club_id = a.club_id
      JOIN competition c ON c.id = e.competition_id AND c.club_id = e.club_id
      JOIN season s ON s.id = c.season_id AND s.club_id = c.club_id
      JOIN division d ON d.id = e.division_id
      LEFT JOIN entry_member other ON other.entry_id = e.id AND other.member_id <> own.member_id
      LEFT JOIN member partner ON partner.id = other.member_id AND partner.deleted_at IS NULL
      WHERE a.token_hash = ? AND a.kind = 'session' AND e.state = 'active'
        AND c.visibility = 'members' AND c.state = 'active'
        AND s.state IN ('planning', 'active')
      ORDER BY s.starts_on, s.id, c.id`).bind(hash),
  ]);
  const next = identity.extraResults[1]!.results[0] as PlacementSeason | undefined;
  const placements: PlayerPlacement[] = (identity.extraResults[2]!.results as PlacementRow[]).map((r) => ({
    season: { id: r.season_id, name: r.season_name, starts_on: r.starts_on, ends_on: r.ends_on },
    competition_id: r.competition_id, competition_name: r.competition_name, division_name: r.division_name,
    partner: r.partner_id ? { id: r.partner_id, display_name: r.partner_name! } : null,
    provisional: !!r.provisional, fixtures_ready: !!r.fixtures_ready,
  }));
  return { identity, has_entries: !!(identity.extraResults[0]!.results[0] as { has_entries: number }).has_entries, next_season: next ?? null, placements };
}
