-- Exercises the progress views and the dual-submission result flow against a
-- realistic division: four entries, a full round robin, two matches played.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/progress.sql

BEGIN;

\set club '11111111-1111-7111-8111-111111111111'
\set comp 'c0000000-0000-7000-8000-000000000001'
\set divn 'd0000000-0000-7000-8000-000000000001'

INSERT INTO club (id, slug, name) VALUES (:'club', 'deuce-ltc', 'Deuce LTC');

INSERT INTO member (id, club_id, display_name, email) VALUES
  ('a0000000-0000-7000-8000-000000000001', :'club', 'J. Abbott', 'j@ltc.test'),
  ('a0000000-0000-7000-8000-000000000002', :'club', 'K. Brar',   'k@ltc.test'),
  ('a0000000-0000-7000-8000-000000000003', :'club', 'L. Chen',   'l@ltc.test'),
  ('a0000000-0000-7000-8000-000000000004', :'club', 'M. Doyle',  'm@ltc.test');

-- A month left to run, which is when the first reminder usually goes out.
INSERT INTO season (id, club_id, name, kind, year, starts_on, ends_on,
                    results_deadline_at, state)
VALUES ('50000000-0000-7000-8000-000000000001', :'club', 'Spring 2026', 'spring', 2026,
        CURRENT_DATE - 60, CURRENT_DATE + 30, (CURRENT_DATE + 30)::timestamptz, 'active');

INSERT INTO competition (id, club_id, season_id, name, discipline, category,
                         match_format, rules, state)
VALUES (:'comp', :'club', '50000000-0000-7000-8000-000000000001',
        'Men''s Singles', 'singles', 'mens', '{}', '{}', 'active');

INSERT INTO division (id, club_id, competition_id, ordinal, name)
VALUES (:'divn', :'club', :'comp', 1, 'Division 1');

INSERT INTO entry (id, club_id, competition_id, division_id, placement_reason)
SELECT ('e0000000-0000-7000-8000-00000000000' || n)::uuid, :'club', :'comp', :'divn', 'new'
FROM generate_series(1, 4) n;

INSERT INTO entry_member (entry_id, member_id, competition_id, club_id)
SELECT ('e0000000-0000-7000-8000-00000000000' || n)::uuid,
       ('a0000000-0000-7000-8000-00000000000' || n)::uuid, :'comp', :'club'
FROM generate_series(1, 4) n;

-- The full round robin: every pairing, as matches with no score yet.
INSERT INTO match (id, club_id, competition_id, division_id, pairing_key)
SELECT ('f0000000-0000-7000-8000-0000000000' || lpad((a.n * 10 + b.n)::text, 2, '0'))::uuid,
       :'club', :'comp', :'divn', a.n || '|' || b.n
FROM generate_series(1, 4) a(n) JOIN generate_series(1, 4) b(n) ON a.n < b.n;

INSERT INTO match_side (club_id, match_id, side_index, entry_id)
SELECT :'club',
       ('f0000000-0000-7000-8000-0000000000' || lpad((a.n * 10 + b.n)::text, 2, '0'))::uuid,
       s.side,
       ('e0000000-0000-7000-8000-00000000000' || CASE s.side WHEN 0 THEN a.n ELSE b.n END)::uuid
FROM generate_series(1, 4) a(n)
JOIN generate_series(1, 4) b(n) ON a.n < b.n
CROSS JOIN (VALUES (0), (1)) s(side);

INSERT INTO match_participant (match_side_id, member_id, club_id)
SELECT ms.id, em.member_id, :'club'
FROM match_side ms JOIN entry_member em ON em.entry_id = ms.entry_id;

DO $$
DECLARE n int;
BEGIN
  SELECT matches INTO n FROM division_progress
   WHERE division_id = 'd0000000-0000-7000-8000-000000000001';
  IF n <> 6 THEN RAISE EXCEPTION 'FAIL: expected 6 fixtures for 4 entries, got %', n; END IF;
  RAISE NOTICE '  PASS  four entries generate a six-match round robin';
END $$;

