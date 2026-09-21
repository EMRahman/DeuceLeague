# Proves a reader of event_feed never skips an event that commits late.
# Sourced by scripts/db-verify.sh, which provides psql_run.
#
# The failure this guards against: a slow request takes event id 1 and is
# still open when a fast one takes id 2 and commits. A reader paging on
# event.id alone sees 2, moves its cursor past it, and never sees 1.

feed_club=33333333-3333-7333-8333-333333333333
psql_run -c "INSERT INTO club (id, slug, name) VALUES ('$feed_club', 'feed-test', 'Feed Test')"

emit() {
  echo "INSERT INTO event (club_id, type, subject_type, actor_type)
        VALUES ('$feed_club', '$1', 'match', 'system');"
}

# The slow request: takes the first id, then stays open for three seconds.
( { echo "BEGIN;"; emit slow; echo "SELECT pg_sleep(3); COMMIT;"; } | psql_run >/dev/null ) &
slow=$!
sleep 1
# The fast request: takes the next id and commits at once.
emit fast | psql_run

# Read the way an adapter would: from a cursor, advancing it past each row.
cursor="'0'::xid8, 0"
seen=""
poll() {
  local rows tx id type
  rows=$(psql_run -At -F' ' -c "SELECT tx_id, id, type FROM event_feed
                                WHERE club_id = '$feed_club' AND (tx_id, id) > ($cursor)
                                ORDER BY tx_id, id")
  while read -r tx id type; do
    [ -n "$tx" ] || continue
    seen="$seen $type"
    cursor="'$tx'::xid8, $id"
  done <<<"$rows"
}

poll
if [ -n "$seen" ]; then
  echo "  FAIL  the feed released$seen while an older transaction was still open"
  exit 1
fi
echo "  PASS  an event is held back while an older transaction is still open"

wait "$slow"
poll
if [ "$seen" != " slow fast" ]; then
  echo "  FAIL  the feed delivered:$seen (expected: slow fast)"
  exit 1
fi
echo "  PASS  a reader paging the feed never skips an event that commits late"
