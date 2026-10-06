import type { D1Database } from "@cloudflare/workers-types";
import { commitAuthorized, eventStatement, readIdentity, type IdentitySnapshot } from "./identity.js";

export type MatchPlan = { match_id: string; state: "to_arrange" | "planned" | "arranged"; arranged_on: string | null };

export async function readMatchPlans(db: D1Database, hash: string) {
  const identity = await readIdentity(db, hash, "session", null, [
    db.prepare(`SELECT p.match_id, p.state, p.arranged_on FROM match_plan p
      WHERE p.club_id = (SELECT id FROM club WHERE singleton = 1)
        AND p.member_id = (SELECT member_id FROM access_grant WHERE token_hash = ? AND kind = 'session')
        AND EXISTS (SELECT 1 FROM match m JOIN competition c ON c.id = m.competition_id
          JOIN season se ON se.id = c.season_id
          JOIN match_side s ON s.match_id = m.id JOIN entry e ON e.id = s.entry_id
          JOIN entry_member em ON em.entry_id = e.id
          WHERE m.id = p.match_id AND m.club_id = p.club_id AND m.status = 'open'
            AND c.state = 'active' AND c.visibility = 'members' AND se.state = 'active'
            AND (se.results_deadline_at IS NULL OR se.results_deadline_at > unixepoch('subsec') * 1000)
            AND e.state = 'active' AND em.member_id = p.member_id
            AND NOT EXISTS (SELECT 1 FROM match_side other JOIN entry oe ON oe.id = other.entry_id
              WHERE other.match_id = m.id AND oe.state = 'withdrawn'))
      ORDER BY p.match_id`).bind(hash),
  ]);
  return { identity, plans: identity.extraResults[0]!.results as MatchPlan[] };
}

/** Ownership and the state of the fixture are read in the mutation's revision snapshot. */
export async function readMatchPlanTarget(db: D1Database, hash: string, matchId: string) {
  const identity = await readIdentity(db, hash, "session", null, [
    db.prepare(`SELECT m.status, c.state, c.visibility, se.state AS season_state, se.results_deadline_at,
        e.state AS entry_state,
        EXISTS (SELECT 1 FROM match_side other JOIN entry oe ON oe.id = other.entry_id
          WHERE other.match_id = m.id AND oe.state = 'withdrawn') AS withdrawn
      FROM match m JOIN competition c ON c.id = m.competition_id AND c.club_id = m.club_id
      JOIN season se ON se.id = c.season_id AND se.club_id = m.club_id
      JOIN match_side s ON s.match_id = m.id AND s.club_id = m.club_id
      JOIN entry e ON e.id = s.entry_id AND e.club_id = m.club_id
      JOIN entry_member em ON em.entry_id = e.id AND em.club_id = m.club_id
      JOIN access_grant a ON a.member_id = em.member_id AND a.club_id = m.club_id
      WHERE m.id = ? AND a.token_hash = ? AND a.kind = 'session'
        AND m.club_id = (SELECT id FROM club WHERE singleton = 1)`).bind(matchId, hash),
  ]);
  const target = identity.extraResults[0]!.results[0] as {
    status: string; state: string; visibility: string; season_state: string; entry_state: string;
    results_deadline_at: number | null; withdrawn: number;
  } | undefined;
  return { identity, target };
}

export async function saveMatchPlan(db: D1Database, identity: IdentitySnapshot, plan: MatchPlan) {
  const credential = identity.credential!;
  const writes = plan.state === "to_arrange"
    ? [db.prepare("DELETE FROM match_plan WHERE club_id = ? AND member_id = ? AND match_id = ?")
      .bind(credential.club_id, credential.member_id, plan.match_id)]
    : [db.prepare(`INSERT INTO match_plan (club_id, member_id, match_id, state, arranged_on, updated_at)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(club_id, member_id, match_id)
        DO UPDATE SET state = excluded.state, arranged_on = excluded.arranged_on, updated_at = excluded.updated_at`)
      .bind(credential.club_id, credential.member_id, plan.match_id, plan.state, plan.arranged_on, identity.now)];
  writes.push(eventStatement(db, credential.club_id, "match.plan.updated", "match", plan.match_id,
    { type: "member", id: credential.member_id }, { state: plan.state }));
  await commitAuthorized(db, identity, writes);
  return plan;
}
