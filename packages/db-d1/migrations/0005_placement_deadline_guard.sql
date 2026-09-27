-- A source deadline crossing can change rankings without advancing the revision.
-- Abort and recompute when the placement's final/provisional assumption changes.
CREATE TABLE placement_deadline_guard (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  valid INTEGER NOT NULL CONSTRAINT placement_deadline_current CHECK (valid = 1)
) STRICT;
--> statement-breakpoint
INSERT INTO placement_deadline_guard (singleton, valid) VALUES (1, 1);
