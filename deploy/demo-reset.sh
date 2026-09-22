#!/usr/bin/env bash
# Rebuilds the demo instance from nothing: an empty database, migrated, then
# filled with fake clubs by demo:seed, which builds them through the API
# itself. Run it nightly from cron on the demo server, e.g.
#
#   15 3 * * *  /srv/deuceleague/deploy/demo-reset.sh >> /var/log/deuceleague-demo.log 2>&1
#
# DEMO_KEY_SEED in .env makes the read-only keys come out the same every
# night, so the ones published in the README keep working. The demo holds fake
# clubs only: never run this on a real club's server — it deletes everything.
set -euo pipefail
cd "$(dirname "$0")/.."

seed=$(sed -n 's/^DEMO_KEY_SEED=//p' .env 2>/dev/null | tail -n 1)
if [ -z "$seed" ]; then
  echo "demo-reset: set DEMO_KEY_SEED in .env, or the published keys change every night" >&2
  exit 1
fi

docker compose stop api website
docker compose exec -T postgres dropdb -U deuceleague --if-exists --force deuceleague
docker compose exec -T postgres createdb -U deuceleague deuceleague
docker compose run --rm migrate
docker compose run --rm --no-deps -e DEMO_KEY_SEED="$seed" api node packages/api/dist/cli/demo-seed.js
docker compose up -d
