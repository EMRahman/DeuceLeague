#!/bin/sh
# Dumps the database to /backups (./backups on the server) on start and every
# 24 hours after, keeping BACKUP_KEEP_DAYS days of them. Run by the `backup`
# service in compose.production.yml.
#
# A backup on the same disk survives a mistake, not a lost server: copy
# ./backups somewhere else too. docs/SELF-HOSTING.md § Backups shows how, and
# how to restore one.
set -eu

while :; do
  name="deuceleague-$(date -u +%Y%m%d-%H%M%S).dump"
  # Written under a temporary name, so a dump cut short never looks complete.
  if pg_dump --format=custom --file="/backups/.$name.partial"; then
    mv "/backups/.$name.partial" "/backups/$name"
    echo "backup: wrote $name"
  else
    rm -f "/backups/.$name.partial"
    echo "backup: pg_dump failed; trying again in an hour" >&2
    sleep 3600
    continue
  fi
  find /backups -name 'deuceleague-*.dump' -mtime "+${BACKUP_KEEP_DAYS:-14}" -delete
  sleep 86400
done
