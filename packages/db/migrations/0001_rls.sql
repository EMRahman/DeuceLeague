-- Row-level security: the second lock on multi-tenancy.
--
-- The API filters every query by club_id, but an API key is a credential that
-- will eventually be pasted into a public repository. This makes a leaked key
-- structurally unable to read another club's data even if application code is
-- wrong, because the database itself refuses.
--
-- The application MUST connect as deuceleague_app, which does not own the
-- tables. A connection as the owner bypasses RLS silently.
--
-- Per request, before any query:
--     SET LOCAL app.club_id = '<uuid>';
--
-- With no club set, current_club() is NULL, every policy predicate evaluates to
-- NULL, and no rows are visible. Default deny, for free.

CREATE OR REPLACE FUNCTION deuceleague_current_club() RETURNS uuid
  LANGUAGE sql STABLE PARALLEL SAFE
  AS $$ SELECT nullif(current_setting('app.club_id', true), '')::uuid $$;
--> statement-breakpoint

DO $$
DECLARE
  -- Every table is scoped by a club_id column, except club itself, which is
  -- scoped by its own id.
  scoped text[] := ARRAY[
    'member', 'api_key', 'access_grant',
    'season', 'competition', 'division',
    'entry', 'entry_member',
    'match', 'match_side', 'match_participant',
    'result_submission',
    'arrangement_proposal', 'arrangement_response',
    'event'
  ];
  t text;
BEGIN
  EXECUTE 'ALTER TABLE club ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS club_isolation ON club';
  EXECUTE 'CREATE POLICY club_isolation ON club FOR ALL'
       || ' USING (id = deuceleague_current_club())'
       || ' WITH CHECK (id = deuceleague_current_club())';

  FOREACH t IN ARRAY scoped LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL'
      || ' USING (club_id = deuceleague_current_club())'
      || ' WITH CHECK (club_id = deuceleague_current_club())', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- The event log is an audit trail. Nothing may rewrite history, including the
-- application role.
CREATE OR REPLACE FUNCTION deuceleague_event_is_append_only() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'event is append-only (attempted % on event id %)', TG_OP, OLD.id;
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS event_append_only ON "event";
--> statement-breakpoint
CREATE TRIGGER event_append_only
  BEFORE UPDATE OR DELETE ON "event"
  FOR EACH ROW EXECUTE FUNCTION deuceleague_event_is_append_only();
