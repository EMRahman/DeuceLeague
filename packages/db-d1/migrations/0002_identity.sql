-- One installation is one club. UUIDs are application-generated; dates are
-- ISO dates, timestamps are integer UTC milliseconds, JSON is validated text.
CREATE TABLE club (
  id TEXT PRIMARY KEY NOT NULL,
  singleton INTEGER NOT NULL DEFAULT 1 UNIQUE CHECK (singleton = 1),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Europe/London',
  branding TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(branding) AND json_type(branding) = 'object'),
  settings TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(settings) AND json_type(settings) = 'object'),
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER))
) STRICT;
--> statement-breakpoint
CREATE TRIGGER club_no_delete BEFORE DELETE ON club BEGIN
  SELECT RAISE(ABORT, 'club_cannot_be_reinitialized');
END;
--> statement-breakpoint
CREATE TRIGGER club_identity_immutable BEFORE UPDATE OF id, singleton ON club BEGIN
  SELECT RAISE(ABORT, 'club_identity_immutable');
END;
--> statement-breakpoint
CREATE TABLE member (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  display_name TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  date_of_birth TEXT,
  gender TEXT CHECK (gender IN ('female', 'male', 'other', 'undisclosed')),
  notes TEXT,
  rating REAL,
  rating_system TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'left')),
  joined_on TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  updated_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  CONSTRAINT member_id_club_uq UNIQUE (id, club_id)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX member_club_email_uq ON member (club_id, lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;
--> statement-breakpoint
CREATE INDEX member_club_status_ix ON member (club_id, status) WHERE deleted_at IS NULL;
--> statement-breakpoint
CREATE TABLE api_key (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE CHECK (length(key_hash) = 64),
  prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '["league:read","results:write"]'
    CHECK (json_valid(scopes) AND json_type(scopes) = 'array'),
  created_by_member_id TEXT,
  last_used_at INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  CONSTRAINT api_key_creator_fk FOREIGN KEY (created_by_member_id, club_id) REFERENCES member(id, club_id)
) STRICT;
--> statement-breakpoint
CREATE INDEX api_key_club_ix ON api_key (club_id) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE TABLE access_grant (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('login_link', 'session')),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  scopes TEXT NOT NULL CHECK (json_valid(scopes) AND json_type(scopes) = 'array'),
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  CONSTRAINT access_grant_member_fk FOREIGN KEY (member_id, club_id) REFERENCES member(id, club_id) ON DELETE CASCADE,
  CONSTRAINT access_grant_link_expires_ck CHECK (kind <> 'login_link' OR expires_at IS NOT NULL)
) STRICT;
--> statement-breakpoint
CREATE INDEX access_grant_member_ix ON access_grant (member_id);
--> statement-breakpoint
CREATE INDEX access_grant_expiry_ix ON access_grant (expires_at);
--> statement-breakpoint
-- SQLite serializes commits. AUTOINCREMENT is a durable local cursor, unlike
-- PostgreSQL's pre-commit sequence. Legacy PG cursor mapping is a later stage.
CREATE TABLE event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id TEXT NOT NULL REFERENCES club(id),
  occurred_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('member', 'api_key', 'system')),
  actor_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(payload) AND json_type(payload) = 'object')
) STRICT;
--> statement-breakpoint
CREATE INDEX event_club_ix ON event (club_id, id);
--> statement-breakpoint
CREATE INDEX event_club_type_ix ON event (club_id, type, id);
--> statement-breakpoint
CREATE INDEX event_subject_ix ON event (club_id, subject_type, subject_id);
--> statement-breakpoint
CREATE TRIGGER event_no_update BEFORE UPDATE ON event BEGIN
  SELECT RAISE(ABORT, 'event_append_only');
END;
--> statement-breakpoint
CREATE TRIGGER event_no_delete BEFORE DELETE ON event BEGIN
  SELECT RAISE(ABORT, 'event_append_only');
END;
--> statement-breakpoint
-- The guard is upserted onto the singleton. A failed CHECK aborts the entire
-- mutation batch; ON CONFLICT handles uniqueness only, never CHECK failures.
CREATE TABLE credential_guard (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  valid INTEGER NOT NULL CONSTRAINT credential_still_valid CHECK (valid = 1)
) STRICT;
--> statement-breakpoint
INSERT INTO credential_guard (singleton, valid) VALUES (1, 1);
