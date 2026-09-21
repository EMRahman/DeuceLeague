-- Proves tenant isolation holds in the database, not only in application code.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/rls.sql
-- Requires 0002_app_role.sql to have been applied.

BEGIN;

INSERT INTO club (id, slug, name) VALUES
  ('11111111-1111-7111-8111-111111111111', 'club-one', 'Club One'),
  ('22222222-2222-7222-8222-222222222222', 'club-two', 'Club Two');
INSERT INTO member (club_id, display_name, email, phone) VALUES
  ('11111111-1111-7111-8111-111111111111', 'J. Abbott', 'j@one.test', '07700 900001'),
  ('22222222-2222-7222-8222-222222222222', 'Z. Foreign', 'z@two.test', '07700 900002');

-- From here on, behave as the application does: a role that owns nothing.
SET LOCAL ROLE deuceleague_app;

DO $$
DECLARE n int;
BEGIN
  -- No club context set at all.
  SELECT count(*) INTO n FROM member;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: % members visible with no club set', n; END IF;
  RAISE NOTICE '  PASS  no club context means no rows (default deny)';
END $$;

SET LOCAL app.club_id = '11111111-1111-7111-8111-111111111111';

DO $$
DECLARE n int; who text;
BEGIN
  SELECT count(*) INTO n FROM member;
  SELECT display_name INTO who FROM member;
  IF n <> 1 OR who <> 'J. Abbott' THEN
    RAISE EXCEPTION 'FAIL: expected only Club One members, saw % rows (%)', n, who;
  END IF;
  RAISE NOTICE '  PASS  a club sees exactly its own members';

  -- The critical case: naming another club's id explicitly still returns nothing.
  SELECT count(*) INTO n FROM member
    WHERE club_id = '22222222-2222-7222-8222-222222222222';
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: % rows leaked from Club Two', n; END IF;
  RAISE NOTICE '  PASS  querying another club by id returns nothing';

  SELECT count(*) INTO n FROM club;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: % clubs visible, expected 1', n; END IF;
  RAISE NOTICE '  PASS  the club row itself is scoped too';
END $$;

DO $$
BEGIN
  -- A buggy or malicious write aimed at another tenant.
  INSERT INTO member (club_id, display_name)
    VALUES ('22222222-2222-7222-8222-222222222222', 'Injected');
  RAISE EXCEPTION 'FAIL: wrote a row into another club';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '  PASS  writes into another club are refused';
END $$;

DO $$
DECLARE n int;
BEGIN
  UPDATE member SET display_name = 'Hijacked'
    WHERE club_id = '22222222-2222-7222-8222-222222222222';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: updated % rows in another club', n; END IF;
  RAISE NOTICE '  PASS  updates cannot reach another club''s rows';

  DELETE FROM member WHERE club_id = '22222222-2222-7222-8222-222222222222';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: deleted % rows in another club', n; END IF;
  RAISE NOTICE '  PASS  deletes cannot reach another club''s rows';
END $$;

RESET ROLE;
ROLLBACK;
