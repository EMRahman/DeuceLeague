-- Public positions are decimal strings, not JavaScript/SQLite integers. The
-- fixed-width representation makes indexed tuple comparisons lossless.
CREATE TABLE event_sequence (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  epoch TEXT NOT NULL CHECK (length(epoch) = 20 AND epoch NOT GLOB '*[^0-9]*' AND epoch > '00000000000000000000'),
  high INTEGER NOT NULL CHECK (high BETWEEN 0 AND 9999999999),
  low INTEGER NOT NULL CHECK (low BETWEEN 0 AND 9999999999),
  importing INTEGER NOT NULL DEFAULT 0 CHECK (importing IN (0, 1)),
  imported INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0, 1))
) STRICT;
--> statement-breakpoint
INSERT INTO event_sequence (singleton, epoch, high, low)
SELECT 1, '00000000000000000001', coalesce(max(id), 0) / 10000000000,
  coalesce(max(id), 0) % 10000000000 FROM event;
--> statement-breakpoint
ALTER TABLE event ADD COLUMN source_tx TEXT;
--> statement-breakpoint
ALTER TABLE event ADD COLUMN source_id TEXT;
--> statement-breakpoint
CREATE TABLE event_position (
  local_id INTEGER PRIMARY KEY REFERENCES event(id),
  club_id TEXT NOT NULL REFERENCES club(id),
  tx_id TEXT NOT NULL CHECK (length(tx_id) = 20 AND tx_id NOT GLOB '*[^0-9]*' AND tx_id > '00000000000000000000'),
  event_id TEXT NOT NULL UNIQUE CHECK (length(event_id) = 20 AND event_id NOT GLOB '*[^0-9]*' AND event_id > '00000000000000000000')
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX event_position_feed_ix ON event_position (club_id, tx_id, event_id);
--> statement-breakpoint
INSERT INTO event_position (local_id, club_id, tx_id, event_id)
SELECT id, club_id, '00000000000000000001', printf('%020d', id) FROM event;
--> statement-breakpoint
CREATE TRIGGER event_position_no_update BEFORE UPDATE ON event_position BEGIN
  SELECT RAISE(ABORT, 'event_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER event_position_no_delete BEFORE DELETE ON event_position BEGIN
  SELECT RAISE(ABORT, 'event_append_only');
END;
--> statement-breakpoint
-- Two ten-digit limbs avoid REAL promotion / signed-64-bit overflow. SQLite
-- evaluates both assignments from the old row; the comparison is 1 exactly when
-- low carries. Exhaustion fails the high CHECK and aborts the batch.
-- No CASE ... END inside this body: remote D1's statement splitter takes that
-- END for the trigger's own and rejects the migration as incomplete input.
CREATE TRIGGER event_allocate_position AFTER INSERT ON event BEGIN
  SELECT RAISE(ABORT, 'event_sequence_missing')
    WHERE NOT EXISTS (SELECT 1 FROM event_sequence WHERE singleton = 1);
  SELECT RAISE(ABORT, 'event_import_closed')
    WHERE (NEW.source_tx IS NULL) <> (NEW.source_id IS NULL)
    OR (NEW.source_tx IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM event_sequence WHERE importing = 1 AND NEW.source_tx < epoch
        AND NEW.source_id <= printf('%010d%010d', high, low)))
    OR (NEW.source_tx IS NULL AND EXISTS (SELECT 1 FROM event_sequence WHERE importing = 1));
  UPDATE event_sequence SET high = high + (low = 9999999999),
    low = (low + 1) % 10000000000
    WHERE singleton = 1 AND NEW.source_tx IS NULL;
  INSERT INTO event_position (local_id, club_id, tx_id, event_id)
    SELECT NEW.id, NEW.club_id, coalesce(NEW.source_tx, epoch),
      coalesce(NEW.source_id, printf('%010d%010d', high, low))
    FROM event_sequence WHERE singleton = 1;
END;
--> statement-breakpoint
CREATE TABLE event_import_guard (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  valid INTEGER NOT NULL CONSTRAINT event_import_requires_empty_history CHECK (valid = 1)
) STRICT;
