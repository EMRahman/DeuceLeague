-- Another administrator can expire between read and commit without changing
-- the revision. Recheck on the database clock before revoking an admin key.
CREATE TABLE admin_guard (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  valid INTEGER NOT NULL CONSTRAINT admin_survives CHECK (valid = 1)
) STRICT;
--> statement-breakpoint
INSERT INTO admin_guard (singleton, valid) VALUES (1, 1);
