#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and runs the constraint,
# progress, row-level security, event feed, API and website suites against it. Needs Docker;
# leaves nothing behind.
set -euo pipefail

CONTAINER=deuceleague-verify
PORT=${VERIFY_PORT:-55432}
IMAGE=${POSTGRES_IMAGE:-postgres:17-alpine}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="$ROOT/packages/db"

# First, because it needs no database: no query may be built from text.
echo "→ no SQL built from text"
node "$ROOT/scripts/check-sql.mjs"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "→ starting $IMAGE"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=deuceleague \
  -p "$PORT":5432 "$IMAGE" >/dev/null

# Wait on TCP, not the socket: the image's first-boot server listens only on
# the socket, then restarts.
for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres -q 2>/dev/null && break
  sleep 1
done

psql_run() {
  docker exec -i "$CONTAINER" psql -U postgres -d deuceleague -v ON_ERROR_STOP=1 -q "$@"
}

# The same code path as `npm run db:migrate`: drizzle's migrator reading the
# journal, so a migration the journal would skip is caught here, not in production.
echo "→ applying migrations"
(cd "$ROOT" && npx tsc --build)
MIGRATION_DATABASE_URL="postgres://postgres:verify@127.0.0.1:$PORT/deuceleague" \
  node "$DB_DIR/dist/migrate.js" | sed 's/^/   /'

counts=$(psql_run -At -F' ' -c "select
  (select count(*) from drizzle.__drizzle_migrations),
  count(*) filter (where table_type='BASE TABLE'),
  count(*) filter (where table_type='VIEW')
  from information_schema.tables where table_schema='public'")
read -r applied tables views <<<"$counts"
echo "→ $applied migrations, $tables tables, $views views"

# The migrator gives deuceleague_app the password DATABASE_URL carries — here
# one with a quote in it, to show it is quoted rather than spliced — and then
# the one the rest of this run connects with.
echo "→ the app role's password comes from DATABASE_URL"
set_app_password() {
  MIGRATION_DATABASE_URL="postgres://postgres:verify@127.0.0.1:$PORT/deuceleague" \
  DATABASE_URL="postgres://deuceleague_app:$1@127.0.0.1:$PORT/deuceleague" \
    node "$DB_DIR/dist/migrate.js" >/dev/null
}
connects_with() {
  (cd "$DB_DIR" && node --input-type=module -e "
    import postgres from 'postgres';
    const sql = postgres(process.argv[1], { max: 1, connect_timeout: 5 });
    try { await sql\`select 1\`; } finally { await sql.end(); }
  " "postgres://deuceleague_app:$1@127.0.0.1:$PORT/deuceleague" 2>/dev/null)
}
set_app_password "it's%20new"
connects_with "it's%20new" || { echo "   FAIL  the new password does not connect"; exit 1; }
if connects_with changeme; then echo "   FAIL  the old password still connects"; exit 1; fi
set_app_password changeme
connects_with changeme || { echo "   FAIL  could not set it back"; exit 1; }
echo "   PASS  set, quoted, and the old one refused"

# Regenerates docs/SCHEMA.md against this same freshly migrated database and
# checks it against the committed copy — or, with DOCS=write, writes it
# instead. Right after the migrations, while the database is at its cleanest.
echo "→ schema docs"
docs_mode="--check"
if [ "${DOCS:-}" = "write" ]; then docs_mode="--write"; fi
MIGRATION_DATABASE_URL="postgres://postgres:verify@127.0.0.1:$PORT/deuceleague" \
  node "$DB_DIR/dist/docs.js" "$docs_mode" | sed 's/^/   /'

run_suite() {
  echo "→ $1"
  psql_run < "$2" 2>&1 | sed -e 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR'
}

run_suite "constraints" "$DB_DIR/test/constraints.sql"
run_suite "progress views and result flow" "$DB_DIR/test/progress.sql"
run_suite "row-level security" "$DB_DIR/test/rls.sql"

# These commit: the event feed needs two real transactions to overlap, and the
# API tests make their own clubs through the API's own code.
echo "→ event feed"
source "$DB_DIR/test/event_feed.sh"

# The API, in-process, against this same database: as deuceleague_app, the way
# the server connects, and as the owner only to set up states a request cannot.
echo "→ api"
DATABASE_URL="postgres://deuceleague_app:changeme@127.0.0.1:$PORT/deuceleague" \
MIGRATION_DATABASE_URL="postgres://postgres:verify@127.0.0.1:$PORT/deuceleague" \
  node --test --experimental-strip-types --no-warnings --test-reporter=spec \
    "$ROOT"/packages/api/test/*.test.ts 2>&1 | sed -e 's/^/   /' | grep -vE '^\s*$'

# The reference website, driven like a browser, against the API in-process.
echo "→ website"
DATABASE_URL="postgres://deuceleague_app:changeme@127.0.0.1:$PORT/deuceleague" \
MIGRATION_DATABASE_URL="postgres://postgres:verify@127.0.0.1:$PORT/deuceleague" \
  node --test --experimental-strip-types --no-warnings --test-reporter=spec \
    "$ROOT"/adapters/website/test/*.test.ts 2>&1 | sed -e 's/^/   /' | grep -vE '^\s*$'

echo "→ ok"
