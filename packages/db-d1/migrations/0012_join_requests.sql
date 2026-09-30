-- The coach's view of how well a member plays: 10 a beginner, 5 intermediate,
-- 4 a strong club player, 1 a national player. Set by the coach, never computed.
ALTER TABLE member ADD COLUMN level INTEGER CHECK (level BETWEEN 1 AND 10);
--> statement-breakpoint
-- Someone asking to join, from the club's public form, until the coach
-- approves them (they become a member) or declines them (the row is deleted).
-- Personal data from the open internet: kept apart from members, and deleted
-- after thirty days if nobody decides.
CREATE TABLE join_request (
  id TEXT PRIMARY KEY NOT NULL,
  club_id TEXT NOT NULL REFERENCES club(id),
  first_name TEXT NOT NULL,
  surname TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  -- Which privacy notice they read and agreed to when they asked, at created_at.
  privacy_notice TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  CONSTRAINT join_request_contact_ck CHECK (email IS NOT NULL OR phone IS NOT NULL)
) STRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX join_request_email_uq ON join_request (club_id, lower(email)) WHERE email IS NOT NULL;
--> statement-breakpoint
CREATE INDEX join_request_created_ix ON join_request (created_at);
--> statement-breakpoint
-- Adapter state, not league history: how many join requests the website has
-- taken today, for the club as a whole ('club') and for each connection (a
-- keyed hash of its address, never the address). Rows from before today are
-- pruned on use.
CREATE TABLE website_join_limit (
  bucket TEXT PRIMARY KEY NOT NULL CHECK (bucket = 'club' OR length(bucket) = 64),
  day INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 1)
) STRICT;
--> statement-breakpoint
CREATE INDEX website_join_limit_day_ix ON website_join_limit (day);
