-- Progress and chase views.
--
-- These answer the two questions a coach asks all season: how much has been
-- played, and who do I need to chase. They are views rather than endpoints so
-- the same query serves the API, a coach's own SQL, and an agent asked to
-- "email everyone with matches outstanding and a fortnight to go".
--
-- Every view is security_invoker, so row-level security follows through them.
-- A view that is not would hand one club another club's data.

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
DROP VIEW IF EXISTS entry_label;
--> statement-breakpoint

-- How a competing unit is written on a results sheet: the entry's own name if
-- it has one, otherwise its members, player before partner.
CREATE VIEW entry_label WITH (security_invoker = true) AS
SELECT
  e.id                AS entry_id,
  e.club_id,
  e.competition_id,
  e.division_id,
  e.state,
  COALESCE(
    e.display_name,
    string_agg(mb.display_name, ' / ' ORDER BY em.role DESC, mb.display_name)
  )                   AS label,
  array_agg(mb.id ORDER BY em.role DESC, mb.display_name) AS member_ids
FROM entry e
JOIN entry_member em ON em.entry_id = e.id
JOIN member mb       ON mb.id = em.member_id
GROUP BY e.id, e.club_id, e.competition_id, e.division_id, e.state, e.display_name;
--> statement-breakpoint

-- "How far through is Division 2?" One row per division.
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
  mm.disputed,
  CASE WHEN mm.matches = 0 THEN NULL
       ELSE round(100.0 * mm.played / mm.matches, 1) END AS percent_played
FROM division d
JOIN competition c ON c.id = d.competition_id
JOIN season s      ON s.id = c.season_id
CROSS JOIN LATERAL (
  SELECT
    count(*)                                                        AS matches,
    count(*) FILTER (WHERE m.status = 'played')                     AS played,
    count(*) FILTER (WHERE m.status IN ('scheduled', 'arranged'))   AS outstanding,
    count(*) FILTER (WHERE m.status = 'disputed')                   AS disputed
  FROM match m
  WHERE m.division_id = d.id AND m.status <> 'void'
) mm;
--> statement-breakpoint

-- The same rolled up to a whole league.
CREATE VIEW competition_progress WITH (security_invoker = true) AS
SELECT
  club_id,
  competition_id,
  competition_name,
  season_id,
  season_name,
  results_deadline_at,
  max(days_remaining)      AS days_remaining,
  count(*)                 AS divisions,
  sum(active_entries)      AS active_entries,
  sum(matches)             AS matches,
  sum(played)              AS played,
  sum(outstanding)         AS outstanding,
  sum(disputed)            AS disputed,
  CASE WHEN sum(matches) = 0 THEN NULL
       ELSE round(100.0 * sum(played) / sum(matches), 1) END AS percent_played
FROM division_progress
GROUP BY club_id, competition_id, competition_name, season_id, season_name,
         results_deadline_at;
--> statement-breakpoint

-- Per competing unit: played, outstanding, and how they are doing at turning up.
CREATE VIEW entry_progress WITH (security_invoker = true) AS
SELECT
  el.club_id,
  el.competition_id,
  el.division_id,
  el.entry_id,
  el.label,
  el.member_ids,
  el.state,
  p.matches,
  p.played,
  p.outstanding
FROM entry_label el
CROSS JOIN LATERAL (
  SELECT
    count(*)                                                      AS matches,
    count(*) FILTER (WHERE m.status = 'played')                   AS played,
    count(*) FILTER (WHERE m.status IN ('scheduled', 'arranged')) AS outstanding
  FROM match_side ms
  JOIN match m ON m.id = ms.match_id
  WHERE ms.entry_id = el.entry_id AND m.status <> 'void'
) p;
--> statement-breakpoint

-- Every match still to be played, with both sides named.
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
  b.entry_id                    AS side1_entry_id,
  b.label                       AS side1_label,
  b.member_ids                  AS side1_member_ids
FROM match m
JOIN competition c      ON c.id = m.competition_id
JOIN season s           ON s.id = c.season_id
LEFT JOIN division d    ON d.id = m.division_id
LEFT JOIN match_side s0 ON s0.match_id = m.id AND s0.side_index = 0
LEFT JOIN match_side s1 ON s1.match_id = m.id AND s1.side_index = 1
LEFT JOIN entry_label a ON a.entry_id = s0.entry_id
LEFT JOIN entry_label b ON b.entry_id = s1.entry_id
WHERE m.status IN ('scheduled', 'arranged');
--> statement-breakpoint

-- One row per member with matches outstanding: what to send a reminder about,
-- and who they are waiting on. Filter by days_remaining for "a month out" and
-- "a fortnight out" — the coach decides whether anything is actually sent.
--
-- NOTE: this view exposes member email. The API surfaces it only under the
-- `members:pii` scope. Row-level security still applies; scope gating does not.
CREATE VIEW member_chase_list WITH (security_invoker = true) AS
WITH sides AS (
  SELECT club_id, competition_id, competition_name, division_id, division_name,
         division_ordinal, match_id, days_remaining,
         side0_member_ids AS member_ids, side1_label AS opponent_label
  FROM outstanding_match
  UNION ALL
  SELECT club_id, competition_id, competition_name, division_id, division_name,
         division_ordinal, match_id, days_remaining,
         side1_member_ids AS member_ids, side0_label AS opponent_label
  FROM outstanding_match
)
SELECT
  sides.club_id,
  sides.competition_id,
  sides.competition_name,
  sides.division_id,
  sides.division_name,
  sides.division_ordinal,
  mb.id                 AS member_id,
  mb.display_name,
  mb.email,
  count(*)              AS outstanding_matches,
  min(sides.days_remaining) AS days_remaining,
  array_agg(sides.opponent_label ORDER BY sides.opponent_label) AS waiting_on
FROM sides
CROSS JOIN LATERAL unnest(sides.member_ids) AS u(member_id)
JOIN member mb ON mb.id = u.member_id AND mb.deleted_at IS NULL
GROUP BY sides.club_id, sides.competition_id, sides.competition_name,
         sides.division_id, sides.division_name, sides.division_ordinal,
         mb.id, mb.display_name, mb.email;
--> statement-breakpoint

GRANT SELECT ON entry_label, division_progress, competition_progress,
                entry_progress, outstanding_match, member_chase_list
  TO deuceleague_app;
