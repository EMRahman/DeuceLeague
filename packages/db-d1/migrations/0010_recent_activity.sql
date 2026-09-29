-- Matches most recently changed first, for showing people what just happened:
-- the coach's recent results read this order a page at a time.
CREATE INDEX match_recent_ix ON match (club_id, updated_at, id);
--> statement-breakpoint
-- What an event's actor and subject are called now. Names are looked up when
-- the feed is read, never stored in the append-only log, so an erasure
-- reaches them.
CREATE VIEW event_name AS
SELECT e.id AS event_id,
  CASE e.actor_type
    WHEN 'member' THEN (SELECT display_name FROM member WHERE id = e.actor_id)
    WHEN 'api_key' THEN (SELECT name FROM api_key WHERE id = e.actor_id)
  END AS actor_name,
  CASE e.subject_type
    WHEN 'member' THEN (SELECT display_name FROM member WHERE id = e.subject_id)
    WHEN 'api_key' THEN (SELECT name FROM api_key WHERE id = e.subject_id)
    WHEN 'club' THEN (SELECT name FROM club WHERE id = e.subject_id)
    WHEN 'season' THEN (SELECT name FROM season WHERE id = e.subject_id)
    WHEN 'competition' THEN (SELECT name FROM competition WHERE id = e.subject_id)
    WHEN 'division' THEN (SELECT name FROM division WHERE id = e.subject_id)
    WHEN 'entry' THEN (SELECT label FROM entry_label WHERE entry_id = e.subject_id)
    WHEN 'court_location' THEN (SELECT name FROM court_location WHERE id = e.subject_id)
    WHEN 'match' THEN (SELECT group_concat(label, ' v ') FROM (
      SELECT coalesce(el.label, 'To be decided') AS label FROM match_side s
      LEFT JOIN entry_label el ON el.entry_id = s.entry_id
      WHERE s.match_id = e.subject_id ORDER BY s.side_index))
  END AS subject_name
FROM event e;
