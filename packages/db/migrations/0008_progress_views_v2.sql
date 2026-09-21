-- Progress and chase views, rebuilt for agreement-only results.
--
-- Two changes from 0004: `arranged` becomes `reported`, and the views now
-- distinguish *why* a match is outstanding. "Go and play your match" and "your
-- opponent has reported a score and is waiting on you" are different emails,
-- so the chase list counts them separately.

DROP VIEW IF EXISTS member_chase_list;
--> statement-breakpoint
DROP VIEW IF EXISTS outstanding_match;
--> statement-breakpoint
DROP VIEW IF EXISTS entry_progress;
--> statement-breakpoint
DROP VIEW IF EXISTS competition_progress;
--> statement-breakpoint
DROP VIEW IF EXISTS division_progress;
--> statement-breakpoint

CREATE VIEW division_progress WITH (security_invoker = true) AS
SELECT
  d.club_id,
  d.competition_id,
  c.name                        AS competition_name,
  d.id                          AS division_id,
  d.ordinal                     AS division_ordinal,
  d.name                        AS division_name,
  s.id                          AS season_id,
  s.name                        AS season_name,
  s.results_deadline_at,
  (s.results_deadline_at::date - CURRENT_DATE) AS days_remaining,
  (SELECT count(*) FROM entry e
    WHERE e.division_id = d.id AND e.state = 'active')  AS active_entries,
  mm.matches,
  mm.played,
  mm.outstanding,
  mm.reported,
  mm.disputed,
  CASE WHEN mm.matches = 0 THEN NULL
       ELSE round(100.0 * mm.played / mm.matches, 1) END AS percent_played
FROM division d
JOIN competition c ON c.id = d.competition_id
JOIN season s      ON s.id = c.season_id
CROSS JOIN LATERAL (
  SELECT
    count(*)                                                      AS matches,
    count(*) FILTER (WHERE m.status = 'played')                   AS played,
    count(*) FILTER (WHERE m.status IN ('scheduled', 'reported')) AS outstanding,
    -- One side has claimed a score and is waiting on the other.
    count(*) FILTER (WHERE m.status = 'reported')                 AS reported,
    -- Both have claimed and they differ; only the coach can move this on.
    count(*) FILTER (WHERE m.status = 'disputed')                 AS disputed
  FROM match m
  WHERE m.division_id = d.id AND m.status <> 'void'
) mm;
--> statement-breakpoint

CREATE VIEW competition_progress WITH (security_invoker = true) AS
SELECT
  club_id, competition_id, competition_name, season_id, season_name,
  results_deadline_at,
  max(days_remaining)      AS days_remaining,
  count(*)                 AS divisions,
  sum(active_entries)      AS active_entries,
  sum(matches)             AS matches,
  sum(played)              AS played,
  sum(outstanding)         AS outstanding,
  sum(reported)            AS reported,
  sum(disputed)            AS disputed,
  CASE WHEN sum(matches) = 0 THEN NULL
       ELSE round(100.0 * sum(played) / sum(matches), 1) END AS percent_played
FROM division_progress
GROUP BY club_id, competition_id, competition_name, season_id, season_name,
         results_deadline_at;
--> statement-breakpoint

CREATE VIEW entry_progress WITH (security_invoker = true) AS
SELECT
  el.club_id, el.competition_id, el.division_id, el.entry_id,
  el.label, el.member_ids, el.state,
  p.matches, p.played, p.outstanding
FROM entry_label el
CROSS JOIN LATERAL (
  SELECT
    count(*)                                                      AS matches,
    count(*) FILTER (WHERE m.status = 'played')                   AS played,
    count(*) FILTER (WHERE m.status IN ('scheduled', 'reported')) AS outstanding
  FROM match_side ms
  JOIN match m ON m.id = ms.match_id
  WHERE ms.entry_id = el.entry_id AND m.status <> 'void'
) p;
--> statement-breakpoint

