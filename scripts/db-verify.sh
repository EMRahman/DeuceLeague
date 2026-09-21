#!/usr/bin/env bash
# Applies every migration to a throwaway Postgres and runs the constraint and
# RLS suites against it. Needs Docker; leaves nothing behind.
set -euo pipefail

CONTAINER=deuceleague-verify
PORT=${VERIFY_PORT:-55432}
IMAGE=${POSTGRES_IMAGE:-postgres:17-alpine}
DB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../packages/db" && pwd)"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "→ starting $IMAGE"
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=deuceleague \
  -p "$PORT":5432 "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  docker exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done

psql_run() {
  docker exec -i "$CONTAINER" psql -U postgres -d deuceleague -v ON_ERROR_STOP=1 -q "$@"
}

echo "→ applying migrations"
for f in "$DB_DIR"/migrations/*.sql; do
  echo "   $(basename "$f")"
  # Drizzle's breakpoint markers are comments to psql; strip them for clarity.
  sed 's|--> statement-breakpoint||' "$f" | psql_run 2>&1 | grep -v '^NOTICE:.*skipping' || true
done

counts=$(psql_run -At -F' ' -c "select
  count(*) filter (where table_type='BASE TABLE'),
  count(*) filter (where table_type='VIEW')
  from information_schema.tables where table_schema='public'")
echo "→ ${counts% *} tables, ${counts#* } views"

echo "→ constraints"
psql_run < "$DB_DIR/test/constraints.sql" 2>&1 | sed -e 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR'

echo "→ progress views and result flow"
psql_run < "$DB_DIR/test/progress.sql" 2>&1 | sed -e 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR'

echo "→ row-level security"
psql_run < "$DB_DIR/test/rls.sql" 2>&1 | sed -e 's/^NOTICE:  //' | grep -E 'PASS|FAIL|ERROR'

echo "→ ok"
