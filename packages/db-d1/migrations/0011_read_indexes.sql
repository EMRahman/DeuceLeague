-- D1 bills rows read, and a club's history grows every season. These let a
-- competition's entries, and whether an entry was carried into the next
-- season, be looked up rather than read from every entry the club has had.
CREATE INDEX entry_competition_ix ON entry (competition_id);
--> statement-breakpoint
CREATE INDEX entry_previous_ix ON entry (previous_entry_id) WHERE previous_entry_id IS NOT NULL;
--> statement-breakpoint
-- An entry's label, looked up for that entry alone. The grouped view it replaces
-- labelled every entry in the club before a query could keep the one it wanted.
-- An entry with no members still has no label row, as before.
DROP VIEW entry_label;
--> statement-breakpoint
CREATE VIEW entry_label AS
SELECT e.id AS entry_id, e.club_id, e.competition_id,
  coalesce(e.display_name, (SELECT group_concat(m.display_name, ' / ' ORDER BY em.role DESC, m.display_name)
    FROM entry_member em JOIN member m ON m.id = em.member_id AND m.club_id = em.club_id
    WHERE em.entry_id = e.id AND em.club_id = e.club_id)) AS label
FROM entry e
WHERE EXISTS (SELECT 1 FROM entry_member em WHERE em.entry_id = e.id AND em.club_id = e.club_id);
--> statement-breakpoint
-- Matches by status: the few disputed or waiting on the other side, without
-- reading every match played.
CREATE INDEX match_status_ix ON match (status, id);
