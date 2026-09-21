-- Proves the guarantees the schema claims to make. Run against a scratch
-- database after the migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/constraints.sql
-- Everything runs in one transaction and rolls back, so it leaves no trace.

BEGIN;

\set c1 '11111111-1111-7111-8111-111111111111'
\set c2 '22222222-2222-7222-8222-222222222222'
\set ms 'c0000000-0000-7000-8000-000000000001'
\set straight '{"sets":[{"games":[6,4]},{"games":[6,3]}]}'

INSERT INTO club (id, slug, name) VALUES
  (:'c1', 'deuce-ltc', 'Deuce Lawn Tennis Club'),
  (:'c2', 'other-ltc', 'Other Tennis Club');

INSERT INTO member (id, club_id, display_name) VALUES
  ('a0000000-0000-7000-8000-000000000001', :'c1', 'J. Abbott'),
  ('a0000000-0000-7000-8000-000000000002', :'c1', 'K. Brar'),
  ('a0000000-0000-7000-8000-000000000003', :'c1', 'L. Chen'),
  ('a0000000-0000-7000-8000-000000000004', :'c1', 'M. Doyle'),
  ('b0000000-0000-7000-8000-000000000001', :'c2', 'Z. Foreign');

INSERT INTO season (id, club_id, name, kind, year, starts_on, ends_on, state) VALUES
  ('50000000-0000-7000-8000-000000000001', :'c1', 'Spring 2026', 'spring', 2026,
   '2026-03-01', '2026-05-24', 'active');

INSERT INTO competition (id, club_id, season_id, name, discipline, category, match_format, rules) VALUES
  (:'ms', :'c1', '50000000-0000-7000-8000-000000000001',
   'Men''s Singles', 'singles', 'mens', '{}', '{}'),
  ('c0000000-0000-7000-8000-000000000002', :'c1', '50000000-0000-7000-8000-000000000001',
   'Mixed Doubles', 'doubles', 'mixed', '{}', '{}');

INSERT INTO division (id, club_id, competition_id, ordinal, name) VALUES
  ('d0000000-0000-7000-8000-000000000001', :'c1', :'ms', 1, 'Division 1'),
  ('d0000000-0000-7000-8000-000000000002', :'c1', :'ms', 2, 'Division 2'),
  ('d0000000-0000-7000-8000-000000000003', :'c1', 'c0000000-0000-7000-8000-000000000002', 1, 'Division 1');

-- Two singles entries: one member each.
INSERT INTO entry (id, club_id, competition_id, division_id, placement_reason) VALUES
  ('e0000000-0000-7000-8000-000000000001', :'c1', :'ms', 'd0000000-0000-7000-8000-000000000001', 'new'),
  ('e0000000-0000-7000-8000-000000000003', :'c1', :'ms', 'd0000000-0000-7000-8000-000000000001', 'new');
INSERT INTO entry_member (entry_id, member_id, competition_id, club_id, role) VALUES
  ('e0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001', :'ms', :'c1', 'player'),
  ('e0000000-0000-7000-8000-000000000003', 'a0000000-0000-7000-8000-000000000003', :'ms', :'c1', 'player');

-- A doubles entry: two members, promoted as a unit.
INSERT INTO entry (id, club_id, competition_id, division_id, placement_reason) VALUES
  ('e0000000-0000-7000-8000-000000000002', :'c1', 'c0000000-0000-7000-8000-000000000002',
   'd0000000-0000-7000-8000-000000000003', 'promoted');
INSERT INTO entry_member (entry_id, member_id, competition_id, club_id, role) VALUES
  ('e0000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000001',
   'c0000000-0000-7000-8000-000000000002', :'c1', 'player'),
  ('e0000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000002',
   'c0000000-0000-7000-8000-000000000002', :'c1', 'partner');

\echo '  PASS  a member may enter several competitions (singles and doubles)'

