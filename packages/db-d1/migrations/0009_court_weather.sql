-- Forecast settings belong to the club, while each named place is a normal
-- coach-managed record. They deliberately contain no booking or match data.
ALTER TABLE club ADD COLUMN weather_units TEXT NOT NULL DEFAULT 'uk'
  CHECK (weather_units IN ('uk', 'metric', 'us'));
--> statement-breakpoint
CREATE TABLE court_location (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  UNIQUE (id, club_id)
) STRICT;
--> statement-breakpoint
CREATE INDEX court_location_club_ix ON court_location (club_id, id);
--> statement-breakpoint
-- The player website can display eight locations. Enforce that product limit
-- here too, so an import or future API cannot create invisible locations.
CREATE TRIGGER court_location_limit BEFORE INSERT ON court_location BEGIN
  SELECT RAISE(ABORT, 'court_location_limit')
    WHERE (SELECT count(*) FROM court_location WHERE club_id = NEW.club_id) >= 8;
END;
