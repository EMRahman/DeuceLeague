-- The application role. Run once per database, as a superuser or the owner.
--
-- Self-hosters using a single-role setup can skip this file, but then RLS is
-- not enforced and tenancy rests on application code alone. For the hosted
-- instance it is mandatory.
--
-- Change the password before running this anywhere real.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'deuceleague_app') THEN
    CREATE ROLE deuceleague_app LOGIN PASSWORD 'changeme';
  END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO deuceleague_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO deuceleague_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO deuceleague_app;
--> statement-breakpoint

-- Future tables are covered automatically, so a new migration cannot silently
-- create a table the app cannot reach.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO deuceleague_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO deuceleague_app;