DO $$
BEGIN
  -- Same member, second division of the SAME competition. Must be refused.
  INSERT INTO entry (id, club_id, competition_id, division_id)
    VALUES ('e0000000-0000-7000-8000-000000000009',
            '11111111-1111-7111-8111-111111111111',
            'c0000000-0000-7000-8000-000000000001',
            'd0000000-0000-7000-8000-000000000002');
  INSERT INTO entry_member (entry_id, member_id, competition_id, club_id)
    VALUES ('e0000000-0000-7000-8000-000000000009',
            'a0000000-0000-7000-8000-000000000001',
            'c0000000-0000-7000-8000-000000000001',
            '11111111-1111-7111-8111-111111111111');
  RAISE EXCEPTION 'FAIL: a member was allowed into two divisions of one competition';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  a member cannot be in two divisions of one competition';
END $$;

DO $$
BEGIN
  -- An entry from club 1 containing a member of club 2. rls.sql covers the
  -- same attempt made from inside club 2, where row-level security is in play.
  INSERT INTO entry_member (entry_id, member_id, competition_id, club_id)
    VALUES ('e0000000-0000-7000-8000-000000000001',
            'b0000000-0000-7000-8000-000000000001',
            'c0000000-0000-7000-8000-000000000001',
            '11111111-1111-7111-8111-111111111111');
  RAISE EXCEPTION 'FAIL: a member from another club joined this entry';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '  PASS  composite keys block cross-club references';
END $$;

DO $$
BEGIN
  INSERT INTO division (club_id, competition_id, ordinal, name)
    VALUES ('11111111-1111-7111-8111-111111111111',
            'c0000000-0000-7000-8000-000000000001', 1, 'Duplicate Division 1');
  RAISE EXCEPTION 'FAIL: two divisions share an ordinal';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  division ordinals are unique within a competition';
END $$;

-- ── fixtures ────────────────────────────────────────────────────────────────

-- Fixtures are matches without scores. Generation is keyed so it cannot duplicate.
INSERT INTO match (id, club_id, competition_id, division_id, pairing_key) VALUES
  ('f0000000-0000-7000-8000-000000000001', :'c1', :'ms',
   'd0000000-0000-7000-8000-000000000001', 'e0000000-...0001|e0000000-...0003');

DO $$
BEGIN
  INSERT INTO match (club_id, competition_id, division_id, pairing_key)
    VALUES ('11111111-1111-7111-8111-111111111111',
            'c0000000-0000-7000-8000-000000000001',
            'd0000000-0000-7000-8000-000000000001',
            'e0000000-...0001|e0000000-...0003');
  RAISE EXCEPTION 'FAIL: the same pairing was generated twice';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  re-running fixture generation cannot duplicate a pairing';
END $$;

INSERT INTO match_side (club_id, match_id, competition_id, side_index, entry_id) VALUES
  (:'c1', 'f0000000-0000-7000-8000-000000000001', :'ms', 0, 'e0000000-0000-7000-8000-000000000001'),
  (:'c1', 'f0000000-0000-7000-8000-000000000001', :'ms', 1, 'e0000000-0000-7000-8000-000000000003');

DO $$
BEGIN
  PERFORM 1 FROM information_schema.columns
   WHERE table_name = 'match' AND column_name IN ('scheduled_at', 'court');
  IF FOUND THEN RAISE EXCEPTION 'FAIL: a match still carries a date or a court'; END IF;
  RAISE NOTICE '  PASS  a fixture has no date, time or court: arranging it is up to the players';
END $$;

-- A second fixture, used below.
INSERT INTO match (id, club_id, competition_id, division_id) VALUES
  ('f0000000-0000-7000-8000-000000000002', :'c1', :'ms', 'd0000000-0000-7000-8000-000000000001');
INSERT INTO match_side (club_id, match_id, competition_id, side_index, entry_id) VALUES
  (:'c1', 'f0000000-0000-7000-8000-000000000002', :'ms', 0, 'e0000000-0000-7000-8000-000000000001');

DO $$
BEGIN
  INSERT INTO match_side (club_id, match_id, competition_id, side_index, entry_id)
    VALUES ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000002',
            'c0000000-0000-7000-8000-000000000001', 1, 'e0000000-0000-7000-8000-000000000001');
  RAISE EXCEPTION 'FAIL: an entry was drawn against itself';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  an entry cannot be drawn against itself';
END $$;

