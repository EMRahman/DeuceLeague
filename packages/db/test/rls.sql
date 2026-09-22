-- Proves tenant isolation holds in the database, not only in application code.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f test/rls.sql
-- Requires 0002_app_role.sql to have been applied.

BEGIN;

-- ── coverage: nothing escapes the lock ───────────────────────────────────────
-- 0001 enables row-level security table by table, so a table added later
-- starts with none. This catches it, and a view that would bypass it.
DO $$
DECLARE missing text;
BEGIN
  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (NOT c.relrowsecurity
         OR NOT EXISTS (SELECT 1 FROM pg_policies p
                        WHERE p.schemaname = 'public' AND p.tablename = c.relname));
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: tables without row-level security and a policy: %', missing;
  END IF;
  RAISE NOTICE '  PASS  every table has row-level security and a policy';

  SELECT string_agg(c.relname, ', ') INTO missing
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
    AND NOT coalesce('security_invoker=true' = ANY (c.reloptions), false);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: views that bypass row-level security: %', missing;
  END IF;
  RAISE NOTICE '  PASS  every view runs as its caller, so row-level security applies through it';
END $$;

-- ── two clubs, seeded as the owner ───────────────────────────────────────────

INSERT INTO club (id, slug, name) VALUES
  ('11111111-1111-7111-8111-111111111111', 'club-one', 'Club One'),
  ('22222222-2222-7222-8222-222222222222', 'club-two', 'Club Two');
INSERT INTO member (id, club_id, display_name, email, phone, deleted_at) VALUES
  ('a0000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111',
   'J. Abbott', 'j@one.test', '07700 900001', NULL),
  ('a0000000-0000-7000-8000-000000000002', '11111111-1111-7111-8111-111111111111',
   'K. Brar', 'k@one.test', NULL, NULL),
  ('a0000000-0000-7000-8000-000000000009', '11111111-1111-7111-8111-111111111111',
   'Left Club', NULL, NULL, now()),
  ('b0000000-0000-7000-8000-000000000001', '22222222-2222-7222-8222-222222222222',
   'Z. Foreign', 'z@two.test', '07700 900002', NULL);

-- Club One has a league with one match outstanding.
INSERT INTO season (id, club_id, name) VALUES
  ('50000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111', 'Spring');
INSERT INTO competition (id, club_id, season_id, name, discipline, match_format, rules) VALUES
  ('c0000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111',
   '50000000-0000-7000-8000-000000000001', 'Men''s Singles', 'singles', '{}', '{}');
INSERT INTO division (id, club_id, competition_id, ordinal, name) VALUES
  ('d0000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111',
   'c0000000-0000-7000-8000-000000000001', 1, 'Division 1');
INSERT INTO entry (id, club_id, competition_id, division_id) VALUES
  ('e0000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111',
   'c0000000-0000-7000-8000-000000000001', 'd0000000-0000-7000-8000-000000000001'),
  ('e0000000-0000-7000-8000-000000000002', '11111111-1111-7111-8111-111111111111',
   'c0000000-0000-7000-8000-000000000001', 'd0000000-0000-7000-8000-000000000001');
INSERT INTO entry_member (entry_id, member_id, competition_id, club_id) VALUES
  ('e0000000-0000-7000-8000-000000000001', 'a0000000-0000-7000-8000-000000000001',
   'c0000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111'),
  ('e0000000-0000-7000-8000-000000000002', 'a0000000-0000-7000-8000-000000000002',
   'c0000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111');
INSERT INTO match (id, club_id, competition_id, division_id) VALUES
  ('f0000000-0000-7000-8000-000000000001', '11111111-1111-7111-8111-111111111111',
   'c0000000-0000-7000-8000-000000000001', 'd0000000-0000-7000-8000-000000000001');
INSERT INTO match_side (club_id, match_id, competition_id, side_index, entry_id) VALUES
  ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000001',
   'c0000000-0000-7000-8000-000000000001', 0, 'e0000000-0000-7000-8000-000000000001'),
  ('11111111-1111-7111-8111-111111111111', 'f0000000-0000-7000-8000-000000000001',
   'c0000000-0000-7000-8000-000000000001', 1, 'e0000000-0000-7000-8000-000000000002');

-- What a request carries before the club is known: keys, tokens, a slug.
INSERT INTO api_key (club_id, name, key_hash, prefix, expires_at, revoked_at) VALUES
  ('11111111-1111-7111-8111-111111111111', 'bot',     'key-live',    'dl_', NULL, NULL),
  ('11111111-1111-7111-8111-111111111111', 'old bot', 'key-revoked', 'dl_', NULL, now()),
  ('11111111-1111-7111-8111-111111111111', 'trial',   'key-expired', 'dl_', now() - interval '1 day', NULL);