-- Abbott beats Brar, then beats Chen. Four matches still to play.
UPDATE match SET status = 'played', outcome = 'completed', winning_side = 0,
       played_on = CURRENT_DATE - 7,
       score = '{"sets":[{"games":[6,4]},{"games":[6,3]}]}'
 WHERE pairing_key IN ('1|2', '1|3');

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM division_progress
   WHERE division_id = 'd0000000-0000-7000-8000-000000000001';
  IF r.played <> 2 OR r.outstanding <> 4 OR r.percent_played <> 33.3 THEN
    RAISE EXCEPTION 'FAIL: progress was played=% outstanding=% pct=%',
      r.played, r.outstanding, r.percent_played;
  END IF;
  IF r.active_entries <> 4 THEN
    RAISE EXCEPTION 'FAIL: expected 4 active entries, got %', r.active_entries;
  END IF;
  IF r.days_remaining <> 30 THEN
    RAISE EXCEPTION 'FAIL: expected 30 days remaining, got %', r.days_remaining;
  END IF;
  RAISE NOTICE '  PASS  division progress: 2 of 6 played (33.3%%), 30 days left';
END $$;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM competition_progress
   WHERE competition_id = 'c0000000-0000-7000-8000-000000000001';
  IF r.divisions <> 1 OR r.matches <> 6 OR r.played <> 2 THEN
    RAISE EXCEPTION 'FAIL: rollup was divisions=% matches=% played=%',
      r.divisions, r.matches, r.played;
  END IF;
  RAISE NOTICE '  PASS  competition rollup agrees with its divisions';
END $$;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM entry_progress
   WHERE entry_id = 'e0000000-0000-7000-8000-000000000001';
  IF r.matches <> 3 OR r.played <> 2 OR r.outstanding <> 1 THEN
    RAISE EXCEPTION 'FAIL: Abbott had matches=% played=% outstanding=%',
      r.matches, r.played, r.outstanding;
  END IF;
  IF r.label <> 'J. Abbott' THEN RAISE EXCEPTION 'FAIL: label was %', r.label; END IF;
  RAISE NOTICE '  PASS  per-entry progress and labelling';
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM outstanding_match
   WHERE competition_id = 'c0000000-0000-7000-8000-000000000001';
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 outstanding, got %', n; END IF;
  PERFORM 1 FROM outstanding_match
    WHERE side0_label IS NULL OR side1_label IS NULL;
  IF FOUND THEN RAISE EXCEPTION 'FAIL: an outstanding match has an unnamed side'; END IF;
  RAISE NOTICE '  PASS  the chase list names both sides of every outstanding match';
END $$;

DO $$
DECLARE r record; n int;
BEGIN
  SELECT count(*) INTO n FROM member_chase_list;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL: expected 4 members to chase, got %', n; END IF;

  -- Doyle has played nobody, so all three of his matches are outstanding.
  SELECT * INTO r FROM member_chase_list WHERE display_name = 'M. Doyle';
  IF r.outstanding_matches <> 3 THEN
    RAISE EXCEPTION 'FAIL: Doyle had % outstanding, expected 3', r.outstanding_matches;
  END IF;
  IF array_length(r.waiting_on, 1) <> 3 THEN
    RAISE EXCEPTION 'FAIL: Doyle is waiting on %', r.waiting_on;
  END IF;
  IF r.email <> 'm@ltc.test' THEN RAISE EXCEPTION 'FAIL: no contact for Doyle'; END IF;

  -- Abbott has played two of his three.
  SELECT * INTO r FROM member_chase_list WHERE display_name = 'J. Abbott';
  IF r.outstanding_matches <> 1 OR r.waiting_on <> ARRAY['M. Doyle'] THEN
    RAISE EXCEPTION 'FAIL: Abbott had % outstanding, waiting on %',
      r.outstanding_matches, r.waiting_on;
  END IF;
  RAISE NOTICE '  PASS  per-member chase list with opponents and contact';
END $$;

DO $$
DECLARE n int;
BEGIN
  -- The query a coach runs a month out, then again a fortnight out.
  SELECT count(*) INTO n FROM member_chase_list WHERE days_remaining <= 30;
  IF n <> 4 THEN RAISE EXCEPTION 'FAIL: month-out list had % members', n; END IF;
  SELECT count(*) INTO n FROM member_chase_list WHERE days_remaining <= 14;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: fortnight-out list should be empty, had %', n; END IF;
  RAISE NOTICE '  PASS  the list filters by time left, so the coach picks the moment';
END $$;