-- Every match still out of the ledger, with both sides named and a flag for
-- whether each side has a live claim standing.
CREATE VIEW outstanding_match WITH (security_invoker = true) AS
SELECT
  m.club_id,
  m.competition_id,
  c.name                        AS competition_name,
  m.division_id,
  d.name                        AS division_name,
  d.ordinal                     AS division_ordinal,
  m.id                          AS match_id,
  m.status,
  m.scheduled_at,
  s.results_deadline_at,
  (s.results_deadline_at::date - CURRENT_DATE) AS days_remaining,
  a.entry_id                    AS side0_entry_id,
  a.label                       AS side0_label,
  a.member_ids                  AS side0_member_ids,
  EXISTS (SELECT 1 FROM result_submission rs
           WHERE rs.match_id = m.id AND rs.side_index = 0
             AND rs.state = 'pending')        AS side0_claimed,
  b.entry_id                    AS side1_entry_id,
  b.label                       AS side1_label,
  b.member_ids                  AS side1_member_ids,
  EXISTS (SELECT 1 FROM result_submission rs
           WHERE rs.match_id = m.id AND rs.side_index = 1
             AND rs.state = 'pending')        AS side1_claimed
FROM match m
JOIN competition c      ON c.id = m.competition_id
JOIN season s           ON s.id = c.season_id
LEFT JOIN division d    ON d.id = m.division_id
LEFT JOIN match_side s0 ON s0.match_id = m.id AND s0.side_index = 0
LEFT JOIN match_side s1 ON s1.match_id = m.id AND s1.side_index = 1
LEFT JOIN entry_label a ON a.entry_id = s0.entry_id
LEFT JOIN entry_label b ON b.entry_id = s1.entry_id
WHERE m.status IN ('scheduled', 'reported');
--> statement-breakpoint

-- One row per member with something outstanding, split by what is actually
-- needed from them. `awaiting_them` is the polite nudge; `awaiting_you` is the
-- one that clears a match with a single click.
--
-- NOTE: exposes member email, because that is what the job needs. The API
-- surfaces it only under the `members:pii` scope. RLS still applies; scope
-- gating does not.
CREATE VIEW member_chase_list WITH (security_invoker = true) AS
WITH sides AS (
  SELECT club_id, competition_id, competition_name, division_id, division_name,
         division_ordinal, match_id, days_remaining,
         side0_member_ids AS member_ids, side1_label AS opponent_label,
         side0_claimed    AS claimed,    side1_claimed AS opponent_claimed
  FROM outstanding_match
  UNION ALL
  SELECT club_id, competition_id, competition_name, division_id, division_name,
         division_ordinal, match_id, days_remaining,
         side1_member_ids AS member_ids, side0_label AS opponent_label,
         side1_claimed    AS claimed,    side0_claimed AS opponent_claimed
  FROM outstanding_match
)
SELECT
  sides.club_id,
  sides.competition_id,
  sides.competition_name,
  sides.division_id,
  sides.division_name,
  sides.division_ordinal,
  mb.id                     AS member_id,
  mb.display_name,
  mb.email,
  count(*)                  AS outstanding_matches,
  -- Nobody has reported: the match still has to be played.
  count(*) FILTER (WHERE NOT sides.claimed AND NOT sides.opponent_claimed)
                            AS needs_playing,
  -- The opponent reported and is waiting on this member to accept or differ.
  count(*) FILTER (WHERE sides.opponent_claimed AND NOT sides.claimed)
                            AS awaiting_you,
  -- This member reported and is waiting on the opponent.
  count(*) FILTER (WHERE sides.claimed AND NOT sides.opponent_claimed)
                            AS awaiting_them,
  min(sides.days_remaining) AS days_remaining,
  array_agg(sides.opponent_label ORDER BY sides.opponent_label) AS waiting_on
FROM sides
CROSS JOIN LATERAL unnest(sides.member_ids) AS u(member_id)
JOIN member mb ON mb.id = u.member_id AND mb.deleted_at IS NULL
GROUP BY sides.club_id, sides.competition_id, sides.competition_name,
         sides.division_id, sides.division_name, sides.division_ordinal,
         mb.id, mb.display_name, mb.email;
--> statement-breakpoint

GRANT SELECT ON division_progress, competition_progress, entry_progress,
                outstanding_match, member_chase_list
  TO deuceleague_app;
