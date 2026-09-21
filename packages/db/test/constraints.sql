-- Proves the guarantees the schema claims to make. Run against a scratch
-- database after the migrations:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/constraints.sql
-- Everything runs in one transaction and rolls back, so it leaves no trace.

BEGIN;

\set c1 '11111111-1111-7111-8111-111111111111'
\set c2 '22222222-2222-7222-8222-222222222222'

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
  ('c0000000-0000-7000-8000-000000000001', :'c1', '50000000-0000-7000-8000-000000000001',
   'Men''s Singles', 'singles', 'mens', '{}', '{}'),
  ('c0000000-0000-7000-8000-000000000002', :'c1', '50000000-0000-7000-8000-000000000001',
   'Mixed Doubles', 'doubles', 'mixed', '{}', '{}');

INSERT INTO division (id, club_id, competition_id, ordinal, name) VALUES
  ('d0000000-0000-7000-8000-000000000001', :'c1', 'c0000000-0000-7000-8000-000000000001', 1, 'Division 1'),
  ('d0000000-0000-7000-8000-000000000002', :'c1', 'c0000000-0000-7000-8000-000000000001', 2, 'Division 2'),
  ('d0000000-0000-7000-8000-000000000003', :'c1', 'c0000000-0000-7000-8000-000000000002', 1, 'Division 1');

-- A singles entry: one member.
INSERT INTO entry (id, club_id, competition_id, division_id, placement_reason) VALUES
  ('e0000000-0000-7000-8000-000000000001', :'c1', 'c0000000-0000-7000-8000-000000000001',
   'd0000000-0000-7000-8000-000000000001', 'new');
INSERT INTO entry_member (entry_id, member_id, competition_id, club_id, role) VALUES
  ('e0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001',
   'c0000000-0000-7000-8000-000000000001', :'c1', 'player');

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
  -- An entry from club 1 containing a member of club 2.
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

-- Fixtures are matches without scores. Generation is keyed so it cannot duplicate.
INSERT INTO match (id, club_id, competition_id, division_id, pairing_key) VALUES
  ('f0000000-0000-7000-8000-000000000001', :'c1', 'c0000000-0000-7000-8000-000000000001',
   'd0000000-0000-7000-8000-000000000001', 'e0000000-...0001|e0000000-...0002');

DO $$
BEGIN
  INSERT INTO match (club_id, competition_id, division_id, pairing_key)
    VALUES ('11111111-1111-7111-8111-111111111111',
            'c0000000-0000-7000-8000-000000000001',
            'd0000000-0000-7000-8000-000000000001',
            'e0000000-...0001|e0000000-...0002');
  RAISE EXCEPTION 'FAIL: the same pairing was generated twice';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  re-running fixture generation cannot duplicate a pairing';
END $$;

-- Two players report the match at the same moment.
INSERT INTO result_submission (club_id, match_id, outcome, source, state) VALUES
  (:'c1', 'f0000000-0000-7000-8000-000000000001', 'completed', 'telegram', 'pending');

DO $$
BEGIN
  INSERT INTO result_submission (club_id, match_id, outcome, source, state)
    VALUES ('11111111-1111-7111-8111-111111111111',
            'f0000000-0000-7000-8000-000000000001', 'completed', 'web', 'pending');
  RAISE EXCEPTION 'FAIL: two pending submissions exist for one match';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  only one result submission may be pending per match';
END $$;

-- Superseded submissions stay as history; only one may be pending at a time.
UPDATE result_submission SET state = 'superseded'
  WHERE match_id = 'f0000000-0000-7000-8000-000000000001';
INSERT INTO result_submission (club_id, match_id, outcome, source, state) VALUES
  (:'c1', 'f0000000-0000-7000-8000-000000000001', 'completed', 'coach_entry', 'pending');
\echo '  PASS  a coach override supersedes without deleting the trail'

INSERT INTO event (club_id, type, subject_type, subject_id, actor_type) VALUES
  (:'c1', 'match.result.confirmed', 'match', 'f0000000-0000-7000-8000-000000000001', 'system');

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