-- ── a result enters the ledger only when two people agree ────────────────
--
-- Nothing here happens on a clock. Statuses are set the way the API will set
-- them; the schema's job is to make the wrong states unrepresentable.

\set m14 'f0000000-0000-7000-8000-000000000014'
\set m23 'f0000000-0000-7000-8000-000000000023'
\set m34 'f0000000-0000-7000-8000-000000000034'

DO $$
BEGIN
  PERFORM 1 FROM information_schema.columns
   WHERE table_name = 'result_submission' AND column_name = 'auto_confirm_at';
  IF FOUND THEN RAISE EXCEPTION 'FAIL: auto_confirm_at still exists'; END IF;
  RAISE NOTICE '  PASS  nothing is accepted on a timer';
END $$;

-- Path one: both sides report the same score independently.
INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state, score)
VALUES (:'club', :'m34', 0, 'completed', 'telegram', 'pending',
        '{"sets":[{"games":[6,2]},{"games":[6,4]}]}'),
       (:'club', :'m34', 1, 'completed', 'web', 'pending',
        '{"sets":[{"games":[6,2]},{"games":[6,4]}]}');
\echo '  PASS  the two sides may hold a live claim each'

DO $$
BEGIN
  INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state)
  VALUES ('11111111-1111-7111-8111-111111111111',
          'f0000000-0000-7000-8000-000000000034', 0, 'completed', 'web', 'pending');
  RAISE EXCEPTION 'FAIL: one side lodged two live claims';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE '  PASS  a side may hold only one live claim at a time';
END $$;

DO $$
DECLARE versions int;
BEGIN
  SELECT count(DISTINCT score) INTO versions FROM result_submission
   WHERE match_id = 'f0000000-0000-7000-8000-000000000034' AND state = 'pending';
  IF versions <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected the claims to agree, saw % versions', versions;
  END IF;
  RAISE NOTICE '  PASS  agreement is established by comparison, not by trust';
END $$;

UPDATE result_submission SET state = 'confirmed', confirmed_at = now()
 WHERE match_id = :'m34';
UPDATE match SET status = 'played', outcome = 'completed', winning_side = 0,
       score = '{"sets":[{"games":[6,2]},{"games":[6,4]}]}' WHERE id = :'m34';

-- Path two: one side reports, the other presses accept.
INSERT INTO result_submission (id, club_id, match_id, side_index, outcome, source,
                               state, score)
VALUES ('11110000-0000-7000-8000-00000000aaaa', :'club', :'m14', 0, 'completed',
        'web', 'pending', '{"sets":[{"games":[6,1]},{"games":[6,0]}]}');
UPDATE match SET status = 'reported' WHERE id = :'m14';

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM outstanding_match WHERE match_id = 'f0000000-0000-7000-8000-000000000014';
  IF NOT r.side0_claimed OR r.side1_claimed THEN
    RAISE EXCEPTION 'FAIL: claim flags were side0=% side1=%', r.side0_claimed, r.side1_claimed;
  END IF;
  RAISE NOTICE '  PASS  the chase list shows which side has claimed';

  SELECT * INTO r FROM member_chase_list WHERE display_name = 'J. Abbott';
  IF r.awaiting_them <> 1 OR r.awaiting_you <> 0 THEN
    RAISE EXCEPTION 'FAIL: Abbott awaiting_them=% awaiting_you=%',
      r.awaiting_them, r.awaiting_you;
  END IF;
  SELECT * INTO r FROM member_chase_list WHERE display_name = 'M. Doyle';
  IF r.awaiting_you <> 1 THEN
    RAISE EXCEPTION 'FAIL: Doyle awaiting_you=%, expected 1', r.awaiting_you;
  END IF;
  -- 3|4 has just gone into the ledger, so 2|4 is his only match left to play.
  IF r.needs_playing <> 1 OR r.outstanding_matches <> 2 THEN
    RAISE EXCEPTION 'FAIL: Doyle needs_playing=% outstanding=%',
      r.needs_playing, r.outstanding_matches;
  END IF;
  RAISE NOTICE '  PASS  "go and play" and "your opponent is waiting" are counted apart';
END $$;

-- Doyle accepts Abbott's claim rather than typing the score again.
INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state,
                               score, accepts_submission_id,
                               submitted_by_member_id, confirmed_at)
