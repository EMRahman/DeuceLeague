-- One database belongs to one club. Every application mutation advances this
-- revision inside the same D1 batch as its domain writes and audit events.
-- A stale decision deliberately violates the named CHECK, rolling back the
-- ENTIRE batch. A zero-row conditional UPDATE alone would not roll it back.
CREATE TABLE mutation_clock (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  revision INTEGER NOT NULL
    CONSTRAINT mutation_revision_current CHECK (revision >= 0)
    CONSTRAINT mutation_revision_safe CHECK (revision <= 9007199254740991)
);
--> statement-breakpoint
INSERT INTO mutation_clock (singleton, revision) VALUES (1, 0);
--> statement-breakpoint

-- The guard relies on this row existing. A missing row would make UPDATE a
-- successful no-op, so deletion must be impossible through application SQL.
CREATE TRIGGER mutation_clock_no_delete
BEFORE DELETE ON mutation_clock
BEGIN
  SELECT RAISE(ABORT, 'mutation_clock_required');
END;
