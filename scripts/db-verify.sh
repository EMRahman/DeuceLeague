#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and runs the constraint,
# progress, row-level security and event feed suites against it. Needs Docker;
# leaves nothing behind.
set -euo pipefail

CONTAINER=deuceleague-verify
PORT=${VERIFY_PORT:-55432}
IMAGE=${POSTGRES_IMAGE:-postgres:17-alpine}
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="$ROOT/packages/db"

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

# Last, because it commits: it needs two real transactions to overlap.
echo "→ event feed"
source "$DB_DIR/test/event_feed.sh"

echo "→ ok"
