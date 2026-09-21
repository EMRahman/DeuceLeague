-- Progress views v3, the event feed, and the three lookups auth needs.
--
-- Hand-written and registered in meta/_journal.json by hand, like 0001, 0002,
-- 0004 and 0008. drizzle-kit does not manage views or functions.

-- ── deadlines on the club's calendar ────────────────────────────────────────

-- Whole days from today to a deadline, both counted in the club's time zone.
-- Casting a timestamptz straight to date uses the server's zone instead, which
-- puts a deadline of 00:30 on the 1st (London) on the 30th, and makes the
-- count change with whatever zone the connection happens to use.
CREATE OR REPLACE FUNCTION deuceleague_days_until(deadline timestamptz, zone text) RETURNS integer
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT (deadline AT TIME ZONE zone)::date - (now() AT TIME ZONE zone)::date $$;
--> statement-breakpoint

-- ── progress and chase views ────────────────────────────────────────────────
--
-- Changes from 0008: `open` replaces `scheduled`; days_remaining follows the
-- club's time zone; and a disputed match counts as outstanding, because either
-- side can clear it by re-entering its score or accepting the other's. On the
-- chase list it is `awaiting_you` for both players: the opponent has a score in
-- that they have not agreed to, and the fix is the same either way.

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
  deuceleague_days_until(s.results_deadline_at, cl.timezone) AS days_remaining,
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
JOIN club cl       ON cl.id = d.club_id
CROSS JOIN LATERAL (
  SELECT
    count(*)                                                                AS matches,
    count(*) FILTER (WHERE m.status = 'played')                             AS played,
    -- Everything not yet in the ledger.
    count(*) FILTER (WHERE m.status IN ('open', 'reported', 'disputed'))    AS outstanding,
    -- One side has claimed a score and is waiting on the other.
    count(*) FILTER (WHERE m.status = 'reported')                           AS reported,
    -- Both have claimed and they differ. Either can re-enter; the coach can settle it.
    count(*) FILTER (WHERE m.status = 'disputed')                           AS disputed
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
    count(*)                                                             AS matches,
    count(*) FILTER (WHERE m.status = 'played')                          AS played,
    count(*) FILTER (WHERE m.status IN ('open', 'reported', 'disputed')) AS outstanding
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
  s.results_deadline_at,
  deuceleague_days_until(s.results_deadline_at, cl.timezone) AS days_remaining,
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
JOIN club cl            ON cl.id = m.club_id
LEFT JOIN division d    ON d.id = m.division_id
LEFT JOIN match_side s0 ON s0.match_id = m.id AND s0.side_index = 0
LEFT JOIN match_side s1 ON s1.match_id = m.id AND s1.side_index = 1
LEFT JOIN entry_label a ON a.entry_id = s0.entry_id
LEFT JOIN entry_label b ON b.entry_id = s1.entry_id
WHERE m.status IN ('open', 'reported', 'disputed');
--> statement-breakpoint

-- One row per member with something outstanding, split by what is actually
-- needed from them. The three counts always add up to outstanding_matches.
-- `awaiting_you` is the one that clears a match with a single click.
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
  -- The opponent has a score in that this member has not agreed to: either
  -- they have not answered, or they did and the scores differ. Accepting it
  -- clears the match in one click; so does either side correcting its score.
  count(*) FILTER (WHERE sides.opponent_claimed)
                            AS awaiting_you,
  -- This member reported and the opponent has not answered.
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

-- ── the event feed ──────────────────────────────────────────────────────────
--
-- The event log in the order a consumer should read it. Event ids are handed
-- out before commit, so a slow request can commit event 41 after 42 is already
-- visible, and a reader paging on id alone skips 41 for good. This view holds
-- an event back until its transaction, and every older one, has finished;
-- after that nothing can appear before it. Page on (tx_id, id):
--
--   SELECT * FROM event_feed
--   WHERE (tx_id, id) > ($last_tx_id, $last_id)
--   ORDER BY tx_id, id
--   LIMIT 100;
--
-- A long-running write transaction delays delivery. It never loses anything.
CREATE VIEW event_feed WITH (security_invoker = true) AS
SELECT id, tx_id, club_id, occurred_at, type, subject_type, subject_id,
       actor_type, actor_id, payload
FROM event
WHERE tx_id < pg_snapshot_xmin(pg_current_snapshot());
--> statement-breakpoint

-- Views are for reading. The default privileges from 0002 would otherwise let
-- the application write through the simple ones, event_feed included.
REVOKE ALL ON entry_label, division_progress, competition_progress, entry_progress,
              outstanding_match, member_chase_list, event_feed
  FROM deuceleague_app;
--> statement-breakpoint
GRANT SELECT ON entry_label, division_progress, competition_progress, entry_progress,
                outstanding_match, member_chase_list, event_feed
  TO deuceleague_app;
--> statement-breakpoint

-- ── finding the club before the club is known ───────────────────────────────
--
-- Row-level security hides every row until app.club_id is set, but a request
-- arrives carrying an API key, a magic-link token or a club's slug, not a club
-- id. These three functions are the only way past that: each takes the one
-- thing a request carries and returns just enough to set the club, and nothing
-- else. SECURITY DEFINER runs them as the tables' owner, which RLS does not
-- apply to; search_path is pinned so nobody can substitute their own tables.
-- The API calls one, then SET LOCAL app.club_id, and everything after that is
-- under row-level security as usual.

-- A live API key: not revoked, not expired.
CREATE OR REPLACE FUNCTION deuceleague_resolve_api_key(key_hash text)
  RETURNS TABLE (club_id uuid, api_key_id uuid, scopes text[])
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT k.club_id, k.id, k.scopes
    FROM api_key k
    WHERE k.key_hash = deuceleague_resolve_api_key.key_hash
      AND k.revoked_at IS NULL
      AND (k.expires_at IS NULL OR k.expires_at > now())
  $$;
--> statement-breakpoint

-- An unexpired grant for a member who has not been removed. used_at comes back
-- so the API can refuse a magic link the second time; a session token ignores it.
CREATE OR REPLACE FUNCTION deuceleague_resolve_access_grant(token_hash text)
  RETURNS TABLE (club_id uuid, access_grant_id uuid, member_id uuid, scopes text[],
                 used_at timestamptz)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT g.club_id, g.id, g.member_id, g.scopes, g.used_at
    FROM access_grant g
    JOIN member mb ON mb.id = g.member_id AND mb.deleted_at IS NULL
    WHERE g.token_hash = deuceleague_resolve_access_grant.token_hash
      AND g.expires_at > now()
  $$;
--> statement-breakpoint

-- A club's id from its public slug, for unauthenticated pages. Null if unknown.
CREATE OR REPLACE FUNCTION deuceleague_club_id_for_slug(slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$ SELECT c.id FROM club c WHERE c.slug = deuceleague_club_id_for_slug.slug $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION deuceleague_resolve_api_key(text),
                       deuceleague_resolve_access_grant(text),
                       deuceleague_club_id_for_slug(text)
  FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION deuceleague_resolve_api_key(text),
                          deuceleague_resolve_access_grant(text),
                          deuceleague_club_id_for_slug(text)
  TO deuceleague_app;