DO $$
BEGIN
  -- The Mixed Doubles pair, put on a Men's Singles match.
  INSERT INTO match_side (club_id, match_id, competition_id, side_index, entry_id)
    VALUES ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000002',
            'c0000000-0000-7000-8000-000000000001', 1, 'e0000000-0000-7000-8000-000000000002');
  RAISE EXCEPTION 'FAIL: a side came from another competition';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '  PASS  both sides of a match come from its own competition';
END $$;

INSERT INTO match_side (club_id, match_id, competition_id, side_index, entry_id) VALUES
  (:'c1', 'f0000000-0000-7000-8000-000000000002', :'ms', 1, 'e0000000-0000-7000-8000-000000000003');

-- ── claims ──────────────────────────────────────────────────────────────────

-- Both sides report the match independently; neither rubber-stamps the other.
INSERT INTO result_submission (id, club_id, match_id, side_index, outcome, source, state, score) VALUES
  ('cc000000-0000-7000-8000-000000000101', :'c1', 'f0000000-0000-7000-8000-000000000001',
   0, 'completed', 'telegram', 'pending', :'straight'),
  ('cc000000-0000-7000-8000-000000000102', :'c1', 'f0000000-0000-7000-8000-000000000001',
   1, 'completed', 'web', 'pending', '{"sets":[{"games":[6,4]},{"games":[6,2]}]}');
\echo '  PASS  the two sides may hold a live claim each'

DO $$
BEGIN
  INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state, score)
    VALUES ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000001',
            0, 'completed', 'web', 'pending', '{"sets":[{"games":[6,1]},{"games":[6,1]}]}');
  RAISE EXCEPTION 'FAIL: one side lodged two live claims';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  a side may hold only one live claim';
END $$;

DO $$
BEGIN
  -- Without a side, it would also slip past the one-live-claim-per-side rule.
  INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state, score)
    VALUES ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000001',
            NULL, 'completed', 'api', 'pending', '{"sets":[{"games":[6,1]},{"games":[6,1]}]}');
  RAISE EXCEPTION 'FAIL: a claim with no side was left waiting';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  a claim with no side settles the match; it never waits on anyone';
END $$;

DO $$
BEGIN
  INSERT INTO result_submission (club_id, match_id, side_index, outcome, retired_side, source, score)
    VALUES ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000002',
            0, 'walkover', 1, 'web', '{"sets":[{"games":[6,0]}]}');
  RAISE EXCEPTION 'FAIL: a walkover was recorded with a score';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  a claim''s score and stopped side must fit its outcome';
END $$;

DO $$
BEGIN
  INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state, score)
    VALUES ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000002',
            0, 'completed', 'web', 'rejected', '{"sets":[{"games":[6,4]},{"games":[6,3]}]}');
  RAISE EXCEPTION 'FAIL: a claim was rejected';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  a claim is replaced or settled, never rejected';
END $$;

-- A live claim on the second fixture, used below.
INSERT INTO result_submission (id, club_id, match_id, side_index, outcome, source, score) VALUES
  ('cc000000-0000-7000-8000-000000000201', :'c1', 'f0000000-0000-7000-8000-000000000002',
   0, 'completed', 'web', :'straight');

DO $$
BEGIN
  -- Side 1 of the second match "accepts" a claim made about the first.
  INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, score,
                                 accepts_submission_id)
    VALUES ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000002',
            1, 'completed', 'web', '{"sets":[{"games":[6,4]},{"games":[6,3]}]}',
            'cc000000-0000-7000-8000-000000000101');
  RAISE EXCEPTION 'FAIL: an acceptance pointed at another match''s claim';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '  PASS  an acceptance can only be of a claim on the same match';
END $$;

-- Superseded claims stay as history; a coach entry speaks for the whole match.
UPDATE result_submission SET state = 'superseded'
  WHERE match_id = 'f0000000-0000-7000-8000-000000000001';
INSERT INTO result_submission (id, club_id, match_id, side_index, outcome, source, state,
                               score, confirmed_at) VALUES
  ('cc000000-0000-7000-8000-000000000103', :'c1', 'f0000000-0000-7000-8000-000000000001',
   NULL, 'completed', 'coach_entry', 'confirmed', :'straight', now());
\echo '  PASS  a coach override supersedes without deleting the trail'

-- ── the ledger ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  UPDATE match SET status = 'played' WHERE id = 'f0000000-0000-7000-8000-000000000001';
  RAISE EXCEPTION 'FAIL: a match was played without saying how it ended';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  a played match must say how it ended';
