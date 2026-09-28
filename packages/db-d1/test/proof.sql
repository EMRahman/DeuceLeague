-- Reduced domain model for the phase-1 concurrency experiment ONLY.
-- This is not the application's D1 schema or a production migration.
CREATE TABLE proof_club (
  id TEXT PRIMARY KEY,
  singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (singleton = 1)
);
--> statement-breakpoint
CREATE TABLE proof_member (id TEXT PRIMARY KEY, active INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE proof_credential (
  token_hash TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES proof_member(id),
  kind TEXT NOT NULL CHECK(kind IN ('login_link', 'session', 'admin')),
  expires_at INTEGER
);
--> statement-breakpoint
CREATE TABLE proof_competition (
  id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1,
  deadline INTEGER
);
--> statement-breakpoint
CREATE TABLE proof_entry (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES proof_competition(id),
  member_id TEXT NOT NULL REFERENCES proof_member(id),
  UNIQUE(competition_id, member_id),
  UNIQUE(id, competition_id)
);
--> statement-breakpoint
CREATE TABLE proof_match (
  id TEXT PRIMARY KEY,
  competition_id TEXT NOT NULL REFERENCES proof_competition(id),
  pairing_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'reported', 'played', 'disputed')),
  score TEXT,
  UNIQUE(competition_id, pairing_key),
  UNIQUE(id, competition_id)
);
--> statement-breakpoint
CREATE TABLE proof_side (
  match_id TEXT NOT NULL,
  competition_id TEXT NOT NULL,
  side INTEGER NOT NULL CHECK(side IN (0, 1)),
  entry_id TEXT NOT NULL,
  PRIMARY KEY(match_id, side),
  UNIQUE(match_id, entry_id),
  FOREIGN KEY(match_id, competition_id) REFERENCES proof_match(id, competition_id),
  FOREIGN KEY(entry_id, competition_id) REFERENCES proof_entry(id, competition_id)
);
--> statement-breakpoint
CREATE TABLE proof_claim (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES proof_match(id),
  side INTEGER NOT NULL CHECK(side IN (0, 1)),
  claim TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'confirmed', 'superseded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX proof_live_claim ON proof_claim(match_id, side) WHERE state <> 'superseded';
--> statement-breakpoint
CREATE TABLE proof_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  subject_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER proof_event_no_update BEFORE UPDATE ON proof_event
BEGIN SELECT RAISE(ABORT, 'event_append_only'); END;
--> statement-breakpoint
CREATE TRIGGER proof_event_no_delete BEFORE DELETE ON proof_event
BEGIN SELECT RAISE(ABORT, 'event_append_only'); END;
--> statement-breakpoint
CREATE TABLE proof_assertion (ok INTEGER NOT NULL CONSTRAINT proof_precondition CHECK(ok = 1));