VALUES (:'club', :'m14', 1, 'completed', 'web', 'confirmed',
        '{"sets":[{"games":[6,1]},{"games":[6,0]}]}',
        '11110000-0000-7000-8000-00000000aaaa',
        'a0000000-0000-7000-8000-000000000004', now());
UPDATE result_submission SET state = 'confirmed', confirmed_at = now()
 WHERE id = '11110000-0000-7000-8000-00000000aaaa';
UPDATE match SET status = 'played', outcome = 'completed', winning_side = 0,
       score = '{"sets":[{"games":[6,1]},{"games":[6,0]}]}' WHERE id = :'m14';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM result_submission
   WHERE match_id = 'f0000000-0000-7000-8000-000000000014'
     AND accepts_submission_id IS NOT NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: acceptance was not recorded'; END IF;
  RAISE NOTICE '  PASS  an acceptance is recorded as such, not as an independent report';
END $$;

DO $$
BEGIN
  -- An acceptance must point at a claim that exists, in this club.
  INSERT INTO result_submission (club_id, match_id, side_index, outcome, source,
                                 state, accepts_submission_id)
  VALUES ('11111111-1111-7111-8111-111111111111',
          'f0000000-0000-7000-8000-000000000023', 1, 'completed', 'web', 'pending',
          '99990000-0000-7000-8000-00000000ffff');
  RAISE EXCEPTION 'FAIL: accepted a claim that does not exist';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '  PASS  an acceptance must point at a real claim';
END $$;

-- Path three: the second side proposes a different score. Nobody wins by clock.
INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state, score)
VALUES (:'club', :'m23', 0, 'completed', 'web', 'pending',
        '{"sets":[{"games":[6,4]},{"games":[6,4]}]}'),
       (:'club', :'m23', 1, 'completed', 'telegram', 'pending',
        '{"sets":[{"games":[4,6]},{"games":[6,4]},{"games":[10,8]}]}');
UPDATE match SET status = 'disputed' WHERE id = :'m23';

DO $$
DECLARE versions int; r record;
BEGIN
  SELECT count(DISTINCT score) INTO versions FROM result_submission
   WHERE match_id = 'f0000000-0000-7000-8000-000000000023' AND state = 'pending';
  IF versions <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected two rival claims, saw %', versions;
  END IF;

  SELECT * INTO r FROM division_progress
   WHERE division_id = 'd0000000-0000-7000-8000-000000000001';
  IF r.disputed <> 1 THEN RAISE EXCEPTION 'FAIL: disputed=%', r.disputed; END IF;
  IF r.played <> 4 THEN RAISE EXCEPTION 'FAIL: played=%, expected 4', r.played; END IF;
  IF r.outstanding <> 1 THEN RAISE EXCEPTION 'FAIL: outstanding=%', r.outstanding; END IF;
  RAISE NOTICE '  PASS  rival claims both stand, and the coach sees the dispute';
END $$;

-- The coach settles it. A coach entry speaks for the match, so it has no side.
UPDATE result_submission SET state = 'superseded' WHERE match_id = :'m23';
INSERT INTO result_submission (club_id, match_id, side_index, outcome, source, state,
                               score, confirmed_at)
VALUES (:'club', :'m23', NULL, 'completed', 'coach_entry', 'confirmed',
        '{"sets":[{"games":[4,6]},{"games":[6,4]},{"games":[10,8]}]}', now());
UPDATE match SET status = 'played', outcome = 'completed', winning_side = 1,
       score = '{"sets":[{"games":[4,6]},{"games":[6,4]},{"games":[10,8]}]}'
 WHERE id = :'m23';

DO $$
DECLARE n int; r record;
BEGIN
  SELECT count(*) INTO n FROM result_submission
   WHERE match_id = 'f0000000-0000-7000-8000-000000000023';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL: expected 3 claims on record, saw %', n; END IF;
  RAISE NOTICE '  PASS  the coach overrides without erasing what each player said';

  SELECT * INTO r FROM division_progress
   WHERE division_id = 'd0000000-0000-7000-8000-000000000001';
  IF r.played <> 5 OR r.outstanding <> 1 OR r.disputed <> 0 THEN
    RAISE EXCEPTION 'FAIL: played=% outstanding=% disputed=%',
      r.played, r.outstanding, r.disputed;
  END IF;
  RAISE NOTICE '  PASS  progress follows the ledger with no recalculation step';
END $$;

ROLLBACK;