INSERT INTO access_grant (club_id, member_id, token_hash, scopes, expires_at) VALUES
  ('11111111-1111-7111-8111-111111111111', 'a0000000-0000-7000-8000-000000000001',
   'grant-live', '{results:write}', now() + interval '1 hour'),
  ('11111111-1111-7111-8111-111111111111', 'a0000000-0000-7000-8000-000000000001',
   'grant-expired', '{results:write}', now() - interval '1 hour'),
  ('11111111-1111-7111-8111-111111111111', 'a0000000-0000-7000-8000-000000000009',
   'grant-of-leaver', '{results:write}', now() + interval '1 hour');

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

-- ── finding the club before the club is known ───────────────────────────────

DO $$
DECLARE r record; n int;
BEGIN
  SELECT * INTO r FROM deuceleague_resolve_api_key('key-live');
  IF r.club_id IS DISTINCT FROM '11111111-1111-7111-8111-111111111111' THEN
    RAISE EXCEPTION 'FAIL: a live key resolved to %', r.club_id;
  END IF;
  SELECT count(*) INTO n FROM deuceleague_resolve_api_key('key-revoked');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a revoked key still resolved'; END IF;
  SELECT count(*) INTO n FROM deuceleague_resolve_api_key('key-expired');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: an expired key still resolved'; END IF;
  RAISE NOTICE '  PASS  a live API key finds its club; a revoked or expired one finds nothing';

  SELECT * INTO r FROM deuceleague_resolve_access_grant('grant-live');
  IF r.member_id IS DISTINCT FROM 'a0000000-0000-7000-8000-000000000001' THEN
    RAISE EXCEPTION 'FAIL: a live grant resolved to member %', r.member_id;
  END IF;
  SELECT count(*) INTO n FROM deuceleague_resolve_access_grant('grant-expired');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: an expired grant still resolved'; END IF;
  SELECT count(*) INTO n FROM deuceleague_resolve_access_grant('grant-of-leaver');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: a removed member''s grant still resolved'; END IF;
  RAISE NOTICE '  PASS  a magic link finds its member, unless it expired or they were removed';

  -- A SECURITY DEFINER function runs past row-level security. Only the two
  -- resolvers may, and each needs a secret: nothing finds a club without one.
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.prosecdef
     AND p.proname NOT IN ('deuceleague_resolve_api_key', 'deuceleague_resolve_access_grant');
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: % other function(s) run past row-level security', n; END IF;
  RAISE NOTICE '  PASS  only a key or a token finds a club; nothing else runs past row-level security';

  -- The functions are the only door: the tables themselves stay shut.
  SELECT count(*) INTO n FROM api_key;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: % keys readable with no club set', n; END IF;
  SELECT count(*) INTO n FROM access_grant;
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: % grants readable with no club set', n; END IF;
  RAISE NOTICE '  PASS  resolving a key or token opens nothing else';
END $$;

SET LOCAL app.club_id = '11111111-1111-7111-8111-111111111111';

DO $$
DECLARE n int; who text;
BEGIN
  SELECT count(*) INTO n FROM member WHERE deleted_at IS NULL;
  SELECT string_agg(display_name, ', ' ORDER BY display_name) INTO who
    FROM member WHERE deleted_at IS NULL;
  IF n <> 2 OR who <> 'J. Abbott, K. Brar' THEN
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

  SELECT count(*) INTO n FROM member_chase_list;
  IF n <> 2 THEN RAISE EXCEPTION 'FAIL: Club One''s chase list had % rows, expected 2', n; END IF;
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

-- ── as Club Two, reaching into Club One ─────────────────────────────────────
-- Foreign-key checks ignore row-level security, so a club that knows another's
-- ids could once write rows pointing into it. Composite keys now refuse that.

SET LOCAL app.club_id = '22222222-2222-7222-8222-222222222222';

DO $$
DECLARE a int; b int; c int;
BEGIN
  SELECT count(*) INTO a FROM division_progress;
  SELECT count(*) INTO b FROM outstanding_match;
  SELECT count(*) INTO c FROM member_chase_list;
  IF a + b + c <> 0 THEN
    RAISE EXCEPTION 'FAIL: Club Two saw Club One''s progress=% outstanding=% chase=%', a, b, c;
  END IF;
  RAISE NOTICE '  PASS  the progress and chase views show another club nothing';
END $$;

DO $$
BEGIN
  INSERT INTO entry (club_id, competition_id, division_id)
    VALUES ('22222222-2222-7222-8222-222222222222',
            'c0000000-0000-7000-8000-000000000001', 'd0000000-0000-7000-8000-000000000001');
  RAISE EXCEPTION 'FAIL: Club Two placed an entry in Club One''s division';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '  PASS  a club cannot place an entry in another club''s division';
END $$;

DO $$
BEGIN
  INSERT INTO entry_member (entry_id, member_id, competition_id, club_id)
    VALUES ('e0000000-0000-7000-8000-000000000001', 'b0000000-0000-7000-8000-000000000001',
            'c0000000-0000-7000-8000-000000000001', '22222222-2222-7222-8222-222222222222');
  RAISE EXCEPTION 'FAIL: Club Two put its member into Club One''s entry';
EXCEPTION WHEN foreign_key_violation THEN
  RAISE NOTICE '  PASS  a club cannot put its member into another club''s entry';
END $$;

RESET ROLE;
ROLLBACK;