END $$;

DO $$
BEGIN
  UPDATE match SET status = 'played', outcome = 'completed', winning_side = 0,
         score = '{"sets":[{"games":[6,4]},{"games":[6,3]}]}'
   WHERE id = 'f0000000-0000-7000-8000-000000000001';
  RAISE EXCEPTION 'FAIL: a result entered the ledger with no claim behind it';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  a played match must name the claim that settled it';
END $$;

DO $$
BEGIN
  UPDATE match SET status = 'played', outcome = 'completed', winning_side = 0,
         score = '{"sets":[{"games":[6,4]},{"games":[6,3]}]}',
         accepted_submission_id = 'cc000000-0000-7000-8000-000000000201'
   WHERE id = 'f0000000-0000-7000-8000-000000000001';
  RAISE EXCEPTION 'FAIL: the ledger pointed at a claim about another match';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '  PASS  the ledger can only point at a claim about this match';
END $$;

DO $$
BEGIN
  UPDATE match SET status = 'played', outcome = 'retired', winning_side = 0, retired_side = 0,
         score = '{"sets":[{"games":[6,4]},{"games":[2,1]}]}',
         accepted_submission_id = 'cc000000-0000-7000-8000-000000000103'
   WHERE id = 'f0000000-0000-7000-8000-000000000001';
  RAISE EXCEPTION 'FAIL: the side that retired was recorded as the winner';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  the winner cannot be the side that retired';
END $$;

UPDATE match SET status = 'played', outcome = 'completed', winning_side = 0, score = :'straight',
       accepted_submission_id = 'cc000000-0000-7000-8000-000000000103'
 WHERE id = 'f0000000-0000-7000-8000-000000000001';
\echo '  PASS  a played match records the claim that settled it'

-- ── the event log ───────────────────────────────────────────────────────────

INSERT INTO event (club_id, type, subject_type, subject_id, actor_type) VALUES
  (:'c1', 'match.result.confirmed', 'match', 'f0000000-0000-7000-8000-000000000001', 'system');

DO $$
BEGIN
  -- This transaction is still open, so its event must not be readable yet.
  -- test/event_feed.sh proves the ordering with two real transactions.
  PERFORM 1 FROM event_feed WHERE club_id = '11111111-1111-7111-8111-111111111111';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: the feed showed an event from an open transaction'; END IF;
  RAISE NOTICE '  PASS  an event stays out of the feed until its transaction has finished';
END $$;

DO $$
BEGIN
  UPDATE event SET type = 'tampered' WHERE club_id = '11111111-1111-7111-8111-111111111111';
  RAISE EXCEPTION 'FAIL: the audit log was rewritten';
EXCEPTION WHEN raise_exception THEN
  IF sqlerrm LIKE 'FAIL:%' THEN RAISE; END IF;
  RAISE NOTICE '  PASS  the event log rejects updates';
END $$;

DO $$
BEGIN
  DELETE FROM event WHERE club_id = '11111111-1111-7111-8111-111111111111';
  RAISE EXCEPTION 'FAIL: audit rows were deleted';
EXCEPTION WHEN raise_exception THEN
  IF sqlerrm LIKE 'FAIL:%' THEN RAISE; END IF;
  RAISE NOTICE '  PASS  the event log rejects deletes';
END $$;

-- ── everything else ─────────────────────────────────────────────────────────

DO $$
BEGIN
  INSERT INTO season (club_id, name, starts_on, ends_on)
    VALUES ('11111111-1111-7111-8111-111111111111', 'Backwards', '2026-06-01', '2026-03-01');
  RAISE EXCEPTION 'FAIL: a season ended before it started';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  a season cannot end before it starts';
END $$;

DO $$
BEGIN
  INSERT INTO competition (club_id, season_id, name, discipline, match_format, rules)
    VALUES ('11111111-1111-7111-8111-111111111111',
            '50000000-0000-7000-8000-000000000001', 'Nonsense', 'quadruples', '{}', '{}');
  RAISE EXCEPTION 'FAIL: an unknown discipline was accepted';
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE '  PASS  enumerated columns reject unknown values';
END $$;

ROLLBACK;
