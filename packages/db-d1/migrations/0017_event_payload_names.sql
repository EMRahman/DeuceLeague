-- What an event's payload names by ID, called as it is now: the competition a
-- next-season choice is about, and the partner it names. Looked up on reading,
-- like the actor and subject, so an erasure reaches them.
DROP VIEW event_name;
--> statement-breakpoint
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
  END AS subject_name,
  (SELECT name FROM competition WHERE id = json_extract(e.payload, '$.competition_id')) AS competition_name,
  (SELECT display_name FROM member WHERE id = json_extract(e.payload, '$.partner_id')) AS partner_name
FROM event e;
