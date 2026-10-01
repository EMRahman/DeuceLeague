import type { D1Database } from "@cloudflare/workers-types";
import { readIdentity, type CredentialKind } from "./identity.js";

type Row = Record<string, unknown>;

/** What happened on a match that was disputed at some point, in the order it happened. */
export type DisputeEvent = { matchId: string; type: string; payload: Record<string, unknown> };
/** Who played on one side of such a match, and which season it belongs to. */
export type DisputeSide = { matchId: string; seasonState: string; side: 0 | 1; memberId: string; displayName: string };

/**
 * Every match that was ever disputed: the events that say how each dispute ended, and who was on each
 * side. Found through the event log's type index, then each match's own events by their subject index,
 * so it reads the disputes and nothing else, however long the club's history is.
 */
export async function readDisputeHistory(db: D1Database, hash: string, kind: CredentialKind) {
  const identity = await readIdentity(db, hash, kind, null, [
    db.prepare(`SELECT e.subject_id AS match_id, e.type, e.payload FROM event e
      WHERE e.club_id = (SELECT id FROM club WHERE singleton = 1) AND e.subject_type = 'match'
        AND e.type IN ('match.disputed', 'match.claim.reported', 'match.claim.accepted', 'match.result.confirmed')
        AND e.subject_id IN (SELECT d.subject_id FROM event d
          WHERE d.club_id = (SELECT id FROM club WHERE singleton = 1) AND d.type = 'match.disputed')
      ORDER BY e.subject_id, e.id`),
    db.prepare(`SELECT m.id AS match_id, s.state AS season_state, ms.side_index, mb.id AS member_id, mb.display_name
      FROM match m JOIN competition c ON c.id = m.competition_id JOIN season s ON s.id = c.season_id
      JOIN match_side ms ON ms.match_id = m.id JOIN entry_member em ON em.entry_id = ms.entry_id
      JOIN member mb ON mb.id = em.member_id
      WHERE m.id IN (SELECT d.subject_id FROM event d
        WHERE d.club_id = (SELECT id FROM club WHERE singleton = 1) AND d.type = 'match.disputed')`),
  ]);
  const [events, sides] = identity.extraResults.map((r) => r.results as Row[]);
  return {
    identity,
    events: events!.map((e): DisputeEvent => ({ matchId: String(e.match_id), type: String(e.type),
      payload: JSON.parse(String(e.payload)) as Record<string, unknown> })),
    sides: sides!.map((s): DisputeSide => ({ matchId: String(s.match_id), seasonState: String(s.season_state),
      side: Number(s.side_index) as 0 | 1, memberId: String(s.member_id), displayName: String(s.display_name) })),
  };
}
